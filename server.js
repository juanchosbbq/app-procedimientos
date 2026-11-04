"use strict";
/*
 * Servidor de la app de procedimientos (sin dependencias externas).
 *
 * - Los códigos de acceso se validan AQUÍ, nunca en el navegador.
 *   Se leen de variables de entorno (CODE_COCINA, CODE_JEFE_COCINA, ...).
 * - Tras un login correcto se emite una cookie de sesión firmada (HMAC),
 *   HttpOnly + SameSite=Strict (+ Secure en HTTPS).
 * - Cada puesto solo recibe el contenido de sus grupos (/api/content)
 *   y solo puede descargar las imágenes de esos grupos (/assets/...).
 * - Cambiar el código de un puesto invalida al momento las sesiones
 *   abiertas de ese puesto. Cambiar SESSION_SECRET cierra todas.
 * - Limitación de intentos fallidos de login por IP.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PROFILES, QUICK_COCINA, QUICK_SALA, DATA } = require("./content/data.js");

/* ====== CONFIGURACIÓN ====== */
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;
const MAX_FAILS = 5; // intentos fallidos permitidos por IP...
const FAIL_WINDOW_MS = 15 * 60 * 1000; // ...en esta ventana
const MIN_CODE_LEN = 8;
const COOKIE = "jbbq_sid";

function fatal(msg) {
  console.error("[config] " + msg);
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  fatal("Falta SESSION_SECRET (mínimo 32 caracteres). Genera uno con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
}

const normCode = (c) => String(c || "").trim().toUpperCase();

// Un código por puesto: CODE_<PUESTO EN MAYÚSCULAS>. Puesto sin código = desactivado.
const CODES = {};
for (const profile of Object.keys(PROFILES)) {
  const code = normCode(process.env["CODE_" + profile.toUpperCase()]);
  if (!code) continue;
  if (code.length < MIN_CODE_LEN) fatal(`CODE_${profile.toUpperCase()} debe tener al menos ${MIN_CODE_LEN} caracteres.`);
  CODES[profile] = code;
}
const seen = new Set();
for (const [p, c] of Object.entries(CODES)) {
  if (seen.has(c)) fatal(`El código de ${p} está repetido en otro puesto.`);
  seen.add(c);
}
if (!Object.keys(CODES).length) fatal("No hay ningún código configurado (CODE_COCINA, CODE_SALA, ...).");
console.log("[config] Puestos activos: " + Object.keys(CODES).join(", "));

/* ====== UTILIDADES CRIPTO ====== */
const hmac = (data) => crypto.createHmac("sha256", SESSION_SECRET).update(data).digest();
const b64u = (buf) => Buffer.from(buf).toString("base64url");

function safeEqual(a, b) {
  // Compara en tiempo constante (hash previo para igualar longitudes).
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Huella del código vigente de un puesto: si el código cambia, la huella cambia
// y las sesiones emitidas con el código anterior dejan de valer.
const codeFingerprint = (profile) => b64u(hmac("code:" + profile + ":" + CODES[profile])).slice(0, 16);

function findProfileByCode(code) {
  const c = normCode(code);
  let found = null;
  // Recorre todos los puestos siempre (sin cortocircuito) para no filtrar tiempos.
  for (const [p, real] of Object.entries(CODES)) if (safeEqual(c, real) && !found) found = p;
  return found;
}

function makeToken(profile) {
  const payload = b64u(JSON.stringify({ p: profile, v: codeFingerprint(profile), exp: Date.now() + SESSION_HOURS * 3600e3 }));
  return payload + "." + b64u(hmac(payload));
}

function readToken(token) {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = hmac(payload);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
  if (!data || typeof data.exp !== "number" || data.exp < Date.now()) return null;
  if (!CODES[data.p] || data.v !== codeFingerprint(data.p)) return null;
  return data.p;
}

/* ====== LIMITACIÓN DE INTENTOS ====== */
const fails = new Map(); // ip -> {n, first}
function clientIp(req) {
  // Railway (y la mayoría de proxies) añaden la IP real como primer valor de X-Forwarded-For.
  const xff = req.headers["x-forwarded-for"];
  return (xff ? String(xff).split(",")[0] : req.socket.remoteAddress || "").trim();
}
function isBlocked(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() - f.first > FAIL_WINDOW_MS) { fails.delete(ip); return false; }
  return f.n >= MAX_FAILS;
}
function registerFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.first > FAIL_WINDOW_MS) fails.set(ip, { n: 1, first: Date.now() });
  else f.n++;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, f] of fails) if (now - f.first > FAIL_WINDOW_MS) fails.delete(ip);
}, 60e3).unref();

/* ====== CONTENIDO POR PUESTO ====== */
function contentFor(profile) {
  const def = PROFILES[profile];
  return {
    label: def.label,
    quick: def.groups.includes("cocina") ? QUICK_COCINA : def.groups.includes("sala") ? QUICK_SALA : null,
    groups: DATA.filter((g) => def.groups.includes(g.group)),
  };
}

// Imagen -> grupos que la usan, para servir cada imagen solo a quien puede verla.
const ASSET_GROUPS = new Map();
for (const g of DATA) for (const it of g.items) for (const b of it.blocks) {
  if (b.img) {
    const key = "/" + b.img.replace(/^\/+/, "");
    if (!ASSET_GROUPS.has(key)) ASSET_GROUPS.set(key, new Set());
    ASSET_GROUPS.get(key).add(g.group);
  }
}

/* ====== HTTP ====== */
const ROOT = __dirname;
const STATIC = {
  "/": { file: "public/index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "public/index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "public/app.js", type: "text/javascript; charset=utf-8" },
};
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4" };

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self'",
  "media-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function isHttps(req) {
  return req.headers["x-forwarded-proto"] === "https" || !!req.socket.encrypted;
}

function baseHeaders(req, res) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (isHttps(req)) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(status, { "Content-Type": type, "Content-Length": buf.length, "Cache-Control": "no-store", ...extra });
  res.end(buf);
}

function getCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function sessionCookie(req, value, maxAgeSec) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}` + (isHttps(req) ? "; Secure" : "");
}

function readJson(req, limit = 2048) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { resolve(null); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

// Defensa CSRF adicional a SameSite: las peticiones POST deben venir de nuestro propio origen.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // navegadores antiguos / herramientas sin Origin: SameSite=Strict sigue protegiendo
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

const server = http.createServer(async (req, res) => {
  baseHeaders(req, res);
  let url;
  try { url = new URL(req.url, "http://x"); } catch { return send(res, 400, { error: "bad_request" }); }
  const p = url.pathname;

  try {
    if (p === "/api/login") {
      if (req.method !== "POST") return send(res, 405, { error: "method" }, undefined, { Allow: "POST" });
      if (!sameOrigin(req)) return send(res, 403, { error: "origin" });
      if (!String(req.headers["content-type"] || "").startsWith("application/json")) return send(res, 415, { error: "type" });
      const ip = clientIp(req);
      if (isBlocked(ip)) return send(res, 429, { error: "too_many_attempts" }, undefined, { "Retry-After": String(FAIL_WINDOW_MS / 1000) });
      const body = await readJson(req);
      const profile = body && typeof body.code === "string" ? findProfileByCode(body.code) : null;
      if (!profile) {
        registerFail(ip);
        console.warn(`[auth] intento fallido desde ${ip}`);
        return send(res, 401, { error: "invalid_code" });
      }
      fails.delete(ip);
      console.log(`[auth] acceso de ${profile} desde ${ip}`);
      return send(res, 200, { ok: true }, undefined, { "Set-Cookie": sessionCookie(req, makeToken(profile), SESSION_HOURS * 3600) });
    }

    if (p === "/api/logout") {
      if (req.method !== "POST") return send(res, 405, { error: "method" }, undefined, { Allow: "POST" });
      if (!sameOrigin(req)) return send(res, 403, { error: "origin" });
      return send(res, 200, { ok: true }, undefined, { "Set-Cookie": sessionCookie(req, "", 0) });
    }

    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method" }, undefined, { Allow: "GET, HEAD" });

    if (p === "/api/content") {
      const profile = readToken(getCookie(req, COOKIE));
      if (!profile) return send(res, 401, { error: "unauthorized" });
      return send(res, 200, contentFor(profile));
    }

    if (p.startsWith("/assets/")) {
      const profile = readToken(getCookie(req, COOKIE));
      if (!profile) return send(res, 401, "No autorizado", "text/plain; charset=utf-8");
      const groups = ASSET_GROUPS.get(p);
      // Solo se sirven imágenes referenciadas en el contenido y de grupos del puesto.
      if (!groups || !PROFILES[profile].groups.some((g) => groups.has(g))) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
      const file = path.join(ROOT, p);
      if (!file.startsWith(path.join(ROOT, "assets") + path.sep)) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
      const buf = await fs.promises.readFile(file);
      return send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || "application/octet-stream", { "Cache-Control": "private, max-age=3600" });
    }

    const st = STATIC[p];
    if (st) {
      const buf = await fs.promises.readFile(path.join(ROOT, st.file));
      return send(res, 200, buf, st.type, { "Cache-Control": "no-cache" });
    }

    if (p === "/healthz") return send(res, 200, { ok: true });

    return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: "server" });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`[server] escuchando en :${PORT}`));
