const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const repoRoot = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const load = (relativePath) => yaml.load(read(relativePath));

const dbWorkflows = [
  ".github/workflows/ci.yml",
  ".github/workflows/migration-safety.yml",
];

const allWorkflows = fs
  .readdirSync(path.join(repoRoot, ".github/workflows"))
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => `.github/workflows/${name}`);

const engineVersion = (environment) => {
  const matches = [
    ...read(`terraform/environments/${environment}/main.tf`).matchAll(
      /^\s*engine_version\s*=\s*"([^"]+)"/gm,
    ),
  ];
  expect(matches).toHaveLength(1);
  return matches[0][1];
};

const major = (version) => Number(String(version).split(".")[0]);

describe("Postgres version pins", () => {
  const consumer = load("docker-compose.consumer.yml");
  const { image } = consumer.services.postgres;
  const imageMajor = major(image.split(":")[1]);

  it("docker-compose.consumer.yml pins the postgres image", () => {
    expect(image).toMatch(/^postgres:\d+\.\d+$/);
  });

  it("docker-compose.yml takes its postgres image from the consumer file", () => {
    const { postgres } = load("docker-compose.yml").services;
    expect(postgres.image).toBeUndefined();
    expect(postgres.extends).toEqual({
      file: "docker-compose.consumer.yml",
      service: "postgres",
    });
  });

  it.each(dbWorkflows)("%s starts postgres from the consumer file", (file) => {
    const runs = Object.values(load(file).jobs)
      .flatMap((job) => job.steps ?? [])
      .map((s) => s.run ?? "");

    expect(
      runs.some((run) => run.includes("-f docker-compose.consumer.yml up")),
    ).toBe(true);
  });

  it.each(allWorkflows)("%s has no postgres image of its own", (file) => {
    const services = Object.values(load(file).jobs).flatMap((job) =>
      Object.values(job.services ?? {}),
    );

    expect(
      services.some((s) => /^postgres(:|$)/.test(s?.image ?? String(s))),
    ).toBe(false);
    expect(read(file)).not.toMatch(/\bpostgres:\d/);
  });

  // A new major cannot open the previous major's data directory, so a bump
  // that reuses the old volume leaves the container crash-looping.
  it.each([
    ["docker-compose.yml", load("docker-compose.yml")],
    ["docker-compose.consumer.yml", consumer],
  ])("%s volume names carry the image major", (_file, compose) => {
    for (const name of Object.keys(compose.volumes)) {
      if (name.startsWith("db_init")) continue;
      expect(name).toMatch(new RegExp(`(pg|postgres)${imageMajor}(_|$)`));
    }
  });

  // A rollout goes dev, then stg, then prod, so an environment ahead of the one
  // before it means a step was skipped and prod would upgrade untested.
  it("rollout order holds: container >= dev >= stg >= prod", () => {
    const majors = [
      imageMajor,
      major(engineVersion("dev")),
      major(engineVersion("stg")),
      major(engineVersion("prod")),
    ];

    expect(majors).toEqual([...majors].sort((a, b) => b - a));
  });
});
