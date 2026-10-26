import "./vendor-mermaid.js";
import { mkdir, cp } from "node:fs/promises";
await mkdir("public/firebase", { recursive: true });
for (const path of [
  "index.html",
  "robots.txt",
  "sitemap.xml",
  "css",
  "js",
  "assets",
  "pages",
  "shared",
])
  await cp(path, `public/${path}`, { recursive: true });
await cp("firebase/firebase-config.js", "public/firebase/firebase-config.js");
console.log(
  "Site preparado em public/. Código de servidor e testes não são publicados como arquivos estáticos.",
);
