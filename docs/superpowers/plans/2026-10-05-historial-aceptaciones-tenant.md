# Historial de aceptaciones de un tenant (USRH1790610965466) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El expediente de aceptaciones de una empresa: `GET /api/platform/tenants/:businessUnitPublicId/legal-acceptances` (paginado, IP y user agent **siempre** enmascarados) y la página `/legal-acceptances/[publicId]` del landlord, con el botón "Ver historial" desde la lista de USRH1790654705035.

**Architecture:** API (repo `gsti-rh-api`, en código `valanserh-api`): dos filtros **aditivos** en `EvidenceFilters` (`types`, `excludePlatformAccounts`), dos métodos nuevos en el puerto de plataforma (`findBusinessUnitByPublicId`, `findOwnerUserIds`), un método `getTenantHistory` en el servicio que orquesta `EvidenceService#getEvidence` con `revealAllowed = false` **fijo** y devuelve un DTO por lista blanca; controller y ruta dentro del único grupo `auth` + `platformAdmin`. Landlord (repo `valanserh-landlord`): slice hexagonal `app/pages/legal-acceptances/[publicId]/` espejo de `app/pages/alliances/[allianceId]/`, con la paginación lazy de la lista y la fila expandida para la evidencia. Una sola barrera por capa: el 404 y la aserción viven en el servicio; la exclusión de cuentas de plataforma y del biométrico viven **en la consulta**; DA-1 (`isOwner`) vive solo en `ownerMembershipsQuery`.

**Tech Stack:** Adonis 6 + VineJS + japa (API, BD de pruebas `sae_pruebas`); Nuxt 4 SPA (`ssr: false`) + Vue 3 + PrimeVue + Vitest (landlord, locale `es`).

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1790610965466.md` — el plan argumenta desde él; el ejecutor lee **ambos**. Cuerpos de error, textos i18n y contrato de §10 se copian **verbatim** del spec, no se improvisan.

**Validación de anclas (2026-10-05):** hecha contra ambos repos, cada uno en su rama `feature/USRH1790610965466-historial-aceptaciones-tenant` (ya creadas y con el código de las dependencias dentro: en el API, el sub-slice y las suites de USRH1790610965452 están en la rama — `tests/functional/platform_legal_acceptances.spec.ts` corre en verde 16/16; en el landlord, la página de USRH1790654705035 está fusionada en la rama). Divergencia menor con el spec: la rama base `feature/USRH1790654705035-aceptaciones-por-tenant-plataforma` **no existe en el repo del API** (sí en el landlord); su contenido (452) ya vive en la rama de esta HU — drift trivial, no cambia alcance. Cero `assertPositiveBusinessUnitId` existe: lo crea este plan (Task 3). Todo lo demás coincide: firmas, rutas, columnas, DTOs, constantes, locales.

## Global Constraints

- **Contrato §10 congelado** para USRH1790654705065: forma de `200`, `meta` de `getEvidence`, errores 401/403/404/422 y `userConsentId` como llave. Cualquier cambio de alcance, contrato o regla de negocio se **escala a Wilvardo**; el drift trivial se corrige al momento.
- **No tocar** (censo del spec): `evidence.service.ts`, `evidence.controller.ts`, la pantalla `consent-evidence` del BO, `platform_consent.constants.ts`, `docs/openapi.yaml`, `system_modules.constant.ts`, migraciones ni seeders versionados, `app/pages/tenants/[publicId]/index.vue` del landlord. Ninguno puede aparecer en el diff.
- **Frontera con USRH1790654705065 (D2):** nada de `POST …/reveal`, `userConsentId` en `EvidenceFilters`, `PiiAccessLogService`, códigos `012+`, botón "Revelar" ni su composable. El bloque `tenant-legal-acceptances__evidence` de la fila expandida queda listo para que D2 agregue su acción.
- **Revelado:** `getEvidence` se llama con `revealAllowed = false` fijo y el endpoint no acepta ningún parámetro de revelado (`?reveal=true` se ignora). Lo que NO debe pasar: llamar a `getEvidence` sin `businessUnitId`; devolver `EvidenceRowDto` tal cual; `v-html` en el landlord; filtrar biométrico en la UI en vez de en la consulta.
- **Errores:** siempre `{ type: 'error', title, detail, key, code }` para 404/422; el 403 del guard es exactamente las tres llaves sin `code` y no se toca el middleware.
- **Idioma:** TS estricto, cero `any`; comentarios y JSDoc en español; identificadores en inglés.
- **Commits:** Conventional Commits. En el API, `feat:`/`docs:` con descripción en español, sin scope. En el landlord, `feat(legal-acceptances): …` + trailer `Refs: USRH1790610965466`.
- **BD de pruebas:** los tests funcionales del API exigen `sae_pruebas` al día. Antes de la primera corrida (y si alguna truena raro): `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed`. Los tests se corren siempre con `NODE_ENV=test` (`.env.test` ya apunta a `sae_pruebas`).
- **Líneas base medidas el 2026-10-05** (con `migration:fresh --seed` corrido antes):
  - API unit: `platform_legal_acceptance_routes` 5 pasadas; `evidence.service` 23; `acceptance.service` 12; `physical_consent.service` 24; `resolve_document_status` 4; `consent_gate` 5; `consent_evidence_rbac` 3.
  - API functional: `consent_acceptance` 10 pasadas; `platform_legal_acceptances` 16 pasadas; `physical_consent` **6 pasadas + 5 hooks de setup en error** (FK `user_consents_legal_document` RESTRICT contra asientos biométricos sembrados por el seeder QA). Ese estado es **preexistente y heredado**: la verificación exige mantener exactamente esas 6 pasadas sin nuevas fallas; este plan no lo arregla.
  - Landlord: `pnpm test` **236 archivos / 1959 pruebas** en verde; `pnpm typecheck`, `pnpm lint`, `pnpm lint:styles`, `pnpm check:conventions` en 0.
- El plan **no** incluye crear el PR ni desplegar (proceso aparte); termina en la verificación automatizada y en la entrega del manual de QA, que recorre una persona.

## Review Focus

Las cinco clases de entrada o modos de fallo que el spec implica y ningún criterio de aceptación ejercita directamente. Cada línea tiene su prueba en la tarea que posee el código.

1. **Filtro `types` con arreglo vacío (`types: []`)** — debe dar cero filas (`1 = 0`, fail-closed), no comportarse como "sin filtro". → Prueba directa del repositorio en Task 1, junto a CA-8b.
2. **Empresa inactiva (no borrada)** — su historial **sí** se muestra (§11: inactivo o suspendido → historial visible). → Prueba HTTP en Task 4.
3. **Persona con `user_deleted_at`** — comportamiento **verificado en la Task 4**: la aceptación SÍ persiste en el expediente (el `whereHas('user', …)` de `baseQuery` no excluye al usuario borrado; el preload sí, de ahí `userName: ''`), con `isOwner: false` porque `ownerMembershipsQuery` exige cuenta viva. Queda fijado con prueba HTTP y `EvidenceService` no se tocó. El spec §11 lo suponía al revés («la fila no aparece») y por eso lo marcó `[no verificado]`: es drift documental del spec (§10 ya admite `userName: ''`), a escalar con Wilvardo — no un defecto del código. → Prueba HTTP en Task 4.
4. **`acceptedAt` crudo que no es `string | null`** (un número, un objeto) — el repositorio del landlord rechaza la respuesta igual que con `documentType`/`channel` fuera de contrato (hermano de CA-23). → Prueba en Task 6.
5. **Borde de paginación: `perPage=100` exacto pasa; `page` mayor que `lastPage` da `data: []` con el `meta` real** — CA-11 pisa `perPage=101` pero no los límites válidos. → Prueba HTTP en Task 4.

---

# Repo 1: `gsti-rh-api`

Rama de trabajo: `feature/USRH1790610965466-historial-aceptaciones-tenant` (ya existe y está verificada). Rutas de este repo escritas relativas a `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-api`.

### Task 1: Filtros aditivos `types` y `excludePlatformAccounts` del repositorio de evidencia

**Files:**
- Modify: `app/modules/consent/evidence/evidence.repository.ts`
- Modify: `app/modules/consent/evidence/evidence.repository.mysql.ts`
- Create: `tests/functional/platform_legal_acceptance_history.spec.ts` (solo el primer grupo; los grupos HTTP los agrega la Task 4)

**Interfaces:**
- Consumes: nada nuevo; `baseQuery` existente con sus `.if` actuales.
- Produces (Task 3 y la Task de D2 las consumen):
  - `EvidenceFilters.types?: LegalDocumentType[]` — filtra por `legal_documents.legal_document_type` vía `whereHas`; **arreglo vacío → cero filas** (fail-closed).
  - `EvidenceFilters.excludePlatformAccounts?: boolean` — exige `businessUnitId`; excluye a las cuentas de plataforma por `is_platform_admin = 1` **o** rol efectivo `root` en la empresa del filtro (`COALESCE(business_unit_users.role_id, users.role_id)`); **sin `businessUnitId` → cero filas** (fail-closed).
  - Sin ambos filtros, el SQL de `baseQuery` es **idéntico** al de hoy (CA-16).

- [ ] **Step 1: Escribir el test que falla — grupo fail-closed del spec funcional**

Crea `tests/functional/platform_legal_acceptance_history.spec.ts` con un docblock de cabecera (mismo tono del de `tests/functional/platform_legal_acceptances.spec.ts`, referido a USRH1790610965466 y al expediente) y un primer grupo `test.group('Repositorio de evidencia — filtros del historial (fail-closed)')` con dos pruebas que llaman directo al adaptador (sin HTTP, sin fixtures; corren contra `sae_pruebas` recién sembrada):

- `'CA-8b: excludePlatformAccounts sin businessUnitId devuelve cero filas'` — `await new EvidenceRepositoryMysql().findEvidence({ types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES], excludePlatformAccounts: true }, { page: 1, perPage: 20 })` → asertar `rows.length === 0` y `meta.total === 0`.
- `'types con arreglo vacío devuelve cero filas (fail-closed)'` — `findEvidence({ types: [] }, { page: 1, perPage: 20 })` → `rows.length === 0`.

Imports: `import { test } from '@japa/runner'`, `import EvidenceRepositoryMysql from '#modules/consent/evidence/evidence.repository.mysql'`, `import { PLATFORM_ACCEPTANCE_DOCUMENT_TYPES } from '#modules/consent/platform/platform_consent.constants'`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_history"`
Expected: FAIL — no compila: `types`/`excludePlatformAccounts` no existen en `EvidenceFilters`.

- [ ] **Step 3: Implementar los dos filtros en `EvidenceFilters` y `baseQuery`**

En `evidence.repository.ts` agrega a `EvidenceFilters` (con JSDoc en español, fail-closed explícito en el de exclusión):
- `types?: LegalDocumentType[]`
- `excludePlatformAccounts?: boolean`

En `evidence.repository.mysql.ts`: importa `db` de `@adonisjs/lucid/services/db` y declara al nivel del módulo:

```ts
/** Slugs que marcan una cuenta como de plataforma en la empresa del filtro (§4 regla 1). */
const PLATFORM_ACCOUNT_ROLE_SLUGS = ['root'] as const
```

En `baseQuery`, **después** del `.if(filters.businessUnitId, …)` existente y **antes** de `.orderBy`, agrega los dos `.if` (los `.if` existentes no cambian):

```ts
.if(filters.types !== undefined, (query) => {
  const types = filters.types as LegalDocumentType[]
  if (types.length === 0) {
    // Fail-closed: un arreglo vacío no significa "sin filtro".
    query.whereRaw('1 = 0')
    return
  }
  query.whereHas('legalDocument', (documentQuery) => {
    documentQuery.whereIn('legal_document_type', types)
  })
})
.if(filters.excludePlatformAccounts, (query) => {
  const businessUnitId = filters.businessUnitId
  if (!businessUnitId) {
    // Fail-closed: sin empresa del filtro la exclusión no devuelve nada (CA-8b).
    query.whereRaw('1 = 0')
    return
  }
  query.where((outer) => {
    outer
      // Asientos sin usuario quedan (el filtro types ya saca el biométrico).
      .whereNull('user_consents.user_id')
      .orWhereNotExists((sub) => {
        sub.from('users as pa_u')
          .leftJoin('business_unit_users as pa_buu', (j) => {
            j.on('pa_buu.user_id', 'pa_u.user_id')
              .andOnVal('pa_buu.business_unit_id', businessUnitId)
              .andOnNull('pa_buu.business_unit_user_deleted_at')
          })
          .leftJoin('roles as pa_r', 'pa_r.role_id', db.raw('COALESCE(pa_buu.role_id, pa_u.role_id)'))
          .whereColumn('pa_u.user_id', 'user_consents.user_id')
          .where((w) => {
            w.where('pa_u.is_platform_admin', true).orWhereIn('pa_r.role_slug', [
              ...PLATFORM_ACCOUNT_ROLE_SLUGS,
            ])
          })
      })
  })
})
```

Semántica fija (spec §7): la fila se excluye si la persona es cuenta de plataforma por **cualquiera** de los dos criterios; el rol `root` se excluye **aunque el rol esté borrado** (el join a `roles` no filtra `role_deleted_at`, a propósito: más estricto).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_history"`
Expected: PASS — 2 pruebas.

- [ ] **Step 5: Regresión CA-16 — el SQL sin filtros nuevos no cambia**

Run (en orden): `NODE_ENV=test node ace test unit --files="evidence.service"` → 23 pasadas; `NODE_ENV=test node ace test unit --files="acceptance.service"` → 12; `NODE_ENV=test node ace test functional --files="consent_acceptance"` → 10.
Expected: los mismos números de la línea base, sin fallas nuevas.

- [ ] **Step 6: Commit**

```bash
git add app/modules/consent/evidence/evidence.repository.ts app/modules/consent/evidence/evidence.repository.mysql.ts tests/functional/platform_legal_acceptance_history.spec.ts
git commit -m "feat: agregar filtros types y excludePlatformAccounts al repositorio de evidencia"
```

---

### Task 2: Validador del historial (`params` + `query`)

**Files:**
- Create: `app/modules/consent/platform/validators/platform_tenant_legal_acceptances.validator.ts`
- Create: `tests/unit/validators/platform_tenant_legal_acceptances.spec.ts`

**Interfaces:**
- Consumes: `PLATFORM_ACCEPTANCES_MAX_LIMIT` (`platform_consent.constants.ts`, = 100).
- Produces (Task 4 los consume tal cual):
  - `platformTenantLegalAcceptancesParamsValidator` — VineJS compilado: `vine.object({ businessUnitPublicId: vine.string().trim().uuid() })`.
  - `platformTenantLegalAcceptancesQueryValidator` — VineJS compilado: `vine.object({ page: vine.number().min(1).withoutDecimals().optional(), perPage: vine.number().min(1).withoutDecimals().max(PLATFORM_ACCEPTANCES_MAX_LIMIT).optional() })` (**`min(1)`, no `positive()`**: ver el ruling del ledger; el snippet de §10 del spec se contradice con su propio CA-11).
  - `type TenantHistoryParamsPayload = Awaited<ReturnType<typeof platformTenantLegalAcceptancesParamsValidator.validate>>` → `{ businessUnitPublicId: string }`; idem `TenantHistoryQueryPayload` → `{ page?: number; perPage?: number }`.
  - Nota de uso: el validador de params se valida con `request.validateUsing(…, { data: request.params() })` (la ruta no lo hace sola); cualquier otra llave del query (`reveal`, etc.) se ignora — `page=0` rechaza ( VineJS `positive()` admite 0, así que usa `min(1)` como `list_platform_legal_acceptances.validator.ts:20-21`, que ya resolvió este caso para la C1).

- [ ] **Step 1: Escribir el test unitario**

Molde: `tests/unit/validators/legal_document_public_query.spec.ts` (helper `rejectedMessages` con `vineErrors.E_VALIDATION_ERROR`, asserts por `field`). Grupos:

- Params: UUID válido pasa (`5f1c2a31-9c6f-4b1e-8e2a-2f1c2a319c6f`); `'no-soy-uuid'` rechaza en `businessUnitPublicId`; ausente rechaza con `rule: 'required'` en `businessUnitPublicId`; UUID con espacios alrededor pasa tras el `trim` (`'  <uuid>  '` → devuelve el uuid recortado).
- Query: `{}` pasa vacío; `page: 2, perPage: 100` pasa; `page: 0` y `perPage: 101` rechazan en su campo; `'abc'` en ambos rechaza en su campo; `perPage: 100` exacto pasa (borde de Review Focus 5, lado validador).

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `NODE_ENV=test node ace test unit --files="platform_tenant_legal_acceptances"`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el validador**

Archivo nuevo en `app/modules/consent/platform/validators/` con docblock: igual molde que `list_platform_legal_acceptances.validator.ts`, dos `vine.compile` exportados, `page`/`perPage` con `min(1)` + `withoutDecimals()`, `perPage.max(PLATFORM_ACCEPTANCES_MAX_LIMIT)`. JSDoc: el `businessUnitPublicId` es el id público (UUID) de la ruta, nunca el id numérico.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `NODE_ENV=test node ace test unit --files="platform_tenant_legal_acceptances"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/modules/consent/platform/validators/platform_tenant_legal_acceptances.validator.ts tests/unit/validators/platform_tenant_legal_acceptances.spec.ts
git commit -m "feat: agregar validador del historial de aceptaciones por tenant"
```

---

### Task 3: Puerto, adaptador, DTO, errores/i18n y `getTenantHistory` del servicio

**Files:**
- Modify: `app/modules/consent/platform/platform_consent.repository.ts`
- Modify: `app/modules/consent/platform/platform_consent.repository.mysql.ts`
- Modify: `app/modules/consent/platform/dto/platform_legal_acceptance.dto.ts`
- Modify: `app/modules/consent/platform/platform_consent.service.ts`
- Modify: `app/exceptions/platform_consent_error.ts`
- Modify: `app/constants/platform_consent_error_codes.ts`
- Modify: `resources/langs/es.json` · `resources/langs/en.json`
- Create: `tests/unit/modules/consent/platform/tenant_history.spec.ts`

**Interfaces:**
- Consumes: `EvidenceService#getEvidence(filters: EvidenceFilters, pagination: { page: number; perPage: number }, revealAllowed: boolean): Promise<EvidencePageDto>` y `EvidenceRowDto`/`EvidencePageMetaDto` (`app/modules/consent/evidence/dto/evidence.dto.ts`); `PLATFORM_ACCEPTANCE_DOCUMENT_TYPES` de las constantes; `ownerMembershipsQuery` (privado del adaptador); filtros de Task 1; validador de Task 2 no se usa aquí (es del controller).
- Produces (Task 4 consume el servicio y los errores; D2 consume el DTO):
  - En el puerto: `PlatformTenantRef = { businessUnitId: number; businessUnitPublicId: string; businessUnitName: string }` (exportado); `findBusinessUnitByPublicId(publicId: string): Promise<PlatformTenantRef | null>`; `findOwnerUserIds(businessUnitId: number): Promise<number[]>`.
  - En el DTO: `PlatformTenantLegalAcceptanceRowDto` con exactamente las 9 llaves del contrato (`userConsentId, userName, isOwner, documentType, version, acceptedAt, channel, ip, userAgent`); `PlatformTenantLegalAcceptancesResponseDto = { type: 'success'; tenant: { businessUnitPublicId: string; businessUnitName: string }; data: PlatformTenantLegalAcceptanceRowDto[]; meta: EvidencePageMetaDto }`; `toTenantLegalAcceptanceRow(row: EvidenceRowDto, ownerUserIds: ReadonlySet<number>): PlatformTenantLegalAcceptanceRowDto` — lista blanca, `isOwner = row.userId !== null && ownerUserIds.has(row.userId)`, `documentType: PlatformAcceptanceDocumentType`, `channel: UserConsentChannel`.
  - En el servicio: constructor `constructor(tenantService, repository, evidenceService: EvidenceService = new EvidenceService())`; `getTenantHistory(publicId: string, page: number, perPage: number): Promise<PlatformTenantLegalAcceptancesResponseDto>`.
  - Errores: `PlatformConsentErrorKey` agrega `'empresa-no-encontrada' | 'parametros-de-historial-invalidos'`; `PLATFORM_CONSENT_ERROR_CODES` agrega `TENANT_NOT_FOUND: 'CONSENT.PLATFORM.010'` e `INVALID_HISTORY_PARAMS: 'CONSENT.PLATFORM.011'`; `PLATFORM_CONSENT_ERROR_CODES_BY_KEY` mapea las tres keys (el `Record` no compila si falta una).

- [ ] **Step 1: Escribir el test unitario con dobles (falla)**

`tests/unit/modules/consent/platform/tenant_history.spec.ts`, molde de `tests/unit/modules/consent/platform/resolve_document_status.spec.ts` (japa, sin BD). Dobles: un objeto `repository` con `findBusinessUnitByPublicId`/`findOwnerUserIds` como stubs y un `evidenceService` con `getEvidence` espiado, inyectado con `as unknown as EvidenceService`. Pruebas:

1. **`publicId` inexistente** → `findBusinessUnitByPublicId` resuelve `null`; `getTenantHistory('…uuid…', 1, 20)` rechaza con `PlatformConsentError` de `key === 'empresa-no-encontrada'` y el doble de `getEvidence` registra **cero** llamadas (SEC-D-01; es la mitad unitaria de CA-2).
2. **Feliz** → `findBusinessUnitByPublicId` resuelve `{ businessUnitId: 7, businessUnitPublicId: 'uuid-a', businessUnitName: 'Acme' }`; `findOwnerUserIds` resuelve `[11]`; `getEvidence` resuelve una página con dos `EvidenceRowDto` (una con `userId: 11`, otra con `userId: 12`; `ip/userAgent` ya enmascarados por el servicio real). Aserta: `getEvidence` fue llamado con `{ businessUnitId: 7, types: ['terms_conditions', 'privacy_notice'], excludePlatformAccounts: true }`, paginación `{ page: 2, perPage: 50 }` y **tercer argumento `false`**; la respuesta es `{ type: 'success', tenant: { businessUnitPublicId: 'uuid-a', businessUnitName: 'Acme' }, data: [...], meta }` con `isOwner true` solo en la fila del 11 y cada fila con exactamente las 9 llaves (`Object.keys` con `deepEqual` contra lista cerrada).
3. **`businessUnitId` inválido** → `findBusinessUnitByPublicId` resuelve `{ businessUnitId: 0, … }` → rechaza con `Error` interno (no `PlatformConsentError`) y `getEvidence` registra cero llamadas.
4. **DTO por lista blanca** → una `EvidenceRowDto` con `userId: 99`, correo/ids internos en las llaves que trae (`employeeId`, `legalDocumentId`, `businessUnitPublicIds`…) → `toTenantLegalAcceptanceRow(row, new Set([99]))` devuelve solo las 9 llaves del contrato y `isOwner === true`; con `new Set([])` → `isOwner === false`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `NODE_ENV=test node ace test unit --files="tenant_history"`
Expected: FAIL — `findBusinessUnitByPublicId` no existe en el puerto; `getTenantHistory` no existe.

- [ ] **Step 3: Implementar puerto y adaptador**

En `platform_consent.repository.ts`: exporta `PlatformTenantRef` y agrega los dos métodos al puerto con JSDoc (el 404 y la aserción viven en el servicio; el puerto no duplica la barrera).
En `platform_consent.repository.mysql.ts`:
- `findBusinessUnitByPublicId`: espejo de la resolución de `PlatformTenantService#getTenantDetail` (`app/services/platform_tenant_service.ts:335-339`): `db.from('business_units as bu').whereNull('bu.business_unit_deleted_at').where('bu.business_unit_public_id', publicId).select('bu.business_unit_id as businessUnitId', 'bu.business_unit_public_id as businessUnitPublicId', 'bu.business_unit_name as businessUnitName').first()` → `null` o mapeado a `PlatformTenantRef` (número en `businessUnitId`).
- `findOwnerUserIds(businessUnitId)`: envuelve `this.ownerMembershipsQuery([businessUnitId])` con `db.from(query.as('om')).select('om.userId')` → ids numéricos distintos. DA-1 vive solo en `ownerMembershipsQuery`: **no** se reescribe su regla.

- [ ] **Step 4: Implementar DTO, errores e i18n**

En `dto/platform_legal_acceptance.dto.ts` agrega las dos interfaces y `toTenantLegalAcceptanceRow` por lista blanca (imports: `EvidenceRowDto`/`EvidencePageMetaDto` del módulo evidence, `PlatformAcceptanceDocumentType` de constantes, `UserConsentChannel` de `#models/user_consent`). Sin correo, `userId`, `employeeId`, `legalDocumentId`, empresas ajenas ni campos del canal físico.
En `platform_consent_error.ts` amplía la unión de `PlatformConsentErrorKey`; en `platform_consent_error_codes.ts` agrega `TENANT_NOT_FOUND: 'CONSENT.PLATFORM.010'` e `INVALID_HISTORY_PARAMS: 'CONSENT.PLATFORM.011'` (bloque D: 010-019; 012+ reservados para D2) y el mapeo por key.
En `resources/langs/es.json` y `en.json`, dentro de `platformLegalAcceptances.errors` (es.json ~línea 2879), agrega como hermanas de `filtros-de-aceptaciones-invalidos` los dos bloques **verbatim** de §10:
- ES: `empresa-no-encontrada` → title `"Empresa no encontrada"`, detail `"No existe una empresa activa con ese identificador."`; `parametros-de-historial-invalidos` → title `"Parámetros de historial inválidos"`, detail `"Revisa el identificador de la empresa (UUID), la página y el tamaño de página (máximo 100)."`.
- EN: `"Company not found"` / `"There is no active company with that identifier."`; `"Invalid history parameters"` / `"Check the company identifier (UUID), the page and the page size (maximum 100)."`.

- [ ] **Step 5: Implementar `getTenantHistory` en el servicio**

Constructor agrega `private readonly evidenceService: EvidenceService = new EvidenceService()` (mismo patrón de `evidence.service.ts:36-42`). Método con la secuencia fija (una sola barrera, §14):

```ts
async getTenantHistory(publicId: string, page: number, perPage: number) {
  const tenant = await this.repository.findBusinessUnitByPublicId(publicId)
  if (tenant === null) {
    throw new PlatformConsentError('empresa-no-encontrada')
  }
  this.assertPositiveBusinessUnitId(tenant.businessUnitId)

  const evidencePage = await this.evidenceService.getEvidence(
    {
      businessUnitId: tenant.businessUnitId,
      types: [...PLATFORM_ACCEPTANCE_DOCUMENT_TYPES],
      excludePlatformAccounts: true,
    },
    { page, perPage },
    false // SEC-D-04: fijo; nada del caller lo cambia
  )
  const owners = new Set(await this.repository.findOwnerUserIds(tenant.businessUnitId))

  return {
    type: 'success' as const,
    tenant: {
      businessUnitPublicId: tenant.businessUnitPublicId,
      businessUnitName: tenant.businessUnitName,
    },
    data: evidencePage.data.map((row) => toTenantLegalAcceptanceRow(row, owners)),
    meta: evidencePage.meta,
  }
}

/** Aserción previa a cualquier consulta de evidencia (SEC-D-01). */
private assertPositiveBusinessUnitId(businessUnitId: number): void {
  if (!Number.isSafeInteger(businessUnitId) || businessUnitId <= 0) {
    throw new Error('Identificador interno de empresa inválido')
  }
}
```

El `Error` interno llega al manejador global como 500 y **nunca** se consulta evidencia (§6).

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `NODE_ENV=test node ace test unit --files="tenant_history"`
Expected: PASS — 4 pruebas.

- [ ] **Step 7: Regresión de unidades del sub-slice**

Run: `NODE_ENV=test node ace test unit --files="resolve_document_status"` → 4 pasadas; `NODE_ENV=test node ace test unit --files="constants/"` → en verde (guardrail de catálogo; los códigos son solo constantes, no catálogo).
Expected: sin fallas nuevas.

- [ ] **Step 8: Commit**

```bash
git add app/modules/consent/platform/platform_consent.repository.ts app/modules/consent/platform/platform_consent.repository.mysql.ts app/modules/consent/platform/dto/platform_legal_acceptance.dto.ts app/modules/consent/platform/platform_consent.service.ts app/exceptions/platform_consent_error.ts app/constants/platform_consent_error_codes.ts resources/langs/es.json resources/langs/en.json tests/unit/modules/consent/platform/tenant_history.spec.ts
git commit -m "feat: agregar getTenantHistory con resolucion de tenant y exclusion de cuentas de plataforma"
```

---

### Task 4: Ruta `tenantHistory`, controller y contrato funcional del expediente

**Files:**
- Modify: `start/routes/platform_legal_acceptance_routes.ts`
- Modify: `tests/unit/routes/platform_legal_acceptance_routes.spec.ts`
- Modify: `app/modules/consent/platform/platform_consent.controller.ts`
- Modify: `tests/functional/platform_legal_acceptance_history.spec.ts` (agrega el molde de mundo y los grupos HTTP)

**Interfaces:**
- Consumes: `getTenantHistory` (Task 3), validadores (Task 2), errores/códigos/i18n (Task 3), `PLATFORM_ACCEPTANCES_DEFAULT_LIMIT` (= 20).
- Produces: el contrato §10 completo y congelado: `GET /api/platform/tenants/:businessUnitPublicId/legal-acceptances?page=&perPage=` dentro del único grupo `auth({ guards: ['api'] })` + `platformAdmin()`; 200 `Cache-Control: no-store`; 404 `empresa-no-encontrada`/`CONSENT.PLATFORM.010`; 422 `parametros-de-historial-invalidos`/`CONSENT.PLATFORM.011`. Las Tasks 5-9 del landlord consumen exactamente esta forma.

- [ ] **Step 1: Extender el test de tabla de rutas (CA-15) y verificar que falla**

En `tests/unit/routes/platform_legal_acceptance_routes.spec.ts` (hoy 5 pasadas), dentro del grupo existente agrega un test que afirme `assert.include(content, "router.get('/tenants/:businessUnitPublicId/legal-acceptances', '#modules/consent/platform/platform_consent.controller.tenantHistory')")` **y** que la ruta aparece después del índice de `router.group(` (el test "ninguna ruta fuera del grupo" ya protege el orden; este no lo repite, solo amarra handler y path).

Run: `NODE_ENV=test node ace test unit --files="platform_legal_acceptance_routes"`
Expected: FAIL — la ruta no está declarada (4 pasadas de 6).

- [ ] **Step 2: Declarar la ruta**

En `start/routes/platform_legal_acceptance_routes.ts`, dentro del único grupo, después de `/legal-acceptances`:

```ts
router.get(
  '/tenants/:businessUnitPublicId/legal-acceptances',
  '#modules/consent/platform/platform_consent.controller.tenantHistory'
)
```

Actualiza el docblock del archivo (agrega la línea del GET del historial). No hay colisión: ningún otro archivo de `start/routes` declara `/tenants/:param/legal-acceptances`.

Run: `NODE_ENV=test node ace test unit --files="platform_legal_acceptance_routes"`
Expected: PASS — 6 pruebas.

- [ ] **Step 3: Escribir el molde del mundo y los grupos HTTP del spec funcional (fallan)**

En `tests/functional/platform_legal_acceptance_history.spec.ts` agrega, después del grupo de la Task 1, el molde de mundo **copiado de** `tests/functional/platform_legal_acceptances.spec.ts:71-373` (adaptando nombres a esta HU: `QA-LAH`): `World` (stamp + ids creados + `previousCurrentIds`), `createPlatformAdmin`, `platformToken` (login `POST /api/platform/auth/login`; `client.loginAs` **no** emite `origin = 'platform'`), `backofficeToken` (`POST /api/auth/login`), `createTenant`, `createAccount`, `addMembership`, `createTenantOwner`, `createTenantRole`, `findRootRole`, `markDeleted`, `createBiometricDocument`, `publishDocument`, `acceptDocument` — este último **ampliado** con `ip: string | null` y `userAgent: string | null` (CA-5 necesita capturados) — y el par `group.each.setup`/`group.each.teardown` con la misma restauración del catálogo de vigentes. Constantes de contrato:

```ts
const HISTORY_URL = (publicId: string) => `/api/platform/tenants/${publicId}/legal-acceptances`
const EXPECTED_ROW_KEYS = ['userConsentId', 'userName', 'isOwner', 'documentType', 'version', 'acceptedAt', 'channel', 'ip', 'userAgent']
const PLATFORM_FORBIDDEN_BODY = { title: 'Acceso restringido a plataforma', detail: 'Esta sección es exclusiva de administradores de plataforma.', key: 'AUTH.PLATFORM.FORBIDDEN' }
const TOKEN_MISSING_BODY = { type: 'warning', title: 'Token requerido', detail: 'No se envió un access token válido', message: 'No se envió un access token válido', key: 'AUTH.TOKEN.MISSING', data: { refreshable: false } }
const NOT_FOUND_BODY = { type: 'error', title: 'Empresa no encontrada', key: 'empresa-no-encontrada', code: 'CONSENT.PLATFORM.010' }
const INVALID_PARAMS_BODY = { type: 'error', title: 'Parámetros de historial inválidos', key: 'parametros-de-historial-invalidos', code: 'CONSENT.PLATFORM.011' }
```

Un solo `test.group('GET /api/platform/tenants/:businessUnitPublicId/legal-acceptances — contrato del expediente')` con las pruebas CA-1 a CA-14 **más** las de Review Focus, siguiendo los Dado/Cuando/Entonces de §5 (los cuerpos se copian de las constantes de arriba; el `detail` i18n no se aserta literal en 404/422 — se aserten title/key/code y la ausencia de `data`). Cada prueba con su párrafo `Objetivo:` en comentario, como la suite de la C1:

- CA-1: empresa A con 3 aceptaciones (T&C + aviso) de dos personas, una owner de A → 200 con `Cache-Control: no-store`, `tenant = { businessUnitPublicId, businessUnitName }` de A, `data` orden `acceptedAt` descendente, `isOwner = true` solo en las filas del owner, `meta = { total: 3, perPage: 20, currentPage: 1, lastPage: 1 }`.
- CA-2: UUID inexistente y `publicId` de empresa con `business_unit_deleted_at` (`markDeleted`) → 404 con `NOT_FOUND_BODY` y **sin** `data` ni filas de ninguna empresa.
- CA-3: empresas A y B con aceptaciones → en el historial de A ninguna `userConsentId` de B y todas las filas de personas de A.
- CA-4: persona de A con aceptaciones de `terms_conditions`, `privacy_notice` y `biometric_consent` (documento creado con `createBiometricDocument`) → la biométrica no aparece y `meta.total` no la cuenta.
- CA-5: aceptaciones con `ip: '189.203.10.4'` y user agent capturado → `ip === '•••••'` y `userAgent === '•••••'`, **también** con `?reveal=true` (se ignora); una aceptación con `ip: null` trae `ip: null`.
- CA-6: persona de A que también pertenece a B → cada fila con **exactamente** `EXPECTED_ROW_KEYS` (`deepEqual` de `Object.keys(...).sort()`); ninguna fila contiene el nombre ni el `publicId` de B ni correo.
- CA-7: usuario owner de A y con rol `empleado` en B (`createTenantRole(tenantB, 'empleado')`) → aparece en ambos historiales; `isOwner` `true` en A y `false` en B.
- CA-8: tres cuentas miembro de A que aceptaron T&C — (a) `isPlatformAdmin = true` con membresía `roleId: null`; (b) `isPlatformAdmin = false`, membresía `role_id NULL` y `users.role_id` = rol `root` (de `findRootRole()`); (c) `isPlatformAdmin = false` con `business_unit_users.role_id` = rol `root` (rol de la empresa creado con slug `root`) → ninguna de las tres aparece y `meta.total` no las cuenta; la aceptación de un owner con `isPlatformAdmin = false` sí aparece.
- CA-9: persona de A que aceptó y cuya membresía tiene `business_unit_user_deleted_at` (`markDeleted('business_unit_users', 'business_unit_user_id', …, 'business_unit_user_deleted_at')`) → su aceptación no aparece (hueco heredado del BO; el test lo fija).
- CA-10: empresa C sin aceptaciones → 200 con `data: []`, `meta.total = 0`, `meta.lastPage = 1`, `tenant` de C.
- CA-11: `perPage=101`, `page=0`, `perPage=abc` y `businessUnitPublicId` no-UUID (e.g. `no-soy-uuid`) → 422 con `INVALID_PARAMS_BODY`. Con 25 aceptaciones (una misma persona sobre 25 versiones propias de T&C — la tabla tiene `UNIQUE (user_id, legal_document_id)`, por eso 25 documentos) y `page=2&perPage=20` → 5 filas y `lastPage = 2`; `page=9` → `data: []` con el `meta` real. **Borde (Review Focus 5):** `perPage=100` exacto pasa.
- CA-12: sin token → 401 con `TOKEN_MISSING_BODY`.
- CA-13: usuario con rol `owner` de A y token del BO → 403 con exactamente `PLATFORM_FORBIDDEN_BODY` (aserta `deepEqual` del cuerpo completo: tres llaves, sin `code`).
- CA-14: usuario con `isPlatformAdmin = true` y token del BO → el mismo 403 exacto.
- Review Focus 2: empresa inactiva (`business_unit_active: 0` vía `markDeleted`-style update o create con 0) con aceptaciones → 200 con su historial visible.
- Review Focus 3: **antes de escribir el assert**, explora qué hace hoy `getEvidence` con una persona de A con `user_deleted_at` y una aceptación digital propia (consulta el SQL de `baseQuery`: el `whereHas('user', …)` con el modelo `User` de soft-delete). Escribe la prueba que fija ese comportamiento heredado (lo esperable: la fila no aparece, porque el ancla por usuario desaparece; si tu exploración muestra otra cosa, fija lo que realmente pase) con comentario citando §11 "hueco heredado, igual que el BO".

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_history"`
Expected: FAIL — el controller no tiene `tenantHistory` (la ruta resuelve a un método inexistente; los tests HTTP truenan o dan 500).

- [ ] **Step 4: Implementar `tenantHistory` en el controller**

En `platform_consent.controller.ts` agrega el método con JSDoc `@swagger` + bloque `@index` espejo del de `index` (tags `Platform · Legal Acceptances`, `summary` "Historial de aceptaciones de Términos y Aviso de una empresa", `description` en español que declara: historial paginado de todas las personas de la empresa, IP y user agent **siempre** enmascarados, sin revelado; `@operationId getTenantLegalAcceptanceHistory`; `@paramQuery page`, `@paramQuery perPage` con máximo 100; `@responseBody` 200 con el ejemplo exacto de §10, 401/403/404/422 con los cuerpos del contrato). Cuerpo del método:

```ts
async tenantHistory(ctx: HttpContext, service: PlatformConsentService = new PlatformConsentService()) {
  const { request, response } = ctx
  try {
    const routeParams = await this.validateHistoryParams(ctx)   // E_VALIDATION_ERROR → PlatformConsentError('parametros-de-historial-invalidos')
    const query = await this.validateHistoryQuery(ctx)         // idem
    const result = await service.getTenantHistory(
      routeParams.businessUnitPublicId,
      query.page ?? 1,
      query.perPage ?? PLATFORM_ACCEPTANCES_DEFAULT_LIMIT
    )
    return response.status(200).header('Cache-Control', 'no-store').json(result)
  } catch (error) {
    return this.domainError(ctx, error)
  }
}
```

Privados: `validateHistoryParams({ request }: HttpContext)` usa `request.validateUsing(platformTenantLegalAcceptancesParamsValidator, { data: request.params() })` con el mismo `try/catch` → `PlatformConsentError('parametros-de-historial-invalidos')` que `validateQuery` (reutiliza `isValidationError`); `validateHistoryQuery` con el validador de query. Amplía `domainError` para ramificar el estado: `empresa-no-encontrada` → 404, cualquier otra key → 422 (el cuerpo se arma igual con `platformLegalAcceptances.errors.<key>.title/detail` y el código por key).

- [ ] **Step 5: Correr el spec funcional y verificar que pasa**

Run: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_history"`
Expected: PASS — el grupo de la Task 1 (2) + el grupo del contrato (CA-1 a CA-14 + Review Focus) en verde.

- [ ] **Step 6: Regresión completa del API**

Run: `NODE_ENV=test node ace test unit --files="platform_legal_acceptance_routes"` → 6; `NODE_ENV=test node ace test unit --files="evidence.service"` → 23; `NODE_ENV=test node ace test functional --files="consent_acceptance"` → 10; `NODE_ENV=test node ace test functional --files="platform_legal_acceptances"` → 16; `NODE_ENV=test node ace test functional --files="physical_consent"` → **6 pasadas y los mismos 5 errores de setup heredados del seeder QA, ninguno más**.
Expected: líneas base intactas.

- [ ] **Step 7: Commit**

```bash
git add start/routes/platform_legal_acceptance_routes.ts tests/unit/routes/platform_legal_acceptance_routes.spec.ts app/modules/consent/platform/platform_consent.controller.ts tests/functional/platform_legal_acceptance_history.spec.ts
git commit -m "feat: exponer el historial de aceptaciones de un tenant para la consola de plataforma"
```

---

# Repo 2: `valanserh-landlord`

Rama de trabajo: `feature/USRH1790610965466-historial-aceptaciones-tenant` (ya existe y contiene la página de la lista). Rutas escritas relativas a `/Users/noeabelvargaslopez/Documents/projects/valanserh-landlord`.

### Task 5: Dominio — tipos, interfaces, constantes y helpers

**Files:**
- Create: `app/pages/legal-acceptances/[publicId]/domain/tenant-legal-acceptances.type.ts`
- Create: `app/pages/legal-acceptances/[publicId]/domain/tenant-legal-acceptances.interface.ts`
- Create: `app/pages/legal-acceptances/[publicId]/domain/tenant-legal-acceptances.const.ts`
- Create: `app/pages/legal-acceptances/[publicId]/domain/tenant-legal-acceptances.helpers.ts`
- Create: `app/pages/legal-acceptances/[publicId]/domain/tenant-legal-acceptances.helpers.spec.ts`

**Interfaces:**
- Consumes: nada del resto del slice nuevo; el contrato §10 de la Task 4 del API.
- Produces (Tasks 6-8 los consumen tal cual):
  - `type TenantLegalAcceptanceDocumentType = 'terms_conditions' | 'privacy_notice'`; `type TenantLegalAcceptanceChannel = 'digital' | 'physical'`.
  - `interface TenantLegalAcceptanceRow { userConsentId: number; userName: string; isOwner: boolean; documentType: TenantLegalAcceptanceDocumentType; version: string; acceptedAt: string | null; channel: TenantLegalAcceptanceChannel; ip: string | null; userAgent: string | null }`.
  - `interface TenantLegalAcceptancesTenant { businessUnitPublicId: string; businessUnitName: string }`; `interface TenantLegalAcceptancesMeta { total: number; perPage: number; currentPage: number; lastPage: number }`.
  - Crudas (`string` sin validar, se validan al mapear): `TenantLegalAcceptanceRowRaw` (mismas llaves con `documentType: string; channel: string; acceptedAt: string | null; ip: string | null; userAgent: string | null`), `GetTenantLegalAcceptancesApiResponse { type: string; tenant: { businessUnitPublicId: string; businessUnitName: string }; data: TenantLegalAcceptanceRowRaw[]; meta: TenantLegalAcceptancesMeta }`, `GetTenantLegalAcceptancesParams { apiFetch: <T>(url: string, options?: FetchOptions<'json'>) => Promise<T>; publicId: string; page: number; perPage: number }`, `TenantLegalAcceptancesResult { tenant: TenantLegalAcceptancesTenant; rows: TenantLegalAcceptanceRow[]; meta: TenantLegalAcceptancesMeta }`, `UseTenantLegalAcceptancesMessages { errorLoading: string }`.
  - `const TENANT_LEGAL_ACCEPTANCES_PAGE_SIZE = 20`; `const TENANT_LEGAL_ACCEPTANCE_EMPTY_VALUE = '—'`; `const TENANT_LEGAL_ACCEPTANCE_DOCUMENT_LABEL_KEYS: Record<TenantLegalAcceptanceDocumentType, string> = { terms_conditions: 'tla_doc_terms_conditions', privacy_notice: 'tla_doc_privacy_notice' }`; `const TENANT_LEGAL_ACCEPTANCE_CHANNEL_LABEL_KEYS: Record<TenantLegalAcceptanceChannel, string> = { digital: 'tla_channel_digital', physical: 'tla_channel_physical' }`.
  - `parseTenantPublicId(value: unknown): string | null` — acepta `string | string[]` de `route.params`, valida UUID (regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), devuelve el uuid o `null`.
  - `formatAcceptedAtInstant(iso: string | null): string | null` — `null → null`; si no: `new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))`.
  - `displayMaskedValue(value: string | null): string` — `null → '—'`, si no el valor tal cual.

- [ ] **Step 1: Escribir el test que falla**

`tenant-legal-acceptances.helpers.spec.ts` (Vitest, molde `legal-acceptances.helpers.spec.ts`):

```ts
import { describe, it, expect } from 'vitest'
import {
  parseTenantPublicId,
  formatAcceptedAtInstant,
  displayMaskedValue
} from './tenant-legal-acceptances.helpers'

describe('parseTenantPublicId', () => {
  it('acepta un UUID y lo devuelve recortado', () => {
    expect(parseTenantPublicId('  5f1c2a31-9c6f-4b1e-8e2a-2f1c2a319c6f  '))
      .toBe('5f1c2a31-9c6f-4b1e-8e2a-2f1c2a319c6f')
  })
  it('devuelve null para algo que no es uuid', () => {
    expect(parseTenantPublicId('no-soy-uuid')).toBeNull()
  })
  it('devuelve null para arreglo vacío de params', () => {
    expect(parseTenantPublicId([])).toBeNull()
  })
})

describe('formatAcceptedAtInstant', () => {
  it('usa el día civil de CDMX aunque el instante UTC ya es del día siguiente (CA-19)', () => {
    expect(formatAcceptedAtInstant('2026-09-03T05:30:00.000Z')).toBe('2 sep 2026, 11:30 p.m.')
  })
  it('formatea un instante con offset de CDMX como su hora natural', () => {
    expect(formatAcceptedAtInstant('2026-09-02T10:00:00.000-06:00')).toBe('2 sep 2026, 10:00 a.m.')
  })
  it('devuelve null cuando no hay instante', () => {
    expect(formatAcceptedAtInstant(null)).toBeNull()
  })
})

describe('displayMaskedValue', () => {
  it('devuelve el valor enmascarado tal cual', () => {
    expect(displayMaskedValue('•••••')).toBe('•••••')
  })
  it('devuelve un guion cuando el valor es null', () => {
    expect(displayMaskedValue(null)).toBe('—')
  })
})
```

El assert de la primera fecha de CA-19 está **medido** en el Node de este repo (v26.7.0): `Intl.DateTimeFormat('es-MX', …)` produce `2 sep 2026, 11:30 p.m.` (idéntico al Node 24 del spec). Si vitest lo corre con ICU distinta y el texto diferiera, ajusta **solo la cadena esperada** a lo que Node produzca — la regla (CDMX, día 2 no 3) no se toca.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test app/pages/legal-acceptances/[publicId]/domain/tenant-legal-acceptances.helpers.spec.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar los cuatro archivos de dominio**

Tipos e interfaces con la forma exacta del bloque *Produces* (JSDoc en español con `@param`/`@returns`; `documentType`/`channel` como `string` en las crudas). Constantes en SCREAMING_SNAKE_CASE; los dos `Record` importan los tipos de `./tenant-legal-acceptances.type`. Helpers puros como en el bloque *Produces*, con JSDoc.

- [ ] **Step 4: Correr el test y verificar que pasa; convenciones**

Run: `pnpm test app/pages/legal-acceptances/[publicId]/domain/tenant-legal-acceptances.helpers.spec.ts` → PASS (8 pruebas).
Run: `pnpm check:conventions` → `Convenciones OK: naming, sufijos de domain y tests colocados.`

- [ ] **Step 5: Commit**

```bash
git add "app/pages/legal-acceptances/[publicId]/domain"
git commit -m "feat(legal-acceptances): agrega el dominio del historial por tenant

Refs: USRH1790610965466"
```

---

### Task 6: Repositorio `getTenantLegalAcceptances`

**Files:**
- Create: `app/pages/legal-acceptances/[publicId]/infrastructure/tenant-legal-acceptances.repository.ts`
- Create: `app/pages/legal-acceptances/[publicId]/infrastructure/tenant-legal-acceptances.repository.spec.ts`

**Interfaces:**
- Consumes: tipos crudos y de dominio de Task 5.
- Produces: `getTenantLegalAcceptances(params: GetTenantLegalAcceptancesParams): Promise<TenantLegalAcceptancesResult>` — siempre manda `query: { page, perPage }` (ambos presentes); mapea por lista blanca; **rechaza** la respuesta si `documentType` o `channel` están fuera de su unión (CA-23) o si `version`/`userName`/`acceptedAt`/`ip`/`userAgent` no son `string | null`, y `userConsentId`/`isOwner` no son número/booleano.

- [ ] **Step 1: Escribir el test que falla**

Molde `legal-acceptances.repository.spec.ts` (mock plano de `apiFetch` con `vi.fn()`). Fila cruda con llaves extra a propósito (`email`, `userId`, `legalDocumentId`). Pruebas:

1. Llama `apiFetch('/platform/tenants/<uuid>/legal-acceptances', { query: { page: 2, perPage: 20 } })` y devuelve `tenant`/`meta` tal cual.
2. Mapea por lista blanca: la fila mapeada tiene exactamente las 9 llaves del dominio y descarta `email`/`userId`/`legalDocumentId`.
3. `documentType: 'biometric_consent'` → `rejects.toThrow()`.
4. `channel: 'fax'` → `rejects.toThrow()`.
5. **Review Focus 4:** `acceptedAt: 12345` (número) → `rejects.toThrow()`.
6. `ip: null` y `userAgent: null` pasen tal cual a la fila.
7. `apiFetch` rechaza → propaga el error.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test "app/pages/legal-acceptances/[publicId]/infrastructure/tenant-legal-acceptances.repository.spec.ts"`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el repositorio**

Mismo molde que `legal-acceptances.repository.ts`: `const DOCUMENT_TYPES: TenantLegalAcceptanceDocumentType[] = ['terms_conditions', 'privacy_notice']`, `const CHANNELS: TenantLegalAcceptanceChannel[] = ['digital', 'physical']`; validadores `toDocumentType`/`toChannel` que `throw new Error('tenant-legal-acceptances: <campo> fuera de contrato')` (molde `toDocumentStatus`); un guard `asNullableString(value: unknown, field: string): string | null` para los campos `string | null` que lanza con lo que no sea `string` ni `null`; mapeo por lista blanca; `return { tenant: response.tenant, rows: response.data.map(mapRow), meta: response.meta }`. JSDoc con `@throws`.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test "app/pages/legal-acceptances/[publicId]/infrastructure/tenant-legal-acceptances.repository.spec.ts"`
Expected: PASS (7 pruebas).

- [ ] **Step 5: Commit**

```bash
git add "app/pages/legal-acceptances/[publicId]/infrastructure"
git commit -m "feat(legal-acceptances): agrega el repositorio del historial por tenant

Refs: USRH1790610965466"
```

---

### Task 7: Composable `useTenantLegalAcceptances`

**Files:**
- Create: `app/pages/legal-acceptances/[publicId]/application/use-tenant-legal-acceptances.ts`
- Create: `app/pages/legal-acceptances/[publicId]/application/use-tenant-legal-acceptances.spec.ts`

**Interfaces:**
- Consumes: `getTenantLegalAcceptances` (Task 6), `TENANT_LEGAL_ACCEPTANCES_PAGE_SIZE` (Task 5).
- Produces:
  - `interface UseTenantLegalAcceptancesDeps { apiFetch: <T>(url: string, options?: FetchOptions<'json'>) => Promise<T>; messages: UseTenantLegalAcceptancesMessages }`
  - `interface UseTenantLegalAcceptancesReturn { tenant: Ref<TenantLegalAcceptancesTenant | null>; rows: Ref<TenantLegalAcceptanceRow[]>; total: Ref<number>; page: Ref<number>; perPage: Ref<number>; lastPage: Ref<number>; loading: Ref<boolean>; hasLoadedOnce: Ref<boolean>; hasError: Ref<boolean>; notFound: Ref<boolean>; errorMessage: Ref<string>; load: (publicId: string | null, page: number) => Promise<void> }`
  - `useTenantLegalAcceptances(deps): UseTenantLegalAcceptancesReturn` — `publicId null` → `notFound = true` **sin llamar al API**; error con `data.code === 'CONSENT.PLATFORM.010'` → `notFound` (molde por `code` de `use-alliance-account.ts`, nunca por status crudo); otro error → `hasError` con `extractApiErrorText` local (`candidate?.data?.detail ?? candidate?.data?.title ?? null`) o `messages.errorLoading`; contador de petición para descartar respuestas viejas; **nunca relanza**.

- [ ] **Step 1: Escribir el test que falla**

Molde `use-legal-acceptances.spec.ts` (`vi.spyOn(repo, 'getTenantLegalAcceptances')`, `makeDeps`). Pruebas:

1. Carga feliz: `load('uuid-1', 1)` → `tenant`, `rows` (1 fila), `total/page/perPage/lastPage` desde `meta`; `notFound`/`hasError` false.
2. `load(null, 1)` → `notFound === true`, `rows` vacíos y el espía **no fue llamado** (CA-20).
3. Error con `{ data: { code: 'CONSENT.PLATFORM.010' } }` → `notFound === true`, `hasError === false`, filas vacías (CA-20).
4. Error 403 con `{ data: { detail: 'Esta sección es exclusiva de administradores de plataforma.' } }` → `hasError === true`, `errorMessage` con ese detail (CA-22).
5. Error sin cuerpo (`new Error('network')`) → `errorMessage` con el genérico de `messages.errorLoading` (CA-22).
6. Respuesta vieja descartada: dos `load` en vuelo, la primera resuelve después → gana la segunda (mismo molde de `use-legal-acceptances.spec.ts`, CA-24).
7. `load('uuid-1', 3)` pide `page: 3, perPage: 20` (perPage siempre 20, sin parámetro del usuario).
8. Vacío: resultado con `rows: []`, `total: 0` → refs actualizados sin `hasError` (CA-21).

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm test "app/pages/legal-acceptances/[publicId]/application/use-tenant-legal-acceptances.spec.ts"`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el composable**

Fusión de los moldes `use-legal-acceptances.ts` (requestId, finally) y `use-alliance-account.ts` (notFound por `code`, `publicId null` sin consulta). `extractApiErrorCode` local (`candidate?.data?.code ?? null`). En catch: `console.error` con **solo** el status HTTP extraído (nunca el objeto de error con la URL); ramifica por código antes de tocar `hasError`; en error vacía `rows`/`total` y limpia `tenant`. En `load`, `loading/hasError/notFound/errorMessage` se resetean igual que los moldes; `hasLoadedOnce` solo en `finally` de la petición propia.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm test "app/pages/legal-acceptances/[publicId]/application/use-tenant-legal-acceptances.spec.ts"`
Expected: PASS (8 pruebas).

- [ ] **Step 5: Commit**

```bash
git add "app/pages/legal-acceptances/[publicId]/application"
git commit -m "feat(legal-acceptances): agrega el caso de uso del historial por tenant

Refs: USRH1790610965466"
```

---

### Task 8: Página `/legal-acceptances/[publicId]` y enlace "Ver historial" en la lista

**Files:**
- Create: `app/pages/legal-acceptances/[publicId]/domain/locales/tenant-legal-acceptances.es.json`
- Create: `app/pages/legal-acceptances/[publicId]/script.ts`
- Create: `app/pages/legal-acceptances/[publicId]/index.vue`
- Create: `app/pages/legal-acceptances/[publicId]/style.scss`
- Modify: `app/pages/legal-acceptances/index.vue` (columna "Historial")
- Modify: `app/pages/legal-acceptances/domain/locales/legal-acceptances.es.json` (`la_col_history`, `la_btn_view_history`)

**Interfaces:**
- Consumes: Tasks 5-7; `useApi()` de `~/resources/scripts/services/api`; moldes `app/pages/alliances/[allianceId]/index.vue` (estados `loading`/`notFound`/`hasError`, `goBack`) y `app/pages/tenants/[publicId]/script.ts:406-409` (breadcrumb de dos niveles con `url`).
- Produces: la ruta `/legal-acceptances/:publicId` (Nuxt la registra por el `.vue`); el botón "Ver historial" de la lista (CA-17).

- [ ] **Step 1: Crear el locale del slice**

`tenant-legal-acceptances.es.json` con **exactamente** estas claves y valores (prefijo `tla_`, §12):

`tla_breadcrumb_root` "Aceptaciones legales" · `tla_subtitle` "Historial de aceptaciones de términos y aviso de privacidad" · `tla_col_person` "Persona" · `tla_col_document` "Documento" · `tla_col_version` "Versión" · `tla_col_accepted_at` "Aceptada" · `tla_col_channel` "Canal" · `tla_tag_owner` "Propietario" · `tla_doc_terms_conditions` "Términos y condiciones" · `tla_doc_privacy_notice` "Aviso de privacidad" · `tla_channel_digital` "En línea" · `tla_channel_physical` "En papel" · `tla_version_value` "v{version}" · `tla_label_ip` "Dirección IP" · `tla_label_user_agent` "Agente de usuario" · `tla_empty` "Esta empresa no tiene aceptaciones registradas." · `tla_not_found` "No encontramos esta empresa." · `tla_btn_back` "Volver a la lista" · `tla_btn_retry` "Reintentar" · `tla_error_loading` "No fue posible cargar el historial de aceptaciones."

- [ ] **Step 2: Implementar el orquestador `script.ts`**

`defineComponent({ name: 'tenantLegalAcceptancesPage', setup() { … } })`, molde `alliances/[allianceId]/script.ts` + `tenants/[publicId]/script.ts`:
- `i18n.mergeLocaleMessage('es', tenantLegalAcceptancesEs)` antes de leer claves; `const apiFetch = useApi()`.
- `const route = useRoute()`; `const publicId = parseTenantPublicId(route.params.publicId)`; `const catalog = useTenantLegalAcceptances({ apiFetch, messages: { errorLoading: i18n.t('tla_error_loading') } })`.
- `onMounted(() => { void catalog.load(publicId, 1) })`.
- `onPage = (event: { page: number }) => { void catalog.load(publicId, event.page + 1) }` (CA-24).
- `goBack = () => { void navigateTo('/legal-acceptances') }`; `retry = () => { void catalog.load(publicId, catalog.page.value) }`.
- `breadcrumbs = computed(() => [{ label: i18n.t('tla_breadcrumb_root'), url: '/legal-acceptances' }, { label: catalog.tenant.value?.businessUnitName ?? '…' }])`.
- `expandedRows = ref<Record<string, boolean>>({})`.
- `return` expone: `tenant`, `rows`, `total`, `page`, `perPage`, `lastPage`, `loading`, `hasLoadedOnce`, `hasError`, `notFound`, `errorMessage`, `retry`, `onPage`, `goBack`, `breadcrumbs`, `expandedRows`, `formatAcceptedAtInstant`, `displayMaskedValue`, `TENANT_LEGAL_ACCEPTANCE_DOCUMENT_LABEL_KEYS`, `TENANT_LEGAL_ACCEPTANCE_CHANNEL_LABEL_KEYS`, `TENANT_LEGAL_ACCEPTANCE_EMPTY_VALUE`.

- [ ] **Step 3: Escribir `index.vue`**

Bloque BEM raíz `tenant-legal-acceptances`, `NuxtLayout name="default"`; `<script lang="ts">import Script from './script'</script>`; `<style lang="scss" scoped>@import './style';</style>`. Ramas en orden (molde `alliances/[allianceId]/index.vue`):

1. `<Breadcrumb :model="breadcrumbs" class="tenant-legal-acceptances__breadcrumb" />` siempre.
2. `v-if="loading && !hasLoadedOnce"` → dos `Skeleton` (5rem + 14rem).
3. `v-else-if="notFound"` → `Message severity="warn"` con `tla_not_found` + `Button` canónico `variant="text" raised severity="secondary"` con `tla_btn_back` y `@click="goBack"` (CA-20).
4. `v-else-if="hasError"` → `Message severity="error"` con `{{ errorMessage }}` + botón `tla_btn_retry` con `@click="retry"` (CA-22; sin filas ni toast propio: el toast de 5xx/red lo pone `useApi()`).
5. `v-else` → **Card cabecera**: `#title` el nombre (`tenant.businessUnitName`), `#subtitle` `tla_subtitle`. Debajo: si `total === 0` → `Message severity="secondary"` con `tla_empty` sin tabla (CA-21); si no → **Card tabla** con `DataTable :value="rows" data-key="userConsentId" striped-rows lazy paginator scrollable :rows="perPage" :first="(page - 1) * perPage" :total-records="total" :loading="loading && hasLoadedOnce" v-model:expanded-rows="expandedRows" @page="onPage"`. Columnas: expansor (`<Column expander style="width: 3rem" />`), **Persona** (`{{ data.userName }}` + `<Tag v-if="data.isOwner" :value="$t('tla_tag_owner')" severity="secondary" />` — `secondary`, sin severity inventada), **Documento** (`$t(TENANT_LEGAL_ACCEPTANCE_DOCUMENT_LABEL_KEYS[data.documentType])`), **Versión** (`$t('tla_version_value', { version: data.version })`), **Aceptada** (`formatAcceptedAtInstant(data.acceptedAt) ?? TENANT_LEGAL_ACCEPTANCE_EMPTY_VALUE`), **Canal** (`<Tag severity="secondary" :value="$t(TENANT_LEGAL_ACCEPTANCE_CHANNEL_LABEL_KEYS[data.channel])" />`).
6. `#expansion="slotProps"` → bloque `tenant-legal-acceptances__evidence` con dos renglones: `tla_label_ip` y `tla_label_user_agent` con `{{ displayMaskedValue(slotProps.data.ip) }}` / `{{ displayMaskedValue(slotProps.data.userAgent) }}` (CA-18: `•••••` o `—`). **Todo por interpolación `{{ }}`, nunca `v-html`** (CA-25). Este bloque queda listo para que D2 (USRH1790654705065) agregue su acción de revelado: no le añadas nada más.

- [ ] **Step 4: Escribir `style.scss`**

Un solo bloque BEM `tenant-legal-acceptances`: breadcrumb con margen inferior `var(--space-base)`; `__evidence` en columna con `gap: var(--space-xs)`; user agent con `overflow-wrap: anywhere`; tabla `scrollable` (a 375 px se desplaza en horizontal sin desbordar, CA-25). Solo tokens semánticos y custom-media (`@media (--bp-sm-down)`), cero `px` en `@media`, sin variables SCSS legacy.

- [ ] **Step 5: Agregar la columna "Historial" a la lista (CA-17)**

En `app/pages/legal-acceptances/index.vue`, después de la columna de Aviso, agrega:

```html
<Column :header="$t('la_col_history')" style="width: 9rem">
  <template #body="{ data }">
    <NuxtLink
      :to="`/legal-acceptances/${data.businessUnitPublicId}`"
      class="legal-acceptances-page__history-link"
    >
      <Button variant="text" raised severity="secondary" :label="$t('la_btn_view_history')" />
    </NuxtLink>
  </template>
</Column>
```

En `domain/locales/legal-acceptances.es.json` agrega al final: `"la_col_history": "Historial"`, `"la_btn_view_history": "Ver historial"`.

- [ ] **Step 6: Verificar typecheck, lint, estilos, convenciones y suite completa**

Run: `pnpm typecheck && pnpm lint && pnpm lint:styles && pnpm check:conventions`
Expected: los cuatro en 0.
Run: `pnpm test`
Expected: PASS — 236 archivos / 1959 pruebas previas **más** las 8 + 7 + 8 = 23 nuevas de Tasks 5-7, sin fallos (≥ 1982).

- [ ] **Step 7: Revisión visual (fuera de vitest)**

Con el API local arriba y la rama de Tasks 1-4: en claro y oscuro, desktop y 375 px — expediente con filas y fila expandida (`•••••`), etiqueta "Propietario", paginación, vacío, "No encontramos esta empresa.", error con "Reintentar", y el botón "Ver historial" de la lista. Ajustes visuales van en el mismo commit de este paso solo si son de esta pantalla.

- [ ] **Step 8: Commit**

```bash
git add "app/pages/legal-acceptances/[publicId]" app/pages/legal-acceptances/index.vue app/pages/legal-acceptances/domain/locales/legal-acceptances.es.json
git commit -m "feat(legal-acceptances): agrega el expediente de aceptaciones por tenant

Refs: USRH1790610965466"
```

---

### Task 9: Manual de QA del flujo (entrega; lo recorre una persona)

**Files:**
- Create: `docs/superpowers/plans/2026-10-05-historial-aceptaciones-tenant-qa-flujo.md` (repo landlord)
- Modify (otro repo, no versionado): `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts`

**Interfaces:**
- Consumes: la pantalla de Task 8 y el endpoint de Task 4 con sus respuestas ya verificadas; el catálogo real de textos (`tenant-legal-acceptances.es.json`); las reglas de manual de QA.
- Produces: el playbook que **entrega** el ejecutor y **recorre una persona** (el usuario), no el agente. La prueba manual del Definition of Done queda cubierta.

- [ ] **Step 1: Leer la regla y el molde antes de redactar**

Lee `~/.agents/rules/manual-qa/manual-qa-frontend.md` y `~/.agents/rules/manual-qa/manual-qa-execution.md` (la copia viva; no las cites de memoria). Abre `docs/superpowers/plans/2026-10-05-aceptaciones-legales-por-tenant-qa-flujo.md` y toma las constantes del ambiente: URL local (`http://127.0.0.1:3000/legal-acceptances`, sin `/es`), el flujo de login tal como se ve en pantalla, el comando del seeder (`cd gsti-rh-api && node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`) y el dominio/contraseña de las cuentas de prueba.

- [ ] **Step 2: Tomar las constantes del ambiente y sembrar los datos de esta HU**

En `gsti-rh-api/database/seeders/_tmp_do_not_commit_qa_seeder.ts` (su sitio; no se versiona), agrega bajo una marca reconocible `QA-LAH`:
- Un tenant de prueba con al menos 3 aceptaciones: dos personas (una owner, una colaboradora), Términos y Aviso, fechas distintas, una aceptación con IP/user agent capturados y una sin IP.
- Una segunda empresa con una aceptación propia (para comprobar en pantalla el aislamiento: nada de la segunda aparece en el expediente de la primera).
- Un consentimiento biométrico de una persona del tenant (para comprobar que **nunca** aparece en el expediente).
- Un tenant sin aceptaciones (para el vacío) — puede ser uno ya existente del seeder si de verdad no tiene.
Declara en el manual, antes de los escenarios, que el expediente muestra los datos **enmascarados** y que revelarlos es otra historia (no hay botón; si aparece uno, es un defecto).

- [ ] **Step 3: Redactar el manual con la estructura mínima**

`2026-10-05-historial-aceptaciones-tenant-qa-flujo.md`, lenguaje llano para quien prueba en el navegador:
0. **Problema / Solución** cortos y un `Ejemplo:` cotidiano (la auditoría que pide "quién aceptó qué, cuándo y desde dónde"); glosario solo con términos de negocio que el cuerpo no explique al usarlos (expediente, propietario de la cuenta, en línea/en papel, parcialmente oculto).
1. **Preparar**: el único comando del seeder y qué deja sembrado; prerrequisito: esta rama del API y del landlord arriba, con la lista de "Aceptaciones legales" ya navegando.
2. **Usuarios**: tabla con correo y contraseña literales del seeder.
3. **Dónde probar**: menú lateral → **Aceptaciones legales** → botón **Ver historial** de una empresa; y la URL directa `/legal-acceptances/<id de la empresa>` (sin `/es`).
4. **Escenarios**, cada uno abriendo con su línea **`Objetivo:`** antes de los pasos, cubriendo: el botón "Ver historial" navega al expediente de esa empresa (no de otra); la ruta de migas "Aceptaciones legales › <nombre de la empresa>" y la cabecera con nombre y subtítulo; cada renglón con persona (etiqueta "Propietario" solo en la persona dueña), documento, versión `v…`, fecha y hora de Ciudad de México y canal ("En línea"/"En papel"); el orden del más reciente al más antiguo; la fila expandida con "Dirección IP" y "Agente de usuario" tapados con puntos (y guion en la aceptación sin IP) **sin ninguna opción para verlos completos**; el aislamiento (nada de la segunda empresa); el consentimiento biométrico que no aparece; la paginación; la empresa sin aceptaciones con su aviso; una URL con un id que no existe → "No encontramos esta empresa." y "Volver a la lista"; el error con "Reintentar" (API caído, nunca una tabla vacía); el acomodo en móvil (375 px, tabla con desplazamiento); y que la pantalla es solo de consulta (sin editar, anular ni exportar).
5. **Checklist** final con una casilla por escenario, enunciada contra su objetivo.

- [ ] **Step 4: Declarar lo no revisable con su motivo**

En "Qué no se revisa con esta base sembrada": el rechazo a quien no es usuario de plataforma (lo decide el servidor; un usuario de empresa con la URL del landlord no pasa del login), y el correo de la persona (no se muestra por diseño — si apareciera en cualquier parte de la pantalla, es defecto y se reporta). Sin pasos inventados.

- [ ] **Step 5: Autocomprobar el manual contra la regla**

Cada escenario con su `Objetivo:`; textos copiados del catálogo real (no redactados de memoria); sin rutas de archivo, TypeScript, endpoints, `curl`, `jq` ni selectores. Cuenta:

Run: `cm=$(grep -c '^### 4\.' docs/superpowers/plans/2026-10-05-historial-aceptaciones-tenant-qa-flujo.md); ob=$(grep -c '^Objetivo:' docs/superpowers/plans/2026-10-05-historial-aceptaciones-tenant-qa-flujo.md); echo "escenarios=$cm objetivos=$ob"; test "$cm" = "$ob" && echo OK`
Expected: `escenarios=N objetivos=N` y `OK`.

- [ ] **Step 6: Entregar (no recorrer)**

El manual queda **entregado**; el ejecutor **no** lo camina (regla `manual-qa-execution.md`). Nota: `docs/superpowers/` está en el `.gitignore` del landlord, así que el manual se entrega como archivo, igual que los manuales previos del repo. El seeder no se versiona: nada de `git add -f`.

```bash
git add docs/superpowers/plans/2026-10-05-historial-aceptaciones-tenant-qa-flujo.md
git commit -m "docs(legal-acceptances): entrega el manual de QA del expediente por tenant

Refs: USRH1790610965466"
```

---

## Verificación final (fuera de las tareas)

Al cerrar las nueve tareas:

- **API**, rama `feature/USRH1790610965466-historial-aceptaciones-tenant`, con `sae_pruebas` al día: `NODE_ENV=test node ace test functional --files="platform_legal_acceptance_history"` en verde (Task 1 + Task 4 completos: CA-1 a CA-14, CA-8b, Review Focus); `… --files="platform_legal_acceptances"` 16; `… --files="consent_acceptance"` 10; `… unit --files="platform_legal_acceptance_routes"` 6; unidades de consent en verde; `… functional --files="physical_consent"` con sus 6 pasadas y solo los 5 errores de setup heredados.
- **Landlord**, misma rama: `pnpm typecheck && pnpm lint && pnpm lint:styles && pnpm check:conventions` en 0 y `pnpm test` completo en verde (≥ 1959 + 23 nuevas).
- Confirmar el `## Censo de archivos` del spec: ningún archivo fuera de la tabla aparece en los diffs de ningún repo.
- Revisión visual de Task 8 Step 7 hecha en claro/oscuro, desktop y 375 px.
- El manual de QA (Task 9) queda **entregado**; el recorrido lo hace una persona.
- La creación del PR, staging y producción son proceso aparte (Wilvardo); este plan termina aquí.
