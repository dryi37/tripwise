import { z } from "zod";
import { offerStatuses, serviceTags } from "./catalog.types.js";

const empty = z.object({}).strict();
const serviceParams = z.object({ serviceId: z.uuid() }).strict();
const offerParams = z.object({ serviceId: z.uuid(), offerId: z.uuid() }).strict();
const serviceFields = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  tags: z.array(z.enum(serviceTags)).max(serviceTags.length).default([]).refine((tags) => new Set(tags).size === tags.length, "Service tags must be unique"),
  unit: z.string().trim().min(1).max(60),
  isActive: z.boolean().optional(),
}).strict();
const offerFieldShape = z.object({
  unitPriceMinor: z.number().int().nonnegative().safe(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  validFrom: z.iso.date().nullable().optional(),
  validUntil: z.iso.date().nullable().optional(),
  details: z.string().trim().max(4_000).nullable().optional(),
  status: z.enum(offerStatuses),
}).strict();
const offerFields = offerFieldShape.refine((value) => !value.validFrom || !value.validUntil || value.validUntil >= value.validFrom, { message: "validUntil must be on or after validFrom" });

export const listCatalogSchema = z.object({
  params: empty,
  query: z.object({
    q: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    status: z.enum(offerStatuses).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }).strict(),
  body: z.unknown().optional(),
});
export const createServiceSchema = z.object({ params: empty, query: empty, body: serviceFields });
export const updateServiceSchema = z.object({ params: serviceParams, query: empty, body: serviceFields.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required") });
export const deleteServiceSchema = z.object({ params: serviceParams, query: empty, body: z.unknown().optional() });
export const createOfferSchema = z.object({ params: serviceParams, query: empty, body: offerFields });
export const updateOfferSchema = z.object({ params: offerParams, query: empty, body: offerFieldShape.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required") });

export type ListCatalogRequest = z.infer<typeof listCatalogSchema>;
export type CreateServiceRequest = z.infer<typeof createServiceSchema>;
export type UpdateServiceRequest = z.infer<typeof updateServiceSchema>;
export type CreateOfferRequest = z.infer<typeof createOfferSchema>;
export type UpdateOfferRequest = z.infer<typeof updateOfferSchema>;
