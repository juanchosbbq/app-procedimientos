"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const PORT = 3999 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "jbbq-test-"));
const ENV = { ...process.env, PORT: String(PORT), SESSION_SECRET: "x".repeat(40), DATA_DIR, RESEND_API_KEY: "", MAIL_FROM: "" };
const ADMIN = "juancho@equipojuanchos.com";
const ADMIN_PASS = "contraseña-admin-larga";
let srv, log = "", adminCookie;

function start(env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; log += d; if (out.includes("escuchando")) resolve(p); });
    p.stderr.on("data", (d) => (out += d));
    p.on("exit", (code) => reject(Object.assign(new Error("exit " + code), { out, code })));
  });
}
const post = (url, body, cookie, headers = {}) => fetch(BASE + url, {
  method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body),
});
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];
const tokenOf = (url) => url.split("#t=")[1];
const content = (cookie) => fetch(BASE + "/api/content", { headers: { cookie } });
const login = (email, password, headers) => post("/api/login", { email, password }, null, headers);

// Crea un usuario desde el admin, acepta la invitación y devuelve su cookie.
async function invite(email, profile, password = "clave-segura-1") {
  const r = await post("/api/admin/create", { email, profile }, adminCookie);
  assert.strictEqual(r.status, 200, await r.clone().text());
  const { url } = await r.json();
  const a = await post("/api/link/accept", { token: tokenOf(url), password });
  assert.strictEqual(a.status, 200);
  return cookieOf(a);
}

before(async () => {
  srv = await start(ENV);
  for (let i = 0; i < 100 && !/juancho@equipojuanchos\.com aún no tiene contraseña\. Enlace para crearla: \S+\n/.test(log); i++) await new Promise((r) => setTimeout(r, 20));
  const url = log.match(/juancho@equipojuanchos\.com aún no tiene contraseña\. Enlace para crearla: (\S+)/)[1];
  const r = await post("/api/link/accept", { token: tokenOf(url), password: ADMIN_PASS });
  assert.strictEqual(r.status, 200);
  adminCookie = cookieOf(r);
});
after(() => { srv.kill(); fs.rmSync(DATA_DIR, { recursive: true, force: true }); });

test("no arranca sin SESSION_SECRET, ni en Railway sin volumen", async () => {
  await assert.rejects(start({ ...ENV, SESSION_SECRET: "", PORT: String(PORT + 1) }), (e) => e.code === 1);
  const { DATA_DIR: _, ...noDir } = ENV;
  await assert.rejects(start({ ...noDir, RAILWAY_ENVIRONMENT: "production", PORT: String(PORT + 2) }), (e) => e.code === 1);
});

test("el HTML no contiene contenido; sin sesión no hay nada", async () => {
  const html = await (await fetch(BASE + "/")).text() + await (await fetch(BASE + "/app.js")).text();
  assert.ok(!html.includes("Margarita Pagana"));
  assert.strictEqual((await fetch(BASE + "/api/content")).status, 401);
  assert.strictEqual((await fetch(BASE + "/assets/burgers/vegeta.jpg")).status, 401);
  assert.strictEqual((await post("/api/admin/users", {})).status, 401);
  for (const f of ["/server.js", "/store.js", "/content/data.js", "/config/admins.js", "/data/users.json"]) assert.strictEqual((await fetch(BASE + f)).status, 404);
});

test("los dos administradores existen y el admin lo ve todo", async () => {
  const r = await (await post("/api/admin/users", {}, adminCookie)).json();
  const admins = r.users.filter((u) => u.profile === "admin").map((u) => u.email);
  assert.deepStrictEqual(admins.sort(), ["juancho@equipojuanchos.com", "juanma@equipojuanchos.com"]);
  const c = await (await content(adminCookie)).json();
  assert.strictEqual(c.admin, true);
  assert.deepStrictEqual(c.groups.map((g) => g.group), ["cocina", "sup_cocina", "sala", "sup_sala", "burgers", "oficina"]);
});

test("login con contraseña; correo en mayúsculas; contraseña mal", async () => {
  assert.strictEqual((await login(" JUANCHO@equipojuanchos.com ", ADMIN_PASS)).status, 200);
  assert.strictEqual((await login(ADMIN, "otra-cosa-cualquiera")).status, 401);
  assert.strictEqual((await login("nadie@x.com", "lo-que-sea")).status, 401);
  const ok = await login(ADMIN, ADMIN_PASS);
  assert.match(ok.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
});

test("invitación: el enlace solo sirve una vez y exige contraseña mínima", async () => {
  const r = await (await post("/api/admin/create", { email: "nuevo@test.local", name: "Nuevo", profile: "sala" }, adminCookie)).json();
  const token = tokenOf(r.url);
  assert.strictEqual(r.mailed, false);
  const info = await (await post("/api/link/info", { token })).json();
  assert.deepStrictEqual([info.email, info.name, info.type], ["nuevo@test.local", "Nuevo", "invite"]);
  assert.strictEqual((await login("nuevo@test.local", "lo-que-sea")).status, 401); // sin contraseña aún
  assert.strictEqual((await post("/api/link/accept", { token, password: "corta" })).status, 400);
  assert.strictEqual((await post("/api/link/accept", { token, password: "clave-segura-1" })).status, 200);
  assert.strictEqual((await post("/api/link/accept", { token, password: "clave-segura-2" })).status, 404);
  assert.strictEqual((await login("nuevo@test.local", "clave-segura-1")).status, 200);
  assert.strictEqual((await post("/api/admin/create", { email: "nuevo@test.local", profile: "sala" }, adminCookie)).status, 409);
});

test("un no-admin no puede usar el panel", async () => {
  const c = await invite("cocinero@test.local", "cocina");
  assert.strictEqual((await post("/api/admin/users", {}, c)).status, 403);
  assert.strictEqual((await post("/api/admin/delete", { email: "juanma@equipojuanchos.com" }, c)).status, 403);
});

test("Cuyna: como jefe de cocina con 6 hamburguesas y sin las fotos del resto", async () => {
  const cookie = await invite("cuyna@test.local", "cuyna");
  const c = await (await content(cookie)).json();
  assert.deepStrictEqual(c.groups.map((g) => g.group), ["cocina", "sup_cocina", "burgers"]);
  const b = c.groups.find((g) => g.group === "burgers");
  assert.deepStrictEqual(b.items.map((i) => i.title).sort(), [
    "La Bacon Juancheeseburger", "La Bacon Juniorburger", "La Carbonara", "La Junior", "La Piccolo", "La Vegeta",
  ]);
  assert.match(b.summary, /de las 6 hamburguesas/);
  const img = (f) => fetch(BASE + "/assets/burgers/" + f, { headers: { cookie } });
  assert.strictEqual((await img("vegeta.jpg")).status, 200);
  for (const f of ["juanita.jpg", "trufada.jpg", "federer.jpg", "margarita-pagana.jpg"]) assert.strictEqual((await img(f)).status, 404);
});

test("cambiar categoría echa al usuario; vuelve a entrar con la nueva", async () => {
  const cookie = await invite("cambia@test.local", "cocina");
  assert.strictEqual((await post("/api/admin/update", { email: "cambia@test.local", profile: "oficina" }, adminCookie)).status, 200);
  assert.strictEqual((await content(cookie)).status, 401);
  const c2 = cookieOf(await login("cambia@test.local", "clave-segura-1"));
  assert.deepStrictEqual((await (await content(c2)).json()).groups.map((g) => g.group), ["oficina"]);
});

test("pasar a admin obliga a crear contraseña larga nueva", async () => {
  await invite("ascenso@test.local", "cocina");
  const r = await (await post("/api/admin/update", { email: "ascenso@test.local", profile: "admin" }, adminCookie)).json();
  assert.strictEqual(r.passwordReset, true);
  assert.strictEqual((await login("ascenso@test.local", "clave-segura-1")).status, 401);
  assert.strictEqual((await post("/api/link/accept", { token: tokenOf(r.url), password: "corta-de-11" })).status, 400);
  assert.strictEqual((await post("/api/link/accept", { token: tokenOf(r.url), password: "ahora-una-de-admin" })).status, 200);
});

test("admin cambia la contraseña: la vieja deja de valer y se cierran sesiones", async () => {
  const cookie = await invite("pass@test.local", "sala");
  assert.strictEqual((await post("/api/admin/password", { email: "pass@test.local", password: "nueva-clave-99" }, adminCookie)).status, 200);
  assert.strictEqual((await content(cookie)).status, 401);
  assert.strictEqual((await login("pass@test.local", "clave-segura-1")).status, 401);
  assert.strictEqual((await login("pass@test.local", "nueva-clave-99")).status, 200);
});

test("enlace de cambio de contraseña para un usuario activo", async () => {
  await invite("olvido@test.local", "sala");
  const r = await (await post("/api/admin/link", { email: "olvido@test.local" }, adminCookie)).json();
  assert.strictEqual(r.type, "reset");
  assert.strictEqual((await post("/api/link/accept", { token: tokenOf(r.url), password: "recordada-123" })).status, 200);
  assert.strictEqual((await login("olvido@test.local", "recordada-123")).status, 200);
});

test("cada uno puede cambiar su propia contraseña", async () => {
  const cookie = await invite("yo@test.local", "sala");
  assert.strictEqual((await post("/api/me/password", { current: "mal-mal-mal", password: "otra-clave-1" }, cookie)).status, 403);
  const r = await post("/api/me/password", { current: "clave-segura-1", password: "otra-clave-1" }, cookie);
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await content(cookie)).status, 401); // la cookie vieja ya no vale
  assert.strictEqual((await content(cookieOf(r))).status, 200); // la renovada sí
});

test("cerrar sesiones y eliminar", async () => {
  const cookie = await invite("baja@test.local", "sala");
  assert.strictEqual((await post("/api/admin/logout", { email: "baja@test.local" }, adminCookie)).status, 200);
  assert.strictEqual((await content(cookie)).status, 401);
  const c2 = cookieOf(await login("baja@test.local", "clave-segura-1"));
  assert.strictEqual((await post("/api/admin/delete", { email: "baja@test.local" }, adminCookie)).status, 200);
  assert.strictEqual((await content(c2)).status, 401);
  assert.strictEqual((await login("baja@test.local", "clave-segura-1")).status, 401);
});

test("los administradores principales no se pueden borrar ni degradar", async () => {
  assert.strictEqual((await post("/api/admin/delete", { email: "juanma@equipojuanchos.com" }, adminCookie)).status, 400);
  assert.strictEqual((await post("/api/admin/update", { email: "juanma@equipojuanchos.com", profile: "sala" }, adminCookie)).status, 400);
});

test("los usuarios se guardan en disco y sin contraseñas en claro", async () => {
  const file = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf8"));
  assert.ok(file.users["nuevo@test.local"].pass.startsWith("scrypt$"));
  assert.ok(!JSON.stringify(file).includes("clave-segura-1"));
});

test("cookie manipulada y POST de otro origen se rechazan", async () => {
  const c = await invite("forja@test.local", "sala");
  const [payload, sig] = c.split("=")[1].split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), p: "admin" })).toString("base64url");
  assert.strictEqual((await content(`jbbq_sid=${forged}.${sig}`)).status, 401);
  assert.strictEqual((await post("/api/login", { email: ADMIN, password: ADMIN_PASS }, null, { Origin: "https://evil.example" })).status, 403);
});

test("bloqueo de cuenta tras 5 fallos y de IP tras 10", async () => {
  await invite("bloq@test.local", "sala");
  const h = { "X-Forwarded-For": "203.0.113.50" };
  for (let i = 0; i < 5; i++) assert.strictEqual((await login("bloq@test.local", "mala-" + i, h)).status, 401);
  assert.strictEqual((await login("bloq@test.local", "clave-segura-1", { "X-Forwarded-For": "203.0.113.51" })).status, 429);
  const h2 = { "X-Forwarded-For": "203.0.113.9" };
  for (let i = 0; i < 10; i++) await login(`x${i}@test.local`, "mala", h2);
  assert.strictEqual((await login(ADMIN, ADMIN_PASS, h2)).status, 429);
});
