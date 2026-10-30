import { z } from "zod";

import { tripStatuses } from "./trip.types.js";

const emptyObject = z.object({}).strict();
const tripIdParams = z.object({ tripId: z.uuid() }).strict();
const createTripBody = z.object({
  title: z.string().trim().min(1).max(160),
  customerName: z.string().trim().min(1).max(120),
  origin: z.string().trim().min(1).max(120),
  destination: z.string().trim().min(1).max(120),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  travelers: z.number().int().min(1).max(100),
  adultCount: z.number().int().min(1).max(100).optional(),
  childCount: z.number().int().min(0).max(100).optional(),
  customerRequest: z.string().trim().max(4_000).nullable().optional(),
  planningStarted: z.boolean().optional(),
  budgetAmountMinor: z.number().int().nonnegative().safe(),
  budgetCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
}).strict();

const updateTripBody = createTripBody.partial().extend({
  expectedRevision: z.number().int().positive(),
  status: z.enum(tripStatuses).optional(),
}).strict().refine((body) => Object.keys(body).some((key) => key !== "expectedRevision"), {
  message: "At least one trip field must be provided",
});

export const createTripRequestSchema = z.object({
  params: emptyObject,
  query: emptyObject,
  body: createTripBody,
});

export const getTripRequestSchema = z.object({
  params: tripIdParams,
  query: emptyObject,
  body: z.unknown().optional(),
});

export const listTripsRequestSchema = z.object({
  params: emptyObject,
  query: z.object({
    q: z.string().trim().min(1).max(120).optional(),
    status: z.enum(tripStatuses).optional(),
    cursor: z.string().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }).strict(),
  body: z.unknown().optional(),
});

export const updateTripRequestSchema = z.object({
  params: tripIdParams,
  query: emptyObject,
  body: updateTripBody,
});

export type CreateTripRequest = z.infer<typeof createTripRequestSchema>;
export type GetTripRequest = z.infer<typeof getTripRequestSchema>;
export type ListTripsRequest = z.infer<typeof listTripsRequestSchema>;
export type UpdateTripRequest = z.infer<typeof updateTripRequestSchema>;
