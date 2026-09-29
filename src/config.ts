/**
 * Network config. Testnet only for now — this is the validation phase (indexer +
 * heuristic), not the full multi-network build.
 */
export interface NetworkConfig {
  readonly network: string;
  readonly rpcUrl: string;
  readonly horizonUrl: string;
  /** Needed to build a well-formed (never-submitted) transaction for read-only contract calls,
   * e.g. resolving an asset's on-chain symbol() in symbol.ts. */
  readonly passphrase: string;
  /** The asset this v1 heuristic watches. Widened later; USDC only for now. */
  readonly usdcSac: string;
  /** upto-scheme settlement contracts this indexer recognizes, alongside the direct-transfer
   *  `exact` heuristic. Each is expected to implement `settle(token, from, to, max_amount,
   *  expiration_ledger, nonce, actual_amount, hook)` — see classify.ts's upto branch for the
   *  exact shape it matches against. Widened by appending, same spirit as usdcSac. */
  readonly uptoContracts: readonly string[];
}

export const TESTNET: NetworkConfig = {
  network: "stellar:testnet",
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  passphrase: "Test SDF Network ; September 2015",
  // Verified against vellar-facilitator's own demo pair (docs/accounts.md):
  // issuer GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 (Circle, centre.io).
  usdcSac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  uptoContracts: [
    // vellar-facilitator, deployed 2026-08-21 from pinned, reviewed source — contract ID and
    // wasm hash published for independent verification:
    // https://github.com/Vellar-Wallet/vellar-facilitator/blob/main/docs/upto-deployment.md
    "CDHPA64M73TUTEM4MMHIWIXINBQXH7JJXFGZMGH22VJWFJFROMR6QV2S",
  ],
};

/** Mainnet, added alongside TESTNET so one process can run an indexer per
 *  network against the same store — see index.ts. Contract IDs match what
 *  vellar-facilitator's own Railway config runs in production (verified
 *  live via /supported, 2026-09-29), not re-derived here. */
export const MAINNET: NetworkConfig = {
  network: "stellar:pubnet",
  rpcUrl: "https://mainnet.sorobanrpc.com",
  horizonUrl: "https://horizon.stellar.org",
  passphrase: "Public Global Stellar Network ; September 2015",
  usdcSac: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
  uptoContracts: [
    // vellar-facilitator's mainnet upto contract — see docs/mainnet-deployment-checklist.md
    // in vellar-facilitator for why this differs from the testnet-only contract above.
    "CCZL7CTRS6GWEYXDYD54DZM3OUHQW2S2A4KSU75SH275P3SFZLL4YQAN",
  ],
};

/** scvSymbol("transfer") as base64 XDR — the getEvents topic filter. */
export const TRANSFER_TOPIC_B64 = "AAAADwAAAAh0cmFuc2Zlcg==";

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  /** The networks this instance indexes. Each entry gets its own IndexerWorker sharing one
   *  store — see index.ts. Kept as a list (not a single NetworkConfig) so adding a third
   *  network later is additive here, not a shape change through every consumer. */
  readonly networks: readonly NetworkConfig[];
  /** libSQL URL. A local file (file:./data/explorer.db) for dev, a Turso libsql:// URL in
   * production — same client either way, per vellar-facilitator's store. */
  readonly dbUrl: string;
  readonly dbAuthToken: string | undefined;
  /** getEvents poll cadence. Ledgers close ~5s apart; polling faster buys nothing. */
  readonly pollIntervalMs: number;
  /** How far behind the head a fresh (cursor-less) start begins. */
  readonly backscanLedgers: number;
}

/** Fail fast, at startup, with a reason — never at first poll. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = Number(env["PORT"] ?? 4200);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid port number, got "${env["PORT"]}"`);
  }
  const pollIntervalMs = Number(env["EXPLORER_POLL_INTERVAL_MS"] ?? 5000);
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 500) {
    throw new Error("EXPLORER_POLL_INTERVAL_MS must be an integer >= 500");
  }
  const backscanLedgers = Number(env["EXPLORER_BACKSCAN_LEDGERS"] ?? 200);
  if (!Number.isInteger(backscanLedgers) || backscanLedgers < 1) {
    throw new Error("EXPLORER_BACKSCAN_LEDGERS must be a positive integer");
  }
  // EXPLORER_NETWORKS=testnet,mainnet (comma-separated). Defaults to testnet only, matching
  // this explorer's behavior before mainnet support existed — an operator who deploys without
  // setting this gets the exact same indexing scope as before, not a silent doubling of RPC
  // load onto a network they never asked for.
  const requested = (env["EXPLORER_NETWORKS"] ?? "testnet")
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0);
  const networkMap: Record<string, NetworkConfig> = { testnet: TESTNET, mainnet: MAINNET };
  const networks = requested.map(name => {
    const cfg = networkMap[name];
    if (!cfg) {
      throw new Error(`EXPLORER_NETWORKS: unknown network "${name}" — expected "testnet" or "mainnet"`);
    }
    return cfg;
  });
  if (networks.length === 0) {
    throw new Error("EXPLORER_NETWORKS must name at least one network");
  }

  return {
    port,
    host: env["HOST"] ?? "0.0.0.0",
    networks,
    dbUrl: env["EXPLORER_DB_URL"] ?? "file:./data/explorer.db",
    dbAuthToken: env["EXPLORER_DB_AUTH_TOKEN"],
    pollIntervalMs,
    backscanLedgers,
  };
}
