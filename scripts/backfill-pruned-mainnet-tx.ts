// Backfill x402 settlements whose ledgers have already fallen out of Soroban RPC's retention
// window (mainnet keeps ~7 days), so the live indexer's getTransaction-based pipeline can never
// see them. Horizon keeps full history forever, so this decodes each transaction's envelope_xdr
// directly via the SDK and classifies it with the EXACT SAME logic classifyTransaction uses -
// it is not a parallel heuristic, it feeds classifyTransaction a hand-built object shaped like
// RPC's own xdrFormat:"json" getTransaction result, verified field-for-field against a live
// getTransaction response before this script was written (see the session that produced it).
//
// Usage: tsx scripts/backfill-pruned-mainnet-tx.ts <txHash> [<txHash> ...]
import { xdr, StrKey } from "@stellar/stellar-sdk";
import { loadConfig, MAINNET } from "../src/config.js";
import { ExplorerStore } from "../src/db.js";
import { classifyTransaction } from "../src/classify.js";
import { attributeFacilitator } from "../src/registry.js";

const HORIZON_URL = MAINNET.horizonUrl;

function addrToString(scAddr: xdr.ScAddress): string {
  if (scAddr.switch().name === "scAddressTypeAccount") {
    return StrKey.encodeEd25519PublicKey(scAddr.accountId().ed25519());
  }
  // The SDK's own type declares Hash here, but it's a Buffer at runtime -
  // verified directly against a real decoded envelope before this cast was added.
  return StrKey.encodeContract(scAddr.contractId() as unknown as Buffer);
}

function muxedToString(m: xdr.MuxedAccount): string {
  return StrKey.encodeEd25519PublicKey(m.ed25519());
}

/** Builds exactly the subset of RPC's xdrFormat:"json" getTransaction shape that
 *  classifyTransaction reads - verified field names against a live getTransaction call
 *  for a still-in-window transaction, not guessed from documentation. */
function buildRpcJsonResult(
  txHash: string,
  ledger: number,
  createdAtIso: string,
  envelopeXdrB64: string,
): unknown {
  const envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdrB64, "base64");
  const isFeeBump = envelope.switch().name === "envelopeTypeTxFeeBump";

  const innerV1 = isFeeBump ? envelope.feeBump().tx().innerTx().v1() : envelope.v1();
  const innerTx = innerV1.tx();
  const txSource = muxedToString(innerTx.sourceAccount());

  const operations = innerTx.operations().map(op => {
    const body = op.body();
    if (body.switch().name !== "invokeHostFunction") {
      return { body: {} };
    }
    const ihf = body.invokeHostFunctionOp();
    const hostFn = ihf.hostFunction();
    if (hostFn.switch().name !== "hostFunctionTypeInvokeContract") {
      return { body: { invoke_host_function: { host_function: {}, auth: [] } } };
    }
    const inv = hostFn.invokeContract();
    const args = inv.args().map(scVal => scValToJson(scVal));
    const auth = ihf.auth().map(entry => {
      const creds = entry.credentials();
      if (creds.switch().name !== "sorobanCredentialsAddress") return { credentials: {} };
      const address = addrToString(creds.address().address());
      return { credentials: { address: { address } } };
    });
    return {
      source_account: op.sourceAccount() ? muxedToString(op.sourceAccount()!) : undefined,
      body: {
        invoke_host_function: {
          host_function: {
            invoke_contract: {
              contract_address: addrToString(inv.contractAddress()),
              function_name: inv.functionName().toString(),
              args,
            },
          },
          auth,
        },
      },
    };
  });

  const envelopeJson = isFeeBump
    ? {
        tx_fee_bump: {
          tx: {
            fee_source: muxedToString(envelope.feeBump().tx().feeSource()),
            inner_tx: { tx: { tx: { source_account: txSource, operations } } },
          },
        },
      }
    : { tx: { tx: { source_account: txSource, operations } } };

  return {
    status: "SUCCESS",
    txHash,
    ledger,
    createdAt: String(Math.floor(new Date(createdAtIso).getTime() / 1000)),
    envelopeJson,
    // No contractEventsJson: Horizon's envelope_xdr alone cannot reconstruct emitted events, so
    // upto-scheme (nested settle()) transactions cannot be backfilled this way, only direct
    // exact-scheme transfer() calls, which read from the envelope's own args - this script
    // refuses anything else at classify time (classifyTransaction returns null for upto without
    // a matching event, which is the correct, safe failure mode here).
    events: { contractEventsJson: [] },
  };
}

function scValToJson(v: xdr.ScVal): unknown {
  switch (v.switch().name) {
    case "scvAddress":
      return { address: addrToString(v.address()) };
    case "scvI128": {
      const parts = v.i128();
      return { i128: bigIntFromParts(parts.hi().toString(), parts.lo().toString()).toString() };
    }
    default:
      return {};
  }
}

function bigIntFromParts(hi: string, lo: string): bigint {
  return (BigInt(hi) << 64n) + BigInt.asUintN(64, BigInt(lo));
}

async function fetchHorizonTx(hash: string): Promise<{ ledger: number; createdAt: string; envelopeXdr: string }> {
  const res = await fetch(`${HORIZON_URL}/transactions/${hash}`);
  if (!res.ok) throw new Error(`Horizon returned ${res.status} for ${hash}`);
  const data = (await res.json()) as { ledger: number; created_at: string; envelope_xdr: string; successful: boolean };
  if (!data.successful) throw new Error(`${hash} was not successful on-chain, refusing to backfill`);
  return { ledger: data.ledger, createdAt: data.created_at, envelopeXdr: data.envelope_xdr };
}

async function main(): Promise<void> {
  const hashes = process.argv.slice(2);
  if (hashes.length === 0) {
    console.error("Usage: tsx scripts/backfill-pruned-mainnet-tx.ts <txHash> [<txHash> ...]");
    process.exit(1);
  }

  const config = loadConfig();
  const store = new ExplorerStore(config.dbUrl, config.dbAuthToken);
  await store.init();

  for (const hash of hashes) {
    try {
      const { ledger, createdAt, envelopeXdr } = await fetchHorizonTx(hash);
      const rpcJsonResult = buildRpcJsonResult(hash, ledger, createdAt, envelopeXdr);
      const match = classifyTransaction(rpcJsonResult, MAINNET);
      if (!match) {
        console.warn(`[backfill] ${hash}: did not match the x402 heuristic, skipped`);
        continue;
      }
      const attribution = attributeFacilitator(match.feeSource ?? match.txSource);
      const { inserted } = await store.insertPayment({
        txHash: match.txHash,
        network: MAINNET.network,
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
      console.log(
        `[backfill] ${hash}: ${inserted ? "inserted" : "already present"} - ${match.amount} stroops, ${match.from} -> ${match.to}, facilitator=${attribution.facilitatorId ?? "unattributed"}`,
      );
    } catch (err) {
      console.error(`[backfill] ${hash}: FAILED -`, err instanceof Error ? err.message : err);
    }
  }
}

await main();
