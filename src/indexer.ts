import type { AppConfig } from "./config.js";
import { TRANSFER_TOPIC_B64 } from "./config.js";
import { classifyTransaction } from "./classify.js";
import type { ExplorerStore } from "./db.js";
import { attributeFacilitator } from "./registry.js";
import { getEvents, getHealth, getTransaction } from "./rpc.js";
import { resolveAssetSymbol } from "./symbol.js";

export interface IndexerCounters {
  polls: number;
  eventsSeen: number;
  txFetched: number;
  matched: number;
  inserted: number;
  errors: number;
}

export interface IndexerOptions {
  readonly store: ExplorerStore;
  readonly config: AppConfig;
}

/**
 * The live-tail poll loop: getEvents (USDC SAC transfer topic) → getTransaction per candidate
 * hash → classify → attribute → insert. Errors are contained per-hash — one bad RPC response or
 * one malformed transaction must not stall the loop, same discipline this repo's sibling
 * (vellar-facilitator) applies to /settle.
 *
 * The cursor only advances after a page is FULLY processed with no fetch failures. Holding it on
 * partial failure means the next poll re-presents the same page rather than silently dropping a
 * payment — the store's idempotent insert (ON CONFLICT DO NOTHING) is what makes that safe to
 * repeat.
 */
export class IndexerWorker {
  readonly counters: IndexerCounters = {
    polls: 0,
    eventsSeen: 0,
    txFetched: 0,
    matched: 0,
    inserted: 0,
    errors: 0,
  };

  private readonly store: ExplorerStore;
  private readonly config: AppConfig;
  private timer: NodeJS.Timeout | undefined;
  private polling = false;
  private stopped = false;

  constructor(options: IndexerOptions) {
    this.store = options.store;
    this.config = options.config;
  }

  start(): void {
    const tick = (): void => {
      if (this.stopped) return;
      if (this.polling) return; // never overlap polls
      this.polling = true;
      void this.pollOnce()
        .catch(error => {
          console.warn("[indexer] poll failed:", error instanceof Error ? error.message : error);
        })
        .finally(() => {
          this.polling = false;
        });
    };
    tick();
    this.timer = setInterval(tick, this.config.pollIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** One poll. Exposed directly for the validation run and for tests — start() just schedules it. */
  async pollOnce(): Promise<{ candidates: number; matched: number; inserted: number }> {
    this.counters.polls += 1;
    const { network, rpcUrl, usdcSac } = this.config.network;
    const state = await this.store.getCursor(network);

    let startLedger: number | undefined;
    let cursor: string | undefined = state?.cursor;
    if (cursor === undefined) {
      const health = await getHealth(rpcUrl);
      startLedger = Math.max(health.oldestLedger, health.latestLedger - this.config.backscanLedgers);
    }

    const eventsParams: Record<string, unknown> = {
      filters: [{ type: "contract", contractIds: [usdcSac], topics: [[TRANSFER_TOPIC_B64, "**"]] }],
      xdrFormat: "json",
    };
    if (cursor !== undefined) {
      eventsParams["pagination"] = { cursor, limit: 200 };
    } else {
      eventsParams["startLedger"] = startLedger;
      eventsParams["pagination"] = { limit: 200 };
    }
    const result = await getEvents(rpcUrl, eventsParams);
    this.counters.eventsSeen += result.events.length;

    const hashes = new Set<string>();
    for (const ev of result.events) {
      const h = (ev as { txHash?: string })?.txHash;
      if (typeof h === "string") hashes.add(h);
    }

    let matched = 0;
    let inserted = 0;
    let anyFetchFailed = false;
    for (const hash of hashes) {
      try {
        const tx = await getTransaction(rpcUrl, hash);
        this.counters.txFetched += 1;
        const match = classifyTransaction(tx, this.config.network);
        if (!match) continue;
        matched += 1;
        this.counters.matched += 1;
        const attribution = attributeFacilitator(match.feeSource ?? match.txSource);
        const { inserted: wasNew } = await this.store.insertPayment({
          txHash: match.txHash,
          ledger: match.ledger,
          closedAt: match.closedAt,
          buyer: match.from,
          seller: match.to,
          sponsor: match.feeSource ?? match.txSource,
          amount: match.amount,
          assetContract: match.assetContract,
          feeBumped: match.feeBumped,
          scheme: match.scheme,
          facilitatorId: attribution.facilitatorId,
        });
        if (wasNew) {
          inserted += 1;
          this.counters.inserted += 1;
        }
        // Isolated from the outer catch on purpose: a symbol-resolution hiccup is cosmetic (the
        // asset just displays as a truncated contract until the next successful attempt) and must
        // never set anyFetchFailed, which would hold the cursor back for a real ingestion problem.
        await this.resolveSymbolIfNeeded(match.assetContract).catch(error => {
          console.warn(
            `[indexer] symbol resolution failed for ${match.assetContract}:`,
            error instanceof Error ? error.message : error,
          );
        });
      } catch (error) {
        anyFetchFailed = true;
        this.counters.errors += 1;
        console.warn(
          `[indexer] failed to fetch/classify/insert ${hash}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (!anyFetchFailed) {
      await this.store.setCursor(network, {
        ...(result.cursor !== undefined ? { cursor: result.cursor } : {}),
        lastLedger: result.latestLedger,
      });
    }

    return { candidates: hashes.size, matched, inserted };
  }

  /** Resolves and caches an asset's on-chain symbol() the first time this contract is seen; every
   * later payment on the same asset is a cheap cache hit (getAssetSymbol), not a new RPC round
   * trip. */
  private async resolveSymbolIfNeeded(assetContract: string): Promise<void> {
    const cached = await this.store.getAssetSymbol(assetContract);
    if (cached !== undefined) return; // already attempted (found a symbol, or confirmed none)
    const symbol = await resolveAssetSymbol(this.config.network.rpcUrl, this.config.network.passphrase, assetContract);
    await this.store.setAssetSymbol(assetContract, symbol ?? null);
  }
}
