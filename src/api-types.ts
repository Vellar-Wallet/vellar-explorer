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
  readonly feeBumped: boolean;
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
  readonly topAsset: { readonly assetContract: string; readonly count: number } | null;
  readonly facilitatorBreakdown: readonly { readonly facilitatorId: string | null; readonly count: number }[];
}
