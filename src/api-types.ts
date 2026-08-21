/**
 * The wire shapes for every API response. Owned by the backend (this is what routes.ts actually
 * returns) and imported type-only by web/ — a runtime-free import, so the frontend never pulls in
 * store/indexer code, only the shapes it needs to render.
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
  /** The asset's real on-chain symbol() - null until resolved (or if it isn't a standard SEP-41
   * token). Same source as rail402's own labeling: the token itself, not a name/metadata service. */
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
  /** How many facilitators we actually hold a verified signer key for - a static, honest count,
   * not a self-serve registry size. */
  readonly registeredCount: number;
}

export interface AssetVolumeResponse {
  readonly assetContract: string;
  readonly assetSymbol: string | null;
  readonly total: string;
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
  /** Distinct sellers seen in the last 7 days - computed over the whole dataset, not just this page. */
  readonly activeLast7Days: number;
}

export interface AssetSummaryResponse {
  readonly assetContract: string;
  readonly assetSymbol: string | null;
  readonly paymentCount: number;
  readonly uniqueSellers: number;
  readonly totalVolume: string;
}

/** "all" = no lower bound. Echoed back on AssetListResponse so the frontend derives its stat-card
 * labels FROM the actual active filter, never a hardcoded string - the exact bug being fixed. */
export type TimeWindowParam = "24h" | "7d" | "30d" | "all";

export interface AssetListResponse {
  readonly items: readonly AssetSummaryResponse[];
  readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly totalPages: number };
  readonly window: TimeWindowParam;
  /** Distinct assets and top asset ARE window-scoped - an asset with zero payments in the window
   * doesn't count toward either, same as the paginated list itself. */
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
  /** Always all three - the matrix table shows them simultaneously, never one at a time. */
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
