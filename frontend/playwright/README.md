Playwright + MetaMask integration
================================

Goal
----
Provide a reproducible way to launch Playwright with an unpacked MetaMask extension and import an Anvil private key so the browser is connected to the local Anvil RPC (http://127.0.0.1:8545).

High-level steps
----------------
1. Run Anvil locally and copy one of the private keys it prints on startup.
2. Download MetaMask (Chromium extension) as an *unpacked* extension and place it at `frontend/playwright/extensions/metamask`.
   - You can use a tool or Chrome to obtain the unpacked extension. The extension folder must contain the `manifest.json` file.
3. Set the following environment variables before running the Playwright test:
   - `METAMASK_EXTENSION_PATH` — path to the unpacked MetaMask extension, e.g. `./playwright/extensions/metamask`
   - `ANVIL_PRIVATE_KEY` — the private key you copied from Anvil (0x...).
4. Run the helper Playwright test which will launch Chromium with the extension loaded, import the private key, switch network RPC to `http://127.0.0.1:8545`, and then open the app and click the `Connect` button.

Notes
-----
- MetaMask UI and selectors evolve. The provided automation is best-effort and may require small selector updates per MetaMask version.
- If you prefer not to automate MetaMask, you can manually import the Anvil private key and set RPC in MetaMask, then run the app normally.

Example (macOS / zsh)
---------------------
```
# start anvil in another terminal and copy a private key
export METAMASK_EXTENSION_PATH=./frontend/playwright/extensions/metamask
export ANVIL_PRIVATE_KEY=0xYOUR_ANVIL_KEY_HERE
cd frontend
npx playwright test playwright/tests/connect-with-metamask.spec.ts --project=chromium --headed
```

If the test fails at extension UI steps, open a headed browser manually with the same args to debug selectors.
