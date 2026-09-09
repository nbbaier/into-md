import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const app = await alchemy("into-md", {
  adopt: true,
  stateStore: (scope) => new CloudflareStateStore(scope),
});

export const worker = await Worker("worker", {
  compatibilityDate: "2026-02-07",
  compatibilityFlags: ["nodejs_compat"],
  domains: ["into-md.nicobaier.com", "into-md.dev"],
  entrypoint: "./website/index.tsx",
  name: `into-md-worker-${app.stage}`,
});

console.log({ name: worker.name, url: worker.url });

await app.finalize();
