import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { createServiceSchema } from "../src/modules/catalog/catalog.schemas.js";

describe("catalog and sourced quote schema", () => {
  it("accepts multiple service-type tags and rejects suitability tags", () => {
    const parsed = createServiceSchema.parse({ params: {}, query: {}, body: {
      name: "Seoul family experience", category: "Tham quan", tags: ["SIGHTSEEING", "LODGING"], unit: "vé",
    } });

    expect(parsed.body.tags).toEqual(["SIGHTSEEING", "LODGING"]);
    expect(() => createServiceSchema.parse({ params: {}, query: {}, body: {
      name: "Seoul family experience", category: "Tham quan", tags: ["FAMILY"], unit: "vé",
    } })).toThrow();
  });

  it("defines service, offer and quote source invariants without supplier records", async () => {
    const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

    expect(schema).not.toContain("model Supplier {");
    expect(schema).not.toContain("supplierId");
    expect(schema).not.toContain("supplierNameSnapshot");
    expect(schema).toContain("model Service {");
    expect(schema).toContain("model SupplierOffer {");
    expect(schema).toMatch(/tags\s+String\[\]/);
    expect(schema).toContain("enum SupplierOfferStatus {");
    expect(schema).toContain("enum QuoteItemSourceType {");
    expect(schema).toContain("enum QuoteItemPriceStatus {");
    expect(schema).toContain("supplierOfferId");
    expect(schema).not.toContain("supplierNameSnapshot");
    expect(schema).toContain("priceStatus");
    expect(schema).toContain("NEEDS_REVIEW");
  });

  it("models one optional price per service in Prisma", async () => {
    const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

    const serviceModel = schema.slice(schema.indexOf("model Service {"), schema.indexOf("model IdempotencyRecord {"));
    const offerModel = schema.slice(schema.indexOf("model SupplierOffer {"), schema.indexOf("model IdempotencyRecord {"));
    expect(serviceModel).toMatch(/offer\s+SupplierOffer\?/);
    expect(offerModel).toMatch(/serviceId\s+String\s+@unique/);
  });
});
