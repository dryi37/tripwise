import { z } from "zod";
export const listExternalSourcesSchema = z.object({ params: z.object({ tripId: z.uuid() }).strict(), query: z.object({}).strict(), body: z.unknown().optional() });
export type ListExternalSourcesRequest = z.infer<typeof listExternalSourcesSchema>;
