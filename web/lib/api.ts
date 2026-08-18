import type {
  AssetListResponse,
  AssetStatsResponse,
  AssetTimeseriesResponse,
  EcosystemTimeseriesResponse,
  FacilitatorListResponse,
  PaymentListResponse,
  SellerListResponse,
  StatsResponse,
  TimeWindowParam,
} from "../../src/api-types.js";

export type { TimeWindowParam };

/**
 * The ONLY way this app touches data. Every call here is a plain fetch against the explorer API
 * — no DB client, no store import, nothing that could bypass the API's own validation/shaping.
 * `cache: "no-store"` throughout: this is live, frequently-changing public data, and Next's
 * default fetch caching would silently show stale numbers otherwise.
 */

function apiUrl(): string {
  const url = process.env["EXPLORER_API_URL"];
  if (!url) throw new Error("EXPLORER_API_URL is not set");
  return url.replace(/\/+$/, "");
}

export async function getStats(): Promise<StatsResponse> {
  const res = await fetch(`${apiUrl()}/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /stats returned HTTP ${res.status}`);
  return (await res.json()) as StatsResponse;
}

export interface ListPaymentsParams {
  readonly limit?: number;
  readonly cursor?: string;
  readonly facilitator?: string;
  readonly payTo?: string;
}

export async function listPayments(params: ListPaymentsParams): Promise<PaymentListResponse> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.cursor !== undefined) qs.set("cursor", params.cursor);
  if (params.facilitator !== undefined) qs.set("facilitator", params.facilitator);
  if (params.payTo !== undefined) qs.set("payTo", params.payTo);
  const res = await fetch(`${apiUrl()}/payments?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /payments returned HTTP ${res.status}`);
  return (await res.json()) as PaymentListResponse;
}

export async function getFacilitators(): Promise<FacilitatorListResponse> {
  const res = await fetch(`${apiUrl()}/facilitators`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /facilitators returned HTTP ${res.status}`);
  return (await res.json()) as FacilitatorListResponse;
}

export interface ListSellersParams {
  readonly limit?: number;
  readonly offset?: number;
}

export async function listSellers(params: ListSellersParams): Promise<SellerListResponse> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  const res = await fetch(`${apiUrl()}/sellers?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /sellers returned HTTP ${res.status}`);
  return (await res.json()) as SellerListResponse;
}

export interface GetAssetsParams {
  readonly window?: TimeWindowParam;
  readonly page?: number;
}

export async function getAssets(params: GetAssetsParams = {}): Promise<AssetListResponse> {
  const qs = new URLSearchParams();
  if (params.window !== undefined) qs.set("window", params.window);
  if (params.page !== undefined) qs.set("page", String(params.page));
  const res = await fetch(`${apiUrl()}/assets?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /assets returned HTTP ${res.status}`);
  return (await res.json()) as AssetListResponse;
}

export async function getAssetStats(contract: string): Promise<AssetStatsResponse> {
  const res = await fetch(`${apiUrl()}/assets/${encodeURIComponent(contract)}/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /assets/:contract/stats returned HTTP ${res.status}`);
  return (await res.json()) as AssetStatsResponse;
}

export async function getAssetTimeseries(contract: string): Promise<AssetTimeseriesResponse> {
  const res = await fetch(`${apiUrl()}/assets/${encodeURIComponent(contract)}/timeseries`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /assets/:contract/timeseries returned HTTP ${res.status}`);
  return (await res.json()) as AssetTimeseriesResponse;
}

export interface ListAssetPaymentsParams {
  readonly limit?: number;
  readonly cursor?: string;
}

export async function listAssetPayments(contract: string, params: ListAssetPaymentsParams): Promise<PaymentListResponse> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.cursor !== undefined) qs.set("cursor", params.cursor);
  const res = await fetch(`${apiUrl()}/assets/${encodeURIComponent(contract)}/payments?${qs.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET /assets/:contract/payments returned HTTP ${res.status}`);
  return (await res.json()) as PaymentListResponse;
}

export async function getEcosystemTimeseries(): Promise<EcosystemTimeseriesResponse> {
  const res = await fetch(`${apiUrl()}/ecosystem/timeseries`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET /ecosystem/timeseries returned HTTP ${res.status}`);
  return (await res.json()) as EcosystemTimeseriesResponse;
}
