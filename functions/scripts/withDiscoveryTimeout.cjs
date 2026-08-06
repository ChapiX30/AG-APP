/**
 * Wrapper para firebase deploy: sube FUNCTIONS_DISCOVERY_TIMEOUT
 * (el análisis del codebase tarda >10s en esta máquina Windows).
 *
 * Uso: node scripts/withDiscoveryTimeout.cjs deploy --only functions:moveDriveItems
 */
process.env.FUNCTIONS_DISCOVERY_TIMEOUT =
  process.env.FUNCTIONS_DISCOVERY_TIMEOUT || "60";

const { spawnSync } = require("child_process");
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Uso: node scripts/withDiscoveryTimeout.cjs <firebase args...>");
  process.exit(1);
}

const result = spawnSync("npx", ["firebase", ...args], {
  stdio: "inherit",
  shell: true,
  env: process.env,
  cwd: require("path").resolve(__dirname, ".."),
});

process.exit(result.status === null ? 1 : result.status);
