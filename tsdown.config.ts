import { defineConfig } from "tsdown";

export default defineConfig({
  banner: "#!/usr/bin/env node\n",
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["esm"],
  hash: false,
  outDir: "dist",
  platform: "node",
  sourcemap: true,
  target: "node18",
});
