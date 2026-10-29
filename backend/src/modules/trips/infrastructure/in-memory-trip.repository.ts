import type { TripRepository, UpdateTripResult } from "../trip.repository.js";
import type { Trip, TripChanges, TripListQuery } from "../trip.types.js";

function copyTrip(trip: Trip): Trip {
  return { ...trip, createdAt: new Date(trip.createdAt), updatedAt: new Date(trip.updatedAt) };
}

export class InMemoryTripRepository implements TripRepository {
  private readonly trips = new Map<string, Trip>();

  async create(trip: Trip): Promise<Trip> {
    this.trips.set(trip.id, copyTrip(trip));
    return copyTrip(trip);
  }

  async findById(id: string): Promise<Trip | null> {
    const trip = this.trips.get(id);
    return trip ? copyTrip(trip) : null;
  }

  async list(query: TripListQuery): Promise<Trip[]> {
    const normalizedQuery = query.q?.trim().toLocaleLowerCase("vi") ?? "";
    return [...this.trips.values()]
      .filter((trip) => !query.status || trip.status === query.status)
      .filter((trip) => !normalizedQuery || [trip.title, trip.customerName, trip.destination]
        .some((value) => value.toLocaleLowerCase("vi").includes(normalizedQuery)))
      .filter((trip) => {
        if (!query.cursor) return true;
        const timeDifference = trip.updatedAt.getTime() - new Date(query.cursor.updatedAt).getTime();
        return timeDifference < 0 || (timeDifference === 0 && trip.id < query.cursor.id);
      })
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
        || right.id.localeCompare(left.id))
      .slice(0, query.limit)
      .map(copyTrip);
  }

  async updateIfRevision(
    id: string,
    expectedRevision: number,
    changes: TripChanges,
    updatedAt: Date,
  ): Promise<UpdateTripResult> {
    const current = this.trips.get(id);
    if (!current) return { kind: "notFound" };
    if (current.revision !== expectedRevision) {
      return { kind: "conflict", currentRevision: current.revision };
    }

    const updated: Trip = {
      ...current,
      ...changes,
      revision: current.revision + 1,
      updatedAt,
    };
    this.trips.set(id, updated);
    return { kind: "updated", trip: copyTrip(updated) };
  }
}
