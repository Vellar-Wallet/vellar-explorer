import { createClient, type Client } from "@libsql/client";

/** One row as decoded by the classifier and, optionally, attributed to a known facilitator. */
export interface PaymentInput {
  readonly txHash: string;
  readonly ledger: number;
  readonly closedAt: string;
  readonly buyer: string;
  readonly seller: string;
  readonly sponsor: string;
  /** Stroops. A string on the way in, a string on the way out — never parsed to Number anywhere
   * in this file. A BigInt-range amount silently loses precision the moment it touches a JS
   * number, and there is no valid reason to do arithmetic on it in this service. */
  readonly amount: string;
  readonly assetContract: string;
  readonly feeBumped: boolean;
  /** null = unattributed. Never the literal string "unknown" — one representation of
   * "we don't know," not two. The API layer is what turns null into "unknown" on the wire. */
  readonly facilitatorId: string | null;
}

export interface PaymentRow extends PaymentInput {
  readonly ingestedAt: string;
}

export interface CursorState {
  readonly cursor?: string;
  readonly lastLedger: number;
}

export interface ListFilter {
  readonly limit: number;
  readonly cursor?: string;
  /** undefined = no facilitator filter; null = filter to unattributed (facilitator_id IS NULL)
   * only; a string = filter to that specific known facilitator id. */
  readonly facilitatorId?: string | null;
  readonly payTo?: string;
  readonly assetContract?: string;
}

export interface ListResult {
  readonly items: readonly PaymentRow[];
  readonly nextCursor: string | undefined;
}

export interface FacilitatorBreakdownEntry {
  /** null = unattributed, same convention as PaymentInput.facilitatorId. */
  readonly facilitatorId: string | null;
  readonly count: number;
}

export interface TopAsset {
  readonly assetContract: string;
  readonly count: number;
}

export interface Stats {
  readonly totalPayments: number;
  readonly uniqueBuyers: number;
  readonly uniqueSellers: number;
  readonly topAsset: TopAsset | undefined;
  readonly facilitatorBreakdown: readonly FacilitatorBreakdownEntry[];
  readonly lastPaymentAt: string | undefined;
}

export interface FacilitatorSummary {
  readonly facilitatorId: string | null;
  readonly paymentCount: number;
  readonly uniqueBuyers: number;
  readonly uniqueSellers: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  /** The single asset this facilitator has moved the most of, by summed amount — an all-time
   * aggregate, not a time-windowed one, so it needs no new date-filtering machinery. */
  readonly topVolume: AssetVolume | undefined;
}

export interface AssetVolume {
  readonly assetContract: string;
  /** Stroops, summed in SQL as a 64-bit integer then cast back to TEXT before it reaches JS — see
   * getStats-adjacent methods below for why this is a different risk class from PaymentInput.amount. */
  readonly total: string;
}

export interface SellerSummary {
  readonly seller: string;
  readonly paymentCount: number;
  readonly uniqueBuyers: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly volumeByAsset: readonly AssetVolume[];
}

export interface SellerListResult {
  readonly items: readonly SellerSummary[];
  readonly hasMore: boolean;
}

export interface AssetSummary {
  readonly assetContract: string;
  readonly paymentCount: number;
  readonly uniqueSellers: number;
  readonly totalVolume: string;
}

/** "all" = unfiltered (no closed_at lower bound). */
export type TimeWindow = "24h" | "7d" | "30d" | "all";

export interface WindowedAssetList {
  readonly items: readonly AssetSummary[];
  /** Distinct assets matching the window - NOT just this page; the count pagination needs. */
  readonly totalDistinctAssets: number;
  readonly topAsset: TopAsset | undefined;
}

export interface AssetStats {
  readonly totalPayments: number;
  readonly totalVolume: string;
  readonly uniqueBuyers: number;
  readonly uniqueSellers: number;
  readonly firstPaymentAt: string | undefined;
  readonly lastPaymentAt: string | undefined;
}

export interface AssetWindowStats {
  readonly window: "24h" | "7d" | "30d";
  readonly payments: number;
  readonly volume: string;
  readonly buyers: number;
  readonly sellers: number;
}

export interface EcosystemBucket {
  readonly date: string;
  readonly totalPayments: number;
  readonly byFacilitator: readonly FacilitatorBreakdownEntry[];
}

interface CursorKey {
  readonly closedAt: string;
  readonly txHash: string;
}

/** The store owns this shape; consumers just pass the string back. Base64url of {closedAt,
 * txHash} — keyset pagination, tie-broken on txHash so same-instant rows don't repeat or skip. */
function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key)).toString("base64url");
}

function decodeCursor(raw: string): CursorKey | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as CursorKey).closedAt === "string" &&
      typeof (parsed as CursorKey).txHash === "string"
    ) {
      return parsed as CursorKey;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS payments (
     tx_hash         TEXT PRIMARY KEY,
     ledger          INTEGER NOT NULL,
     closed_at       TEXT NOT NULL,
     buyer           TEXT NOT NULL,
     seller          TEXT NOT NULL,
     sponsor         TEXT NOT NULL,
     amount          TEXT NOT NULL,
     asset_contract  TEXT NOT NULL,
     fee_bumped      INTEGER NOT NULL,
     facilitator_id  TEXT,
     ingested_at     TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_payments_closed_at   ON payments (closed_at DESC, tx_hash DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_seller      ON payments (seller)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_facilitator ON payments (facilitator_id)`,
  `CREATE TABLE IF NOT EXISTS cursors (
     network      TEXT PRIMARY KEY,
     cursor       TEXT,
     last_ledger  INTEGER NOT NULL,
     updated_at   TEXT NOT NULL
   )`,
  // symbol NULL = resolution was attempted and found nothing (not a standard SEP-41 token, or the
  // RPC call failed) - a row existing at all is what prevents re-attempting on every payment for a
  // persistently-unresolvable contract. Absence of a row means "never attempted."
  `CREATE TABLE IF NOT EXISTS asset_symbols (
     asset_contract  TEXT PRIMARY KEY,
     symbol          TEXT,
     resolved_at     TEXT NOT NULL
   )`,
];

export class ExplorerStore {
  private readonly client: Client;

  constructor(url: string, authToken: string | undefined) {
    this.client = createClient(authToken ? { url, authToken } : { url });
  }

  async init(): Promise<void> {
    for (const stmt of SCHEMA) await this.client.execute(stmt);
    // Nothing to additively migrate yet — when a column is added later, follow
    // vellar-facilitator's src/store.ts pattern: a PRAGMA table_info check + a guarded
    // ALTER TABLE ADD COLUMN, not a migration framework.
  }

  /** Idempotent: inserting an already-known tx_hash is a no-op, not an error. The indexer relies
   * on this to make re-scanning overlapping ledger ranges after a restart harmless. */
  async insertPayment(row: PaymentInput, now: () => Date = () => new Date()): Promise<{ inserted: boolean }> {
    const result = await this.client.execute({
      sql: `INSERT INTO payments
              (tx_hash, ledger, closed_at, buyer, seller, sponsor, amount, asset_contract,
               fee_bumped, facilitator_id, ingested_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tx_hash) DO NOTHING`,
      args: [
        row.txHash,
        row.ledger,
        row.closedAt,
        row.buyer,
        row.seller,
        row.sponsor,
        row.amount,
        row.assetContract,
        row.feeBumped ? 1 : 0,
        row.facilitatorId,
        now().toISOString(),
      ],
    });
    return { inserted: result.rowsAffected > 0 };
  }

  async getPaymentByTxHash(txHash: string): Promise<PaymentRow | undefined> {
    const result = await this.client.execute({
      sql: "SELECT * FROM payments WHERE tx_hash = ?",
      args: [txHash],
    });
    const row = result.rows[0];
    return row ? toPaymentRow(row) : undefined;
  }

  async listPayments(filter: ListFilter): Promise<ListResult> {
    const conditions: string[] = [];
    const args: (string | number)[] = [];
    if (filter.facilitatorId === null) {
      conditions.push("facilitator_id IS NULL");
    } else if (filter.facilitatorId !== undefined) {
      conditions.push("facilitator_id = ?");
      args.push(filter.facilitatorId);
    }
    if (filter.payTo !== undefined) {
      conditions.push("seller = ?");
      args.push(filter.payTo);
    }
    if (filter.assetContract !== undefined) {
      conditions.push("asset_contract = ?");
      args.push(filter.assetContract);
    }
    if (filter.cursor !== undefined) {
      const key = decodeCursor(filter.cursor);
      if (key) {
        conditions.push("(closed_at < ? OR (closed_at = ? AND tx_hash < ?))");
        args.push(key.closedAt, key.closedAt, key.txHash);
      }
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    // Fetch one extra row to know whether a next page exists, without a separate COUNT query.
    const result = await this.client.execute({
      sql: `SELECT * FROM payments ${where} ORDER BY closed_at DESC, tx_hash DESC LIMIT ?`,
      args: [...args, filter.limit + 1],
    });
    const rows = result.rows.map(toPaymentRow);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ closedAt: last.closedAt, txHash: last.txHash }) : undefined;
    return { items, nextCursor };
  }

  /** Five independent aggregate queries, run in parallel — each is a simple scan over the
   * existing schema, no new tables or precomputed rollups needed at this scale. */
  async getStats(): Promise<Stats> {
    const [totalResult, buyersResult, sellersResult, topAssetResult, breakdownResult, lastPaymentResult] =
      await Promise.all([
        this.client.execute("SELECT COUNT(*) as n FROM payments"),
        this.client.execute("SELECT COUNT(DISTINCT buyer) as n FROM payments"),
        this.client.execute("SELECT COUNT(DISTINCT seller) as n FROM payments"),
        this.client.execute(
          "SELECT asset_contract, COUNT(*) as n FROM payments GROUP BY asset_contract ORDER BY n DESC LIMIT 1",
        ),
        this.client.execute(
          "SELECT facilitator_id, COUNT(*) as n FROM payments GROUP BY facilitator_id ORDER BY n DESC",
        ),
        this.client.execute("SELECT MAX(closed_at) as last FROM payments"),
      ]);

    const topAssetRow = topAssetResult.rows[0];
    const topAsset: TopAsset | undefined = topAssetRow
      ? { assetContract: String(topAssetRow["asset_contract"]), count: Number(topAssetRow["n"]) }
      : undefined;

    const facilitatorBreakdown: FacilitatorBreakdownEntry[] = breakdownResult.rows.map(row => ({
      facilitatorId: row["facilitator_id"] === null ? null : String(row["facilitator_id"]),
      count: Number(row["n"]),
    }));

    const lastPaymentAtRaw = lastPaymentResult.rows[0]?.["last"];

    return {
      totalPayments: Number(totalResult.rows[0]?.["n"] ?? 0),
      uniqueBuyers: Number(buyersResult.rows[0]?.["n"] ?? 0),
      uniqueSellers: Number(sellersResult.rows[0]?.["n"] ?? 0),
      topAsset,
      facilitatorBreakdown,
      lastPaymentAt: lastPaymentAtRaw === null || lastPaymentAtRaw === undefined ? undefined : String(lastPaymentAtRaw),
    };
  }

  async getFacilitatorSummaries(): Promise<FacilitatorSummary[]> {
    const [summaryResult, volumeResult] = await Promise.all([
      this.client.execute(
        `SELECT facilitator_id, COUNT(*) as n, COUNT(DISTINCT buyer) as buyers,
                COUNT(DISTINCT seller) as sellers, MIN(closed_at) as first_seen, MAX(closed_at) as last_seen
         FROM payments GROUP BY facilitator_id ORDER BY n DESC`,
      ),
      // Per (facilitator, asset) totals, so the top one per facilitator can be picked in JS —
      // simpler and just as correct as a window-function query, and doesn't assume a SQLite
      // version with them available.
      this.client.execute(
        `SELECT facilitator_id, asset_contract, CAST(SUM(CAST(amount AS INTEGER)) AS TEXT) as total
         FROM payments GROUP BY facilitator_id, asset_contract`,
      ),
    ]);

    const topVolumeByFacilitator = new Map<string, AssetVolume>();
    for (const row of volumeResult.rows) {
      const key = row["facilitator_id"] === null ? " unattributed" : String(row["facilitator_id"]);
      const candidate: AssetVolume = { assetContract: String(row["asset_contract"]), total: String(row["total"]) };
      const current = topVolumeByFacilitator.get(key);
      // Both are 64-bit-safe integer strings of equal-or-comparable magnitude here (same guard as
      // the SQL SUM itself) — safe to compare as BigInt for "which is larger," never as Number.
      if (!current || BigInt(candidate.total) > BigInt(current.total)) {
        topVolumeByFacilitator.set(key, candidate);
      }
    }

    return summaryResult.rows.map(row => ({
      facilitatorId: row["facilitator_id"] === null ? null : String(row["facilitator_id"]),
      paymentCount: Number(row["n"]),
      uniqueBuyers: Number(row["buyers"]),
      uniqueSellers: Number(row["sellers"]),
      firstSeen: String(row["first_seen"]),
      lastSeen: String(row["last_seen"]),
      topVolume: topVolumeByFacilitator.get(
        row["facilitator_id"] === null ? " unattributed" : String(row["facilitator_id"]),
      ),
    }));
  }

  /** Plain limit/offset, not the Feed's keyset cursor — this is a secondary aggregate view where
   * a row shifting slightly across a reload is an acceptable tradeoff for the simpler query. */
  async listSellers(limit: number, offset: number): Promise<SellerListResult> {
    const pageResult = await this.client.execute({
      sql: `SELECT seller, COUNT(*) as n, COUNT(DISTINCT buyer) as buyers,
                   MIN(closed_at) as first_seen, MAX(closed_at) as last_seen
            FROM payments GROUP BY seller ORDER BY n DESC, seller ASC LIMIT ? OFFSET ?`,
      args: [limit + 1, offset],
    });
    const rows = pageResult.rows;
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const sellers = pageRows.map(row => String(row["seller"]));

    const volumeBySeller = new Map<string, AssetVolume[]>();
    if (sellers.length > 0) {
      const placeholders = sellers.map(() => "?").join(",");
      const volumeResult = await this.client.execute({
        sql: `SELECT seller, asset_contract, CAST(SUM(CAST(amount AS INTEGER)) AS TEXT) as total
              FROM payments WHERE seller IN (${placeholders}) GROUP BY seller, asset_contract`,
        args: sellers,
      });
      for (const row of volumeResult.rows) {
        const seller = String(row["seller"]);
        const entry: AssetVolume = { assetContract: String(row["asset_contract"]), total: String(row["total"]) };
        const list = volumeBySeller.get(seller);
        if (list) list.push(entry);
        else volumeBySeller.set(seller, [entry]);
      }
    }

    const items: SellerSummary[] = pageRows.map(row => {
      const seller = String(row["seller"]);
      return {
        seller,
        paymentCount: Number(row["n"]),
        uniqueBuyers: Number(row["buyers"]),
        firstSeen: String(row["first_seen"]),
        lastSeen: String(row["last_seen"]),
        volumeByAsset: volumeBySeller.get(seller) ?? [],
      };
    });
    return { items, hasMore };
  }

  /** Replaces the old unpaginated, unwindowed listAssets(): the Assets list page needs both a
   * page (10/row pagination) and a re-scoped window (24H/7D/30D/All Time all changing what the
   * table AND the header stats show, not just a label) - an asset with zero payments in the
   * window simply doesn't appear, exactly like every other stat re-scoping. `sinceIso` is
   * undefined for "all". */
  async listAssetsWindowed(sinceIso: string | undefined, limit: number, offset: number): Promise<WindowedAssetList> {
    const where = sinceIso !== undefined ? "WHERE closed_at >= ?" : "";
    const args = sinceIso !== undefined ? [sinceIso] : [];

    const [itemsResult, countResult, topResult] = await Promise.all([
      this.client.execute({
        sql: `SELECT asset_contract, COUNT(*) as n, COUNT(DISTINCT seller) as sellers,
                     CAST(SUM(CAST(amount AS INTEGER)) AS TEXT) as total
              FROM payments ${where} GROUP BY asset_contract ORDER BY n DESC LIMIT ? OFFSET ?`,
        args: [...args, limit, offset],
      }),
      this.client.execute({ sql: `SELECT COUNT(DISTINCT asset_contract) as n FROM payments ${where}`, args }),
      this.client.execute({
        sql: `SELECT asset_contract, COUNT(*) as n FROM payments ${where} GROUP BY asset_contract ORDER BY n DESC LIMIT 1`,
        args,
      }),
    ]);

    const items: AssetSummary[] = itemsResult.rows.map(row => ({
      assetContract: String(row["asset_contract"]),
      paymentCount: Number(row["n"]),
      uniqueSellers: Number(row["sellers"]),
      totalVolume: String(row["total"]),
    }));
    const topRow = topResult.rows[0];
    const topAsset: TopAsset | undefined = topRow
      ? { assetContract: String(topRow["asset_contract"]), count: Number(topRow["n"]) }
      : undefined;

    return { items, totalDistinctAssets: Number(countResult.rows[0]?.["n"] ?? 0), topAsset };
  }

  async getAssetStats(assetContract: string): Promise<AssetStats> {
    const result = await this.client.execute({
      sql: `SELECT COUNT(*) as n, CAST(SUM(CAST(amount AS INTEGER)) AS TEXT) as total,
                   COUNT(DISTINCT buyer) as buyers, COUNT(DISTINCT seller) as sellers,
                   MIN(closed_at) as first_at, MAX(closed_at) as last_at
            FROM payments WHERE asset_contract = ?`,
      args: [assetContract],
    });
    const row = result.rows[0];
    const total = row?.["total"];
    const firstAt = row?.["first_at"];
    const lastAt = row?.["last_at"];
    return {
      totalPayments: Number(row?.["n"] ?? 0),
      totalVolume: total === null || total === undefined ? "0" : String(total),
      uniqueBuyers: Number(row?.["buyers"] ?? 0),
      uniqueSellers: Number(row?.["sellers"] ?? 0),
      firstPaymentAt: firstAt === null || firstAt === undefined ? undefined : String(firstAt),
      lastPaymentAt: lastAt === null || lastAt === undefined ? undefined : String(lastAt),
    };
  }

  /** All three matrix rows in one call, not three round trips - the page renders them
   * simultaneously, so that's the natural unit of work here. */
  async getAssetWindowMatrix(assetContract: string, now: () => Date = () => new Date()): Promise<AssetWindowStats[]> {
    const windows: readonly { readonly window: "24h" | "7d" | "30d"; readonly ms: number }[] = [
      { window: "24h", ms: 24 * 60 * 60 * 1000 },
      { window: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
      { window: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
    ];
    const results = await Promise.all(
      windows.map(w => {
        const sinceIso = new Date(now().getTime() - w.ms).toISOString();
        return this.client.execute({
          sql: `SELECT COUNT(*) as n, CAST(SUM(CAST(amount AS INTEGER)) AS TEXT) as total,
                       COUNT(DISTINCT buyer) as buyers, COUNT(DISTINCT seller) as sellers
                FROM payments WHERE asset_contract = ? AND closed_at >= ?`,
          args: [assetContract, sinceIso],
        });
      }),
    );
    return windows.map((w, i) => {
      const row = results[i]?.rows[0];
      const total = row?.["total"];
      return {
        window: w.window,
        payments: Number(row?.["n"] ?? 0),
        volume: total === null || total === undefined ? "0" : String(total),
        buyers: Number(row?.["buyers"] ?? 0),
        sellers: Number(row?.["sellers"] ?? 0),
      };
    });
  }

  /** A single filtered COUNT, not the full trailing-window/growth-delta machinery a real "active
   * in the last N days" feature would eventually need — just enough for one honest stat card. */
  async countDistinctSellersSince(sinceIso: string): Promise<number> {
    const result = await this.client.execute({
      sql: "SELECT COUNT(DISTINCT seller) as n FROM payments WHERE closed_at >= ?",
      args: [sinceIso],
    });
    return Number(result.rows[0]?.["n"] ?? 0);
  }

  /** Same simplicity note as countDistinctSellersSince. */
  async countPaymentsSince(sinceIso: string): Promise<number> {
    const result = await this.client.execute({
      sql: "SELECT COUNT(*) as n FROM payments WHERE closed_at >= ?",
      args: [sinceIso],
    });
    return Number(result.rows[0]?.["n"] ?? 0);
  }

  /** Daily buckets only for v1 — `bucket` param threaded through now so a weekly/hourly option
   * doesn't require an API shape change later, even though only "day" is implemented. */
  async getEcosystemTimeseries(): Promise<EcosystemBucket[]> {
    const result = await this.client.execute(
      `SELECT strftime('%Y-%m-%d', closed_at) as day, facilitator_id, COUNT(*) as n
       FROM payments GROUP BY day, facilitator_id ORDER BY day ASC`,
    );
    const byDay = new Map<string, FacilitatorBreakdownEntry[]>();
    for (const row of result.rows) {
      const day = String(row["day"]);
      const entry: FacilitatorBreakdownEntry = {
        facilitatorId: row["facilitator_id"] === null ? null : String(row["facilitator_id"]),
        count: Number(row["n"]),
      };
      const list = byDay.get(day);
      if (list) list.push(entry);
      else byDay.set(day, [entry]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, byFacilitator]) => ({
        date,
        totalPayments: byFacilitator.reduce((sum, e) => sum + e.count, 0),
        byFacilitator,
      }));
  }

  async getCursor(network: string): Promise<CursorState | undefined> {
    const result = await this.client.execute({
      sql: "SELECT cursor, last_ledger FROM cursors WHERE network = ?",
      args: [network],
    });
    const row = result.rows[0];
    if (!row) return undefined;
    const cursor = row["cursor"];
    return {
      ...(typeof cursor === "string" ? { cursor } : {}),
      lastLedger: Number(row["last_ledger"]),
    };
  }

  async setCursor(network: string, state: CursorState, now: () => Date = () => new Date()): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO cursors (network, cursor, last_ledger, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(network) DO UPDATE SET cursor = excluded.cursor,
              last_ledger = excluded.last_ledger, updated_at = excluded.updated_at`,
      args: [network, state.cursor ?? null, state.lastLedger, now().toISOString()],
    });
  }

  /** undefined = never attempted (no row); null = attempted, no symbol found; string = resolved. */
  async getAssetSymbol(assetContract: string): Promise<string | null | undefined> {
    const result = await this.client.execute({
      sql: "SELECT symbol FROM asset_symbols WHERE asset_contract = ?",
      args: [assetContract],
    });
    const row = result.rows[0];
    if (!row) return undefined;
    const symbol = row["symbol"];
    return symbol === null ? null : String(symbol);
  }

  async setAssetSymbol(assetContract: string, symbol: string | null, now: () => Date = () => new Date()): Promise<void> {
    await this.client.execute({
      sql: `INSERT INTO asset_symbols (asset_contract, symbol, resolved_at)
            VALUES (?, ?, ?)
            ON CONFLICT(asset_contract) DO UPDATE SET symbol = excluded.symbol, resolved_at = excluded.resolved_at`,
      args: [assetContract, symbol, now().toISOString()],
    });
  }

  /** All cached symbols in one map, for enrichment reads (assets/sellers/facilitators list
   * endpoints) that need to label many contracts without one query each. */
  async getAllAssetSymbols(): Promise<ReadonlyMap<string, string>> {
    const result = await this.client.execute("SELECT asset_contract, symbol FROM asset_symbols WHERE symbol IS NOT NULL");
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(String(row["asset_contract"]), String(row["symbol"]));
    }
    return map;
  }
}

function toPaymentRow(row: Record<string, unknown>): PaymentRow {
  return {
    txHash: String(row["tx_hash"]),
    ledger: Number(row["ledger"]),
    closedAt: String(row["closed_at"]),
    buyer: String(row["buyer"]),
    seller: String(row["seller"]),
    sponsor: String(row["sponsor"]),
    amount: String(row["amount"]), // TEXT column already; String() here guards the type, not the value
    assetContract: String(row["asset_contract"]),
    feeBumped: Number(row["fee_bumped"]) === 1,
    facilitatorId: row["facilitator_id"] === null ? null : String(row["facilitator_id"]),
    ingestedAt: String(row["ingested_at"]),
  };
}
