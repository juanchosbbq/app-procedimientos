"use strict";
/*
 * Servidor de la app de procedimientos (sin dependencias externas).
 *
 * Acceso por correo:
 *  1. La persona escribe su correo. Si está en config/users.js, recibe un
 *     código de 6 dígitos válido 10 minutos (un solo uso, máx. 5 intentos).
 *  2. Con el código correcto se emite una cookie de sesión firmada (HMAC),
 *     HttpOnly + SameSite=Strict (+ Secure en HTTPS).
 *  3. En cada petición se vuelve a comprobar que el correo sigue en la lista
 *     y con el mismo puesto: quitar o cambiar a alguien surte efecto al momento.
 *
 * Cada puesto solo recibe su contenido (/api/content) y sus fotos (/assets/...).
 * La respuesta al pedir código es idéntica exista o no el correo.
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
const USERS_FILE = process.env.USERS_FILE || path.join(__dirname, "config", "users.js");
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const MAIL_FROM = process.env.MAIL_FROM || "";
const MAIL_DEV_LOG = process.env.MAIL_DEV_LOG === "1"; // SOLO en local: muestra el código en consola en vez de enviarlo
const OTP_TTL_MS = 10 * 60 * 1000; // validez del código enviado por correo
const OTP_MAX_TRIES = 5; // intentos por código
const SENDS_PER_EMAIL = 3; // códigos por correo...
const IP_MAX_FAILS = 10; // fallos de verificación por IP...
const IP_MAX_STARTS = 20; // peticiones de código por IP...
const WINDOW_MS = 15 * 60 * 1000; // ...en esta ventana
const COOKIE = "jbbq_sid";

function fatal(msg) {
  console.error("[config] " + msg);
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  fatal("Falta SESSION_SECRET (mínimo 32 caracteres). Genera uno con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
}
if (!MAIL_DEV_LOG && (!RESEND_API_KEY || !MAIL_FROM)) {
  fatal("Faltan RESEND_API_KEY y MAIL_FROM para enviar los códigos por correo (en local puedes usar MAIL_DEV_LOG=1).");
}

const normEmail = (e) => String(e || "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lista de personas -> puesto.
const USERS = new Map();
{
  let raw;
  try { raw = require(USERS_FILE); } catch (e) { fatal(`No se puede leer ${USERS_FILE}: ${e.message}`); }
  for (const [email, profile] of Object.entries(raw || {})) {
    const e = normEmail(email);
    if (!EMAIL_RE.test(e)) fatal(`Correo no válido en la lista de accesos: "${email}"`);
    if (!PROFILES[profile]) fatal(`Puesto desconocido "${profile}" para ${e}. Puestos: ${Object.keys(PROFILES).join(", ")}`);
    if (USERS.has(e)) fatal(`Correo repetido en la lista de accesos: ${e}`);
    USERS.set(e, profile);
  }
}
if (!USERS.size) console.warn("[config] AVISO: la lista de accesos está vacía; nadie podrá entrar.");
else console.log(`[config] ${USERS.size} persona(s) con acceso.`);
if (MAIL_DEV_LOG) console.warn("[config] AVISO: MAIL_DEV_LOG=1, los códigos se muestran en consola y NO se envían. No usar en producción.");

/* ====== UTILIDADES CRIPTO ====== */
const hmac = (data) => crypto.createHmac("sha256", SESSION_SECRET).update(data).digest();
const b64u = (buf) => Buffer.from(buf).toString("base64url");

function safeEqual(a, b) {
  // Compara en tiempo constante (hash previo para igualar longitudes).
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function makeToken(email, profile) {
  const payload = b64u(JSON.stringify({ e: email, p: profile, exp: Date.now() + SESSION_HOURS * 3600e3 }));
  return payload + "." + b64u(hmac(payload));
}

// Devuelve {email, profile} o null.
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
  if (USERS.get(data.e) !== data.p) return null; // fuera de la lista o puesto cambiado
  return { email: data.e, profile: data.p };
}

/* ====== CÓDIGOS DE UN SOLO USO ====== */
const otps = new Map(); // email -> {hash, exp, tries}
const otpHash = (email, code) => b64u(hmac("otp:" + email + ":" + code));

function issueOtp(email) {
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  otps.set(email, { hash: otpHash(email, code), exp: Date.now() + OTP_TTL_MS, tries: 0 });
  return code;
}

function checkOtp(email, code) {
  const o = otps.get(email);
  if (!o) return false;
  if (o.exp < Date.now() || o.tries >= OTP_MAX_TRIES) { otps.delete(email); return false; }
  o.tries++;
  if (!safeEqual(o.hash, otpHash(email, String(code).replace(/\D/g, "")))) return false;
  otps.delete(email); // un solo uso
  return true;
}

async function sendOtpMail(email, code) {
  const text = `Tu código para entrar en Procedimientos de equipo es: ${code}\n\nCaduca en 10 minutos. Si no lo has pedido tú, ignora este correo.`;
  if (MAIL_DEV_LOG) { console.log(`[mail-dev] código para ${email}: ${code}`); return; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM, to: [email], subject: `${code} es tu código de acceso · Juancho's BBQ`, text,
      html: `<p>Tu código para entrar en <b>Procedimientos de equipo</b> es:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code}</p><p style="color:#6B6357">Caduca en 10 minutos. Si no lo has pedido tú, ignora este correo.</p>`,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

/* ====== LIMITACIÓN DE INTENTOS ====== */
function makeLimiter(max) {
  const m = new Map(); // key -> {n, first}
  setInterval(() => { const now = Date.now(); for (const [k, f] of m) if (now - f.first > WINDOW_MS) m.delete(k); }, 60e3).unref();
  return {
    blocked(k) { const f = m.get(k); if (!f) return false; if (Date.now() - f.first > WINDOW_MS) { m.delete(k); return false; } return f.n >= max; },
    hit(k) { const f = m.get(k); if (!f || Date.now() - f.first > WINDOW_MS) m.set(k, { n: 1, first: Date.now() }); else f.n++; },
    reset(k) { m.delete(k); },
  };
}
const ipFails = makeLimiter(IP_MAX_FAILS);
const ipStarts = makeLimiter(IP_MAX_STARTS);
const emailSends = makeLimiter(SENDS_PER_EMAIL);
setInterval(() => { const now = Date.now(); for (const [e, o] of otps) if (o.exp < now) otps.delete(e); }, 60e3).unref();

function clientIp(req) {
  // Railway (y la mayoría de proxies) añaden la IP real como primer valor de X-Forwarded-For.
  const xff = req.headers["x-forwarded-for"];
  return (xff ? String(xff).split(",")[0] : req.socket.remoteAddress || "").trim();
}

/* ====== CONTENIDO POR PUESTO ====== */
function buildContent(profile) {
  const def = PROFILES[profile];
  const groups = DATA.filter((g) => def.groups.includes(g.group)).map((g) => {
    const only = def.items && def.items[g.group];
    const items = only ? g.items.filter((it) => only.includes(it.id)) : g.items;
    return { ...g, items, summary: g.summary && g.summary.replace("{n}", items.length) };
  });
  return {
    label: def.label,
    quick: def.groups.includes("cocina") ? QUICK_COCINA : def.groups.includes("sala") ? QUICK_SALA : null,
    groups,
  };
}
// Contenido y fotos permitidas de cada puesto, calculados al arrancar.
const CONTENT = {};
const ASSETS = {};
for (const profile of Object.keys(PROFILES)) {
  const def = PROFILES[profile];
  for (const [g, ids] of Object.entries(def.items || {})) {
    const known = (DATA.find((x) => x.group === g) || { items: [] }).items.map((i) => i.id);
    for (const id of ids) if (!known.includes(id)) fatal(`PROFILES.${profile}: la ficha "${id}" no existe en "${g}".`);
  }
  CONTENT[profile] = buildContent(profile);
  ASSETS[profile] = new Set();
  for (const g of CONTENT[profile].groups) for (const it of g.items) for (const b of it.blocks)
    if (b.img) ASSETS[profile].add("/" + b.img.replace(/^\/+/, ""));
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
    if (p === "/api/login/start" || p === "/api/login/verify") {
      if (req.method !== "POST") return send(res, 405, { error: "method" }, undefined, { Allow: "POST" });
      if (!sameOrigin(req)) return send(res, 403, { error: "origin" });
      if (!String(req.headers["content-type"] || "").startsWith("application/json")) return send(res, 415, { error: "type" });
      const ip = clientIp(req);
      const body = await readJson(req);
      const email = normEmail(body && body.email);
      if (!EMAIL_RE.test(email) || email.length > 254) return send(res, 400, { error: "invalid_email" });

      if (p === "/api/login/start") {
        if (ipStarts.blocked(ip)) return send(res, 429, { error: "too_many_attempts" });
        ipStarts.hit(ip);
        // Misma respuesta exista o no el correo; el envío va en segundo plano.
        if (USERS.has(email) && !emailSends.blocked(email)) {
          emailSends.hit(email);
          const code = issueOtp(email);
          sendOtpMail(email, code)
            .then(() => console.log(`[auth] código enviado a ${email}`))
            .catch((e) => console.error(`[auth] error enviando código a ${email}: ${e.message}`));
        } else {
          console.warn(`[auth] código pedido para ${email} desde ${ip} (${USERS.has(email) ? "límite de envíos" : "no está en la lista"})`);
        }
        return send(res, 200, { ok: true });
      }

      // verify
      if (ipFails.blocked(ip)) return send(res, 429, { error: "too_many_attempts" });
      const code = body && typeof body.code === "string" ? body.code : "";
      const profile = USERS.get(email);
      if (!profile || !checkOtp(email, code)) {
        ipFails.hit(ip);
        console.warn(`[auth] código incorrecto para ${email} desde ${ip}`);
        return send(res, 401, { error: "invalid_code" });
      }
      ipFails.reset(ip);
      emailSends.reset(email);
      console.log(`[auth] acceso de ${email} (${profile}) desde ${ip}`);
      return send(res, 200, { ok: true }, undefined, { "Set-Cookie": sessionCookie(req, makeToken(email, profile), SESSION_HOURS * 3600) });
    }

    if (p === "/api/logout") {
      if (req.method !== "POST") return send(res, 405, { error: "method" }, undefined, { Allow: "POST" });
      if (!sameOrigin(req)) return send(res, 403, { error: "origin" });
      return send(res, 200, { ok: true }, undefined, { "Set-Cookie": sessionCookie(req, "", 0) });
    }

    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method" }, undefined, { Allow: "GET, HEAD" });

    if (p === "/api/content") {
      const sess = readToken(getCookie(req, COOKIE));
      if (!sess) return send(res, 401, { error: "unauthorized" });
      return send(res, 200, { ...CONTENT[sess.profile], email: sess.email });
    }

    if (p.startsWith("/assets/")) {
      const sess = readToken(getCookie(req, COOKIE));
      if (!sess) return send(res, 401, "No autorizado", "text/plain; charset=utf-8");
      // Solo se sirven imágenes que aparecen en el contenido de ese puesto.
      if (!ASSETS[sess.profile].has(p)) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
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
