import { randomUUID } from "node:crypto";
import { ApiError } from "../../shared/http/api-error.js";
import type { PlanningService } from "../planning/planning.service.js";
import type { TripService } from "../trips/trip.service.js";
import type { PlanSnapshot, PlanVersionRepository } from "./version.types.js";
interface Dependencies { createId: () => string; now: () => Date }
const defaults: Dependencies = { createId: randomUUID, now: () => new Date() };
export class VersionService {
  constructor(private readonly repository: PlanVersionRepository, private readonly trips: TripService, private readonly planning: PlanningService, private readonly dependencies: Dependencies = defaults) {}
  async list(tripId: string, page: number, pageSize: number) {
    await this.trips.get(tripId);
    const { rows, total } = await this.repository.list(tripId, (page - 1) * pageSize, pageSize);
    return { data: rows.map(({ snapshot, ...row }) => ({
      ...row,
      activityCount: snapshot.draft.items.length,
      quoteTotalMinor: snapshot.quote.items.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0),
    })), pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) } };
  }
  async create(tripId: string, name: string, expectedRevision: number) {
    const trip = await this.trips.get(tripId);
    if (trip.revision !== expectedRevision) throw new ApiError(409, "REVISION_CONFLICT", "Trip has changed", { currentRevision: trip.revision });
    const snapshot: PlanSnapshot = { trip, draft: await this.planning.getDraft(tripId), quote: await this.planning.getQuote(tripId) };
    const saved = await this.repository.create({ id: this.dependencies.createId(), tripId, name, revision: trip.revision, snapshot: JSON.parse(JSON.stringify(snapshot)) as PlanSnapshot, createdAt: this.dependencies.now() });
    const { snapshot: _snapshot, ...metadata } = saved;
    return metadata;
  }
  async restore(tripId: string, versionId: string, expectedRevision: number, expectedDraftRevision: number, expectedQuoteRevision: number) {
    const version = await this.repository.findById(tripId, versionId);
    if (!version) throw new ApiError(404, "VERSION_NOT_FOUND", "Plan version not found");
    const result = await this.repository.restore(tripId, version.snapshot, expectedRevision, expectedDraftRevision, expectedQuoteRevision, this.dependencies.now());
    if (result.kind === "conflict") throw new ApiError(409, "REVISION_CONFLICT", "Trip has changed", { currentRevision: result.currentRevision });
    if (result.kind === "notFound") throw new ApiError(404, "TRIP_NOT_FOUND", "Trip not found");
    return result.value;
  }
}
