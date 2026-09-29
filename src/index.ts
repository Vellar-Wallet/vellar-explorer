import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { ExplorerStore } from "./db.js";
import { IndexerWorker } from "./indexer.js";
import { registerRoutes } from "./routes.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const store = new ExplorerStore(config.dbUrl, config.dbAuthToken);
  await store.init();

  // One worker per configured network, all sharing this one store — each stamps its own
  // NetworkConfig.network string onto every row it inserts, and each tracks its own cursor
  // (ExplorerStore.getCursor/setCursor are already keyed by that same string).
  const indexers = config.networks.map(
    network =>
      new IndexerWorker({
        store,
        config: { network, pollIntervalMs: config.pollIntervalMs, backscanLedgers: config.backscanLedgers },
      }),
  );
  for (const indexer of indexers) indexer.start();

  const app = Fastify({ logger: true });
  registerRoutes(app, store);

  await app.listen({ port: config.port, host: config.host });

  const shutdown = async (): Promise<void> => {
    for (const indexer of indexers) indexer.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch(error => {
  console.error("[explorer] fatal startup error:", error);
  process.exit(1);
});
