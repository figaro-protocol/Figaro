import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ManifestForm, EMPTY_MANIFEST_FIELDS, type ManifestFields } from "@/components/core/ManifestForm";

function ControlledManifestForm({
    initialValue = EMPTY_MANIFEST_FIELDS,
    showValidation = false,
}: {
    initialValue?: ManifestFields;
    showValidation?: boolean;
}) {
    const [value, setValue] = useState<ManifestFields>(initialValue);

    return <ManifestForm value={value} onChange={setValue} showValidation={showValidation} />;
}

describe("ManifestForm", () => {
    it("shows origin validation after blur before submit", async () => {
        const user = userEvent.setup();

        render(<ControlledManifestForm />);

        await user.click(screen.getByTestId("manifest-input-origin"));
        await user.click(screen.getByTestId("manifest-input-destination"));

        expect(screen.getByText("Origin is required")).toBeInTheDocument();
        expect(screen.queryByText("Destination is required")).not.toBeInTheDocument();
    });

    it("shows both required-field messages when submit validation is enabled", () => {
        render(<ControlledManifestForm showValidation />);

        expect(screen.getByText("Origin is required")).toBeInTheDocument();
        expect(screen.getByText("Destination is required")).toBeInTheDocument();
    });
});