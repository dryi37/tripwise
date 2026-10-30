import type {
  ItineraryDraft as DbDraft,
  ItineraryItem as DbItineraryItem,
  Prisma,
  PrismaClient,
  Quote as DbQuote,
  QuoteItem as DbQuoteItem,
} from "../../../generated/prisma/client.js";
import type { PlanningRepository } from "../planning.repository.js";
import type {
  ItineraryDraft,
  ItineraryItem,
  ItineraryItemChanges,
  NewQuoteItem,
  PlanningMutationResult,
  Quote,
  QuoteItem,
  QuoteItemChanges,
} from "../planning.types.js";

type DraftRow = DbDraft & { items: DbItineraryItem[] };
type QuoteRow = DbQuote & { items: DbQuoteItem[] };

function safe(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new RangeError("Monetary value exceeds JavaScript safe integer range");
  return number;
}

const itineraryItem = (row: DbItineraryItem): ItineraryItem => ({
  id: row.id,
  dayIndex: row.dayIndex,
  title: row.title,
  localStartTime: row.localStartTime,
  localEndTime: row.localEndTime,
  timezone: row.timezone,
  description: row.description,
  selectionReason: row.selectionReason,
  placeProvider: row.placeProvider,
  placeId: row.placeId,
  placeName: row.placeName,
  placeAddress: row.placeAddress,
  placeLatitude: row.placeLatitude,
  placeLongitude: row.placeLongitude,
  sourceUrl: row.sourceUrl,
  isLocked: row.isLocked,
  externalSourceId: row.externalSourceId,
  supplierOfferId: row.supplierOfferId,
});

const draft = (row: DraftRow): ItineraryDraft => ({
  id: row.id,
  tripId: row.tripId,
  revision: row.revision,
  updatedAt: row.updatedAt,
  items: row.items.map(itineraryItem),
});

const quoteItem = (row: DbQuoteItem): QuoteItem => ({
  ...row,
  unitPriceMinor: row.priceStatus === "NEEDS_REVIEW" ? null : safe(row.unitPriceMinor),
  amountMinor: row.priceStatus === "NEEDS_REVIEW" ? null : safe(row.amountMinor),
  sourceUnitPriceMinor: row.sourceUnitPriceMinor === null ? null : safe(row.sourceUnitPriceMinor),
  validUntilSnapshot: row.validUntilSnapshot?.toISOString().slice(0, 10) ?? null,
});

const quote = (row: QuoteRow): Quote => ({
  id: row.id,
  tripId: row.tripId,
  currency: row.currency,
  status: row.status,
  revision: row.revision,
  updatedAt: row.updatedAt,
  totalAmountMinor: safe(row.totalAmountMinor),
  items: row.items.map(quoteItem),
});

export class PrismaPlanningRepository implements PlanningRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreateDraft(tripId: string, draftId: string, now: Date): Promise<ItineraryDraft> {
    return draft(await this.prisma.itineraryDraft.upsert({
      where: { tripId },
      create: { id: draftId, tripId, updatedAt: now },
      update: {},
      include: { items: { orderBy: [{ dayIndex: "asc" }, { localStartTime: "asc" }, { id: "asc" }] } },
    }));
  }

  async addItineraryItem(tripId: string, expectedRevision: number, item: ItineraryItem, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.itineraryDraft.findUnique({ where: { tripId } });
      if (!current) return { kind: "notFound" } as const;
      if (current.revision !== expectedRevision) return { kind: "conflict", currentRevision: current.revision } as const;
      const conflict = await this.claimDraft(tx, current.id, tripId, expectedRevision, now);
      if (conflict) return conflict;
      await tx.itineraryItem.create({ data: { ...item, selectionReason: item.selectionReason ?? null, placeProvider: item.placeProvider ?? null, placeId: item.placeId ?? null, placeName: item.placeName ?? null, placeAddress: item.placeAddress ?? null, placeLatitude: item.placeLatitude ?? null, placeLongitude: item.placeLongitude ?? null, sourceUrl: item.sourceUrl ?? null, draftId: current.id } });
      return { kind: "updated", value: draft(await this.readDraft(tx, current.id)) } as const;
    });
  }

  async updateItineraryItem(tripId: string, itemId: string, expectedRevision: number, changes: ItineraryItemChanges, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.itineraryDraft.findUnique({ where: { tripId }, include: { items: { where: { id: itemId } } } });
      if (!current) return { kind: "notFound" } as const;
      if (current.revision !== expectedRevision) return { kind: "conflict", currentRevision: current.revision } as const;
      if (!current.items[0]) return { kind: "notFound" } as const;
      const conflict = await this.claimDraft(tx, current.id, tripId, expectedRevision, now);
      if (conflict) return conflict;
      const data = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as Prisma.ItineraryItemUncheckedUpdateInput;
      await tx.itineraryItem.update({ where: { id: itemId }, data });
      return { kind: "updated", value: draft(await this.readDraft(tx, current.id)) } as const;
    });
  }

  async deleteItineraryItem(tripId: string, itemId: string, expectedRevision: number, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.itineraryDraft.findUnique({ where: { tripId }, include: { items: { where: { id: itemId } } } });
      if (!current) return { kind: "notFound" } as const;
      if (current.revision !== expectedRevision) return { kind: "conflict", currentRevision: current.revision } as const;
      if (!current.items[0]) return { kind: "notFound" } as const;
      const conflict = await this.claimDraft(tx, current.id, tripId, expectedRevision, now);
      if (conflict) return conflict;
      await tx.itineraryItem.delete({ where: { id: itemId } });
      return { kind: "updated", value: draft(await this.readDraft(tx, current.id)) } as const;
    });
  }

  private async claimDraft(tx: Prisma.TransactionClient, id: string, tripId: string, revision: number, now: Date) {
    const result = await tx.itineraryDraft.updateMany({
      where: { id, revision },
      data: { revision: { increment: 1 }, updatedAt: now },
    });
    if (result.count === 1) return null;
    const latest = await tx.itineraryDraft.findUnique({ where: { tripId }, select: { revision: true } });
    return latest
      ? { kind: "conflict", currentRevision: latest.revision } as const
      : { kind: "notFound" } as const;
  }

  private readDraft(tx: Prisma.TransactionClient, id: string): Promise<DraftRow> {
    return tx.itineraryDraft.findUniqueOrThrow({
      where: { id },
      include: { items: { orderBy: [{ dayIndex: "asc" }, { localStartTime: "asc" }, { id: "asc" }] } },
    });
  }

  async getOrCreateQuote(tripId: string, quoteId: string, currency: string, now: Date): Promise<Quote> {
    return quote(await this.prisma.quote.upsert({
      where: { tripId },
      create: { id: quoteId, tripId, currency, updatedAt: now },
      update: {},
      include: { items: { orderBy: { id: "asc" } } },
    }));
  }

  async addQuoteItem(tripId: string, expectedRevision: number, item: NewQuoteItem & { id: string; amountMinor: number | null }, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.quote.findUnique({ where: { tripId } });
      if (!current) return { kind: "notFound" } as const;
      if (current.revision !== expectedRevision) return { kind: "conflict", currentRevision: current.revision } as const;
      const conflict = await this.claimQuote(tx, current.id, tripId, expectedRevision, now);
      if (conflict) return conflict;
      await tx.quoteItem.create({ data: { ...item, quoteId: current.id, unitPriceMinor: BigInt(item.unitPriceMinor ?? 0), amountMinor: BigInt(item.amountMinor ?? 0), sourceUnitPriceMinor: item.sourceUnitPriceMinor === undefined || item.sourceUnitPriceMinor === null ? null : BigInt(item.sourceUnitPriceMinor), validUntilSnapshot: item.validUntilSnapshot ? new Date(`${item.validUntilSnapshot}T00:00:00Z`) : null } });
      return { kind: "updated", value: quote(await this.recalculateQuote(tx, current.id)) } as const;
    });
  }

  async updateQuoteItem(tripId: string, itemId: string, expectedRevision: number, changes: QuoteItemChanges, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.quote.findUnique({ where: { tripId }, include: { items: { where: { id: itemId } } } });
      const existing = current?.items[0];
      if (!current) return { kind: "notFound" } as const;
      if (current.revision !== expectedRevision) return { kind: "conflict", currentRevision: current.revision } as const;
      if (!existing) return { kind: "notFound" } as const;
      const conflict = await this.claimQuote(tx, current.id, tripId, expectedRevision, now);
      if (conflict) return conflict;
      const quantity = changes.quantity ?? existing.quantity;
      const unitPriceMinor = changes.unitPriceMinor ?? safe(existing.unitPriceMinor);
      await tx.quoteItem.update({ where: { id: itemId }, data: { ...changes, unitPriceMinor: BigInt(unitPriceMinor), amountMinor: BigInt(quantity * unitPriceMinor) } });
      return { kind: "updated", value: quote(await this.recalculateQuote(tx, current.id)) } as const;
    });
  }

  async deleteQuoteItem(tripId: string, itemId: string, expectedRevision: number, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.quote.findUnique({ where: { tripId }, include: { items: { where: { id: itemId } } } });
      if (!current) return { kind: "notFound" } as const;
      if (current.revision !== expectedRevision) return { kind: "conflict", currentRevision: current.revision } as const;
      if (!current.items[0]) return { kind: "notFound" } as const;
      const conflict = await this.claimQuote(tx, current.id, tripId, expectedRevision, now);
      if (conflict) return conflict;
      await tx.quoteItem.delete({ where: { id: itemId } });
      return { kind: "updated", value: quote(await this.recalculateQuote(tx, current.id)) } as const;
    });
  }

  private async claimQuote(tx: Prisma.TransactionClient, id: string, tripId: string, revision: number, now: Date) {
    const result = await tx.quote.updateMany({
      where: { id, revision },
      data: { revision: { increment: 1 }, updatedAt: now },
    });
    if (result.count === 1) return null;
    const latest = await tx.quote.findUnique({ where: { tripId }, select: { revision: true } });
    return latest
      ? { kind: "conflict", currentRevision: latest.revision } as const
      : { kind: "notFound" } as const;
  }

  private async recalculateQuote(tx: Prisma.TransactionClient, id: string): Promise<QuoteRow> {
    const aggregate = await tx.quoteItem.aggregate({ where: { quoteId: id }, _sum: { amountMinor: true }, _count: true });
    return tx.quote.update({
      where: { id },
      data: {
        totalAmountMinor: aggregate._sum.amountMinor ?? 0n,
        status: aggregate._count > 0 ? "COMPLETE" : "PARTIAL",
      },
      include: { items: { orderBy: { id: "asc" } } },
    });
  }
}
