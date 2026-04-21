/**
 * lib/shared/driverOfferingMetadata.ts
 *
 * Metadata schema for a driver's offering — analogous to SellerCatalogueMetadata
 * for merchants. A driver is a seller: they offer delivery capacity within
 * service areas, at certain times, with certain vehicle constraints.
 *
 * Stored off-chain (IPFS), pointed to by OperatorRegistry.metadataURI.
 */

export interface DriverAvailabilityWindow {
    /** ISO day-of-week: "monday" | "tuesday" | ... */
    day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
    /** HH:MM in the driver's timezone */
    open: string;
    /** HH:MM in the driver's timezone */
    close: string;
}

export interface DriverServiceAreaMetadata {
    /** 4–6 char geohash prefix defining the area */
    geohashPrefix: string;
    /** Human-readable label */
    label?: string;
}

export type VehicleType = "bicycle" | "motorcycle" | "car" | "van" | "on-foot";

export interface DriverOfferingMetadata {
    subjectAddress: `0x${string}`;
    archetypeId: "driver-delivery";
    driverId: string;
    displayName: string;
    description?: string;

    /** Geographic areas this driver covers */
    serviceAreas: DriverServiceAreaMetadata[];

    /** Vehicle or transport method */
    vehicleType?: VehicleType;

    /** Maximum cargo weight/size descriptor (free text, e.g. "up to 10kg") */
    capacityDescription?: string;

    /** IANA timezone for availability windows */
    timezone?: string;

    /** When the driver is typically available */
    availability?: DriverAvailabilityWindow[];

    /** Minimum acceptable delivery fee in token units */
    minimumFee?: string;

    /** Branding — same shape as merchant for UI consistency */
    branding?: {
        displayName?: string;
        avatarURI?: string;
        accentColor?: string;
    };

    version: string;
}

export const DRIVER_OFFERING_METADATA_EXAMPLE: DriverOfferingMetadata = {
    subjectAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    archetypeId: "driver-delivery",
    driverId: "eve-delivery-01",
    displayName: "Eve Express",
    description: "Fast bicycle delivery, downtown Manhattan",
    serviceAreas: [
        { geohashPrefix: "dr5re", label: "Lower Manhattan" },
        { geohashPrefix: "dr5rg", label: "Midtown" },
    ],
    vehicleType: "bicycle",
    capacityDescription: "Up to 5kg, insulated bag",
    timezone: "America/New_York",
    availability: [
        { day: "monday", open: "11:00", close: "21:00" },
        { day: "tuesday", open: "11:00", close: "21:00" },
        { day: "wednesday", open: "11:00", close: "21:00" },
        { day: "thursday", open: "11:00", close: "21:00" },
        { day: "friday", open: "11:00", close: "23:00" },
        { day: "saturday", open: "10:00", close: "23:00" },
        { day: "sunday", open: "10:00", close: "20:00" },
    ],
    minimumFee: "0.001",
    branding: {
        displayName: "Eve Express",
        avatarURI: "ipfs://example/eve-avatar.png",
        accentColor: "#059669",
    },
    version: "1.0.0",
};
