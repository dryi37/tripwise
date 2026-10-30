import type { Prisma, PrismaClient } from "../../../generated/prisma/client.js";
import type { PlanSnapshot, PlanVersion, PlanVersionRepository } from "../version.types.js";
const row = (value: { id: string; tripId: string; name: string; revision: number; snapshot: unknown; createdAt: Date }): PlanVersion => ({ ...value, snapshot: value.snapshot as PlanSnapshot });
export class PrismaVersionRepository implements PlanVersionRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async list(tripId: string, skip: number, take: number) { const [rows, total] = await this.prisma.$transaction([this.prisma.planVersion.findMany({ where: { tripId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }), this.prisma.planVersion.count({ where: { tripId } })]); return { rows: rows.map(row), total }; }
  async create(value: PlanVersion) { return row(await this.prisma.planVersion.create({ data: { ...value, snapshot: value.snapshot as unknown as Prisma.InputJsonValue } })); }
  async findById(tripId: string, id: string) { const value = await this.prisma.planVersion.findFirst({ where: { id, tripId } }); return value ? row(value) : null; }
  async restore(tripId: string, snapshot: PlanSnapshot, expectedRevision: number, expectedDraftRevision: number, expectedQuoteRevision: number, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.trip.findUnique({ where: { id: tripId }, select: { revision: true, itineraryDraft: { select: { revision: true } }, quote: { select: { revision: true } } } });
      if (!current) return { kind: "notFound" } as const;
      if (current.revision !== expectedRevision || (current.itineraryDraft?.revision ?? 1) !== expectedDraftRevision || (current.quote?.revision ?? 1) !== expectedQuoteRevision) return { kind: "conflict", currentRevision: current.revision } as const;
      const claimed = await tx.trip.updateMany({ where: { id: tripId, revision: expectedRevision }, data: { revision: { increment: 1 }, title: snapshot.trip.title, customerName: snapshot.trip.customerName, origin: snapshot.trip.origin, destination: snapshot.trip.destination, startDate: new Date(`${snapshot.trip.startDate}T00:00:00Z`), endDate: new Date(`${snapshot.trip.endDate}T00:00:00Z`), travelers: snapshot.trip.travelers, adultCount: snapshot.trip.adultCount, childCount: snapshot.trip.childCount, customerRequest: snapshot.trip.customerRequest, planningStarted: snapshot.trip.planningStarted, budgetAmountMinor: BigInt(snapshot.trip.budgetAmountMinor), budgetCurrency: snapshot.trip.budgetCurrency, status: snapshot.trip.status, updatedAt: now } });
      if (claimed.count !== 1) { const latest = await tx.trip.findUnique({ where: { id: tripId }, select: { revision: true } }); return latest ? { kind: "conflict", currentRevision: latest.revision } as const : { kind: "notFound" } as const; }
      const draft = await tx.itineraryDraft.upsert({ where: { tripId }, create: { id: snapshot.draft.id, tripId, revision: snapshot.draft.revision + 1, updatedAt: now }, update: { revision: { increment: 1 }, updatedAt: now } });
      await tx.itineraryItem.deleteMany({ where: { draftId: draft.id } });
      if (snapshot.draft.items.length) await tx.itineraryItem.createMany({ data: snapshot.draft.items.map((item) => {
        const legacy = item as typeof item & { googlePlaceId?: string | null };
        const { googlePlaceId: _legacyGooglePlaceId, ...authored } = legacy;
        return {
          ...authored,
          selectionReason: item.selectionReason ?? null,
          placeProvider: item.placeProvider ?? (legacy.googlePlaceId ? "GOOGLE_LEGACY" : null),
          placeId: item.placeId ?? legacy.googlePlaceId ?? null,
          placeName: item.placeName ?? null,
          placeAddress: item.placeAddress ?? null,
          placeLatitude: item.placeLatitude ?? null,
          placeLongitude: item.placeLongitude ?? null,
          sourceUrl: item.sourceUrl ?? null,
          draftId: draft.id,
        };
      }) });
      const quote = await tx.quote.upsert({ where: { tripId }, create: { id: snapshot.quote.id, tripId, currency: snapshot.quote.currency, revision: snapshot.quote.revision + 1, totalAmountMinor: BigInt(snapshot.quote.totalAmountMinor), status: snapshot.quote.status, updatedAt: now }, update: { currency: snapshot.quote.currency, revision: { increment: 1 }, totalAmountMinor: BigInt(snapshot.quote.totalAmountMinor), status: snapshot.quote.status, updatedAt: now } });
      await tx.quoteItem.deleteMany({ where: { quoteId: quote.id } });
      if (snapshot.quote.items.length) await tx.quoteItem.createMany({ data: snapshot.quote.items.map((item) => ({ ...item, quoteId: quote.id, unitPriceMinor: BigInt(item.unitPriceMinor ?? 0), amountMinor: BigInt(item.amountMinor ?? 0), sourceUnitPriceMinor: item.sourceUnitPriceMinor == null ? null : BigInt(item.sourceUnitPriceMinor), validUntilSnapshot: item.validUntilSnapshot ? new Date(`${item.validUntilSnapshot}T00:00:00Z`) : null })) });
      return { kind: "updated", value: { ...snapshot, trip: { ...snapshot.trip, revision: expectedRevision + 1, updatedAt: now }, draft: { ...snapshot.draft, revision: draft.revision, updatedAt: now }, quote: { ...snapshot.quote, revision: quote.revision, updatedAt: now } } } as const;
    });
  }
}
