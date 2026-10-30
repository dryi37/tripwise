import { randomUUID } from "node:crypto";

import { ApiError } from "../../shared/http/api-error.js";
import type { CatalogService } from "../catalog/catalog.service.js";
import type { ExternalSourceService } from "../external-sources/external-source.service.js";
import { convertMinorAmount, type ExchangeRateProvider } from "../currency/exchange-rate.provider.js";
import type { PlacesService } from "../places/places.service.js";
import type { TripRepository } from "../trips/trip.repository.js";
import type { PlanningRepository } from "./planning.repository.js";
import type {
  ItineraryDraft,
  ItineraryItemChanges,
  NewItineraryItem,
  NewQuoteItem,
  PlanningMutationResult,
  Quote,
  QuoteItemChanges,
} from "./planning.types.js";

interface Dependencies { createId: () => string; now: () => Date }
const defaults: Dependencies = { createId: randomUUID, now: () => new Date() };

function dayCount(startDate: string, endDate: string): number {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
}

function validateActivity(input: NewItineraryItem | ItineraryItemChanges, maxDay: number): void {
  if (input.dayIndex !== undefined && (input.dayIndex < 1 || input.dayIndex > maxDay)) {
    throw new ApiError(422, "INVALID_DAY_INDEX", `dayIndex must be between 1 and ${maxDay}`);
  }
  if (input.localStartTime !== undefined && input.localEndTime !== undefined
    && input.localEndTime <= input.localStartTime) {
    throw new ApiError(422, "INVALID_TIME_RANGE", "localEndTime must be after localStartTime");
  }
  if (input.timezone !== undefined) {
    try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }); }
    catch { throw new ApiError(422, "INVALID_TIMEZONE", "timezone must be a valid IANA timezone"); }
  }
}

function validateNoTimeOverlap(items: ItineraryDraft["items"], candidate: Pick<NewItineraryItem, "dayIndex" | "localStartTime" | "localEndTime">, excludeId?: string): void {
  const conflict = items.find((item) => item.id !== excludeId && item.dayIndex === candidate.dayIndex
    && candidate.localStartTime < item.localEndTime && candidate.localEndTime > item.localStartTime);
  if (conflict) throw new ApiError(409, "ACTIVITY_TIME_CONFLICT", `Activity overlaps with ${conflict.title}`, { conflictingItemId: conflict.id, conflictingTitle: conflict.title });
}

function amount(quantity: number, unitPriceMinor: number): number {
  const value = quantity * unitPriceMinor;
  if (!Number.isSafeInteger(value)) throw new ApiError(422, "AMOUNT_OVERFLOW", "Quote amount exceeds the supported range");
  return value;
}

function totalAmount(values: number[]): number {
  return values.reduce((sum, value) => {
    const next = sum + value;
    if (!Number.isSafeInteger(next)) throw new ApiError(422, "AMOUNT_OVERFLOW", "Quote total exceeds the supported range");
    return next;
  }, 0);
}

function unwrap<T>(result: PlanningMutationResult<T>, entity: string): T {
  if (result.kind === "updated") return result.value;
  if (result.kind === "conflict") throw new ApiError(409, "REVISION_CONFLICT", `${entity} has changed`, { currentRevision: result.currentRevision });
  if (result.kind === "locked") throw new ApiError(409, "ITEM_LOCKED", "Itinerary item is locked");
  throw new ApiError(404, "PLANNING_RESOURCE_NOT_FOUND", `${entity} or item not found`);
}

export class PlanningService {
  constructor(
    private readonly trips: TripRepository,
    private readonly repository: PlanningRepository,
    private readonly dependencies: Dependencies = defaults,
    private readonly catalog?: CatalogService,
    private readonly externalSources?: ExternalSourceService,
    private readonly timezone?: string,
    private readonly exchangeRates?: ExchangeRateProvider,
    private readonly places?: PlacesService,
  ) {}

  private selectedPlace(tripId: string, placeId: string | undefined, runId?: string): Pick<ItineraryItemChanges, "placeProvider" | "placeId" | "placeName" | "placeAddress" | "placeLatitude" | "placeLongitude"> {
    if (!this.places) throw new ApiError(503, "PLACES_NOT_CONFIGURED", "OpenStreetMap search is unavailable");
    if (!placeId) throw new ApiError(422, "PLACE_REQUIRED", "Choose a specific place before adding this activity");
    const place = this.places.resolvePlaceId(placeId, { tripId, ...(runId ? { runId } : {}) });
    return { placeProvider: place.placeProvider, placeId: place.placeId, placeName: place.displayName, placeAddress: place.formattedAddress, placeLatitude: place.latitude, placeLongitude: place.longitude };
  }

  private async trip(tripId: string) {
    const trip = await this.trips.findById(tripId);
    if (!trip) throw new ApiError(404, "TRIP_NOT_FOUND", "Trip not found");
    return trip;
  }

  private activityTimezone(): string {
    if (!this.timezone) throw new ApiError(500, "APP_TIMEZONE_NOT_CONFIGURED", "The application timezone is not configured");
    try { new Intl.DateTimeFormat("en", { timeZone: this.timezone }); }
    catch { throw new ApiError(500, "APP_TIMEZONE_INVALID", "The configured application timezone is invalid"); }
    return this.timezone;
  }

  async getDraft(tripId: string): Promise<ItineraryDraft> {
    await this.trip(tripId);
    return this.repository.getOrCreateDraft(tripId, this.dependencies.createId(), this.dependencies.now());
  }

  async addItineraryItem(tripId: string, input: Omit<NewItineraryItem, "timezone"> & { expectedRevision: number; placeRunId?: string }): Promise<ItineraryDraft> {
    const trip = await this.trip(tripId);
    const { expectedRevision, placeRunId, placeId: requestedPlaceId, ...activity } = input;
    const selectedPlace = this.selectedPlace(tripId, requestedPlaceId ?? undefined, placeRunId);
    const data: NewItineraryItem = { ...activity, ...selectedPlace, timezone: this.activityTimezone() };
    validateActivity(data, dayCount(trip.startDate, trip.endDate));
    const draft = await this.repository.getOrCreateDraft(tripId, this.dependencies.createId(), this.dependencies.now());
    if (draft.revision !== expectedRevision) throw new ApiError(409, "REVISION_CONFLICT", "Draft has changed", { currentRevision: draft.revision });
    validateNoTimeOverlap(draft.items, data);
    return unwrap(await this.repository.addItineraryItem(tripId, expectedRevision, { ...data, id: this.dependencies.createId(), isLocked: false }, this.dependencies.now()), "Draft");
  }

  async addConsultantItineraryItem(tripId: string, input: Omit<NewItineraryItem, "timezone" | "supplierOfferId" | "externalSourceId"> & { expectedRevision: number; quantity: number; unit?: string | undefined; unitPriceMinor?: number | undefined; unitPriceCurrency?: string | undefined; supplierOfferId?: string | undefined; externalSourceId?: string | undefined; unpricedReason?: string | undefined; placeRunId?: string | undefined }): Promise<{ draft: ItineraryDraft; quote: Quote }> {
    if ((input.supplierOfferId ? 1 : 0) + (input.externalSourceId ? 1 : 0) + (input.sourceUrl ? 1 : 0) > 1) throw new ApiError(422, "MULTIPLE_PRICE_SOURCES", "Choose one price source for an activity");
    if (input.externalSourceId) {
      return this.addPlaceFromExternalSource(tripId, {
        externalSourceId: input.externalSourceId,
        dayIndex: input.dayIndex,
        localStartTime: input.localStartTime,
        localEndTime: input.localEndTime,
        quantity: input.quantity,
        ...(input.placeId ? { placeId: input.placeId } : {}),
        ...(input.placeRunId ? { placeRunId: input.placeRunId } : {}),
        title: input.title,
        description: input.description,
        ...(input.selectionReason ? { selectionReason: input.selectionReason } : {}),
        ...(input.unitPriceMinor === undefined ? {} : { unitPriceMinor: input.unitPriceMinor }),
        expectedDraftRevision: input.expectedRevision,
      });
    }

    const trip = await this.trip(tripId);
    const { expectedRevision, quantity, unit: quoteUnit, unitPriceMinor, unitPriceCurrency, supplierOfferId, sourceUrl, externalSourceId: _externalSourceId, unpricedReason, placeId, placeRunId, ...activity } = input;
    validateActivity(activity, dayCount(trip.startDate, trip.endDate));
    let offer: Awaited<ReturnType<CatalogService["getOfferForQuote"]>> | undefined;
    const plannedDate = new Date(`${trip.startDate}T00:00:00Z`);
    plannedDate.setUTCDate(plannedDate.getUTCDate() + activity.dayIndex - 1);
    const plannedDateText = plannedDate.toISOString().slice(0, 10);
    if (supplierOfferId) {
      if (!this.catalog) throw new ApiError(503, "CATALOG_NOT_CONFIGURED", "Catalog is not configured");
      offer = await this.catalog.getOfferForQuote(supplierOfferId);
      if (!offer.service.isActive || offer.status !== "VERIFIED" || (offer.validFrom && offer.validFrom > plannedDateText) || (offer.validUntil && offer.validUntil < plannedDateText)) {
        throw new ApiError(422, "OFFER_NOT_SELECTABLE", "Offer is not verified and valid for the activity date");
      }
      if (offer.currency !== trip.budgetCurrency) throw new ApiError(422, "OFFER_NOT_SELECTABLE", "Offer currency must match the trip budget currency");
    }

    const externalSource = sourceUrl && this.externalSources
      ? (await this.externalSources.list(tripId)).find((source) => source.canonicalUrl === sourceUrl)
      : undefined;
    const externalPrice = sourceUrl && unitPriceMinor !== undefined
      ? await this.convertExternalPrice(unitPriceMinor, unitPriceCurrency ?? trip.budgetCurrency, trip.budgetCurrency)
      : undefined;

    const draftBefore = await this.getDraft(tripId);
    if (draftBefore.revision !== expectedRevision) throw new ApiError(409, "REVISION_CONFLICT", "Draft has changed", { currentRevision: draftBefore.revision });
    const draft = await this.addItineraryItem(tripId, {
      ...activity,
      ...(supplierOfferId ? { supplierOfferId } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(externalSource ? { externalSourceId: externalSource.id } : {}),
      placeId,
      ...(placeRunId ? { placeRunId } : {}),
      expectedRevision,
    });
    const createdActivity = draft.items.find((item) => !draftBefore.items.some((previous) => previous.id === item.id));
    if (!createdActivity) throw new ApiError(500, "ACTIVITY_WRITE_FAILED", "Created activity could not be identified");
    const quote = offer
      ? await this.addQuoteItemFromOffer(tripId, { supplierOfferId: offer.id, quantity, expectedRevision: (await this.getQuote(tripId)).revision, itineraryItemId: createdActivity.id, plannedDate: plannedDateText, ...(unitPriceMinor === undefined ? {} : { unitPriceMinor }) })
      : sourceUrl && unitPriceMinor !== undefined
        ? await this.addQuoteItem(tripId, { expectedRevision: (await this.getQuote(tripId)).revision, itineraryItemId: createdActivity.id, ...(externalSource ? { externalSourceId: externalSource.id } : {}), name: activity.title, category: "ACTIVITY", unit: quoteUnit ?? "visit", quantity, unitPriceMinor: externalPrice!.amountMinor, sourceType: "EXTERNAL", sourceStatus: "UNVERIFIED", priceStatus: "SOURCE", serviceNameSnapshot: activity.title, sourceUnitPriceMinor: unitPriceMinor, termsSnapshot: `${externalSource ? `${externalSource.title}\n${externalSource.excerpt}\n` : ""}${externalPrice!.terms}`, sourceUrlSnapshot: sourceUrl, validUntilSnapshot: null })
        : sourceUrl
          ? await this.addQuoteItemNeedingReview(tripId, { itineraryItemId: createdActivity.id, name: activity.title, quantity, unit: quoteUnit ?? "visit", category: "ACTIVITY", sourceType: "EXTERNAL", ...(externalSource ? { externalSourceId: externalSource.id, sourceStatus: externalSource.verificationStatus === "VERIFIED" ? "VERIFIED" : "UNVERIFIED" } : {}), sourceUrlSnapshot: sourceUrl, reason: input.unpricedReason ?? "Chưa nhập được giá từ nguồn bên ngoài; cần kiểm tra giá." })
      : unitPriceMinor !== undefined
        ? await this.addQuoteItem(tripId, { expectedRevision: (await this.getQuote(tripId)).revision, itineraryItemId: createdActivity.id, name: activity.title, category: "ACTIVITY", unit: quoteUnit ?? "visit", quantity, unitPriceMinor, sourceType: "MANUAL", sourceStatus: "UNVERIFIED", priceStatus: "MANUAL", serviceNameSnapshot: activity.title, sourceUnitPriceMinor: unitPriceMinor, termsSnapshot: "Đơn giá do tư vấn viên nhập.", validUntilSnapshot: null })
        : await this.addQuoteItemNeedingReview(tripId, { itineraryItemId: createdActivity.id, name: activity.title, quantity, unit: quoteUnit ?? "visit", ...(input.unpricedReason ? { reason: input.unpricedReason } : {}) });
    return { draft, quote };
  }

  private async convertExternalPrice(amountMinor: number, sourceCurrency: string, quoteCurrency: string): Promise<{ amountMinor: number; terms: string }> {
    const base = sourceCurrency.toUpperCase();
    const quote = quoteCurrency.toUpperCase();
    if (base === quote) return { amountMinor, terms: `Giá nguồn: ${amountMinor} ${base}; báo giá: ${quote}. Giá web ước tính, chưa xác minh.` };
    if (!this.exchangeRates) throw new ApiError(503, "EXCHANGE_RATE_NOT_CONFIGURED", "Exchange-rate conversion is not configured");
    const rate = await this.exchangeRates.getRate(base, quote);
    const convertedAmountMinor = convertMinorAmount(amountMinor, base, quote, rate.rate);
    return {
      amountMinor: convertedAmountMinor,
      terms: `Giá gốc: ${amountMinor} đơn vị nhỏ nhất ${base}; tỷ giá ${rate.base}/${rate.quote}: ${rate.rate} (ngày ${rate.date}, nguồn ${rate.provider}); giá quy đổi: ${convertedAmountMinor} đơn vị nhỏ nhất ${quote}. Giá web ước tính, chưa xác minh.`,
    };
  }

  async updateItineraryItem(tripId: string, itemId: string, input: Omit<ItineraryItemChanges, "timezone"> & { expectedRevision: number }): Promise<ItineraryDraft> {
    const trip = await this.trip(tripId);
    const { expectedRevision, placeId, ...submittedChanges } = input;
    const changes: ItineraryItemChanges = { ...submittedChanges, timezone: this.activityTimezone() };
    const draft = await this.repository.getOrCreateDraft(tripId, this.dependencies.createId(), this.dependencies.now());
    if (draft.revision !== expectedRevision) throw new ApiError(409, "REVISION_CONFLICT", "Draft has changed", { currentRevision: draft.revision });
    const current = draft.items.find((item) => item.id === itemId);
    if (!current) throw new ApiError(404, "PLANNING_RESOURCE_NOT_FOUND", "Draft or item not found");
    if (!current.placeId && !placeId) throw new ApiError(422, "PLACE_REQUIRED", "Choose a specific place for this activity before updating it");
    if (placeId) Object.assign(changes, this.selectedPlace(tripId, placeId), { selectionReason: input.selectionReason ?? null });
    if (current.isLocked && changes.isLocked !== false) throw new ApiError(409, "ITEM_LOCKED", "Unlock the activity before updating it");
    const updated = { ...current, ...changes };
    validateActivity(updated, dayCount(trip.startDate, trip.endDate));
    validateNoTimeOverlap(draft.items, updated, itemId);
    return unwrap(await this.repository.updateItineraryItem(tripId, itemId, expectedRevision, changes, this.dependencies.now()), "Draft");
  }

  async deleteItineraryItem(tripId: string, itemId: string, expectedRevision: number): Promise<ItineraryDraft> {
    await this.trip(tripId);
    const linkedQuoteItemIds = (await this.getQuote(tripId)).items.filter((item) => item.itineraryItemId === itemId).map((item) => item.id);
    const draft = unwrap(await this.repository.deleteItineraryItem(tripId, itemId, expectedRevision, this.dependencies.now()), "Draft");
    let quote = await this.getQuote(tripId);
    for (const quoteItemId of linkedQuoteItemIds) {
      if (!quote.items.some((item) => item.id === quoteItemId)) continue;
      quote = await this.deleteQuoteItem(tripId, quoteItemId, quote.revision);
    }
    return draft;
  }

  async getQuote(tripId: string): Promise<Quote> {
    const trip = await this.trip(tripId);
    return this.repository.getOrCreateQuote(tripId, this.dependencies.createId(), trip.budgetCurrency, this.dependencies.now());
  }

  async addQuoteItem(tripId: string, input: NewQuoteItem & { expectedRevision: number }): Promise<Quote> {
    const trip = await this.trip(tripId);
    const { expectedRevision, ...data } = input;
    const amountMinor = data.priceStatus === "NEEDS_REVIEW" || data.unitPriceMinor === null ? null : amount(data.quantity, data.unitPriceMinor);
    const quote = await this.repository.getOrCreateQuote(tripId, this.dependencies.createId(), trip.budgetCurrency, this.dependencies.now());
    if (quote.revision !== expectedRevision) throw new ApiError(409, "REVISION_CONFLICT", "Quote has changed", { currentRevision: quote.revision });
    totalAmount([...quote.items.map((item) => item.amountMinor ?? 0), amountMinor ?? 0]);
    const normalized: NewQuoteItem = {
      ...data,
      serviceId: data.serviceId ?? null,
      supplierOfferId: data.supplierOfferId ?? null,
      externalSourceId: data.externalSourceId ?? null,
      sourceType: data.sourceType ?? "MANUAL",
      sourceStatus: data.sourceStatus ?? "UNVERIFIED",
      priceStatus: data.priceStatus ?? "MANUAL",
      serviceNameSnapshot: data.serviceNameSnapshot ?? data.name,
      sourceUnitPriceMinor: data.sourceUnitPriceMinor ?? (data.priceStatus === "NEEDS_REVIEW" || data.unitPriceMinor === null ? null : data.unitPriceMinor),
      termsSnapshot: data.termsSnapshot ?? null,
      sourceUrlSnapshot: data.sourceUrlSnapshot ?? null,
      validUntilSnapshot: data.validUntilSnapshot ?? null,
    };
    return unwrap(await this.repository.addQuoteItem(tripId, expectedRevision, { ...normalized, id: this.dependencies.createId(), amountMinor }, this.dependencies.now()), "Quote");
  }

  async addQuoteItemNeedingReview(tripId: string, input: { itineraryItemId: string; name: string; reason?: string; quantity?: number; unit?: string; category?: string; sourceType?: "EXTERNAL"; externalSourceId?: string; sourceStatus?: "UNVERIFIED" | "VERIFIED" | "INACTIVE"; sourceUrlSnapshot?: string }): Promise<Quote> {
    const quote = await this.getQuote(tripId);
    if (quote.items.some((item) => item.itineraryItemId === input.itineraryItemId)) return quote;
    return this.addQuoteItem(tripId, {
      expectedRevision: quote.revision,
      itineraryItemId: input.itineraryItemId,
      externalSourceId: input.externalSourceId ?? null,
      name: input.name,
      category: input.category ?? "ACTIVITY",
      unit: input.unit ?? "visit",
      quantity: input.quantity ?? 1,
      unitPriceMinor: 0,
      sourceType: input.sourceType ?? "UNPRICED",
      sourceStatus: input.sourceStatus ?? "UNVERIFIED",
      priceStatus: "NEEDS_REVIEW",
      serviceNameSnapshot: input.name,
      sourceUnitPriceMinor: null,
      termsSnapshot: input.reason ?? "Chưa có giá phù hợp; cần kiểm tra trước khi báo khách.",
      sourceUrlSnapshot: input.sourceUrlSnapshot ?? null,
      validUntilSnapshot: null,
    });
  }

  private manualItem(input: { name: string; category: string; unit: string; quantity: number; unitPriceMinor: number; terms?: string | null | undefined }): NewQuoteItem {
    return { serviceId: null, supplierOfferId: null, name: input.name, category: input.category, unit: input.unit, quantity: input.quantity, unitPriceMinor: input.unitPriceMinor, sourceType: "MANUAL", sourceStatus: "UNVERIFIED", priceStatus: "MANUAL", serviceNameSnapshot: input.name, sourceUnitPriceMinor: input.unitPriceMinor, termsSnapshot: input.terms ?? null, validUntilSnapshot: null };
  }

  async addQuoteItemFromOffer(tripId: string, input: { supplierOfferId: string; quantity: number; expectedRevision: number; itineraryItemId?: string; plannedDate?: string; unitPriceMinor?: number }): Promise<Quote> {
    if (!this.catalog) throw new ApiError(503, "CATALOG_NOT_CONFIGURED", "Catalog is not configured");
    const trip = await this.trip(tripId);
    const offer = await this.catalog.getOfferForQuote(input.supplierOfferId);
    const plannedDate = input.plannedDate ?? trip.startDate;
    if (!offer.service.isActive || offer.status !== "VERIFIED" || (offer.validFrom && offer.validFrom > plannedDate) || (offer.validUntil && offer.validUntil < plannedDate)) {
      throw new ApiError(422, "OFFER_NOT_SELECTABLE", "Offer is not verified and valid for the selected date");
    }
    const unitPriceMinor = input.unitPriceMinor ?? offer.unitPriceMinor;
    return this.addQuoteItem(tripId, { expectedRevision: input.expectedRevision, ...(input.itineraryItemId ? { itineraryItemId: input.itineraryItemId } : {}), serviceId: offer.serviceId, supplierOfferId: offer.id, name: offer.service.name, category: offer.service.category, unit: offer.service.unit, quantity: input.quantity, unitPriceMinor, sourceType: "CATALOG", sourceStatus: offer.status, priceStatus: unitPriceMinor === offer.unitPriceMinor ? "SOURCE" : "PRICE_OVERRIDDEN", serviceNameSnapshot: offer.service.name, sourceUnitPriceMinor: offer.unitPriceMinor, termsSnapshot: offer.details, validUntilSnapshot: offer.validUntil });
  }

  async addPlaceFromExternalSource(tripId: string, input: { externalSourceId: string; dayIndex: number; localStartTime: string; localEndTime: string; quantity: number; selectionReason?: string | undefined; unitPriceMinor?: number; expectedDraftRevision?: number; placeId?: string; placeRunId?: string; title?: string; description?: string }): Promise<{ draft: ItineraryDraft; quote: Quote }> {
    if (!this.externalSources) throw new ApiError(503, "WEB_SEARCH_NOT_CONFIGURED", "External sources are not configured");
    const trip = await this.trip(tripId);
    const source = await this.externalSources.getForTrip(tripId, input.externalSourceId);
    if (!source.suitable) throw new ApiError(422, "EXTERNAL_SOURCE_NOT_SELECTABLE", "External source is not suitable for this trip");
    const plannedDate = new Date(`${trip.startDate}T00:00:00Z`);
    plannedDate.setUTCDate(plannedDate.getUTCDate() + input.dayIndex - 1);
    const plannedDateText = plannedDate.toISOString().slice(0, 10);
    const plannedWeekday = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][plannedDate.getUTCDay()]!;
    const evidence = source.evidence as { closedDates?: string[]; closedWeekdays?: string[]; openingHours?: Array<{ day: string; opens: string; closes: string }> };
    if (evidence.closedDates?.includes(plannedDateText) || evidence.closedWeekdays?.includes(plannedWeekday)) {
      throw new ApiError(422, "EXTERNAL_SOURCE_CLOSED_ON_PLANNED_DATE", "External source is known to be closed on the planned day");
    }
    if (evidence.openingHours?.length) {
      const hours = evidence.openingHours.find((entry) => entry.day === plannedWeekday);
      if (!hours || input.localStartTime < hours.opens || input.localEndTime > hours.closes) {
        throw new ApiError(422, "EXTERNAL_SOURCE_OUTSIDE_OPENING_HOURS", "Planned visit is outside the verified opening hours");
      }
    }
    const audience = source.audience.toLowerCase();
    if (audience === "foreign") throw new ApiError(422, "EXTERNAL_PRICE_AUDIENCE_UNVERIFIED", "The trip record does not identify traveler nationality for this price condition");
    const quoteQuantity = input.quantity;
    if (quoteQuantity < 1) throw new ApiError(422, "EXTERNAL_PRICE_AUDIENCE_MISMATCH", "The trip party has no travelers matching this public price audience");
    const sourceAmountMinor = source.originalAmountMinor;
    const selectedAmountMinor = input.unitPriceMinor ?? sourceAmountMinor;
    const converted = await this.convertExternalPrice(selectedAmountMinor, source.originalCurrency, trip.budgetCurrency);
    const priceStatus = selectedAmountMinor === sourceAmountMinor ? "SOURCE" : "PRICE_OVERRIDDEN";
    let draft = await this.getDraft(tripId);
    if (input.expectedDraftRevision !== undefined && draft.revision !== input.expectedDraftRevision) throw new ApiError(409, "REVISION_CONFLICT", "Draft has changed", { currentRevision: draft.revision });
    let quote = await this.getQuote(tripId);
    const duplicateActivity = draft.items.some((item) => item.externalSourceId === source.id);
    const duplicateQuote = quote.items.some((item) => item.externalSourceId === source.id);
    if (!duplicateActivity) draft = await this.addItineraryItem(tripId, { expectedRevision: draft.revision, dayIndex: input.dayIndex, title: input.title ?? source.placeName, localStartTime: input.localStartTime, localEndTime: input.localEndTime, description: input.description ?? `Tham quan ${source.placeName}. Giờ mở cửa và giá được đối chiếu theo nguồn tại thời điểm tra cứu.`, ...(input.selectionReason ? { selectionReason: input.selectionReason } : {}), sourceUrl: source.canonicalUrl, externalSourceId: source.id, ...(input.placeId ? { placeId: input.placeId } : {}), ...(input.placeRunId ? { placeRunId: input.placeRunId } : {}) });
    const savedActivity = draft.items.find((item) => item.externalSourceId === source.id);
    if (!duplicateQuote) quote = await this.addQuoteItem(tripId, { expectedRevision: quote.revision, ...(savedActivity ? { itineraryItemId: savedActivity.id } : {}), externalSourceId: source.id, name: source.placeName, category: "Địa điểm", unit: source.pricingUnit, quantity: quoteQuantity, unitPriceMinor: converted.amountMinor, sourceType: "EXTERNAL", sourceStatus: "UNVERIFIED", priceStatus, serviceNameSnapshot: source.placeName, sourceUnitPriceMinor: sourceAmountMinor, termsSnapshot: `Nguồn bên ngoài · Giá web ước tính · Chưa xác minh${priceStatus === "PRICE_OVERRIDDEN" ? " · Đơn giá do tư vấn viên điều chỉnh" : ""}\n${converted.terms}\nGiá nguồn: ${sourceAmountMinor} ${source.originalCurrency}\nĐối tượng: ${source.audience}\nNhà xuất bản: ${source.publisher}\n${source.title}\n${source.canonicalUrl}\n${source.excerpt}`, sourceUrlSnapshot: source.canonicalUrl, validUntilSnapshot: null });
    return { draft, quote };
  }

  async addManualQuoteItem(tripId: string, input: { expectedRevision: number; name: string; category: string; unit: string; quantity: number; unitPriceMinor: number; terms?: string | null | undefined; saveToCatalog: boolean }): Promise<Quote> {
    let item = this.manualItem(input);
    if (input.saveToCatalog) {
      if (!this.catalog) throw new ApiError(503, "CATALOG_NOT_CONFIGURED", "Catalog is not configured");
      const trip = await this.trip(tripId);
      const service = await this.catalog.createService({ name: input.name, category: input.category, unit: input.unit });
      const offer = await this.catalog.addOffer(service.id, { unitPriceMinor: input.unitPriceMinor, currency: trip.budgetCurrency, details: input.terms ?? null, status: "UNVERIFIED" });
      item = { ...item, serviceId: service.id, supplierOfferId: offer.id };
    }
    return this.addQuoteItem(tripId, { ...item, expectedRevision: input.expectedRevision });
  }

  async updateQuoteItem(tripId: string, itemId: string, input: QuoteItemChanges & { expectedRevision: number }): Promise<Quote> {
    const trip = await this.trip(tripId);
    const { expectedRevision, ...changes } = input;
    const quote = await this.repository.getOrCreateQuote(tripId, this.dependencies.createId(), trip.budgetCurrency, this.dependencies.now());
    if (quote.revision !== expectedRevision) throw new ApiError(409, "REVISION_CONFLICT", "Quote has changed", { currentRevision: quote.revision });
    const current = quote.items.find((item) => item.id === itemId);
    if (!current) throw new ApiError(404, "PLANNING_RESOURCE_NOT_FOUND", "Quote or item not found");
    const price = changes.unitPriceMinor ?? current.unitPriceMinor;
    const updatedAmount = price === null ? null : amount(changes.quantity ?? current.quantity, price);
    totalAmount(quote.items.map((item) => item.id === itemId ? (updatedAmount ?? 0) : (item.amountMinor ?? 0)));
    const effectiveChanges = changes.unitPriceMinor !== undefined && current.priceStatus === "NEEDS_REVIEW"
      ? { ...changes, sourceUnitPriceMinor: changes.unitPriceMinor, priceStatus: "MANUAL" as const }
      : changes.unitPriceMinor !== undefined && (current.sourceType === "CATALOG" || current.sourceType === "EXTERNAL") && changes.unitPriceMinor !== current.sourceUnitPriceMinor
        ? { ...changes, priceStatus: "PRICE_OVERRIDDEN" as const }
        : changes;
    return unwrap(await this.repository.updateQuoteItem(tripId, itemId, expectedRevision, effectiveChanges, this.dependencies.now()), "Quote");
  }

  async deleteQuoteItem(tripId: string, itemId: string, expectedRevision: number): Promise<Quote> {
    await this.trip(tripId);
    return unwrap(await this.repository.deleteQuoteItem(tripId, itemId, expectedRevision, this.dependencies.now()), "Quote");
  }
}
