import type { RequestHandler } from "express";
import type { ExternalSourceService } from "./external-source.service.js";
import type { ListExternalSourcesRequest } from "./external-source.schemas.js";
export class ExternalSourceController {
  constructor(private readonly service: ExternalSourceService) {}
  list: RequestHandler = async (_request, response) => { const input = response.locals.validated as ListExternalSourcesRequest; response.json({ data: await this.service.list(input.params.tripId) }); };
}
