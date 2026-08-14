import { getHandoffChannel } from "@/lib/handoff/channel";
import type { EcdhPubkeyMessage, EcdhWrappedKeyMessage, HandoffChannel } from "@figaro/sdk/handoff";

/** The one wallet-signer shape the handoff surfaces need — exported so
 *  consumers stop re-declaring it locally (three copies before the
 *  2026-08-14 seam consolidation). */
export interface WalletMessageSigner {
    signMessage(params: { message: string }): Promise<`0x${string}`>;
}

interface HandoffMessagingContext {
    address: string;
    walletClient?: WalletMessageSigner | null;
}

export interface HandoffMessagingService {
    getChannel(context: HandoffMessagingContext): Promise<HandoffChannel>;
    sendHandoffKey(
        params: HandoffMessagingContext & {
            recipientAddress: string;
            orderId: string;
            keyB64: string;
        },
    ): Promise<void>;
    subscribeHandoffKey(
        params: HandoffMessagingContext & {
            orderId: string;
            callback: (keyB64: string, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    sendEcdhPubkey(
        params: HandoffMessagingContext & {
            recipientAddress: string;
            orderId: string;
            pubKeyHex: string;
            senderAddress: string;
            sig: string;
        },
    ): Promise<void>;
    subscribeEcdhPubkey(
        params: HandoffMessagingContext & {
            orderId: string;
            callback: (msg: EcdhPubkeyMessage, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    sendWrappedKey(
        params: HandoffMessagingContext & {
            recipientAddress: string;
            orderId: string;
            wrappedKeyB64: string;
            senderAddress: string;
            sig: string;
        },
    ): Promise<void>;
    subscribeWrappedKey(
        params: HandoffMessagingContext & {
            orderId: string;
            callback: (msg: EcdhWrappedKeyMessage, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    sendCommitmentPayload(
        params: HandoffMessagingContext & {
            recipientAddress: string;
            orderId: string;
            payload: string;
        },
    ): Promise<void>;
    subscribeCommitmentPayload(
        params: HandoffMessagingContext & {
            orderId: string;
            callback: (payload: string, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    subscribeAnyCommitmentPayload(
        params: HandoffMessagingContext & {
            callback: (payload: string, orderId: string) => void;
        },
    ): Promise<() => void>;
}

function resolveWalletMessageSigner(walletClient?: WalletMessageSigner | null) {
    if (!walletClient) {
        return undefined;
    }

    return (message: string) => walletClient.signMessage({ message });
}

class DefaultHandoffMessagingService implements HandoffMessagingService {
    async getChannel({ address, walletClient }: HandoffMessagingContext): Promise<HandoffChannel> {
        return getHandoffChannel(address, resolveWalletMessageSigner(walletClient));
    }

    async sendHandoffKey({ recipientAddress, orderId, keyB64, ...context }: HandoffMessagingContext & {
        recipientAddress: string;
        orderId: string;
        keyB64: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendHandoffKey({ recipientAddress, orderId, keyB64 });
    }

    async subscribeHandoffKey({ orderId, callback, ...context }: HandoffMessagingContext & {
        orderId: string;
        callback: (keyB64: string, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onHandoffKey(orderId, callback);
    }

    async sendEcdhPubkey({ recipientAddress, orderId, pubKeyHex, senderAddress, sig, ...context }: HandoffMessagingContext & {
        recipientAddress: string;
        orderId: string;
        pubKeyHex: string;
        senderAddress: string;
        sig: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendEcdhPubkey({ recipientAddress, orderId, pubKeyHex, senderAddress, sig });
    }

    async subscribeEcdhPubkey({ orderId, callback, ...context }: HandoffMessagingContext & {
        orderId: string;
        callback: (msg: EcdhPubkeyMessage, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onEcdhPubkey(orderId, callback);
    }

    async sendWrappedKey({ recipientAddress, orderId, wrappedKeyB64, senderAddress, sig, ...context }: HandoffMessagingContext & {
        recipientAddress: string;
        orderId: string;
        wrappedKeyB64: string;
        senderAddress: string;
        sig: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendWrappedKey({ recipientAddress, orderId, wrappedKeyB64, senderAddress, sig });
    }

    async subscribeWrappedKey({ orderId, callback, ...context }: HandoffMessagingContext & {
        orderId: string;
        callback: (msg: EcdhWrappedKeyMessage, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onWrappedKey(orderId, callback);
    }

    async sendCommitmentPayload({ recipientAddress, orderId, payload, ...context }: HandoffMessagingContext & {
        recipientAddress: string;
        orderId: string;
        payload: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendCommitmentPayload({ recipientAddress, orderId, payload });
    }

    async subscribeCommitmentPayload({ orderId, callback, ...context }: HandoffMessagingContext & {
        orderId: string;
        callback: (payload: string, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onCommitmentPayload(orderId, callback);
    }

    async subscribeAnyCommitmentPayload({ callback, ...context }: HandoffMessagingContext & {
        callback: (payload: string, orderId: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onAnyCommitmentPayload(callback);
    }

}

export const DEFAULT_HANDOFF_MESSAGING_SERVICE: HandoffMessagingService =
    new DefaultHandoffMessagingService();
