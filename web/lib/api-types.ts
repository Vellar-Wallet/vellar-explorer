/**
 * Deliberately duplicated from src/api-types.ts, not imported from it.
 *
 * The original design (a type-only import reaching across to ../../src/api-types.ts) worked
 * fine locally, where the whole repo sits on disk - but this repo deploys as TWO independent
 * services to TWO different platforms (this one to Vercel, the backend to Render), and Vercel's
 * Root Directory setting means only `web/` is ever uploaded to its build sandbox. `src/` genuinely
 * does not exist there, so the cross-directory import failed at build time with a real, confusing
 * cascade of "implicitly any" errors (caught 2026-08-18, first real Vercel deploy attempt).
 *
 * Keeping one shared source made sense for a single deploy unit; it stopped being the right
 * tradeoff the moment these became two independently-deployed services - at that point matching
 * DTOs across a client and server that ship separately is the normal shape, not a compromise.
 * If a route's response shape changes in src/api-types.ts, mirror the change here too.
 */

export interface PaymentResponse {
  readonly txHash: string;
  readonly ledger: number;
  readonly closedAt: string;
  readonly buyer: string;
  readonly seller: string;
  readonly sponsor: string;
  readonly amount: string;
  readonly assetContract: string;
  readonly assetSymbol: string | null;
  readonly feeBumped: boolean;
  readonly scheme: "exact" | "upto";
  readonly facilitator: {
    readonly id: string | null;
    readonly confidence: "matched-known-signer" | "unattributed";
  };
}

export interface PaymentListResponse {
  readonly items: readonly PaymentResponse[];
  readonly pagination: { readonly nextCursor: string | null; readonly limit: number };
}

export interface StatsResponse {
  readonly totalPayments: number;
  readonly uniqueBuyers: number;
  readonly uniqueSellers: number;
  readonly topAsset: { readonly assetContract: string; readonly assetSymbol: string | null; readonly count: number } | null;
  readonly facilitatorBreakdown: readonly { readonly facilitatorId: string | null; readonly count: number }[];
  readonly lastPaymentAt: string | null;
}

export interface AssetVolumeResponse {
  readonly assetContract: string;
  readonly assetSymbol: string | null;
  readonly total: string;
}

export interface FacilitatorSummaryResponse {
  readonly facilitatorId: string | null;
  readonly paymentCount: number;
  readonly uniqueBuyers: number;
  readonly uniqueSellers: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly topVolume: AssetVolumeResponse | null;
}

export interface FacilitatorListResponse {
  readonly items: readonly FacilitatorSummaryResponse[];
  readonly registeredCount: number;
}

export interface SellerSummaryResponse {
  readonly seller: string;
  readonly paymentCount: number;
  readonly uniqueBuyers: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly volumeByAsset: readonly AssetVolumeResponse[];
}

export interface SellerListResponse {
  readonly items: readonly SellerSummaryResponse[];
  readonly pagination: { readonly limit: number; readonly offset: number; readonly hasMore: boolean };
  readonly activeLast7Days: number;
}

export interface AssetSummaryResponse {
  readonly assetContract: string;
  readonly assetSymbol: string | null;
  readonly paymentCount: number;
  readonly uniqueSellers: number;
  readonly totalVolume: string;
}

export type TimeWindowParam = "24h" | "7d" | "30d" | "all";

export interface AssetListResponse {
  readonly items: readonly AssetSummaryResponse[];
  readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly totalPages: number };
  readonly window: TimeWindowParam;
  readonly distinctAssets: number;
  readonly topAsset: { readonly assetContract: string; readonly assetSymbol: string | null; readonly count: number } | null;
  readonly settledInWindow: number;
}

export interface AssetStatsResponse {
  readonly assetContract: string;
  readonly assetSymbol: string | null;
  readonly totalPayments: number;
  readonly totalVolume: string;
  readonly uniqueBuyers: number;
  readonly uniqueSellers: number;
  readonly firstPaymentAt: string | null;
  readonly lastPaymentAt: string | null;
}

export interface AssetTimeseriesResponse {
  readonly assetContract: string;
  readonly assetSymbol: string | null;
  readonly windows: readonly {
    readonly window: "24h" | "7d" | "30d";
    readonly payments: number;
    readonly volume: string;
    readonly buyers: number;
    readonly sellers: number;
  }[];
}

export interface EcosystemTimeseriesResponse {
  readonly bucket: "day";
  readonly buckets: readonly {
    readonly date: string;
    readonly totalPayments: number;
    readonly byFacilitator: readonly { readonly facilitatorId: string | null; readonly count: number }[];
  }[];
}
