"use strict";
/*
 * Almacén de usuarios en un fichero JSON (sin base de datos ni dependencias).
 * En Railway debe vivir en un Volume; si no, se perdería en cada despliegue.
 *
 * Estructura:
 *   users:  { "<correo>": { name, profile, pass, sv, created, updated, lastLogin } }
 *           pass = "scrypt$<salt>$<hash>" o null (invitación pendiente)
 *           sv   = versión de sesión: al subirla se cierran sus sesiones abiertas
 *   tokens: { "<sha256 del token>": { email, type: "invite"|"reset", exp } }
 */
const fs = require("fs");
const path = require("path");

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "users.json");
  let db = { users: {}, tokens: {} };
  if (fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file, "utf8"));
    db.users = db.users || {};
    db.tokens = db.tokens || {};
  }

  function save() {
    // Escritura atómica: fichero temporal + rename, para no dejarlo a medias.
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function purgeTokens() {
    const now = Date.now();
    let changed = false;
    for (const [h, t] of Object.entries(db.tokens)) {
      if (t.exp < now || !db.users[t.email]) { delete db.tokens[h]; changed = true; }
    }
    if (changed) save();
  }

  return { db, save, purgeTokens, file };
}

module.exports = { createStore };
