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
  location: z.string().trim().max(200).default(""),
  localStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  localEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2_000).default(""),
  supplierOfferId: z.uuid().optional(),
  sourceUrl: z.url().max(2_000).refine((value) => /^https?:\/\//i.test(value), "sourceUrl must use http or https").optional(),
  quantity: z.number().int().positive().max(2_147_483_647).optional(),
  unit: z.string().trim().min(1).max(60).optional(),
  unpricedReason: z.string().trim().min(6).max(240).optional(),
}).strict().refine((value) => !(value.supplierOfferId && value.sourceUrl), "Choose one price source");

export const searchKnowledgeToolSchema = z.object({ query: z.string().trim().min(2).max(1_000) }).strict();
export const searchSupplierOffersToolSchema = z.object({ query: z.string().trim().min(1).max(120), category: z.string().trim().min(1).max(60).optional() }).strict();
export const addQuoteItemFromOfferToolSchema = z.object({ supplierOfferId: z.uuid(), quantity: z.number().int().positive().max(2_147_483_647) }).strict();
export const searchWebToolSchema = z.object({ query: z.string().trim().min(2).max(300) }).strict();
export const addPlaceFromExternalSourceToolSchema = z.object({
  externalSourceId: z.uuid(), dayIndex: z.number().int().positive(),
  localStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), localEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(80), quantity: z.number().int().positive().max(2_147_483_647),
}).strict();
