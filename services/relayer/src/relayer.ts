import { GatewayClient, IrisClient } from "@inletkit/sdk";
import { buildApp } from "./api.js";
import { buildChains } from "./chains.js";
import type { RelayerConfig } from "./config.js";
import { ExitStore, IntentStore } from "./db.js";
import { log } from "./log.js";
import { Pipeline } from "./pipeline.js";

export function createRelayer(config: RelayerConfig) {
  const { account, byDomain } = buildChains(config);
  const store = new IntentStore(config.dbPath);
  const exits = new ExitStore(store.db);
  const pipeline = new Pipeline(config, byDomain, account, store, exits, new IrisClient(config.irisApi), new GatewayClient(config.gatewayApi));
  let running = false;
  let loop: Promise<void> | undefined;

  async function runLoop() {
    while (running) {
      try {
        await pipeline.tick();
      } catch (error) {
        log("loop", error instanceof Error ? error.message : String(error));
      }
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }
  }

  return {
    account,
    store,
    exits,
    pipeline,
    async start() {
      const app = await buildApp(config, byDomain, store, exits);
      const url = await app.listen({ port: config.port, host: "0.0.0.0" });
      running = true;
      loop = runLoop();
      log("relayer", `listening on ${url} as ${account.address}`);
      return {
        url,
        async stop() {
          running = false;
          await loop;
          await app.close();
          store.close();
        },
      };
    },
  };
}
