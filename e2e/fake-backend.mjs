// Backend de prueba para los E2E: sirve `out/` e imita lo que usa supabase-js de Auth,
// PostgREST y Storage, con datos en memoria. Permite correr los flujos completos sin
// Docker. NO valida RLS ni constraints: eso lo cubre supabase/tests/schema.test.ts.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const APP_PORT = 3100;
const API_PORT = 54321;
const OUT_DIR = join(import.meta.dirname, "..", "out");

const PRIMARY_KEYS = { professional_oficios: ["professional_id", "oficio_id"] };
const pkOf = (table) => PRIMARY_KEYS[table] ?? ["id"];

const OFICIOS = readFileSync(join(import.meta.dirname, "..", "supabase", "migrations", "20261104000100_oficios_catalog.sql"), "utf8")
  .split("\n")
  .map((line) => line.match(/^\s*\('(.+?)', '(.+?)', '(.+?)', '(.+?)'\)[,;]$/))
  .filter(Boolean)
  .map(([, name, description, unit, category]) => ({ id: randomUUID(), name, description, unit, category, professional_id: null }));

let state;
let networkUp = true;

function reset() {
  state = {
    users: new Map(),
    files: new Map(),
    tables: {
      professionals: [],
      oficios: [...OFICIOS],
      professional_oficios: [],
      clients: [],
      budgets: [],
      budget_items: [],
      jobs: [],
      job_photos: [],
      budget_pdfs: [],
    },
  };
}
reset();

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function session(user) {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const access_token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, exp: expires_at, role: "authenticated" })}.firma`;
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at, refresh_token: user.id, user };
}

function createUser(email, password) {
  const user = { id: randomUUID(), aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  state.users.set(email, { user, password });
  state.tables.professionals.push({
    id: randomUUID(), user_id: user.id, name: "", last_name: "", phone: "", cuit: null, address: "", zone: "", logo_url: null,
    brand_name: "", primary_color: "#C2410C", footer_text: "", onboarded_at: null, last_budget_number: 0, created_at: new Date().toISOString(),
  });
  return user;
}

function auth(req, res, url, body) {
  const json = JSON.parse(body.toString() || "{}");
  if (url.pathname === "/auth/v1/signup") {
    if (state.users.has(json.email)) return send(res, 422, { code: "user_already_exists", error_code: "user_already_exists", msg: "exists" });
    return send(res, 200, session(createUser(json.email, json.password)));
  }
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    const entry = state.users.get(json.email);
    if (!entry || entry.password !== json.password) return send(res, 400, { error_code: "invalid_credentials", msg: "bad" });
    return send(res, 200, session(entry.user));
  }
  if (url.pathname === "/auth/v1/token") {
    const entry = [...state.users.values()].find(({ user }) => user.id === json.refresh_token);
    return entry ? send(res, 200, session(entry.user)) : send(res, 400, { error_code: "refresh_token_not_found", msg: "bad" });
  }
  if (url.pathname === "/auth/v1/logout") return send(res, 204);
  return send(res, 404, { msg: "not found" });
}

function rest(req, res, url, body) {
  const table = url.pathname.split("/")[3];
  const rows = state.tables[table];
  if (!rows) return send(res, 404, { message: `tabla ${table}` });

  if (req.method === "GET") {
    const column = (url.searchParams.get("order") ?? "").split(".")[0];
    const sorted = column ? [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column]))) : rows;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 1000);
    return send(res, 200, sorted.slice(offset, offset + limit));
  }

  const pk = pkOf(table);
  const same = (a, b) => pk.every((column) => a[column] === b[column]);

  if (req.method === "POST") {
    const incoming = [JSON.parse(body.toString())].flat();
    const result = incoming.map((row) => {
      const existing = rows.find((other) => same(other, row));
      if (existing) return Object.assign(existing, row);
      if (table === "budgets" && row.number == null) {
        const owner = state.tables.professionals.find((p) => p.id === row.professional_id);
        row.number = ++owner.last_budget_number;
      }
      rows.push(row);
      return row;
    });
    return send(res, 201, result);
  }

  if (req.method === "DELETE") {
    const filters = [...url.searchParams].filter(([, value]) => value.startsWith("eq."));
    state.tables[table] = rows.filter((row) => !filters.every(([column, value]) => String(row[column]) === value.slice(3)));
    return send(res, 204);
  }
  return send(res, 405, {});
}

/** storage-js manda los Blob/File como multipart: se extrae la parte que trae el archivo. */
function parseUpload(req, body) {
  const contentType = req.headers["content-type"] ?? "";
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  if (!boundary) return { body, type: contentType };
  for (const part of body.toString("latin1").split(`--${boundary}`)) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const headers = part.slice(0, headerEnd);
    if (!/filename=/i.test(headers)) continue;
    const content = part.slice(headerEnd + 4, part.lastIndexOf("\r\n"));
    return { body: Buffer.from(content, "latin1"), type: headers.match(/content-type:\s*(\S+)/i)?.[1] ?? "application/octet-stream" };
  }
  return { body, type: contentType };
}

function storage(req, res, url, body) {
  const parts = decodeURIComponent(url.pathname).split("/").slice(3); // object, ...
  const mode = parts[1] === "sign" || parts[1] === "public" ? parts[1] : "object";
  const bucket = mode === "object" ? parts[1] : parts[2];
  const path = (mode === "object" ? parts.slice(2) : parts.slice(3)).join("/");
  const key = `${bucket}/${path}`;

  if (mode === "object" && (req.method === "POST" || req.method === "PUT")) {
    state.files.set(key, parseUpload(req, body));
    return send(res, 200, { Key: key, Id: randomUUID() });
  }
  if (mode === "object" && req.method === "DELETE") {
    for (const prefix of JSON.parse(body.toString()).prefixes) state.files.delete(`${bucket}/${prefix}`);
    return send(res, 200, []);
  }
  if (mode === "sign" && req.method === "POST") {
    const json = JSON.parse(body.toString());
    const signedUrl = (file) => `/object/sign/${bucket}/${file}?token=firma`;
    if (json.paths) {
      return send(res, 200, json.paths.map((file) =>
        state.files.has(`${bucket}/${file}`)
          ? { path: file, signedURL: signedUrl(file), error: null }
          : { path: file, signedURL: null, error: "not found" }));
    }
    if (!state.files.has(key)) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    return send(res, 200, { signedURL: signedUrl(path) });
  }
  if (req.method === "GET") {
    const file = state.files.get(key);
    if (!file) return send(res, 404, { message: "not found" });
    res.writeHead(200, { "content-type": file.type, ...corsHeaders(req) });
    return res.end(file.body);
  }
  return send(res, 404, { message: "not found" });
}

let currentReq;
const corsHeaders = (req) => ({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
});

function send(res, status, json) {
  res.writeHead(status, { "content-type": "application/json", ...corsHeaders(currentReq) });
  res.end(json === undefined ? undefined : JSON.stringify(json));
}

const api = createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    currentReq = req;
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, `http://localhost:${API_PORT}`);
    if (url.pathname === "/__network") {
      networkUp = url.searchParams.get("up") === "1";
      return send(res, 200, {});
    }
    if (url.pathname === "/__reset") {
      reset();
      networkUp = true;
      return send(res, 200, {});
    }
    if (!networkUp && url.pathname !== "/__state") return req.socket.destroy();
    if (req.method === "OPTIONS") return send(res, 204);
    if (url.pathname === "/__state") {
      return send(res, 200, { ...state.tables, files: [...state.files.keys()] });
    }
    if (url.pathname.startsWith("/auth/v1/")) return auth(req, res, url, body);
    if (url.pathname.startsWith("/rest/v1/")) return rest(req, res, url, body);
    if (url.pathname.startsWith("/storage/v1/")) return storage(req, res, url, body);
    return send(res, 404, {});
  });
});
// E2E_APP_ONLY: sirve solo la app, para correr contra un Supabase real.
if (!process.env.E2E_APP_ONLY) api.listen(API_PORT);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain", ".ico": "image/x-icon", ".map": "application/json",
};

createServer((req, res) => {
  // "Sin red" de verdad: setOffline de Playwright también bloquea al service worker.
  if (!networkUp) return req.socket.destroy();
  const { pathname } = new URL(req.url, `http://localhost:${APP_PORT}`);
  const clean = decodeURIComponent(pathname);
  const candidates = [clean, `${clean}.html`, join(clean, "index.html")].map((path) => join(OUT_DIR, path));
  const file = candidates.find((path) => existsSync(path) && statSync(path).isFile());
  if (!file) {
    res.writeHead(404, { "content-type": "text/html" });
    return res.end(readFileSync(join(OUT_DIR, "404.html")));
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(APP_PORT, () => console.log(`App en http://localhost:${APP_PORT}, API en http://localhost:${API_PORT}`));
