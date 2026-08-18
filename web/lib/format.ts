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

export function stellarExpertTxUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}

export function stellarExpertAccountUrl(address: string): string {
  const kind = address.startsWith("C") ? "contract" : "account";
  return `https://stellar.expert/explorer/testnet/${kind}/${address}`;
}
