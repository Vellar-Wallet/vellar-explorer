import type { FastifyInstance } from "fastify";
import type {
  AssetListResponse,
  EcosystemTimeseriesResponse,
  FacilitatorListResponse,
  PaymentResponse,
  SellerListResponse,
  StatsResponse,
} from "./api-types.js";
import type { ExplorerStore, PaymentRow } from "./db.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_SELLER_LIMIT = 50;
const MAX_SELLER_LIMIT = 200;

// PaymentResponse.facilitator.confidence is derived from facilitatorId alone below: today every
// non-null id was written by the one known-signer check in registry.ts, so the mapping is
// exhaustive. Revisit if a future registry introduces more than two attribution tiers (e.g.
// self-reported-only).

function toResponse(row: PaymentRow): PaymentResponse {
  return {
    txHash: row.txHash,
    ledger: row.ledger,
    closedAt: row.closedAt,
    buyer: row.buyer,
    seller: row.seller,
    sponsor: row.sponsor,
    amount: row.amount,
    assetContract: row.assetContract,
    feeBumped: row.feeBumped,
    facilitator: {
      id: row.facilitatorId,
      confidence: row.facilitatorId === null ? "unattributed" : "matched-known-signer",
    },
  };
}

function parseBoundedInt(raw: unknown, fallback: number, max: number, min = 1): number | undefined {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

function parseLimit(raw: unknown): number | undefined {
  return parseBoundedInt(raw, DEFAULT_LIMIT, MAX_LIMIT);
}

export function registerRoutes(app: FastifyInstance, store: ExplorerStore): void {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/stats", async (): Promise<StatsResponse> => {
    const stats = await store.getStats();
    return {
      totalPayments: stats.totalPayments,
      uniqueBuyers: stats.uniqueBuyers,
      uniqueSellers: stats.uniqueSellers,
      topAsset: stats.topAsset ?? null,
      facilitatorBreakdown: stats.facilitatorBreakdown,
    };
  });

  app.get<{
    Querystring: { limit?: string; cursor?: string; facilitator?: string; payTo?: string };
  }>("/payments", async (request, reply) => {
    const limit = parseLimit(request.query.limit);
    if (limit === undefined) {
      return reply.code(400).send({
        error: { code: "invalid_limit", message: `limit must be an integer between 1 and ${MAX_LIMIT}` },
      });
    }
    const result = await store.listPayments({
      limit,
      ...(request.query.cursor !== undefined ? { cursor: request.query.cursor } : {}),
      ...(request.query.facilitator !== undefined ? { facilitatorId: request.query.facilitator } : {}),
      ...(request.query.payTo !== undefined ? { payTo: request.query.payTo } : {}),
    });
    return {
      items: result.items.map(toResponse),
      pagination: { nextCursor: result.nextCursor ?? null, limit },
    };
  });

  app.get<{ Params: { txHash: string } }>("/payments/:txHash", async (request, reply) => {
    const row = await store.getPaymentByTxHash(request.params.txHash);
    if (!row) {
      return reply.code(404).send({
        error: { code: "payment_not_found", message: `no payment found for tx hash ${request.params.txHash}` },
      });
    }
    return toResponse(row);
  });

  app.get("/facilitators", async (): Promise<FacilitatorListResponse> => {
    const items = await store.getFacilitatorSummaries();
    return { items };
  });

  app.get<{ Querystring: { limit?: string; offset?: string } }>("/sellers", async (request, reply) => {
    const limit = parseBoundedInt(request.query.limit, DEFAULT_SELLER_LIMIT, MAX_SELLER_LIMIT);
    if (limit === undefined) {
      return reply.code(400).send({
        error: { code: "invalid_limit", message: `limit must be an integer between 1 and ${MAX_SELLER_LIMIT}` },
      });
    }
    const offset = parseBoundedInt(request.query.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    if (offset === undefined) {
      return reply.code(400).send({ error: { code: "invalid_offset", message: "offset must be a non-negative integer" } });
    }
    const result = await store.listSellers(limit, offset);
    const response: SellerListResponse = {
      items: result.items,
      pagination: { limit, offset, hasMore: result.hasMore },
    };
    return response;
  });

  app.get("/assets", async (): Promise<AssetListResponse> => {
    const items = await store.listAssets();
    return { items };
  });

  app.get("/ecosystem/timeseries", async (): Promise<EcosystemTimeseriesResponse> => {
    const buckets = await store.getEcosystemTimeseries();
    return { bucket: "day", buckets };
  });
}
