/** Display-only formatting. Every function here takes a string and returns a string — no
 * Number()/parseInt/BigInt anywhere, so a value outside safe-integer range can never lose
 * precision just because it passed through a render. */

/** Stroops -> a 7-decimal display string, via string slicing, not numeric parsing. */
export function toDecimal(stroops: string): string {
  const negative = stroops.startsWith("-");
  const digits = (negative ? stroops.slice(1) : stroops).padStart(8, "0");
  const whole = digits.slice(0, -7);
  const fraction = digits.slice(-7).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Truncate a Stellar address/contract for display; the full value belongs in a title attribute. */
export function short(address: string): string {
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Duplicated from src/config.ts's TESTNET.usdcSac on purpose, for display labeling only - web/
 * never imports backend runtime code (only type-only api-types), and this is a public, stable,
 * well-known contract address, not something that needs to stay wired to the backend's config.
 * Used only as a fallback for the brief window before the indexer resolves a symbol on-chain
 * (src/symbol.ts) - once `symbol` is populated, that's the real answer, the same way rail402's
 * own explorer labels assets: off the token itself, not a name/metadata service. */
const KNOWN_USDC_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

export function assetLabel(assetContract: string, symbol?: string | null): string {
  if (symbol) return symbol;
  return assetContract === KNOWN_USDC_SAC ? "USDC" : short(assetContract);
}

export function stellarExpertTxUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

export function stellarExpertAccountUrl(address: string): string {
  const kind = address.startsWith("C") ? "contract" : "account";
  return `https://stellar.expert/explorer/testnet/${kind}/${address}`;
}

/** Relative age (41s, 1m, 2h, 5d) from an ISO timestamp. This one DOES parse a number - it's a
 * wall-clock millisecond delta, nowhere near BigInt range, a completely different value than any
 * on-chain amount. Computed at render time (server-rendered, force-dynamic), so it's accurate as
 * of the request, not stale from a cached build. */
export function formatAge(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return "just now";
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Zero-padded rank: 1 -> "01". */
export function rank(n: number): string {
  return String(n).padStart(2, "0");
}
