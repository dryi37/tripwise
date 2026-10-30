import { z } from "zod";

export const searchPlacesSchema = z.object({
  params: z.object({ tripId: z.uuid() }).strict(),
  query: z.object({}).strict(),
  body: z.object({ query: z.string().trim().min(2).max(160) }).strict(),
});

export type SearchPlacesRequest = z.infer<typeof searchPlacesSchema>;
export const mapPlacesSchema = z.object({
  params: z.object({ tripId: z.uuid() }).strict(),
  query: z.object({ dayIndex: z.coerce.number().int().positive() }).strict(),
  body: z.unknown().optional(),
});
export type MapPlacesRequest = z.infer<typeof mapPlacesSchema>;

export const destinationSearchSchema = z.object({
  params: z.object({}).strict(),
  query: z.object({}).strict(),
  body: z.object({ query: z.string().trim().min(2).max(160) }).strict(),
});
export type DestinationSearchRequest = z.infer<typeof destinationSearchSchema>;
