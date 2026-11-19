"use client";

import { QueryParamPage, walletParam } from "@/components/shared/QueryParamPage";
import { CheckoutView } from "./_components/CheckoutView";

/**
 * /s/checkout?seller=<address> — review the cart and place a bonded order.
 *
 * The seller address is an open-world id (any wallet), so it rides in a query
 * param (`QueryParamPage`); a missing or malformed address names no seller,
 * and the page says so in one line.
 */
export default function CheckoutPage() {
    return (
        <QueryParamPage param="seller" validate={walletParam} shows="the checkout of an order from one seller">
            {(seller) => <CheckoutView sellerAddress={seller} />}
        </QueryParamPage>
    );
}
