/**
 * Pure detector for the CI migration-safety check (PAY-353): classifies migration SQL
 * that breaks expand-contract (drop table/column, rename, NOT NULL without default).
 * I/O-free so it can be unit-tested; the runtime harness feeds it captured SQL.
 * See docs/migration-safety.md.
 */

export type Rule =
  | "drop-table"
  | "drop-column"
  | "rename"
  | "not-null-without-default";

export interface SqlStatement {
  file: string;
  sql: string;
}

export interface Finding {
  rule: Rule;
  file: string;
  statement: string;
  acknowledged: boolean;
}

/** Marker an author adds to a migration to sign off a deliberate destructive change. */
export const ACKNOWLEDGMENT_MARKER = "migration-safety: acknowledged";

export const RULE_INFO: Record<Rule, { label: string; safeAlternative: string }> = {
  "drop-table": {
    label: "Drops a table",
    safeAlternative:
      "Drop it in a later contract migration, after all deployed code has stopped using it.",
  },
  "drop-column": {
    label: "Drops a column",
    safeAlternative:
      "Drop it in a later contract migration, after all deployed code has stopped using it.",
  },
  rename: {
    label: "Renames a table or column",
    safeAlternative:
      "Add the new name, backfill and dual-read, then drop the old name in a later release.",
  },
  "not-null-without-default": {
    label: "Adds or enforces NOT NULL without a default on an existing table",
    safeAlternative:
      "Add the column nullable, backfill it, then enforce NOT NULL in a later migration.",
  },
};

const normalize = (sql: string): string => sql.replace(/\s+/g, " ").trim();

/** Returns the destructive rules a single SQL statement violates (empty = safe/additive). */
export const scanSql = (sql: string): Rule[] => {
  const s = normalize(sql);
  const rules: Rule[] = [];

  if (/\bDROP\s+TABLE\b/i.test(s)) rules.push("drop-table");
  if (/\bDROP\s+COLUMN\b/i.test(s)) rules.push("drop-column");

  // A rename is always ALTER TABLE ... RENAME ... (column or table form).
  if (/\bALTER\s+TABLE\b/i.test(s) && /\bRENAME\b/i.test(s)) rules.push("rename");

  // NOT NULL only breaks existing rows/old inserts on an EXISTING table (ADD COLUMN
  // without DEFAULT, or SET NOT NULL) — NOT NULL inside CREATE TABLE is fine.
  const addsNotNullColumn =
    /\bADD\s+COLUMN\b/i.test(s) &&
    /\bNOT\s+NULL\b/i.test(s) &&
    !/\bDEFAULT\b/i.test(s);
  const setsNotNull = /\bSET\s+NOT\s+NULL\b/i.test(s);
  if (addsNotNullColumn || setsNotNull) rules.push("not-null-without-default");

  return rules;
};

export const scanStatements = (
  statements: readonly SqlStatement[],
  acknowledgedFiles: ReadonlySet<string> = new Set(),
): Finding[] => {
  const findings: Finding[] = [];
  for (const { file, sql } of statements) {
    for (const rule of scanSql(sql)) {
      findings.push({
        rule,
        file,
        statement: normalize(sql),
        acknowledged: acknowledgedFiles.has(file),
      });
    }
  }
  return findings;
};

export const isAcknowledged = (fileContents: string): boolean =>
  fileContents.includes(ACKNOWLEDGMENT_MARKER);

/** Any destructive op (even acknowledged) -> gate the deploy for approval. */
export const hasDestructive = (findings: readonly Finding[]): boolean =>
  findings.length > 0;

/** Destructive ops without sign-off -> block the PR check. */
export const hasUnacknowledged = (findings: readonly Finding[]): boolean =>
  findings.some((f) => !f.acknowledged);

export const formatFindingsComment = (findings: readonly Finding[]): string => {
  if (findings.length === 0) {
    return "### Migration safety check\n\nNo destructive migration operations detected.";
  }

  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }

  const lines: string[] = ["### Migration safety check — destructive operations detected", ""];
  lines.push(
    hasUnacknowledged(findings)
      ? "The following operations break backward compatibility (expand-contract). Sign off deliberate changes with a `" +
      ACKNOWLEDGMENT_MARKER +
      " — <reason>` comment in the migration, or split them into a later contract migration."
      : "All destructive operations below are acknowledged. The deploy will still pause for reviewer approval.",
    "",
  );

  for (const [file, fileFindings] of byFile) {
    lines.push(`**\`${file}\`**`, "");
    for (const f of fileFindings) {
      const status = f.acknowledged ? "acknowledged" : "**needs sign-off**";
      lines.push(
        `- ${RULE_INFO[f.rule].label} (${status})`,
        `  - \`${f.statement}\``,
        `  - _Safe alternative:_ ${RULE_INFO[f.rule].safeAlternative}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
};
