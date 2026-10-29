import type { RequestHandler } from "express";
import type { KnowledgeService } from "./knowledge.service.js";
import type { CreateKnowledgeRequest, DeleteKnowledgeRequest, GetKnowledgeRequest, ListKnowledgeRequest, SearchKnowledgeRequest } from "./knowledge.schemas.js";

const input = <T>(locals: Record<string, unknown>) => locals.validated as T;

export class KnowledgeController {
  constructor(private readonly service: KnowledgeService) {}
  list: RequestHandler = async (_req, res) => {
    const x = input<ListKnowledgeRequest>(res.locals);
    res.json(await this.service.list(x.query.page, x.query.pageSize));
  };
  get: RequestHandler = async (_req, res) => {
    const x = input<GetKnowledgeRequest>(res.locals);
    res.json({ data: await this.service.get(x.params.documentId) });
  };
  create: RequestHandler = async (_req, res) => {
    const x = input<CreateKnowledgeRequest>(res.locals);
    res.status(201).json({ data: await this.service.create(x.body) });
  };
  delete: RequestHandler = async (_req, res) => {
    const x = input<DeleteKnowledgeRequest>(res.locals);
    await this.service.delete(x.params.documentId);
    res.status(204).end();
  };
  search: RequestHandler = async (_req, res) => {
    const x = input<SearchKnowledgeRequest>(res.locals);
    res.json({ data: await this.service.search(x.body.query, x.body.limit) });
  };
}
