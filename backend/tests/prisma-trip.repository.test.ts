import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client.js";
import {
  buildTripWhere,
  PrismaTripRepository,
} from "../src/modules/trips/infrastructure/prisma-trip.repository.js";

describe("PrismaTripRepository query mapping", () => {
  it("combines text search and cursor conditions without overwriting either filter", () => {
    const where = buildTripWhere({
      q: "Seoul",
      status: "DRAFT",
      cursor: {
        updatedAt: "2026-10-27T03:00:00.000Z",
        id: "5a987ac1-2658-4f8a-9b42-fcc925f3c419",
      },
      limit: 21,
    });

    expect(where.status).toBe("DRAFT");
    expect(where.AND).toHaveLength(2);
    expect(where.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({ OR: expect.any(Array) }),
      expect.objectContaining({ OR: expect.any(Array) }),
    ]));
  });

  it("escapes PostgreSQL LIKE wildcards in literal user search", () => {
    const where = buildTripWhere({ q: "%_\\", limit: 20 });
    const serialized = JSON.stringify(where);

    expect(serialized).toContain("\\\\%\\\\_\\\\\\\\");
  });

  it("returns the row from the atomic compare-and-update operation", async () => {
    const row = {
      id: "5a987ac1-2658-4f8a-9b42-fcc925f3c419",
      title: "Updated",
      customerName: "Gia đình anh Minh",
      origin: "Ho Chi Minh City",
      destination: "Seoul",
      startDate: new Date("2027-04-05T00:00:00.000Z"),
      endDate: new Date("2027-04-09T00:00:00.000Z"),
      travelers: 6,
      adultCount: 6,
      childCount: 0,
      customerRequest: null,
      planningStarted: false,
      budgetAmountMinor: 120_000_000n,
      budgetCurrency: "VND",
      status: "DRAFT" as const,
      revision: 2,
      createdAt: new Date("2026-10-27T03:00:00.000Z"),
      updatedAt: new Date("2026-10-27T03:01:00.000Z"),
    };
    let updateCalls = 0;
    const prisma = {
      trip: {
        update: async () => {
          updateCalls += 1;
          return row;
        },
        findUnique: async () => null,
      },
    } as unknown as PrismaClient;
    const repository = new PrismaTripRepository(prisma);

    const result = await repository.updateIfRevision(
      row.id,
      1,
      { title: "Updated" },
      row.updatedAt,
    );

    expect(updateCalls).toBe(1);
    expect(result).toEqual({
      kind: "updated",
      trip: expect.objectContaining({ title: "Updated", revision: 2 }),
    });
  });

  it("maps local dates and integer minor units when creating a trip", async () => {
    let receivedData: Record<string, unknown> | undefined;
    const row = {
      id: "5a987ac1-2658-4f8a-9b42-fcc925f3c419",
      title: "Seoul",
      customerName: "Gia đình anh Minh",
      origin: "Ho Chi Minh City",
      destination: "Seoul",
      startDate: new Date("2027-04-05T00:00:00.000Z"),
      endDate: new Date("2027-04-09T00:00:00.000Z"),
      travelers: 6,
      adultCount: 6,
      childCount: 0,
      customerRequest: null,
      planningStarted: false,
      budgetAmountMinor: 120_000_000n,
      budgetCurrency: "VND",
      status: "DRAFT" as const,
      revision: 1,
      createdAt: new Date("2026-10-27T03:00:00.000Z"),
      updatedAt: new Date("2026-10-27T03:00:00.000Z"),
    };
    const prisma = {
      trip: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          receivedData = data;
          return row;
        },
      },
    } as unknown as PrismaClient;
    const repository = new PrismaTripRepository(prisma);

    const created = await repository.create({
      ...row,
      startDate: "2027-04-05",
      endDate: "2027-04-09",
      budgetAmountMinor: 120_000_000,
    });

    expect(receivedData).toMatchObject({
      startDate: new Date("2027-04-05T00:00:00.000Z"),
      endDate: new Date("2027-04-09T00:00:00.000Z"),
      budgetAmountMinor: 120_000_000n,
    });
    expect(created).toMatchObject({
      startDate: "2027-04-05",
      endDate: "2027-04-09",
      budgetAmountMinor: 120_000_000,
    });
  });
});
