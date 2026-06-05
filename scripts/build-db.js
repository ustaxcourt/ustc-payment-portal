// Compiles db/migrations/*.ts and db/seeds/**/*.ts to dist/ using esbuild.
// Output paths mirror the source paths (outbase: ".") so that:
//   db/migrations/20260305195503_init_db.ts → dist/db/migrations/20260305195503_init_db.js
//   db/seeds/01_reference_data.ts           → dist/db/seeds/01_reference_data.js
//   db/seeds/data/fees.ts                   → dist/db/seeds/data/fees.js
//
// bundle: false → transforms TypeScript syntax only; requires() are left
// as-is and resolved at runtime (so dist/db/seeds/data/fees.js must also exist).
const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

function collectTs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectTs(full);
      if (entry.isFile() && entry.name.endsWith(".ts")) return [full];
      return [];
    });
}

const entryPoints = [
  ...collectTs("db/migrations"),
  ...collectTs("db/seeds"),
];

if (entryPoints.length === 0) {
  console.log("[build:db] No TypeScript files found in db/migrations or db/seeds.");
  process.exit(0);
}

console.log(`[build:db] Compiling ${entryPoints.length} file(s)...`);

try {
  esbuild.buildSync({
    entryPoints,
    outdir: "dist",
    outbase: ".",
    format: "cjs",
    platform: "node",
    bundle: false,
    tsconfig: "tsconfig.json",
  });
} catch (err) {
  console.error("[build:db] Compile failed:", err.message);
  process.exit(1);
}

console.log("[build:db] Done.");
