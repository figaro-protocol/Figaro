/**
 * @figaro-protocol/sdk/signer — custody: what holds the key for the daemon.
 *
 * The daemon gates every request, then hands the granted one to its custody,
 * which signs. Two custody modes stand behind the one interface: the
 * decrypted keystore key in the daemon's memory (`keyCustody`), and a Ledger
 * whose key never leaves the device (`ledgerCustody`, ./ledger.ts). The
 * socket, the gate, the journal and the audit log are the same for both.
 */

import type { Address, Hex, TransactionSerializable, TypedDataDefinition } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface SignerCustody {
    /** The operated wallet. */
    address: Address;
    signTypedData(typedData: TypedDataDefinition): Promise<Hex>;
    /** The serialized, signed transaction. */
    signTransaction(tx: TransactionSerializable): Promise<Hex>;
}

/** The keystore custody: the decrypted key, held in this process only. */
export function keyCustody(privateKey: Hex): SignerCustody {
    const account = privateKeyToAccount(privateKey);
    return {
        address: account.address,
        signTypedData: (typedData) => account.signTypedData(typedData as Parameters<typeof account.signTypedData>[0]),
        signTransaction: (tx) => account.signTransaction(tx),
    };
}
