# Resumen de cierre — USRH1789698261609 Marcar la empresa dueña de la persona

## Qué cambia

`people` registra su empresa dueña (`business_unit_id`, nullable, índice, FK **RESTRICT**). `Person` compone `withBusinessUnitScope()` **sin `includeGlobal`** (fail-closed: una fila NULL es invisible para todo inquilino) y un `@beforeCreate` tolerante que toma la empresa activa del contexto y deja NULL sin lanzar cuando no hay contexto. `PersonService.create` propaga la marca; el signup self-service crea la empresa antes que el dueño y lo marca en la misma transacción (sobrevive al bucle de colisión de slug). `/api/persons` y `/api/persons-get-places-of-birth` montan `businessScope()`: hoy cualquier inquilino listaba, leía, editaba y borraba expedientes de los demás.

## Qué NO cambia

Ninguna pantalla, ningún campo de request ni de response (la columna no se serializa), ningún mensaje ni status salvo que `/api/persons*` ahora exige `X-Business-Unit-Id` (400 `BU.VAL.000` si falta; comportamiento ya existente del middleware). `PersonService.syncCreate` **no se toca** (D3, decisión de Wilvardo 2026-09-18): las personas del reloj checador nacen NULL. **El riesgo real no es solo "invisibles para su propio cliente": es un 500 en producción.** `app/modules/employee-badge/badge.repository.mysql.ts:184-186` lee `employee.person.personFirstname` sin guarda de null; con el scope fail-closed activo, `preload('person')` sobre una persona NULL no trae nada, `employee.person` queda `undefined` y esa línea lanza. Es el mismo mecanismo que tumbó 20/40 tests de `employee_badge.spec.ts` en la Tarea 4 (ahí se corrigió el fixture del spec; el código de producción del repositorio de badge nunca se tocó y conserva el hueco). El reloj checador es ruta central (`employee_controller.ts:360` → `employee_service.ts:208` → `syncCreate`) y el primer sync contra la base limpia del 2026-09-28 va a crear personas NULL: **esto necesita la decisión de Wilvardo antes de encender el checador contra la base limpia**, no es solo un dato pendiente de documentar. Dos salidas posibles para la HU de seguimiento, sin elegir aquí cuál: (a) una línea en `syncCreate` que marque la persona con `employee.businessUnitId` — el payload ya lo trae, ver residual de §16.3 del plan — o (b) una guarda de null en el repositorio de badge. Ninguna se implementa en esta rama: `PersonService.syncCreate` y `app/modules/employee-badge/**` quedan fuera de alcance por decisión (D3), no por descuido. **Esta HU no es el cierre completo de la marca de empresa.** Sin backfill: base limpia el 2026-09-28.

## Notas para revisión

- `businessUnitId` lleva `serializeAs: null`: §10 y CA-1 del spec (cero campos nuevos en response) mandan sobre el `@column()` a secas de §9.
- `businessScope()` va **antes** de `sensitiveAccess()`: ambos envuelven la serialización con `runWithSensitiveReadDecisions` y gana el store del primero montado; `businessScope` aplica antes el rol efectivo de la empresa. Precedente: `exception_request_routes.ts`.
- Radio real de `tests/`: además de los 4 archivos de §13, el support `sensitive_read_by_category_support.ts`, dos fixtures locales (`employees_expediente_read_permission_gate`, `employees_persona_domicilio_bancos_permission_gate`) y el teardown de `signup_system_settings` (buscaba la persona por correo cifrado y la FK RESTRICT lo delataba). Mismo cambio de una línea. **Radio adicional, no cubierto por el patrón de exclusión del Step 2 de este task pero ya documentado y revisado en el ledger de Task 4**: `tests/functional/employee_badge.spec.ts` (hallazgo Critical de esa revisión — `createTestActor` armaba `Person` sin `businessUnitId` ni `TenantContext`, 20/40 tests del archivo fallaban bajo el scope fail-closed; corregido en los commits `946fe421..83f74190`).
- Oráculos residuales, heredan a *Acotar por empresa la unicidad de RFC, CURP y NSS*: (a) `verifyInfo` sigue consultando por huella — con el scope ya solo contesta sobre la propia empresa; (b) en `update`/`delete`, `personIsCollaborator` (sin scope) corre antes de buscar la persona: un usuario **sin** `tab-persona-write` recibe 403 para un colaborador ajeno y 404 para un id inexistente.
- Spec de unidad nuevo (`person_business_unit_scope.spec.ts`) aunque §2 no lo pedía: automatiza el `grep includeGlobal = 0` del DoD y el fail-closed. Si se rechaza, se retira sin más cambios.

## Evidencia (DoD)

### Step 1 — Suite, typecheck y lint

- `npx tsc --noEmit` → **sin salida, exit limpio** (backgrounded en `tsc-typecheck.log`, terminó antes que lint).
- `npm run lint` (ESLint) → **67 errores, los 67 en un único archivo**: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (todos `no-console`). Ese archivo está **gitignoreado** (`git check-ignore -v` lo confirma, ver Task 6), nunca se commitea y no forma parte del diff de esta HU. Cero errores en cualquier archivo tocado por esta HU.
- `node ace test` (suite completa, `NODE_ENV=test` + `.env.test` propios del comando):
  ```
  Tests  4591 passed, 276 failed, 19 skipped (4886)
  Time  3m
  ```
  El proceso terminó de imprimir resultados y quedó colgado sin salir (`forceExit: false` + conexión Mongo/Atlas remota abierta, tal como anticipaba este task) — se mató manualmente (`kill -9` sobre el PID del runner) después de capturar el resumen.
  **Ninguno de los 276 fallos cae en un archivo tocado por esta HU.** Se revisaron explícitamente los bloques de: `employee_badge.spec.ts`, `employees_expediente_read_permission_gate.spec.ts`, `employees_persona_domicilio_bancos_permission_gate.spec.ts`, `person_store_subject_type_permission_gate.spec.ts`, `signup_complete.spec.ts`, `signup_system_settings.spec.ts`, `person_business_unit_scope.spec.ts` y `sensitive_access_context_mounts.spec.ts` — todos sus tests salieron ✔ (el único log `FATAL`/`ERROR` cerca de `signup_system_settings.spec.ts` es el propio test de rollback forzando el error a propósito, no un fallo). Los 276 fallos se distribuyen en decenas de specs no relacionados (`employees_zonas_anotaciones_bonos_responsable_activos_permission_gate`, `billing_subscription_service_headcount_unification`, `sync_assists_service_calendar_no_n_plus_one`, etc.) — consistente con el ~275/4886 ya documentado como pre-existente/ambiental en `progress.md` (Task 5). No se investigó cada uno individualmente porque ninguno pertenece al radio de esta HU.

### Step 2 — Nada prohibido cambió

- `git diff --stat feature/USRH1789698261608-blindar-liberacion-persona...HEAD` sobre la lista de archivos prohibidos (`with_business_unit_scope.ts`, `person_controller.ts`, `platform_user_controller.ts`, `employee_service.ts`, `user_service.ts`, `pii_reveal_service.ts`, `validators/person.ts`, `person_is_collaborator.ts`, `database/seeders`, `resources/lang`, `system_modules_menu`, `.env`, `.env.test`) → **sin salida**, como esperaba el brief.
- `git diff ... -- app/services/person_service.ts` → exactamente las líneas esperadas:
  ```diff
  +    // USRH1789698261609: la marca viaja con la persona que arma el llamador
  +    // (signup self-service). Con contexto de tenant y sin marca, la pone el hook
  +    // del modelo; sin contexto y sin marca queda null (persona de plataforma).
  +    newPerson.businessUnitId = person.businessUnitId ?? null
  ```
  Nada de `syncCreate` tocado.
- `grep -n "includeGlobal" app/models/person.ts` → sin salida. `grep -n "throw" app/models/person.ts` → sin salida.
- `grep -n "onDelete" database/migrations/*_add_business_unit_id_to_people_table.ts` → **una línea**, pero es el comentario de cabecera de la migración explicando la decisión (`"FK sin \`onDelete\` => RESTRICT de MySQL, y es una decisión, no un olvido"`), no una llamada real a `.onDelete()`. Se confirmó con `SHOW CREATE TABLE people` (ver abajo) que la FK generada no tiene `ON DELETE` explícito → MySQL aplica `RESTRICT` por default, tal como documenta el comentario.
- `git diff --stat feature/USRH1789698261608-blindar-liberacion-persona...HEAD --stat` filtrado por el patrón de exclusión del brief → 18 archivos totales en el diff; el patrón de exclusión no cubre `tests/functional/employee_badge.spec.ts` (omisión del regex del brief, no un archivo sin explicar: es exactamente el archivo del hallazgo Critical de Task 4, documentado arriba en "Notas para revisión" y en `progress.md`). El resto de los 18 archivos sí están cubiertos por el patrón. Sin radio real no previsto.

### Step 3 — Separación por empresa contra el servidor local (V1-V3, V9)

Sin captura previa de una sesión anterior de "Preparación" (esta es la primera corrida de Task 7; el intento previo se quedó atorado en `npm run lint` sin llegar a este paso). Se usó el fallback documentado por el brief: datos del seeder QA (`qa-duena-a` / `qa-duena-b`, Task 6), levantando el servidor de desarrollo (`node ace serve --hmr`, quedó en `127.0.0.1:64970` porque el puerto 3333 lo tenía ocupado la propia suite de tests corriendo en paralelo) contra la BD de desarrollo ya migrada/sembrada.

Capturista A, header propio (`X-Business-Unit-Id` = público de `qa-duena-a`):
```json
{"total":2,"ids":[205,207]}
```
SQL de control — `SELECT person_id FROM people WHERE business_unit_id = 63 AND person_deleted_at IS NULL ORDER BY person_id`:
```json
[{"person_id":205},{"person_id":207}]
```
**Idénticos.** (205 = `DuenaCapturistaA`, 207 = `PersonaA`.)

Capturista B, header propio (`business_unit_id` = 64):
```json
{"total":2,"ids":[206,208]}
```
SQL de control coincide exactamente (`206,208`).

`SinMarca` (person_id 209, `business_unit_id` NULL) — confirmada NULL en BD y **ausente** de ambos listados anteriores (invisible para las dos empresas, V9/CA-5).

Token de A, header de B (cruce entre empresas) → **`404 {"key":"BU.NOT.001"}`**, no `200` con datos ajenos: el hueco que cerró esta HU + el fix de rol del capturista QA de Task 6 (antes daba `200` con `root`) se confirma cerrado en vivo.

### Step 4 — Landlord sin regresión (V11, CA-3, CA-6)

- REPL sin contexto de tenant (`node ace repl`, `Person.query().count('* as total')`) → `LANDLORD_COUNT=240`.
- SQL directo — `SELECT COUNT(*) FROM people WHERE person_deleted_at IS NULL` → `240`.
  **Los dos números son iguales**: sin contexto, el scope no filtra nada (visibilidad completa para trabajos de plataforma/backend).
- `POST /api/platform/users` con un administrador de plataforma (`qa-dashboard-platform-admin@gsti-tests.local`) y el payload del brief → **`201`**, `data.user.personId = 243`.
- `SELECT business_unit_id FROM people WHERE person_lastname = 'QA' AND person_firstname = 'Landlord'` → **`NULL`**.
- `grep -i "error|exception|fatal" server.log` sobre la ventana de esa petición → sin salida (solo un warning de deprecación de Node ajeno, en el arranque).

### Step 5 — El dueño de la cuenta nueva se ve a sí mismo (V13, CA-4)

Recorrido completo de los tres endpoints de signup contra el servidor local + un plan de facturación real de la BD de desarrollo (`billing_plan_id = 1`, "Valanserh Compliance"):

1. `POST /api/auth/signup/start` → `200`, `signupDraftId: 1`.
2. `POST /api/auth/signup/verify-otp` (pin leído de `signup_drafts.signup_draft_pin_code` en BD) → `200`, `signupToken` emitido.
3. `POST /api/auth/signup/complete` → `200`, `data.user.personId = 244`, `data.businessUnit.businessUnitPublicId = "8aa0aaea-f2d2-4c65-8c2c-2dbe77d7b782"`.
4. `GET /api/persons/244` con el token nuevo y el header de la empresa nueva → **`200`** con el propio expediente (`personFirstname: "Duena"`, `personLastname: "SignupQa"`).
5. SQL — `people.business_unit_id` de la persona 244 = `65`; `business_units.business_unit_id` de la empresa `8aa0aaea-...` = `65`. **Coinciden.**

### Step 6 — Arranque del backoffice sin 400 (R3)

El frontend **sí está disponible en este entorno**, en `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-bo` (remoto `GrupoSTI-Software/gsti-rh-bo`, título de la app "Valanserh", rama `multitenant` ya activa — el nombre `valanserh-bo` del brief es el nombre de producto, no el del repo local). Se levantó `nuxt dev` apuntando al API local (`BASE_API_PATH=http://127.0.0.1:64970/api`) y se hizo login completo, con la pestaña de red monitoreada, en dos sesiones:

- **Usuario de empresa** (`qa-duena-capturista-a@gsti-tests.local`): login → aceptar Términos/Aviso de privacidad (versión 2.0) → dashboard de asistencia → módulo Empleados → asistente "Nuevo empleado". El interceptor `plugins/business-unit-header.client.ts` adjuntó `businessUnitId=6e71c517-...` (el público de A) automáticamente en cada llamada a `/api/employees*` y afines.
- **Usuario de plataforma** (`qa-dashboard-platform-admin@gsti-tests.local`): login → pantalla "No tienes unidades de negocio asignadas" (estado legítimo de la app para este admin QA, no un error 400).
- En ambas sesiones: **cero peticiones a `/api/persons*`** aparecieron en el tráfico observado (las pantallas de arranque y el listado de empleados usan `/api/employees*`, no `/api/persons*` directamente) y **cero respuestas `400 BU.VAL.000`** de ningún endpoint. Se confirmó también del lado del servidor: `grep -c "BU.VAL.000" server.log` → `0` durante toda la ventana de ambas sesiones.
- **Limitación honesta**: no se logró disparar en la UI una llamada real a `/api/persons*` (las pantallas de alta/edición de empleado en esta versión del frontend pasan por `/api/employees*`), así que la comprobación específica "ninguna petición a `/api/persons*` responde 400" es válida para los flujos efectivamente ejercidos (arranque, dashboard, listado de empleados, asistente de alta), pero no es una prueba exhaustiva de cada posible llamada a `/api/persons*` en todo el frontend. No se encontró ninguna señal del punto abierto de §10 (petición disparada antes de que `workBusinessUnitPublicId` resuelva).

### Fix wave — comprobación real de /api/persons* (hallazgo Important #2 de la revisión final de todo el branch)

La revisión final de todo el branch encontró que el Step 6 de arriba nunca ejercitó `/api/persons*`: solo caminó flujos de `/api/employees*`. El repo `valanserh-bo` (frontend, hermano de este API) sí tiene llamadas reales a `/api/persons` fuera de esos flujos — `employeeInfoForm`, `employeePersonInfoForm`, `employeeCreateWizard/infrastructure/create-employee.repository.ts` y `customerInfoForm` — así que la comprobación pendiente era real, no cosmética.

Esta vez sí se disparó una llamada real. Con el API local corriendo (`node ace serve --hmr`, puerto 3333) y `valanserh-bo` (`gsti-rh-bo` local) levantado con `nuxt dev --port 3001` apuntando a ese API, login como `qa-duena-capturista-a@gsti-tests.local`:

- El asistente de alta en pasos ("Nuevo empleado") no se pudo completar contra la unidad de negocio QA: sin departamentos ni puestos precargados para esa empresa en la BD de desarrollo, sus combos quedaban sin opciones. Se dio de alta un departamento y un puesto mínimos para esa unidad desde el propio Organigrama del backoffice (dato de prueba, no producto) y se usó el **"formulario clásico"** del alta de empleado (`Usar el formulario clásico`, el mismo `employeeInfoForm` que cita el hallazgo).
- Al enviar el formulario clásico completo (identificación, puesto/contratación, CURP/RFC/NSS, modalidad), la pestaña de red mostró:
  ```
  OPTIONS http://127.0.0.1:3333/api/persons → 204 No Content
  POST    http://127.0.0.1:3333/api/persons → 201 Created
  ```
  Body de la respuesta: `{"data":{"person":{"personId":245, "personFirstname":"QAFix2", ...}}}`. **Sin `400 BU.VAL.000`.**
- Verificación cruzada contra la BD de desarrollo: `people.business_unit_id` de la persona 245 = `63`; `business_units.business_unit_id` de "QA Duena Empresa A" (la empresa del capturista logueado) = `63`. **Coinciden.** El interceptor `plugins/business-unit-header.client.ts` (global sobre `window.fetch`, sin distinguir por endpoint) adjuntó `X-Business-Unit-Id` también en esta llamada a `/api/persons`, exactamente como ya hacía para `/api/employees*`.
- **Resultado**: el hallazgo queda cerrado con una comprobación real, no solo con la lectura del interceptor. `/api/persons*` no sale nunca "pelón" desde este flujo del backoffice; no se reprodujo ningún `400 BU.VAL.000`.
- **Alcance de la comprobación**: se ejercitó el flujo de alta de empleado (`employeeInfoForm` vía formulario clásico), que cubre el mecanismo genérico (interceptor global) compartido por los otros tres callers citados en el hallazgo. No se ejercitaron en vivo `employeePersonInfoForm` (edición de persona de un empleado existente) ni `customerInfoForm`: el primero por presupuesto de tiempo tras resolver el bloqueo de catálogos vacíos, y el segundo porque este API **no expone rutas `/api/customers`** en este entorno (`GET /api/customers` responde `404 Not Found`, confirmado en `start/routes/`; el módulo de clientes no existe en este backend, así que ese caller de `customerInfoForm` es inalcanzable aquí, no un caso pendiente de probar). Dato de prueba generado en la BD de desarrollo local (`sae_principal_db`) como parte de esta comprobación: departamento "QA Fix Depto", puesto "QA Fix Puesto", persona/empleado "QAFix2 Hallazgo Dos" (`person_id=245`) bajo la unidad de negocio QA Dueña Empresa A. No se limpió: mismo criterio que el resto de datos QA de la Tarea 6, a discreción de quien administre esa BD.

### Step 7 — Constancia numérica del residual D3 (V15, CA-11)

**No medible en este entorno.** `API_BIOMETRICS_HOST` apunta a `http://127.0.0.1:3334/api/v1` y no hay ningún proceso escuchando en el puerto 3334 (`lsof -i :3334` → vacío); no existe un reloj checador de prueba ni un mock local disponible en esta sesión. Queda documentada la consulta para quien sí tenga el dispositivo:

```sql
SELECT COUNT(*) AS personas_sin_marca_del_sync
FROM people
WHERE business_unit_id IS NULL AND person_created_at > '<inicio de la prueba>';
```

El camino que sigue generando personas NULL por diseño (D3, decisión de Wilvardo 2026-09-18, no tocado por esta HU): `employee_controller.ts:360` → `employee_service.ts:208` → `PersonService.syncCreate`.

**Escalación pendiente a Wilvardo (fix wave sobre la revisión final).** El párrafo de arriba y el de "Qué NO cambia" documentan la mecánica exacta: bajo el scope fail-closed de esta HU, una persona NULL creada por `syncCreate` hace que `app/modules/employee-badge/badge.repository.mysql.ts:184-186` lance al leer `employee.person.personFirstname` (`employee.person` queda `undefined` porque el `preload('person')` no trae nada para una fila NULL). Esto es un riesgo de **`500` en producción** en el reloj checador, no solo de visibilidad reducida, y el primer sync contra la base limpia del 2026-09-28 lo dispara. **Antes de encender el reloj checador contra la base limpia, alguien con la autoridad de D3 (Wilvardo) tiene que decidir el arreglo** entre (a) que `syncCreate` marque la persona con `employee.businessUnitId` (ya viene en el payload del sync, ver `app/interfaces/biometric_employee_interface.ts:18` y el uso existente en `app/services/employee_service.ts:225`) o (b) una guarda de null en el repositorio de badge — y agendarlo como HU de seguimiento. Esta rama no implementa ninguna de las dos opciones: `PersonService.syncCreate` y `app/modules/employee-badge/**` son código fuera de alcance por decisión explícita (D3), y este fix wave es solo documentación.

### Otras verificaciones de DoD

- `grep -n "includeGlobal" app/models/person.ts` → sin salida (ver Step 2).
- `SHOW CREATE TABLE people` (BD de desarrollo, tras la migración de esta HU):
  ```sql
  `business_unit_id` int unsigned DEFAULT NULL,
  ...
  KEY `people_business_unit_id_index` (`business_unit_id`),
  CONSTRAINT `people_business_unit_id_foreign` FOREIGN KEY (`business_unit_id`) REFERENCES `business_units` (`business_unit_id`)
  ```
  Nullable, indexada, FK sin `ON DELETE` explícito (`RESTRICT` por default de MySQL) — exactamente lo que diseñó la migración.
- `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` (corrida propia de este task, sobre la BD desechable) → **679 migraciones en verde** (mismo total que reportó Task 1), todos los seeders `completed` salvo un `error` no fatal y esperado de `0008_user_seeder` ("Faltan ROOT_USER_EMAIL y/o ROOT_USER_PASSWORD en el .env" — guarda pre-existente de ese seeder, ajena a esta HU, por no tener esas variables configuradas en este `.env.test` local; el resto de la cadena de seeders continuó y terminó limpio, incluido el seeder QA de esta HU). El ciclo rollback/reaplicación del `down()` de la migración de esta HU ya se verificó en Task 1 (`migration:run` → `migration:rollback` → `migration:run`, sin errores de `Cannot drop index`/`Cannot drop foreign key`) y no se repitió aquí por ser destructivo repetirlo sin necesidad sobre la misma BD desechable que ya se usó para el `fresh --seed` de este task.
- Captura previa vs posterior de `GET /api/persons` para A: no hay "previa" de una sesión anterior (task nuevo, sin estado heredado); se usó el fallback de datos del seeder QA — ver Step 3, con el JSON pegado arriba y su verificación cruzada contra SQL.
- Conteo landlord (REPL sin contexto) = `SELECT COUNT(*) FROM people WHERE person_deleted_at IS NULL` = **240 = 240**.
- Residual D3: **no medible en este entorno** (sin reloj checador de prueba).

## Pruebas

Manual de QA de API hermano: `docs/superpowers/plans/2026-09-21-marcar-empresa-duena-persona-qa-api.md` (7 escenarios, ver Task 6). Suite completa corrida en este task: 4591 passed / 276 failed / 19 skipped (4886) — los 276 fallos son pre-existentes/ambientales, ninguno en el radio de esta HU (ver Step 1 arriba).

## Pendiente fuera de este repo

- **Asana**: no accesible desde este entorno (conector MCP sin autorizar). La dependencia dura hacia *Acotar por empresa la unicidad de RFC, CURP y NSS* (oráculos residuales de `verifyInfo` y del orden de comprobaciones en `update`/`delete`, documentados arriba) queda pendiente de formalizar ahí por quien tenga acceso.
- **Spec fuente del plan** (si vive fuera de este repo, p. ej. en Drive): no se localizó un documento de spec externo accesible desde este entorno para anotar directamente §9/§10/§12/§13. Las anotaciones correspondientes (`serializeAs: null`, orden de la cadena de middlewares, radio real de tests, oráculo del orden de comprobaciones en `update`/`delete`) quedan documentadas en la sección "Notas para revisión" de este mismo archivo y en `docs/superpowers/plans/2026-09-21-marcar-empresa-duena-persona.md`, disponible para quien mantenga el spec original.
