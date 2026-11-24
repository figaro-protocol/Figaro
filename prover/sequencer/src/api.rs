/// HTTP API — axum routes for operation submission and status queries.
///
/// This is a PUBLIC, unauthenticated surface. It holds no keys and grants
/// no privilege: it only relays signed submissions into the mempool, where
/// admission runs the same EIP-712 recovery and witness gates the proof
/// enforces. Every failure is a structured
/// `{ "error": … }` JSON body — never a panic, never a bare-text rejection.
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::{
    extract::{rejection::JsonRejection, ConnectInfo, DefaultBodyLimit, State},
    http::{Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tower::limit::GlobalConcurrencyLimitLayer;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use tracing::{info, warn};

use alloy_primitives::{Address, B256};

use crate::mempool::{Mempool, SubmitError};
use crate::state::StateMirror;
use crate::submitter::{self, FundingGate};
use figaro_kernel::types::{KernelOp, UsageClaim};

/// Shared application state for axum handlers.
#[derive(Clone)]
pub struct AppState {
    pub mempool: Mempool,
    pub state_mirror: StateMirror,
    /// Cumulative number of batches resolved by this sequencer.
    pub batch_count: std::sync::Arc<tokio::sync::RwLock<u64>>,
    /// Cumulative failure facts — see `FailureLog`.
    pub failures: FailureLog,
    /// Where a commit's bonds are checked at the door (`None`: no verifier
    /// configured, nothing is read — the prove-only dry run).
    pub funding: Option<FundingGate>,
    /// What this relay proves for, served on `/status`.
    pub identity: RelayIdentity,
}

/// The version of the relay's HTTP interface, served on `/status`. The SDK
/// publishes the format (`sdk/src/agent/relay-wire.schema.json`); a change to
/// a route's shape moves both in one change.
pub const WIRE_FORMAT_VERSION: u32 = 1;

/// What a relay proves for: the chain it reads, the `FigaroBatchVerifier` it
/// lands its batches at, and the fingerprint of the guest it proves with. A wallet
/// compares the three with the verifier it reads on the chain before it
/// sends anything, so a relay for another verifier or another guest is never
/// sent an operation it cannot land. The verifier is the zero address in the
/// prove-only dry run. Beside them, the page origins the operator lets submit
/// from a browser (`BROWSER_SUBMIT_ORIGINS`), so a page learns before any
/// signature whether this relay takes its POST.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RelayIdentity {
    pub chain_id: u64,
    pub batch_verifier: Address,
    pub program_vkey: B256,
    pub browser_submit_origins: Vec<String>,
}

/// The page origins the operator lets submit from a browser, read from
/// `BROWSER_SUBMIT_ORIGINS`: a comma-separated list of exact origins, each
/// `http://` or `https://`, a lowercase host and an optional port, with no
/// path. Unset or blank is the empty list, and no page submits from a
/// browser. A wildcard, an empty entry, a path, another scheme or an
/// uppercase letter is refused, and the relay does not start.
pub fn parse_browser_submit_origins(value: Option<&str>) -> Result<Vec<String>, String> {
    let Some(value) = value else {
        return Ok(vec![]);
    };
    if value.trim().is_empty() {
        return Ok(vec![]);
    }
    value
        .split(',')
        .map(|entry| {
            let origin = entry.trim();
            let refuse = |why: &str| {
                Err(format!(
                    "BROWSER_SUBMIT_ORIGINS entry {origin:?} {why}; list exact origins such as https://app.example or http://localhost:3100, separated by commas"
                ))
            };
            if origin.is_empty() {
                return refuse("is empty");
            }
            if origin.contains('*') {
                return refuse("is a wildcard, and no wildcard is accepted");
            }
            let Some(host) = origin
                .strip_prefix("https://")
                .or_else(|| origin.strip_prefix("http://"))
            else {
                return refuse("is not an http or https origin");
            };
            if host.is_empty() {
                return refuse("names no host");
            }
            if host.contains(['/', '?', '#', '@']) || host.chars().any(char::is_whitespace) {
                return refuse("is not an origin: it carries a path, a query, a user or a space");
            }
            if host.chars().any(|c| c.is_ascii_uppercase()) {
                return refuse("has an uppercase letter, and a browser sends its origin in lowercase");
            }
            if axum::http::HeaderValue::from_str(origin).is_err() {
                return refuse("is not a header value");
            }
            Ok(origin.to_string())
        })
        .collect()
}

/// Cumulative failure facts, surfaced on `/status` so a polling driver SEES a
/// death instead of waiting out a batch that will never come (the
/// gap it closes: ops were dead-lettered and every observer kept polling a surface that
/// could not say so). Counts OPS dead-lettered — dropped without resolving —
/// whatever the path (deterministic resolve revert, prove failure); the last
/// error is kept for the reader, every URL in it taken out. Usage claims dropped without
/// landing are counted apart, with their own last reason: a claim is not an
/// operation, and one figure for both would tell neither reader the truth.
#[derive(Clone, Default)]
pub struct FailureLog {
    inner: std::sync::Arc<tokio::sync::RwLock<FailureLogInner>>,
}

#[derive(Default)]
struct FailureLogInner {
    dead_lettered_ops: u64,
    last_error: Option<String>,
    dropped_usage_claims: u64,
    last_claim_error: Option<String>,
}

impl FailureLog {
    /// Count `ops` operations dropped without resolving, with the reason,
    /// every URL in it taken out ([`without_urls`]). The reason is an error's
    /// Display text: an error recorded with `{:?}` can carry a URL as a
    /// parsed structure, its scheme and host apart with no `://`, which
    /// `without_urls` does not find.
    pub async fn record(&self, ops: u64, error: String) {
        let mut inner = self.inner.write().await;
        inner.dead_lettered_ops += ops;
        inner.last_error = Some(without_urls(&error));
    }

    pub async fn snapshot(&self) -> (u64, Option<String>) {
        let inner = self.inner.read().await;
        (inner.dead_lettered_ops, inner.last_error.clone())
    }

    /// Count `claims` usage claims dropped without landing, with the reason,
    /// every URL in it taken out ([`without_urls`]).
    pub async fn record_claims(&self, claims: u64, error: String) {
        if claims == 0 {
            return;
        }
        let mut inner = self.inner.write().await;
        inner.dropped_usage_claims += claims;
        inner.last_claim_error = Some(without_urls(&error));
    }

    /// The usage claims dropped so far, and the last reason.
    pub async fn claims_snapshot(&self) -> (u64, Option<String>) {
        let inner = self.inner.read().await;
        (inner.dropped_usage_claims, inner.last_claim_error.clone())
    }
}

/// `text` with every URL in it replaced by `<url>`. A failure's text is
/// served to any client on `/status`; an HTTP client's error names the URL
/// it requested, and a keyed RPC URL carries its key. A URL runs from its
/// scheme (`http://`, `https://`, `ws://`, `wss://`) to the first
/// whitespace, quote, or closing bracket; the scheme matches in any case.
pub fn without_urls(text: &str) -> String {
    const SCHEMES: [&str; 4] = ["https://", "http://", "wss://", "ws://"];
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    // Schemes match in any case (`HTTPS://` is a URL too); ASCII lowercasing
    // keeps every byte offset, so a match in the lowered text is one in `rest`.
    while let Some((at, scheme)) = {
        let lowered = rest.to_ascii_lowercase();
        SCHEMES
            .iter()
            .filter_map(|scheme| lowered.find(scheme).map(|at| (at, *scheme)))
            .min_by_key(|(at, _)| *at)
    } {
        out.push_str(&rest[..at]);
        out.push_str("<url>");
        let after = &rest[at + scheme.len()..];
        let end = after
            .find(|c: char| {
                c.is_whitespace() || matches!(c, '"' | '\'' | '`' | ')' | ']' | '}' | '>')
            })
            .unwrap_or(after.len());
        rest = &after[end..];
    }
    out.push_str(rest);
    out
}

/// Log every usage claim dropped at `stage`, each with its reason, so a
/// claim drop counts on `/status` apart from the operations. Returns how
/// many were recorded.
pub async fn record_dropped_claims(
    failures: &FailureLog,
    dropped: &[(UsageClaim, String)],
    stage: &str,
) -> u64 {
    for (claim, reason) in dropped {
        tracing::warn!(clause_or_process = ?claim.clause_or_process, %reason, "Usage claim dropped at {stage}");
        failures
            .record_claims(1, format!("dropped at {stage}: {reason}"))
            .await;
    }
    dropped.len() as u64
}

/// Record every operation dropped at `stage` (batch formation, say), each
/// with its reason, so a drop counts on `/status` whatever its path. Returns
/// how many were recorded.
pub async fn record_dropped(
    failures: &FailureLog,
    dropped: &[(crate::mempool::PendingOp, String)],
    stage: &str,
) -> u64 {
    for (op, reason) in dropped {
        tracing::warn!(id = op.id, %reason, "Dropped at {stage}");
        failures
            .record(1, format!("dropped at {stage}: {reason}"))
            .await;
    }
    dropped.len() as u64
}

/// HTTP-boundary limits.
#[derive(Clone, Copy, Debug)]
pub struct ApiConfig {
    /// Per-request body cap in bytes. An attestation carries fingerprints
    /// and an inclusion proof, a few hundred bytes; the largest body is a
    /// resolve naming every order of its process. 1 MiB is generous headroom
    /// without inviting memory abuse.
    pub max_body_bytes: usize,
    /// A request that has not completed by then is answered `408`.
    pub request_timeout: Duration,
    /// Requests in flight at once, across every route; the rest wait.
    pub max_in_flight: usize,
    /// Submissions (`/submit`, `/submit-usage`) one client address may make
    /// per minute before it is answered `429`; zero disables the limit.
    pub submits_per_minute_per_ip: u32,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            max_body_bytes: 1024 * 1024,
            request_timeout: Duration::from_secs(10),
            max_in_flight: 256,
            submits_per_minute_per_ip: 60,
        }
    }
}

// ── Per-IP submit rate limit ─────────────────────────────────────
//
// A fixed one-minute window per client address over the two submission
// routes. The mempool already refuses an unfunded or malformed submission
// at no cost to the sender; this bounds how fast one address can make it
// say so, and how fast one address can fill the queue caps with
// well-formed, self-signed operations. Behind a proxy the address is the
// proxy's — a deployment that fronts the relay sets the limit there. An IPv6
// client holds a /64, so an IPv6 address counts by its /64. A window past its
// minute is swept, at most once a minute, so the map holds the addresses of
// the last two windows and no more.

const RATE_WINDOW: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct RateLimiter {
    per_minute: u32,
    windows: Arc<Mutex<HashMap<IpAddr, (Instant, u32)>>>,
    swept: Arc<Mutex<Option<Instant>>>,
}

/// The address a window is kept for: an IPv4 address itself, an IPv6
/// address's /64.
fn window_key(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V4(_) => ip,
        IpAddr::V6(v6) => {
            let prefix = u128::from(v6) & !((1u128 << 64) - 1);
            IpAddr::V6(std::net::Ipv6Addr::from(prefix))
        }
    }
}

impl RateLimiter {
    pub fn new(per_minute: u32) -> Self {
        Self {
            per_minute,
            windows: Arc::new(Mutex::new(HashMap::new())),
            swept: Arc::new(Mutex::new(None)),
        }
    }

    /// Whether one more submission from `ip` is within the window.
    pub fn admit(&self, ip: IpAddr) -> bool {
        self.admit_at(ip, Instant::now())
    }

    fn admit_at(&self, ip: IpAddr, now: Instant) -> bool {
        if self.per_minute == 0 {
            return true;
        }
        let mut windows = self.windows.lock().expect("rate limiter lock");
        {
            let mut swept = self.swept.lock().expect("rate limiter lock");
            if swept.is_none_or(|at| now.saturating_duration_since(at) >= RATE_WINDOW) {
                windows.retain(|_, (start, _)| now.saturating_duration_since(*start) < RATE_WINDOW);
                *swept = Some(now);
            }
        }
        let entry = windows.entry(window_key(ip)).or_insert((now, 0));
        if now.saturating_duration_since(entry.0) >= RATE_WINDOW {
            *entry = (now, 0);
        }
        if entry.1 >= self.per_minute {
            return false;
        }
        entry.1 += 1;
        true
    }
}

/// The client address, from the connection; absent (a router driven
/// without connect info) every request shares one bucket.
fn client_ip(req: &axum::extract::Request) -> IpAddr {
    req.extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
}

async fn rate_limit(
    State(limiter): State<RateLimiter>,
    req: axum::extract::Request,
    next: Next,
) -> Response {
    let ip = client_ip(&req);
    if !limiter.admit(ip) {
        warn!(%ip, route = %req.uri().path(), "submission rate limit");
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse {
                error: "submission rate limit for this address; retry after the window".to_string(),
            }),
        )
            .into_response();
    }
    next.run(req).await
}

// ── Request / Response types ─────────────────────────────────────

#[derive(Deserialize)]
pub struct SubmitRequest {
    pub operation: KernelOp,
}

#[derive(Deserialize)]
pub struct SubmitUsageRequest {
    pub claim: UsageClaim,
}

#[derive(Serialize)]
pub struct SubmitResponse {
    pub id: u64,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Serialize)]
pub struct StatusResponse {
    /// The version of this interface ([`WIRE_FORMAT_VERSION`]).
    pub wire_format_version: u32,
    /// The chain this relay reads, as its RPC answers.
    pub chain_id: u64,
    /// The `FigaroBatchVerifier` this relay lands its batches at, lowercase hex.
    pub batch_verifier: String,
    /// The fingerprint of the guest this relay proves with: a proof verifies
    /// only where the verifier holds the same value as its `programVKey`.
    pub program_vkey: String,
    /// The page origins this relay lets submit from a browser; empty, none.
    pub browser_submit_origins: Vec<String>,
    pub state_root: String,
    pub pending_ops: usize,
    pub pending_usage_claims: usize,
    pub batches_settled: u64,
    /// Cumulative ops dropped without resolving — a growing figure DURING a
    /// wait means the wait is over, whatever `batches_settled` says.
    pub dead_lettered_ops: u64,
    /// The most recent dead-letter reason, its URLs taken out; null while clean.
    pub last_settle_error: Option<String>,
    /// Operations waiting in the isolation of a batch the chain refused
    /// naming nobody (`Mempool::isolate`), counted in `pending_ops` too:
    /// above zero, the relay is trying halves of a refused batch, and the
    /// queue waits behind them.
    pub isolating_ops: usize,
    /// Cumulative usage claims dropped without landing — counted apart from
    /// the operations: a claim credits a designer, it resolves nothing.
    pub dropped_usage_claims: u64,
    /// The most recent claim drop's reason, its URLs taken out; null while clean.
    pub last_dropped_claim_error: Option<String>,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub pending_ops: usize,
    pub pending_usage_claims: usize,
    pub batches_settled: u64,
}

// ── Router ───────────────────────────────────────────────────────

pub fn router(state: AppState, config: ApiConfig) -> Router {
    // One in-flight count across every route: each route's layer shares the
    // one semaphore.
    let in_flight = GlobalConcurrencyLimitLayer::new(config.max_in_flight);
    // The submission routes carry no cross-origin header. A JSON submission
    // from a page needs a preflight, which they never answer; a `text/plain`
    // POST is a CORS simple request, sent with no preflight, and the JSON
    // extractor answers it `415`. So no page can have its visitors'
    // browsers submit for it, each from an address of its own past the
    // per-address limit.
    let submissions = Router::new()
        .route("/submit", post(submit_op))
        .route("/submit-usage", post(submit_usage))
        .route_layer(middleware::from_fn_with_state(
            RateLimiter::new(config.submits_per_minute_per_ip),
            rate_limit,
        ))
        .layer(DefaultBodyLimit::max(config.max_body_bytes))
        // Outermost last: the in-flight cap admits, the timeout bounds.
        .layer(TimeoutLayer::new(config.request_timeout))
        .layer(in_flight.clone());
    // The origins the operator listed (`BROWSER_SUBMIT_ORIGINS`) are answered
    // the preflight and the cross-origin header, each for itself alone, and
    // the answer varies by origin. Each listed page's visitors then submit
    // from addresses of their own, each under the per-address limit: the
    // operator accepts that exposure by listing the page. With none listed,
    // the routes carry no cross-origin header, as described above.
    let submissions = if state.identity.browser_submit_origins.is_empty() {
        submissions
    } else {
        let origins = state
            .identity
            .browser_submit_origins
            .iter()
            .map(|o| {
                o.parse()
                    .expect("an origin parse_browser_submit_origins admitted is a header value")
            })
            .collect::<Vec<axum::http::HeaderValue>>();
        submissions.layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(origins))
                .allow_methods([Method::POST, Method::OPTIONS])
                .allow_headers([axum::http::header::CONTENT_TYPE]),
        )
    };
    // The read routes answer a page on any origin: GET and its preflight.
    // The read routes change nothing, and serve what the relay already serves to any client
    // on `LISTEN_ADDR`. The cross-origin header is outermost, so an answer
    // the timeout gives (`408`) reaches the page too.
    let reads = Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
        .layer(TimeoutLayer::new(config.request_timeout))
        .layer(in_flight)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([Method::GET, Method::OPTIONS]),
        );
    Router::new()
        .merge(submissions)
        .merge(reads)
        .with_state(state)
}

// ── Handlers ─────────────────────────────────────────────────────

/// Map a body/JSON extraction failure to a structured error with the
/// rejection's own status: 400 malformed JSON, 422 valid JSON that is not a
/// `KernelOp`, 413 oversize, 415 wrong content type.
fn payload_error(route: &'static str, rej: JsonRejection) -> Response {
    let status = rej.status();
    let error = rej.body_text();
    // serde's reason quotes the value it could not read, and a body is the
    // sender's to choose: a client may post its content here though no
    // operation takes any. The log carries the status alone, the reason goes
    // to the sender.
    warn!(route, %status, "payload rejected");
    (status, Json(ErrorResponse { error })).into_response()
}

fn submit_error(route: &'static str, kind: &'static str, e: SubmitError) -> Response {
    let status = match e {
        SubmitError::Full => StatusCode::SERVICE_UNAVAILABLE,
        SubmitError::Invalid(_) => StatusCode::BAD_REQUEST,
    };
    let error = e.to_string();
    // No operation carries a party's content, so a refusal's reason names
    // fingerprints and addresses alone.
    warn!(route, kind, %status, %error, "submission rejected");
    (status, Json(ErrorResponse { error })).into_response()
}

/// A submission the relay could not verify because the chain could not be
/// asked: `503`, to retry, its reason with every URL taken out.
fn unverifiable(error: String) -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(ErrorResponse { error }),
    )
        .into_response()
}

fn op_kind(op: &KernelOp) -> &'static str {
    match op {
        KernelOp::Commit { .. } => "Commit",
        KernelOp::Resolve { .. } => "Resolve",
        KernelOp::ResolveByWalletCode { .. } => "ResolveByWalletCode",
        KernelOp::AttestAsSeller { .. } => "AttestAsSeller",
        KernelOp::AttestAsBuyer { .. } => "AttestAsBuyer",
        KernelOp::AttestByWalletCode { .. } => "AttestByWalletCode",
    }
}

async fn submit_op(
    State(state): State<AppState>,
    payload: Result<Json<SubmitRequest>, JsonRejection>,
) -> Response {
    let Json(req) = match payload {
        Ok(p) => p,
        Err(rej) => return payload_error("/submit", rej),
    };
    let kind = op_kind(&req.operation);
    // The stateless checks first, so a refusal names the operation's own
    // fault; then an operation on a process or an order this relay can
    // verify nowhere — neither landed nor queued — is refused, never queued
    // to wait out the deferral window (`Mempool::refuse_unknown`).
    if let Err(invalid) = state.mempool.pre_check(&req.operation) {
        return submit_error("/submit", kind, SubmitError::Invalid(invalid));
    }
    if let Err(unknown) = state
        .mempool
        .refuse_unknown(&req.operation, &state.state_mirror)
        .await
    {
        return submit_error("/submit", kind, SubmitError::Invalid(unknown));
    }
    // A commit's bonds are checked at the door: an unfunded commit would
    // be dropped at batch formation anyway, so refusing it here costs the
    // sender nothing and keeps the queue for operations that can land. Bonds
    // the chain could not be asked about are unverified, and an unverified
    // commit is refused too, with a retry: the queue holds only what this
    // relay could check.
    if let (Some(gate), KernelOp::Commit { commitment, .. }) = (&state.funding, &req.operation) {
        match submitter::check_commit_funding(gate, commitment).await {
            Ok(Ok(())) => {}
            Ok(Err(unfunded)) => {
                warn!(route = "/submit", kind, %unfunded, "unfunded commitment refused");
                return (
                    StatusCode::PAYMENT_REQUIRED,
                    Json(ErrorResponse {
                        error: format!("unfunded commitment: {unfunded}"),
                    }),
                )
                    .into_response();
            }
            Err(read) => {
                let read = without_urls(&read);
                warn!(route = "/submit", kind, %read, "funding unverifiable at the door; refused");
                return unverifiable(format!(
                    "the commitment's bonds could not be read; retry: {read}"
                ));
            }
        }
    }
    // A wallet-code resolve or attestation is asked of its party's code at
    // the door (the buyer's for a resolve, the role's party's for an
    // attestation), as the verifier will ask it at resolution: bytes the code
    // refuses would revert a whole batch, a resolve's and an attestation's
    // alike. Code that could not be asked
    // is unverified, and the operation is refused, with a retry.
    if let (
        Some(gate),
        KernelOp::ResolveByWalletCode { .. } | KernelOp::AttestByWalletCode { .. },
    ) = (&state.funding, &req.operation)
    {
        match submitter::check_wallet_code(gate, &req.operation).await {
            Ok(Ok(())) => {}
            Ok(Err(refused)) => {
                warn!(route = "/submit", kind, %refused, "wallet-code operation refused");
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("wallet-code operation refused: {refused}"),
                    }),
                )
                    .into_response();
            }
            Err(read) => {
                let read = without_urls(&read);
                warn!(route = "/submit", kind, %read, "the party's code could not be asked at the door; refused");
                return unverifiable(format!(
                    "the party's code could not be asked; retry: {read}"
                ));
            }
        }
    }
    match state.mempool.submit(req.operation).await {
        Ok(admission) => {
            info!(
                route = "/submit",
                kind,
                id = admission.id,
                duplicate = admission.duplicate,
                "operation admitted"
            );
            (StatusCode::OK, Json(SubmitResponse { id: admission.id })).into_response()
        }
        Err(e) => submit_error("/submit", kind, e),
    }
}

/// Submit an RPGF usage claim for an order the batch path has resolved.
/// Separate from `/submit` because a claim is not a FigaroCore operation — it
/// changes no FigaroCore state and is applied against the batch's post-state.
async fn submit_usage(
    State(state): State<AppState>,
    payload: Result<Json<SubmitUsageRequest>, JsonRejection>,
) -> Response {
    let Json(req) = match payload {
        Ok(p) => p,
        Err(rej) => return payload_error("/submit-usage", rej),
    };
    match state.mempool.submit_usage_claim(req.claim).await {
        Ok(pending) => {
            info!(route = "/submit-usage", pending, "usage claim admitted");
            (
                StatusCode::OK,
                Json(serde_json::json!({ "pending": pending })),
            )
                .into_response()
        }
        Err(e) => submit_error("/submit-usage", "UsageClaim", e),
    }
}

/// Liveness + bounded queue counts. Deliberately the ONLY info surface
/// besides `/status`: resolved state is read from the chain, not from a
/// relay.
async fn health(State(state): State<AppState>) -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok",
        pending_ops: state.mempool.len().await,
        pending_usage_claims: state.mempool.usage_len().await,
        batches_settled: *state.batch_count.read().await,
    })
}

async fn status(State(state): State<AppState>) -> impl IntoResponse {
    let root = state.state_mirror.state_root().await;
    let pending = state.mempool.len().await;
    let isolating_ops = state.mempool.isolating_len().await;
    let pending_usage = state.mempool.usage_len().await;
    let batches = *state.batch_count.read().await;
    let (dead_lettered_ops, last_settle_error) = state.failures.snapshot().await;
    let (dropped_usage_claims, last_dropped_claim_error) = state.failures.claims_snapshot().await;

    Json(StatusResponse {
        wire_format_version: WIRE_FORMAT_VERSION,
        chain_id: state.identity.chain_id,
        batch_verifier: format!("{:#x}", state.identity.batch_verifier),
        program_vkey: format!("{:?}", state.identity.program_vkey),
        browser_submit_origins: state.identity.browser_submit_origins.clone(),
        state_root: format!("{root:?}"),
        pending_ops: pending,
        pending_usage_claims: pending_usage,
        batches_settled: batches,
        dead_lettered_ops,
        last_settle_error,
        isolating_ops,
        dropped_usage_claims,
        last_dropped_claim_error,
    })
}

#[cfg(test)]
mod failure_tests {
    use super::*;

    /// The failure surface a polling driver reads: ops accumulate across
    /// dead-letter events and the latest reason replaces the previous one.
    #[tokio::test]
    async fn failure_log_accumulates_and_keeps_last_reason() {
        let log = FailureLog::default();
        assert_eq!(log.snapshot().await, (0, None));
        log.record(2, "execution reverted: 0x7fcdd1f4".into()).await;
        log.record(1, "prove failed: divergence".into()).await;
        let (ops, last) = log.snapshot().await;
        assert_eq!(ops, 3);
        assert_eq!(last.as_deref(), Some("prove failed: divergence"));
    }

    /// The wire shape: both failure fields serialize, null while clean —
    /// an old consumer ignores them, a driver keys its abort on them.
    #[test]
    fn status_response_carries_failure_fields() {
        let clean = serde_json::to_value(StatusResponse {
            wire_format_version: WIRE_FORMAT_VERSION,
            chain_id: 31337,
            batch_verifier: format!("{:#x}", Address::ZERO),
            program_vkey: format!("{:?}", B256::ZERO),
            browser_submit_origins: vec![],
            state_root: "0x00".into(),
            pending_ops: 0,
            pending_usage_claims: 0,
            batches_settled: 0,
            dead_lettered_ops: 0,
            last_settle_error: None,
            isolating_ops: 0,
            dropped_usage_claims: 0,
            last_dropped_claim_error: None,
        })
        .unwrap();
        assert_eq!(clean["dead_lettered_ops"], 0);
        assert!(clean["last_settle_error"].is_null());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The window: `per_minute` admissions, the next refused, a fresh
    /// window after sixty seconds; addresses are independent; zero
    /// disables.
    #[test]
    fn rate_limiter_window() {
        let limiter = RateLimiter::new(2);
        let a = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));
        let b = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 2));
        let t0 = Instant::now();
        assert!(limiter.admit_at(a, t0));
        assert!(limiter.admit_at(a, t0));
        assert!(
            !limiter.admit_at(a, t0),
            "the third in the window is refused"
        );
        assert!(
            limiter.admit_at(b, t0),
            "another address has its own window"
        );
        assert!(
            limiter.admit_at(a, t0 + Duration::from_secs(60)),
            "a new window"
        );
        assert!(RateLimiter::new(0).admit_at(a, t0), "zero disables");
    }

    /// The map of windows holds only the addresses seen within the last
    /// window or two: a window past its minute is swept, so addresses that
    /// came once never accumulate.
    #[test]
    fn rate_limiter_sweeps_windows_past_their_minute() {
        let limiter = RateLimiter::new(5);
        let t0 = Instant::now();
        for n in 0..1_000u32 {
            let ip = IpAddr::V4(Ipv4Addr::from(0x0a00_0000 + n));
            assert!(limiter.admit_at(ip, t0));
        }
        assert_eq!(limiter.windows.lock().unwrap().len(), 1_000);
        let late = IpAddr::V4(Ipv4Addr::new(192, 168, 0, 1));
        assert!(limiter.admit_at(late, t0 + Duration::from_secs(121)));
        assert_eq!(
            limiter.windows.lock().unwrap().len(),
            1,
            "every window past its minute is swept"
        );
    }

    /// An IPv6 client holds a /64, so the addresses of one /64 share one
    /// window: rotating through them neither escapes the limit nor grows the
    /// map.
    #[test]
    fn rate_limiter_counts_an_ipv6_slash_64_as_one_address() {
        let limiter = RateLimiter::new(2);
        let t0 = Instant::now();
        let host = |h: u16| IpAddr::V6(std::net::Ipv6Addr::new(0x2001, 0xdb8, 0, 1, 0, 0, 0, h));
        assert!(limiter.admit_at(host(1), t0));
        assert!(limiter.admit_at(host(2), t0));
        assert!(
            !limiter.admit_at(host(3), t0),
            "the third from one /64 is refused"
        );
        assert_eq!(limiter.windows.lock().unwrap().len(), 1);
        let other = IpAddr::V6(std::net::Ipv6Addr::new(0x2001, 0xdb8, 0, 2, 0, 0, 0, 1));
        assert!(
            limiter.admit_at(other, t0),
            "another /64 has its own window"
        );
    }
}

#[cfg(test)]
mod funding_door_tests {
    //! The door's funding check on `/submit`, against the JSON-RPC stand-in
    //! (`crate::rpc_double`): the bonds a commitment pulls are read from the
    //! chain before the relay queues it.

    use super::*;
    use crate::rpc_double::{call_of, hex_value, serve, unserved, Answer, RpcDouble};
    use alloy_primitives::{keccak256, U256};
    use axum::body::Body;
    use axum::http::Request;
    use figaro_kernel::types::Commitment;
    use figaro_prove_test::{build_canonical_batch_input, CHAIN_ID, CORE};
    use tower::util::ServiceExt;

    /// The spender the bonds are approved to in these tests.
    const VERIFIER: Address = Address::repeat_byte(0x0b);

    /// The canonical batch's commit, well formed and signed by both parties.
    fn signed_commit() -> (KernelOp, Commitment) {
        let op = build_canonical_batch_input().operations[0].clone();
        let KernelOp::Commit { commitment, .. } = &op else {
            panic!("the canonical batch opens on its commit");
        };
        let commitment = commitment.clone();
        (op, commitment)
    }

    fn selector(signature: &str) -> [u8; 4] {
        keccak256(signature.as_bytes())[..4].try_into().unwrap()
    }

    /// A stand-in chain node: each `eth_call` to `balanceOf(who)` or
    /// `allowance(who, VERIFIER)` is answered by `funds(selector, who)`.
    async fn node<F>(funds: F) -> RpcDouble
    where
        F: Fn([u8; 4], Address) -> Answer + Send + Sync + 'static,
    {
        serve(move |method, params| match method {
            "eth_call" => {
                let (_, input) = call_of(params);
                let sel: [u8; 4] = input[..4].try_into().unwrap();
                let who = Address::from_slice(&input[16..36]);
                if sel == selector("allowance(address,address)") {
                    assert_eq!(
                        Address::from_slice(&input[48..68]),
                        VERIFIER,
                        "the allowance read names the verifier as spender"
                    );
                }
                funds(sel, who)
            }
            other => unserved(other),
        })
        .await
    }

    fn word(amount: U256) -> Answer {
        Ok(hex_value(&amount.to_be_bytes::<32>()))
    }

    /// A relay whose door reads the bonds from `rpc_url`.
    fn relay(rpc_url: String) -> AppState {
        AppState {
            mempool: Mempool::new(CHAIN_ID, CORE),
            state_mirror: StateMirror::genesis(),
            batch_count: Arc::new(tokio::sync::RwLock::new(0)),
            failures: FailureLog::default(),
            funding: Some(FundingGate {
                rpc_url,
                verifier: VERIFIER,
                chain_id: CHAIN_ID,
            }),
            identity: RelayIdentity {
                chain_id: CHAIN_ID,
                batch_verifier: VERIFIER,
                program_vkey: B256::repeat_byte(0x5a),
                browser_submit_origins: Vec::new(),
            },
        }
    }

    async fn submit(state: &AppState, op: &KernelOp) -> (StatusCode, serde_json::Value) {
        let app = router(state.clone(), ApiConfig::default());
        let req = Request::builder()
            .method("POST")
            .uri("/submit")
            .header("content-type", "application/json")
            .body(Body::from(
                serde_json::to_vec(&serde_json::json!({ "operation": op })).unwrap(),
            ))
            .unwrap();
        let res = app.oneshot(req).await.unwrap();
        let status = res.status();
        let body = axum::body::to_bytes(res.into_body(), 1 << 20)
            .await
            .unwrap();
        (status, serde_json::from_slice(&body).unwrap())
    }

    /// The door queues a commitment only after the chain says both parties
    /// hold and allow their bonds. So a relay whose chain node is down, or
    /// answers every read with an error, turns away every commitment at the
    /// door: each user is answered `503` with a retry, and nothing is
    /// queued. A node that answers a balance or an allowance below the bond
    /// gets the commitment refused `402`, naming the party and the figures.
    /// A node that answers both bonds as covered gets the commitment queued.
    #[tokio::test]
    async fn the_door_refuses_a_commitment_whose_bonds_the_chain_cannot_read_or_does_not_cover() {
        let (op, c) = signed_commit();
        let (buyer_need, seller_need) = submitter::bonds_of(&c);
        let (buyer, seller) = (c.buyer, c.seller);

        // The node answers every read with an error.
        let down = node(|_, _| Err((-32000, "header not found".to_string()))).await;
        let state = relay(down.url.clone());
        let (status, json) = submit(&state, &op).await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{json}");
        let error = json["error"].as_str().unwrap();
        assert!(
            error.starts_with(&format!(
                "the commitment's bonds could not be read; retry: balanceOf({buyer}) read failed: "
            )),
            "{error}"
        );
        assert!(error.contains("header not found"), "{error}");
        assert!(
            !down.calls_to("eth_call").is_empty(),
            "the door asked the chain"
        );
        assert_eq!(state.mempool.len().await, 0, "nothing is queued");

        // The buyer's balance is one below its bond.
        let short_balance = node(move |sel, who| {
            if who == buyer && sel == selector("balanceOf(address)") {
                word(buyer_need - U256::from(1u64))
            } else {
                word(U256::MAX)
            }
        })
        .await;
        let state = relay(short_balance.url.clone());
        let (status, json) = submit(&state, &op).await;
        assert_eq!(status, StatusCode::PAYMENT_REQUIRED, "{json}");
        assert_eq!(
            json["error"],
            format!(
                "unfunded commitment: buyer {buyer} holds {} and allows {} to the verifier; the bond needs {buyer_need}",
                buyer_need - U256::from(1u64),
                U256::MAX
            )
        );
        assert_eq!(state.mempool.len().await, 0, "nothing is queued");

        // The seller's allowance to the verifier is one below its bond.
        let short_allowance = node(move |sel, who| {
            if who == seller && sel == selector("allowance(address,address)") {
                word(seller_need - U256::from(1u64))
            } else {
                word(U256::MAX)
            }
        })
        .await;
        let state = relay(short_allowance.url.clone());
        let (status, json) = submit(&state, &op).await;
        assert_eq!(status, StatusCode::PAYMENT_REQUIRED, "{json}");
        assert_eq!(
            json["error"],
            format!(
                "unfunded commitment: seller {seller} holds {} and allows {} to the verifier; the bond needs {seller_need}",
                U256::MAX,
                seller_need - U256::from(1u64)
            )
        );
        assert_eq!(state.mempool.len().await, 0, "nothing is queued");

        // Both bonds covered exactly: the commitment is queued.
        let covered = node(move |_, who| {
            word(if who == buyer {
                buyer_need
            } else {
                seller_need
            })
        })
        .await;
        let state = relay(covered.url.clone());
        let (status, json) = submit(&state, &op).await;
        assert_eq!(status, StatusCode::OK, "{json}");
        assert_eq!(
            state.mempool.len().await,
            1,
            "the funded commitment is queued"
        );
    }
}
