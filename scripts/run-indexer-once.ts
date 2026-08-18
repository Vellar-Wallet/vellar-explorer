// Manual validation run: real testnet, real local SQLite file, a handful of polls, then dump
// what actually landed. Not a permanent script — the long-running version is src/index.ts once
// routes/health are built. This exists to satisfy the "show me real matched transactions in the
// database before touching the website" gate.
import { loadConfig } from "../src/config.js";
import { ExplorerStore } from "../src/db.js";
import { IndexerWorker } from "../src/indexer.js";

const config = loadConfig({ ...process.env, EXPLORER_DB_URL: "file:./data/validation.db" });
const store = new ExplorerStore(config.dbUrl, config.dbAuthToken);
await store.init();

const indexer = new IndexerWorker({ store, config });

const rounds = Number(process.argv[2] ?? 3);
for (let i = 0; i < rounds; i++) {
  const result = await indexer.pollOnce();
  console.log(`poll ${i + 1}: ${result.candidates} candidates, ${result.matched} matched, ${result.inserted} newly inserted`);
  if (i < rounds - 1) await new Promise(r => setTimeout(r, 4000));
}

console.log("\ncounters:", indexer.counters);

const list = await store.listPayments({ limit: 10 });
console.log(`\n${list.items.length} row(s) in the store (showing up to 10, newest first):\n`);
for (const p of list.items) {
  console.log(
    `${p.txHash}  ledger ${p.ledger}  ${p.amount} stroops  feeBumped=${p.feeBumped}  facilitator=${p.facilitatorId ?? "unattributed"}`,
  );
  console.log(`  ${p.buyer} -> ${p.seller}  (sponsor ${p.sponsor})`);
  console.log(`  amount type: ${typeof p.amount}  raw value: ${JSON.stringify(p.amount)}`);
}
