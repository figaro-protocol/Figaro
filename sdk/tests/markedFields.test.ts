// A mark in a clause's `block` names fields by the spec's own names. The
// readers below hold a mark to the spec's own fields: a mark that names a
// field the spec does not declare, or one field twice, marks nothing.
import { describe, expect, it } from "vitest";
import { specEndpoints, specMarkedFields, type ProjectionSpecView } from "../src/index";

const view = (fields: ProjectionSpecView["fields"], hints?: ProjectionSpecView["hints"]): ProjectionSpecView => ({
    clauseKey: `0x${"ab".repeat(32)}`,
    clauseId: "stranger-route",
    version: 1,
    title: "A stranger's route",
    description: "Fields no reference spec declares.",
    fields,
    ...(hints && { hints }),
});

const PICKUP = { name: "pickupCell", type: "string", required: true } as const;
const DROPOFF = { name: "dropoffCell", type: "string", required: true } as const;
const COUNT = { name: "legCount", type: "integer", required: true } as const;

describe("specMarkedFields", () => {
    it("returns the named fields in the mark's order when the spec declares each", () => {
        expect(specMarkedFields(view([PICKUP, DROPOFF]), ["dropoffCell", "pickupCell"])?.map((f) => f.name))
            .toEqual(["dropoffCell", "pickupCell"]);
    });

    it("marks nothing when a name is undeclared or appears twice", () => {
        expect(specMarkedFields(view([PICKUP]), ["pickupCell", "dropoffCell"])).toBeUndefined();
        expect(specMarkedFields(view([PICKUP, DROPOFF]), ["pickupCell", "pickupCell"])).toBeUndefined();
    });
});

describe("specEndpoints", () => {
    it("reads a stranger's route under its own field names", () => {
        expect(specEndpoints(view([PICKUP, DROPOFF], { endpoints: { from: "pickupCell", to: "dropoffCell" } })))
            .toEqual({ from: "pickupCell", to: "dropoffCell" });
    });

    it("gives no route to a clause with fields named origin and destination and no mark", () => {
        const origin = { ...PICKUP, name: "origin" };
        const destination = { ...DROPOFF, name: "destination" };
        expect(specEndpoints(view([origin, destination]))).toBeUndefined();
    });

    it("marks nothing when the spec's own fields contradict the mark", () => {
        expect(specEndpoints(view([PICKUP], { endpoints: { from: "pickupCell", to: "dropoffCell" } }))).toBeUndefined();
        expect(specEndpoints(view([PICKUP, COUNT], { endpoints: { from: "pickupCell", to: "legCount" } }))).toBeUndefined();
    });
});
