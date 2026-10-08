# Revelar IP y agente de usuario de una aceptación con registro en bitácora (USRH1790654705065) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/platform/tenants/:businessUnitPublicId/legal-acceptances/:userConsentId/reveal` — devuelve la IP y el agente de usuario **en claro** de **una** aceptación del tenant del path, registrando **antes** cada columna en `pii_access_logs` dentro de una transacción (fail-closed) — y en el landlord el botón "Revelar IP y agente de usuario" en la fila expandida del expediente, con el valor revelado **solo en memoria de la página**.

**Architecture:** API (repo `gsti-rh-api`, en código `valanserh-api`): un filtro **aditivo** (`EvidenceFilters.userConsentId`) en el repositorio de evidencia; `PlatformConsentService#revealEvidence` que reutiliza `EvidenceService#getEvidence` (misma liga a empresa, tipos y exclusión de cuentas de plataforma que el historial) y `PiiAccessLogService#record(input, trx)`, con el orden no negociable empresa → aserciones `> 0` → lookup **enmascarado** → transacción `record`×N → lectura **en claro** → return; validador de params, `reveal` en el controller (con `no-store` en toda respuesta) y la ruta dentro del único grupo `auth` + `platformAdmin`. Landlord (repo `valanserh-landlord`): `interface` + `POST` en el repositorio del slice + composable `use-reveal-acceptance-evidence` (estado por fila) y el bloque `tenant-legal-acceptances__evidence` de la fila expandida.

**Tech Stack:** Adonis 6 + VineJS + japa (API, BD de pruebas `sae_pruebas`); Nuxt 4 SPA (`ssr: false`) + Vue 3 + PrimeVue + Vitest (landlord, locale `es`).

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1790654705065.md` — el plan argumenta desde él; el ejecutor lee **ambos**. Cuerpos de error, textos i18n y contrato de §10 se copian **verbatim** del spec, no se improvisan.

**Validación de anclas (2026-10-06):** hecha contra ambos repos, cada uno en su rama `feature/USRH1790654705065-revelar-evidencia-aceptacion` (ya creada y apuntando a la base `feature/USRH1790610965466-historial-aceptaciones-tenant`, cuyo código ya está dentro: la consola, el expediente y la bitácora existen y corren). Todo lo de §9/§7/§12 coincide: `PiiAccessLogService#record(input, trx?)` (`app/services/pii_access_log_service.ts:75`), `EvidenceService#getEvidence(filters, pagination, revealAllowed)` (`evidence.service.ts:50-60`), `maskSensitiveValue` (conserva `null` y `''`, `app/helpers/sensitive_mask.ts:31-35`), `findBusinessUnitByPublicId`/`findOwnerUserIds`/`assertPositiveBusinessUnitId` (privada del servicio), `PLATFORM_ACCEPTANCE_DOCUMENT_TYPES`, `PlatformConsentError`, `PLATFORM_CONSENT_ERROR_CODES_BY_KEY`, el patrón de accesor `evidence.controller.ts:434-448`, el bloque i18n `platformLegalAcceptances.errors` en es/en, `PlatformConsentRepositoryMysql` (columna `business_unit_id`), el modelo `PiiAccessLog` (columna `accessorUserId` → `user_id`), el helper `countRevealLogs`/`cleanupRevealLogs` (`tests/functional/pii/pii_permission_gate_support.ts`), el `.p-datatable-row-toggle-button` del `#expansion`, `overflow-wrap: anywhere` ya presente en `tenant-legal-acceptances__evidence-value`, y `useApi()` (toast solo en red/5xx). **Tres drift triviales detectados y resueltos aquí** (no cambian alcance, contrato §10 ni regla §4):
1. **Validador de params:** el snippet de §10 dice `vine.number().positive()`; el propio archivo hermano documenta que en VineJS `positive()` **admite el 0** (`platform_tenant_legal_acceptances.validator.ts:20-23`), y CA-8 exige `422` con `userConsentId = 0`. Se usa **`vine.number().min(1).withoutDecimals()`** (mismo criterio que el validador hermano). Con `positive()` CA-8 fallaría.
2. **Forma de la ruta:** §7 muestra `[PlatformConsentController, 'reveal']`; el archivo solo importa `router` y `middleware` y usa referencias lazy por cadena. Se usa **`'#modules/consent/platform/platform_consent.controller.reveal'`**, consistente con las dos rutas vecinas; CA-14 tolera ambas.
3. **Conflicto con la suite existente:** `tests/unit/routes/platform_legal_acceptance_routes.spec.ts:56` afirma hoy `assert.notMatch(content, /router\.post\(/)`. Publicar el `POST` la pone roja; CA-14 manda justamente exigir la ruta nueva dentro del grupo. La Task 3 relaja esa sola línea y agrega la prueba de la ruta.

**Dónde va la documentación:** plan y manual de QA en `gsti-rh-api/docs/superpowers/plans/` (ese directorio **sí** se versiona; el del landlord está en `.gitignore` y no se fuerza con `git add -f`).

## Global Constraints

- **Orden del servicio, no negociable (§14):** empresa → aserciones `> 0` → lookup enmascarado (`revealAllowed = false`) → (si no hay columnas con valor: `return`) → transacción `record`×N → lectura en claro (`revealAllowed = true`) → return. **Nada de IP/UA en claro antes de la lectura.**
- **Contrato §10 exacto:** `200` con `{ type: 'success', data: { userConsentId, ip, userAgent } }` (solo esas tres llaves); `ip`/`userAgent` son `string | null`; **`Cache-Control: no-store` en toda respuesta** (200, 401, 403, 404, 422 y 500). `POST` sin cuerpo; query ignorada.
- **Errores, con `code` salvo el guard:**

  | HTTP | `title` | `key` | `code` |
  |---|---|---|---|
  | 403 | Acceso restringido a plataforma | `AUTH.PLATFORM.FORBIDDEN` | **sin `code`** (contrato del guard, no se toca) |
  | 404 | Empresa no encontrada | `empresa-no-encontrada` | `CONSENT.PLATFORM.010` |
  | 404 | Aceptación no encontrada | `aceptacion-no-encontrada` | `CONSENT.PLATFORM.012` |
  | 422 | Parámetros de historial inválidos | `parametros-de-historial-invalidos` | `CONSENT.PLATFORM.011` |
  | 500 | No fue posible revelar la evidencia | `no-fue-posible-revelar-la-evidencia` | `CONSENT.PLATFORM.013` |

  El **404 de aceptación es idéntico byte a byte** para otro tenant, biométrico, inexistente y cuenta de plataforma (`is_platform_admin` o rol efectivo `root`), **sin escribir bitácora** (sin oráculo).
- **i18n (verbatim, en `resources/langs/es.json` y `en.json`, bloque `platformLegalAcceptances.errors`):**
  - `aceptacion-no-encontrada` — ES: "Aceptación no encontrada" / "No existe una aceptación de términos o aviso con ese identificador en esta empresa." ; EN: "Acceptance not found" / "There is no terms or privacy notice acceptance with that identifier in this company."
  - `no-fue-posible-revelar-la-evidencia` — ES: "No fue posible revelar la evidencia" / "No se pudo registrar la consulta en la bitácora; los datos no se mostraron. Intenta de nuevo." ; EN: "Could not reveal the evidence" / "The access could not be logged, so the data was not shown. Try again."
- **Bitácora:** un registro por columna **con valor** (ni `null` ni `''`); `businessUnitId` **siempre** el del tenant resuelto por el path (nunca `0`, nunca `?? 0`, nunca el de la fila); `originModule = 'platform-legal-acceptances'`; `requestId: null`; sin deduplicar.
- **Landlord — textos (verbatim, `tenant-legal-acceptances.es.json`):** `tla_btn_reveal` "Revelar IP y agente de usuario" · `tla_btn_reveal_aria` "Revelar IP y agente de usuario de la aceptación de {userName}" · `tla_reveal_notice` "Esta consulta queda registrada en la bitácora de acceso a datos personales." · `tla_revealed_hint` "Visible hasta que salgas de esta página." · `tla_reveal_error` "No fue posible revelar la IP y el agente de usuario."
- **El valor revelado solo vive en memoria de la página** — no `localStorage`, no `sessionStorage`, no Pinia, no `console`, no toasts; se limpia al paginar y al salir. Interpolación `{{ }}`, **nunca `v-html`**.
- **Nada de IP ni UA en los logs** del servidor ni del cliente (el `console.error` del landlord solo puede llevar el status HTTP).
- **No tocar (censo del spec):** `app/services/pii_access_log_service.ts`, `app/modules/consent/evidence/evidence.service.ts`, `app/modules/consent/evidence/evidence.controller.ts`, `app/modules/consent/platform/platform_consent.repository.mysql.ts`, `app/modules/consent/physical/physical_consent.service.ts`, `app/modules/consent/platform/platform_consent.constants.ts`, `docs/openapi.yaml`, `system_modules.constant.ts`, migraciones, seeders versionados, `tests/functional/platform_legal_acceptance_history.spec.ts`, `tests/functional/pii/pii_permission_gate_support.ts` (se importa, no se edita), el `GET` del historial y su DTO, `app/pages/legal-acceptances/[publicId]/index.spec.ts`, la pantalla `consent-evidence` del BO. Ninguno puede aparecer en el diff.
- **Idioma:** TS estricto, cero `any`; comentarios y JSDoc en español; identificadores en inglés.
- **Commits:** Conventional Commits. En el API, `feat:`/`docs:` con descripción en español, sin scope. En el landlord, `feat(legal-acceptances): …` + trailer `Refs: USRH1790654705065`.
- **BD de pruebas:** los funcionales del API exigen `sae_pruebas` al día. Si algo truena raro: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`. Se corre siempre con `NODE_ENV=test`.
- **Líneas base medidas el 2026-10-06** (con `sae_pruebas` arriba):
  - API unit: `tests/unit/routes/platform_legal_acceptance_routes.spec.ts` → **6 passed**; `tests/unit/modules/consent/evidence.service.spec.ts` → **5**; `tests/unit/modules/consent/physical_consent.service.spec.ts` → **24**; `tests/unit/helpers/consent_evidence_rbac.spec.ts` → **3**.
  - API functional: `platform_legal_acceptance_history` → **18 passed**; `platform_legal_acceptances` → **16**; `consent_acceptance` → **10**; `physical_consent` → **6**.
  - Landlord: `pnpm test` → **241 archivos / 1992 pruebas en verde**; `pnpm typecheck`, `pnpm lint`, `pnpm lint:styles`, `pnpm check:conventions` → **0**.
  - Nota: `node ace test --files=` filtra por **ruta relativa con el nombre del archivo** (`--files="tests/unit/modules/consent/evidence.service.spec.ts"`); `--files="modules/consent"` da `NO TESTS EXECUTED`.
- El plan termina en la verificación automatizada y en la **entrega** del manual de QA, que recorre una persona.

## Review Focus

Las cinco clases de entrada o modos de fallo que el spec implica y ningún criterio de aceptación ejercita directamente. Cada línea tiene su prueba en la tarea que posee el código.

1. **`userConsentId ≤ 0` llegando al servicio** (no por HTTP: ahí lo corta el validador) — el `.if(valor)` del repositorio **no filtra con `0`** (`evidence.repository.mysql.ts:78-94`), así que el lookup quedaría global. El servicio debe cortar antes de tocar evidencia. → Prueba directa del servicio en **Task 2** (con un `EvidenceService` doble que cuenta llamadas).
2. **Aceptación de una persona con la membresía retirada** (`business_unit_user_deleted_at`) — mismo hueco heredado que el historial: el 404 `aceptacion-no-encontrada`, **sin bitácora**, nunca un 200 que revelaría evidencia fuera de la liga del expediente. → Prueba HTTP en **Task 3**.
3. **Columna con cadena vacía (`''`)** — `maskSensitiveValue` **conserva** la cadena vacía, así que el valor enmascarado basta para decidir; regla §4.6: ni se registra ni se revela como dato. CA-3 solo cubre `NULL`. → Prueba directa del servicio en **Task 2**.
4. **Carrera entre el registro y la lectura en claro** (la fila desaparece después de los `record`) — §10 paso 5: `clear` vacío ⇒ `aceptacion-no-encontrada` **dentro** del callback (rollback), sin filas a medias. → Prueba directa del servicio en **Task 2** (doble de `EvidenceService`).
5. **Persona que pertenece a A y a B, revelada por el path de A** — el registro va a nombre de **A**; nunca `0`, nunca el `businessUnitId` de la fila ni el de otra empresa (§14). → Prueba directa del servicio en **Task 2**.

---

# Repo 1: `gsti-rh-api`

Rama de trabajo: `feature/USRH1790654705065-revelar-evidencia-aceptacion` (ya existe). Rutas relativas a `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-api`.

### Task 1: Filtro aditivo `userConsentId` del repositorio de evidencia

**Files:**
- Modify: `app/modules/consent/evidence/evidence.repository.ts`
- Modify: `app/modules/consent/evidence/evidence.repository.mysql.ts`
- Create: `tests/functional/platform_legal_acceptance_reveal.spec.ts` (solo el primer grupo y las constantes/ayudas; los grupos de Tasks 2 y 3 se agregan al mismo archivo)

**Interfaces:**
- Consumes: `baseQuery` existente con sus `.if` actuales, sin cambios.
- Produces (Task 2 lo consume):
  - `EvidenceFilters.userConsentId?: number` — acota a **una sola** aceptación por su PK `user_consents.user_consent_id`, combinable con `businessUnitId`.
  - Sin el filtro, el SQL de `baseQuery` es **idéntico** al de hoy.

- [ ] **Step 1: Escribir el test que falla — primer grupo del spec funcional**

Crea `tests/functional/platform_legal_acceptance_reveal.spec.ts` con un docblock de cabecera (mismo tono del de `tests/functional/platform_legal_acceptance_history.spec.ts`, referido a USRH1790654705065 y a bitácora de PII) y **un primer grupo**, sin HTTP:

- Importes mínimos: `test` de `@japa/runner`, `db` de `@adonisjs/lucid/services/db`, `EvidenceRepositoryMysql` de `#modules/consent/evidence/evidence.repository.mysql`, `PLATFORM_ACCEPTANCE_DOCUMENT_TYPES` de `#modules/consent/platform/platform_consent.constants`, `TENANT_UNSCOPED_REASON` de `#constants/tenant_unscoped_reason`, `TenantContext` de `#utils/tenant_context`.
- `test.group('Repositorio de evidencia — filtro userConsentId (fail-closed)', () => { … })` con dos pruebas. Cada prueba abre con su bloque de comentario **`Objetivo:`** (molde de la suite del historial) y envuelve la llamada directa al adaptador en `TenantContext.runUnscoped(() => …, TENANT_UNSCOPED_REASON.PLATFORM_ADMIN)` — **fuera de una petición HTTP el mixin de alcance de empresa lanzaría sin ese contexto**:
  1. `'filtra por userConsentId: un id inexistente devuelve cero filas'` — `findEvidence({ types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES], userConsentId: 2147483000 }, { page: 1, perPage: 20 })` → `assert.lengthOf(result.rows, 0)` y `assert.equal(result.meta.total, 0)`.
  2. `'userConsentId 0 no filtra (por eso el servicio exige > 0)'` — dos consultas sobre la BD sembrada: `findEvidence({ types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES] }, { page: 1, perPage: 100 })` y la misma con `userConsentId: 0`; `assert.equal(conCero.meta.total, sinFiltro.meta.total)`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_reveal"`
Expected: FAIL — no compila: `userConsentId` no existe en `EvidenceFilters`.

- [ ] **Step 3: Implementar el filtro**

En `evidence.repository.ts`, agrega a `EvidenceFilters` con JSDoc en español (una sola aceptación; combinable con `businessUnitId`):

```ts
/** Acota a una sola aceptación por su PK (`user_consents.user_consent_id`); combinable con `businessUnitId`. */
userConsentId?: number
```

En `evidence.repository.mysql.ts`, **después** del `.if(filters.userId, …)` existente y **antes** de `.if(filters.channel, …)` (los `.if` existentes no cambian):

```ts
.if(filters.userConsentId, (query) => {
  query.where('user_consent_id', filters.userConsentId as number)
})
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_reveal"`
Expected: PASS (2 pruebas).

- [ ] **Step 5: Commit**

```bash
git add app/modules/consent/evidence/evidence.repository.ts app/modules/consent/evidence/evidence.repository.mysql.ts tests/functional/platform_legal_acceptance_reveal.spec.ts
git commit -m "feat: agregar el filtro aditivo userConsentId a la consulta de evidencia"
```

---

### Task 2: `PlatformConsentService#revealEvidence` — anti-IDOR, bitácora transaccional y fail-closed

**Files:**
- Modify: `app/modules/consent/platform/platform_consent.service.ts`
- Modify: `app/modules/consent/platform/dto/platform_legal_acceptance.dto.ts`
- Modify: `app/exceptions/platform_consent_error.ts`
- Modify: `app/constants/platform_consent_error_codes.ts`
- Modify: `tests/functional/platform_legal_acceptance_reveal.spec.ts` (ayudas de fixtures + segundo grupo)

**Interfaces:**
- Consumes: `EvidenceFilters.userConsentId` (Task 1); `EvidenceService#getEvidence(filters, pagination, revealAllowed)`; `PiiAccessLogService#record(input, trx?)`; `PiiAccessInputInterface`; `PlatformConsentRepositoryMysql#findBusinessUnitByPublicId`; `assertPositiveBusinessUnitId` (privada del propio servicio); `PLATFORM_ACCEPTANCE_DOCUMENT_TYPES`; `findBusinessUnitByPublicId` de USRH1790610965466.
- Produces (Task 3 lo consume):
  - `PlatformRevealedEvidenceDto = { userConsentId: number; ip: string | null; userAgent: string | null }`.
  - `PlatformRevealAccessor = { accessorUserId: number; accessorIp: string; accessorUserAgent: string | null }`.
  - `PlatformConsentService` constructor: `(tenantService = new PlatformTenantService(), repository = new PlatformConsentRepositoryMysql(), evidenceService = new EvidenceService(), piiAccessLogService = new PiiAccessLogService())` — los cuatro por defecto.
  - `revealEvidence(publicId: string, userConsentId: number, accessor: PlatformRevealAccessor): Promise<PlatformRevealedEvidenceDto>`.
  - Keys nuevas de `PlatformConsentErrorKey`: `'aceptacion-no-encontrada'` y `'no-fue-posible-revelar-la-evidencia'`.
  - Const de módulo del servicio: `const PLATFORM_LEGAL_ACCEPTANCES_ORIGIN_MODULE = 'platform-legal-acceptances'`.
  - `PLATFORM_CONSENT_ERROR_CODES.ACCEPTANCE_NOT_FOUND = 'CONSENT.PLATFORM.012'` y `.REVEAL_FAILED = 'CONSENT.PLATFORM.013'`.

- [ ] **Step 1: Escribir el test que falla — grupo del servicio**

En `tests/functional/platform_legal_acceptance_reveal.spec.ts`, agrega **antes** de los grupos: las constantes de contrato del test (403 del guard, 401 de `auth`, 404 de empresa, 404 de aceptación y 422, copiadas de la suite del historial), la interfaz `World` (`stamp`, `businessUnitIds`, `userIds`, `personIds`, `roleIds`, `legalDocumentIds`, `previousCurrentIds`), el actor de plataforma (`createPlatformAdmin` + `platformToken` con `POST /api/platform/auth/login`) y las ayudas de fixtures `createTenant`, `createAccount`, `addMembership`, `createTenantOwner`, `createTenantRole`, `findRootRole`, `markDeleted`, `publishDocument` (Términos y Aviso), `acceptDocument(user, document, acceptedAt, ip, userAgent)`.

Decisión de diseño: estas ayudas se **copian** de `tests/functional/platform_legal_acceptance_history.spec.ts` (son locales de módulo y esa suite está fuera del censo: no se refactoriza ni se edita). Agrega además, en el mismo archivo, `import { countRevealLogs, cleanupRevealLogs } from './pii/pii_permission_gate_support.js'` (**import, no edición**) y una ayuda local `logRow(recordId, column)` que devuelve de `pii_access_logs` la fila más reciente para `model = 'UserConsent'`, `model_column = column`, `record_id = recordId`, proyectando `business_unit_id`, `user_id`, `pii_access_log_origin_module`, `pii_access_log_accessor_ip` y `pii_access_log_accessor_user_agent`.

El teardown `group.each.teardown` borra **primero** la bitácora de la suite (`await cleanupRevealLogs({ businessUnitId })` por empresa del mundo y `await cleanupRevealLogs({ userId })` por cuenta) y **después** usuarios, empresas y documentos: `pii_access_logs` tiene FK a `users.user_id` y `business_units.business_unit_id`. El catálogo global de documentos vigentes se restaura en `finally`, igual que en la suite del historial.

Grupo `test.group('PlatformConsentService#revealEvidence — bitácora transaccional (fail-closed)')`. Cada prueba abre con su `Objetivo:` y llama al servicio **bajo** `TenantContext.runUnscoped(() => …, TENANT_UNSCOPED_REASON.PLATFORM_ADMIN)` con un accesor fijo `{ accessorUserId: adminUser.userId, accessorIp: '203.0.113.9', accessorUserAgent: 'QA-Agent/1.0' }`:

- `'CA-7: empresa inexistente o borrada responde empresa-no-encontrada sin tocar la evidencia'` — un `EvidenceService` doble (objeto real con `getEvidence` espiado por contador de llamadas) inyectado como tercer parámetro; se llama `revealEvidence` con (a) un `randomUUID()` y (b) el `publicId` de una empresa marcada con `business_unit_deleted_at`; cada llamada `rejects` con un `PlatformConsentError` cuya `key` es `'empresa-no-encontrada'`, y el contador del doble queda en **0**.
- `'Review Focus 1: userConsentId <= 0 corta antes de consultar la evidencia'` — con el doble-contador: `revealEvidence(publicIdDeA, 0, accessor)` `rejects` (error interno, `key` distinta de `'aceptacion-no-encontrada'`), contador del doble en **0** y `countRevealLogs('UserConsent', 'userConsentIp', 0)` en 0.
- `'CA-1/CA-2: revela y registra una fila por columna, sin deduplicar'` — aceptación digital de una dueña de A con IP `'189.203.10.4'` y UA `'Mozilla/5.0 (X11)'`. Primera llamada → `deepEqual` con `{ userConsentId, ip: '189.203.10.4', userAgent: 'Mozilla/5.0 (X11)' }`; `countRevealLogs('UserConsent', 'userConsentIp', id) === 1` y `… 'userConsentUserAgent' … === 1`; `logRow` trae `businessUnitId` = id de A (`> 0`), `user_id` = `adminUser.userId`, `originModule = 'platform-legal-acceptances'`, `accessorIp = '203.0.113.9'`, `accessorUserAgent = 'QA-Agent/1.0'`. Segunda llamada → 200 y los dos conteos suben a **2**.
- `'CA-3: columna nula no se registra; ambas nulas devuelven 200 sin bitácora'` — (a) IP con valor y `user_consent_user_agent = NULL` → `userAgent: null`, exactamente 1 fila (`userConsentIp`), `countRevealLogs(… 'userConsentUserAgent' …) === 0`; (b) ambas `NULL` → `{ userConsentId, ip: null, userAgent: null }` y 0 filas nuevas en total.
- `'Review Focus 3: cadena vacía se trata como sin dato (ni se registra ni se revela como dato)'` — aceptación con `user_consent_ip = ''` y `user_consent_user_agent = ''` → 200 con `ip: ''` y `userAgent: ''` (el enmascarado conserva la cadena vacía) y **0** filas de bitácora para esa aceptación.
- `'Review Focus 5: el registro va a nombre de la empresa del path, no del de la fila'` — persona dueña de A **y** miembro de B, con una aceptación; se revela por A → `businessUnitId` de la fila de bitácora = id de **A** (nunca `0` ni el de B).
- `'CA-9: si la bitácora falla a la mitad, no hay dato ni registros parciales'` — `PlatformConsentService` construido con un `PiiAccessLogService` doble que delega en el real la **primera** llamada a `record` y **lanza** en la segunda: `revealEvidence(publicIdDeA, userConsentId, accessor)` `rejects` con `key` `'no-fue-posible-revelar-la-evidencia'`, no devuelve valor y `countRevealLogs` queda en **0** para las dos columnas (la primera se revirtió).
- `'Review Focus 4: si la lectura en claro vuelve vacía, se revierte con aceptacion-no-encontrada'` — `EvidenceService` doble cuya `getEvidence` devuelve la fila enmascarada la **primera** vez y `{ data: [], meta: … }` la segunda → `revealEvidence` `rejects` con `key` `'aceptacion-no-encontrada'` y 0 filas de bitácora.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_reveal"`
Expected: FAIL — no compila: `revealEvidence`, los DTO y las keys no existen.

- [ ] **Step 3: Implementar DTO, keys, códigos y el servicio**

En `dto/platform_legal_acceptance.dto.ts` agrega los dos tipos del bloque **Interfaces**.

En `app/exceptions/platform_consent_error.ts`, extiende la unión `PlatformConsentErrorKey` con `| 'aceptacion-no-encontrada' | 'no-fue-posible-revelar-la-evidencia'` (sin tocar el resto de la clase).

En `app/constants/platform_consent_error_codes.ts`, agrega a `PLATFORM_CONSENT_ERROR_CODES`:

```ts
/** Aceptación de otra empresa, biométrica, inexistente o de cuenta de plataforma (404). */
ACCEPTANCE_NOT_FOUND: 'CONSENT.PLATFORM.012',
/** Falla el registro en bitácora o la lectura en claro en la misma transacción (500). */
REVEAL_FAILED: 'CONSENT.PLATFORM.013',
```

y las dos entradas correspondientes en `PLATFORM_CONSENT_ERROR_CODES_BY_KEY` — agregar la key al error sin su código aquí **no compila** (el `Record` es sobre la unión de keys).

En `platform_consent.service.ts`: agrega `import db from '@adonisjs/lucid/services/db'`, `import PiiAccessLogService from '#services/pii_access_log_service'`, `import type { PiiAccessInputInterface } from '#interfaces/pii_access_input_interface'` y los tipos nuevos del DTO; declara la const de módulo `PLATFORM_LEGAL_ACCEPTANCES_ORIGIN_MODULE = 'platform-legal-acceptances'`; agrega el cuarto parámetro del constructor; y escribe `revealEvidence` **en este orden exacto**, con JSDoc en español:

1. `const tenant = await this.repository.findBusinessUnitByPublicId(publicId)`; `null` ⇒ `throw new PlatformConsentError('empresa-no-encontrada')`.
2. `this.assertPositiveBusinessUnitId(tenant.businessUnitId)`; si `!Number.isSafeInteger(userConsentId) || userConsentId <= 0` ⇒ `throw new Error('Identificador de aceptación inválido')` (error interno: nunca llega por HTTP, el validador lo corta antes).
3. `const filters = { businessUnitId: tenant.businessUnitId, userConsentId, types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES], excludePlatformAccounts: true }`; `const masked = await this.evidenceService.getEvidence(filters, { page: 1, perPage: 1 }, false)`; `const row = masked.data[0]`; si `row?.userConsentId !== userConsentId` ⇒ `throw new PlatformConsentError('aceptacion-no-encontrada')`. **Nada se escribe.**
4. `const columns`: `'userConsentIp'` si `row.ip !== null && row.ip !== ''`; `'userConsentUserAgent'` si `row.userAgent !== null && row.userAgent !== ''`. Si queda vacío ⇒ `return { userConsentId, ip: row.ip, userAgent: row.userAgent }` **sin bitácora**.
5. `const result = await db.transaction(async (trx) => { … })`: por cada columna, `await this.piiAccessLogService.record(input, trx)` con `{ businessUnitId: tenant.businessUnitId, accessorUserId: accessor.accessorUserId, model: 'UserConsent', modelColumn: column, recordId: userConsentId, accessorIp: accessor.accessorIp, accessorUserAgent: accessor.accessorUserAgent, requestId: null, subjectEmployeeId: row.employeeId, originModule: PLATFORM_LEGAL_ACCEPTANCES_ORIGIN_MODULE }`; **después** de los `record`, `const clear = await this.evidenceService.getEvidence(filters, { page: 1, perPage: 1 }, true)`, `const clearRow = clear.data[0]`; si `clearRow?.userConsentId !== userConsentId` ⇒ `throw new PlatformConsentError('aceptacion-no-encontrada')` **dentro** del callback (rollback); `return { userConsentId, ip: clearRow.ip, userAgent: clearRow.userAgent }`.
6. Envuelve el paso 5 en `try/catch`: si el error es un `PlatformConsentError` con `key = 'aceptacion-no-encontrada'`, se relanza tal cual; cualquier otro ⇒ `throw new PlatformConsentError('no-fue-posible-revelar-la-evidencia', …, { cause: error })` (pásalo con `cause` al `Error` base vía el constructor o `Object.assign`), logueando **solo** `{ businessUnitId: tenant.businessUnitId, userConsentId, errorName }` — **nunca** IP ni UA.
7. `return result` (el valor sale de la transacción solo tras el commit).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_reveal"`
Expected: PASS (10 pruebas de Tasks 1 y 2: 2 + 8).

- [ ] **Step 5: Regresión del historial (el filtro nuevo no cambia su SQL)**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_history"`
Expected: PASS — **18 passed**, igual que la línea base medida.

- [ ] **Step 6: Commit**

```bash
git add app/modules/consent/platform/platform_consent.service.ts app/modules/consent/platform/dto/platform_legal_acceptance.dto.ts app/exceptions/platform_consent_error.ts app/constants/platform_consent_error_codes.ts tests/functional/platform_legal_acceptance_reveal.spec.ts
git commit -m "feat: revelar la evidencia de una aceptación con registro transaccional en bitácora"
```

---

### Task 3: Validador, `reveal` en el controller, ruta y textos i18n

**Files:**
- Modify: `app/modules/consent/platform/validators/platform_tenant_legal_acceptances.validator.ts`
- Modify: `app/modules/consent/platform/platform_consent.controller.ts`
- Modify: `start/routes/platform_legal_acceptance_routes.ts`
- Modify: `resources/langs/es.json`
- Modify: `resources/langs/en.json`
- Modify: `tests/unit/routes/platform_legal_acceptance_routes.spec.ts`
- Modify: `tests/functional/platform_legal_acceptance_reveal.spec.ts` (tercer grupo: HTTP)

**Interfaces:**
- Consumes: Task 2 (`revealEvidence`, `PlatformRevealAccessor`, `PlatformRevealedEvidenceDto`, keys y códigos 012/013); `PlatformConsentError`; `PLATFORM_CONSENT_ERROR_CODES_BY_KEY`; el patrón del accesor de `evidence.controller.ts:440-448`.
- Produces: la ruta `POST /api/platform/tenants/:businessUnitPublicId/legal-acceptances/:userConsentId/reveal`; `revealTenantLegalAcceptanceValidator` y su tipo de payload.

- [ ] **Step 1: Escribir el test que falla — grupo HTTP**

En `tests/functional/platform_legal_acceptance_reveal.spec.ts` agrega una ayuda `reveal(client, publicId, userConsentId, token?)` que hace `client.post(url).header('Authorization', …)` con las mismas guardas del historial, y un tercer grupo `test.group('POST …/legal-acceptances/:userConsentId/reveal — contrato', …)` con el `group.setup` del actor de plataforma y el `group.each.setup/teardown` del mundo (igual que la suite del historial, más la limpieza de bitácora de Task 2). Pruebas, cada una con su `Objetivo:`:

- `'CA-1: revela la IP y el agente de usuario y deja exactamente dos registros con la empresa correcta'` — 200, `assert.equal(response.header('cache-control'), 'no-store')`, `assert.deepEqual(response.body(), { type: 'success', data: { userConsentId, ip: '189.203.10.4', userAgent: 'Mozilla/5.0 (X11)' } })`, y las dos filas de bitácora con `business_unit_id` = id de A (`> 0`), `user_id` = usuario de plataforma, `pii_access_log_record_id` = `userConsentId`, `pii_access_log_origin_module = 'platform-legal-acceptances'` y el `accessor_ip`/`accessor_user_agent` de la petición.
- `'CA-2: revelar otra vez deja otro registro'` — segunda llamada 200 y el conteo por columna sube a 2.
- `'CA-3b: una sola columna con valor registra solo esa'` — UA `NULL` → `userAgent: null`, 1 fila (`userConsentIp`) y 0 de `userConsentUserAgent`.
- `'CA-4: la aceptación de otra empresa responde 404 sin bitácora'` — aceptación de una persona **solo** de B pedida bajo el path de A → 404 con `{ type: 'error', title: 'Aceptación no encontrada', key: 'aceptacion-no-encontrada', code: 'CONSENT.PLATFORM.012' }`, `assert.notProperty(body, 'data')` y `countRevealLogs('UserConsent', 'userConsentIp', idDeB) === 0`.
- `'CA-5: el consentimiento biométrico da el mismo 404 byte a byte'` — aceptación `biometric_consent` de una persona de A → mismo 404 y 0 filas.
- `'CA-6: id inexistente y cuenta de plataforma dan el mismo 404'` — `userConsentId = 999999999`, y aparte la aceptación de Términos de un `isPlatformAdmin = true` miembro de A → el mismo 404 y 0 filas. Aserta que los dos cuerpos son **deepEqual** al de CA-4.
- `'CA-6b: la cuenta con rol efectivo root da el mismo 404'` — aceptación de Términos (con IP y UA capturados) de una cuenta `isPlatformAdmin = false` cuyo rol efectivo en A es `root` (por `business_unit_users.role_id`; y aparte, con `role_id NULL` en la membresía, por `users.role_id`) → el mismo 404 byte a byte y 0 filas.
- `'Review Focus 2: la aceptación de una membresía retirada da 404 sin bitácora'` — membresía con `business_unit_user_deleted_at` → 404 `aceptacion-no-encontrada` y 0 filas.
- `'CA-7b: empresa inexistente o borrada responde 404 empresa-no-encontrada sin bitácora'` — `randomUUID()` y una empresa borrada → `{ type: 'error', title: 'Empresa no encontrada', key: 'empresa-no-encontrada', code: 'CONSENT.PLATFORM.010' }` y 0 filas para la aceptación.
- `'CA-8: params fuera de contrato responden 422'` — `userConsentId` `0`, `-1`, `1.5` y `abc`, y un `businessUnitPublicId` que no es UUID → 422 con `{ type: 'error', title: 'Parámetros de historial inválidos', key: 'parametros-de-historial-invalidos', code: 'CONSENT.PLATFORM.011' }`, `assert.notProperty(body, 'data')` y 0 filas.
- `'CA-10: una falla de bitácora responde 500 sin dato'` — `testUtils.createHttpContext()` con `ctx.auth` **sustituido por un actor vivo** del mismo modo que `tests/unit/helpers/credential_change_gate.spec.ts:16-19` (`const actor = new User(); actor.userId = adminUser.userId; ctx.auth = { user: actor } as HttpContext['auth']`), y el servicio de CA-9 (doble de `PiiAccessLogService` que lanza en la segunda `record`) como **segundo parámetro** de `reveal`: `assert.equal(ctx.response.getStatus(), 500)`, el cuerpo serializado (`JSON.parse(ctx.response.getBody()!)`) es exactamente `{ type: 'error', title: 'No fue posible revelar la evidencia', detail: <i18n>, key: 'no-fue-posible-revelar-la-evidencia', code: 'CONSENT.PLATFORM.013' }`, y el texto serializado no contiene `'189.203.10.4'` ni `'Mozilla'`.
- `'CA-11: el historial sigue enmascarado después de revelar'` — tras un revelado exitoso, `GET` del historial → la fila sigue con `ip: '•••••'` y `userAgent: '•••••'`.
- `'CA-12: sin token responde 401 sin bitácora'` — 401 con el cuerpo exacto del middleware `auth` y 0 filas.
- `'CA-13: un token del backoffice responde 403 sin bitácora'` — un owner de A con token del BO y aparte un `isPlatformAdmin = true` con token del BO → 403 con `deepEqual` de `{ title, detail, key: 'AUTH.PLATFORM.FORBIDDEN' }`, sin `code` (`Object.keys(body).sort()` = `['detail', 'key', 'title']`) y 0 filas.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_reveal"`
Expected: FAIL — la ruta `POST …/reveal` responde 404 de router (ruta inexistente).

- [ ] **Step 3: Escribir el validador**

En `validators/platform_tenant_legal_acceptances.validator.ts` exporta (JSDoc en español; el controller debe invocarlo con `{ data: request.params() }` porque la ruta no valida params sola):

```ts
export const revealTenantLegalAcceptanceValidator = vine.compile(
  vine.object({
    params: vine.object({
      businessUnitPublicId: vine.string().trim().uuid(),
      userConsentId: vine.number().min(1).withoutDecimals(),
    }),
  })
)

export type RevealTenantLegalAcceptanceParamsPayload = Awaited<
  ReturnType<typeof revealTenantLegalAcceptanceValidator.validate>
>
```

`min(1)` y **no** `positive()`: en VineJS `positive()` admite el 0 y CA-8 exige 422 con `userConsentId = 0` (mismo criterio documentado en este mismo archivo para `page`/`perPage`).

- [ ] **Step 4: Implementar `reveal` en el controller**

```ts
async reveal(ctx: HttpContext, service: PlatformConsentService = new PlatformConsentService()) {
  ctx.response.header('Cache-Control', 'no-store')   // antes de todo: aplica a 200, 422, 404 y 500
  try {
    const { businessUnitPublicId, userConsentId } = await this.validateRevealParams(ctx)
    const data = await service.revealEvidence(businessUnitPublicId, userConsentId, {
      accessorUserId: ctx.auth.user!.userId,
      accessorIp: ctx.request.ip(),
      accessorUserAgent: ctx.request.header('user-agent') ?? null,
    })
    return ctx.response.status(200).json({ type: 'success', data })
  } catch (error) {
    return this.domainError(ctx, error)
  }
}
```

- `validateRevealParams` espeja `validateHistoryParams`: `request.validateUsing(revealTenantLegalAcceptanceValidator, { data: request.params() })` y cualquier `E_VALIDATION_ERROR` ⇒ `PlatformConsentError('parametros-de-historial-invalidos')`; lo demás se relanza.
- En `domainError`, sustituye el ternario por un `Record<PlatformConsentErrorKey, number>`: `'filtros-de-aceptaciones-invalidos': 422`, `'empresa-no-encontrada': 404`, `'parametros-de-historial-invalidos': 422`, `'aceptacion-no-encontrada': 404`, `'no-fue-posible-revelar-la-evidencia': 500`. El cuerpo sigue siendo el mismo (`type`, `title` y `detail` i18n, `key`, `code`). Así `index` y `tenantHistory` conservan sus 422/404 exactos.
- Agrega el bloque `@swagger` + `@summary`/`@description`/`@responseBody` de `reveal` (200 de tres llaves, 401, 403, 404 de empresa, 404 de aceptación, 422, 500), con el mismo estilo de las dos operaciones vecinas. `docs/openapi.yaml` **no** se toca.

- [ ] **Step 5: Publicar la ruta**

En `start/routes/platform_legal_acceptance_routes.ts`, dentro del **único** `router.group(...)`, después del `GET` del historial:

```ts
router.post(
  '/tenants/:businessUnitPublicId/legal-acceptances/:userConsentId/reveal',
  '#modules/consent/platform/platform_consent.controller.reveal'
)
```

Actualiza el docblock de cabecera con la línea del `POST` (escribe bitácora; por eso `POST`, precedente `POST /api/v1/complaints/:complaintId/reveal-identity`).

- [ ] **Step 6: Agregar los textos i18n**

En `resources/langs/es.json` y `resources/langs/en.json`, dentro de `platformLegalAcceptances.errors` (junto a `empresa-no-encontrada` y `parametros-de-historial-invalidos`), agrega las dos entradas con los textos **verbatim** del bloque *Global Constraints → i18n*.

- [ ] **Step 7: Actualizar la suite de rutas (CA-14)**

En `tests/unit/routes/platform_legal_acceptance_routes.spec.ts`:
- En la prueba `'ninguna ruta fuera del grupo'`, **quita** `assert.notMatch(content, /router\.post\(/)` y conserva los `notMatch` de `put`, `patch` y `delete` (esa línea es la que hoy prohíbe justamente la ruta de esta historia).
- Agrega una prueba nueva: `'declara POST …/:userConsentId/reveal hacia reveal dentro del grupo'` que compare sobre el contenido compactado (`content.replace(/\s+/g, '')`) e incluya `router.post('/tenants/:businessUnitPublicId/legal-acceptances/:userConsentId/reveal',` y, dentro del grupo (entre `router.group(` y la última llave), la referencia `platform_consent.controller.reveal`.

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_reveal"`
Expected: PASS (24 pruebas: 2 de Task 1, 8 de Task 2, 14 de Task 3).

Run: `NODE_ENV=test node ace test unit --files="tests/unit/routes/platform_legal_acceptance_routes.spec.ts"`
Expected: PASS — **7 passed** (6 de la línea base + 1 nueva; la de "ninguna ruta fuera del grupo" sigue verde sin el `notMatch` de `post`).

- [ ] **Step 9: Regresión del BO y del historial (CA-15)**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_history"`
Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptances"`
Run: `NODE_ENV=test node ace test functional --files="consent_acceptance"`
Run: `NODE_ENV=test node ace test functional --files="physical_consent"`
Run: `NODE_ENV=test node ace test unit --files="tests/unit/modules/consent/evidence.service.spec.ts"`
Run: `NODE_ENV=test node ace test unit --files="tests/unit/modules/consent/physical_consent.service.spec.ts"`
Run: `NODE_ENV=test node ace test unit --files="tests/unit/helpers/consent_evidence_rbac.spec.ts"`
Expected: **18 / 16 / 10 / 6 / 5 / 24 / 3** passed — las siete líneas base medidas, sin nuevas fallas.

- [ ] **Step 10: Verificar que el diff no sale del censo**

Run: `git status --short && git diff --name-only`
Expected: solo los seis archivos de la API del `## Censo de archivos` del spec (`start/routes/platform_legal_acceptance_routes.ts`, `tests/unit/routes/platform_legal_acceptance_routes.spec.ts`, `app/modules/consent/platform/validators/platform_tenant_legal_acceptances.validator.ts`, `app/modules/consent/evidence/evidence.repository.ts`, `app/modules/consent/evidence/evidence.repository.mysql.ts`, `app/modules/consent/platform/platform_consent.service.ts`, `app/modules/consent/platform/platform_consent.controller.ts`, `app/modules/consent/platform/dto/platform_legal_acceptance.dto.ts`, `app/exceptions/platform_consent_error.ts`, `app/constants/platform_consent_error_codes.ts`, `resources/langs/es.json`, `resources/langs/en.json`, `tests/functional/platform_legal_acceptance_reveal.spec.ts`) y ninguno de la lista de **No tocar**.

- [ ] **Step 11: Commit**

```bash
git add start/routes/platform_legal_acceptance_routes.ts tests/unit/routes/platform_legal_acceptance_routes.spec.ts app/modules/consent/platform/validators/platform_tenant_legal_acceptances.validator.ts app/modules/consent/platform/platform_consent.controller.ts resources/langs/es.json resources/langs/en.json
git commit -m "feat: exponer el revelado de evidencia de aceptaciones en la consola de plataforma"
```

---

# Repo 2: `valanserh-landlord`

Rama de trabajo: `feature/USRH1790654705065-revelar-evidencia-aceptacion` (ya existe). Rutas relativas a `/Users/noeabelvargaslopez/Documents/projects/valanserh-landlord`.

### Task 4: Interface y `POST` del revelado en el repositorio del slice

**Files:**
- Modify: `app/pages/legal-acceptances/[publicId]/domain/tenant-legal-acceptances.interface.ts`
- Modify: `app/pages/legal-acceptances/[publicId]/infrastructure/tenant-legal-acceptances.repository.ts`
- Modify: `app/pages/legal-acceptances/[publicId]/infrastructure/tenant-legal-acceptances.repository.spec.ts`

**Interfaces:**
- Consumes: los guards locales del repositorio (`asNumber`, `asNullableString`), ya presentes.
- Produces (Tasks 5 y 6 lo consumen):
  - `TenantLegalAcceptanceRevealedEvidence { userConsentId: number; ip: string | null; userAgent: string | null }`.
  - `RawTenantLegalAcceptanceRevealedEvidence { userConsentId: unknown; ip: unknown; userAgent: unknown }`.
  - `RevealTenantLegalAcceptanceEvidenceParams { apiFetch: <T>(url, options?) => Promise<T>; publicId: string; userConsentId: number }`.
  - `RevealTenantLegalAcceptanceEvidenceApiResponse { type: string; data: RawTenantLegalAcceptanceRevealedEvidence }`.
  - `revealTenantLegalAcceptanceEvidence(params): Promise<TenantLegalAcceptanceRevealedEvidence>`.

- [ ] **Step 1: Escribir el test que falla**

En `tenant-legal-acceptances.repository.spec.ts` agrega un `describe('revealTenantLegalAcceptanceEvidence', …)` (mismo estilo `vi.fn()` del resto del archivo). Cada `it` con su bloque `Objetivo:`:

- `'hace un POST a la ruta del revelado del tenant indicado'` — asertar `expect(apiFetch).toHaveBeenCalledWith(\`/platform/tenants/${TENANT_ID}/legal-acceptances/812/reveal\`, { method: 'POST' })`.
- `'mapea data por lista blanca y descarta llaves de más'` — respuesta `{ type: 'success', data: { userConsentId: 812, ip: '189.203.10.4', userAgent: 'Mozilla/5.0 (X11)', extra: 'x' } }` → `toEqual({ userConsentId: 812, ip: '189.203.10.4', userAgent: 'Mozilla/5.0 (X11)' })` y `Object.keys(...)` con las tres llaves.
- `'acepta ip y userAgent null tal cual'`.
- `'CA-20: lanza si el userConsentId de la respuesta es distinto al pedido'` — `data.userConsentId: 999` con `userConsentId: 812` → `rejects.toThrow()`.
- `'CA-20: lanza si ip o userAgent no son string ni null'` — `ip: 12345` → `rejects.toThrow()`.
- `'propaga el error cuando el API falla'` — `apiFetch` rechaza → `rejects.toThrow('500')`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test "app/pages/legal-acceptances/[publicId]/infrastructure/tenant-legal-acceptances.repository.spec.ts"`
Expected: FAIL — `revealTenantLegalAcceptanceEvidence` no existe.

- [ ] **Step 3: Implementar la interface y el repositorio**

Interface: los cuatro tipos del bloque **Interfaces** de arriba, con JSDoc en español (la forma cruda lleva cada campo `unknown` porque se valida al mapear).

Repositorio:

```ts
export const revealTenantLegalAcceptanceEvidence = async (
  params: RevealTenantLegalAcceptanceEvidenceParams
): Promise<TenantLegalAcceptanceRevealedEvidence> => {
  const response = await params.apiFetch<RevealTenantLegalAcceptanceEvidenceApiResponse>(
    `/platform/tenants/${params.publicId}/legal-acceptances/${params.userConsentId}/reveal`,
    { method: 'POST' }
  )

  const raw = response.data
  const userConsentId = asNumber(raw.userConsentId, 'userConsentId')
  if (userConsentId !== params.userConsentId) {
    throw new Error('tenant-legal-acceptances: userConsentId distinto al solicitado')
  }

  return {
    userConsentId,
    ip: asNullableString(raw.ip, 'ip'),
    userAgent: asNullableString(raw.userAgent, 'userAgent')
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test "app/pages/legal-acceptances/[publicId]/infrastructure/tenant-legal-acceptances.repository.spec.ts"`
Expected: PASS (línea base del archivo + 6 nuevas).

- [ ] **Step 5: Commit**

```bash
git add "app/pages/legal-acceptances/[publicId]/domain/tenant-legal-acceptances.interface.ts" "app/pages/legal-acceptances/[publicId]/infrastructure/tenant-legal-acceptances.repository.ts" "app/pages/legal-acceptances/[publicId]/infrastructure/tenant-legal-acceptances.repository.spec.ts"
git commit -m "feat(legal-acceptances): agregar el POST del revelado de evidencia en el repositorio

Refs: USRH1790654705065"
```

---

### Task 5: Composable `use-reveal-acceptance-evidence`

**Files:**
- Create: `app/pages/legal-acceptances/[publicId]/application/use-reveal-acceptance-evidence.ts`
- Create: `app/pages/legal-acceptances/[publicId]/application/use-reveal-acceptance-evidence.spec.ts`

**Interfaces:**
- Consumes: `revealTenantLegalAcceptanceEvidence` (Task 4) y `TenantLegalAcceptanceRevealedEvidence` (Task 4).
- Produces (Task 6 lo consume):

```ts
export interface UseRevealAcceptanceEvidenceMessages { revealError: string }
export interface UseRevealAcceptanceEvidenceDeps {
  apiFetch: <T>(url: string, options?: FetchOptions<'json'>) => Promise<T>
  messages: UseRevealAcceptanceEvidenceMessages
}
export interface UseRevealAcceptanceEvidenceReturn {
  revealed: Ref<Map<number, TenantLegalAcceptanceRevealedEvidence>>
  revealingId: Ref<number | null>
  revealErrors: Ref<Map<number, string>>
  reveal: (publicId: string, userConsentId: number) => Promise<void>
  isRevealed: (id: number) => boolean
  clear: () => void
}
```

- [ ] **Step 1: Escribir el test que falla**

`use-reveal-acceptance-evidence.spec.ts` con el molde de `use-tenant-legal-acceptances.spec.ts` (`describe`/`it`, `vi.spyOn(repo, 'revealTenantLegalAcceptanceEvidence')`, `beforeEach(() => vi.clearAllMocks())`, deps planas `{ apiFetch: vi.fn(), messages: { revealError: 'No fue posible revelar la IP y el agente de usuario.' } }`). Cada `it` con su bloque `Objetivo:`:

- `'revela una aceptación y la deja disponible solo por su id'` — el repositorio resuelve `{ userConsentId: 812, ip: '189.203.10.4', userAgent: 'Mozilla/5.0 (X11)' }`; `await reveal('uuid-a', 812)` → `isRevealed(812)` es `true`, `revealed.value.get(812)` con los dos valores, `isRevealed(913)` es `false`, `revealingId.value` vuelve a `null` y no hay error.
- `'CA-17: un segundo clic mientras hay un revelado en curso no dispara otra petición'` — el repositorio devuelve una promesa pendiente; se llama `reveal('uuid-a', 812)` sin `await` y luego `reveal('uuid-a', 913)`; el espía fue llamado **una** vez y `revealingId.value === 812`.
- `'CA-18: un error con detail lo expone solo en esa fila'` — el repositorio rechaza con `{ data: { detail: 'No existe una aceptación de términos o aviso con ese identificador en esta empresa.' } }` → `revealErrors.value.get(812)` es ese texto, `isRevealed(812)` es `false` y `reveal` **no** relanza.
- `'CA-18: un 5xx cae al mensaje genérico'` — rechaza `new Error('500')` → `revealErrors.value.get(812) === 'No fue posible revelar la IP y el agente de usuario.'`.
- `'CA-19: clear() vacía el estado revelado y los errores'` — tras revelar, `clear()` → `isRevealed(812)` es `false`, `revealed.value.size === 0`, `revealErrors.value.size === 0`.
- `'no registra el valor revelado en consola'` — `vi.spyOn(console, 'error')`; el rechazo con `ip`/`userAgent` en el cuerpo no deja ninguna llamada que contenga esos valores.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test "app/pages/legal-acceptances/[publicId]/application/use-reveal-acceptance-evidence.spec.ts"`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el composable**

Molde de `use-tenant-legal-acceptances.ts` (inyección de deps, nunca relanza). Comportamiento:

- `revealed` y `revealErrors` son `ref(new Map<…>())`; `revealingId` es `ref<number | null>(null)`. Al escribir en un mapa **reemplaza el mapa por uno nuevo** (`new Map(revealed.value).set(id, value)`) para que el `ref` notifique al template.
- `reveal(publicId, userConsentId)`: si `revealingId.value !== null` ⇒ `return` sin hacer nada (CA-17, doble clic = una petición). Guarda el `id` en `revealingId`, borra el error de esa fila, llama a `revealTenantLegalAcceptanceEvidence({ apiFetch, publicId, userConsentId })`; en éxito escribe en `revealed`; en `catch` escribe en `revealErrors` el `detail` del cuerpo si existe (`error.data.detail`) y si no `messages.revealError`; `finally` limpia `revealingId`. **Nunca relanza** y **nunca** hace `console.*` con el valor (si loguea algo, solo el status HTTP).
- `isRevealed(id)`: `revealed.value.has(id)`. `clear()`: `revealed.value = new Map()`, `revealErrors.value = new Map()`, `revealingId.value = null`.
- Estado local de la instancia: ni Pinia, ni `localStorage`, ni `sessionStorage`.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test "app/pages/legal-acceptances/[publicId]/application/use-reveal-acceptance-evidence.spec.ts"`
Expected: PASS (6 pruebas).

- [ ] **Step 5: Commit**

```bash
git add "app/pages/legal-acceptances/[publicId]/application/use-reveal-acceptance-evidence.ts" "app/pages/legal-acceptances/[publicId]/application/use-reveal-acceptance-evidence.spec.ts"
git commit -m "feat(legal-acceptances): agregar el caso de uso del revelado por fila

Refs: USRH1790654705065"
```

---

### Task 6: Botón, aviso y valores revelados en la fila expandida

**Files:**
- Modify: `app/pages/legal-acceptances/[publicId]/domain/locales/tenant-legal-acceptances.es.json`
- Modify: `app/pages/legal-acceptances/[publicId]/script.ts`
- Modify: `app/pages/legal-acceptances/[publicId]/index.vue`

**Interfaces:**
- Consumes: Tasks 4 y 5; `useApi()` de `~/resources/scripts/services/api` (toast global solo en red/5xx; los 4xx se propagan sin toast); `displayMaskedValue` existente; el bloque `tenant-legal-acceptances__evidence` de USRH1790610965466.
- Produces: el botón "Revelar IP y agente de usuario" y el valor revelado en memoria de la página.

- [ ] **Step 1: Agregar las cinco claves del locale**

En `tenant-legal-acceptances.es.json`, al final del objeto, agrega los cinco pares con los textos **verbatim** del bloque *Global Constraints → Landlord — textos*: `tla_btn_reveal`, `tla_btn_reveal_aria`, `tla_reveal_notice`, `tla_revealed_hint`, `tla_reveal_error`.

- [ ] **Step 2: Orquestar en `script.ts`**

- Importa `onBeforeUnmount` de `vue` y `useRevealAcceptanceEvidence` de `./application/use-reveal-acceptance-evidence`.
- Instancia: `const evidence = useRevealAcceptanceEvidence({ apiFetch, messages: { revealError: i18n.t('tla_reveal_error') } })`.
- `hasEvidence = (row: { ip: string | null; userAgent: string | null }): boolean => row.ip !== null || row.userAgent !== null`.
- `reveal = (userConsentId: number): void => { if (publicId !== null) void evidence.reveal(publicId, userConsentId) }`.
- CA-19: `clear()` en `onPage` **antes** de cargar (`evidence.clear(); void catalog.load(publicId, event.page + 1)`) y en `onBeforeUnmount(() => evidence.clear())`.
- En el `return` expone `revealed: evidence.revealed`, `revealingId: evidence.revealingId`, `revealErrors: evidence.revealErrors`, `isRevealed: evidence.isRevealed`, `hasEvidence`, `reveal`.

- [ ] **Step 3: Escribir el bloque de evidencia en `index.vue`**

Dentro del `#expansion="slotProps"`, en el bloque `tenant-legal-acceptances__evidence`, los dos renglones de IP y agente de usuario pasan a leer el valor revelado **por interpolación** y con `?? displayMaskedValue(row…)`:

```html
<span class="tenant-legal-acceptances__evidence-value">
  {{ revealed.get(slotProps.data.userConsentId)?.ip ?? displayMaskedValue(slotProps.data.ip) }}
</span>
```

(ídem `userAgent`). Y después de los dos renglones:

```html
<div v-if="hasEvidence(slotProps.data)">
  <Button
    v-if="!isRevealed(slotProps.data.userConsentId)"
    variant="text"
    raised
    severity="secondary"
    :label="$t('tla_btn_reveal')"
    :aria-label="$t('tla_btn_reveal_aria', { userName: slotProps.data.userName })"
    :loading="revealingId === slotProps.data.userConsentId"
    :disabled="revealingId !== null"
    @click="reveal(slotProps.data.userConsentId)"
  />
  <Message v-if="!isRevealed(slotProps.data.userConsentId)" severity="secondary">
    {{ $t('tla_reveal_notice') }}
  </Message>
  <span v-else>{{ $t('tla_revealed_hint') }}</span>
  <Message v-if="revealErrors.has(slotProps.data.userConsentId)" severity="error">
    {{ revealErrors.get(slotProps.data.userConsentId) }}
  </Message>
</div>
```

Con ambos valores `null`, `hasEvidence` es `false` → **ni botón ni aviso** (CA-16). **Sin estilos nuevos**: no agregues clases ni SCSS; `overflow-wrap: anywhere` ya vive en `__evidence-value`. **Nunca `v-html`** (CA-21).

- [ ] **Step 4: Typecheck, lint, estilos, convenciones y suite completa**

Run: `pnpm typecheck && pnpm lint && pnpm lint:styles && pnpm check:conventions`
Expected: los cuatro en **0**.

Run: `pnpm test`
Expected: PASS — **241 archivos / 1992 pruebas** de la línea base **más** las nuevas de Tasks 4-6 (6 + 6), sin fallos y con `index.spec.ts` (la suite de la página) en verde: el mock del expediente no se toca y el composable nuevo no dispara ninguna petición al pintar.

- [ ] **Step 5: Revisión visual (fuera de vitest — cubre CA-16 y CA-21)**

Con el API local (ramas de Tasks 1-3) y el landlord arriba, en **claro y oscuro**, **desktop y 375 px**: fila expandida con IP y agente de usuario tapados, el botón "Revelar IP y agente de usuario" y el aviso de bitácora; al pulsarlo, los dos datos completos **solo en ese renglón** (las demás filas siguen con `•••••`), el botón desaparece y se lee "Visible hasta que salgas de esta página."; al paginar o salir y volver, la fila vuelve a `•••••` con el botón; una aceptación sin IP ni agente de usuario **sin** botón ni aviso; un user agent largo con `<script>` se pinta como **texto** (nunca se ejecuta) y se ajusta sin desbordar. Un ajuste visual de esta pantalla va en el mismo commit de este paso solo si es de este bloque.

- [ ] **Step 6: Commit**

```bash
git add "app/pages/legal-acceptances/[publicId]/domain/locales/tenant-legal-acceptances.es.json" "app/pages/legal-acceptances/[publicId]/script.ts" "app/pages/legal-acceptances/[publicId]/index.vue"
git commit -m "feat(legal-acceptances): revelar la IP y el agente de usuario de una aceptación

Refs: USRH1790654705065"
```

---

### Task 7: Manual de QA del flujo (entrega; lo recorre una persona)

**Files:**
- Create: `docs/superpowers/plans/2026-10-06-revelar-evidencia-aceptacion-qa-flujo.md` (repo `gsti-rh-api`, versionado)
- Modify (no versionado): `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts`

**Interfaces:**
- Consumes: la pantalla de Task 6 y el endpoint de Task 3 con sus respuestas ya verificadas; el catálogo real de textos (`tenant-legal-acceptances.es.json`); las reglas de manual de QA.
- Produces: el playbook que **entrega** el ejecutor y **recorre una persona** (el usuario), no el agente.

- [ ] **Step 1: Leer la regla y el molde antes de redactar**

Lee `~/.agents/rules/manual-qa/manual-qa-frontend.md` y `~/.agents/rules/manual-qa/manual-qa-execution.md` (la copia viva; no las cites de memoria). Abre `docs/superpowers/plans/2026-10-05-historial-aceptaciones-tenant-qa-flujo.md` y toma las constantes del ambiente: URL local (`http://127.0.0.1:3000/legal-acceptances`, sin `/es`), el flujo de login tal como se ve en pantalla, el comando del seeder (`cd gsti-rh-api && node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`) y el dominio y la contraseña de las cuentas de prueba.

- [ ] **Step 2: Sembrar los datos de esta HU**

En `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (su sitio; no se versiona), bajo una marca reconocible:
- Un tenant de prueba con al menos tres aceptaciones de Términos y Aviso **con IP y agente de usuario capturados**, de personas distintas, para revelar una y dejar las otras enmascaradas.
- Una aceptación **sin** IP ni agente de usuario (para el caso sin botón).
- Un user agent largo (más de 100 caracteres) con `<script>` incluido, en una aceptación del tenant, para el caso de texto largo.
- Una segunda empresa con una aceptación propia (para el aislamiento).
- Un consentimiento biométrico de una persona del tenant (para comprobar que **nunca** se puede revelar desde el expediente).
Declara en el manual, antes de los escenarios, que la pantalla de la consola con la que se prueba es la del expediente y que el revelado **queda anotado** en la bitácora.

- [ ] **Step 3: Redactar el manual con la estructura mínima**

`2026-10-06-revelar-evidencia-aceptacion-qa-flujo.md`, lenguaje llano para quien prueba en el navegador:
0. **Problema / Solución** cortos y un `Ejemplo:` cotidiano (la disputa con un cliente que dice no haber aceptado, y la necesidad de probar desde qué equipo se aceptó); glosario solo con términos de negocio que el cuerpo no explique al usarlos (expediente, revelar, parcialmente oculto, bitácora de acceso a datos personales, agente de usuario).
1. **Preparar**: el único comando del seeder y qué deja sembrado; prerrequisito: esta rama del API y del landlord arriba, con el expediente ya navegando.
2. **Usuarios**: tabla con correo y contraseña literales del seeder.
3. **Dónde probar**: menú lateral → **Aceptaciones legales** → botón **Ver historial** de una empresa; y la URL directa `/legal-acceptances/<id de la empresa>` (sin `/es`).
4. **Escenarios**, cada uno abriendo con su línea **`Objetivo:`** antes de los pasos, cubriendo: la fila expandida con la IP y el agente de usuario tapados con puntos, el botón **Revelar IP y agente de usuario** y el aviso de que la consulta queda registrada; que al pulsarlo se ven completos **solo ese renglón** y las demás filas siguen tapadas, el botón desaparece y se lee que siguen visibles hasta salir de la pantalla; que **no pide ninguna confirmación**; que al cambiar de página del expediente o salir y volver los datos se vuelven a ver tapados y el botón reaparece; que revelar otra vez vuelve a funcionar (y queda otro registro); que una aceptación sin dirección IP ni agente de usuario **no muestra el botón**; que el aislamiento se respeta (no hay forma de revelar una aceptación de la otra empresa desde este expediente); que el consentimiento biométrico no aparece ni se puede revelar; que un agente de usuario largo con `<script>` se ve como **texto** y no rompe la pantalla; y que el acomodo en móvil (375 px) es correcto.
5. **Checklist** final con una casilla por escenario, enunciada contra su objetivo.

- [ ] **Step 4: Declarar lo no revisable con su motivo**

En "Qué no se revisa con esta base sembrada": que el registro quede en la bitácora **con el dato correcto** (la pantalla de bitácora se consulta en el backoffice del cliente y no en esta consola), el rechazo a quien no es usuario de plataforma (lo decide el servidor), y el manejo de un fallo del revelado (requiere provocar un error del servidor). Sin pasos inventados.

- [ ] **Step 5: Autocomprobar el manual contra la regla**

Cada escenario con su `Objetivo:`; textos copiados del catálogo real (no redactados de memoria); sin rutas de archivo, TypeScript, endpoints, `curl`, `jq` ni selectores. Cuenta:

Run: `cm=$(grep -c '^### 4\.' docs/superpowers/plans/2026-10-06-revelar-evidencia-aceptacion-qa-flujo.md); ob=$(grep -c '^Objetivo:' docs/superpowers/plans/2026-10-06-revelar-evidencia-aceptacion-qa-flujo.md); echo "escenarios=$cm objetivos=$ob"; test "$cm" = "$ob" && echo OK`
Expected: `escenarios=N objetivos=N` y `OK`.

- [ ] **Step 6: Entregar (no recorrer)**

El manual queda **entregado**; el ejecutor **no** lo camina (regla `manual-qa-execution.md`). El seeder no se versiona: nada de `git add -f`.

```bash
git add docs/superpowers/plans/2026-10-06-revelar-evidencia-aceptacion-qa-flujo.md
git commit -m "docs: entrega el manual de QA del revelado de evidencia de aceptaciones"
```

---

## Verificación final (fuera de las tareas)

Al cerrar las siete tareas:

- **API**, rama `feature/USRH1790654705065-revelar-evidencia-aceptacion`, con `sae_pruebas` al día: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_reveal"` en verde completo (CA-1 a CA-13 y CA-15, más los bordes de Review Focus); `… --files="platform_legal_acceptance_history"` 18; `… --files="platform_legal_acceptances"` 16; `… --files="consent_acceptance"` 10; `… --files="physical_consent"` 6; `… unit --files="tests/unit/routes/platform_legal_acceptance_routes.spec.ts"` 7; `… unit --files="tests/unit/modules/consent/evidence.service.spec.ts"` 5; `… unit --files="tests/unit/modules/consent/physical_consent.service.spec.ts"` 24; `… unit --files="tests/unit/helpers/consent_evidence_rbac.spec.ts"` 3.
- **Landlord**, misma rama: `pnpm typecheck && pnpm lint && pnpm lint:styles && pnpm check:conventions` en 0 y `pnpm test` completo en verde (≥ 241 archivos / 1992 pruebas + las nuevas).
- Confirmar el `## Censo de archivos` del spec: ningún archivo fuera de la tabla aparece en los diffs de ningún repo, y ninguno de la lista de **No tocar** fue modificado.
- Revisión visual de Task 6 Step 5 hecha en claro/oscuro, desktop y 375 px.
- El manual de QA (Task 7) queda **entregado**; el recorrido lo hace una persona.
- El plan termina aquí.
