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
 *
 * v3 — upto scheme (2026-08-21). A settlement through an upto-scheme contract
 * (config.uptoContracts) never invokes `transfer` directly — it invokes the
 * contract's `settle(token, from, to, max_amount, expiration_ledger, nonce,
 * actual_amount, hook)`, which moves the token as a NESTED sub-invocation.
 * Two things follow:
 *
 *   - `from` for the sponsorship check comes from the ENVELOPE (arg 1 of the
 *     signed invocation — the signature is real regardless of what actually
 *     executed).
 *   - `to` and `amount` do NOT come from the envelope's args. `args[3]`
 *     (`max_amount`) is the signed CEILING, not what settled, and `args[6]`
 *     (`actual_amount`) is whatever the facilitator PUT there when it built
 *     the transaction — trusting it would mean trusting the facilitator to
 *     have reported itself honestly, the exact thing sponsorship-detection
 *     exists to not do. Ground truth is the token contract's OWN emitted
 *     `transfer` event (SEP-41's standard event, contract_id == usdcSac),
 *     read from the RPC result's `events.contractEventsJson` — that fires
 *     with the amount the chain actually moved, no matter how many
 *     contract layers orchestrated it.
 *
 * getEvents' candidate discovery (indexer.ts, filtered on the usdcSac
 * transfer topic) already surfaces these transactions unmodified: the
 * underlying token transfer emits the same canonical event regardless of
 * scheme. Only this classifier needed to learn the second shape.
 */

export type PaymentScheme = "exact" | "upto";

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
  readonly scheme: PaymentScheme;
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

interface ContractEvent {
  readonly contractId: string;
  readonly topics: readonly unknown[];
  readonly data: unknown;
}

/** Contract events for one operation, from getTransaction's `events.contractEventsJson`
 * (`xdrFormat: "json"` — same RPC call already made for envelopeJson, no extra round trip).
 * That field is an array-per-operation; index-aligned with `parts.operations`, same as the
 * envelope itself. Empty, never throws, when the shape is missing or unexpected — a v3
 * candidate simply fails to match and falls through, same failure mode as every other
 * malformed-input case in this file. */
function contractEventsForOp(rawResult: Record<string, unknown>, opIndex: number): ContractEvent[] {
  const perOp = arr(rec(rawResult["events"])?.["contractEventsJson"]);
  const opEvents = arr(perOp?.[opIndex]) ?? [];
  const out: ContractEvent[] = [];
  for (const raw of opEvents) {
    const e = rec(raw);
    const contractId = str(e?.["contract_id"]);
    const body = rec(rec(e?.["body"])?.["v0"]);
    if (!contractId || !body) continue;
    out.push({ contractId, topics: arr(body["topics"]) ?? [], data: body["data"] });
  }
  return out;
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

  for (const [opIndex, rawOp] of parts.operations.entries()) {
    const op = rec(rawOp);
    const ihf = rec(rec(op?.["body"])?.["invoke_host_function"]);
    const inv = rec(rec(ihf?.["host_function"])?.["invoke_contract"]);
    if (!ihf || !inv) continue;
    const contract = str(inv["contract_address"]);
    const fn = str(inv["function_name"]);
    const args = arr(inv["args"]) ?? [];
    if (!contract) continue;

    const opSource = str(op?.["source_account"]) ?? parts.txSource;
    // The actual sponsorship check, shared by both schemes below: a detached auth entry
    // authorizes `from`, and `from` is not whoever is paying (op source, tx source, or the
    // fee-bump fee source).
    const sponsored = (from: string): boolean =>
      addressAuths(arr(ihf["auth"])).some(a => a.address === from) &&
      from !== opSource &&
      from !== parts.txSource &&
      from !== parts.feeSource;

    if (contract === config.usdcSac && fn === "transfer" && args.length === 3) {
      const from = str(rec(args[0])?.["address"]);
      const to = str(rec(args[1])?.["address"]);
      const amount = safeBigIntString(rec(args[2])?.["i128"]);
      if (!from || !to || amount === undefined || !sponsored(from)) continue;

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
        scheme: "exact",
      };
    }

    if (config.uptoContracts.includes(contract) && fn === "settle" && args.length === 8) {
      // Arg order per contracts/upto-stellar/src/lib.rs:
      // (token, from, to, max_amount, expiration_ledger, nonce, actual_amount, hook).
      // `from` (arg 1) is what the sponsorship check needs and is safe to read from the
      // envelope — see the v3 header note for why `to`/`amount` are NOT read from here.
      const from = str(rec(args[1])?.["address"]);
      if (!from || !sponsored(from)) continue;

      const transferEvent = contractEventsForOp(result, opIndex).find(
        e =>
          e.contractId === config.usdcSac &&
          str(rec(e.topics[0])?.["symbol"]) === "transfer" &&
          str(rec(e.topics[1])?.["address"]) === from,
      );
      if (!transferEvent) continue;
      const to = str(rec(transferEvent.topics[2])?.["address"]);
      const amount = safeBigIntString(rec(transferEvent.data)?.["i128"]);
      if (!to || amount === undefined) continue;

      return {
        txHash,
        ledger,
        closedAt,
        ...(parts.feeSource !== undefined ? { feeSource: parts.feeSource } : {}),
        txSource: parts.txSource,
        ...(opSource !== parts.txSource ? { opSource } : {}),
        assetContract: config.usdcSac,
        from,
        to,
        amount,
        feeBumped: parts.feeBumped,
        scheme: "upto",
      };
    }
  }
  return null;
}
