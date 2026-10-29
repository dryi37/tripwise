import { randomUUID } from "node:crypto";
import { ApiError } from "../../shared/http/api-error.js";
import { agentLogger } from "../../shared/observability/agent-logger.js";
import type { CatalogOfferSearchIndex, CatalogOfferSearchRecord, CatalogRepository, CatalogServiceSearchResult, OfferWriteInput, ServiceRecord, ServiceWriteInput, SupplierOfferRecord } from "./catalog.types.js";

interface CatalogDependencies { createId: () => string; now: () => Date; searchResultsPerTool: number }
const defaultDependencies: Omit<CatalogDependencies, "searchResultsPerTool"> = { createId: randomUUID, now: () => new Date() };
const categoryTags: Record<string, string> = { "ăn uống": "FOOD", "lưu trú": "LODGING", "di chuyển": "TRANSPORT", "tham quan": "SIGHTSEEING", "khác": "OTHER" };
function matchesCategory(service: Pick<ServiceRecord, "category" | "tags">, category: string | undefined): boolean {
  if (!category) return true;
  const tag = categoryTags[category.toLocaleLowerCase("vi")] ?? category.toUpperCase();
  return service.category.toLocaleLowerCase("vi") === category.toLocaleLowerCase("vi") || service.tags?.includes(category) === true || service.tags?.includes(tag) === true;
}

export class CatalogService {
  private readonly dependencies: CatalogDependencies;

  constructor(
    private readonly repository: CatalogRepository,
    dependencies: Partial<CatalogDependencies> = {},
    private readonly searchIndex?: CatalogOfferSearchIndex,
  ) { this.dependencies = { ...defaultDependencies, ...dependencies } as CatalogDependencies; }

  async list(input: { q?: string | undefined; category?: string | undefined; status?: string | undefined; page: number; pageSize: number }) {
    const result = await this.repository.list({
      ...(input.q ? { q: input.q } : {}), ...(input.category ? { category: input.category } : {}), ...(input.status ? { status: input.status } : {}),
      activeOnly: true,
      skip: (input.page - 1) * input.pageSize, take: input.pageSize,
    });
    return { data: result.rows.map(({ offer, ...service }) => ({ ...service, offers: offer && offer.status !== "INACTIVE" ? [offer] : [] })), pagination: { page: input.page, pageSize: input.pageSize, totalItems: result.total, totalPages: Math.ceil(result.total / input.pageSize) } };
  }

  async createService(input: ServiceWriteInput): Promise<ServiceRecord> {
    const now = this.dependencies.now();
    return this.repository.createService({ id: this.dependencies.createId(), name: input.name, category: input.category, tags: input.tags ?? [], unit: input.unit, isActive: input.isActive ?? true, createdAt: now, updatedAt: now, offer: null });
  }

  async updateService(id: string, input: Partial<ServiceWriteInput>): Promise<ServiceRecord> {
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<ServiceRecord>;
    const updated = await this.repository.updateService(id, changes, this.dependencies.now());
    if (!updated) throw new ApiError(404, "SERVICE_NOT_FOUND", "Service not found");
    await this.refreshServiceIndex(id);
    return updated;
  }

  async addOffer(serviceId: string, input: OfferWriteInput): Promise<SupplierOfferRecord> {
    const service = await this.repository.findServiceById(serviceId);
    if (!service?.isActive) throw new ApiError(404, "SERVICE_NOT_FOUND", "Service not found");
    if (service.offer) throw new ApiError(409, "SERVICE_PRICE_EXISTS", "This service already has a price; update the existing price instead");
    const now = this.dependencies.now();
    let created: SupplierOfferRecord;
    try {
      created = await this.repository.createOffer({ id: this.dependencies.createId(), serviceId, unitPriceMinor: input.unitPriceMinor, currency: input.currency, validFrom: input.validFrom ?? null, validUntil: input.validUntil ?? null, details: input.details ?? null, status: input.status, createdAt: now, updatedAt: now });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ApiError(409, "SERVICE_PRICE_EXISTS", "This service already has a price; update the existing price instead");
      throw error;
    }
    await this.refreshOfferIndex(created.id);
    return created;
  }

  async updateOffer(serviceId: string, offerId: string, input: Partial<OfferWriteInput>): Promise<SupplierOfferRecord> {
    const current = await this.repository.findOfferById(offerId);
    if (!current || current.serviceId !== serviceId) throw new ApiError(404, "OFFER_NOT_FOUND", "Supplier offer not found");
    const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<SupplierOfferRecord>;
    const updated = await this.repository.updateOffer(offerId, changes, this.dependencies.now());
    if (!updated) throw new ApiError(404, "OFFER_NOT_FOUND", "Supplier offer not found");
    await this.refreshOfferIndex(offerId);
    return updated;
  }

  async searchForAgent(input: { query: string; category?: string | undefined }) {
    const limit = this.dependencies.searchResultsPerTool;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new ApiError(503, "CATALOG_SEARCH_NOT_CONFIGURED", "Catalog search result limit is not configured");
    let semantic: CatalogOfferSearchRecord[] = [];
    if (this.searchIndex) {
      try {
        const ids = await this.searchIndex.search(input.query, limit * 3);
        const current = await this.repository.getOfferSearchRecords({ offerIds: ids });
        const byId = new Map(current.filter((record) => record.service.isActive && record.offer.status === "VERIFIED").map((record) => [record.offer.id, record]));
        semantic = ids.flatMap((id) => { const record = byId.get(id); return record && matchesCategory(record.service, input.category) ? [record] : []; });
      } catch (error) {
        agentLogger.warn({ event: "catalog.embedding_search.failed", errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR" });
      }
    }

    const fallback = await this.repository.list({ q: input.query, activeOnly: true, skip: 0, take: limit * 3 });
    const groups = new Map<string, CatalogServiceSearchResult>();
    const add = (service: Pick<ServiceRecord, "id" | "name" | "category" | "tags" | "unit">, offer: SupplierOfferRecord) => {
      const existing = groups.get(service.id) ?? { ...service, tags: service.tags ?? [], offers: [] };
      if (!existing.offers.some((item) => item.id === offer.id)) existing.offers.push(offer);
      groups.set(service.id, existing);
    };
    for (const record of semantic) add(record.service, record.offer);
    for (const service of fallback.rows.filter((row) => matchesCategory(row, input.category))) if (service.offer?.status === "VERIFIED") add(service, service.offer);
    return [...groups.values()].slice(0, limit);
  }

  async reindexAllOffers(): Promise<void> {
    if (!this.searchIndex) return;
    await this.searchIndex.reindex(await this.repository.getOfferSearchRecords());
  }

  async deleteService(id: string): Promise<void> {
    const updated = await this.repository.updateService(id, { isActive: false }, this.dependencies.now());
    if (!updated) throw new ApiError(404, "SERVICE_NOT_FOUND", "Service not found");
    await this.refreshServiceIndex(id);
  }

  private async refreshServiceIndex(serviceId: string): Promise<void> {
    if (!this.searchIndex) return;
    for (const record of await this.repository.getOfferSearchRecords({ serviceId })) await this.tryIndexOffer(record);
  }

  private async refreshOfferIndex(offerId: string): Promise<void> {
    if (!this.searchIndex) return;
    const [record] = await this.repository.getOfferSearchRecords({ offerIds: [offerId] });
    if (record) await this.tryIndexOffer(record);
  }

  private async tryIndexOffer(record: CatalogOfferSearchRecord): Promise<void> {
    try { await this.searchIndex?.indexOffer(record); }
    catch (error) { agentLogger.warn({ event: "catalog.embedding_index.failed", offerId: record.offer.id, errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR" }); }
  }

  async getOfferForQuote(offerId: string): Promise<SupplierOfferRecord & { service: ServiceRecord }> {
    const offer = await this.repository.findOfferById(offerId);
    if (!offer || offer.status === "INACTIVE") throw new ApiError(404, "OFFER_NOT_AVAILABLE", "Supplier offer is not available");
    const service = await this.repository.findServiceById(offer.serviceId);
    if (!service?.isActive) throw new ApiError(404, "OFFER_NOT_AVAILABLE", "Supplier offer is not available");
    return { ...offer, service };
  }
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
