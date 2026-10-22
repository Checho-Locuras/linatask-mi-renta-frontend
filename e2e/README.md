# Prueba de extremo a extremo (Playwright, Python)

Recorre en un navegador real los flujos de Mi renta contra el backend local:
- registro y verificación;
- login con correo y con cédula;
- crear y reanudar un expediente;
- preguntas, documentos y conciliación;
- acceso a un expediente ajeno;
- vista previa y caso no soportado;
- contador, aprobación y exportación;
- expiración de sesión y recuperación de contraseña;
- vista móvil.

Todos los datos son **sintéticos**.

Requisitos:
- Backend en `http://localhost:5080` en Development (correo en `.local-mail`, archivos en `.local-storage`).
- `App:AccountantEmails:0` del backend configurado con el correo de contador que usa la prueba (por defecto
  `contador.e2e@example.test`).
- Límite de autenticación ampliado **solo para esta prueba**: hace más de 10 llamadas de login por minuto, así que
  arranca el backend con `RateLimiting__AuthPerMinute=100`.
- Frontend en `http://localhost:4200` (`npm start`).
- Python 3.10+ con `pip install playwright` y `python -m playwright install chromium`.

```powershell
$env:MIRENTA_BACKEND_DIR = "C:\ruta\linatask-mi-renta-backend"   # para leer los correos .eml locales
python e2e/e2e.py
```

Variables opcionales:

| Variable | Uso |
|---|---|
| `MIRENTA_APP_URL` | URL del frontend |
| `MIRENTA_API_URL` | URL de la API |
| `MIRENTA_ACCOUNTANT_EMAIL` | Correo del contador de prueba |
| `MIRENTA_CHROME` | Ruta a Chromium o Chrome |
| `MIRENTA_E2E_OUT` | Carpeta de capturas (por defecto `e2e/out`) |
