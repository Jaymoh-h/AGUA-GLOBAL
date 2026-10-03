const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = join(__dirname, "..");
const vitestPath = join(projectRoot, "node_modules", "vitest", "vitest.mjs");
const testFiles = readdirSync(__dirname)
  .filter((file) => file.endsWith(".test.jsx"))
  .sort();

for (const testFile of testFiles) {
  const result = spawnSync(
    process.execPath,
    [
      "--max-old-space-size=4096",
      vitestPath,
      "run",
      join("test", testFile),
      "--pool=forks",
      "--maxWorkers=1"
    ],
    { cwd: projectRoot, stdio: "inherit" }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
