import {
    getCoordinationChannel,
    type CoordinationChannel,
} from "@/lib/handoff/channel";

interface WalletMessageSignerSource {
    signMessage(params: { message: string }): Promise<`0x${string}`>;
}

interface CoordinationMessagingContext {
    address: string;
    walletClient?: WalletMessageSignerSource | null;
}

export interface CoordinationMessagingService {
    getChannel(context: CoordinationMessagingContext): Promise<CoordinationChannel>;
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
        },
    ): Promise<void>;
    subscribeEcdhPubkey(
        params: CoordinationMessagingContext & {
            orderId: string;
            callback: (pubKeyHex: string, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    sendWrappedKey(
        params: CoordinationMessagingContext & {
            recipientAddress: string;
            orderId: string;
            wrappedKeyB64: string;
        },
    ): Promise<void>;
    subscribeWrappedKey(
        params: CoordinationMessagingContext & {
            orderId: string;
            callback: (wrappedKeyB64: string, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    sendCommitmentPayload(
        params: CoordinationMessagingContext & {
            recipientAddress: string;
            orderId: string;
            payloadCid: string;
        },
    ): Promise<void>;
    subscribeCommitmentPayload(
        params: CoordinationMessagingContext & {
            orderId: string;
            callback: (payloadCid: string, senderIdentity: string) => void;
        },
    ): Promise<() => void>;
    subscribeAnyCommitmentPayload(
        params: CoordinationMessagingContext & {
            callback: (payloadCid: string, orderId: string) => void;
        },
    ): Promise<() => void>;
    sendHandoffAddress(
        params: CoordinationMessagingContext & {
            recipientAddress: string;
            orderId: string;
            deliveryAddress: string;
        },
    ): Promise<void>;
    subscribeHandoffAddress(
        params: CoordinationMessagingContext & {
            orderId: string;
            callback: (deliveryAddress: string, senderIdentity: string) => void;
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
    async getChannel({ address, walletClient }: CoordinationMessagingContext): Promise<CoordinationChannel> {
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

    async sendEcdhPubkey({ recipientAddress, orderId, pubKeyHex, ...context }: CoordinationMessagingContext & {
        recipientAddress: string;
        orderId: string;
        pubKeyHex: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendEcdhPubkey({ recipientAddress, orderId, pubKeyHex });
    }

    async subscribeEcdhPubkey({ orderId, callback, ...context }: CoordinationMessagingContext & {
        orderId: string;
        callback: (pubKeyHex: string, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onEcdhPubkey(orderId, callback);
    }

    async sendWrappedKey({ recipientAddress, orderId, wrappedKeyB64, ...context }: CoordinationMessagingContext & {
        recipientAddress: string;
        orderId: string;
        wrappedKeyB64: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendWrappedKey({ recipientAddress, orderId, wrappedKeyB64 });
    }

    async subscribeWrappedKey({ orderId, callback, ...context }: CoordinationMessagingContext & {
        orderId: string;
        callback: (wrappedKeyB64: string, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onWrappedKey(orderId, callback);
    }

    async sendCommitmentPayload({ recipientAddress, orderId, payloadCid, ...context }: CoordinationMessagingContext & {
        recipientAddress: string;
        orderId: string;
        payloadCid: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendCommitmentPayload({ recipientAddress, orderId, payloadCid });
    }

    async subscribeCommitmentPayload({ orderId, callback, ...context }: CoordinationMessagingContext & {
        orderId: string;
        callback: (payloadCid: string, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onCommitmentPayload(orderId, callback);
    }

    async subscribeAnyCommitmentPayload({ callback, ...context }: CoordinationMessagingContext & {
        callback: (payloadCid: string, orderId: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onAnyCommitmentPayload(callback);
    }

    async sendHandoffAddress({ recipientAddress, orderId, deliveryAddress, ...context }: CoordinationMessagingContext & {
        recipientAddress: string;
        orderId: string;
        deliveryAddress: string;
    }): Promise<void> {
        const channel = await this.getChannel(context);
        await channel.sendHandoffAddress({ recipientAddress, orderId, deliveryAddress });
    }

    async subscribeHandoffAddress({ orderId, callback, ...context }: CoordinationMessagingContext & {
        orderId: string;
        callback: (deliveryAddress: string, senderIdentity: string) => void;
    }): Promise<() => void> {
        const channel = await this.getChannel(context);
        return channel.onHandoffAddress(orderId, callback);
    }
}

export const DEFAULT_COORDINATION_MESSAGING_SERVICE: CoordinationMessagingService =
    new DefaultCoordinationMessagingService();
