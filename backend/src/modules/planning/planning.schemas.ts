import { z } from "zod";

const empty = z.object({}).strict();
const tripParams = z.object({ tripId: z.uuid() }).strict();
const itemParams = z.object({ tripId: z.uuid(), itemId: z.uuid() }).strict();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const revision = z.object({ expectedRevision: z.number().int().positive() }).strict();

const itineraryFields = z.object({
  dayIndex: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  location: z.string().trim().max(200),
  localStartTime: time,
  localEndTime: time,
  timezone: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2_000),
  sourceUrl: z.string().trim().url().max(2_000).nullable().optional().refine((value) => !value || /^https?:\/\//i.test(value), "sourceUrl must use http or https"),
}).strict();

const createItineraryFields = itineraryFields.extend({
  location: z.string().trim().max(200).default(""),
  description: z.string().trim().max(2_000).default(""),
  quantity: z.number().int().positive().max(2_147_483_647).default(1),
  unit: z.string().trim().min(1).max(60).optional(),
  unitPriceMinor: z.number().int().nonnegative().safe().optional(),
  supplierOfferId: z.uuid().optional(),
  externalSourceId: z.uuid().optional(),
});

const quoteFields = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  unit: z.string().trim().min(1).max(60),
  quantity: z.number().int().positive().max(2_147_483_647),
  unitPriceMinor: z.number().int().nonnegative().safe(),
}).strict();

export const getPlanningSchema = z.object({ params: tripParams, query: empty, body: z.unknown().optional() });
export const createItineraryItemSchema = z.object({ params: tripParams, query: empty, body: createItineraryFields.extend({ expectedRevision: z.number().int().positive() }).strict().refine((body) => !(body.supplierOfferId && body.externalSourceId), "Choose one price source") });
export const updateItineraryItemSchema = z.object({
  params: itemParams,
  query: empty,
  body: itineraryFields.partial().extend({ expectedRevision: z.number().int().positive(), isLocked: z.boolean().optional() }).strict()
    .refine((body) => Object.keys(body).some((key) => key !== "expectedRevision"), "At least one field is required"),
});
export const deletePlanningItemSchema = z.object({ params: itemParams, query: empty, body: revision });
export const createQuoteItemSchema = z.object({ params: tripParams, query: empty, body: quoteFields.extend({ expectedRevision: z.number().int().positive() }).strict() });
export const createQuoteItemFromOfferSchema = z.object({
  params: tripParams,
  query: empty,
  body: z.object({ supplierOfferId: z.uuid(), quantity: z.number().int().positive().max(2_147_483_647), expectedRevision: z.number().int().positive() }).strict(),
});
export const createManualQuoteItemSchema = z.object({
  params: tripParams,
  query: empty,
  body: quoteFields.extend({
    terms: z.string().trim().max(4_000).nullable().optional(),
    saveToCatalog: z.boolean().default(false),
    expectedRevision: z.number().int().positive(),
  }).strict(),
});
export const updateQuoteItemSchema = z.object({
  params: itemParams,
  query: empty,
  body: quoteFields.partial().extend({ expectedRevision: z.number().int().positive() }).strict()
    .refine((body) => Object.keys(body).some((key) => key !== "expectedRevision"), "At least one field is required"),
});

export type GetPlanningRequest = z.infer<typeof getPlanningSchema>;
export type CreateItineraryItemRequest = z.infer<typeof createItineraryItemSchema>;
export type UpdateItineraryItemRequest = z.infer<typeof updateItineraryItemSchema>;
export type DeletePlanningItemRequest = z.infer<typeof deletePlanningItemSchema>;
export type CreateQuoteItemRequest = z.infer<typeof createQuoteItemSchema>;
export type CreateQuoteItemFromOfferRequest = z.infer<typeof createQuoteItemFromOfferSchema>;
export type CreateManualQuoteItemRequest = z.infer<typeof createManualQuoteItemSchema>;
export type UpdateQuoteItemRequest = z.infer<typeof updateQuoteItemSchema>;
