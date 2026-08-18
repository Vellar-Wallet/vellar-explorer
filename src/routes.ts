import type { FastifyInstance } from "fastify";
import type { ExplorerStore, PaymentRow } from "./db.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface PaymentResponse {
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
    // Derived from facilitatorId alone: today every non-null id was written by the one
    // known-signer check in registry.ts, so this mapping is exhaustive. Revisit if a future
    // registry introduces more than two attribution tiers (e.g. self-reported-only).
    readonly confidence: "matched-known-signer" | "unattributed";
  };
}

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

function parseLimit(raw: unknown): number | undefined {
  if (raw === undefined) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) return undefined;
  return n;
}

export function registerRoutes(app: FastifyInstance, store: ExplorerStore): void {
  app.get("/health", async () => ({ status: "ok" }));

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
}
