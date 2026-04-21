import { NextRequest, NextResponse } from "next/server";
import {
    isValidAgreementHash,
    lookupAgreementPublication,
} from "@/lib/core/agreementPublicationRegistry.server";

export const dynamic = "force-dynamic";

interface RouteContext {
    params: {
        agreementHash: string;
    };
}

export async function GET(_request: NextRequest, context: RouteContext) {
    const { agreementHash } = context.params;

    if (!isValidAgreementHash(agreementHash)) {
        return NextResponse.json({ error: "Invalid agreement hash" }, { status: 400 });
    }

    const publication = await lookupAgreementPublication(agreementHash);
    if (!publication) {
        return NextResponse.json({ error: "Agreement publication not found" }, { status: 404 });
    }

    return NextResponse.json(publication);
}