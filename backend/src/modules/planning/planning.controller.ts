import type { RequestHandler } from "express";

import type {
  CreateItineraryItemRequest,
  CreateQuoteItemRequest,
  CreateQuoteItemFromOfferRequest,
  CreateManualQuoteItemRequest,
  DeletePlanningItemRequest,
  GetPlanningRequest,
  UpdateItineraryItemRequest,
  UpdateQuoteItemRequest,
} from "./planning.schemas.js";
import type { PlanningService } from "./planning.service.js";
import { IdempotencyService } from "../../shared/idempotency/idempotency.service.js";

const input = <T>(locals: Record<string, unknown>) => locals.validated as T;
const compact = <T>(value: object) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;

export class PlanningController {
  constructor(private readonly service: PlanningService, private readonly idempotency = new IdempotencyService()) {}

  getDraft: RequestHandler = async (_request, response) => {
    response.json({ data: await this.service.getDraft(input<GetPlanningRequest>(response.locals).params.tripId) });
  };

  addItineraryItem: RequestHandler = async (_request, response) => {
    const request = input<CreateItineraryItemRequest>(response.locals);
    const result = await this.service.addConsultantItineraryItem(request.params.tripId, compact<CreateItineraryItemRequest["body"]>(request.body));
    response.status(201).json({ data: result.draft });
  };

  updateItineraryItem: RequestHandler = async (_request, response) => {
    const request = input<UpdateItineraryItemRequest>(response.locals);
    response.json({ data: await this.service.updateItineraryItem(request.params.tripId, request.params.itemId, compact(request.body)) });
  };

  deleteItineraryItem: RequestHandler = async (_request, response) => {
    const request = input<DeletePlanningItemRequest>(response.locals);
    response.json({ data: await this.service.deleteItineraryItem(request.params.tripId, request.params.itemId, request.body.expectedRevision) });
  };

  getQuote: RequestHandler = async (_request, response) => {
    response.json({ data: await this.service.getQuote(input<GetPlanningRequest>(response.locals).params.tripId) });
  };

  addQuoteItem: RequestHandler = async (_request, response) => {
    const request = input<CreateQuoteItemRequest>(response.locals);
    response.status(201).json({ data: await this.service.addQuoteItem(request.params.tripId, request.body) });
  };

  addQuoteItemFromOffer: RequestHandler = async (httpRequest, response) => {
    const request = input<CreateQuoteItemFromOfferRequest>(response.locals);
    const result = await this.idempotency.run(httpRequest.header("Idempotency-Key"), { route: "from-offer", tripId: request.params.tripId, body: request.body }, async () => ({ statusCode: 201, body: { data: await this.service.addQuoteItemFromOffer(request.params.tripId, request.body) } }));
    response.status(result.statusCode).json(result.body);
  };

  addManualQuoteItem: RequestHandler = async (httpRequest, response) => {
    const request = input<CreateManualQuoteItemRequest>(response.locals);
    const result = await this.idempotency.run(httpRequest.header("Idempotency-Key"), { route: "manual", tripId: request.params.tripId, body: request.body }, async () => ({ statusCode: 201, body: { data: await this.service.addManualQuoteItem(request.params.tripId, request.body) } }));
    response.status(result.statusCode).json(result.body);
  };

  updateQuoteItem: RequestHandler = async (_request, response) => {
    const request = input<UpdateQuoteItemRequest>(response.locals);
    response.json({ data: await this.service.updateQuoteItem(request.params.tripId, request.params.itemId, compact(request.body)) });
  };

  deleteQuoteItem: RequestHandler = async (_request, response) => {
    const request = input<DeletePlanningItemRequest>(response.locals);
    response.json({ data: await this.service.deleteQuoteItem(request.params.tripId, request.params.itemId, request.body.expectedRevision) });
  };
}
