// Sirve `out/` como lo haría el hosting estático. Sin backend: la app no usa ninguno.
// /__network?up=0 corta las conexiones (como estar sin señal) y up=1 las restablece.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const PORT = 3100;
const OUT_DIR = join(import.meta.dirname, "..", "out");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain", ".ico": "image/x-icon", ".map": "application/json",
};

let networkUp = true;

createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, `http://localhost:${PORT}`);
  if (pathname === "/__network") {
    networkUp = searchParams.get("up") === "1";
    res.writeHead(200).end("ok");
    return;
  }
  if (!networkUp) return req.socket.destroy();

  const clean = decodeURIComponent(pathname);
  const candidates = [clean, `${clean}.html`, join(clean, "index.html")].map((path) => join(OUT_DIR, path));
  const file = candidates.find((path) => existsSync(path) && statSync(path).isFile());
  if (!file) {
    res.writeHead(404, { "content-type": "text/html" });
    return res.end(readFileSync(join(OUT_DIR, "404.html")));
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`App en http://localhost:${PORT}`));
