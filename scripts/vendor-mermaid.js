import { cp, mkdir, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
const source = "node_modules/mermaid",
  target = "js/vendor/mermaid";
await mkdir(`${target}/chunks/mermaid.esm.min`, { recursive: true });
await copyFile(
  `${source}/dist/mermaid.esm.min.mjs`,
  `${target}/mermaid.esm.min.mjs`,
);
for (const name of await readdir(`${source}/dist/chunks/mermaid.esm.min`))
  if (name.endsWith(".mjs"))
    await copyFile(
      join(source, "dist/chunks/mermaid.esm.min", name),
      join(target, "chunks/mermaid.esm.min", name),
    );
await copyFile(`${source}/LICENSE`, `${target}/LICENSE`);
console.log(
  "Mermaid preparado localmente, incluindo os módulos carregados sob demanda.",
);
