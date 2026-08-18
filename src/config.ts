/**
 * Network config. Testnet only for now — this is the validation phase (indexer +
 * heuristic), not the full multi-network build.
 */
export interface NetworkConfig {
  readonly network: string;
  readonly rpcUrl: string;
  readonly horizonUrl: string;
  /** The asset this v1 heuristic watches. Widened later; USDC only for now. */
  readonly usdcSac: string;
}

export const TESTNET: NetworkConfig = {
  network: "stellar:testnet",
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  // Verified against vellar-facilitator's own demo pair (docs/accounts.md):
  // issuer GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 (Circle, centre.io).
  usdcSac: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
};

/** scvSymbol("transfer") as base64 XDR — the getEvents topic filter. */
export const TRANSFER_TOPIC_B64 = "AAAADwAAAAh0cmFuc2Zlcg==";
