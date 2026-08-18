/**
 * Shared by the public-rehearsal specs (`live-order.sepolia.spec.ts` — the
 * smoke; `swap-funded-order.sepolia.spec.ts` — the on-ramp): the two smoke
 * wallets and the persistent browser profile they drive. On Sepolia the keys
 * come from the maintainer's env (funded testnet-only keys); on the devnet
 * they are generated ONCE and persisted, so re-runs meet the same seller a
 * returning member would — and the on-ramp spec meets the seller the smoke
 * registered.
 */
import fs from 'fs';
import path from 'path';
import type { Hex } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { E2E_CHAIN } from './devnet-helpers';

const PROFILES_DIR = path.resolve(__dirname, '../../.smoke-profiles');
const DEVNET_KEYS_PATH = path.join(PROFILES_DIR, 'live-order-devnet-keys.json');
/** One whole unit of the settlement token — the smoke's catalogue price. */
export const ITEM_PRICE = '1';

export function smokeKeys(): { seller: Hex; buyer: Hex } {
    if (E2E_CHAIN === 'sepolia') {
        const seller = process.env.SMOKE_SELLER_KEY as Hex | undefined;
        const buyer = process.env.SMOKE_BUYER_KEY as Hex | undefined;
        if (!seller || !buyer) throw new Error('E2E_CHAIN=sepolia needs SMOKE_SELLER_KEY and SMOKE_BUYER_KEY (funded testnet-only keys)');
        return { seller, buyer };
    }
    if (fs.existsSync(DEVNET_KEYS_PATH)) return JSON.parse(fs.readFileSync(DEVNET_KEYS_PATH, 'utf8'));
    const keys = { seller: generatePrivateKey(), buyer: generatePrivateKey() };
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(DEVNET_KEYS_PATH, `${JSON.stringify(keys, null, 4)}\n`);
    return keys;
}

/** The persistent Chromium profile for a smoke seller — ONE XMTP installation
 *  per browser+origin, reused across runs (the inbox cap). */
export function smokeProfileDir(sellerAddress: Hex): string {
    return path.join(PROFILES_DIR, `live-order-${E2E_CHAIN}-${sellerAddress.slice(2, 10).toLowerCase()}`);
}
