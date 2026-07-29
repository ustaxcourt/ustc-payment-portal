/* istanbul ignore file -- I/O orchestration only; classification logic is in scanner.ts (unit-tested). */

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import Knex from "knex";
import { knexConfigs } from "../db/knexConfig";
import {
  formatFindingsComment,
  hasDestructive,
  hasUnacknowledged,
  isAcknowledged,
  scanStatements,
} from "./scanner";
import type { SqlStatement } from "./scanner";

const MIGRATIONS_DIR = "db/migrations";
const REPORT_PATH = "migration-safety-report.md";

const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

const listMigrations = (baselineRef: string, filter: "A" | "M"): string[] => {
  // `A...HEAD` diffs HEAD against the merge-base — the workflow must fetch BASELINE_REF.
  const out = git(
    "diff",
    `--diff-filter=${filter}`,
    "--name-only",
    `${baselineRef}...HEAD`,
    "--",
    MIGRATIONS_DIR,
  );
  return out ? out.split("\n").filter(Boolean) : [];
};

const isBookkeeping = (sql: string): boolean =>
  /knex_migrations/i.test(sql) ||
  /^\s*(begin|commit|rollback|savepoint|release)\b/i.test(sql);

const captureNewMigrationSql = async (
  orderedNewFiles: string[],
): Promise<SqlStatement[]> => {
  const stash = mkdtempSync(join(tmpdir(), "migsafety-"));
  const moved = orderedNewFiles.map((from) => ({
    from,
    to: join(stash, basename(from)),
  }));

  const knex = Knex(knexConfigs.development);
  const statements: SqlStatement[] = [];
  let currentFile: string | null = null;

  knex.on("query", (data: { sql?: string }) => {
    if (!currentFile || !data.sql || isBookkeeping(data.sql)) return;
    statements.push({ file: currentFile, sql: data.sql });
  });

  try {
    // Phase 1 — baseline: with the new files moved aside, apply only pre-existing migrations.
    for (const { from, to } of moved) renameSync(from, to);
    await knex.migrate.latest();

    for (const { from, to } of moved) renameSync(to, from);

    // Phase 2 — Knex applies pending migrations in filename order, so setting currentFile
    // before each up() correctly attributes the SQL it emits.
    for (const { from } of moved) {
      currentFile = from;
      await knex.migrate.up();
    }
    currentFile = null;
    return statements;
  } finally {
    // Restore any file still stashed (e.g. on failure) so the working tree is left clean.
    for (const { from, to } of moved) {
      if (existsSync(to) && !existsSync(from)) renameSync(to, from);
    }
    await knex.destroy();
  }
};

const writeOutputs = (destructive: boolean, unacknowledged: boolean): void => {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `has_destructive=${destructive}\nhas_unacknowledged=${unacknowledged}\n`,
    );
  }
};

const publishReport = (report: string): void => {
  writeFileSync(REPORT_PATH, `${report}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
  console.log(report);
};

const main = async (): Promise<void> => {
  const baselineRef = process.env.BASELINE_REF || "origin/main";
  const failOnUnacknowledged = process.env.FAIL_ON_UNACKNOWLEDGED !== "false";

  const newFiles = listMigrations(baselineRef, "A").sort();
  const modifiedFiles = listMigrations(baselineRef, "M");

  let modifiedWarning = "";
  if (modifiedFiles.length > 0) {
    modifiedWarning =
      "\n\n> Note: these already-committed migrations were **modified** — editing an applied " +
      "migration causes drift across environments. Prefer a new migration:\n" +
      modifiedFiles.map((f) => `> - \`${f}\``).join("\n");
  }

  if (newFiles.length === 0) {
    const report = formatFindingsComment([]) + modifiedWarning;
    publishReport(report);
    writeOutputs(false, false);
    return;
  }

  const statements = await captureNewMigrationSql(newFiles);

  const acknowledgedFiles = new Set(
    newFiles.filter(
      (file) => existsSync(file) && isAcknowledged(readFileSync(file, "utf8")),
    ),
  );
  const findings = scanStatements(statements, acknowledgedFiles);

  const report = formatFindingsComment(findings) + modifiedWarning;
  publishReport(report);
  writeOutputs(hasDestructive(findings), hasUnacknowledged(findings));

  if (failOnUnacknowledged && hasUnacknowledged(findings)) {
    process.exitCode = 1;
  }
};

main().catch((err: unknown) => {
  console.error("[migration-safety] check failed:", err);
  process.exitCode = 1;
});
