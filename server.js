"use strict";
/*
 * Servidor de la app de procedimientos (sin dependencias externas).
 *
 * - Acceso con correo + contraseña (hash scrypt). Las cuentas nuevas se crean
 *   desde el panel de administración y reciben un enlace de invitación para
 *   elegir su contraseña (se puede copiar y/o enviar por correo).
 * - Sesión en cookie firmada (HMAC), HttpOnly + SameSite=Strict (+ Secure).
 *   En cada petición se comprueba que la cuenta sigue existiendo, con la misma
 *   categoría y la misma "versión de sesión": borrar a alguien, cambiarle la
 *   categoría o la contraseña, o pulsar "cerrar sesiones" lo echa al momento.
 * - Cada categoría solo recibe su contenido (/api/content) y sus fotos.
 * - Límite de intentos fallidos por IP y por cuenta.
 * - Los administradores de config/admins.js no se pueden borrar ni degradar
 *   desde el panel (evita quedarse sin acceso).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PROFILES, QUICK_COCINA, QUICK_SALA, DATA } = require("./content/data.js");
const { createStore } = require("./store.js");
const ADMIN_EMAILS = require("./config/admins.js").map((e) => String(e).trim().toLowerCase());

/* ====== CONFIGURACIÓN ====== */
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const MAIL_FROM = process.env.MAIL_FROM || "";
const MAIL_ENABLED = !!(RESEND_API_KEY && MAIL_FROM);
const INVITE_DAYS = 7;
const RESET_HOURS = 48;
const MIN_PASS = 8;
const MIN_PASS_ADMIN = 12;
const IP_MAX_FAILS = 10; // fallos de login por IP...
const ACCOUNT_MAX_FAILS = 5; // ...y por cuenta...
const WINDOW_MS = 15 * 60 * 1000; // ...en esta ventana
const COOKIE = "jbbq_sid";
const ADMIN_PROFILE = "admin";

function fatal(msg) {
  console.error("[config] " + msg);
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  fatal("Falta SESSION_SECRET (mínimo 32 caracteres). Genera uno con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
}
if (process.env.RAILWAY_ENVIRONMENT && !process.env.DATA_DIR && !process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  fatal("En Railway hace falta un Volume para guardar los usuarios (si no, se pierden en cada despliegue). Añádelo al servicio, montado por ejemplo en /data.");
}
if (!PROFILES[ADMIN_PROFILE]) fatal(`Falta la categoría "${ADMIN_PROFILE}" en PROFILES.`);
if (!MAIL_ENABLED) console.warn("[config] Correo no configurado (RESEND_API_KEY / MAIL_FROM): las invitaciones solo se podrán copiar y enviar a mano.");

const normEmail = (e) => String(e || "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validEmail = (e) => EMAIL_RE.test(e) && e.length <= 254;
const isProtected = (email) => ADMIN_EMAILS.includes(email);
const minPassFor = (profile) => (profile === ADMIN_PROFILE ? MIN_PASS_ADMIN : MIN_PASS);

/* ====== DATOS ====== */
const store = createStore(DATA_DIR);
const db = store.db;
console.log(`[config] usuarios en ${store.file} (${Object.keys(db.users).length})`);

/* ====== UTILIDADES CRIPTO ====== */
const hmac = (data) => crypto.createHmac("sha256", SESSION_SECRET).update(data).digest();
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const scrypt = (pw, salt) => new Promise((res, rej) =>
  crypto.scrypt(String(pw).normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${b64u(salt)}$${b64u(await scrypt(pw, salt))}`;
}
let DUMMY_HASH = null; // para que "correo inexistente" tarde lo mismo que "contraseña mal"
async function verifyPassword(pw, stored) {
  const [alg, salt, hash] = String(stored || DUMMY_HASH).split("$");
  if (alg !== "scrypt") return false;
  const k = await scrypt(pw, Buffer.from(salt, "base64url"));
  const h = Buffer.from(hash, "base64url");
  return h.length === k.length && crypto.timingSafeEqual(h, k) && !!stored;
}

function passwordProblem(pw, profile) {
  const min = minPassFor(profile);
  if (typeof pw !== "string" || pw.length < min) return `La contraseña debe tener al menos ${min} caracteres.`;
  if (pw.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

/* ====== SESIONES ====== */
function makeToken(email) {
  const u = db.users[email];
  const payload = b64u(JSON.stringify({ e: email, p: u.profile, sv: u.sv, exp: Date.now() + SESSION_HOURS * 3600e3 }));
  return payload + "." + b64u(hmac(payload));
}

// Devuelve {email, user} o null.
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
  const u = db.users[data.e];
  if (!u || !u.pass || u.profile !== data.p || u.sv !== data.sv) return null;
  return { email: data.e, user: u };
}

/* ====== ENLACES DE INVITACIÓN / CAMBIO DE CONTRASEÑA ====== */
function issueLink(email, type) {
  for (const [h, t] of Object.entries(db.tokens)) if (t.email === email) delete db.tokens[h]; // solo vale el último
  const token = b64u(crypto.randomBytes(32));
  const ms = type === "invite" ? INVITE_DAYS * 864e5 : RESET_HOURS * 3600e3;
  db.tokens[sha256(token)] = { email, type, exp: Date.now() + ms };
  store.save();
  return token;
}
function peekLink(token) {
  const t = typeof token === "string" && db.tokens[sha256(token)];
  if (!t || t.exp < Date.now() || !db.users[t.email]) return null;
  return t;
}
const linkUrl = (req, token) => `${isHttps(req) ? "https" : "http"}://${req.headers.host}/#t=${token}`;

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
async function sendLinkMail(email, url, type, name) {
  if (!MAIL_ENABLED) return false;
  const invite = type === "invite";
  const hello = name ? `Hola, ${name}:` : "Hola:";
  const what = invite
    ? `Te han dado acceso a Procedimientos de equipo de Juancho's BBQ. Para entrar, crea tu contraseña aquí (el enlace caduca en ${INVITE_DAYS} días):`
    : `Para cambiar tu contraseña de Procedimientos de equipo, entra aquí (el enlace caduca en ${RESET_HOURS} horas):`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM, to: [email],
      subject: invite ? "Tu acceso a Procedimientos de equipo · Juancho's BBQ" : "Cambio de contraseña · Juancho's BBQ",
      text: `${hello}\n\n${what}\n${url}\n\nSi no esperabas este correo, ignóralo.`,
      html: `<p>${escHtml(hello)}</p><p>${escHtml(what)}</p><p><a href="${escHtml(url)}" style="display:inline-block;padding:12px 20px;background:#B61829;color:#fff;border-radius:6px;text-decoration:none;font-weight:700">${invite ? "Crear mi contraseña" : "Cambiar contraseña"}</a></p><p style="color:#6B6357">Si no esperabas este correo, ignóralo.</p>`,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return true;
}

/* ====== ADMINISTRADORES INICIALES ====== */
// Los correos de config/admins.js siempre existen y son administradores.
// Si no tienen contraseña, se deja en el log un enlace para crearla.
const pendingBootstrap = [];
for (const email of ADMIN_EMAILS) {
  if (!validEmail(email)) fatal(`Correo de administrador no válido: ${email}`);
  const u = db.users[email];
  if (!u) {
    db.users[email] = { name: "", profile: ADMIN_PROFILE, pass: null, sv: 1, created: Date.now(), updated: Date.now(), lastLogin: null };
  } else if (u.profile !== ADMIN_PROFILE) {
    u.profile = ADMIN_PROFILE; u.sv++;
  }
  if (!db.users[email].pass) pendingBootstrap.push(email);
}
store.save();
store.purgeTokens();
setInterval(() => store.purgeTokens(), 3600e3).unref();

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
const accountFails = makeLimiter(ACCOUNT_MAX_FAILS);

function clientIp(req) {
  // Railway (y la mayoría de proxies) añaden la IP real como primer valor de X-Forwarded-For.
  const xff = req.headers["x-forwarded-for"];
  return (xff ? String(xff).split(",")[0] : req.socket.remoteAddress || "").trim();
}

/* ====== CONTENIDO POR CATEGORÍA ====== */
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
const PROFILE_LIST = Object.entries(PROFILES).map(([key, d]) => ({ key, label: d.label }));

function userView(email) {
  const u = db.users[email];
  const pending = Object.values(db.tokens).find((t) => t.email === email && t.exp > Date.now());
  return {
    email, name: u.name || "", profile: u.profile, active: !!u.pass,
    pendingLink: pending ? pending.type : null, lastLogin: u.lastLogin, created: u.created,
    protected: isProtected(email),
  };
}

/* ====== HTTP ====== */
const ROOT = __dirname;
const STATIC = {
  "/": { file: "public/index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "public/index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "public/app.js", type: "text/javascript; charset=utf-8" },
  "/favicon.ico": { file: "public/favicon.ico", type: "image/x-icon", cache: "public, max-age=604800" },
  "/icons/icon-192.png": { file: "public/icons/icon-192.png", type: "image/png", cache: "public, max-age=604800" },
  "/icons/apple-touch-icon.png": { file: "public/icons/apple-touch-icon.png", type: "image/png", cache: "public, max-age=604800" },
  "/apple-touch-icon.png": { file: "public/icons/apple-touch-icon.png", type: "image/png", cache: "public, max-age=604800" },
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

/* ====== RUTAS ====== */
const ok = (res, body = { ok: true }, extra) => send(res, 200, body, undefined, extra);
const fail = (res, status, error, message) => send(res, status, { error, message });

async function handleApi(req, res, p, sess) {
  const ip = clientIp(req);
  const body = (await readJson(req)) || {};

  /* ---- Login ---- */
  if (p === "/api/login") {
    const email = normEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (ipFails.blocked(ip) || accountFails.blocked(email)) return fail(res, 429, "too_many_attempts");
    const u = validEmail(email) ? db.users[email] : null;
    const good = await verifyPassword(password, u && u.pass);
    if (!u || !good) {
      ipFails.hit(ip);
      if (u) accountFails.hit(email);
      console.warn(`[auth] login fallido para ${email || "(vacío)"} desde ${ip}`);
      return fail(res, 401, "invalid_credentials");
    }
    ipFails.reset(ip); accountFails.reset(email);
    u.lastLogin = Date.now(); store.save();
    console.log(`[auth] acceso de ${email} (${u.profile}) desde ${ip}`);
    return ok(res, { ok: true }, { "Set-Cookie": sessionCookie(req, makeToken(email), SESSION_HOURS * 3600) });
  }

  if (p === "/api/logout") return ok(res, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) });

  /* ---- Enlace de invitación / cambio de contraseña ---- */
  if (p === "/api/link/info") {
    const t = peekLink(body.token);
    if (!t) return fail(res, 404, "invalid_link");
    const u = db.users[t.email];
    return ok(res, { email: t.email, name: u.name || "", type: t.type, minLength: minPassFor(u.profile) });
  }
  if (p === "/api/link/accept") {
    if (ipFails.blocked(ip)) return fail(res, 429, "too_many_attempts");
    const t = peekLink(body.token);
    if (!t) { ipFails.hit(ip); return fail(res, 404, "invalid_link"); }
    const u = db.users[t.email];
    const problem = passwordProblem(body.password, u.profile);
    if (problem) return fail(res, 400, "weak_password", problem);
    u.pass = await hashPassword(body.password);
    u.sv++; u.updated = Date.now(); u.lastLogin = Date.now();
    delete db.tokens[sha256(body.token)];
    store.save();
    console.log(`[auth] ${t.email} ha ${t.type === "invite" ? "activado su cuenta" : "cambiado su contraseña con enlace"} desde ${ip}`);
    return ok(res, { ok: true }, { "Set-Cookie": sessionCookie(req, makeToken(t.email), SESSION_HOURS * 3600) });
  }

  /* ---- A partir de aquí, con sesión ---- */
  if (!sess) return fail(res, 401, "unauthorized");

  if (p === "/api/me/password") {
    if (accountFails.blocked(sess.email)) return fail(res, 429, "too_many_attempts");
    if (!(await verifyPassword(body.current, sess.user.pass))) {
      accountFails.hit(sess.email);
      return fail(res, 403, "wrong_password", "La contraseña actual no es correcta.");
    }
    const problem = passwordProblem(body.password, sess.user.profile);
    if (problem) return fail(res, 400, "weak_password", problem);
    sess.user.pass = await hashPassword(body.password);
    sess.user.sv++; sess.user.updated = Date.now();
    store.save();
    console.log(`[auth] ${sess.email} ha cambiado su contraseña`);
    // Cierra las demás sesiones y renueva la actual.
    return ok(res, { ok: true }, { "Set-Cookie": sessionCookie(req, makeToken(sess.email), SESSION_HOURS * 3600) });
  }

  /* ---- Administración ---- */
  if (!p.startsWith("/api/admin/")) return fail(res, 404, "not_found");
  if (sess.user.profile !== ADMIN_PROFILE) return fail(res, 403, "forbidden");
  const action = p.slice("/api/admin/".length);
  const by = sess.email;

  if (action === "users") {
    const users = Object.keys(db.users).sort().map(userView);
    return ok(res, { users, profiles: PROFILE_LIST, mail: MAIL_ENABLED, me: by });
  }

  const email = normEmail(body.email);
  if (!validEmail(email)) return fail(res, 400, "invalid_email", "Correo no válido.");
  const u = db.users[email];
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : undefined;
  const profile = body.profile;
  if (profile !== undefined && !PROFILES[profile]) return fail(res, 400, "invalid_profile", "Categoría no válida.");

  // Devuelve un enlace (y lo envía por correo si se pide y está configurado).
  async function linkResponse(type, wantMail) {
    const url = linkUrl(req, issueLink(email, type));
    let mailed = false, mailError = null;
    if (wantMail && MAIL_ENABLED) {
      try { mailed = await sendLinkMail(email, url, type, db.users[email].name); }
      catch (e) { mailError = "No se pudo enviar el correo; copia el enlace y envíalo a mano."; console.error(`[mail] ${e.message}`); }
    }
    return { url, mailed, mailError, type, user: userView(email) };
  }

  if (action === "create") {
    if (u) return fail(res, 409, "exists", "Ese correo ya tiene acceso.");
    if (!profile) return fail(res, 400, "invalid_profile", "Elige una categoría.");
    db.users[email] = { name: name || "", profile, pass: null, sv: 1, created: Date.now(), updated: Date.now(), lastLogin: null };
    store.save();
    console.log(`[admin] ${by} ha dado de alta a ${email} (${profile})`);
    return ok(res, await linkResponse("invite", body.sendMail !== false));
  }

  if (!u) return fail(res, 404, "not_found", "Ese usuario no existe.");

  if (action === "update") {
    let resetPass = false;
    if (profile && profile !== u.profile) {
      if (isProtected(email)) return fail(res, 400, "protected", "Este administrador principal no se puede cambiar de categoría.");
      if (u.pass && profile === ADMIN_PROFILE) {
        // Los administradores necesitan una contraseña más larga: tendrá que crear una nueva.
        u.pass = null; resetPass = true;
      }
      console.log(`[admin] ${by} ha cambiado a ${email}: ${u.profile} → ${profile}`);
      u.profile = profile; u.sv++;
    }
    if (name !== undefined) u.name = name;
    u.updated = Date.now();
    store.save();
    if (resetPass) return ok(res, { ...(await linkResponse("invite", true)), passwordReset: true });
    return ok(res, { user: userView(email) });
  }

  if (action === "delete") {
    if (isProtected(email)) return fail(res, 400, "protected", "Este administrador principal no se puede eliminar.");
    if (email === by) return fail(res, 400, "self", "No puedes eliminarte a ti mismo.");
    delete db.users[email];
    for (const [h, t] of Object.entries(db.tokens)) if (t.email === email) delete db.tokens[h];
    store.save();
    console.log(`[admin] ${by} ha eliminado a ${email}`);
    return ok(res);
  }

  if (action === "password") {
    const problem = passwordProblem(body.password, u.profile);
    if (problem) return fail(res, 400, "weak_password", problem);
    u.pass = await hashPassword(body.password);
    u.sv++; u.updated = Date.now();
    for (const [h, t] of Object.entries(db.tokens)) if (t.email === email) delete db.tokens[h];
    store.save();
    console.log(`[admin] ${by} ha cambiado la contraseña de ${email}`);
    return ok(res, { user: userView(email) });
  }

  if (action === "link") {
    const type = u.pass ? "reset" : "invite";
    console.log(`[admin] ${by} ha generado un enlace (${type}) para ${email}`);
    return ok(res, await linkResponse(type, !!body.sendMail));
  }

  if (action === "logout") {
    u.sv++; store.save();
    console.log(`[admin] ${by} ha cerrado las sesiones de ${email}`);
    return ok(res, { user: userView(email) });
  }

  return fail(res, 404, "not_found");
}

const server = http.createServer(async (req, res) => {
  baseHeaders(req, res);
  let url;
  try { url = new URL(req.url, "http://x"); } catch { return send(res, 400, { error: "bad_request" }); }
  const p = url.pathname;

  try {
    const sess = readToken(getCookie(req, COOKIE));

    if (p.startsWith("/api/")) {
      if (p === "/api/content") {
        if (req.method !== "GET") return send(res, 405, { error: "method" }, undefined, { Allow: "GET" });
        if (!sess) return fail(res, 401, "unauthorized");
        return ok(res, {
          ...CONTENT[sess.user.profile], email: sess.email, name: sess.user.name || "",
          admin: sess.user.profile === ADMIN_PROFILE,
        });
      }
      if (req.method !== "POST") return send(res, 405, { error: "method" }, undefined, { Allow: "POST" });
      if (!sameOrigin(req)) return fail(res, 403, "origin");
      if (!String(req.headers["content-type"] || "").startsWith("application/json")) return fail(res, 415, "type");
      return await handleApi(req, res, p, sess);
    }

    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method" }, undefined, { Allow: "GET, HEAD" });

    if (p.startsWith("/assets/")) {
      if (!sess) return send(res, 401, "No autorizado", "text/plain; charset=utf-8");
      // Solo se sirven imágenes que aparecen en el contenido de esa categoría.
      if (!ASSETS[sess.user.profile].has(p)) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
      const file = path.join(ROOT, p);
      if (!file.startsWith(path.join(ROOT, "assets") + path.sep)) return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
      const buf = await fs.promises.readFile(file);
      return send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || "application/octet-stream", { "Cache-Control": "private, max-age=3600" });
    }

    const st = STATIC[p];
    if (st) {
      const buf = await fs.promises.readFile(path.join(ROOT, st.file));
      return send(res, 200, buf, st.type, { "Cache-Control": st.cache || "no-cache" });
    }

    if (p === "/healthz") return ok(res);

    return send(res, 404, "No encontrado", "text/plain; charset=utf-8");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: "server" });
  }
});

(async () => {
  DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString("hex"));
  server.listen(PORT, "0.0.0.0", async () => {
    console.log(`[server] escuchando en :${PORT}`);
    // Enlace para que los administradores iniciales creen su contraseña.
    const base = process.env.PUBLIC_URL
      || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`);
    for (const email of pendingBootstrap) {
      const hadLink = Object.values(db.tokens).some((t) => t.email === email && t.exp > Date.now());
      const url = `${base.replace(/\/+$/, "")}/#t=${issueLink(email, "invite")}`;
      console.log(`[bootstrap] ${email} aún no tiene contraseña. Enlace para crearla: ${url}`);
      if (!hadLink && MAIL_ENABLED) {
        sendLinkMail(email, url, "invite", "").then(
          () => console.log(`[bootstrap] invitación enviada a ${email}`),
          (e) => console.error(`[bootstrap] no se pudo enviar a ${email}: ${e.message}`));
      }
    }
  });
})();
