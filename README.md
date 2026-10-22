# Mi renta — frontend (Angular 19)

Aplicación web **independiente** de Mi renta: un asistente para preparar el borrador de la declaración de renta 2025
(formulario 210).

Consume solo la API de Mi renta
([`linatask-mi-renta-backend`](https://github.com/Checho-Locuras/linatask-mi-renta-backend)). No necesita LinaTask
instalado, abierto ni autenticado, y no usa su sesión, su JWT ni sus servicios.

> Estado: listo para **pruebas locales controladas**. No es una versión para usuarios finales.

## Estructura

```
src/
├─ environments/
│  ├─ environment.ts              producción: apiUrl (pública, vacía hasta desplegar)
│  └─ environment.development.ts  ng serve / ng test: http://localhost:5080/api/v1/my-rent
├─ app/
│  ├─ core/        sesión propia (sessionStorage), interceptor, guard, cliente HTTP, modelos
│  ├─ pages/
│  │  ├─ home/     acceso: login (correo o cédula), registro, recuperación; lista de expedientes
│  │  ├─ token/    verificar correo, nueva contraseña, baja de recordatorios
│  │  ├─ case/     expediente: asistente, documentos, movimientos, cálculo y borrador, contador
│  │  └─ dian/     consulta orientativa «¿debo declarar?» (desactivada por defecto en la API)
│  ├─ app.routes.ts / app.config.ts / app.component.ts
└─ styles.css     tokens de diseño (claro/oscuro) y estilos compartidos
e2e/              prueba de extremo a extremo con Playwright (Python) contra el backend local
```

## Requisitos

- Node.js 20 o 22 LTS, con npm.
- Backend de Mi renta corriendo en `http://localhost:5080`. Ver el README del backend.

## Comandos

```powershell
npm install                # instalar dependencias
npm start                  # http://localhost:4200 (usa environment.development.ts)
npm test                   # pruebas unitarias (Karma + Chrome)
npm run test:ci            # pruebas sin interfaz (Chrome headless, --no-sandbox)
npm run build              # compilación de producción en dist/mi-renta-frontend/browser
```

## Configurar la URL de la API

- **Local:** `src/environments/environment.development.ts` → `apiUrl: 'http://localhost:5080/api/v1/my-rent'`. Es el
  puerto del perfil `http` del backend. El backend, en Development, ya permite CORS desde `http://localhost:4200`.
- **Producción (futuro):** en `src/environments/environment.ts` pon la URL **https** pública de la API. Mientras esté
  vacía, la app muestra «Mi renta aún no está disponible en este entorno».

La URL de la API **no es un secreto**. En Angular nunca deben ir contraseñas, claves de firma, tokens de proveedores ni
credenciales: todo lo que se compila aquí lo puede leer cualquier visitante.

## Flujo local en 4 terminales

1. **PostgreSQL** en marcha. Configura los User Secrets del backend: `docs/CONFIGURATION.md` del backend.
2. **Backend:** `dotnet run --project src\MiRenta.Api --launch-profile http`.
3. **Frontend:** `npm start` y abre `http://localhost:4200`.
4. **Verificación de cuenta:** abre el `.eml` más reciente de `src/MiRenta.Api/.local-mail/` en el backend y copia el
   enlace `http://localhost:4200/verificar-correo?token=…`.

Para probar la revisión del contador:
- configura `App:AccountantEmails:0` en el backend;
- registra esa cuenta;
- desde el expediente del contribuyente, autoriza a ese correo en la pestaña **Contador**.

## Despliegue (fase posterior; no realizado)

- Define `apiUrl` en `environment.ts` con la URL https de la API.
- Publica `dist/mi-renta-frontend/browser` como sitio estático, con *fallback* de rutas a `index.html`.
- En el backend, añade el origen https del frontend a `App:AllowedOrigins` y a `App:FrontendBaseUrl`.
- En el host del sitio, configura cabeceras de seguridad: CSP con `connect-src` limitado a la API,
  `X-Content-Type-Options` y `Referrer-Policy`.
