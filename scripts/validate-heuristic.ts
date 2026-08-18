// Ground-truth + live validation of the v1 classify heuristic, run BEFORE any
// database/API work — per the explicit build gate: don't build anything
// around the heuristic until it's shown working on real testnet traffic.
import { Keypair } from "@stellar/stellar-sdk";
import { TESTNET, TRANSFER_TOPIC_B64 } from "../src/config.js";
import { classifyTransaction } from "../src/classify.js";
import { getEvents, getHealth, getTransaction } from "../src/rpc.js";

function line(): void {
  console.log("─".repeat(72));
}

async function positiveCase(label: string, hash: string, expectMatch: boolean): Promise<void> {
  line();
  console.log(`CASE: ${label}`);
  console.log(`  tx: ${hash}`);
  const result = await getTransaction(TESTNET.rpcUrl, hash);
  const match = classifyTransaction(result, TESTNET);
  if (match) {
    console.log(`  MATCHED — ledger ${match.ledger}, ${match.amount} stroops`);
    console.log(`    from:  ${match.from}`);
    console.log(`    to:    ${match.to}`);
    console.log(`    asset: ${match.assetContract}`);
    console.log(`    sponsor: ${match.feeSource ?? match.txSource}`);
    console.log(`    pattern: ${match.feeBumped ? "fee-bump wrapper" : "plain tx, sponsor as source"}`);
  } else {
    console.log("  NO MATCH");
  }
  const ok = expectMatch ? match !== null : match === null;
  console.log(ok ? "  ✓ expected result" : "  ✗ UNEXPECTED — heuristic gap found");
}

async function negativeCaseFriendbot(): Promise<void> {
  line();
  console.log("CASE: plain friendbot funding tx (classic CreateAccount, no fee-bump)");
  const kp = Keypair.random();
  const res = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  const body = (await res.json()) as { hash?: string };
  if (!body.hash) {
    console.log("  could not obtain a friendbot tx hash — skipping this case");
    return;
  }
  console.log(`  tx: ${body.hash}`);
  // Friendbot's hash is a Horizon-style tx id; fall back to Horizon if RPC (short retention,
  // ledger-close-timing) hasn't got it yet.
  let result: unknown;
  try {
    result = await getTransaction(TESTNET.rpcUrl, body.hash);
  } catch (error) {
    console.log(`  RPC lookup failed (${(error as Error).message}) — treating as no-match`);
    result = { status: "NOT_FOUND" };
  }
  const match = classifyTransaction(result, TESTNET);
  console.log(match ? "  ✗ UNEXPECTED — matched a plain funding tx" : "  ✓ correctly no match");
}

async function liveScan(): Promise<void> {
  line();
  console.log("LIVE SCAN: recent USDC SAC transfer events on testnet");
  const health = await getHealth(TESTNET.rpcUrl);
  const startLedger = Math.max(health.oldestLedger, health.latestLedger - 200);
  console.log(`  scanning ledgers ${startLedger}..${health.latestLedger}`);

  const result = await getEvents(TESTNET.rpcUrl, {
    filters: [
      {
        type: "contract",
        contractIds: [TESTNET.usdcSac],
        topics: [[TRANSFER_TOPIC_B64, "**"]],
      },
    ],
    startLedger,
    xdrFormat: "json",
    pagination: { limit: 200 },
  });

  const hashes = new Set<string>();
  for (const ev of result.events) {
    const h = (ev as { txHash?: string })?.txHash;
    if (typeof h === "string") hashes.add(h);
  }
  console.log(`  ${result.events.length} transfer event(s) → ${hashes.size} distinct tx hash(es)`);

  let matched = 0;
  let noMatch = 0;
  for (const hash of hashes) {
    try {
      const tx = await getTransaction(TESTNET.rpcUrl, hash);
      const match = classifyTransaction(tx, TESTNET);
      if (match) {
        matched += 1;
        console.log(`    MATCH  ${hash}  ${match.from} → ${match.to}  (${match.amount})`);
      } else {
        noMatch += 1;
        console.log(`    ----   ${hash}  (transfer event present, no sponsorship signal found)`);
      }
    } catch (error) {
      console.log(`    ERROR  ${hash}  ${(error as Error).message}`);
    }
  }
  console.log(`  summary: ${matched} matched x402-shaped, ${noMatch} transfer events did not match`);
}

async function main(): Promise<void> {
  console.log("Validating the v1 classify heuristic against real Stellar testnet data.");
  console.log(`RPC: ${TESTNET.rpcUrl}`);
  console.log(`Watched USDC SAC: ${TESTNET.usdcSac}`);

  await positiveCase(
    "fresh real x402 settlement, canonical testnet USDC (USE_USDC=1 demo.sh)",
    process.argv[2] ?? "REPLACE_WITH_USDC_TX_HASH",
    true,
  );
  if (process.argv[3]) {
    await positiveCase(
      "fresh real x402 settlement, throwaway token (plain demo.sh — should NOT match, wrong asset contract)",
      process.argv[3],
      false,
    );
  }
  await negativeCaseFriendbot();
  await liveScan();
  line();
  console.log("Done.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
