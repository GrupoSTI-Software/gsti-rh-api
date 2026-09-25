# Encarecer y registrar el sondeo de correos personales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ponerle costo y rastro al sondeo de correos personales: dos contadores con llaves separadas (piso de escritura 40/min y contador de sondeo 20/h con bloqueo 1 h y techo por empresa), una bitácora Mongo `log_person_email_probe` que registra cada intento sin guardar el correo (incluida la carga masiva), y un índice simple sobre `people.person_email_hash`.

**Architecture:** El conteo vive en un guard de ruta (`personEmailProbeGuard`) montado en `POST`/`PUT` de `/api/persons`, que consume cuota en TODO intento y corta al topar; el desenlace se registra en el controlador (`accepted`/`rejected_not_available`) y en el guard (`rate_limited`), siempre best-effort. La carga masiva registra por fila desde `EmployeeService.createPerson` sin bloquear la importación. El hash es `blindIndex` (HMAC-SHA256), el mismo que persiste `people.person_email_hash`.

**Tech Stack:** Adonis 6 (limiter con store `memory`, Lucid/MySQL, japa), Mongo vía `LogStore.set`, i18n `resources/langs/{es,en}.json`.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1789762889970.md` (contrato fuente) y sus anexos verbatim:
`/Users/noeabelvargaslopez/Downloads/anexo-a-contadores-y-guard.md` (§A.1–A.6),
`/Users/noeabelvargaslopez/Downloads/anexo-b-bitacora-migracion-importador.md` (§B.1–B.3),
`/Users/noeabelvargaslopez/Downloads/anexo-c-bordes-tests-censo.md` (§C.1–C.3).
Los anexos traen el código casi final: este plan fija las desviaciones, los nombres exactos, el orden y las pruebas. El spec manda: cualquier cosa fuera de este censo se reporta y no se escribe.

## Validación de anclas (hecha el 2026-09-25, rama `feature/USRH1789762889970-encarecer-registrar-sondeo-correos`, HEAD `03639273`)

La hermana A (`USRH1789698261614`) **ya está integrada** (es ancestro de HEAD): el catálogo trae `EMAIL_NOT_AVAILABLE`, el emisor `respondPersonEmailNotAvailable` usa `ctx.i18n.t` y la unión discriminada `{ status: 422; reason: 'email-not-available' }` existe en `person_service.verifyInfo` (`person_service.ts:238`). Verificación de arranque del spec: OK (`person_identity_error_codes.ts` y `blind_index.ts` existen).

**Desviaciones del spec detectadas al validar — se corrigen en este plan, no se improvisan:**

1. **Código del 429.** El spec/anexo dice `EMP.PERSON.EMAIL_PROBE_RATE_LIMITED`, pero A dejó la familia real `PERSON.IDENTITY.005` (decisión registrada en su plan: "no se abre familia nueva"). Esta HU sigue la convención de A (spec §8: "sigue lo que A deje"): **el 429 es `PERSON.IDENTITY.006`** con `key: 'demasiados-intentos-de-captura-de-correo'`. Es desviación de contrato frente al texto del CA-1 → **pendiente visto bueno de Wilvardo en la revisión de este plan**.
2. **i18n.** A fijó `ctx.i18n.t` con claves planas (`person_email_not_available_title/detail` en `es.json`/`en.json`); el catálogo solo lleva `{key, code, status}`. El 429 añade sus dos claves `person_email_probe_rate_limited_title/detail` y los emisores leen el copy de i18n — el código del Anexo A.2 (`e.title`/`e.detail`) no compila contra el catálogo real y se adapta.
3. **`person_routes.ts` cambió de forma.** El verbatim del Anexo A.1 reemplazaría el archivo y BORRARÍA `middleware.businessScope()` y el `permissionGate` del `GET` (llegaron con `USRH1789698261609` tras la validación del spec). **Prohibido reemplazar el archivo: solo parche aditivo.** El comentario C-13 (`:5-26`) se conserva íntegro y no se intercalan comentarios en la cadena `.use()` del grupo (el censo `sensitive_access_context_mounts.spec.ts` la escanea línea por línea).
4. **Anclas de línea desplazadas** (drift trivial): `createPerson` está en `employee_service.ts:4213` (no `:4047`), firma `(employeeData: any, businessUnitId: number)`; `importFromExcel(file, allowedBusinessUnitIds)` en `:2751`, llamado desde `employee_controller.ts:7527` (ahí `ctx.auth.user` está disponible); el catch del `store` está en `:478`, la rama del correo del `update` en `:829-831`, el catch espejo del `update` en `:917`; el molde `UnknownSerialThrottleMemory` vive en `app/modules/adms/channel/access_point_lookup.ts:150` (no en `app/helpers/`); `handler.ts` ya tiene siete ramas de rate-limit, no cinco (la nueva va junto a las demás).
5. **CA-4 es matemáticamente insatisfiable con sus números.** Tres usuarios "justo por debajo" del límite individual (20/h) suman a lo más 60 intentos: jamás superan un techo por empresa de 200/h. Cobertura decidida: el techo `bu:` se prueba **a nivel unitario** (Task 3) con su umbral real; el funcional (Task 9) cubre lo que el CA-4 sí puede demostrar — tres usuarios de la misma empresa topados por su límite individual **no** tumban a la empresa, y un usuario de **otra** empresa sigue capturando en ese momento. **Llevar a Wilvardo**: o el techo baja (p. ej. 60/h = 3×20), o el CA-4 se reescribe con ≥11 usuarios. El anexo fija 200/h; este plan lo conserva mientras Wilvardo no diga otra cosa.

## Global Constraints

- **Nunca `limiter.penalize`** — regla dura del spec §7: consumo de cuota en TODO intento, forma middleware. `complaint_status_rate_limit.ts:5-9` es el contraejemplo documentado.
- **Frontera de A intacta:** prohibido tocar `person_service.ts`, `person_identity_api_error.ts`, el detector `isPersonEmailUniqueValidationError`, el contrato de `verifyInfo`, la entrada 422 del catálogo y el copy de A. En `person_controller.ts` SOLO se añaden llamadas a la bitácora.
- **El correo probado jamás** entra a `logger.*`, al mensaje de un `throw`, ni al cuerpo de una respuesta (`redact` no cubre `err.message`, `log_redact_paths.ts:21`).
- **Fallback de sujeto: IP, nunca un literal** tipo `'anonimo'` (cubo global único).
- **Correo vacío o nulo jamás se hashea** ni consume cuota ni genera fila: `blindIndex('')` es una constante que envenenaría la colección.
- **Índice SIMPLE, no único**, sobre `people.person_email_hash`.
- **La carga masiva nunca se bloquea ni falla** por el registro; su `outcome` NO consume cuota de ningún contador.
- **La bitácora es best-effort:** `try/catch` vacío; jamás cambia el status, el cuerpo ni las cabeceras de la respuesta.
- **TS estricto, cero `any` en código nuevo.** `LogRequestModel` es permisivo (`[key: string]: any`) — no hace falta cast ni extensión.
- **El 429 es indistinguible** entre los tres contadores: no menciona el correo, ni "registrado", ni cuál se topó. Un 422 no lleva cabeceras `X-RateLimit-*`.
- **Guardrail del repo:** `node ace test unit --files="constants/"` debe pasar en cada commit que toque algo.
- **El plan NO crea PR:** termina en la verificación automatizada (pruebas funcionales y de integración, Task 10) y en el manual de QA (Task 11), que el equipo de QA recorre manualmente. PR, staging y producción son proceso de Wilvardo y quedan fuera.
- **BD de pruebas antes de funcionales:** `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` (un esquema atrasado produce fallos falsos).
- Comentarios del supuesto de infraestructura **invertidos** ("efectivo hoy por topología de un solo proceso; decorativo en cuanto haya más de uno") en `person_routes.ts` y en el throttle, igual que el Anexo A.1/A.3.
- Commits en español con prefijo (`feat:`, `test:`, `docs:`), un commit por tarea.

## Review Focus

Lo que el spec implica pero ninguna tarea obvious ejercita, y lo que más puede morder a un usuario real — cada línea tiene su prueba en la tarea dueña del código:

1. **El 429 delata** (menciona el correo, la palabra "registrado", o qué contador se topó) → oráculo de segundo orden. Prueba: Task 1 (spec N5 aserta el cuerpo fijo del 429, que el copy en `es.json` no contiene "registrado" ni mención de contador) y Task 8 (CA-1: mismo cuerpo en el corte).
2. **Contar solo los fallos** (`penalize` o conteo condicionado al desenlace) → el límite se vuelve el oráculo amplificado. Prueba: Task 5 (aserción negativa por contenido de archivo sobre `person_routes.ts` y `person_email_probe_throttle.ts`) y Task 8 (CA-2: 21 altas todas exitosas topan igual).
3. **Hashear el correo vacío** → cúmulo falso de correlación en la colección. Prueba: Task 3 (el guard salta el vacío antes de hashear), Task 7 (el importador salta vacío y placeholder) y Task 8 (CA-10: sin fila, sin cuota).
4. **La bitácora lleva datos del titular colisionado** (`person_id`, `business_unit_id`, nombre) → mapa entre clientes de quién tiene a quién. Prueba: Task 2 (N8: campos exactos del payload) y Task 8 (CA-7: inspección de la fila capturada).
5. **El registro tumba o cambia la captura** (Mongo caído) → la protección se convierte en incidente de operación. Prueba: Task 2 (N8: `LogStore.set` que lanza no rechaza) y Task 8 (CA-8: respuesta byte a byte idéntica con `LogStore.set` lanzando).

---

### Task 1: La respuesta 429 — entrada de catálogo, i18n, documentación y helper de errores

**Files:**
- Create: `app/helpers/person_email_request_errors.ts`
- Test: `tests/unit/helpers/person_email_request_errors.spec.ts`
- Modify: `app/constants/person_identity_error_codes.ts` (SOLO la entrada 429), `resources/langs/es.json`, `resources/langs/en.json`, `docs/error_codes_documentation.md` (SOLO el 429)

**Interfaces:**
- Consumes: molde `business_unit_request_errors.ts:1-30` (helper) y sección `PERSON.IDENTITY.005` de `docs/error_codes_documentation.md:917` (docs). Emisor de A (`person_identity_api_error.ts:151-162`) como patrón i18n.
- Produces (Task 5, 6 y 8 dependen de esto):
  - `PERSON_IDENTITY_ERROR_CODES.EMAIL_PROBE_RATE_LIMITED = 'PERSON.IDENTITY.006'` y `PERSON_IDENTITY_ERRORS.EMAIL_PROBE_RATE_LIMITED: { key: 'demasiados-intentos-de-captura-de-correo', code: 'PERSON.IDENTITY.006', status: 429 }` (hay que añadir el nombre al typo de la unión `Record<...>` de `PERSON_IDENTITY_ERRORS` o no compila).
  - Claves i18n `person_email_probe_rate_limited_title` / `person_email_probe_rate_limited_detail` en `es.json` y `en.json` (los dos o ninguno).
  - `isPersonWritePath(url: string): boolean` — regex `/^\/api\/persons(\/\d+)?(\?|$)/`.
  - `isPersonWriteRateLimitError(error: unknown): error is InstanceType<typeof errors.E_TOO_MANY_REQUESTS>` (instancia O pato `{code: 'E_TOO_MANY_REQUESTS', response}`).
  - `respondPersonWriteRateLimit(ctx: Pick<HttpContext, 'response' | 'i18n'>, error: E_TOO_MANY_REQUESTS): void` — 429 + `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`, `X-RateLimit-Reset` + cuerpo `{title, detail, key, code}` con title/detail de `ctx.i18n.t`.
  - `respondPersonEmailProbeRateLimit(ctx: Pick<HttpContext, 'response' | 'i18n'>, retryAfterSeconds: number, limit: number): void` — misma forma; `limit` va por parámetro para no importar el contador (dependencia circular).

Copy fijado por el Anexo A.5 (es): title `Demasiados intentos de captura de correo`, detail `Superaste el límite de capturas permitidas en este periodo. Espera un momento e intenta de nuevo. Para dar de alta a varias personas, usa la carga masiva desde archivo.` Traducción al en con el mismo sentido; jamás la palabra "registrado", ni el correo, ni el contador topado.

- [ ] **Step 1: Escribir el spec que falla** (molde `tests/unit/helpers/auth_login_request_errors.spec.ts`):

```ts
// tests/unit/helpers/person_email_request_errors.spec.ts
// T1 del censo C.2. Sin bootear controladores: ctx falso con response espía e i18n falso.
// Grupos:
// 1) isPersonWritePath: acepta '/api/persons', '/api/persons/12', '/api/persons?x=1';
//    rechaza '/api/persons-get-places-of-birth', '/api/person-get-employee/12'.
// 2) isPersonWriteRateLimitError: true para new errors.E_TOO_MANY_REQUESTS(...) y para
//    { code: 'E_TOO_MANY_REQUESTS', response: {...} } (pato); false para Error común.
// 3) respondPersonWriteRateLimit: status 429; los 4 headers RFC 6585 con los valores
//    del error (limit, remaining, availableIn); body { title: 'person_email_probe_rate_limited_title',
//    detail: '..._detail', key: 'demasiados-intentos-de-captura-de-correo', code: 'PERSON.IDENTITY.006' }
//    (i18n falso devuelve la clave).
// 4) respondPersonEmailProbeRateLimit: idem con retryAfterSeconds=3600, limit=20,
//    X-RateLimit-Remaining 0.
// 5) Catálogo: PERSON_IDENTITY_ERRORS.EMAIL_PROBE_RATE_LIMITED = { key, code 'PERSON.IDENTITY.006', status 429 }.
// 6) readFileSync de resources/langs/es.json y en.json: las dos claves existen en AMBOS archivos,
//    y el detail es NO incluye 'registrado' ni 'sondeo'.
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node ace test unit --files="helpers/person_email_request_errors.spec"`
Expected: FAIL — no existe `app/helpers/person_email_request_errors.ts` ni la entrada del catálogo.

- [ ] **Step 3: Implementar** la entrada del catálogo (solo 429, en los dos objetos y el typo de la unión), las dos claves i18n en `es.json`/`en.json`, la sección de `docs/error_codes_documentation.md` (mismo molde que PERSON.IDENTITY.005, con ejemplo JSON del cuerpo 429 y nota de que las cabeceras RFC 6585 solo van en el 429), y `app/helpers/person_email_request_errors.ts` con las cuatro funciones del bloque Interfaces. TSDoc con el argumento del spec: el 429 es deliberadamente indistinguible entre contadores.

- [ ] **Step 4: Correr para verificar que pasa**

Run: `node ace test unit --files="helpers/person_email_request_errors.spec" && node ace test unit --files="constants/"`
Expected: PASS ambos.

- [ ] **Step 5: Commit**

```bash
git add app/helpers/person_email_request_errors.ts app/constants/person_identity_error_codes.ts resources/langs/es.json resources/langs/en.json docs/error_codes_documentation.md tests/unit/helpers/person_email_request_errors.spec.ts
git commit -m "feat: Agregar la respuesta 429 del sondeo de correo personal al catálogo e i18n"
```

### Task 2: La bitácora — `PersonEmailProbeLogService`

**Files:**
- Create: `app/services/person_email_probe_log_service.ts`
- Test: `tests/unit/services/person_email_probe_log_service.spec.ts`

**Interfaces:**
- Consumes: `LogStore.set` (`app/models/MongoDB/log_store.ts`), `blindIndex` solo para fabricar hashes de prueba. Molde: `scope_denied_log_service.ts` y su spec.
- Produces (Tasks 3, 7 y 8 dependen de esto):
  - `type PersonEmailProbeOutcome = 'accepted' | 'rejected_not_available' | 'rate_limited'`
  - `interface PersonEmailProbeLogEntry { path: 'store' | 'update' | 'import'; personEmailHash: string; outcome: PersonEmailProbeOutcome; actorUserId: number | null; businessUnitScope: number[]; targetPersonId: number | null }`
  - `PersonEmailProbeLogService.log(entry: PersonEmailProbeLogEntry): Promise<void>` — escribe en la colección `'log_person_email_probe'` con campos `path, email_hash, outcome, actor_user_id, business_unit_scope, target_person_id, date` (`date` = `DateTime.local().setZone('utc').toISO()`), dentro de `try { } catch { }` vacío. Código verbatim del Anexo B.1.

- [ ] **Step 1: Escribir el spec que falla** (molde `tests/unit/services/scope_denied_log_service.spec.ts`): stub de `LogStore.set` capturando `(collectionName, payload)`; restaurar en `teardown`.

```ts
// Grupos:
// 1) Escribe en 'log_person_email_probe' y el payload lleva EXACTAMENTE las 7 llaves
//    path, email_hash, outcome, actor_user_id, business_unit_scope, target_person_id, date.
// 2) date casa con /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/ (UTC ISO).
// 3) JSON.stringify(payload) NO contiene el correo en claro usado para fabricar el hash
//    (p. ej. 'sondeo-prueba@dominio.mx'), ni 'person_id', ni 'business_unit_id'.
// 4) LogStore.set = async () => { throw new Error('Mongo caído') } → log() resuelve sin rechazar.
// 5) Los tres outcome se aceptan (tipeo compila en tiempo de prueba).
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node ace test unit --files="services/person_email_probe_log_service.spec"`
Expected: FAIL — no existe el servicio.

- [ ] **Step 3: Implementar** `app/services/person_email_probe_log_service.ts` verbatim del Anexo B.1 (TSDoc completo: seudonimizada no anónima, LFPDPPP, retención, prohibición del titular colisionado).

- [ ] **Step 4: Correr para verificar que pasa**

Run: `node ace test unit --files="services/person_email_probe_log_service.spec"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/person_email_probe_log_service.ts tests/unit/services/person_email_probe_log_service.spec.ts
git commit -m "feat: Agregar la bitácora de intentos de captura de correo personal"
```

### Task 3: El contador del sondeo, el guard y el envoltorio del desenlace

**Files:**
- Create: `app/helpers/person_email_probe_throttle.ts`
- Test: `tests/unit/helpers/person_email_probe_throttle.spec.ts`

**Interfaces:**
- Consumes: `limiter` (`@adonisjs/limiter/services/main`, como el molde `app/modules/adms/channel/access_point_lookup.ts:150-172`), `blindIndex` (`#utils/blind_index`), `PersonEmailProbeLogService.log` (Task 2), `respondPersonEmailProbeRateLimit` (Task 1).
- Produces (Tasks 5, 6 y 8 dependen de esto):
  - `PERSON_EMAIL_PROBE_RATE = { requests: 20, duration: '1 hour', blockMinutes: 60 } as const`
  - `PERSON_EMAIL_PROBE_BUSINESS_RATE = { requests: 200, duration: '1 hour', blockMinutes: 60 } as const`
  - `class PersonEmailProbeThrottleMemory implements PersonEmailProbeThrottle` con `isBlocked(subject): Promise<boolean>` y `count(subject): Promise<'ok' | 'threshold_reached'>` — `count` incrementa y, al llegar a `remaining === 0`, aplica `counter.block(key, '${blockMinutes} minutes')`; llave `person-email-probe:${subject}`.
  - `class PersonEmailProbeBusinessThrottleMemory extends PersonEmailProbeThrottleMemory` con `rate = PERSON_EMAIL_PROBE_BUSINESS_RATE`.
  - `personEmailProbeGuard(ctx: HttpContext, next: NextFn): Promise<void>` — verbatim Anexo A.3 con UNA corrección: además de `path, emailHash, actorUserId, businessUnitScope`, el contexto lleva `targetPersonId` (`Number(ctx.params.personId) || null` en PUT, `null` en POST), porque `PersonEmailProbeLogEntry.targetPersonId` es "el expediente sobre el que se escribe". Flujo: correo vacío → `next()` sin tocar nada; `isBlocked` (usuario O empresa) → fila `rate_limited` + `respondPersonEmailProbeRateLimit`; si no, `count` en los DOS contadores (retorno ignorado: el corte cae en el intento siguiente) y `ctx.personEmailProbe = { ... }`.
  - `logPersonEmailProbe(ctx: HttpContext, outcome: 'accepted' | 'rejected_not_available'): Promise<void>` — si `ctx.personEmailProbe` no existe no hace nada; si existe llama `PersonEmailProbeLogService.log` con los datos del contexto.
  - `interface PersonEmailProbeContext { path: 'store' | 'update'; emailHash: string; actorUserId: number | null; businessUnitScope: number[]; targetPersonId: number | null }`
  - Module augmentation de `HttpContext` con `personEmailProbe?: PersonEmailProbeContext` (sin `any`, sin cast).
  - Sujeto: `user:${ctx.auth.user?.userId ?? ctx.request.ip()}` y `bu:${ctx.businessUnitScope[0] ?? 'sin-empresa'}` — NUNCA literal.

- [ ] **Step 1: Escribir el spec que falla** (molde `tests/unit/helpers/complaint_status_rate_limit.spec.ts`; el runner de `ace test` bootea la app, así que el singleton `limiter` con store `memory` está disponible — usar sujetos ÚNICOS por test porque el store persiste entre casos):

```ts
// Grupos (clases, con sujetos únicos por test: 'user:u1-t1', 'bu:b1-t1', ...):
// 1) 19 count() devuelven 'ok', el 20º 'threshold_reached' (con rate por defecto 20).
// 2) isBlocked(subject) es true después del 20º count; otro subject distinto no está bloqueado
//    (la llave es por sujeto) y sigue contando 'ok'.
// 3) PersonEmailProbeBusinessThrottleMemory usa PERSON_EMAIL_PROBE_BUSINESS_RATE (200):
//    199 'ok', el 200º 'threshold_reached', y su llave no interfiere con la del usuario.
// 4) logPersonEmailProbe: con ctx falso que tiene personEmailProbe, stub de LogStore.set captura
//    la fila con el outcome dado; con ctx SIN personEmailProbe, LogStore.set no se invoca
//    (regla del correo vacío decidida en un solo lugar).
// 5) Aserción de contenido de archivo: 'penalize' NO aparece en person_email_probe_throttle.ts.
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node ace test unit --files="helpers/person_email_probe_throttle.spec"`
Expected: FAIL — no existe el helper.

- [ ] **Step 3: Implementar** `app/helpers/person_email_probe_throttle.ts` según el bloque Interfaces y el Anexo A.3 (corregido por la desviación 2: el 429 sale del helper de Task 1 con i18n; y por `targetPersonId`). TSDoc: regla dura nunca-penalize, reparto del registro guard/controlador, comentario invertido de topología.

- [ ] **Step 4: Correr para verificar que pasa**

Run: `node ace test unit --files="helpers/person_email_probe_throttle.spec" && node ace test unit --files="helpers/person_email_request_errors.spec"`
Expected: PASS ambos (el segundo confirma que no se rompió nada del Task 1).

- [ ] **Step 5: Commit**

```bash
git add app/helpers/person_email_probe_throttle.ts tests/unit/helpers/person_email_probe_throttle.spec.ts
git commit -m "feat: Agregar el contador del sondeo de correo personal y su guard de ruta"
```

### Task 4: Migración del índice simple sobre `person_email_hash`

**Files:**
- Create: `database/migrations/<timestamp generado>_add_index_person_email_hash_to_people_table.ts` (generar con ace; el número NO se escribe a mano)

**Interfaces:**
- Consumes: nada de tareas previas. Verificado: la columna la crea `1782900000011_add_person_email_hash_to_people_table.ts` y NINGUNA de las tres migraciones del correo declara `table.index()` — el índice no existe hoy.
- Produces: índice `people_person_email_hash_index` sobre `people.person_email_hash` (SIMPLE, no único). Tasks 8/9 dependen de él para velocidad; Task 7 lo aprovecha en su consulta por fila.

- [ ] **Step 1: Generar la migración**

Run: `node ace make:migration AddIndexPersonEmailHashToPeopleTable`
Expected: archivo nuevo con el siguiente timestamp disponible (tras `1790265859368`).

- [ ] **Step 2: Escribir el cuerpo** verbatim del Anexo B.2: `up()` con `this.schema.alterTable('people', (table) => table.index(['person_email_hash'], 'people_person_email_hash_index'))`, `down()` con `dropIndex` del mismo nombre. TSDoc del anexo (cierra el canal del TIEMPO de respuesta; no es el UNIQUE fuera del set).

- [ ] **Step 3: Aplicar y verificar en la BD de pruebas**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`
Expected: termina sin errores.

Run: `mysql -u root -p sae_pruebas -e "SHOW INDEX FROM people WHERE Key_name='people_person_email_hash_index';"`
(ajustar credenciales a las de `.env` de pruebas)
Expected: una fila (Non_unique = 1).

- [ ] **Step 4: Verificar que el guardrail y las suites unitarias siguen verdes**

Run: `node ace test unit --files="constants/"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/*_add_index_person_email_hash_to_people_table.ts
git commit -m "feat: Agregar índice simple de búsqueda sobre person_email_hash"
```

### Task 5: Rutas — piso de escritura y guard montados; rama del handler

**Files:**
- Modify: `start/routes/person_routes.ts` (parche aditivo, NUNCA reemplazo), `app/exceptions/handler.ts`
- Test: `tests/unit/routes/person_routes_rate_limit.spec.ts`

**Interfaces:**
- Consumes: `personEmailProbeGuard` (Task 3), `isPersonWritePath`/`isPersonWriteRateLimitError`/`respondPersonWriteRateLimit` (Task 1), molde `business_unit_routes.ts:11-22` para el limiter.
- Produces: `personWriteRateLimit = limiter.define('person-write', ...)` con `allowRequests(40).every('1 minute')` y llave `person-write:user:${ctx.auth.user?.userId ?? ctx.request.ip()}`; montado con `personEmailProbeGuard` como `.use([personWriteRateLimit, personEmailProbeGuard])` SOLO en `POST /` y `PUT /:personId` (el middleware de ruta corre después del grupo, así `ctx.auth.user` y `ctx.businessUnitScope` ya están). El handler responde el 429 del limiter. Tasks 8 y 9 ejercitan todo esto por HTTP.

- [ ] **Step 1: Escribir el spec que falla** (molde `tests/unit/routes/complaint_status_routes.spec.ts` — aserciones por contenido de archivo):

```ts
// Grupos:
// 1) POST / y PUT /:personId de /api/persons montan [personWriteRateLimit, personEmailProbeGuard];
//    GET / y GET /:personId y DELETE /:personId NO montan ninguno de los dos.
// 2) El limiter 'person-write' permite 40 cada '1 minute' con llave person-write:user: y
//    respaldo ctx.request.ip() (assert.include de las cadenas).
// 3) NEGATIVA: readFileSync de start/routes/person_routes.ts y de
//    app/helpers/person_email_probe_throttle.ts — 'penalize' no aparece en NINGUNO (CA-2).
// 4) NEGATIVA: el bloque del grupo de /api/persons conserva 'middleware.businessScope()' y
//    'middleware.sensitiveAccess()' (el parche es aditivo; desviación 3).
// 5) handler.ts contiene la rama isPersonWriteRateLimitError(error) && isPersonWritePath(...)
//    que responde respondPersonWriteRateLimit, DESPUÉS de las ramas existentes.
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node ace test unit --files="routes/person_routes_rate_limit.spec"`
Expected: FAIL — ni limiter ni guard montados.

- [ ] **Step 3: Parchear `person_routes.ts` aditivamente**: imports de `limiter` y `personEmailProbeGuard`; definición de `personWriteRateLimit` ARRIBA del grupo con el comentario invertido de topología (Anexo A.1, texto íntegro); `.use([personWriteRateLimit, personEmailProbeGuard])` en las líneas de `router.post('/', ...)` y `router.put('/:personId', ...)`. NO tocar el comentario C-13, NO tocar la cadena `.use()` del grupo, NO borrar `businessScope()`/`permissionGate`/`sensitiveAccess()`/`sensitiveMaskEcho()`.

- [ ] **Step 4: Parchear `handler.ts`**: import de las tres funciones del helper de Task 1 (patrón de los imports `:25-34`) y la nueva rama junto a las demás ramas de rate-limit, dentro de `handle()`, antes del `return super.handle(...)`:

```ts
if (isPersonWriteRateLimitError(error) && isPersonWritePath(ctx.request.url())) {
  return respondPersonWriteRateLimit(ctx, error)
}
```

- [ ] **Step 5: Correr specs y typecheck**

Run: `node ace test unit --files="routes/person_routes_rate_limit.spec" && node ace test unit --files="routes/sensitive_access_context_mounts.spec" && pnpm run typecheck`
Expected: PASS los tres (el censo de sensitive access confirma que el parche no rompió la cadena).

- [ ] **Step 6: Commit**

```bash
git add start/routes/person_routes.ts app/exceptions/handler.ts tests/unit/routes/person_routes_rate_limit.spec.ts
git commit -m "feat: Montar el piso de escritura y el guard del sondeo en /api/persons"
```

### Task 6: Controlador — las cuatro llamadas a la bitácora

**Files:**
- Modify: `app/controllers/person_controller.ts` (SOLO llamadas a la bitácora; cuatro puntos)

**Interfaces:**
- Consumes: `logPersonEmailProbe(ctx, outcome)` (Task 3), las ramas que A ya dejó escritas (`isPersonEmailUniqueValidationError` en `:478` y `:917`, la rama del correo del `update` en `:829-831`, las rutas felices).
- Produces: nada para otras tareas; el comportamiento se prueba en Task 8 (así lo fija el censo C.2: el funcional N9 es dueño del comportamiento del desenlace).

Puntos exactos (Anexo A.6, adaptado a las líneas reales):
1. `store`, catch: dentro de la rama `if (isPersonEmailUniqueValidationError(error))` (`:478`), ANTES del `return respondPersonEmailNotAvailable(ctx)`: `await logPersonEmailProbe(ctx, 'rejected_not_available')`. La lógica de A no se toca.
2. `store`, ruta feliz: tras persistir el expediente y antes del return de éxito: `await logPersonEmailProbe(ctx, 'accepted')`.
3. `update`, rama del correo (`:829-831`, `if (identityCheck.status === 422 && 'reason' in identityCheck)`): antes del `return respondPersonEmailNotAvailable(ctx)`: `await logPersonEmailProbe(ctx, 'rejected_not_available')`.
4. `update`, ruta feliz: tras persistir la edición, antes del return de éxito: `await logPersonEmailProbe(ctx, 'accepted')`.

El catch espejo del `update` (`:917`) NO se toca: hoy no se ejercita (lo dice el propio comentario de A) y el censo fija cuatro puntos.

- [ ] **Step 1: Baseline verde antes de tocar** — correr los specs existentes que fijan las respuestas byte a byte de A:

Run: `node ace test functional --files="person_user_email_mirror.spec" && node ace test functional --files="employees/person_store_subject_type_permission_gate.spec"`
Expected: PASS (si algo ya está roto, parar y reportar: no es de esta HU).

- [ ] **Step 2: Insertar las cuatro llamadas** según el bloque de puntos exactos, con el import de `logPersonEmailProbe` desde `#helpers/person_email_probe_throttle`. Ninguna otra línea del archivo cambia.

- [ ] **Step 3: Verificar que nada cambió para el cliente**

Run: `pnpm run typecheck && node ace test functional --files="person_user_email_mirror.spec" && node ace test functional --files="employees/person_store_subject_type_permission_gate.spec"`
Expected: PASS — el diff de comportamiento es cero (las llamadas son await de una función best-effort con contexto; con correo vacío el contexto no existe y son no-ops).

- [ ] **Step 4: Revisión del diff (gate manual del DoD)**

Run: `git diff app/controllers/person_controller.ts`
Expected: SOLO el import y las cuatro llamadas con su comentario breve. Cualquier otra cosa (emisor, detector, copy, catálogo) es invasión de frontera: revertir y reportar.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/person_controller.ts
git commit -m "feat: Registrar el desenlace del intento de correo desde el controlador de personas"
```

### Task 7: Carga masiva — actor propagado y registro por fila (D7)

**Files:**
- Modify: `app/services/employee_service.ts`, `app/controllers/employee_controller.ts`

**Interfaces:**
- Consumes: `PersonEmailProbeLogService.log` (Task 2), `blindIndex` (`#utils/blind_index`), modelo `Person` (ya importado en `employee_service`).
- Produces: `importFromExcel(file, allowedBusinessUnitIds, actorUserId: number | null)` — parámetro nuevo al final; el controlador (`employee_controller.ts:7527`) pasa `ctx.auth.user?.userId ?? null`. `createPerson(employeeData, businessUnitId, actorUserId, businessUnitScope)` — dos parámetros nuevos; `businessUnitScope` es el `allowedBusinessUnitIds` del actor. El registro por fila es verbatim Anexo B.3: tras `person.personEmail = this.importSensitiveValueOrDefault(employeeData.personalEmail)`, si ese valor (ya recortado) no es `''`: `emailHash = blindIndex(...)`, consulta `Person.query().where('person_email_hash', emailHash).whereNull('person_deleted_at').first()`, y `PersonEmailProbeLogService.log({ path: 'import', personEmailHash, outcome: taken ? 'rejected_not_available' : 'accepted', actorUserId, businessUnitScope, targetPersonId: null })`. NUNCA un `continue` ni un throw por esto. NO consume cuota de ningún contador.

- [ ] **Step 1: Baseline verde antes de tocar**

Run: `node ace test functional --files="employees/employees_downloads_imports_permission_gate.spec" && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 2: Propagar el actor** — `importFromExcel` gana `actorUserId: number | null` (al final de la firma, con default `null` para no romper otros llamadores si existieran); `employee_controller.ts:7527` pasa `ctx.auth.user?.userId ?? null`; el único llamador de `createPerson` (`:3085`) pasa `actorUserId` y `allowedBusinessUnitIds`.

- [ ] **Step 3: Registrar por fila en `createPerson`** (`:4213`) según el bloque Interfaces, con el comentario del anexo: el importador sigue sin imponer unicidad; esta HU solo deja el rastro. El correo vacío y el placeholder de `importSensitiveValueOrDefault` (que devuelve `''`) NO producen fila ni hash — la condición `!== ''` ya los excluye.

- [ ] **Step 4: Verificar**

Run: `pnpm run typecheck && pnpm run lint && node ace test functional --files="employees/employees_downloads_imports_permission_gate.spec"`
Expected: PASS. La prueba de comportamiento (CA-9) llega en Task 9.

- [ ] **Step 5: Commit**

```bash
git add app/services/employee_service.ts app/controllers/employee_controller.ts
git commit -m "feat: Registrar el intento de correo de cada fila en la carga masiva"
```

### Task 8: Funcional del sondeo por API (parte 1 de N9)

**Files:**
- Test: `tests/functional/person_email_probe_disclosure.spec.ts` (NUEVO)

**Interfaces:**
- Consumes: todo lo montado en Tasks 1-6; helpers `tests/helpers/tenant_actor.ts` (dos empresas, actores frescos por test — claves de limiter únicas por usuario), `captureLogStore` de `tests/functional/person_user_email_mirror_support.ts` (stub de `LogStore.set` que captura filas sin Mongo) y su molde de "Mongo caído" (`LogStore.set = async () => { throw new Error('Mongo no disponible') }`, como `system_setting_update_tenant_isolation.spec.ts:505`).
- Produces: el spec funcional que Task 9 extiende con los casos de carga masiva y techo por empresa.

Corresos de prueba: fabricar direcciones únicas por test (`probe-<uuid>@dominio.test`) — el store `memory` y las unicidades globales persisten entre tests del mismo runner. La BD va fresh antes de la suite (Global Constraints).

- [ ] **Step 1: Poner la BD de pruebas al día**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`
Expected: sin errores.

- [ ] **Step 2: Escribir los casos** (molde de montaje: `tests/functional/employees/person_store_subject_type_permission_gate.spec.ts`; cada caso con `captureLogStore`):

```ts
// CA-3 (y CA-1): un actor envía 40 POST/PUT a /api/persons con 40 correos distintos,
// mitad libres y mitad ocupados por expedientes sembrados. Assert: los primeros 20
// responden 200/422 estándar; del 21 en adelante TODOS responden 429 con el mismo cuerpo
// {title, detail, key: 'demasiados-intentos-de-captura-de-correo', code: 'PERSON.IDENTITY.006'}
// y cabecera Retry-After; la bitácora capturada tiene 40 filas con el mismo actor_user_id,
// con outcomes accepted, rejected_not_available Y rate_limited presentes.
//
// CA-2: otro actor hace 21 altas TODAS exitosas (correos libres válidos). Assert: la 21ª
// responde el MISMO 429 (el corte no distingue aciertos de fallos).
//
// CA-5: un actor da de alta 15 trabajadores SIN personEmail. Assert: ninguna 429, cero filas
// capturadas.
//
// CA-6: se edita un expediente reenviando SU PROPIO correo. Assert: 200, una fila con
// outcome 'accepted' y target_person_id = id del expediente editado.
//
// CA-10: altas con personEmail '', null y '   '. Assert: 201/200 sin 429, cero filas.
//
// CA-8: con LogStore.set lanzando, un alta con correo responde IGUAL (status, cuerpo y
// cabeceras comparados) que la misma petición con LogStore.set en no-op. Sin excepción.
//
// CA-7: inspección de una fila capturada: exactamente las 7 llaves; el correo en claro no
// aparece en JSON.stringify(fila); no hay person_id ajeno, business_unit_id ni nombre —
// solo actor_user_id, business_unit_scope (del actor) y target_person_id (propio o null).
//
// CA-12: un actor envía 41 escrituras SIN personEmail en un minuto. Assert: la 41ª responde
// 429 (piso de ruta); un GET / y un DELETE del mismo actor en ese momento NO están bloqueados.
```

- [ ] **Step 3: Correr el spec** (nuevo archivo: falla si algo de Tasks 1-6 está mal cableado)

Run: `node ace test functional --files="person_email_probe_disclosure.spec"`
Expected: PASS. Si falla, el error es de Tasks 1-6: arreglar la fuente, no el spec.

- [ ] **Step 4: Correr las suites de regresión**

Run: `node ace test unit --files="constants/" && node ace test functional --files="person_user_email_mirror.spec"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/functional/person_email_probe_disclosure.spec.ts
git commit -m "test: Probar el corte, la bitácora y los bordes del sondeo por API"
```

### Task 9: Funcional de carga masiva y techo por empresa (parte 2 de N9)

**Files:**
- Test: `tests/functional/person_email_probe_disclosure.spec.ts` (se EXTIENDE el archivo de Task 8)

**Interfaces:**
- Consumes: Task 7 (registro por fila), `captureLogStore`, el endpoint `POST /api/employees/import-excel` con actores de `tenant_actor.ts`.
- Produces: cobertura de CA-9 y la parte demostrable de CA-4.

- [ ] **Step 1: Escribir los casos nuevos** en un grupo aparte del mismo spec:

```ts
// CA-9: subir un .xlsx de plantilla con ~8 filas: correos libres, correos ya registrados
// (por un expediente sembrado de OTRA empresa — la unicidad es global) y filas con el
// correo vacío. Fabricar el buffer con ExcelJS (molde: tests/functional/helpers/
// contrato_import_excel_fixture.ts); [VERIFICAR AL IMPLEMENTAR] los encabezados exactos
// contra EmployeeService.validateExcelHeaders — el molde más seguro es descargar la
// plantilla real con GET /api/employees/template-excel y rellenarla. Assert: la importación
// termina 200 con su summary; captureLogStore tiene UNA fila por cada fila con correo no
// vacío, con path 'import', actor_user_id del que subió el archivo, y outcomes
// accepted/rejected_not_available según el caso; las filas vacías no produjeron fila.
//
// CA-4 (parte demostrable — ver desviación 5): tres usuarios de la MISMA empresa topando
// cada uno su límite individual (20). Assert: los tres reciben 429, PERO la empresa no
// quedó "topada": un cuarto usuario de la misma empresa sigue capturando con normalidad;
// y en ese mismo momento un usuario de OTRA empresa captura sin fricción. El tope bu: de
// 200/h con tres usuarios es inalcanzable por diseño (3×20=60): su umbral real se probó
// en la Task 3. Dejar comentario citando la desviación para Wilvardo.
```

- [ ] **Step 2: Correr el spec completo**

Run: `node ace test functional --files="person_email_probe_disclosure.spec"`
Expected: PASS los dos grupos.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/person_email_probe_disclosure.spec.ts
git commit -m "test: Probar el rastro de la carga masiva y el aislamiento del límite por actor"
```

### Task 10: Verificación final automatizada — DoD, EXPLAIN y dimensionamiento de D7

**Files:**
- Sin archivos nuevos; verificación y ajustes menores si algo truena.

**Nota de alcance:** el plan termina en la verificación automatizada (pruebas funcionales y de integración) y el manual de QA. La creación del PR, staging y producción quedan FUERA de este plan: eso es proceso de Wilvardo, no una tarea de implementación.

- [ ] **Step 1: Greps del DoD**

Run: `grep -rn "penalize" start/routes/person_routes.ts app/helpers/person_email_probe_throttle.ts; grep -rn "anonimo" start/routes/person_routes.ts app/helpers/person_email_probe_throttle.ts; grep -rn "personEmail" app/helpers/person_email_probe_throttle.ts app/services/person_email_probe_log_service.ts | grep -i "logger\|throw"`
Expected: las tres salidas VACÍAS.

- [ ] **Step 2: Suites y calidad**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed && node ace test unit --files="constants/" && node ace test unit --files="helpers/person_email_request_errors.spec" && node ace test unit --files="helpers/person_email_probe_throttle.spec" && node ace test unit --files="routes/person_routes_rate_limit.spec" && node ace test unit --files="services/person_email_probe_log_service.spec" && node ace test functional --files="person_email_probe_disclosure.spec" && pnpm run typecheck && pnpm run lint && pnpm run lint:terminology`
Expected: TODO verde.

- [ ] **Step 3: EXPLAIN (CA-11)** — contra una BD con filas en `people` (la de pruebas recién sembrada; si tiene pocas filas el optimizador puede ignorar el índice, en cuyo caso verificar contra staging):

Run: `mysql -u root -p sae_pruebas -e "EXPLAIN SELECT person_id FROM people WHERE person_email_hash = '<hash de prueba>' AND person_deleted_at IS NULL;"`
Expected: `key: people_person_email_hash_index`, tanto cuando el hash existe como cuando no.

- [ ] **Step 4: Dimensionar D7 (riesgo R-4)** — generar un .xlsx de 500 filas con correo personal y cronometrar la importación con y sin el registro (comentar temporalmente la llamada a `PersonEmailProbeLogService.log` en `createPerson`, medir, descomentar, medir):

Run: medir con `time` sobre el endpoint de importación en local con la BD de pruebas.
Expected: el delta queda asentado en el commit de cierre (dos operaciones extra por fila: una consulta MySQL ahora indexada + una escritura Mongo). Si el delta es exponencial o inaceptable, reportar antes de cerrar.

- [ ] **Step 5: Checklist del DoD del spec §15** — recorrerlo completo; lo que no aplique o quede pendiente (visto bueno de Wilvardo del `PERSON.IDENTITY.006`, decisión del techo por empresa, retención de la bitácora) queda declarado en el commit de cierre, no en silencio. La última línea del DoD del spec (PR aprobado · staging · producción) es proceso de Wilvardo y queda fuera de este plan.

- [ ] **Step 6: Commit final si hubo ajustes**

```bash
git add -A && git commit -m "chore: Cerrar la verificación del sondeo de correos"
```

### Task 11: Manual de QA — prueba manual por API (la recorre el equipo de QA)

**Files:**
- Create: `docs/superpowers/plans/2026-09-25-encarecer-registrar-sondeo-correos-qa-api.md` (SÍ se commitea: en este repo `docs/superpowers/` se versiona)
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (extenderlo; NUNCA se commitea — el nombre lo dice, regla de higiene del repo)

**Nota de alcance:** esta tarea ENTREGA el manual; el recorrido manual lo hace el equipo de QA con el documento enfrente, no es parte de la ejecución automatizada. Va al final porque necesita la implementación y la verificación ya cerradas (Tasks 1-10).

**Interfaces:**
- Consumes: la implementación ya terminada y verificada (Tasks 1-10); los textos del 429 salen del catálogo y de `es.json` de la Task 1 — se copian de ahí, jamás se reescriben de memoria (DRY, regla de `.claude/rules/design-principles.md`).
- Molde: el manual de QA de la hermana A, `docs/superpowers/plans/2026-09-25-correo-personal-sin-delatar-qa-api.md` — misma estructura sección por sección: título con la conducta observable, **Problema / Solución / Ejemplo** (analogía en lenguaje de negocio), sección **Preparar** con el seeder temporal y las credenciales/tabla de actores, escenarios numerados mapeados a los CA con endpoint, headers, cuerpo de petición y "Response exacto", explicación de cada dato del cuerpo, estados no observables DECLARADOS (sin inventarse pasos), y checklist final.
- Reglas del repo que este documento debe cumplir (`.cursor/rules/00-proyecto.mdc` → `.claude/rules/`):
  - **Idioma** (`idioma.md`): todo en español, y sin términos restringidos — `npm run lint:terminology` corre en pre-commit/pre-push/CI.
  - **DRY** (`design-principles.md`): los cuerpos del 429 y del 422 se citan de los recursos reales (catálogo + `es.json`), no redactados de nuevo.
  - **Higiene** (`higiene-repo.md`): el seeder temporal va sin commit; el manual sí se commitea como cualquier archivo de `docs/superpowers/`.

Escenarios del manual (cada uno mapeado al CA que prueba; todos contra `http://127.0.0.1:3333` con el header `X-Business-Unit-Id`):

1. **CA-1/CA-3 — el sondeo en serie se corta:** 20 altas con 20 correos distintos (mitad libres, mitad el correo ocupado sembrado) → proceden con 201/422 estándar; la 21ª responde el 429 exacto `{title, detail, key: 'demasiados-intentos-de-captura-de-correo', code: 'PERSON.IDENTITY.006'}` con `Retry-After`, sin mencionar el correo, ni "registrado", ni qué contador se topó.
2. **CA-2 — el corte no distingue aciertos:** repetir con 21 altas todas con correos libres y válidos → la 21ª responde el MISMO 429.
3. **CA-5 — la operación diaria no se estorba:** 15 altas SIN `personEmail` → todas 201, ningún 429.
4. **CA-6 — editar con el propio correo:** editar el expediente propio reenviando su mismo correo → 200.
5. **CA-4 (parte demostrable) — el límite es por persona:** mientras el capturista de B está cortado, un segundo capturista de la MISMA empresa B sigue dando altas con normalidad, y el capturista de la empresa A también. (El techo por empresa de 200/h queda DECLARADO como no observable en manual: son ≥200 peticiones; está cubierto por las pruebas automatizadas de la Task 3.)
6. **CA-10 — el vacío no es intento:** altas con `personEmail` `""`, ausente y `"   "` → 201 sin 429.
7. **CA-12 — el piso de ruta:** 41 escrituras sin correo en un minuto → la 41ª responde 429; un GET en ese momento responde normal.
8. **CA-9 — la carga masiva deja rastro:** subir por `POST /api/employees/import-excel` un archivo de plantilla con correos libres, ocupados y vacíos → la importación termina con su summary, y la verificación del rastro es por **consulta directa en Mongo** (regla 12 del spec: no hay pantalla): `mongosh` sobre `log_person_email_probe`, filtrando por `actor_user_id` — una fila por correo no vacío, con los 7 campos y SIN el correo legible.
9. **CA-8 — declarado no observable:** el "Mongo caído no cambia la respuesta" no se puede provocar desde un cliente HTTP; se declara cubierto por las pruebas automatizadas, sin inventarse pasos (mismo molde de "estado vacío no observable" del manual de A).

- [ ] **Step 1: Extender el seeder temporal** con lo que falta para esta historia: reutilizar las empresas `qa-correo-a`/`qa-correo-b` y sus capturistas que ya siembra para la hermana A, y añadir un segundo capturista en B (p. ej. `qa-sondeo-capturista-b2@gsti-tests.local`, password `password`) para el escenario de aislamiento. Re-correlo para confirmar que restaura el estado.

Run: `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`
Expected: siembra sin errores y repetible.

- [ ] **Step 2: Ejecutar el escenario 1 real** contra el servidor local y capturar la respuesta exacta del 429 (cuerpo y cabeceras). Cruzarla carácter a carácter contra el catálogo de la Task 1 y el `detail` de `es.json`: si difieren, el manual copia lo que la implementación realmente dice y se reporta la divergencia (el manual es espejo, no fuente).

- [ ] **Step 3: Escribir el manual** con la estructura del molde de A y los 9 escenarios del bloque anterior. Los cuerpos de respuesta se pegan de lo capturado en el Step 2; el escenario de carga masiva incluye la consulta `mongosh` textual con un ejemplo de fila esperada (los 7 campos, `email_hash` de 64 hex, `date` UTC ISO).

- [ ] **Step 4: Verificar el manual**

Run: `npm run lint:terminology`
Expected: PASS (el manual no introduce términos restringidos).

Revisión de espejo: cada "Response exacto" del manual casa con lo que la implementación responde (paso 2) — el manual no promete nada que el sistema no haga.

- [ ] **Step 5: Commit** (SOLO el manual; el seeder temporal queda fuera)

```bash
git add docs/superpowers/plans/2026-09-25-encarecer-registrar-sondeo-correos-qa-api.md
git commit -m "docs: Agregar manual QA del sondeo de correos personales"
```

---

## Notas de auto-revisión

1. **Cobertura del spec:** CA-1..CA-3, CA-5..CA-12 tienen tarea y prueba automatizada (Tasks 1, 2, 3, 5, 8, 9, 10). CA-4 cubierto en su parte demostrable + unitaria, con la desviación 5 declarada para Wilvardo. Reglas 1-12 del spec §4: todas caen en los mismos casos. D6 (índice) = Task 4; D7 (importador) = Task 7; supuesto de topología = comentarios de Tasks 3 y 5. El manual de QA (Task 11, la última) replica para prueba MANUAL los CA que un cliente HTTP puede provocar y DECLARA los no observables (techo de 200/h, Mongo caído), siguiendo el molde del manual de la hermana A y las reglas del repo (idioma, terminología, DRY, seeder temporal sin commit).
2. **Consistencia de tipos:** `PersonEmailProbeLogEntry` (Task 2) es lo que consumen el guard (Task 3), el envoltorio y el importador (Task 7); `targetPersonId` añadido al contexto del guard para que el campo no sea siempre `null` (semántica de B.1). El 429 usa `PERSON.IDENTITY.006` en catálogo, specs, funcional y docs — un solo valor en todo el plan.
3. **Lo que NO debe pasar** (spec §14): ninguna tarea toca `person_service.ts`, `person_identity_api_error.ts`, el detector, `verifyInfo`, la entrada 422 ni el copy de A; el grep negativo de `penalize` es prueba en Task 5 y gate en Task 10; el correo nunca llega a `logger.*` ni a un `throw` (Task 10, Step 1).
