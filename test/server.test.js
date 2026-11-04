"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const path = require("node:path");

const PORT = 3999 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const ENV = {
  ...process.env, PORT: String(PORT),
  SESSION_SECRET: "x".repeat(40),
  CODE_COCINA: "cocina-test-1", CODE_SALA: "sala-test-1", CODE_OFICINA: "oficina-test-1",
};
let srv;

function start(env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const onData = (d) => { out += d; if (out.includes("escuchando")) resolve(p); };
    p.stdout.on("data", onData); p.stderr.on("data", (d) => (out += d));
    p.on("exit", (code) => reject(Object.assign(new Error("exit " + code), { out, code })));
  });
}
const login = (code, headers = {}) => fetch(BASE + "/api/login", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ code }),
});
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];

before(async () => { srv = await start(ENV); });
after(() => srv.kill());

test("no arranca sin SESSION_SECRET", async () => {
  const env = { ...ENV, SESSION_SECRET: "", PORT: String(PORT + 1) };
  await assert.rejects(start(env), (e) => e.code === 1);
});

test("el HTML no contiene códigos ni contenido", async () => {
  const html = await (await fetch(BASE + "/")).text();
  const js = await (await fetch(BASE + "/app.js")).text();
  for (const s of [html, js]) {
    assert.ok(!/COCINA26|JEFE26|SALA26|cocina-test-1/.test(s));
    assert.ok(!s.includes("Margarita Pagana"));
  }
});

test("sin sesión no hay contenido ni imágenes", async () => {
  assert.strictEqual((await fetch(BASE + "/api/content")).status, 401);
  assert.strictEqual((await fetch(BASE + "/assets/burgers/margarita-pagana.jpg")).status, 401);
  assert.strictEqual((await fetch(BASE + "/server.js")).status, 404);
  assert.strictEqual((await fetch(BASE + "/content/data.js")).status, 404);
});

test("login correcto da sesión con solo los grupos del puesto", async () => {
  const r = await login("  COCINA-TEST-1 ");
  assert.strictEqual(r.status, 200);
  const sc = r.headers.get("set-cookie");
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  const c = await (await fetch(BASE + "/api/content", { headers: { cookie: cookieOf(r) } })).json();
  assert.deepStrictEqual(c.groups.map((g) => g.group), ["cocina", "burgers"]);
  const burgers = c.groups.find((g) => g.group === "burgers").items.map((i) => i.title);
  assert.ok(burgers.includes("La Margarita Pagana"));
  assert.ok(!burgers.some((t) => /Yuxiang/.test(t)));
  const img = await fetch(BASE + "/assets/burgers/margarita-pagana.jpg", { headers: { cookie: cookieOf(r) } });
  assert.strictEqual(img.status, 200);
  assert.strictEqual(img.headers.get("content-type"), "image/jpeg");
});

test("oficina no puede descargar fotos de hamburguesas", async () => {
  const r = await login("oficina-test-1");
  const img = await fetch(BASE + "/assets/burgers/margarita-pagana.jpg", { headers: { cookie: cookieOf(r) } });
  assert.strictEqual(img.status, 404);
});

test("cookie manipulada se rechaza", async () => {
  const r = await login("sala-test-1");
  const [payload, sig] = cookieOf(r).split("=")[1].split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), p: "jefe_sala" })).toString("base64url");
  const res = await fetch(BASE + "/api/content", { headers: { cookie: `jbbq_sid=${forged}.${sig}` } });
  assert.strictEqual(res.status, 401);
});

test("POST desde otro origen se rechaza", async () => {
  assert.strictEqual((await login("sala-test-1", { Origin: "https://evil.example" })).status, 403);
});

test("bloqueo tras 5 intentos fallidos", async () => {
  const h = { "X-Forwarded-For": "203.0.113.9" };
  for (let i = 0; i < 5; i++) assert.strictEqual((await login("mal-" + i, h)).status, 401);
  assert.strictEqual((await login("cocina-test-1", h)).status, 429);
  assert.strictEqual((await login("cocina-test-1", { "X-Forwarded-For": "203.0.113.10" })).status, 200);
});
