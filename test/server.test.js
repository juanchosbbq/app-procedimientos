"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const path = require("node:path");

const PORT = 3999 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const ENV = {
  ...process.env, PORT: String(PORT), SESSION_SECRET: "x".repeat(40), MAIL_DEV_LOG: "1",
  USERS_FILE: path.join(__dirname, "fixtures", "users.js"),
};
let srv, log = "";

function start(env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; log += d; if (out.includes("escuchando")) resolve(p); });
    p.stderr.on("data", (d) => (out += d));
    p.on("exit", (code) => reject(Object.assign(new Error("exit " + code), { out, code })));
  });
}
const post = (url, body, headers = {}) => fetch(BASE + url, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function lastCode(email) {
  for (let i = 0; i < 50; i++) {
    const m = [...log.matchAll(new RegExp(`código para ${email.replace(/\./g, "\\.")}: (\\d{6})`, "g"))];
    if (m.length) return m[m.length - 1][1];
    await sleep(20);
  }
  return null;
}
async function loginAs(email, headers) {
  log = "";
  assert.strictEqual((await post("/api/login/start", { email }, headers)).status, 200);
  const code = await lastCode(email.toLowerCase());
  const r = await post("/api/login/verify", { email, code }, headers);
  assert.strictEqual(r.status, 200);
  return cookieOf(r);
}
const content = async (cookie) => (await fetch(BASE + "/api/content", { headers: { cookie } })).json();

before(async () => { srv = await start(ENV); });
after(() => srv.kill());

test("no arranca sin SESSION_SECRET ni sin correo configurado", async () => {
  await assert.rejects(start({ ...ENV, SESSION_SECRET: "", PORT: String(PORT + 1) }), (e) => e.code === 1);
  await assert.rejects(start({ ...ENV, MAIL_DEV_LOG: "", RESEND_API_KEY: "", PORT: String(PORT + 2) }), (e) => e.code === 1);
});

test("el HTML no contiene contenido", async () => {
  const html = await (await fetch(BASE + "/")).text() + await (await fetch(BASE + "/app.js")).text();
  assert.ok(!html.includes("Margarita Pagana"));
  assert.ok(!/test\.local/.test(html));
});

test("sin sesión no hay contenido ni imágenes", async () => {
  assert.strictEqual((await fetch(BASE + "/api/content")).status, 401);
  assert.strictEqual((await fetch(BASE + "/assets/burgers/margarita-pagana.jpg")).status, 401);
  for (const f of ["/server.js", "/content/data.js", "/config/users.js"]) assert.strictEqual((await fetch(BASE + f)).status, 404);
});

test("correo fuera de la lista: misma respuesta y no se envía código", async () => {
  log = "";
  const r = await post("/api/login/start", { email: "nadie@test.local" });
  assert.strictEqual(r.status, 200);
  await sleep(100);
  assert.ok(!log.includes("código para nadie@test.local"));
});

test("login por correo: cocina ve sus grupos y la cookie es segura", async () => {
  log = "";
  await post("/api/login/start", { email: "cocina@test.local" });
  const code = await lastCode("cocina@test.local");
  const r = await post("/api/login/verify", { email: " COCINA@test.local ", code });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  const c = await content(cookieOf(r));
  assert.strictEqual(c.email, "cocina@test.local");
  assert.deepStrictEqual(c.groups.map((g) => g.group), ["cocina", "burgers"]);
  assert.strictEqual(c.groups[1].items.length, 12);
  // el código es de un solo uso
  assert.strictEqual((await post("/api/login/verify", { email: "cocina@test.local", code })).status, 401);
});

test("el correo de la lista no distingue mayúsculas", async () => {
  const c = await content(await loginAs("jefe@test.local"));
  assert.deepStrictEqual(c.groups.map((g) => g.group), ["cocina", "sup_cocina", "burgers"]);
});

test("Cuyna: como jefe de cocina pero con 6 hamburguesas", async () => {
  const cookie = await loginAs("cuyna@test.local");
  const c = await content(cookie);
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

test("oficina no puede descargar fotos de hamburguesas", async () => {
  const cookie = await loginAs("oficina@test.local");
  assert.strictEqual((await fetch(BASE + "/assets/burgers/vegeta.jpg", { headers: { cookie } })).status, 404);
});

test("cookie manipulada se rechaza", async () => {
  const cookie = await loginAs("cocina@test.local");
  const [payload, sig] = cookie.split("=")[1].split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), p: "jefe_cocina" })).toString("base64url");
  assert.strictEqual((await fetch(BASE + "/api/content", { headers: { cookie: `jbbq_sid=${forged}.${sig}` } })).status, 401);
});

test("POST desde otro origen se rechaza", async () => {
  assert.strictEqual((await post("/api/login/start", { email: "cocina@test.local" }, { Origin: "https://evil.example" })).status, 403);
});

test("un código se invalida tras 5 intentos fallidos", async () => {
  const h = { "X-Forwarded-For": "203.0.113.20" };
  log = "";
  await post("/api/login/start", { email: "oficina@test.local" }, h);
  const code = await lastCode("oficina@test.local");
  for (let i = 0; i < 5; i++) await post("/api/login/verify", { email: "oficina@test.local", code: "000000" === code ? "111111" : "000000" }, h);
  assert.strictEqual((await post("/api/login/verify", { email: "oficina@test.local", code }, h)).status, 401);
});

test("bloqueo por IP tras 10 fallos", async () => {
  const h = { "X-Forwarded-For": "203.0.113.9" };
  for (let i = 0; i < 10; i++) assert.strictEqual((await post("/api/login/verify", { email: "cocina@test.local", code: "12345" + (i % 10) }, h)).status, 401);
  assert.strictEqual((await post("/api/login/verify", { email: "cocina@test.local", code: "123456" }, h)).status, 429);
});
