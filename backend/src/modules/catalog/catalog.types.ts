export const offerStatuses = ["UNVERIFIED", "VERIFIED", "INACTIVE"] as const;
export type OfferStatus = (typeof offerStatuses)[number];
export const serviceTags = ["FOOD", "LODGING", "TRANSPORT", "SIGHTSEEING", "OTHER"] as const;

export interface SupplierOfferRecord {
  id: string;
  serviceId: string;
  unitPriceMinor: number;
  currency: string;
  validFrom: string | null;
  validUntil: string | null;
  details: string | null;
  status: OfferStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceRecord {
  id: string;
  name: string;
  category: string;
  tags?: string[];
  unit: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  offer: SupplierOfferRecord | null;
}

export interface CatalogRepository {
  list(input: { q?: string; category?: string; status?: string; activeOnly: boolean; skip: number; take: number }): Promise<{ rows: ServiceRecord[]; total: number }>;
  findServiceById(id: string): Promise<ServiceRecord | null>;
  createService(service: ServiceRecord): Promise<ServiceRecord>;
  updateService(id: string, changes: Partial<ServiceRecord>, updatedAt: Date): Promise<ServiceRecord | null>;
  findOfferById(id: string): Promise<SupplierOfferRecord | null>;
  createOffer(offer: SupplierOfferRecord): Promise<SupplierOfferRecord>;
  updateOffer(id: string, changes: Partial<SupplierOfferRecord>, updatedAt: Date): Promise<SupplierOfferRecord | null>;
  getOfferSearchRecords(filter?: { offerIds?: string[]; serviceId?: string }): Promise<CatalogOfferSearchRecord[]>;
}

export interface CatalogOfferSearchRecord {
  service: Pick<ServiceRecord, "id" | "name" | "category" | "tags" | "unit" | "isActive">;
  offer: SupplierOfferRecord;
}

export interface CatalogServiceSearchResult {
  id: string;
  name: string;
  category: string;
  tags: string[];
  unit: string;
  offers: SupplierOfferRecord[];
}

export interface CatalogOfferSearchIndex {
  indexOffer(record: CatalogOfferSearchRecord): Promise<void>;
  search(query: string, limit: number): Promise<string[]>;
  reindex(records: CatalogOfferSearchRecord[]): Promise<void>;
}

export type ServiceWriteInput = {
  name: string;
  category: string;
  tags?: string[] | undefined;
  unit: string;
  isActive?: boolean | undefined;
};
export type OfferWriteInput = {
  unitPriceMinor: number;
  currency: string;
  status: OfferStatus;
  validFrom?: string | null | undefined;
  validUntil?: string | null | undefined;
  details?: string | null | undefined;
};
