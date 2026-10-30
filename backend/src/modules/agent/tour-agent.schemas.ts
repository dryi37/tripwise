import { z } from "zod";

const params = z.object({ tripId: z.uuid() }).strict();
const empty = z.object({}).strict();

export const runTourAgentSchema = z.object({
  params,
  query: empty,
  body: z.object({
    instruction: z.string().trim().min(3).max(2_000),
  }).strict(),
});

export type RunTourAgentRequest = z.infer<typeof runTourAgentSchema>;

export const addItineraryItemToolSchema = z.object({
  dayIndex: z.number().int().min(1),
  title: z.string().trim().min(1).max(160),
  localStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  localEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  description: z.string().trim().max(2_000).default(""),
  selectionReason: z.string().trim().min(1).max(1_000).optional(),
  placeId: z.string().trim().min(1).max(255),
  supplierOfferId: z.uuid().optional(),
  sourceUrl: z.url().max(2_000).refine((value) => /^https?:\/\//i.test(value), "sourceUrl must use http or https").optional(),
  quantity: z.number().int().positive().max(2_147_483_647).optional(),
  unit: z.string().trim().min(1).max(60).optional(),
  unitPrice: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  unitPriceCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional(),
  unpricedReason: z.string().trim().min(6).max(240).optional(),
  unpricedConfirmationId: z.uuid().optional(),
}).strict()
  .refine((value) => !(value.supplierOfferId && value.sourceUrl), "Choose one price source")
  .refine((value) => value.unitPrice === undefined || Boolean(value.sourceUrl && value.unitPriceCurrency && value.unit), "A web price requires its searched URL, currency, and unit")
  .refine((value) => value.unitPrice === undefined || !value.supplierOfferId, "Internal offer prices must come from the catalog")
  .refine((value) => value.unitPrice !== undefined || value.unitPriceCurrency === undefined, "Price currency requires a price")
  .refine((value) => value.unpricedConfirmationId === undefined || (value.unitPrice === undefined && !value.supplierOfferId), "Unpriced confirmation is only valid when no price source is supplied");

export const searchKnowledgeToolSchema = z.object({ query: z.string().trim().min(2).max(1_000) }).strict();
export const searchSupplierOffersToolSchema = z.object({ query: z.string().trim().min(1).max(120), category: z.string().trim().min(1).max(60).optional() }).strict();
export const searchWebToolSchema = z.object({ query: z.string().trim().min(2).max(300) }).strict();
export const searchPlacesToolSchema = z.object({ query: z.string().trim().min(2).max(160) }).strict();
