"use client";

import { QueryParamPage, walletParam } from "@/components/shared/QueryParamPage";
import { MemberDetailView } from "./_components/MemberDetailView";

/**
 * /s/view?seller=<address> — browse a member's catalog and place a bonded
 * order.
 *
 * The seller address is an open-world id (any wallet), so it rides in a query
 * param (`QueryParamPage`); a missing or malformed address names no seller,
 * and the page says so in one line.
 */
export default function SellerPage() {
    return (
        <QueryParamPage param="seller" validate={walletParam} shows="one member's catalog">
            {(seller) => <MemberDetailView sellerAddress={seller} />}
        </QueryParamPage>
    );
}
