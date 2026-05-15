/**
 * DeliveryAttestationPanel — symmetry and mode selection tests.
 *
 * Verifies:
 *   - Panel renders correct title for pickup vs delivery
 *   - All four attestation modes selectable
 *   - QR Challenge form renders band 4 (Visual) on submit
 *   - Geohash button disabled when no targetGeohash
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
    DeliveryAttestationModule,
    DeliveryAttestationPanel,
} from "@/components/modules/DeliveryAttestationPanel";

const skinBundle = {
    sourceKind: 'runtime-bound',
    skinId: 'binding-bobs-pizza-palace-local-anvil',
    subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    bindingId: 'binding:bobs-pizza-palace:local-anvil',
    branding: {
        branding: {
            displayName: "Bob's Pizza Palace",
            accentColor: '#1f6feb',
            themeClass: 'runtime-shell-pizza',
        },
        logoURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-logo.png',
        heroImageURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-hero.png',
        cssURL: 'http://127.0.0.1:8080/ipfs/example/runtime-shell-theme.css',
    },
} as const;

// ---------------------------------------------------------------------------
// Mock hooks — prevent real wallet / chain interaction
// ---------------------------------------------------------------------------

vi.mock("@/hooks/core/useDeliveryAttestation", () => ({
    useDeliveryAttestation: () => ({
        capturePhotoGPS: vi.fn(),
        captureGeohash: vi.fn(),
        loading: false,
        error: null,
    }),
}));

vi.mock("@/components/modules/QRChallengeDisplay", () => ({
    QRChallengeDisplay: ({ nonce }: { nonce: string }) => (
        <div data-testid="qr-challenge-display">{nonce}</div>
    ),
}));

vi.mock("@/components/modules/QRChallengeScanner", () => ({
    QRChallengeScanner: ({ onPayloadScanned, orderId, handoffStep }: {
        onPayloadScanned: (payload: { nonce: `0x${string}`; orderId: string; step: "pickup" | "delivery" }) => void;
        orderId: string;
        handoffStep: "pickup" | "delivery";
    }) => (
        <button
            type="button"
            data-testid="qr-challenge-scanner"
            onClick={() => onPayloadScanned({
                nonce: "0xfeedface",
                orderId,
                step: handoffStep,
            })}
        >
            Mock Scan
        </button>
    ),
}));

const mockSignalWithProof = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/mechanisms/useCourierProcess", () => ({
    useCourierProcessActions: () => ({
        signalWithProof: mockSignalWithProof,
        signal: vi.fn(),
        isPending: false,
        isConfirming: false,
        isSuccess: false,
        error: null,
        isAvailable: true,
    }),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const defaultProps = {
    processId: "0xabc123" as `0x${string}`,
    deliveryOrderHash: "0x000000000000000000000000000000000000000000000000000000000000002a",
};

function createModuleProps(overrides: Record<string, unknown> = {}) {
    return {
        moduleId: "delivery-attestation",
        binding: {
            moduleId: "delivery-attestation",
            componentKind: "DeliveryAttestationPanel",
            semanticInput: "MechanismModel",
            slot: "main",
            priority: 1,
        },
        context: {
            assembly: {} as any,
            services: {} as any,
            processModel: {
                processId: defaultProps.processId,
            } as any,
            selectedOrder: {
                orderId: defaultProps.deliveryOrderHash,
            } as any,
            capabilities: [],
            executableCapabilityIds: new Set<string>(),
            executingCapabilityId: null,
            mechanisms: [
                {
                    id: "delivery-coordinator",
                    kind: "coordinator",
                    name: "Delivery Coordinator",
                    description: "",
                    riskClass: "low-risk-coordinator",
                    moduleBindings: [],
                    contracts: [],
                    touchesAssets: false,
                    guarantees: [],
                    attachments: [],
                    pickupGeohash: "9q8yyk",
                    dropoffGeohash: "9q8yym",
                    deliveryStage: 0,
                } as any,
            ],
            riskBoundaries: {},
            onExecuteCapability: vi.fn(),
            onSelectOrder: vi.fn(),
            onComposeSubOrder: vi.fn(),
            skinBundle,
            ...overrides,
        },
    } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeliveryAttestationPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("step-aware titles", () => {
        it("renders 'Delivery Confirmation' by default", () => {
            render(<DeliveryAttestationPanel {...defaultProps} />);
            expect(screen.getByText("Delivery Confirmation")).toBeInTheDocument();
        });

        it("renders 'Pickup Confirmation' when handoffStep is pickup", () => {
            render(<DeliveryAttestationPanel {...defaultProps} handoffStep="pickup" />);
            expect(screen.getByText("Pickup Confirmation")).toBeInTheDocument();
        });

        it("renders 'Delivery Confirmation' when handoffStep is delivery", () => {
            render(<DeliveryAttestationPanel {...defaultProps} handoffStep="delivery" />);
            expect(screen.getByText("Delivery Confirmation")).toBeInTheDocument();
        });
    });

    describe("mode selection", () => {
        it("renders all four mode buttons", () => {
            render(<DeliveryAttestationPanel {...defaultProps} />);

            expect(screen.getByTestId("btn-mode-device-proximity")).toBeInTheDocument();
            expect(screen.getByTestId("btn-mode-qr-challenge")).toBeInTheDocument();
            expect(screen.getByTestId("btn-mode-photo-gps")).toBeInTheDocument();
            expect(screen.getByTestId("btn-mode-geohash-match")).toBeInTheDocument();
        });

        it("disables geohash mode when no targetGeohash", () => {
            render(<DeliveryAttestationPanel {...defaultProps} />);
            const btn = screen.getByTestId("btn-mode-geohash-match");
            expect(btn).toBeDisabled();
        });

        it("enables geohash mode when targetGeohash is provided", () => {
            render(<DeliveryAttestationPanel {...defaultProps} targetGeohash="9q8yyk" />);
            const btn = screen.getByTestId("btn-mode-geohash-match");
            expect(btn).not.toBeDisabled();
        });

        it("enables geohash mode when legacy dropoffGeohash is provided", () => {
            render(<DeliveryAttestationPanel {...defaultProps} dropoffGeohash="9q8yyk" />);
            const btn = screen.getByTestId("btn-mode-geohash-match");
            expect(btn).not.toBeDisabled();
        });
    });

    describe("QR Challenge mode", () => {
        it("shows QR challenge form when mode selected", () => {
            render(<DeliveryAttestationPanel {...defaultProps} />);
            fireEvent.click(screen.getByTestId("btn-mode-qr-challenge"));
            expect(screen.getByTestId("attestation-qr-form")).toBeInTheDocument();
        });

        it("mounts QR display and scanner surfaces", () => {
            render(<DeliveryAttestationPanel {...defaultProps} />);
            fireEvent.click(screen.getByTestId("btn-mode-qr-challenge"));

            expect(screen.getByTestId("qr-challenge-scanner")).toBeInTheDocument();

            fireEvent.click(screen.getByTestId("btn-generate-qr-challenge"));
            expect(screen.getByTestId("qr-challenge-display")).toBeInTheDocument();
        });

        it("accepts a scanned nonce into the QR proof form", () => {
            render(<DeliveryAttestationPanel {...defaultProps} />);
            fireEvent.click(screen.getByTestId("btn-mode-qr-challenge"));

            fireEvent.click(screen.getByTestId("qr-challenge-scanner"));

            expect(screen.getByTestId("input-qr-nonce")).toHaveValue("0xfeedface");
        });

        it("has nonce and device signature inputs", () => {
            render(<DeliveryAttestationPanel {...defaultProps} />);
            fireEvent.click(screen.getByTestId("btn-mode-qr-challenge"));
            expect(screen.getByTestId("input-qr-nonce")).toBeInTheDocument();
            expect(screen.getByTestId("input-qr-device-sig")).toBeInTheDocument();
        });

        it("submit button disabled without nonce and sig", () => {
            render(<DeliveryAttestationPanel {...defaultProps} />);
            fireEvent.click(screen.getByTestId("btn-mode-qr-challenge"));
            expect(screen.getByTestId("btn-submit-qr-proof")).toBeDisabled();
        });

        it("calls signalWithProof with band 4 on QR submit for delivery", () => {
            render(<DeliveryAttestationPanel {...defaultProps} handoffStep="delivery" />);
            fireEvent.click(screen.getByTestId("btn-mode-qr-challenge"));

            fireEvent.change(screen.getByTestId("input-qr-nonce"), {
                target: { value: "0xdeadbeef" },
            });
            fireEvent.change(screen.getByTestId("input-qr-device-sig"), {
                target: { value: "0xcafebabe" },
            });
            fireEvent.click(screen.getByTestId("btn-submit-qr-proof"));

            expect(mockSignalWithProof).toHaveBeenCalledWith({
                orderHash: defaultProps.deliveryOrderHash,
                eventType: "completed",
                proof: {
                    band: 4,
                    nonce: "0xdeadbeef",
                    deviceSig: "0xcafebabe",
                },
            });
        });

        it("calls signalWithProof with arrived-pickup for pickup step", () => {
            render(<DeliveryAttestationPanel {...defaultProps} handoffStep="pickup" />);
            fireEvent.click(screen.getByTestId("btn-mode-qr-challenge"));

            fireEvent.change(screen.getByTestId("input-qr-nonce"), {
                target: { value: "0x1111" },
            });
            fireEvent.change(screen.getByTestId("input-qr-device-sig"), {
                target: { value: "0x2222" },
            });
            fireEvent.click(screen.getByTestId("btn-submit-qr-proof"));

            expect(mockSignalWithProof).toHaveBeenCalledWith({
                orderHash: defaultProps.deliveryOrderHash,
                eventType: "arrived-pickup",
                proof: {
                    band: 4,
                    nonce: "0x1111",
                    deviceSig: "0x2222",
                },
            });
        });
    });

    describe("Device co-sig mode — step awareness", () => {
        it("calls signalWithProof with arrived-pickup for pickup handoff", () => {
            render(<DeliveryAttestationPanel {...defaultProps} handoffStep="pickup" />);
            fireEvent.click(screen.getByTestId("btn-mode-device-proximity"));

            fireEvent.change(screen.getByTestId("input-proof-nonce"), {
                target: { value: "0xaaa" },
            });
            fireEvent.change(screen.getByTestId("input-proof-device-sig"), {
                target: { value: "0xbbb" },
            });
            fireEvent.click(screen.getByTestId("btn-submit-device-proof"));

            expect(mockSignalWithProof).toHaveBeenCalledWith({
                orderHash: defaultProps.deliveryOrderHash,
                eventType: "arrived-pickup",
                proof: {
                    band: 1,
                    nonce: "0xaaa",
                    deviceSig: "0xbbb",
                },
            });
        });

        it("calls signalWithProof with completed for delivery handoff", () => {
            render(<DeliveryAttestationPanel {...defaultProps} handoffStep="delivery" />);
            fireEvent.click(screen.getByTestId("btn-mode-device-proximity"));

            fireEvent.change(screen.getByTestId("input-proof-nonce"), {
                target: { value: "0xaaa" },
            });
            fireEvent.change(screen.getByTestId("input-proof-device-sig"), {
                target: { value: "0xbbb" },
            });
            fireEvent.click(screen.getByTestId("btn-submit-device-proof"));

            expect(mockSignalWithProof).toHaveBeenCalledWith({
                orderHash: defaultProps.deliveryOrderHash,
                eventType: "completed",
                proof: {
                    band: 1,
                    nonce: "0xaaa",
                    deviceSig: "0xbbb",
                },
            });
        });
    });

    describe("DeliveryAttestationModule", () => {
        it("renders pickup attestation for driver delivery flows before pickup", () => {
            render(<DeliveryAttestationModule {...createModuleProps()} />);

            expect(screen.getByText("Pickup Confirmation")).toBeInTheDocument();
            expect(screen.getByTestId("btn-mode-geohash-match")).not.toBeDisabled();
        });

        it("routes pickup proof submissions through shared capability execution", () => {
            const onExecuteCapability = vi.fn().mockResolvedValue(undefined);

            render(
                <DeliveryAttestationModule
                    {...createModuleProps({ onExecuteCapability })}
                />
            );

            fireEvent.click(screen.getByTestId("btn-mode-qr-challenge"));
            fireEvent.change(screen.getByTestId("input-qr-nonce"), {
                target: { value: "0x1111" },
            });
            fireEvent.change(screen.getByTestId("input-qr-device-sig"), {
                target: { value: "0x2222" },
            });
            fireEvent.click(screen.getByTestId("btn-submit-qr-proof"));

            expect(onExecuteCapability).toHaveBeenCalledWith(
                expect.objectContaining({
                    actionKind: "submit-courier-process-signal-with-proof",
                    mechanismId: "delivery-attestation",
                    action: expect.objectContaining({
                        executionType: "transaction",
                        kind: "submit-courier-process-signal-with-proof",
                        orderHash: defaultProps.deliveryOrderHash,
                        eventType: "arrived-pickup",
                    }),
                }),
                {
                    kind: "submit-courier-process-signal-with-proof",
                    proof: {
                        band: 4,
                        nonce: "0x1111",
                        deviceSig: "0x2222",
                    },
                },
            );
            expect(mockSignalWithProof).not.toHaveBeenCalled();
        });

        it("renders delivery attestation after pickup stage", () => {
            render(
                <DeliveryAttestationModule
                    {...createModuleProps({
                        mechanisms: [
                            {
                                id: "delivery-coordinator",
                                kind: "coordinator",
                                name: "Delivery Coordinator",
                                description: "",
                                riskClass: "low-risk-coordinator",
                                moduleBindings: [],
                                contracts: [],
                                touchesAssets: false,
                                guarantees: [],
                                attachments: [],
                                pickupGeohash: "9q8yyk",
                                dropoffGeohash: "9q8yym",
                                deliveryStage: 3,
                            } as any,
                        ],
                    })}
                />
            );

            expect(screen.getByText("Delivery Confirmation")).toBeInTheDocument();
            expect(screen.getByTestId("btn-mode-geohash-match")).not.toBeDisabled();
        });

        it("routes delivery proof submissions through shared capability execution", () => {
            const onExecuteCapability = vi.fn().mockResolvedValue(undefined);

            render(
                <DeliveryAttestationModule
                    {...createModuleProps({
                        onExecuteCapability,
                        mechanisms: [
                            {
                                id: "delivery-coordinator",
                                kind: "coordinator",
                                name: "Delivery Coordinator",
                                description: "",
                                riskClass: "low-risk-coordinator",
                                moduleBindings: [],
                                contracts: [],
                                touchesAssets: false,
                                guarantees: [],
                                attachments: [],
                                pickupGeohash: "9q8yyk",
                                dropoffGeohash: "9q8yym",
                                deliveryStage: 3,
                            } as any,
                        ],
                    })}
                />
            );

            fireEvent.click(screen.getByTestId("btn-mode-device-proximity"));
            fireEvent.change(screen.getByTestId("input-proof-nonce"), {
                target: { value: "0xaaaa" },
            });
            fireEvent.change(screen.getByTestId("input-proof-device-sig"), {
                target: { value: "0xbbbb" },
            });
            fireEvent.click(screen.getByTestId("btn-submit-device-proof"));

            expect(onExecuteCapability).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: expect.objectContaining({
                        kind: "submit-courier-process-signal-with-proof",
                        eventType: "completed",
                    }),
                }),
                {
                    kind: "submit-courier-process-signal-with-proof",
                    proof: {
                        band: 1,
                        nonce: "0xaaaa",
                        deviceSig: "0xbbbb",
                    },
                },
            );
            expect(mockSignalWithProof).not.toHaveBeenCalled();
        });

        it("applies skin-aware chrome through the module wrapper", () => {
            render(<DeliveryAttestationModule {...createModuleProps()} />);

            const panel = screen.getByTestId('delivery-attestation-panel');
            expect(panel).toHaveAttribute('data-skin', skinBundle.skinId);
            expect(screen.getByText('Pickup Confirmation')).toHaveStyle({ color: '#1f6feb' });

            fireEvent.click(screen.getByTestId('btn-mode-qr-challenge'));

            expect(screen.getByTestId('btn-mode-qr-challenge')).toHaveStyle({ backgroundColor: '#1f6feb' });
            expect(screen.getByTestId('btn-submit-qr-proof')).toHaveStyle({ backgroundColor: '#1f6feb' });
        });
    });
});
