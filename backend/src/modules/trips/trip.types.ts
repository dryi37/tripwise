export const tripStatuses = ["DRAFT", "IN_PROGRESS", "REVIEWED"] as const;
export type TripStatus = (typeof tripStatuses)[number];

export interface Trip {
  id: string;
  title: string;
  customerName: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  adultCount: number;
  childCount: number;
  customerRequest: string | null;
  planningStarted: boolean;
  budgetAmountMinor: number;
  budgetCurrency: string;
  status: TripStatus;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateTripInput = Pick<
  Trip,
  | "title"
  | "customerName"
  | "origin"
  | "destination"
  | "startDate"
  | "endDate"
  | "travelers"
  | "budgetAmountMinor"
  | "budgetCurrency"
> & Partial<Pick<Trip, "adultCount" | "childCount" | "customerRequest" | "planningStarted">>;

export type TripChanges = Partial<Pick<
  Trip,
  | "title"
  | "customerName"
  | "origin"
  | "destination"
  | "startDate"
  | "endDate"
  | "travelers"
  | "adultCount"
  | "childCount"
  | "customerRequest"
  | "planningStarted"
  | "budgetAmountMinor"
  | "budgetCurrency"
  | "status"
>>;

export type UpdateTripInput = TripChanges & { expectedRevision: number };

export interface ListTripsInput {
  q?: string;
  status?: TripStatus;
  cursor?: string;
  pageSize?: number;
}

export interface TripCursor {
  updatedAt: string;
  id: string;
}

export interface TripListQuery {
  q?: string;
  status?: TripStatus;
  cursor?: TripCursor;
  limit: number;
}

export interface TripPage {
  data: Trip[];
  nextCursor: string | null;
}
