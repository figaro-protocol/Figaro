import type { AcceptedTokenMetadata } from "@/lib/shared/sellerCatalogueMetadata";

export interface MenuItem {
    id: string;
    name: string;
    description: string;
    price: string;
    image: string;
    category: string;
    available: boolean;
}

export interface Restaurant {
    id: string;
    name: string;
    address: string;
    description: string;
    cuisine: string;
    image: string;
    rating: number;
    deliveryTime: string;
    minimumOrder: string;
    geohash?: string;
    menu: MenuItem[];
    acceptedTokens?: AcceptedTokenMetadata[];
    fulfillmentModes?: ("pickup" | "delivery")[];
}

export interface CartItem {
    menuItemId: string;
    restaurantId: string;
    restaurantAddress: string;
    restaurantName: string;
    name: string;
    price: string;
    quantity: number;
    imageURI?: string;
}
