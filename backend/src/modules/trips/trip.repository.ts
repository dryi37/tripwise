import type { Trip, TripChanges, TripListQuery } from "./trip.types.js";

export type UpdateTripResult =
  | { kind: "updated"; trip: Trip }
  | { kind: "notFound" }
  | { kind: "conflict"; currentRevision: number };

export interface TripRepository {
  create(trip: Trip): Promise<Trip>;
  findById(id: string): Promise<Trip | null>;
  list(query: TripListQuery): Promise<Trip[]>;
  updateIfRevision(
    id: string,
    expectedRevision: number,
    changes: TripChanges,
    updatedAt: Date,
  ): Promise<UpdateTripResult>;
}
