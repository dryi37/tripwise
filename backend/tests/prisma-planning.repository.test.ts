import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPlanningRepository } from "../src/modules/planning/infrastructure/prisma-planning.repository.js";

describe("PrismaPlanningRepository concurrency", () => {
  it("returns a revision conflict before inserting when another writer wins the claim", async () => {
    let createCalls = 0;
    const transaction = {
      itineraryDraft: {
        findUnique: async () => ({
          id: "00000000-0000-4000-8000-000000000001",
          tripId: "00000000-0000-4000-8000-000000000002",
          revision: 1,
          updatedAt: new Date(),
        }),
        updateMany: async () => ({ count: 0 }),
      },
      itineraryItem: {
        create: async () => { createCalls += 1; },
      },
    };
    const prisma = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    } as unknown as PrismaClient;
    const repository = new PrismaPlanningRepository(prisma);

    const result = await repository.addItineraryItem(
      "00000000-0000-4000-8000-000000000002",
      1,
      {
        id: "00000000-0000-4000-8000-000000000003",
        dayIndex: 1,
        title: "Palace",
        location: "Seoul",
        localStartTime: "09:00",
        localEndTime: "10:00",
        timezone: "Asia/Seoul",
        description: "",
        isLocked: false,
      },
      new Date(),
    );

    expect(result).toEqual({ kind: "conflict", currentRevision: 1 });
    expect(createCalls).toBe(0);
  });
});
