//! A JSON-RPC double for the relay's chain-facing unit tests: a local HTTP
//! endpoint that answers each request with what the test's `answer` returns
//! for its method and params, and keeps every request it served. The
//! relay's code under test builds its own alloy provider on the double's URL,
//! so what is tested is the relay's real request, decision and error text;
//! no chain is started.

use std::sync::{Arc, Mutex};

use alloy::primitives::{hex, Address};
use serde_json::Value;

/// A method's answer: the JSON-RPC `result`, or an error's code and message.
pub type Answer = Result<Value, (i64, String)>;

/// The served double: its URL and the (method, params) of every request it answered, in order.
pub struct RpcDouble {
    pub url: String,
    pub calls: Arc<Mutex<Vec<(String, Value)>>>,
}

impl RpcDouble {
    /// The params of every request for `method`, in order.
    pub fn calls_to(&self, method: &str) -> Vec<Value> {
        self.calls
            .lock()
            .unwrap()
            .iter()
            .filter(|(m, _)| m == method)
            .map(|(_, p)| p.clone())
            .collect()
    }
}

/// Serve `answer` on a fresh local port. Single and batched requests are both
/// answered.
pub async fn serve<F>(answer: F) -> RpcDouble
where
    F: Fn(&str, &Value) -> Answer + Send + Sync + 'static,
{
    use axum::{routing::post, Json, Router};

    let answer = Arc::new(answer);
    let calls: Arc<Mutex<Vec<(String, Value)>>> = Arc::default();
    let recorded = calls.clone();
    let app = Router::new().route(
        "/",
        post(move |Json(req): Json<Value>| {
            let answer = answer.clone();
            let recorded = recorded.clone();
            async move {
                let one = |req: &Value| -> Value {
                    let method = req["method"].as_str().unwrap_or("").to_string();
                    let params = req["params"].clone();
                    recorded.lock().unwrap().push((method.clone(), params.clone()));
                    match answer(&method, &params) {
                        Ok(result) => serde_json::json!({"jsonrpc": "2.0", "id": req["id"], "result": result}),
                        Err((code, message)) => serde_json::json!({
                            "jsonrpc": "2.0", "id": req["id"], "error": {"code": code, "message": message}
                        }),
                    }
                };
                Json(match &req {
                    Value::Array(batch) => Value::Array(batch.iter().map(one).collect()),
                    single => one(single),
                })
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    RpcDouble { url: format!("http://{addr}"), calls }
}

/// Bytes as a JSON-RPC hex string.
pub fn hex_value(bytes: &[u8]) -> Value {
    Value::String(format!("0x{}", hex::encode(bytes)))
}

/// An `eth_call`'s target and input.
pub fn call_of(params: &Value) -> (Address, Vec<u8>) {
    let tx = &params[0];
    let to: Address = tx["to"].as_str().expect("an eth_call names its target").parse().unwrap();
    let input = tx["input"].as_str().or(tx["data"].as_str()).expect("an eth_call carries input");
    (to, hex::decode(input).unwrap())
}

/// The answer to a method the test does not serve.
pub fn unserved(method: &str) -> Answer {
    Err((-32601, format!("the double does not serve {method}")))
}

/// The answer a node gives for an evaluated revert.
pub fn reverted() -> Answer {
    Err((3, "execution reverted".to_string()))
}
