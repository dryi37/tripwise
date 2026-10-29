import type { Prisma, PrismaClient, Service, SupplierOffer } from "../../../generated/prisma/client.js";
import type { CatalogOfferSearchRecord, CatalogRepository, ServiceRecord, SupplierOfferRecord } from "../catalog.types.js";
const date = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const money = (value: bigint) => { const result = Number(value); if (!Number.isSafeInteger(result)) throw new RangeError("Offer price exceeds JavaScript safe integer range"); return result; };
type OfferRow = SupplierOffer;
type ServiceRow = Service & { offer: OfferRow | null };
const offer = (row: OfferRow): SupplierOfferRecord => { const { isPreferred: _isPreferred, ...value } = row; return { ...value, unitPriceMinor: money(row.unitPriceMinor), validFrom: date(row.validFrom), validUntil: date(row.validUntil) }; };
const service = (row: ServiceRow): ServiceRecord => ({ ...row, offer: row.offer ? offer(row.offer) : null });
const include = { offer: true };
const catalogInclude = { offer: true };
export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async list(input: { q?: string; category?: string; status?: string; activeOnly: boolean; skip: number; take: number }) {
    const where: Prisma.ServiceWhereInput = {
      ...(input.activeOnly ? { isActive: true } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.status ? { offer: { is: { status: input.status as never } } } : {}),
      ...(input.q ? { OR: [{ name: { contains: input.q, mode: "insensitive" } }, { offer: { is: { status: { not: "INACTIVE" }, details: { contains: input.q, mode: "insensitive" } } } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([this.prisma.service.findMany({ where, include: catalogInclude, orderBy: [{ name: "asc" }, { id: "asc" }], skip: input.skip, take: input.take }), this.prisma.service.count({ where })]);
    return { rows: rows.map(service), total };
  }
  async findServiceById(id: string) { const row = await this.prisma.service.findUnique({ where: { id }, include }); return row ? service(row) : null; }
  async createService(value: ServiceRecord) { const { offer: _offer, ...data } = value; return service(await this.prisma.service.create({ data, include })); }
  async updateService(id: string, changes: Partial<ServiceRecord>, updatedAt: Date) { const { offer: _offer, ...data } = changes; try { return service(await this.prisma.service.update({ where: { id }, data: { ...data, updatedAt }, include })); } catch { return null; } }
  async findOfferById(id: string) { const row = await this.prisma.supplierOffer.findUnique({ where: { id } }); return row ? offer(row) : null; }
  async createOffer(value: SupplierOfferRecord) { const { validFrom, validUntil, unitPriceMinor, ...data } = value; return offer(await this.prisma.supplierOffer.create({ data: { ...data, unitPriceMinor: BigInt(unitPriceMinor), validFrom: validFrom ? new Date(`${validFrom}T00:00:00Z`) : null, validUntil: validUntil ? new Date(`${validUntil}T00:00:00Z`) : null } })); }
  async updateOffer(id: string, changes: Partial<SupplierOfferRecord>, updatedAt: Date) { const { validFrom, validUntil, unitPriceMinor, ...data } = changes; try { return offer(await this.prisma.supplierOffer.update({ where: { id }, data: { ...data, ...(unitPriceMinor === undefined ? {} : { unitPriceMinor: BigInt(unitPriceMinor) }), ...(validFrom === undefined ? {} : { validFrom: validFrom ? new Date(`${validFrom}T00:00:00Z`) : null }), ...(validUntil === undefined ? {} : { validUntil: validUntil ? new Date(`${validUntil}T00:00:00Z`) : null }), updatedAt } })); } catch { return null; } }
  async getOfferSearchRecords(filter: { offerIds?: string[]; serviceId?: string } = {}): Promise<CatalogOfferSearchRecord[]> {
    const rows = await this.prisma.supplierOffer.findMany({
      where: { ...(filter.offerIds ? { id: { in: filter.offerIds } } : {}), ...(filter.serviceId ? { serviceId: filter.serviceId } : {}) },
      include: { service: { select: { id: true, name: true, category: true, tags: true, unit: true, isActive: true } } },
    });
    return rows.map((row) => ({ service: row.service, offer: offer(row) }));
  }
}
