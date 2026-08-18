import type { NetworkConfig } from "./config.js";

/**
 * The x402 heuristic, v2 — revised after v1 (fee-bump required) produced a
 * confirmed false negative on Vellar's OWN known-real settlement
 * (06063b83…, testnet). Root cause, found by dumping the raw envelope:
 * vellar-facilitator does not use a CAP-15 fee-bump wrapper at all — it
 * submits a PLAIN transaction with the sponsor as the tx `source_account`
 * directly, while the buyer's authorization lives only in the invoked op's
 * detached auth entry (matches technical-doc.md §7: "the facilitator
 * rebuilds the transaction around the buyer's signed auth entry rather than
 * relaying a fully-formed signed tx"). Fee-bump is real on testnet (33/87
 * live-scanned transfer events matched it, from some other active
 * facilitator) but it is one sponsorship pattern, not the only one.
 *
 * The general signal common to BOTH patterns: the account that authorized
 * the transfer (the auth entry's signer) is NOT the account that paid for
 * the transaction. That's what "sponsored" actually means, independent of
 * which Stellar mechanism expresses it:
 *
 *   match := inner tx has an `invoke_host_function` op
 *          ∧ the invoked function is `transfer(from, to, amount)` (3 args)
 *          ∧ the invoked contract == the configured watched SAC (USDC)
 *          ∧ a detached, address-credentialed auth entry authorizes `from`
 *          ∧ from ∉ { op source, tx source, fee-bump fee source }
 *
 * The last line is the actual sponsorship check; it subsumes the old
 * fee-bump-only rule (fee-bump is just one more source in that set) and
 * additionally requires a real auth entry, ruling out an ordinary transfer
 * whose source happens to differ from a co-signing op for unrelated reasons.
 */

export interface PaymentMatch {
  readonly txHash: string;
  readonly ledger: number;
  readonly closedAt: string;
  readonly feeSource?: string;
  readonly txSource: string;
  readonly opSource?: string;
  readonly assetContract: string;
  readonly from: string;
  readonly to: string;
  readonly amount: string;
  /** True if sponsorship was expressed via a CAP-15 fee-bump wrapper, false if via a plain
   * transaction whose source account is the sponsor. Kept because it's a real, useful signal
   * about which pattern a given facilitator uses — not just debug noise. */
  readonly feeBumped: boolean;
}

const rec = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const arr = (v: unknown): readonly unknown[] | undefined => (Array.isArray(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function safeBigIntString(v: unknown): string | undefined {
  if (typeof v !== "string" || !/^-?\d+$/.test(v)) return undefined;
  return v;
}

interface EnvelopeParts {
  readonly feeBumped: boolean;
  readonly feeSource?: string;
  readonly txSource: string;
  readonly operations: readonly unknown[];
}

/** Unwrap a fee-bump envelope down to the inner transaction's operations; plain envelopes are
 * parsed the same way with `feeBumped: false` — no longer a rejection, just a fact recorded. */
function unwrapEnvelope(envelope: Record<string, unknown>): EnvelopeParts | undefined {
  const bump = rec(envelope["tx_fee_bump"]);
  if (bump) {
    const outer = rec(bump["tx"]);
    const feeSource = str(outer?.["fee_source"]);
    const innerTxBody = rec(rec(rec(outer?.["inner_tx"])?.["tx"])?.["tx"]);
    const txSource = str(innerTxBody?.["source_account"]);
    if (!innerTxBody || !txSource) return undefined;
    return {
      feeBumped: true,
      ...(feeSource !== undefined ? { feeSource } : {}),
      txSource,
      operations: arr(innerTxBody["operations"]) ?? [],
    };
  }
  const txBody = rec(rec(envelope["tx"])?.["tx"]);
  const txSource = str(txBody?.["source_account"]);
  if (!txBody || !txSource) return undefined;
  return { feeBumped: false, txSource, operations: arr(txBody["operations"]) ?? [] };
}

interface AddressAuth {
  readonly address: string;
}

/** Address-credentialed auth entries only; the `"source_account"` string form (self-authorized,
 * not a detached delegation) is skipped — it can never be the sponsorship signal we're after. */
function addressAuths(auth: readonly unknown[] | undefined): AddressAuth[] {
  const out: AddressAuth[] = [];
  for (const entry of auth ?? []) {
    const address = str(rec(rec(rec(entry)?.["credentials"])?.["address"])?.["address"]);
    if (address) out.push({ address });
  }
  return out;
}

/** Classify one getTransaction result. Returns null for anything not matching the v2 heuristic. */
export function classifyTransaction(rawResult: unknown, config: NetworkConfig): PaymentMatch | null {
  const result = rec(rawResult);
  if (!result || result["status"] !== "SUCCESS") return null;
  const txHash = str(result["txHash"]);
  const ledger = result["ledger"];
  if (!txHash || typeof ledger !== "number") return null;

  const createdAt = safeBigIntString(str(result["createdAt"]));
  if (createdAt === undefined) return null;
  const closedMs = Number(createdAt) * 1000;
  if (!Number.isFinite(closedMs) || closedMs <= 0) return null;
  const closedAt = new Date(closedMs).toISOString();

  const envelope = rec(result["envelopeJson"]);
  if (!envelope) return null;
  const parts = unwrapEnvelope(envelope);
  if (!parts) return null;

  for (const rawOp of parts.operations) {
    const op = rec(rawOp);
    const ihf = rec(rec(op?.["body"])?.["invoke_host_function"]);
    const inv = rec(rec(ihf?.["host_function"])?.["invoke_contract"]);
    if (!ihf || !inv) continue;
    const contract = str(inv["contract_address"]);
    const fn = str(inv["function_name"]);
    const args = arr(inv["args"]) ?? [];
    if (!contract || contract !== config.usdcSac) continue;
    if (fn !== "transfer" || args.length !== 3) continue;
    const from = str(rec(args[0])?.["address"]);
    const to = str(rec(args[1])?.["address"]);
    const amount = safeBigIntString(rec(args[2])?.["i128"]);
    if (!from || !to || amount === undefined) continue;

    // The actual sponsorship check: a detached auth entry authorizes `from`, and `from` is not
    // whoever is paying (op source, tx source, or the fee-bump fee source).
    const opSource = str(op?.["source_account"]) ?? parts.txSource;
    const hasBuyerAuth = addressAuths(arr(ihf["auth"])).some(a => a.address === from);
    if (!hasBuyerAuth) continue;
    if (from === opSource || from === parts.txSource || from === parts.feeSource) continue;

    return {
      txHash,
      ledger,
      closedAt,
      ...(parts.feeSource !== undefined ? { feeSource: parts.feeSource } : {}),
      txSource: parts.txSource,
      ...(opSource !== parts.txSource ? { opSource } : {}),
      assetContract: contract,
      from,
      to,
      amount,
      feeBumped: parts.feeBumped,
    };
  }
  return null;
}
