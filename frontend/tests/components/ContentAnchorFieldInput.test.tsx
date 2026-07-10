/**
 * ContentAnchorFieldInput — the bytes32-hex format tenant.
 *
 * The ONLY fill path is the affix: pick a file → pin (mocked ipfs module) →
 * keccak256 of the bytes fills the field, and the pinned locator rides the
 * companion channel under the "uri" format. There is NO paste-hex input —
 * the anchor derives from the artifact. Pin failure fills nothing (anchor +
 * pin are one act).
 */
import { useState } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { keccak256, stringToBytes } from "viem";
import type { FieldSpec } from "@figaro/sdk/clauses";
import { ContentAnchorFieldInput } from "@/components/runtime/ContentAnchorFieldInput";
import { FieldControl } from "@/components/runtime/FieldControl";

const uploadFile = vi.fn();
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/shared/ipfsService")>();
    return {
        ...actual,
        DEFAULT_IPFS_SERVICE: {
            ...actual.DEFAULT_IPFS_SERVICE,
            uploadFile: (file: File) => uploadFile(file),
        },
    };
});

const DOC_TEXT = "The canonical terms of service text.";
const DOC_ANCHOR = keccak256(stringToBytes(DOC_TEXT));

afterEach(() => {
    cleanup();
    uploadFile.mockReset();
});

describe("ContentAnchorFieldInput", () => {
    it("affixing a file pins it, fills keccak256 of the bytes, and emits the locator companion", async () => {
        uploadFile.mockResolvedValue({ cid: "bafydoc", uri: "ipfs://bafydoc", path: "/ipfs/bafydoc", gatewayUrl: "http://g/bafydoc" });
        const onChange = vi.fn();
        const onCompanion = vi.fn();
        render(
            <ContentAnchorFieldInput value="" onChange={onChange} onCompanion={onCompanion} testId="f-anchor" />,
        );
        const file = new File([DOC_TEXT], "tos.txt", { type: "text/plain" });
        await userEvent.upload(screen.getByTestId("f-anchor-affix"), file);
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(DOC_ANCHOR));
        expect(onCompanion).toHaveBeenCalledWith("uri", "ipfs://bafydoc");
        expect(uploadFile).toHaveBeenCalledOnce();
    });

    it("offers NO paste-hex input — the anchor derives from the artifact only", () => {
        render(<ContentAnchorFieldInput value="" onChange={() => {}} testId="f-anchor" />);
        const affix = screen.getByTestId("f-anchor-affix") as HTMLInputElement;
        expect(affix.type).toBe("file");
        // The bare testid is the read-only anchor display, never a text input.
        expect(screen.queryByTestId("f-anchor")).toBeNull(); // absent until a value exists
        cleanup();
        render(<ContentAnchorFieldInput value={DOC_ANCHOR} onChange={() => {}} testId="f-anchor" />);
        expect(screen.getByTestId("f-anchor").tagName).toBe("P");
    });

    it("a pin failure fills nothing — anchor + pin are one act", async () => {
        uploadFile.mockRejectedValue(new Error("node unreachable"));
        const onChange = vi.fn();
        const onCompanion = vi.fn();
        render(
            <ContentAnchorFieldInput value="" onChange={onChange} onCompanion={onCompanion} testId="f-anchor" />,
        );
        await userEvent.upload(
            screen.getByTestId("f-anchor-affix"),
            new File([DOC_TEXT], "tos.txt", { type: "text/plain" }),
        );
        await waitFor(() => expect(screen.getByTestId("f-anchor-affix-error").textContent).toMatch(/node unreachable/));
        expect(onChange).not.toHaveBeenCalled();
        expect(onCompanion).not.toHaveBeenCalled();
    });

    it("through the repeater, one affix COMPOSES anchor + locator into the same item (stale-closure regression)", async () => {
        uploadFile.mockResolvedValue({ cid: "bafydoc", uri: "ipfs://bafydoc", path: "/ipfs/bafydoc", gatewayUrl: "http://g/bafydoc" });
        const docsField = {
            name: "documents",
            type: "array",
            required: true,
            minItems: 1,
            items: {
                type: "object",
                fields: [
                    { name: "documentHash", type: "string", required: true, format: "bytes32-hex" },
                    { name: "documentUri", type: "string", required: false, format: "uri" },
                ],
            },
        } as unknown as FieldSpec;
        let latest: unknown;
        function Harness() {
            const [value, setValue] = useState<unknown>([{}]);
            latest = value;
            return (
                <FieldControl
                    field={docsField}
                    value={value}
                    onChange={(next) => { setValue(next); latest = next; }}
                    testId="f-docs"
                />
            );
        }
        render(<Harness />);
        await userEvent.upload(
            screen.getByTestId("f-docs-0-documentHash-affix"),
            new File([DOC_TEXT], "tos.txt", { type: "text/plain" }),
        );
        // BOTH values survive — the anchor's own fill and the pinned locator
        // companion must compose, not overwrite each other.
        await waitFor(() => expect(latest).toEqual([
            { documentHash: DOC_ANCHOR, documentUri: "ipfs://bafydoc" },
        ]));
    });

    it("clear empties the field and retracts the companion", async () => {
        const onChange = vi.fn();
        const onCompanion = vi.fn();
        render(
            <ContentAnchorFieldInput value={DOC_ANCHOR} onChange={onChange} onCompanion={onCompanion} testId="f-anchor" />,
        );
        await userEvent.click(screen.getByTestId("f-anchor-clear"));
        expect(onChange).toHaveBeenCalledWith(undefined);
        expect(onCompanion).toHaveBeenCalledWith("uri", undefined);
    });
});
