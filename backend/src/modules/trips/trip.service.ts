import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ApiError } from "../../shared/http/api-error.js";
import type { TripRepository } from "./trip.repository.js";
import type {
  CreateTripInput,
  ListTripsInput,
  Trip,
  TripCursor,
  TripPage,
  UpdateTripInput,
} from "./trip.types.js";

interface TripServiceDependencies {
  createId: () => string;
  now: () => Date;
}

const defaultDependencies: TripServiceDependencies = {
  createId: randomUUID,
  now: () => new Date(),
};

function ensureValidDateRange(startDate: string, endDate: string): void {
  if (endDate < startDate) {
    throw new ApiError(422, "INVALID_DATE_RANGE", "endDate must be on or after startDate");
  }
}

function encodeCursor(trip: Trip): string {
  return Buffer.from(JSON.stringify({
    updatedAt: trip.updatedAt.toISOString(),
    id: trip.id,
  } satisfies TripCursor)).toString("base64url");
}

function decodeCursor(cursor: string): TripCursor {
  try {
    return z.object({
      updatedAt: z.iso.datetime(),
      id: z.uuid(),
    }).strict().parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new ApiError(422, "INVALID_CURSOR", "The pagination cursor is invalid");
  }
}

export class TripService {
  constructor(
    private readonly repository: TripRepository,
    private readonly dependencies: TripServiceDependencies = defaultDependencies,
  ) {}

  async create(input: CreateTripInput): Promise<Trip> {
    ensureValidDateRange(input.startDate, input.endDate);
    const now = this.dependencies.now();
    return this.repository.create({
      ...input,
      adultCount: input.adultCount ?? input.travelers,
      childCount: input.childCount ?? 0,
      customerRequest: input.customerRequest ?? null,
      planningStarted: input.planningStarted ?? false,
      id: this.dependencies.createId(),
      status: "DRAFT",
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(id: string): Promise<Trip> {
    const trip = await this.repository.findById(id);
    if (!trip) throw new ApiError(404, "TRIP_NOT_FOUND", "Trip not found");
    return trip;
  }

  async list(input: ListTripsInput): Promise<TripPage> {
    const pageSize = input.pageSize ?? 20;
    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
    const rows = await this.repository.list({
      ...(input.q === undefined ? {} : { q: input.q }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(cursor === undefined ? {} : { cursor }),
      limit: pageSize + 1,
    });
    const hasNextPage = rows.length > pageSize;
    const data = rows.slice(0, pageSize);
    const lastTrip = data.at(-1);
    return {
      data,
      nextCursor: hasNextPage && lastTrip ? encodeCursor(lastTrip) : null,
    };
  }

  async update(id: string, input: UpdateTripInput): Promise<Trip> {
    const current = await this.repository.findById(id);
    if (!current) throw new ApiError(404, "TRIP_NOT_FOUND", "Trip not found");

    const { expectedRevision, ...changes } = input;
    if (current.revision !== expectedRevision) {
      throw new ApiError(409, "REVISION_CONFLICT", "Trip has changed", {
        currentRevision: current.revision,
      });
    }
    ensureValidDateRange(changes.startDate ?? current.startDate, changes.endDate ?? current.endDate);
    const result = await this.repository.updateIfRevision(
      id,
      expectedRevision,
      changes,
      this.dependencies.now(),
    );

    if (result.kind === "notFound") {
      throw new ApiError(404, "TRIP_NOT_FOUND", "Trip not found");
    }
    if (result.kind === "conflict") {
      throw new ApiError(409, "REVISION_CONFLICT", "Trip has changed", {
        currentRevision: result.currentRevision,
      });
    }
    return result.trip;
  }
}
