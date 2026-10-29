import { describe, expect, it } from "vitest";

import { InMemoryPlanningRepository } from "../src/modules/planning/infrastructure/in-memory-planning.repository.js";
import { PlanningService } from "../src/modules/planning/planning.service.js";
import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";
import { ExternalSourceService } from "../src/modules/external-sources/external-source.service.js";
import { InMemoryExternalSourceRepository } from "../src/modules/external-sources/infrastructure/in-memory-external-source.repository.js";

async function setup(catalog?: object) {
  let id = 0;
  const createId = () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`;
  const now = () => new Date("2026-10-27T04:00:00.000Z");
  const tripRepository = new InMemoryTripRepository();
  const tripService = new TripService(tripRepository, { createId, now });
  const trip = await tripService.create({
    title: "Seoul family trip",
    customerName: "Gia đình anh Minh",
    origin: "Ho Chi Minh City",
    destination: "Seoul",
    startDate: "2027-04-05",
    endDate: "2027-04-09",
    travelers: 6,
    budgetAmountMinor: 120_000_000,
    budgetCurrency: "VND",
  });
  const repository = new InMemoryPlanningRepository();
  const externalSources = new ExternalSourceService(new InMemoryExternalSourceRepository(), { createId, now });
  const service = new PlanningService(tripRepository, repository, { createId, now }, catalog as never, externalSources);
  return { service, repository, trip, externalSources };
}

const activity = {
  dayIndex: 1,
  title: "Cung điện Gyeongbokgung",
  location: "Seoul",
  localStartTime: "09:00",
  localEndTime: "11:00",
  timezone: "Asia/Seoul",
  description: "Tham quan cung điện",
};

describe("PlanningService", () => {
  it("adds an itinerary item and increments the draft revision", async () => {
    const { service, trip } = await setup();
    const draft = await service.getDraft(trip.id);
    const updated = await service.addItineraryItem(trip.id, {
      expectedRevision: draft.revision,
      ...activity,
    });

    expect(updated.revision).toBe(2);
    expect(updated.items).toEqual([
      expect.objectContaining({ title: activity.title, isLocked: false }),
    ]);
  });

  it("adds a consultant activity and a linked unpriced quote row when no source is selected", async () => {
    const { service, trip } = await setup();
    const draft = await service.getDraft(trip.id);

    const result = await service.addConsultantItineraryItem(trip.id, {
      expectedRevision: draft.revision,
      ...activity,
      quantity: 2,
    });

    expect(result.draft.items).toHaveLength(1);
    expect(result.quote.items).toHaveLength(1);
    expect(result.quote.items[0]).toMatchObject({
      itineraryItemId: result.draft.items[0]!.id,
      name: activity.title,
      quantity: 2,
      unitPriceMinor: null,
      amountMinor: null,
      priceStatus: "NEEDS_REVIEW",
      sourceType: "UNPRICED",
    });
    expect(result.quote.totalAmountMinor).toBe(0);
  });

  it("adds a linked manual quote using the quantity and unit price entered with the activity", async () => {
    const { service, trip } = await setup();
    const draft = await service.getDraft(trip.id);

    const result = await service.addConsultantItineraryItem(trip.id, {
      expectedRevision: draft.revision,
      ...activity,
      quantity: 3,
      unit: "vé",
      unitPriceMinor: 45_000,
    });

    expect(result.quote.items[0]).toMatchObject({
      itineraryItemId: result.draft.items[0]!.id,
      quantity: 3,
      unit: "vé",
      unitPriceMinor: 45_000,
      amountMinor: 135_000,
      sourceType: "MANUAL",
      priceStatus: "MANUAL",
    });
  });

  it("links an activity to its selected verified supplier offer and quote row", async () => {
    const offer = {
      id: "00000000-0000-4000-8000-000000000099",
      serviceId: "00000000-0000-4000-8000-000000000098",
      unitPriceMinor: 35_000,
      currency: "VND",
      validFrom: "2027-01-01",
      validUntil: "2027-12-31",
      details: "Vé tham quan",
      status: "VERIFIED",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
      service: { id: "00000000-0000-4000-8000-000000000098", name: "Vé cung điện", category: "Tham quan", unit: "khách", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null },
    };
    const { service, trip } = await setup({ getOfferForQuote: async () => offer });
    const draft = await service.getDraft(trip.id);

    const result = await service.addConsultantItineraryItem(trip.id, {
      expectedRevision: draft.revision,
      ...activity,
      quantity: 2,
      supplierOfferId: offer.id,
    });

    expect(result.draft.items[0]).toMatchObject({ supplierOfferId: offer.id });
    expect(result.quote.items[0]).toMatchObject({
      itineraryItemId: result.draft.items[0]!.id,
      supplierOfferId: offer.id,
      name: "Vé cung điện",
      quantity: 2,
      unitPriceMinor: 35_000,
      amountMinor: 70_000,
      sourceType: "CATALOG",
    });
  });

  it("keeps the selected internal offer as source when the consultant overrides its price", async () => {
    const offer = {
      id: "00000000-0000-4000-8000-000000000099",
      serviceId: "00000000-0000-4000-8000-000000000098", unitPriceMinor: 35_000, currency: "VND",
      validFrom: "2027-01-01", validUntil: "2027-12-31", details: "Vé tham quan", status: "VERIFIED",
      createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z"),
      service: { id: "00000000-0000-4000-8000-000000000098", name: "Vé cung điện", category: "Tham quan", unit: "khách", isActive: true, createdAt: new Date(), updatedAt: new Date(), offer: null },
    };
    const { service, trip } = await setup({ getOfferForQuote: async () => offer });
    const draft = await service.getDraft(trip.id);
    const result = await service.addConsultantItineraryItem(trip.id, {
      expectedRevision: draft.revision, ...activity, quantity: 2, supplierOfferId: offer.id, unitPriceMinor: 40_000,
    });

    expect(result.quote.items[0]).toMatchObject({
      supplierOfferId: offer.id, quantity: 2, unitPriceMinor: 40_000, amountMinor: 80_000,
      sourceUnitPriceMinor: 35_000, sourceType: "CATALOG", priceStatus: "PRICE_OVERRIDDEN",
    });
  });

  it("rejects invalid local times before persistence", async () => {
    const { service, repository, trip } = await setup();
    const draft = await service.getDraft(trip.id);

    await expect(service.addItineraryItem(trip.id, {
      expectedRevision: draft.revision,
      ...activity,
      localStartTime: "11:00",
      localEndTime: "09:00",
    })).rejects.toMatchObject({ code: "INVALID_TIME_RANGE" });
    expect(repository.itineraryMutationCount).toBe(0);
  });

  it("rejects adding an activity that overlaps an existing activity on the same day", async () => {
    const { service, repository, trip } = await setup();
    const draft = await service.getDraft(trip.id);
    await service.addItineraryItem(trip.id, { expectedRevision: draft.revision, ...activity });

    await expect(service.addItineraryItem(trip.id, {
      expectedRevision: 2,
      ...activity,
      title: "Bukchon Hanok",
      localStartTime: "10:30",
      localEndTime: "12:00",
    })).rejects.toMatchObject({ status: 409, code: "ACTIVITY_TIME_CONFLICT" });
    expect(repository.itineraryMutationCount).toBe(1);
  });

  it("rejects updating an activity into another activity's time slot", async () => {
    const { service, trip } = await setup();
    let draft = await service.getDraft(trip.id);
    draft = await service.addItineraryItem(trip.id, { expectedRevision: draft.revision, ...activity });
    draft = await service.addItineraryItem(trip.id, {
      expectedRevision: draft.revision,
      ...activity,
      title: "Bukchon Hanok",
      localStartTime: "13:00",
      localEndTime: "15:00",
    });

    await expect(service.updateItineraryItem(trip.id, draft.items[1]!.id, {
      expectedRevision: draft.revision,
      localStartTime: "10:30",
      localEndTime: "12:00",
    })).rejects.toMatchObject({ status: 409, code: "ACTIVITY_TIME_CONFLICT" });
  });

  it("prevents updates to a locked item until it is explicitly unlocked", async () => {
    const { service, trip } = await setup();
    let draft = await service.getDraft(trip.id);
    draft = await service.addItineraryItem(trip.id, { expectedRevision: 1, ...activity });
    const itemId = draft.items[0]!.id;
    draft = await service.updateItineraryItem(trip.id, itemId, {
      expectedRevision: 2,
      isLocked: true,
    });

    await expect(service.updateItineraryItem(trip.id, itemId, {
      expectedRevision: draft.revision,
      title: "Changed silently",
    })).rejects.toMatchObject({ status: 409, code: "ITEM_LOCKED" });

    const unlocked = await service.updateItineraryItem(trip.id, itemId, {
      expectedRevision: draft.revision,
      isLocked: false,
    });
    expect(unlocked.items[0]!.isLocked).toBe(false);
  });

  it("rejects stale draft revisions without changing the draft", async () => {
    const { service, trip } = await setup();
    await service.getDraft(trip.id);
    await service.addItineraryItem(trip.id, { expectedRevision: 1, ...activity });

    await expect(service.addItineraryItem(trip.id, {
      expectedRevision: 1,
      ...activity,
      title: "Stale activity",
    })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    expect((await service.getDraft(trip.id)).items).toHaveLength(1);
  });

  it("validates a partial time update against the existing item", async () => {
    const { service, trip } = await setup();
    await service.getDraft(trip.id);
    const draft = await service.addItineraryItem(trip.id, { expectedRevision: 1, ...activity });

    await expect(service.updateItineraryItem(trip.id, draft.items[0]!.id, {
      expectedRevision: 2,
      localStartTime: "12:00",
    })).rejects.toMatchObject({ code: "INVALID_TIME_RANGE" });
  });

  it("calculates quote totals on the server", async () => {
    const { service, trip } = await setup();
    const quote = await service.getQuote(trip.id);
    const updated = await service.addQuoteItem(trip.id, {
      expectedRevision: quote.revision,
      name: "Khách sạn",
      category: "HOTEL",
      unit: "phòng/đêm",
      quantity: 8,
      unitPriceMinor: 2_500_000,
    });

    expect(updated).toMatchObject({
      revision: 2,
      status: "COMPLETE",
      totalAmountMinor: 20_000_000,
    });
    expect(updated.items[0]).toMatchObject({ amountMinor: 20_000_000 });
  });

  it("rejects quote arithmetic outside the safe integer range", async () => {
    const { service, trip } = await setup();
    const quote = await service.getQuote(trip.id);

    await expect(service.addQuoteItem(trip.id, {
      expectedRevision: quote.revision,
      name: "Oversized",
      category: "OTHER",
      unit: "gói",
      quantity: Number.MAX_SAFE_INTEGER,
      unitPriceMinor: 2,
    })).rejects.toMatchObject({ code: "AMOUNT_OVERFLOW" });
  });

  it("validates quote overflow when only quantity changes", async () => {
    const { service, trip } = await setup();
    await service.getQuote(trip.id);
    const quote = await service.addQuoteItem(trip.id, {
      expectedRevision: 1,
      name: "Transfer",
      category: "TRANSPORT",
      unit: "gói",
      quantity: 1,
      unitPriceMinor: 2,
    });

    await expect(service.updateQuoteItem(trip.id, quote.items[0]!.id, {
      expectedRevision: 2,
      quantity: Number.MAX_SAFE_INTEGER,
    })).rejects.toMatchObject({ code: "AMOUNT_OVERFLOW" });
  });

  it("rejects aggregate quote totals outside the safe integer range", async () => {
    const { service, trip } = await setup();
    await service.getQuote(trip.id);
    await service.addQuoteItem(trip.id, {
      expectedRevision: 1,
      name: "Large one",
      category: "OTHER",
      unit: "gói",
      quantity: 1,
      unitPriceMinor: Number.MAX_SAFE_INTEGER,
    });

    await expect(service.addQuoteItem(trip.id, {
      expectedRevision: 2,
      name: "One more",
      category: "OTHER",
      unit: "gói",
      quantity: 1,
      unitPriceMinor: 1,
    })).rejects.toMatchObject({ code: "AMOUNT_OVERFLOW" });
  });

  it("adds a linked itinerary item and estimated quote only from a suitable persisted source", async () => {
    const { service, trip, externalSources } = await setup();
    const [source] = await externalSources.persistSearchResults(trip.id, [{
      resultKey: "lotte", name: "Lotte World", title: "Official tickets", url: "https://example.com/lotte", canonicalUrl: "https://example.com/lotte",
      publisher: "Lotte World", domain: "example.com", excerpt: "Adult ticket VND 900,000", amountMinor: 900_000, currency: "VND", pricingUnit: "person", audience: "adult",
      retrievedAt: "2026-10-27T00:00:00Z", suitable: true, constraints: [], confidence: 0.85, stale: false, verificationStatus: "UNVERIFIED", conflicts: [], openingHours: [{ day: "MONDAY", opens: "09:00", closes: "18:00" }],
    }]);
    await service.getDraft(trip.id); await service.getQuote(trip.id);

    const result = await service.addPlaceFromExternalSource(trip.id, {
      externalSourceId: source!.id, dayIndex: 1, localStartTime: "10:00", localEndTime: "14:00", timezone: "Asia/Seoul", quantity: 2,
    });

    expect(result.draft.items[0]).toMatchObject({ title: "Lotte World", externalSourceId: source!.id });
    expect(result.quote.items[0]).toMatchObject({ sourceType: "EXTERNAL", externalSourceId: source!.id, quantity: 2, unitPriceMinor: 900_000, amountMinor: 1_800_000, sourceStatus: "UNVERIFIED" });
    expect(result.quote.items[0]?.termsSnapshot).toContain("https://example.com/lotte");
  });

  it("keeps a public source link when the consultant enters a different estimated price", async () => {
    const { service, trip, externalSources } = await setup();
    const [source] = await externalSources.persistSearchResults(trip.id, [{
      resultKey: "museum", name: "Seoul Museum", title: "Ticket prices", url: "https://example.com/museum", canonicalUrl: "https://example.com/museum",
      publisher: "Seoul Museum", domain: "example.com", excerpt: "Ticket VND 50,000", amountMinor: 50_000, currency: "VND", pricingUnit: "ticket", audience: "all",
      retrievedAt: "2026-10-27T00:00:00Z", suitable: true, constraints: [], confidence: 0.85, stale: false, verificationStatus: "UNVERIFIED", conflicts: [], openingHours: [{ day: "MONDAY", opens: "09:00", closes: "18:00" }],
    }]);
    await service.getDraft(trip.id); await service.getQuote(trip.id);

    const result = await service.addPlaceFromExternalSource(trip.id, {
      externalSourceId: source!.id, dayIndex: 1, localStartTime: "10:00", localEndTime: "11:00", timezone: "Asia/Seoul", quantity: 3, unitPriceMinor: 60_000,
    });

    expect(result.quote.items[0]).toMatchObject({
      externalSourceId: source!.id, quantity: 3, unitPriceMinor: 60_000, amountMinor: 180_000,
      sourceUnitPriceMinor: 50_000, sourceType: "EXTERNAL", priceStatus: "PRICE_OVERRIDDEN",
    });
  });

  it("rejects unsuitable, foreign-currency, and duplicate external-source selections", async () => {
    const { service, trip, externalSources } = await setup();
    const [source] = await externalSources.persistSearchResults(trip.id, [{
      resultKey: "closed", name: "Closed Place", title: "Notice", url: "https://example.com/closed", canonicalUrl: "https://example.com/closed",
      publisher: "Official", domain: "example.com", excerpt: "Closed", amountMinor: 10, currency: "USD", pricingUnit: "ticket", audience: "adult",
      retrievedAt: "2026-10-27T00:00:00Z", suitable: false, constraints: ["Known closed date"], confidence: 0.8, stale: false, verificationStatus: "UNVERIFIED", conflicts: [],
    }]);
    await service.getDraft(trip.id); await service.getQuote(trip.id);

    await expect(service.addPlaceFromExternalSource(trip.id, { externalSourceId: source!.id, dayIndex: 1, localStartTime: "10:00", localEndTime: "11:00", timezone: "Asia/Seoul", quantity: 1 }))
      .rejects.toMatchObject({ code: "EXTERNAL_SOURCE_NOT_SELECTABLE" });
  });
});
