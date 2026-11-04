# Procedimientos de equipo — Juancho's BBQ (interno)
Webapp de procedimientos por puesto. Repo PRIVADO — uso interno.

## Estructura
- `content/data.js` — **el contenido** (puestos, datos críticos, procedimientos, hamburguesas). Solo lo lee el servidor.
- `public/` — la interfaz (`index.html` + `app.js`). No contiene códigos ni contenido.
- `assets/` — fotos. Solo se sirven con sesión iniciada y al puesto que las tiene en su contenido.
- `server.js` — servidor Node sin dependencias: login, sesiones y control de acceso.

## Acceso
- Cada puesto tiene su código, que se valida en el servidor.
- Tras entrar, la sesión dura 12 h (cookie firmada, `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS).
- Cada puesto recibe solo sus secciones (p. ej. Oficina no ve las de cocina).
- 5 intentos fallidos desde la misma IP → bloqueo de 15 min.
- **Rotar el código de un puesto** (cambiar su variable) expulsa al momento a quien estuviera dentro con el código anterior.
- Cambiar `SESSION_SECRET` cierra todas las sesiones.

## Configuración (Railway → servicio → Variables)
Ver `.env.example`. Obligatorias:
- `SESSION_SECRET` (≥ 32 caracteres aleatorios)
- `CODE_COCINA`, `CODE_JEFE_COCINA`, `CODE_SALA`, `CODE_JEFE_SALA`, `CODE_OFICINA` (≥ 8 caracteres; si falta uno, ese puesto queda desactivado)

Si falta `SESSION_SECRET` o no hay ningún código, el servidor no arranca (a propósito).

## Local
```
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") CODE_COCINA=prueba123 npm start
npm test
```
