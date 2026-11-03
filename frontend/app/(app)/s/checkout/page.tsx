"use client";

import { QueryParamPage, walletParam } from "@/components/shared/QueryParamPage";
import { CheckoutView } from "./_components/CheckoutView";

/**
 * /s/checkout?seller=<address> — review the cart and place a bonded order.
 *
 * The seller address is an open-world id (any wallet), so it rides in a query
 * param (`QueryParamPage`); a missing or malformed address renders nothing.
 */
export default function CheckoutPage() {
    return (
        <QueryParamPage param="seller" validate={walletParam}>
            {(seller) => <CheckoutView sellerAddress={seller} />}
        </QueryParamPage>
    );
}
