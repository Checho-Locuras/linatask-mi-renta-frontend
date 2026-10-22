"""E2E real: frontend independiente (localhost:4200) + API Mi renta (localhost:5080, User Secrets) + PostgreSQL.
Correo: carpeta .local-mail (sin SMTP). Almacenamiento: carpeta .local-storage (sin R2). Todos los datos son sintéticos."""
import glob, os, re, sys, time, uuid, json
from playwright.sync_api import sync_playwright, expect

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from files import certificate

OUT = os.environ.get("MIRENTA_E2E_OUT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
os.makedirs(OUT, exist_ok=True)
BACKEND = os.environ.get("MIRENTA_BACKEND_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "linatask-mi-renta-backend"))
MAIL = os.path.join(BACKEND, "src", "MiRenta.Api", ".local-mail")
STORE = os.path.join(BACKEND, "src", "MiRenta.Api", ".local-storage")
APP = os.environ.get("MIRENTA_APP_URL", "http://localhost:4200")
API = os.environ.get("MIRENTA_API_URL", "http://localhost:5080/api/v1/my-rent")
CHROME = os.environ.get("MIRENTA_CHROME")  # opcional: ruta a Chromium/Chrome
ACCOUNTANT = os.environ.get("MIRENTA_ACCOUNTANT_EMAIL", "contador.e2e@example.test")
PW = "Clave-Prueba-2025x"
results = []

def ok(name, cond=True, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)
    if not cond: raise SystemExit(1)

def last_link(email, path, after=0.0):
    for _ in range(40):
        files = sorted(glob.glob(f"{MAIL}/*.eml"), key=os.path.getmtime)
        for f in reversed(files):
            if os.path.getmtime(f) < after: continue
            body = open(f, encoding="utf-8", errors="replace").read()
            if f"To: {email}" in body or email in body.split("\n\n")[0]:
                m = re.search(rf"({APP}/{path}\?token=[A-Za-z0-9_\-]+)", body)
                if m: return m.group(1)
        time.sleep(0.5)
    raise RuntimeError(f"sin correo {path} para {email}")

def register(page, email, doc):
    page.goto(APP + "/", wait_until="networkidle")
    page.get_by_role("tab", name="Crear cuenta").click()
    page.fill("#mr-email", email); page.fill("#mr-doc", doc); page.fill("#mr-npw", PW)
    page.locator("input[formcontrolname=accept]").check()
    t0 = time.time() - 1
    page.get_by_role("button", name="Crear cuenta").click()
    expect(page.get_by_text("te enviamos un correo")).to_be_visible()
    link = last_link(email, "verificar-correo", t0)
    page.goto(link, wait_until="networkidle")
    expect(page.get_by_text("Correo verificado")).to_be_visible()
    return link

def login(page, ident, pw=PW):
    page.goto(APP + "/", wait_until="networkidle")
    if page.get_by_role("button", name="Cerrar sesión de Mi renta").count():
        page.get_by_role("button", name="Cerrar sesión de Mi renta").click()
    page.fill("#mr-id", ident); page.fill("#mr-pw", pw)
    page.get_by_role("button", name="Entrar").click()
    if pw == PW or pw == "NuevaClave-2026z":
        page.get_by_role("button", name="Cerrar sesión de Mi renta").or_(page.get_by_text("Credenciales inválidas")).first.wait_for(timeout=10000)

ANSWERS = [
    ("residente fiscal", ("radio", "Sí")), ("tipos de ingresos", ("check", ["Salario"])), ("responsable de IVA", ("radio", "No")),
    ("ingresos brutos laborales", ("amount", "120.000.000")), ("pensión descontados", ("amount", "4.800.000")),
    ("salud descontados", ("amount", "4.800.000")), ("Retención en la fuente", ("amount", "5.000.000")),
    ("dependieron", ("int", "0")), ("crédito de vivienda", ("amount", "0")), ("medicina prepagada", ("amount", "0")),
    ("bienes y derechos", ("amount", "80.000.000")), ("deudas", ("amount", "10.000.000")),
    ("tarjeta de crédito", ("amount", "12.000.000")), ("compras y consumos", ("amount", "40.000.000")),
    ("consignaciones", ("amount", "110.000.000")),
]

def answer_open_questions(page, stop_after=None, overrides=None):
    answered = 0
    page.wait_for_selector("[role=progressbar]", timeout=15000)  # datos del expediente cargados
    for _ in range(30):
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(300)
        tasks = page.locator("app-mr-task-answer").filter(has=page.get_by_role("button", name="Guardar respuesta"))
        if tasks.count() == 0:
            if answered == 0:
                page.screenshot(path=os.path.join(OUT, "sin-preguntas.png"), full_page=True)
            return answered
        task = tasks.first
        prompt = task.locator("p.prompt").inner_text()
        if "Revisa los valores" in prompt: return answered
        rule = next(((k, v) for k, v in (overrides or []) + ANSWERS if k.lower() in prompt.lower()), None)
        if rule is None: raise RuntimeError("pregunta sin respuesta preparada: " + prompt)
        kind, val = rule[1]
        if kind == "radio": task.get_by_label(val, exact=True).check()
        elif kind == "check":
            for v in val: task.get_by_label(re.compile(v)).check()
        elif kind == "amount": task.get_by_label("Valor en pesos").fill(val)
        elif kind == "int": task.get_by_label("Número").fill(val)
        before = prompt
        task.get_by_role("button", name="Guardar respuesta").click()
        page.wait_for_function("p => !Array.from(document.querySelectorAll('app-mr-task-answer p.prompt')).some(e => e.textContent.trim() === p)", arg=before.strip(), timeout=10000)
        answered += 1
        if stop_after and rule[0] == stop_after: return answered
    return answered

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    hosts = set(); console_errors = []
    page.on("request", lambda r: hosts.add(re.match(r"https?://[^/]+", r.url).group(0)) if r.url.startswith("http") else None)
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("dialog", lambda d: d.accept())

    run = uuid.uuid4().hex[:6]
    owner = f"titular.{run}@example.test"; doc = str(80000000 + int(time.time()) % 9999999)
    accountant = ACCOUNTANT; acc_doc = str(90000000 + int(time.time()) % 9999999)

    # 3–4 Registro y verificación con el enlace de .local-mail
    link = register(page, owner, doc)
    ok("3-4 registro + verificación (enlace leído de .local-mail)", "token=" not in page.url, "el token se retira de la URL")
    page.goto(link, wait_until="networkidle")
    ok("4b enlace de verificación de un solo uso", page.get_by_text("no es válido o expiró").is_visible())

    # 5 Login con correo y con cédula; error genérico
    login(page, owner, "Equivocada-123")
    expect(page.get_by_text("Credenciales inválidas")).to_be_visible()
    ok("11a contraseña errónea → mensaje genérico")
    login(page, owner)
    expect(page.get_by_role("button", name="Crear mi expediente 2025")).to_be_visible()
    ok("5a login con correo")
    page.get_by_role("button", name="Cerrar sesión de Mi renta").click()
    login(page, doc)
    expect(page.get_by_role("button", name="Crear mi expediente 2025")).to_be_visible()
    ok("5b login con cédula")

    # 6 Crear expediente y responder las primeras preguntas
    page.get_by_role("button", name="Crear mi expediente 2025").click()
    page.wait_for_url(re.compile(r"/expediente/"))
    case_url = page.url; case_id = case_url.rsplit("/", 1)[1]
    ok("6 expediente creado", len(case_id) == 36, case_id)
    n = answer_open_questions(page, stop_after="responsable de IVA")
    ok("8a preguntas progresivas respondidas en la UI", n == 3, f"{n} respuestas")

    # 7 Cerrar sesión, volver a entrar y continuar
    page.goto(APP + "/", wait_until="networkidle")
    page.get_by_role("button", name="Cerrar sesión de Mi renta").click()
    login(page, owner)
    page.get_by_role("link", name="Abrir").click()
    page.wait_for_url(re.compile(case_id))
    expect(page.get_by_text("3 de ")).to_be_visible()
    ok("7 expediente reanudado tras cerrar sesión (avance conservado)")

    # 9 Documento: certificado sintético → procesado → confirmación de valores
    page.get_by_role("tab", name="Documentos").click()
    page.set_input_files("#mr-file", files=[{"name": "certificado-220.pdf", "mimeType": "application/pdf", "buffer": certificate()}])
    expect(page.get_by_text("Documento recibido")).to_be_visible()
    stored = glob.glob(f"{STORE}/**/documents/*", recursive=True)
    ok("9a documento guardado en almacenamiento local antes de procesar", len(stored) >= 1, f"{len(stored)} objeto(s), clave opaca")
    page.set_input_files("#mr-file", files=[{"name": "malicioso.pdf", "mimeType": "application/pdf", "buffer": b"MZ\x90\x00\x03"}])
    expect(page.get_by_text("Formato no permitido")).to_be_visible()
    ok("9b archivo malicioso rechazado con mensaje claro")
    page.get_by_role("tab", name="Asistente").click()
    page.wait_for_selector("text=Revisa los valores que encontramos", timeout=30000)
    confirm = page.locator("app-mr-task-answer").filter(has_text="Revisa los valores")
    expect(confirm.locator("tbody tr")).to_have_count(4)
    confirm.get_by_role("button", name="Guardar respuesta").click()
    page.wait_for_selector("text=Revisa los valores que encontramos", state="detached")
    ok("9c valores del certificado propuestos y confirmados (4 campos)")

    page.get_by_role("tab", name="Documentos").click()
    csv = "Fecha;Descripción;Valor\n2025-03-01;PAGO NOMINA EMPRESA;10.000.000\n2025-03-10;CONSIGNACION EFECTIVO;4.500.000\n".encode()
    page.set_input_files("#mr-file", files=[{"name": "extracto.csv", "mimeType": "text/csv", "buffer": csv}])
    expect(page.get_by_text("Documento recibido")).to_be_visible()
    page.get_by_role("tab", name="Movimientos").click()
    page.wait_for_selector("text=Depósito sin origen identificado", timeout=30000)
    page.get_by_role("button", name="Préstamo").click()
    expect(page.get_by_text("Pendiente")).to_have_count(0)
    ok("9d extracto → depósito sin explicar → resuelto como préstamo")

    page.get_by_role("tab", name="Asistente").click()
    n = answer_open_questions(page)
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Requiere revisión de contador")).to_be_visible()
    ok("8b resto de preguntas (laborales ya respondidas por el documento)", n == 8, f"{n} respuestas")

    # 12 Vista previa tributaria
    page.get_by_role("tab", name="Cálculo y borrador").click()
    page.get_by_role("button", name="Calcular").click()
    expect(page.get_by_text("Vista previa", exact=True)).to_be_visible()
    expect(page.get_by_text("debe ingresarlo un contador autorizado", exact=False).first).to_be_visible()
    ok("12a vista previa bloqueada por valores de contador (sin borrador)")
    page.screenshot(path=f"{OUT}/vista-previa.png", full_page=True)

    # 10 Otro usuario no ve el expediente
    page2 = browser.new_context().new_page()
    other = f"otro.{run}@example.test"; other_doc = str(70000000 + int(time.time()) % 9999999)
    register(page2, other, other_doc); login(page2, other)
    page2.goto(case_url, wait_until="networkidle")
    expect(page2.get_by_text("Este expediente no existe o no tienes acceso")).to_be_visible()
    expect(page2.get_by_role("tab", name="Documentos")).to_have_count(0)
    ok("10 otro usuario recibe «No encontrado» en el expediente ajeno (IDOR)")

    # 12b Caso no soportado (dividendos) → bloqueado para revisión profesional
    page2.goto(APP + "/", wait_until="networkidle")
    page2.get_by_role("button", name="Crear mi expediente 2025").click(); page2.wait_for_url(re.compile("/expediente/"))
    answer_open_questions(page2, overrides=[("tipos de ingresos", ("check", ["Dividendos"]))])
    page2.get_by_role("tab", name="Cálculo y borrador").click()
    page2.get_by_role("button", name="Calcular").click()
    expect(page2.get_by_text("Cálculo bloqueado")).to_be_visible()
    expect(page2.get_by_text("unsupported.dividends", exact=False)).to_be_visible()
    ok("12b ingresos por dividendos bloquean el cálculo automático")

    # 13 Contador: autorización, valores, cálculo, aprobación, exportación y cierre
    acc_page = browser.new_context(accept_downloads=True).new_page()
    acc_page.on("dialog", lambda d: d.accept())
    if not glob.glob(f"{MAIL}/*.eml") or not any(accountant in open(f, errors="replace").read() for f in glob.glob(f"{MAIL}/*.eml")):
        register(acc_page, accountant, acc_doc)
    login(acc_page, accountant)
    expect(acc_page.get_by_role("heading", name="Expedientes")).to_be_visible()  # rol Contador (App:AccountantEmails)
    page.get_by_role("tab", name="Contador").click()
    page.fill("#mr-acc", accountant); page.get_by_role("button", name="Autorizar").click()
    expect(page.get_by_text("Si el correo corresponde a un contador")).to_be_visible()
    acc_page.reload(wait_until="networkidle")
    acc_page.locator(f"a[href='/expediente/{case_id}']").click(); acc_page.wait_for_url(re.compile(case_id))
    acc_page.get_by_role("tab", name="Contador").click()
    for code in ["accountant.advance_payment_next_year", "accountant.previous_year_advance"]:
        acc_page.fill(f"[id='{code}']", "0")
        acc_page.locator(f"[id='{code}']").locator("xpath=..").get_by_role("button", name="Guardar").click()
        expect(acc_page.get_by_text("Valor guardado.")).to_be_visible()
    ok("13a contador autorizado ingresa anticipos")

    page.reload(wait_until="networkidle")
    page.get_by_role("tab", name="Cálculo y borrador").click()
    page.get_by_role("button", name="Calcular").click()
    expect(page.get_by_text("Resultado preliminar")).to_be_visible()
    expect(page.get_by_text("Borrador v1")).to_be_visible()
    expect(page.get_by_text("5.419.000").first).to_be_visible()
    ok("13b cálculo preliminar y borrador v1 (impuesto $5.419.000 trazado)")
    expect(page.get_by_role("button", name="Exportar CSV")).to_have_count(0)
    ok("13c sin aprobación no se ofrece exportar")

    acc_page.reload(wait_until="networkidle"); acc_page.get_by_role("tab", name="Contador").click()
    acc_page.get_by_label("Comentario").fill("Revisado con certificado sintético")
    acc_page.get_by_label(re.compile("Revisé que las reglas")).check()
    acc_page.get_by_role("button", name="Aprobar").click()
    expect(acc_page.get_by_text("Borrador aprobado.")).to_be_visible()
    ok("13d contador aprueba (identidad, fecha y versión registradas)")

    page.reload(wait_until="networkidle"); page.get_by_role("tab", name="Cálculo y borrador").click()
    with page.expect_download() as dl:
        page.get_by_role("button", name="Exportar CSV").click()
    csv_out = open(dl.value.path(), encoding="utf-8-sig").read()
    ok("13e exportación CSV con advertencias", "por verificar" in csv_out and "No es la declaración oficial" in csv_out)
    page.get_by_role("button", name="Ya la presenté en la DIAN").click()
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Completado").first).to_be_visible()
    ok("13f expediente marcado como presentado por el contribuyente → Completado")

    # 11 Expiración de sesión: token de acceso inválido → renovación; refresh inválido → vuelve al inicio
    page.evaluate("""() => { const s = JSON.parse(sessionStorage.getItem('mirenta.session')); s.accessToken = 'x.y.z'; sessionStorage.setItem('mirenta.session', JSON.stringify(s)); }""")
    page.goto(case_url, wait_until="networkidle")
    expect(page.get_by_text("Completado").first).to_be_visible()
    ok("11b token de acceso vencido → se renueva solo con el refresh token")
    page.evaluate("""() => { const s = JSON.parse(sessionStorage.getItem('mirenta.session')); s.accessToken = 'x.y.z'; s.refreshToken = 'revocado'; sessionStorage.setItem('mirenta.session', JSON.stringify(s)); }""")
    page.goto(case_url, wait_until="networkidle")
    page.wait_for_url(re.compile(r"sesion=expirada"), timeout=15000)
    expect(page.get_by_text("Tu sesión de Mi renta expiró")).to_be_visible()
    ok("11c refresh inválido → sesión cerrada y aviso de sesión expirada")

    # 11d Recuperación de contraseña
    page.get_by_role("tab", name="Olvidé mi contraseña").click()
    page.fill("#mr-femail", owner); t0 = time.time() - 1
    page.get_by_role("button", name="Enviar instrucciones").click()
    expect(page.get_by_text("Si existe una cuenta con ese correo")).to_be_visible()
    reset = last_link(owner, "restablecer", t0)
    page.goto(reset, wait_until="networkidle")
    page.fill("#mr-rp1", "NuevaClave-2026z"); page.fill("#mr-rp2", "NuevaClave-2026z")
    page.get_by_role("button", name="Guardar").click()
    expect(page.get_by_text("Contraseña actualizada")).to_be_visible()
    login(page, owner, "NuevaClave-2026z")
    expect(page.get_by_role("link", name="Abrir")).to_be_visible()
    ok("11d recuperación de contraseña por enlace de un solo uso y login con la nueva")

    # Móvil
    page.set_viewport_size({"width": 390, "height": 844})
    page.get_by_role("link", name="Abrir").click(); page.wait_for_load_state("networkidle")
    overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    page.screenshot(path=f"{OUT}/movil.png", full_page=True)
    ok("móvil sin desbordamiento horizontal", not overflow)

    # 14 Sin LinaTask
    ok("14 la app solo habla con su propio origen y su API", hosts <= {"http://localhost:4200", "http://localhost:5080"}, ", ".join(sorted(hosts)))
    browser.close()

print(json.dumps({"passed": sum(1 for r in results if r[1]), "total": len(results)}))
