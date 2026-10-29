import { z } from "zod";
const empty=z.object({}).strict();
export const listKnowledgeSchema=z.object({params:empty,query:z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20)}).strict(),body:z.unknown().optional()});
export const createKnowledgeSchema=z.object({params:empty,query:empty,body:z.object({title:z.string().trim().min(1).max(200),sourceLabel:z.string().trim().min(1).max(200).nullable().optional(),content:z.string().trim().min(20).max(200_000)}).strict()});
export const deleteKnowledgeSchema=z.object({params:z.object({documentId:z.uuid()}).strict(),query:empty,body:z.unknown().optional()});
export const getKnowledgeSchema=z.object({params:z.object({documentId:z.uuid()}).strict(),query:empty,body:z.unknown().optional()});
export const searchKnowledgeBodySchema=z.object({query:z.string().trim().min(2).max(1_000),limit:z.number().int().positive().optional()}).strict();
export const searchKnowledgeSchema=z.object({params:empty,query:empty,body:searchKnowledgeBodySchema});
export type ListKnowledgeRequest=z.infer<typeof listKnowledgeSchema>;export type CreateKnowledgeRequest=z.infer<typeof createKnowledgeSchema>;export type GetKnowledgeRequest=z.infer<typeof getKnowledgeSchema>;export type DeleteKnowledgeRequest=z.infer<typeof deleteKnowledgeSchema>;export type SearchKnowledgeRequest=z.infer<typeof searchKnowledgeSchema>;
