import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { ExternalSourceRepository } from "../external-source.repository.js";
import type { ExternalSource, NewExternalSource } from "../external-source.types.js";

function map(row: any): ExternalSource {
  return { ...row, originalAmountMinor: Number(row.originalAmountMinor), evidence: row.evidence as Record<string, unknown> };
}

export class PrismaExternalSourceRepository implements ExternalSourceRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async upsert(source: NewExternalSource, now: Date): Promise<ExternalSource> {
    return map(await this.prisma.externalSource.upsert({ where: { tripId_canonicalUrl: { tripId: source.tripId, canonicalUrl: source.canonicalUrl } }, create: { ...source, originalAmountMinor: BigInt(source.originalAmountMinor), evidence: source.evidence as any, createdAt: now }, update: {}, }));
  }
  async findById(id: string) { const row = await this.prisma.externalSource.findUnique({ where: { id } }); return row ? map(row) : null; }
  async listByTrip(tripId: string) { return (await this.prisma.externalSource.findMany({ where: { tripId }, orderBy: [{ confidence: "desc" }, { createdAt: "desc" }] })).map(map); }
}
