# Procedimientos de equipo — Juancho's BBQ (interno)
Webapp de procedimientos por categoría de puesto. Repo PRIVADO — uso interno.

## Estructura
- `config/admins.js` — administradores principales (no se pueden borrar ni degradar desde la app).
- `content/data.js` — **el contenido**: categorías (`PROFILES`), datos críticos, procedimientos, hamburguesas. Solo lo lee el servidor.
- `public/` — la interfaz (`index.html` + `app.js`). No contiene contenido.
- `assets/` — fotos. Solo se sirven con sesión y a la categoría que las tiene en su contenido.
- `server.js` + `store.js` — servidor Node sin dependencias: login, sesiones, panel de usuarios.
- Los usuarios se guardan en `users.json` dentro de `DATA_DIR` (en Railway, el Volume). Contraseñas con hash scrypt.

## Acceso
- Correo + contraseña (mín. 8 caracteres; 12 para administradores).
- Sesión de 12 h en cookie firmada (`HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS).
- 5 fallos seguidos bloquean esa cuenta 15 min; 10 fallos desde una IP la bloquean 15 min.
- Borrar a alguien, cambiarle la categoría o la contraseña, o pulsar «Cerrar sus sesiones» lo echa **al momento**.
- Cada persona puede cambiar su propia contraseña («Cambiar mi contraseña», abajo en el inicio).
- Todo queda en el log de Railway: `[auth]` accesos y fallos, `[admin]` cambios hechos desde el panel y quién los hizo.

## Panel de administración (botón «Usuarios»)
Solo para la categoría Administración:
- **Dar de alta**: correo, nombre y categoría → se genera un enlace de invitación (7 días, un solo uso) para que la persona cree su contraseña. Se puede copiar, mandar por WhatsApp y, si el correo está configurado, se envía por email.
- **Cambiar categoría o nombre.**
- **Contraseña**: generar un enlace para que la cambie (48 h) o ponerle una directamente.
- **Cerrar sus sesiones** y **eliminar acceso**.

## Categorías
| Categoría | Antiguo código | Ve |
|---|---|---|
| `admin` | — | Todo + panel de usuarios |
| `cocina` | COCINA26 | Cocina + 12 hamburguesas |
| `jefe_cocina` | JEFE26 | Cocina + Supervisión de cocina + 12 hamburguesas |
| `cuyna` | CUYNA26 | Como `jefe_cocina`, pero solo 6 hamburguesas: Bacon Juancheeseburger, Bacon Juniorburger, Junior, Piccolo, Vegeta y Carbonara |
| `sala` | SALA26 | Sala + 12 hamburguesas |
| `jefe_sala` | JEFESALA26 | Sala + Encargado de turno + 12 hamburguesas |
| `oficina` | OFICINA26 | Oficina |

Para limitar las fichas de una categoría, en `PROFILES` se usa `items:{grupo:[ids]}` (ver `cuyna`).

## Puesta en marcha en Railway
1. Añadir un **Volume** al servicio (p. ej. montado en `/data`). Sin él el servidor no arranca, para no perder los usuarios en cada despliegue.
2. Variables: `SESSION_SECRET` (obligatoria). Opcionales: `RESEND_API_KEY` + `MAIL_FROM` para enviar invitaciones por correo.
3. Al arrancar, para cada administrador sin contraseña aparece en el log un enlace `[bootstrap] ... Enlace para crearla: ...` (y se envía por correo si está configurado). Abrirlo y crear la contraseña.

## Local
```
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") npm start
npm test
```
