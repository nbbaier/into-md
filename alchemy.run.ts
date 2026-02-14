import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const app = await alchemy("into-md", {
  stateStore: (scope) => new CloudflareStateStore(scope),
  adopt: true,
});

export const worker = await Worker("worker", {
  name: `into-md-worker-${app.stage}`,
  entrypoint: "./website/index.tsx",
  compatibilityDate: "2026-02-07",
  compatibilityFlags: ["nodejs_compat"],
  domains: ["into-md.nicobaier.com"],
});

console.log({ url: worker.url, name: worker.name });

await app.finalize();
