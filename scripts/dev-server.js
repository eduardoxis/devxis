import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
try {
  process.loadEnvFile(".env");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const root = resolve("."),
  port = Number(process.env.PORT || 3000),
  host = process.env.HOST || "127.0.0.1";
const policies = JSON.parse(await readFile("vercel.json", "utf8")).headers[0]
  .headers;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};
const endpoints = {
  "/api/quotes": () => import("../api/quotes.js"),
  "/api/workspace": () => import("../api/workspace.js"),
};
const server = createServer(async (req, res) => {
  try {
    for (const header of policies) {
      let value = header.value;
      if (
        header.key === "Content-Security-Policy" &&
        process.env.NODE_ENV !== "production" &&
        process.env.FIREBASE_PROJECT_ID === "demo-devxis" &&
        process.env.FIRESTORE_EMULATOR_HOST &&
        process.env.FIREBASE_AUTH_EMULATOR_HOST
      )
        value = value
          .replace(
            "connect-src 'self'",
            "connect-src 'self' http://127.0.0.1:8080 http://127.0.0.1:9099",
          )
          .replace("; upgrade-insecure-requests", "");
      res.setHeader(header.key, value);
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (endpoints[url.pathname]) {
      let bytes = 0,
        parts = [];
      for await (const part of req) {
        bytes += part.length;
        if (bytes > 320 * 1024) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Dados muito grandes." }));
          return;
        }
        parts.push(part);
      }
      try {
        req.body = parts.length
          ? JSON.parse(Buffer.concat(parts).toString())
          : {};
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "JSON inválido." }));
        return;
      }
      req.query = Object.fromEntries(url.searchParams);
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (value) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(value));
      };
      const { default: handler } = await endpoints[url.pathname]();
      await handler(req, res);
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const path = decodeURIComponent(url.pathname);
    const allowed =
      /^\/(?:index\.html|robots\.txt|sitemap\.xml|(?:css|js|assets|pages|shared)\/[a-zA-Z0-9_./-]+|firebase\/firebase-config\.js)$/.test(
        path,
      ) || path === "/";
    if (!allowed || path.split("/").some((part) => part.startsWith("."))) {
      res.writeHead(404);
      res.end("Não encontrado.");
      return;
    }
    const file = resolve(root, path === "/" ? "index.html" : path.slice(1));
    if (!file.startsWith(root + sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      types[extname(file)] || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-cache");
    res.end(req.method === "HEAD" ? undefined : await readFile(file));
  } catch (error) {
    res.statusCode = error.code === "ENOENT" ? 404 : 500;
    res.end("Não foi possível atender a solicitação.");
    console.error(error.message);
  }
});
server.listen(port, host, () =>
  console.log(
    `DEVXIS disponível em http://${host}:${port}${process.env.FIRESTORE_EMULATOR_HOST ? "/?emulator=1" : ""}`,
  ),
);
