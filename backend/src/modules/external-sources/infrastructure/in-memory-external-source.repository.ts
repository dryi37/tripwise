import type { ExternalSourceRepository } from "../external-source.repository.js";
import type { ExternalSource, NewExternalSource } from "../external-source.types.js";

export class InMemoryExternalSourceRepository implements ExternalSourceRepository {
  private readonly values = new Map<string, ExternalSource>();
  async upsert(source: NewExternalSource, now: Date): Promise<ExternalSource> {
    const existing = [...this.values.values()].find((value) => value.tripId === source.tripId && value.canonicalUrl === source.canonicalUrl);
    if (existing) return structuredClone(existing);
    const value = { ...source, createdAt: now };
    this.values.set(value.id, value);
    return structuredClone(value);
  }
  async findById(id: string) { const value = this.values.get(id); return value ? structuredClone(value) : null; }
  async listByTrip(tripId: string) { return [...this.values.values()].filter((value) => value.tripId === tripId).map((value) => structuredClone(value)); }
}
