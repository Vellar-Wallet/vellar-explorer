import type { FastifyInstance } from "fastify";
import type {
  AssetListResponse,
  AssetVolumeResponse,
  EcosystemTimeseriesResponse,
  FacilitatorListResponse,
  PaymentResponse,
  SellerListResponse,
  StatsResponse,
} from "./api-types.js";
import type { ExplorerStore, AssetVolume, PaymentRow } from "./db.js";
import { registeredFacilitatorCount } from "./registry.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_SELLER_LIMIT = 50;
const MAX_SELLER_LIMIT = 200;

// PaymentResponse.facilitator.confidence is derived from facilitatorId alone below: today every
// non-null id was written by the one known-signer check in registry.ts, so the mapping is
// exhaustive. Revisit if a future registry introduces more than two attribution tiers (e.g.
// self-reported-only).

function toResponse(row: PaymentRow, symbols: ReadonlyMap<string, string>): PaymentResponse {
  return {
    txHash: row.txHash,
    ledger: row.ledger,
    closedAt: row.closedAt,
    buyer: row.buyer,
    seller: row.seller,
    sponsor: row.sponsor,
    amount: row.amount,
    assetContract: row.assetContract,
    assetSymbol: symbols.get(row.assetContract) ?? null,
    feeBumped: row.feeBumped,
    facilitator: {
      id: row.facilitatorId,
      confidence: row.facilitatorId === null ? "unattributed" : "matched-known-signer",
    },
  };
}

function toVolumeResponse(v: AssetVolume, symbols: ReadonlyMap<string, string>): AssetVolumeResponse {
  return { assetContract: v.assetContract, assetSymbol: symbols.get(v.assetContract) ?? null, total: v.total };
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

/** Wire convention for the facilitator filter: absent = no filter, the literal string
 * "unattributed" = filter to unattributed-only (facilitator_id IS NULL), anything else = that
 * specific facilitator id. "unattributed" can never collide with a real id - registry.ts ids come
 * from a hardcoded, human-chosen set that avoids it. */
function parseFacilitatorFilter(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  return raw === "unattributed" ? null : raw;
}

export function registerRoutes(app: FastifyInstance, store: ExplorerStore): void {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/stats", async (): Promise<StatsResponse> => {
    const [stats, symbols] = await Promise.all([store.getStats(), store.getAllAssetSymbols()]);
    return {
      totalPayments: stats.totalPayments,
      uniqueBuyers: stats.uniqueBuyers,
      uniqueSellers: stats.uniqueSellers,
      topAsset: stats.topAsset
        ? { assetContract: stats.topAsset.assetContract, assetSymbol: symbols.get(stats.topAsset.assetContract) ?? null, count: stats.topAsset.count }
        : null,
      facilitatorBreakdown: stats.facilitatorBreakdown,
      lastPaymentAt: stats.lastPaymentAt ?? null,
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
    const facilitatorFilter = parseFacilitatorFilter(request.query.facilitator);
    const [result, symbols] = await Promise.all([
      store.listPayments({
        limit,
        ...(request.query.cursor !== undefined ? { cursor: request.query.cursor } : {}),
        ...(facilitatorFilter !== undefined ? { facilitatorId: facilitatorFilter } : {}),
        ...(request.query.payTo !== undefined ? { payTo: request.query.payTo } : {}),
      }),
      store.getAllAssetSymbols(),
    ]);
    return {
      items: result.items.map(row => toResponse(row, symbols)),
      pagination: { nextCursor: result.nextCursor ?? null, limit },
    };
  });

  app.get<{ Params: { txHash: string } }>("/payments/:txHash", async (request, reply) => {
    const [row, symbols] = await Promise.all([
      store.getPaymentByTxHash(request.params.txHash),
      store.getAllAssetSymbols(),
    ]);
    if (!row) {
      return reply.code(404).send({
        error: { code: "payment_not_found", message: `no payment found for tx hash ${request.params.txHash}` },
      });
    }
    return toResponse(row, symbols);
  });

  app.get("/facilitators", async (): Promise<FacilitatorListResponse> => {
    const [summaries, symbols] = await Promise.all([store.getFacilitatorSummaries(), store.getAllAssetSymbols()]);
    return {
      items: summaries.map(s => ({
        facilitatorId: s.facilitatorId,
        paymentCount: s.paymentCount,
        uniqueBuyers: s.uniqueBuyers,
        uniqueSellers: s.uniqueSellers,
        firstSeen: s.firstSeen,
        lastSeen: s.lastSeen,
        topVolume: s.topVolume ? toVolumeResponse(s.topVolume, symbols) : null,
      })),
      registeredCount: registeredFacilitatorCount(),
    };
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
    const [result, activeLast7Days, symbols] = await Promise.all([
      store.listSellers(limit, offset),
      store.countDistinctSellersSince(new Date(Date.now() - SEVEN_DAYS_MS).toISOString()),
      store.getAllAssetSymbols(),
    ]);
    const response: SellerListResponse = {
      items: result.items.map(s => ({
        seller: s.seller,
        paymentCount: s.paymentCount,
        uniqueBuyers: s.uniqueBuyers,
        firstSeen: s.firstSeen,
        lastSeen: s.lastSeen,
        volumeByAsset: s.volumeByAsset.map(v => toVolumeResponse(v, symbols)),
      })),
      pagination: { limit, offset, hasMore: result.hasMore },
      activeLast7Days,
    };
    return response;
  });

  app.get("/assets", async (): Promise<AssetListResponse> => {
    const [items, settledLast30Days, symbols] = await Promise.all([
      store.listAssets(),
      store.countPaymentsSince(new Date(Date.now() - THIRTY_DAYS_MS).toISOString()),
      store.getAllAssetSymbols(),
    ]);
    return {
      items: items.map(a => ({
        assetContract: a.assetContract,
        assetSymbol: symbols.get(a.assetContract) ?? null,
        paymentCount: a.paymentCount,
        uniqueSellers: a.uniqueSellers,
        totalVolume: a.totalVolume,
      })),
      settledLast30Days,
    };
  });

  app.get("/ecosystem/timeseries", async (): Promise<EcosystemTimeseriesResponse> => {
    const buckets = await store.getEcosystemTimeseries();
    return { bucket: "day", buckets };
  });
}
