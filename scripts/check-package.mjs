import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: fileURLToPath(root),
  encoding: "utf8",
});

if (packed.error || packed.status !== 0) {
  console.error(packed.error?.message ?? (packed.stderr.trim() || "npm pack failed"));
  process.exit(1);
}

const [artifact] = JSON.parse(packed.stdout);
const files = new Set(artifact.files.map((file) => file.path));
const runtimeFiles = readdirSync(new URL("src/", root), { recursive: true })
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
  .map((file) => `dist/${file.slice(0, -3)}.js`);
const docs = readdirSync(new URL("docs/", root), { recursive: true })
  .filter((file) => file.endsWith(".md"))
  .map((file) => `docs/${file}`);
const required = [
  ...pkg.openclaw.extensions.map((file) => file.replace(/^\.\//, "")),
  ...runtimeFiles,
  ...docs,
  "package.json",
  "openclaw.plugin.json",
  "README.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "LICENSE",
];
const missing = required.filter((file) => !files.has(file));
const unexpected = [...files].filter(
  (file) =>
    /^(?:src|test|scripts|node_modules)\//.test(file) ||
    /\.test\.[cm]?js$/.test(file) ||
    file === "vitest.config.ts",
);

if (missing.length || unexpected.length) {
  if (missing.length) {
    console.error(`Missing package files: ${missing.join(", ")}. Run pnpm build before packing.`);
  }
  if (unexpected.length) {
    console.error(`Unexpected development files in package: ${unexpected.join(", ")}`);
  }
  process.exit(1);
}

console.log(`Package verified: ${runtimeFiles.length} runtime modules and ${docs.length} docs.`);
