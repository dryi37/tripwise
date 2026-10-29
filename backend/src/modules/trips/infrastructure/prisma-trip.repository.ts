import { Prisma, type PrismaClient, type Trip as PrismaTrip } from "../../../generated/prisma/client.js";
import type { TripRepository, UpdateTripResult } from "../trip.repository.js";
import type { Trip, TripChanges, TripListQuery } from "../trip.types.js";

function toDatabaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toLocalDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDomain(row: PrismaTrip): Trip {
  const budgetAmountMinor = Number(row.budgetAmountMinor);
  if (!Number.isSafeInteger(budgetAmountMinor)) {
    throw new RangeError("Trip budget exceeds JavaScript safe integer range");
  }

  return {
    ...row,
    startDate: toLocalDate(row.startDate),
    endDate: toLocalDate(row.endDate),
    budgetAmountMinor,
  };
}

function toCreateData(trip: Trip): Prisma.TripCreateInput {
  return {
    ...trip,
    startDate: toDatabaseDate(trip.startDate),
    endDate: toDatabaseDate(trip.endDate),
    budgetAmountMinor: BigInt(trip.budgetAmountMinor),
  };
}

function toUpdateData(changes: TripChanges, updatedAt: Date): Prisma.TripUpdateManyMutationInput {
  return {
    ...changes,
    ...(changes.startDate === undefined ? {} : { startDate: toDatabaseDate(changes.startDate) }),
    ...(changes.endDate === undefined ? {} : { endDate: toDatabaseDate(changes.endDate) }),
    ...(changes.budgetAmountMinor === undefined
      ? {}
      : { budgetAmountMinor: BigInt(changes.budgetAmountMinor) }),
    revision: { increment: 1 },
    updatedAt,
  };
}

export function buildTripWhere(query: TripListQuery): Prisma.TripWhereInput {
  const conditions: Prisma.TripWhereInput[] = [];

  if (query.q !== undefined) {
    const literalQuery = query.q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    conditions.push({
      OR: ["title", "customerName", "destination"].map((field) => ({
        [field]: { contains: literalQuery, mode: "insensitive" },
      })),
    });
  }
  if (query.cursor !== undefined) {
    conditions.push({
      OR: [
        { updatedAt: { lt: new Date(query.cursor.updatedAt) } },
        { updatedAt: new Date(query.cursor.updatedAt), id: { lt: query.cursor.id } },
      ],
    });
  }

  return {
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(conditions.length === 0 ? {} : { AND: conditions }),
  };
}

export class PrismaTripRepository implements TripRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(trip: Trip): Promise<Trip> {
    return toDomain(await this.prisma.trip.create({ data: toCreateData(trip) }));
  }

  async findById(id: string): Promise<Trip | null> {
    const row = await this.prisma.trip.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async list(query: TripListQuery): Promise<Trip[]> {
    const rows = await this.prisma.trip.findMany({
      where: buildTripWhere(query),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit,
    });
    return rows.map(toDomain);
  }

  async updateIfRevision(
    id: string,
    expectedRevision: number,
    changes: TripChanges,
    updatedAt: Date,
  ): Promise<UpdateTripResult> {
    try {
      const row = await this.prisma.trip.update({
        where: { id, revision: expectedRevision },
        data: toUpdateData(changes, updatedAt),
      });
      return { kind: "updated", trip: toDomain(row) };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2025") {
        throw error;
      }
    }

    const current = await this.prisma.trip.findUnique({
      where: { id },
      select: { revision: true },
    });
    return current
      ? { kind: "conflict", currentRevision: current.revision }
      : { kind: "notFound" };
  }
}
