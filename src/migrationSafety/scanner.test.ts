import {
  ACKNOWLEDGMENT_MARKER,
  formatFindingsComment,
  hasDestructive,
  hasUnacknowledged,
  isAcknowledged,
  scanSql,
  scanStatements,
} from "./scanner";
import type { Finding, SqlStatement } from "./scanner";

describe("scanSql", () => {
  describe("flags destructive operations", () => {
    it.each([
      ['drop table: `drop table "transactions"`', 'drop table "transactions"', "drop-table"],
      [
        "drop column: `alter table \"t\" drop column \"c\"`",
        'alter table "t" drop column "c"',
        "drop-column",
      ],
      [
        "rename column: `alter table \"t\" rename \"a\" to \"b\"`",
        'alter table "t" rename "a" to "b"',
        "rename",
      ],
      [
        'rename table: `alter table "t" rename to "t2"`',
        'alter table "t" rename to "t2"',
        "rename",
      ],
      [
        "add NOT NULL column without default",
        'alter table "t" add column "c" varchar(255) not null',
        "not-null-without-default",
      ],
      [
        "set NOT NULL on existing column",
        'alter table "t" alter column "c" set not null',
        "not-null-without-default",
      ],
    ])("%s", (_desc, sql, expectedRule) => {
      expect(scanSql(sql)).toContain(expectedRule);
    });

    it("is case-insensitive and whitespace-insensitive", () => {
      expect(scanSql("ALTER   TABLE  t\n  DROP\tCOLUMN c")).toEqual(["drop-column"]);
    });

    it("reports multiple rules from one statement", () => {
      // Contrived, but proves independent matching.
      const sql =
        'alter table "t" drop column "old" , add column "new" integer not null';
      const rules = scanSql(sql);
      expect(rules).toContain("drop-column");
      expect(rules).toContain("not-null-without-default");
    });
  });

  describe("does NOT flag safe / additive operations", () => {
    it.each([
      ["create table", 'create table "t" ("id" serial primary key)'],
      [
        "create table with NOT NULL columns (no existing rows)",
        'create table "t" ("id" serial, "name" varchar(255) not null)',
      ],
      ["add nullable column", 'alter table "t" add column "c" varchar(255)'],
      [
        "add NOT NULL column WITH a default",
        'alter table "t" add column "c" integer not null default 0',
      ],
      ["create index", 'create index "idx_t_c" on "t" ("c")'],
      ["drop index (not data-destructive)", 'drop index "idx_t_c"'],
      ["insert data", 'insert into "t" ("c") values (1)'],
    ])("%s", (_desc, sql) => {
      expect(scanSql(sql)).toEqual([]);
    });
  });
});

describe("scanStatements", () => {
  const statements: SqlStatement[] = [
    { file: "20260101_a.ts", sql: 'alter table "t" drop column "c"' },
    { file: "20260102_b.ts", sql: 'create table "x" ("id" serial)' },
    { file: "20260103_c.ts", sql: 'alter table "t" rename to "t2"' },
  ];

  it("returns one finding per rule violation, tagged with its file", () => {
    const findings = scanStatements(statements);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.file)).toEqual(["20260101_a.ts", "20260103_c.ts"]);
    expect(findings.map((f) => f.rule)).toEqual(["drop-column", "rename"]);
  });

  it("marks findings acknowledged when their file is in the acknowledged set", () => {
    const findings = scanStatements(statements, new Set(["20260101_a.ts"]));
    const dropColumn = findings.find((f) => f.rule === "drop-column");
    const rename = findings.find((f) => f.rule === "rename");
    expect(dropColumn?.acknowledged).toBe(true);
    expect(rename?.acknowledged).toBe(false);
  });

  it("returns no findings for entirely safe statements", () => {
    expect(
      scanStatements([{ file: "20260102_b.ts", sql: 'create table "x" ("id" serial)' }]),
    ).toEqual([]);
  });
});

describe("isAcknowledged", () => {
  it("detects the marker comment", () => {
    expect(isAcknowledged(`// ${ACKNOWLEDGMENT_MARKER} — dropping legacy column, PAY-999`)).toBe(
      true,
    );
  });

  it("returns false without the marker", () => {
    expect(isAcknowledged("export async function up(knex) {}")).toBe(false);
  });
});

describe("hasDestructive / hasUnacknowledged", () => {
  const acked: Finding = {
    rule: "drop-column",
    file: "a.ts",
    statement: "…",
    acknowledged: true,
  };
  const unacked: Finding = {
    rule: "drop-table",
    file: "b.ts",
    statement: "…",
    acknowledged: false,
  };

  it("hasDestructive is true when any finding exists (even acknowledged)", () => {
    expect(hasDestructive([acked])).toBe(true);
    expect(hasDestructive([])).toBe(false);
  });

  it("hasUnacknowledged is true only when an un-signed-off finding exists", () => {
    expect(hasUnacknowledged([acked])).toBe(false);
    expect(hasUnacknowledged([acked, unacked])).toBe(true);
    expect(hasUnacknowledged([])).toBe(false);
  });
});

describe("formatFindingsComment", () => {
  it("reports a clean result when there are no findings", () => {
    expect(formatFindingsComment([])).toContain("No destructive migration operations detected");
  });

  it("lists files, rules, statements, and safe alternatives for unacknowledged findings", () => {
    const findings = scanStatements([
      { file: "20260101_a.ts", sql: 'alter table "t" drop column "c"' },
    ]);
    const comment = formatFindingsComment(findings);
    expect(comment).toContain("destructive operations detected");
    expect(comment).toContain("20260101_a.ts");
    expect(comment).toContain("Drops a column");
    expect(comment).toContain("needs sign-off");
    expect(comment).toContain("Safe alternative");
  });

  it("notes when all findings are acknowledged", () => {
    const findings = scanStatements(
      [{ file: "a.ts", sql: 'drop table "t"' }],
      new Set(["a.ts"]),
    );
    const comment = formatFindingsComment(findings);
    expect(comment).toContain("acknowledged");
    expect(comment).toContain("pause for reviewer approval");
  });
});
