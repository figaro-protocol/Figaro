# Figaro beta Anvil container.
#
# Runs anvil with state persistence. Mount the persistent volume at
# /data; anvil reads/writes state.json there. Exposes port 8545.
#
# Built and pushed via:
#   docker build -t figaro-anvil:latest .
#   wrangler containers push figaro-anvil:latest
#
# Pulled by the rpc-proxy Worker via the [[containers]] declaration
# in ../workers/rpc-proxy/wrangler.toml.

FROM ghcr.io/foundry-rs/foundry:latest

# Foundry's image already has anvil at /usr/local/bin/anvil.
# We just need a state directory and an entrypoint that wires up
# state persistence flags consistently across restarts.

USER root
RUN mkdir -p /data && chmod 777 /data
USER foundry

# Volume for persistent state. Cloudflare Containers binds a
# Durable Object volume here per ../workers/rpc-proxy/wrangler.toml.
VOLUME ["/data"]

# Anvil RPC port.
EXPOSE 8545

COPY --chown=foundry:foundry entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
