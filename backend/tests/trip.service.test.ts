import { describe, expect, it } from "vitest";

import { InMemoryTripRepository } from "../src/modules/trips/infrastructure/in-memory-trip.repository.js";
import { TripService } from "../src/modules/trips/trip.service.js";

const createInput = {
  title: "Seoul — Hành trình gia đình",
  customerName: "Gia đình anh Minh",
  origin: "Ho Chi Minh City",
  destination: "Seoul",
  startDate: "2027-04-05",
  endDate: "2027-04-09",
  travelers: 6,
  budgetAmountMinor: 120_000_000,
  budgetCurrency: "VND",
} as const;

function createService() {
  return new TripService(new InMemoryTripRepository(), {
    createId: () => "5a987ac1-2658-4f8a-9b42-fcc925f3c419",
    now: () => new Date("2026-10-27T03:00:00.000Z"),
  });
}

describe("TripService", () => {
  it("creates a draft trip with revision one", async () => {
    const trip = await createService().create(createInput);

    expect(trip).toMatchObject({
      ...createInput,
      id: "5a987ac1-2658-4f8a-9b42-fcc925f3c419",
      status: "DRAFT",
      revision: 1,
    });
  });

  it("rejects an end date before the start date", async () => {
    const service = createService();

    await expect(service.create({
      ...createInput,
      startDate: "2027-04-09",
      endDate: "2027-04-05",
    })).rejects.toMatchObject({
      status: 422,
      code: "INVALID_DATE_RANGE",
    });
  });

  it("does not call persistence when the date range is invalid", async () => {
    const repository = new InMemoryTripRepository();
    let createCalls = 0;
    const originalCreate = repository.create.bind(repository);
    repository.create = async (trip) => {
      createCalls += 1;
      return originalCreate(trip);
    };
    const service = new TripService(repository);

    await expect(service.create({
      ...createInput,
      startDate: "2027-04-09",
      endDate: "2027-04-05",
    })).rejects.toMatchObject({ code: "INVALID_DATE_RANGE" });
    expect(createCalls).toBe(0);
  });

  it("returns not found when a trip does not exist", async () => {
    await expect(createService().get("c372a645-27d8-4c38-b75f-f838d62f6093"))
      .rejects.toMatchObject({ status: 404, code: "TRIP_NOT_FOUND" });
  });

  it("prevents a stale update from overwriting a trip", async () => {
    const service = createService();
    const trip = await service.create(createInput);
    await service.update(trip.id, { expectedRevision: 1, title: "First update" });

    await expect(service.update(trip.id, {
      expectedRevision: 1,
      title: "Stale update",
    })).rejects.toMatchObject({
      status: 409,
      code: "REVISION_CONFLICT",
      details: { currentRevision: 2 },
    });
  });

  it("reports a stale revision before validating changes against newer data", async () => {
    const service = createService();
    const trip = await service.create(createInput);
    await service.update(trip.id, { expectedRevision: 1, endDate: "2027-04-06" });

    await expect(service.update(trip.id, {
      expectedRevision: 1,
      startDate: "2027-04-08",
    })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
  });

  it("rejects a cursor whose id is not a UUID", async () => {
    const cursor = Buffer.from(JSON.stringify({
      updatedAt: "2026-10-27T03:00:00.000Z",
      id: "not-a-uuid",
    })).toString("base64url");

    await expect(createService().list({ cursor })).rejects.toMatchObject({
      status: 422,
      code: "INVALID_CURSOR",
    });
  });

  it("lists trips in stable descending order with a cursor", async () => {
    const repository = new InMemoryTripRepository();
    let nextId = 0;
    let nextSecond = 0;
    const service = new TripService(repository, {
      createId: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
      now: () => new Date(`2026-10-27T03:00:${String(nextSecond++).padStart(2, "0")}.000Z`),
    });
    await service.create({ ...createInput, title: "Older" });
    await service.create({ ...createInput, title: "Newer" });

    const firstPage = await service.list({ pageSize: 1 });
    const secondPage = await service.list({ pageSize: 1, cursor: firstPage.nextCursor! });

    expect(firstPage.data.map((trip) => trip.title)).toEqual(["Newer"]);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(secondPage.data.map((trip) => trip.title)).toEqual(["Older"]);
    expect(secondPage.nextCursor).toBeNull();
  });
});
