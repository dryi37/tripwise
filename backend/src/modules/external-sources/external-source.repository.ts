import type { ExternalSource, NewExternalSource } from "./external-source.types.js";

export interface ExternalSourceRepository {
  upsert(source: NewExternalSource, now: Date): Promise<ExternalSource>;
  findById(id: string): Promise<ExternalSource | null>;
  listByTrip(tripId: string): Promise<ExternalSource[]>;
}
