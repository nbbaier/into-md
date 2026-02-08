import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const app = await alchemy("into-md", {
  stateStore: (scope) => new CloudflareStateStore(scope),
});

export const worker = await Worker("website", {
  entrypoint: "./website/index.tsx",
  compatibilityDate: "2026-02-07",
  compatibilityFlags: ["nodejs_compat"],
  domains: ["into-md.nicobaier.com"],
});

console.log(`Worker deployed at: ${worker.url}`);

await app.finalize();
