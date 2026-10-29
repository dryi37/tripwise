import type { RequestHandler } from "express";
import type { CatalogService } from "./catalog.service.js";
import type { CreateOfferRequest, CreateServiceRequest, ListCatalogRequest, UpdateOfferRequest, UpdateServiceRequest } from "./catalog.schemas.js";
import type { OfferWriteInput, ServiceWriteInput } from "./catalog.types.js";
const validated = <T>(locals: Record<string, unknown>): T => locals.validated as T;
export class CatalogController {
  constructor(private readonly service: CatalogService) {}
  list: RequestHandler = async (_req, res) => { const { query } = validated<ListCatalogRequest>(res.locals); res.json(await this.service.list(query)); };
  createService: RequestHandler = async (_req, res) => { const { body } = validated<CreateServiceRequest>(res.locals); res.status(201).json({ data: await this.service.createService(body as ServiceWriteInput) }); };
  updateService: RequestHandler = async (_req, res) => { const x = validated<UpdateServiceRequest>(res.locals); res.json({ data: await this.service.updateService(x.params.serviceId, x.body as Partial<ServiceWriteInput>) }); };
  deleteService: RequestHandler = async (_req, res) => { const { params } = validated<{ params: { serviceId: string } }>(res.locals); await this.service.deleteService(params.serviceId); res.sendStatus(204); };
  createOffer: RequestHandler = async (_req, res) => { const x = validated<CreateOfferRequest>(res.locals); res.status(201).json({ data: await this.service.addOffer(x.params.serviceId, x.body as OfferWriteInput) }); };
  updateOffer: RequestHandler = async (_req, res) => { const x = validated<UpdateOfferRequest>(res.locals); res.json({ data: await this.service.updateOffer(x.params.serviceId, x.params.offerId, x.body as Partial<OfferWriteInput>) }); };
}
