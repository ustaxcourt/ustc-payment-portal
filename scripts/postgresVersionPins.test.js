const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const repoRoot = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const composeImage = (relativePath) =>
  yaml.load(read(relativePath)).services.postgres.image;

const workflowImages = (relativePath) =>
  Object.values(yaml.load(read(relativePath)).jobs)
    .map((job) => job.services?.postgres?.image)
    .filter(Boolean);

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
  const containerPins = {
    "docker-compose.yml": [composeImage("docker-compose.yml")],
    "docker-compose.consumer.yml": [
      composeImage("docker-compose.consumer.yml"),
    ],
    ".github/workflows/ci.yml": workflowImages(".github/workflows/ci.yml"),
    ".github/workflows/migration-safety.yml": workflowImages(
      ".github/workflows/migration-safety.yml",
    ),
  };

  it.each(Object.keys(containerPins))("%s pins a postgres image", (file) => {
    expect(containerPins[file].length).toBeGreaterThan(0);
    for (const image of containerPins[file]) {
      expect(image).toMatch(/^postgres:\d+(\.\d+)?$/);
    }
  });

  it("every container pin uses the same image", () => {
    const images = new Set(Object.values(containerPins).flat());
    expect([...images]).toHaveLength(1);
  });

  // A rollout goes dev, then stg, then prod, so an environment ahead of the one
  // before it means a step was skipped and prod would upgrade untested.
  it("rollout order holds: container >= dev >= stg >= prod", () => {
    const [image] = Object.values(containerPins).flat();
    const majors = [
      major(image.split(":")[1]),
      major(engineVersion("dev")),
      major(engineVersion("stg")),
      major(engineVersion("prod")),
    ];

    expect(majors).toEqual([...majors].sort((a, b) => b - a));
  });
});
