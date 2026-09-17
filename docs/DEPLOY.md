# Publicar el journal en journal.cesarzorrilla.com (privado)

Objetivo: que el journal viva 24/7 en un servidor, se abra en `https://journal.cesarzorrilla.com`, y solo puedan entrar las personas con usuario y contraseña que tú decidas.

## Qué necesita la app para funcionar en un servidor

- Un proceso Node siempre encendido (el radar descarga datos cada minuto). No sirve un hosting "serverless" como Vercel: allí el proceso se apaga entre peticiones y la base de datos SQLite no se guarda.
- Un disco persistente para `server/data` (base de datos SQLite, imágenes subidas, histórico del radar).
- Variables de entorno con las claves (nunca en el código).

Por eso la guía usa **Railway** (plan Hobby, unos 5 US$ al mes, con volumen persistente y dominio propio con HTTPS automático). Render o Fly.io valen igual con el mismo `Dockerfile`.

## Paso 1 · Subir el proyecto a GitHub (repositorio privado)

1. Entra en https://github.com/new con tu usuario (`eduardolny94`).
2. Nombre: `trading-journal`. Marca **Private**. No añadas README ni .gitignore. Pulsa **Create repository**.
3. En tu PC, el proyecto ya está preparado como repositorio git con su primer commit. Sube el código:

```bash
cd C:/Users/lucci/Desktop/claude/trading-journal
git push -u origin main
```

Si Windows pide iniciar sesión en GitHub, acepta en la ventana que se abre. El `.gitignore` deja fuera la base de datos, las imágenes, el `.env`, `node_modules` y los CSV de MT5: nada privado sube a GitHub.

## Paso 2 · Crear el servicio en Railway

1. Entra en https://railway.com y crea la cuenta con tu GitHub (botón "Login with GitHub").
2. **New Project → Deploy from GitHub repo → trading-journal**. Railway detecta el `Dockerfile` y empieza a construir (3–5 minutos la primera vez).
3. En el servicio: **Settings → Volumes → Add Volume**. Mount path: `/app/server/data`. Ahí se guardan la base de datos y las imágenes; sobrevive a cada despliegue.
4. **Variables** (pestaña Variables del servicio). Añade estas, una por una:

| Variable | Valor | Para qué |
|---|---|---|
| `JWT_SECRET` | una frase larga y aleatoria (32+ caracteres) | firma las sesiones. Cámbiala respecto a la del PC. |
| `FRED_API_KEY` | tu clave de FRED (la misma del `.env` del PC) | pilares macro del radar |
| `RADAR_OWNER_EMAILS` | `wediom8@gmail.com` | quién ve la pestaña privada Radar (separa varios con comas) |
| `INVITE_CODE` | una palabra secreta que solo tú sepas | sin ella nadie puede registrarse |
| `CORS_ORIGIN` | `https://journal.cesarzorrilla.com` | orígenes permitidos |
| `NODE_ENV` | `production` | cookies seguras y sin modo desarrollo |
| `TRUST_PROXY` | `1` | Railway pone un proxy delante; hace falta para HTTPS y límites de peticiones |

`PORT`, `JOURNAL_DB` y `UPLOADS_DIR` ya vienen en el `Dockerfile`; no hace falta tocarlos.

5. **Settings → Networking → Generate Domain** para tener una dirección temporal `xxx.up.railway.app` y comprobar que abre. Debe verse la pantalla de inicio de sesión.

## Paso 3 · El subdominio journal.cesarzorrilla.com

1. En Railway: **Settings → Networking → Custom Domain** → escribe `journal.cesarzorrilla.com`. Railway te muestra un registro **CNAME** con un valor del tipo `xxxx.up.railway.app`.
2. Ve a donde administras el DNS de `cesarzorrilla.com` (el sitio donde compraste el dominio o, si el portafolio está en Vercel con sus nameservers, el panel de dominios de Vercel). Añade un registro:
   - Tipo: `CNAME`
   - Nombre / host: `journal`
   - Valor / destino: el que te dio Railway
   - TTL: automático
3. Espera entre 5 minutos y unas horas (propagación). Railway emite el certificado HTTPS solo. Cuando abra `https://journal.cesarzorrilla.com`, listo.

## Paso 4 · Tu usuario y cerrar la puerta

1. Abre `https://journal.cesarzorrilla.com/registro`, crea tu usuario con tu email y escribe el **código de invitación** que pusiste en `INVITE_CODE`.
2. Cada persona que quieras dejar entrar necesita ese código. Si quieres cerrar el registro del todo, pon `REGISTRATION=closed` en Variables (el inicio de sesión sigue funcionando).
3. El usuario demo (`demo@journal.com`) no existe en el servidor: allí la base de datos empieza vacía. Si quieres llevarte tus datos del PC, copia `server/data/journal.db` al volumen (desde Railway: pestaña del volumen → "Upload" no existe; la forma sencilla es exportar e importar operaciones por CSV, o pedirme un script de migración).

## Actualizar la app más adelante

Cada `git push` a `main` vuelve a desplegar en Railway automáticamente. Desde el PC:

```bash
cd C:/Users/lucci/Desktop/claude/trading-journal
git add -A
git commit -m "cambios"
git push
```

## Si prefieres Render o Fly.io

- **Render**: New → Web Service → repo → Runtime Docker; añade un Disk montado en `/app/server/data`; mismas variables; Custom Domain con el CNAME que te dé Render. El plan gratuito se apaga a los 15 minutos sin uso (el radar dejaría de actualizarse): usa un plan de pago.
- **Fly.io**: `fly launch` con el Dockerfile, `fly volumes create data`, montar en `/app/server/data`, `fly secrets set ...`, `fly certs add journal.cesarzorrilla.com`.

## Seguridad que ya lleva la app

- Contraseñas con bcrypt, sesión en cookie httpOnly y segura en producción, límites de intentos de inicio de sesión, cabeceras de seguridad (helmet), comprobación de origen en cada petición que modifica datos, imágenes privadas por usuario, y el radar solo para los emails de `RADAR_OWNER_EMAILS`.
- Con `INVITE_CODE` nadie ajeno puede crear una cuenta; con `REGISTRATION=closed`, nadie más puede registrarse.

## Lo que aprendimos al desplegar de verdad (2026-09-18)

- **Volumen y permisos**: Railway monta el volumen como root y el `Dockerfile` corre como usuario `node`, así que la app no podía crear `journal.db` ("unable to open database file"). Solución sin tocar código: variable `RAILWAY_RUN_UID=0`.
- **Puerto**: Railway inyecta `PORT=8080` y la app escucha ahí (`API_PORT || PORT`). El dominio personalizado debe apuntar al **puerto 8080** (Settings → Networking → editar dominio), no al 3200 del Dockerfile. Con el puerto equivocado el borde devuelve 502 "Application failed to respond" aunque el healthcheck pase.
- **Límite de usuarios**: `MAX_USERS=4` cierra el registro cuando ya hay 4 cuentas (el inicio de sesión sigue). Junto con `INVITE_CODE`, solo entra quien tiene el código y mientras haya sitio.
- **DNS en Hostinger**: Railway pide dos registros, el CNAME `journal` y un TXT `_railway-verify.journal`; con ambos verifica el dominio en pocos minutos y emite el certificado.
- Railway detecta el monorepo y crea dos servicios (`client` y `server`); hay que borrar `client` y poner el `server` con constructor Dockerfile y ruta `/Dockerfile`. Su comando de inicio `npm run start --workspace=server` funciona igual.
