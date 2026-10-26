import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "vendor"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (path.endsWith(".js")) result.push(path);
  }
  return result;
}
for (const file of await walk(".")) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status) {
    console.error(file, result.stderr);
    process.exit(1);
  }
}
for (const file of [
  "package.json",
  "vercel.json",
  "firebase.json",
  "firebase/firestore.indexes.json",
])
  JSON.parse(await readFile(file, "utf8"));
console.log("Sintaxe dos módulos e arquivos JSON: OK.");
