# Procedimientos de equipo — Juancho's BBQ (interno)
Webapp de procedimientos por puesto. Repo PRIVADO — uso interno.

## Estructura
- `config/users.js` — **quién tiene acceso** y con qué puesto (un correo por línea).
- `content/data.js` — **el contenido**: puestos (`PROFILES`), datos críticos, procedimientos, hamburguesas. Solo lo lee el servidor.
- `public/` — la interfaz (`index.html` + `app.js`). No contiene contenido.
- `assets/` — fotos. Solo se sirven con sesión y al puesto que las tiene en su contenido.
- `server.js` — servidor Node sin dependencias: login, sesiones y control de acceso.

## Acceso por correo
1. La persona escribe su correo. Si está en `config/users.js`, recibe un código de 6 dígitos (caduca en 10 min, un solo uso, máx. 5 intentos).
2. Con el código entra; la sesión dura 12 h (cookie firmada, `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS).

- La pantalla responde igual exista o no el correo (no revela quién tiene acceso).
- Máx. 3 códigos por correo y 10 códigos erróneos por IP cada 15 min.
- **Dar de alta / baja / cambiar de puesto**: editar `config/users.js` y desplegar. Quien se quite o cambie de puesto pierde la sesión al momento.
- Cambiar `SESSION_SECRET` cierra todas las sesiones.
- Los accesos quedan en el log de Railway (`[auth] acceso de ...`).

## Puestos
| Puesto | Antiguo código | Ve |
|---|---|---|
| `cocina` | COCINA26 | Cocina + 12 hamburguesas |
| `jefe_cocina` | JEFE26 | Cocina + Supervisión de cocina + 12 hamburguesas |
| `cuyna` | CUYNA26 | Como `jefe_cocina`, pero solo 6 hamburguesas: Bacon Juancheeseburger, Bacon Juniorburger, Junior, Piccolo, Vegeta y Carbonara |
| `sala` | SALA26 | Sala + 12 hamburguesas |
| `jefe_sala` | JEFESALA26 | Sala + Encargado de turno + 12 hamburguesas |
| `oficina` | OFICINA26 | Oficina |

Para limitar las fichas de un puesto, en `PROFILES` se usa `items:{grupo:[ids]}` (ver `cuyna`).

## Configuración (Railway → servicio → Variables)
Ver `.env.example`: `SESSION_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`. Si falta alguna, el servidor no arranca (a propósito).

## Local
```
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") MAIL_DEV_LOG=1 npm start
npm test
```
