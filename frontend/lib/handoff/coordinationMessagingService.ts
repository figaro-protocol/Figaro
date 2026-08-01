import { getCoordinationChannel } from "@/lib/handoff/channel";
import type { EcdhPubkeyMessage, EcdhWrappedKeyMessage, HandoffChannel } from "@figaro/sdk/handoff";

interface WalletMessageSignerSource {
    signMessage(params: { message: string }): Promise<`0x${string}`>;
}

interface CoordinationMessagingContext {
    address: string;
    walletClient?: WalletMessageSignerSource | null;
}

export interface CoordinationMessagingService {
    getChannel(context: CoordinationMessagingContext): Promise<HandoffChannel>;
    sendHandoffKey(
        params: CoordinationMessagingContext & {
            recipientAddress: string;
            orderId: string;
            keyB64: string;
        },
    ): Promise<void>;
    subscribeHandoffKey(
        params: CoordinationMessagingContext & {
            orderId: string;
            callback: (keyB64: string, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    sendEcdhPubkey(
        params: CoordinationMessagingContext & {
            recipientAddress: string;
            orderId: string;
            pubKeyHex: string;
            senderAddress: string;
            sig: string;
        },
    ): Promise<void>;
    subscribeEcdhPubkey(
        params: CoordinationMessagingContext & {
            orderId: string;
            callback: (msg: EcdhPubkeyMessage, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    sendWrappedKey(
        params: CoordinationMessagingContext & {
            recipientAddress: string;
            orderId: string;
            wrappedKeyB64: string;
            senderAddress: string;
            sig: string;
        },
    ): Promise<void>;
    subscribeWrappedKey(
        params: CoordinationMessagingContext & {
            orderId: string;
            callback: (msg: EcdhWrappedKeyMessage, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    sendCommitmentPayload(
        params: CoordinationMessagingContext & {
            recipientAddress: string;
            orderId: string;
            payload: string;
        },
    ): Promise<void>;
    subscribeCommitmentPayload(
        params: CoordinationMessagingContext & {
            orderId: string;
            callback: (payload: string, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    subscribeAnyCommitmentPayload(
        params: CoordinationMessagingContext & {
            callback: (payload: string, orderId: string) => void;
        },
    ): Promise<() => void>;
}

function resolveWalletMessageSigner(walletClient?: WalletMessageSignerSource | null) {
    if (!walletClient) {
        return undefined;
    }

    return (message: string) => walletClient.signMessage({ message });
}

class DefaultCoordinationMessagingService implements CoordinationMessagingService {
    async getChannel({ address, walletClient }: CoordinationMessagingContext): Promise<HandoffChannel> {
        return getCoordinationChannel(address, resolveWalletMessageSigner(walletClient));
    }

    async sendHandoffKey({ recipientAddress, orderId, keyB64, ...context }: CoordinationMessagingContext & {
        recipientAddress: string;
        orderId: string;
        keyB64: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendHandoffKey({ recipientAddress, orderId, keyB64 });
    }

    async subscribeHandoffKey({ orderId, callback, ...context }: CoordinationMessagingContext & {
        orderId: string;
        callback: (keyB64: string, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onHandoffKey(orderId, callback);
    }

    async sendEcdhPubkey({ recipientAddress, orderId, pubKeyHex, senderAddress, sig, ...context }: CoordinationMessagingContext & {
        recipientAddress: string;
        orderId: string;
        pubKeyHex: string;
        senderAddress: string;
        sig: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendEcdhPubkey({ recipientAddress, orderId, pubKeyHex, senderAddress, sig });
    }

    async subscribeEcdhPubkey({ orderId, callback, ...context }: CoordinationMessagingContext & {
        orderId: string;
        callback: (msg: EcdhPubkeyMessage, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onEcdhPubkey(orderId, callback);
    }

    async sendWrappedKey({ recipientAddress, orderId, wrappedKeyB64, senderAddress, sig, ...context }: CoordinationMessagingContext & {
        recipientAddress: string;
        orderId: string;
        wrappedKeyB64: string;
        senderAddress: string;
        sig: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendWrappedKey({ recipientAddress, orderId, wrappedKeyB64, senderAddress, sig });
    }

    async subscribeWrappedKey({ orderId, callback, ...context }: CoordinationMessagingContext & {
        orderId: string;
        callback: (msg: EcdhWrappedKeyMessage, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onWrappedKey(orderId, callback);
    }

    async sendCommitmentPayload({ recipientAddress, orderId, payload, ...context }: CoordinationMessagingContext & {
        recipientAddress: string;
        orderId: string;
        payload: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendCommitmentPayload({ recipientAddress, orderId, payload });
    }

    async subscribeCommitmentPayload({ orderId, callback, ...context }: CoordinationMessagingContext & {
        orderId: string;
        callback: (payload: string, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onCommitmentPayload(orderId, callback);
    }

    async subscribeAnyCommitmentPayload({ callback, ...context }: CoordinationMessagingContext & {
        callback: (payload: string, orderId: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onAnyCommitmentPayload(callback);
    }

}

export const DEFAULT_COORDINATION_MESSAGING_SERVICE: CoordinationMessagingService =
    new DefaultCoordinationMessagingService();
