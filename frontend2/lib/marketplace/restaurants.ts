import type { Restaurant } from "./types";

export type { Restaurant } from "./types";
export type { MenuItem } from "./types";

const MOCK_RESTAURANT_DATA: Restaurant[] = [
    {
        id: "1",
        name: "Bob's Pizza Palace",
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        description: "Authentic New York style pizza 🍕",
        cuisine: "Italian",
        image: "🍕",
        rating: 4.8,
        deliveryTime: "30-45 min",
        minimumOrder: "0.01",
        geohash: "dr5reg",
        menu: [
            { id: "pizza1", name: "Margherita Pizza", description: "Classic tomato, mozzarella, and basil", price: "0.01", image: "🍕", category: "Pizza", available: true },
            { id: "pizza2", name: "Pepperoni Deluxe", description: "Extra pepperoni and cheese", price: "0.015", image: "🍕", category: "Pizza", available: true },
            { id: "drink1", name: "Soft Drink", description: "Cola, Sprite, or Fanta", price: "0.002", image: "🥤", category: "Drinks", available: true },
        ],
    },
    {
        id: "2",
        name: "Charlie's Burger Joint",
        address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        description: "Gourmet burgers and fries 🍔",
        cuisine: "American",
        image: "🍔",
        rating: 4.6,
        deliveryTime: "25-35 min",
        minimumOrder: "0.008",
        geohash: "9q8yy9",
        menu: [
            { id: "burger1", name: "Classic Cheeseburger", description: "Beef patty, cheese, lettuce, tomato", price: "0.012", image: "🍔", category: "Burgers", available: true },
            { id: "burger2", name: "Double Bacon Burger", description: "Double patty with crispy bacon", price: "0.018", image: "🍔", category: "Burgers", available: true },
            { id: "fries1", name: "French Fries", description: "Crispy golden fries", price: "0.004", image: "🍟", category: "Sides", available: true },
        ],
    },
    {
        id: "3",
        name: "Dave's Sushi Bar",
        address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
        description: "Fresh sushi and Japanese cuisine 🍣",
        cuisine: "Japanese",
        image: "🍣",
        rating: 4.9,
        deliveryTime: "35-50 min",
        minimumOrder: "0.015",
        geohash: "9q8yyk",
        menu: [
            { id: "sushi1", name: "California Roll", description: "Crab, avocado, cucumber", price: "0.01", image: "🍣", category: "Rolls", available: true },
            { id: "sushi2", name: "Salmon Nigiri (6pc)", description: "Fresh salmon over rice", price: "0.02", image: "🍣", category: "Nigiri", available: true },
            { id: "sushi3", name: "Miso Soup", description: "Traditional Japanese soup", price: "0.003", image: "🍜", category: "Sides", available: true },
        ],
    },
];

export const MOCK_RESTAURANTS: Restaurant[] = MOCK_RESTAURANT_DATA;

export function getRestaurantById(id: string): Restaurant | undefined {
    return MOCK_RESTAURANTS.find((r) => r.id === id);
}

export function getRestaurantByAddress(address: string): Restaurant | undefined {
    return MOCK_RESTAURANTS.find(
        (r) => r.address.toLowerCase() === address.toLowerCase()
    );
}
