import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  platform: "node",
  target: "node18",
  dts: true,
  sourcemap: true,
  clean: true,
  hash: false,
  banner: "#!/usr/bin/env node\n",
});
