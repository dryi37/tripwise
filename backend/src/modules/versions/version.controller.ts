import type { RequestHandler } from "express";
import type { CreateVersionRequest, ListVersionsRequest, RestoreVersionRequest } from "./version.schemas.js";
import type { VersionService } from "./version.service.js";
const input = <T>(locals: Record<string, unknown>) => locals.validated as T;
export class VersionController {
  constructor(private readonly service: VersionService) {}
  list: RequestHandler = async (_req, res) => { const x = input<ListVersionsRequest>(res.locals); res.json(await this.service.list(x.params.tripId, x.query.page, x.query.pageSize)); };
  create: RequestHandler = async (_req, res) => { const x = input<CreateVersionRequest>(res.locals); res.status(201).json({ data: await this.service.create(x.params.tripId, x.body.name, x.body.expectedRevision) }); };
  restore: RequestHandler = async (_req, res) => { const x = input<RestoreVersionRequest>(res.locals); res.json({ data: await this.service.restore(x.params.tripId, x.params.versionId, x.body.expectedRevision, x.body.expectedDraftRevision, x.body.expectedQuoteRevision) }); };
}
