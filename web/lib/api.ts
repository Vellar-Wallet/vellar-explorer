import type { PaymentListResponse, StatsResponse } from "../../src/api-types.js";

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
