import { defineConfig } from "tsup";

// Left external, these ESM-only deps break consumers' Jest; shims supplies import.meta.url.
const bundleEsmOnlyDeps = {
  noExternal: ["objection", "node-fetch"],
  shims: true,
};

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    ...bundleEsmOnlyDeps,
  },
  { entry: ["src/devServer.ts"], format: ["cjs"], ...bundleEsmOnlyDeps },
]);
