import { describe, expect, it } from "vitest";
import { classifyTransaction } from "./classify.js";
import { TESTNET } from "./config.js";

/**
 * Offline tests for the x402 classifier. No network, no database, no mocks: classifyTransaction()
 * takes a plain object (a Soroban RPC `getTransaction` result, `xdrFormat: "json"`) and a
 * NetworkConfig, and returns a PaymentMatch or null.
 *
 * Why this file exists: a wrong classifier fails SILENTLY. It returns null for a real settlement
 * and the explorer simply never shows it — no error, no log, no counter. That is exactly what the
 * v1 (fee-bump-required) heuristic did to Vellar's own primary settlement pattern before it was
 * caught during validation (see the header of classify.ts). Tests 1 and 15 are the regression
 * guards for that class of failure.
 *
 * FIXTURE PROVENANCE. scripts/validate-heuristic.ts holds ground-truth tx HASHES but fetches their
 * bodies live; the three upto hashes it names have since aged out of testnet RPC retention. The
 * shapes below were therefore verified against real `getTransaction` responses captured from
 * testnet on 2026-09-07 with the indexer's own getEvents query (USDC SAC `transfer` topic):
 *
 *   bc800be9d128318f7654ad36286c6c6117d84e29e895bc9d53b4917e622b5859  plain tx, sponsor = tx source
 *   376732c4eb7bf38470ec0c7b3386a14e22021633d2e7defeda499d6319fad216  CAP-15 fee-bump sponsorship
 *   ed115a9135d8bf3ccc7cf118307d49f4800860f5f9c6576777d74b6b588fd36d  classic `payment` op, not x402
 *
 * Every field name and nesting level in the builders below is copied from those responses, and
 * only fields the classifier actually reads (plus the discriminant keys around them) are kept.
 * Real responses carry more (fee, seq_num, cond, memo, ext, resultJson, resultMetaJson, …) — all
 * ignored by classify.ts, and omitting them keeps each fixture readable. Where a fixture departs
 * from its model tx (e.g. a substituted address), the departure is called out inline.
 */

type Json = Record<string, unknown>;
/** An ScVal as XDR-JSON renders it: a one-key object (`{address}`, `{i128}`, `{u32}`, …) for
 * every typed value, except void, which is the bare string `"void"`. */
type ScVal = Json | string;

// ---------------------------------------------------------------------------------------------
// Addresses. All real testnet keys, taken from the captured transactions or from this repo's own
// config/registry, so the fixtures never contain an invented strkey.
// ---------------------------------------------------------------------------------------------

const USDC = TESTNET.usdcSac;

/** The upto contract these tests exercise is whatever config actually watches — so a config
 * change is tested as itself, not against a stale copy of the address. */
function firstUptoContract(): string {
  const [first] = TESTNET.uptoContracts;
  if (first === undefined) {
    throw new Error("TESTNET.uptoContracts must list the vellar-facilitator contract for these tests");
  }
  return first;
}
const VELLAR_UPTO = firstUptoContract();

/** USDC issuer's classic-asset string, the 4th topic on every real SAC transfer event. */
const USDC_ASSET_STRING = "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

// bc800be9… — plain-tx sponsorship (Vellar's primary pattern, though this particular tx is from
// another facilitator using the same shape).
const PLAIN_SPONSOR = "GAE6BEVEA6IH4HLTGU3AEGZZWSLNCCWLKD4GLN2XHLXFFNFB24COWUJY"; // tx source_account
const PLAIN_BUYER = "CA56W7PQKSVSUHM6ZE6VLCTWDGIPC7IRMFWCM7G5IIQRZHSW4RXNQF3L"; // auth entry + `from`

// 376732c4… — fee-bump sponsorship.
const BUMP_FEE_SOURCE = "GCNJB6V5YIODDSSCWXZ2VOKMRPRVZ2V723RRQS6STXE6NWTGVOJY35CN";
const BUMP_INNER_SOURCE = "GCTACB5THVIVICW24JESWEA3ZK57XN5DMHEZLC6ZNUVWRQDZWZV4YU7D";
const BUMP_BUYER = "CAEL3D7PJBDIPM33FSNJCUH5XLADWVZ3ZYQB3I3HXYMGKTQOXF7PAUIT";
const BUMP_SELLER = "GD7PAVKITYLLTUNHXLWLHLIFGANKIKSI5BW66D3BR4JOD65VFEB5SBGB";

// ed115a91… — classic payment; also reused as the distinct seller for the plain-tx fixture (in the
// real bc800be9… the sponsor happens to also be the recipient, which would blur the three roles
// the assertions want to keep distinct).
const CLASSIC_PAYER = "GBLL4H5NGR36UU675XFVTFXTZOX35YR2JCSSV65J425CRQ2JFIOZXG3H";
const SELLER = "GBQUDF62IERDQ7DWZT74UJUI2JMZURGSWM7V25WXQI6ELWVFEG37CXAL";

/** Vellar's hosted sponsor (registry.ts KNOWN_SIGNERS) — the tx source on upto settlements. */
const VELLAR_SPONSOR = "GBUCR6H22CZC5OYHBJIEUS2JFZBOB63AHEGTCV6UEPMD2TMLKG2ZMIW4";

/** A real, unrelated contract (the smart-wallet policy that emitted `spending_limit_enforced` in
 * 376732c4…). Stands in for "some contract that is neither USDC nor an upto contract." */
const OTHER_CONTRACT = "CABXBYJNZ7IUW4G3D6BND5YCAQF3ASSDMDAOKQQ63UYFSO7WUU2TIP5G";

// ---------------------------------------------------------------------------------------------
// ScVal / envelope builders — shapes copied verbatim from the captured responses.
// ---------------------------------------------------------------------------------------------

const addr = (address: string): Json => ({ address });
const i128 = (value: string): Json => ({ i128: value });
const u32 = (value: number): Json => ({ u32: value });

/** One address-credentialed auth entry, as RPC renders `auth[]`. Only `credentials.address.address`
 * is read by the classifier; the rest is kept so the entry looks like the real thing. */
function authEntry(address: string, invocation: { contract: string; fn: string; args: readonly ScVal[] }): Json {
  return {
    credentials: {
      address: {
        address,
        nonce: "4676789411197059950",
        signature_expiration_ledger: 4554467,
        signature: { vec: [] },
      },
    },
    root_invocation: {
      function: {
        contract_fn: { contract_address: invocation.contract, function_name: invocation.fn, args: invocation.args },
      },
      sub_invocations: [],
    },
  };
}

interface InvokeOpSpec {
  readonly contract: string;
  readonly fn: string;
  readonly args: readonly ScVal[];
  /** Addresses that get a detached auth entry. Defaults to none. */
  readonly authorized?: readonly string[];
}

/** An `invoke_host_function` operation. `source_account: null` mirrors real RPC output — the key
 * is present and null when the op inherits the transaction's source. */
function invokeOp(spec: InvokeOpSpec): Json {
  return {
    source_account: null,
    body: {
      invoke_host_function: {
        host_function: {
          invoke_contract: { contract_address: spec.contract, function_name: spec.fn, args: spec.args },
        },
        auth: (spec.authorized ?? []).map(a => authEntry(a, spec)),
      },
    },
  };
}

/** A classic `payment` op, verbatim from ed115a91…. Not an invoke_host_function, so the classifier
 * must skip it — yet it DOES emit the USDC SAC transfer event, so the indexer sees it as a
 * candidate. That is what makes it the right "non-invocation op" fixture. */
function classicPaymentOp(): Json {
  return {
    source_account: null,
    body: {
      payment: {
        destination: SELLER,
        asset: {
          credit_alphanum4: { asset_code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
        },
        amount: "10000000",
      },
    },
  };
}

/** SEP-41 `transfer` event as rendered in `events.contractEventsJson[opIndex][]`. */
function transferEvent(from: string, to: string, amount: string, contractId: string = USDC): Json {
  return {
    ext: "v0",
    contract_id: contractId,
    type: "contract",
    body: {
      v0: {
        topics: [{ symbol: "transfer" }, addr(from), addr(to), { string: USDC_ASSET_STRING }],
        data: i128(amount),
      },
    },
  };
}

function plainEnvelope(sourceAccount: string, operations: readonly Json[]): Json {
  return { tx: { tx: { source_account: sourceAccount, operations }, signatures: [] } };
}

function feeBumpEnvelope(feeSource: string, innerSource: string, operations: readonly Json[]): Json {
  return {
    tx_fee_bump: {
      tx: {
        fee_source: feeSource,
        fee: "44367",
        inner_tx: { tx: { tx: { source_account: innerSource, operations }, signatures: [] } },
        ext: "v0",
      },
      signatures: [],
    },
  };
}

interface TxSpec {
  readonly txHash: string;
  readonly ledger: number;
  /** Unix seconds as a STRING — that is how RPC renders createdAt. */
  readonly createdAt: string;
  readonly status?: string;
  readonly envelopeJson: Json;
  /** `events.contractEventsJson`: one array of events per operation, index-aligned with the
   * envelope's operations. Defaults to no events at all. */
  readonly contractEvents?: readonly (readonly Json[])[];
}

/** A `getTransaction` result. */
function txResult(spec: TxSpec): Json {
  return {
    status: spec.status ?? "SUCCESS",
    txHash: spec.txHash,
    ledger: spec.ledger,
    createdAt: spec.createdAt,
    envelopeJson: spec.envelopeJson,
    events: { transactionEventsJson: [], contractEventsJson: spec.contractEvents ?? [] },
  };
}

// ---------------------------------------------------------------------------------------------
// Canonical fixtures. Each exact-scheme builder accepts overrides so the negative tests are
// one-field mutations of a known-good positive — a mismatch then proves the specific check under
// test, not some unrelated shape difference.
// ---------------------------------------------------------------------------------------------

interface ExactOverrides {
  readonly contract?: string;
  readonly fn?: string;
  readonly args?: readonly ScVal[];
  readonly authorized?: readonly string[];
  readonly status?: string;
}

/** Modeled after bc800be9…: plain tx, sponsor is the tx source, buyer authorizes via a detached
 * auth entry. Seller substituted (see SELLER above). */
function plainExactSettlement(o: ExactOverrides = {}): Json {
  const op = invokeOp({
    contract: o.contract ?? USDC,
    fn: o.fn ?? "transfer",
    args: o.args ?? [addr(PLAIN_BUYER), addr(SELLER), i128("20000000")],
    authorized: o.authorized ?? [PLAIN_BUYER],
  });
  return txResult({
    txHash: "bc800be9d128318f7654ad36286c6c6117d84e29e895bc9d53b4917e622b5859",
    ledger: 4554370,
    createdAt: "1788795437",
    ...(o.status !== undefined ? { status: o.status } : {}),
    envelopeJson: plainEnvelope(PLAIN_SPONSOR, [op]),
    contractEvents: [[transferEvent(PLAIN_BUYER, SELLER, "20000000")]],
  });
}

/** Expected PaymentMatch for plainExactSettlement() with no overrides. Note what is ABSENT:
 * no `feeSource` (plain tx) and no `opSource` (the op inherits the tx source). */
const PLAIN_EXACT_MATCH = {
  txHash: "bc800be9d128318f7654ad36286c6c6117d84e29e895bc9d53b4917e622b5859",
  ledger: 4554370,
  closedAt: "2026-09-07T15:37:17.000Z",
  txSource: PLAIN_SPONSOR,
  assetContract: USDC,
  from: PLAIN_BUYER,
  to: SELLER,
  amount: "20000000",
  feeBumped: false,
  scheme: "exact",
} as const;

/** Modeled after 376732c4…: CAP-15 fee-bump wrapper, fee source ≠ inner source ≠ buyer. */
function feeBumpExactSettlement(): Json {
  const op = invokeOp({
    contract: USDC,
    fn: "transfer",
    args: [addr(BUMP_BUYER), addr(BUMP_SELLER), i128("10000000")],
    authorized: [BUMP_BUYER],
  });
  return txResult({
    txHash: "376732c4eb7bf38470ec0c7b3386a14e22021633d2e7defeda499d6319fad216",
    ledger: 4558190,
    createdAt: "1788814537",
    envelopeJson: feeBumpEnvelope(BUMP_FEE_SOURCE, BUMP_INNER_SOURCE, [op]),
    contractEvents: [[transferEvent(BUMP_BUYER, BUMP_SELLER, "10000000")]],
  });
}

const UPTO_BUYER = CLASSIC_PAYER;
/** Deliberately NOT the real recipient — proves `to` is read from the event, not args[2]. */
const UPTO_DECOY_TO = BUMP_SELLER;

interface UptoOverrides {
  readonly contract?: string;
  readonly args?: readonly ScVal[];
  /** Overrides the events for the settle op. `undefined` = the honest transfer event. */
  readonly opEvents?: readonly Json[];
  readonly events?: TxSpec["contractEvents"];
}

/**
 * Modeled on the ground-truth upto settlement 72c816a6… named in scripts/validate-heuristic.ts
 * ("actual 400000 under a 1000000 ceiling"), whose body is no longer retrievable from RPC. The
 * `settle` arg order is the one classify.ts documents from contracts/upto-stellar/src/lib.rs:
 *   (token, from, to, max_amount, expiration_ledger, nonce, actual_amount, hook)
 * args[4], [5] and [7] are opaque to the classifier; their ScVal types here are placeholders.
 *
 * The envelope args carry DECOYS on purpose: args[2] `to` is a different account and args[6]
 * `actual_amount` is a lie ("999999"). A real tx would have consistent values — the decoys exist
 * so that the assertion `to === SELLER && amount === "400000"` can only pass if the classifier
 * read the token contract's own emitted transfer event, never the facilitator-supplied args.
 */
function uptoSettlement(o: UptoOverrides = {}): Json {
  const op = invokeOp({
    contract: o.contract ?? VELLAR_UPTO,
    fn: "settle",
    args: o.args ?? [
      addr(USDC), // token
      addr(UPTO_BUYER), // from — the only arg the classifier trusts
      addr(UPTO_DECOY_TO), // to (decoy)
      i128("1000000"), // max_amount — the signed ceiling, not what settled
      u32(4600000), // expiration_ledger
      i128("1"), // nonce
      i128("999999"), // actual_amount — facilitator-reported, deliberately wrong
      "void", // hook
    ],
    authorized: [UPTO_BUYER],
  });
  const opEvents = o.opEvents ?? [transferEvent(UPTO_BUYER, SELLER, "400000")];
  return txResult({
    txHash: "72c816a63ab9da21b1403ff5199e4f21b9947c0769c55312a8cf0dc7e6ecf3db",
    ledger: 4200000,
    createdAt: "1787270400",
    envelopeJson: plainEnvelope(VELLAR_SPONSOR, [op]),
    contractEvents: o.events ?? [opEvents],
  });
}

const UPTO_MATCH = {
  txHash: "72c816a63ab9da21b1403ff5199e4f21b9947c0769c55312a8cf0dc7e6ecf3db",
  ledger: 4200000,
  closedAt: "2026-08-21T00:00:00.000Z",
  txSource: VELLAR_SPONSOR,
  assetContract: USDC,
  from: UPTO_BUYER,
  to: SELLER,
  amount: "400000",
  feeBumped: false,
  scheme: "upto",
} as const;

// ---------------------------------------------------------------------------------------------
// GROUP 1 — Exact scheme, plain-tx sponsorship
// ---------------------------------------------------------------------------------------------

describe("classifyTransaction — exact scheme", () => {
  it("1. matches a plain-tx settlement whose sponsor is the tx source_account (no fee-bump)", () => {
    const match = classifyTransaction(plainExactSettlement(), TESTNET);

    expect(match).toStrictEqual(PLAIN_EXACT_MATCH);
    // The indexer derives the sponsor as `feeSource ?? txSource`; for a plain tx that must be the
    // tx source — the account the registry attributes.
    expect(match?.feeSource ?? match?.txSource).toBe(PLAIN_SPONSOR);
  });

  it("2. matches a fee-bumped settlement and records feeBumped: true with the fee source", () => {
    const match = classifyTransaction(feeBumpExactSettlement(), TESTNET);

    expect(match).toStrictEqual({
      txHash: "376732c4eb7bf38470ec0c7b3386a14e22021633d2e7defeda499d6319fad216",
      ledger: 4558190,
      closedAt: "2026-09-07T20:55:37.000Z",
      feeSource: BUMP_FEE_SOURCE,
      txSource: BUMP_INNER_SOURCE,
      assetContract: USDC,
      from: BUMP_BUYER,
      to: BUMP_SELLER,
      amount: "10000000",
      feeBumped: true,
      scheme: "exact",
    });
    // Under fee-bump the sponsor is whoever paid the fee, not the inner tx's source.
    expect(match?.feeSource ?? match?.txSource).toBe(BUMP_FEE_SOURCE);
  });

  it("3. returns null when the authorizing account IS the tx source (self-sponsored, not x402)", () => {
    // Same shape as test 1, but `from` is the tx source and authorizes itself. The auth entry is
    // present — that alone must not count; sponsorship requires from ∉ {op, tx, fee source}.
    const selfSponsored = plainExactSettlement({
      args: [addr(PLAIN_SPONSOR), addr(SELLER), i128("20000000")],
      authorized: [PLAIN_SPONSOR],
    });

    expect(classifyTransaction(selfSponsored, TESTNET)).toBeNull();
  });

  it("4. returns null for a `transfer` on a contract other than the watched USDC SAC", () => {
    expect(classifyTransaction(plainExactSettlement({ contract: OTHER_CONTRACT }), TESTNET)).toBeNull();
  });

  it("5. returns null for a USDC invocation whose function is not `transfer`", () => {
    expect(classifyTransaction(plainExactSettlement({ fn: "approve" }), TESTNET)).toBeNull();
  });

  it("6. returns null for a `transfer` with the wrong number of args", () => {
    const twoArgs = plainExactSettlement({ args: [addr(PLAIN_BUYER), addr(SELLER)] });
    const fourArgs = plainExactSettlement({
      args: [addr(PLAIN_BUYER), addr(SELLER), i128("20000000"), i128("0")],
    });

    expect(classifyTransaction(twoArgs, TESTNET)).toBeNull();
    expect(classifyTransaction(fourArgs, TESTNET)).toBeNull();
  });

  it("7. returns null when status is not SUCCESS, even if the envelope would otherwise match", () => {
    expect(classifyTransaction(plainExactSettlement({ status: "FAILED" }), TESTNET)).toBeNull();
    expect(classifyTransaction(plainExactSettlement({ status: "NOT_FOUND" }), TESTNET)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// GROUP 2 — Upto scheme
// ---------------------------------------------------------------------------------------------

describe("classifyTransaction — upto scheme", () => {
  it("8. matches a settle() call, reading `from` from args and `to`/amount from the emitted transfer event", () => {
    const match = classifyTransaction(uptoSettlement(), TESTNET);

    expect(match).toStrictEqual(UPTO_MATCH);
    // Spelled out because these are the decoys: neither value appears anywhere in the envelope args.
    expect(match?.to).not.toBe(UPTO_DECOY_TO);
    expect(match?.amount).not.toBe("999999"); // args[6] actual_amount
    expect(match?.amount).not.toBe("1000000"); // args[3] max_amount
  });

  it("9. returns null (fails closed, silently) when no matching USDC transfer event is present", () => {
    // (a) The op emitted nothing at all.
    expect(classifyTransaction(uptoSettlement({ opEvents: [] }), TESTNET)).toBeNull();

    // (b) `events.contractEventsJson` is missing entirely.
    expect(classifyTransaction(uptoSettlement({ events: [] }), TESTNET)).toBeNull();

    // (c) An event exists but is malformed: no `body.v0`, so contractEventsForOp() drops it.
    const malformed = { ext: "v0", contract_id: USDC, type: "contract", body: {} };
    expect(classifyTransaction(uptoSettlement({ opEvents: [malformed] }), TESTNET)).toBeNull();

    // (d) A transfer event exists but from the wrong contract — must not be trusted for USDC.
    const wrongContract = transferEvent(UPTO_BUYER, SELLER, "400000", OTHER_CONTRACT);
    expect(classifyTransaction(uptoSettlement({ opEvents: [wrongContract] }), TESTNET)).toBeNull();

    // (e) A USDC transfer event exists but for a different `from` than the one that signed.
    const wrongFrom = transferEvent(BUMP_BUYER, SELLER, "400000");
    expect(classifyTransaction(uptoSettlement({ opEvents: [wrongFrom] }), TESTNET)).toBeNull();
  });

  it("10. returns null for settle() on a contract that is not in config.uptoContracts", () => {
    expect(classifyTransaction(uptoSettlement({ contract: OTHER_CONTRACT }), TESTNET)).toBeNull();
    // Even the USDC SAC itself doesn't qualify: `settle` is not `transfer`, and USDC isn't an upto contract.
    expect(classifyTransaction(uptoSettlement({ contract: USDC }), TESTNET)).toBeNull();
  });

  it("11. returns null for settle() with the wrong number of args", () => {
    const sevenArgs = uptoSettlement({
      args: [addr(USDC), addr(UPTO_BUYER), addr(SELLER), i128("1000000"), u32(4600000), i128("1"), i128("400000")],
    });
    const nineArgs = uptoSettlement({
      args: [
        addr(USDC), addr(UPTO_BUYER), addr(SELLER), i128("1000000"), u32(4600000), i128("1"), i128("400000"),
        "void", "void",
      ],
    });

    expect(classifyTransaction(sevenArgs, TESTNET)).toBeNull();
    expect(classifyTransaction(nineArgs, TESTNET)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// GROUP 3 — Edge cases and regression guards
// ---------------------------------------------------------------------------------------------

describe("classifyTransaction — edge cases and regression guards", () => {
  it("12. returns null, without throwing, for an empty operations list", () => {
    const empty = txResult({
      txHash: "0000000000000000000000000000000000000000000000000000000000000000",
      ledger: 4554370,
      createdAt: "1788795437",
      envelopeJson: plainEnvelope(PLAIN_SPONSOR, []),
    });

    expect(() => classifyTransaction(empty, TESTNET)).not.toThrow();
    expect(classifyTransaction(empty, TESTNET)).toBeNull();
  });

  it("13. returns null, without throwing, for an operation that is not invoke_host_function", () => {
    // Modeled on ed115a91…: a classic USDC payment. The SAC still emits a transfer event for it,
    // so getEvents surfaces it as a candidate — the classifier is the only thing keeping it out.
    const classic = txResult({
      txHash: "ed115a9135d8bf3ccc7cf118307d49f4800860f5f9c6576777d74b6b588fd36d",
      ledger: 4554022,
      createdAt: "1788793697",
      envelopeJson: plainEnvelope(CLASSIC_PAYER, [classicPaymentOp()]),
      contractEvents: [[transferEvent(CLASSIC_PAYER, SELLER, "10000000")]],
    });

    expect(() => classifyTransaction(classic, TESTNET)).not.toThrow();
    expect(classifyTransaction(classic, TESTNET)).toBeNull();
  });

  it("14. iterates every operation — matches when only the second op is the settlement", () => {
    const settlementOp = invokeOp({
      contract: USDC,
      fn: "transfer",
      args: [addr(PLAIN_BUYER), addr(SELLER), i128("20000000")],
      authorized: [PLAIN_BUYER],
    });
    const multiOp = txResult({
      txHash: "bc800be9d128318f7654ad36286c6c6117d84e29e895bc9d53b4917e622b5859",
      ledger: 4554370,
      createdAt: "1788795437",
      envelopeJson: plainEnvelope(PLAIN_SPONSOR, [classicPaymentOp(), settlementOp]),
      // Index-aligned with the operations: the payment op's event, then the settlement's.
      contractEvents: [
        [transferEvent(PLAIN_SPONSOR, SELLER, "10000000")],
        [transferEvent(PLAIN_BUYER, SELLER, "20000000")],
      ],
    });

    expect(classifyTransaction(multiOp, TESTNET)).toStrictEqual(PLAIN_EXACT_MATCH);
  });

  it("fee-bump is not required for sponsorship detection — plain-tx-as-source is the primary Vellar pattern", () => {
    // Test 15. Identical input to test 1, named for the bug it guards against: the v1 heuristic
    // required a CAP-15 fee-bump wrapper and therefore returned null for every settlement where
    // the sponsor is simply the plain transaction's source_account — Vellar's own pattern. If
    // this test ever fails, real settlements are disappearing from the explorer with no error.
    const match = classifyTransaction(plainExactSettlement(), TESTNET);

    expect(match).not.toBeNull();
    expect(match?.feeBumped).toBe(false);
    expect(match?.feeSource).toBeUndefined();
    expect(match?.txSource).toBe(PLAIN_SPONSOR);
    expect(match).toStrictEqual(PLAIN_EXACT_MATCH);
  });
});
