# Estado de aceptación de términos y aviso por tenant — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `GET /api/platform/legal-acceptances`: por cada empresa cliente, el estado de aceptación de `terms_conditions` y `privacy_notice` (versión vigente, última aceptación de un owner), con búsqueda, filtro por estado no excluyente y paginación, protegido por `auth` + `platformAdmin`.

**Architecture:** Sub-slice nuevo `app/modules/consent/platform/` (constantes → puerto → adaptador MySQL → servicio → DTO → validador → controller), un archivo de rutas de plataforma con un solo grupo guardado y un test de tabla de rutas que congela el guard. Sin migraciones, sin seeders, sin catálogo de módulos: todo se calcula en cada consulta. La regla DA-1 ("la empresa aceptó" = aceptó un owner) vive en un único punto: `ownerMembershipsQuery` + `TENANT_ACCEPTANCE_ROLE_SLUGS`.

**Tech Stack:** Adonis 6, TypeScript estricto (cero `any`), VineJS, Knex (`db`) para las consultas de agregación, Lucid solo en fixtures de tests, japa.

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-USRH1790610965452.md` (contrato §10 congelado; reglas §4; CA §5). El anexo A (`anexo-a-consultas-sql.md`) referenciado por el spec **no existe en el sistema**: este plan deriva las consultas de §4, §7 y §11; si el anexo aparece, prevalece y se coteja.

## Global Constraints

- Contrato de §10 **congelado** para USRH1790654705035: llaves, valores de `status`, `meta` y cuerpos de error son literales del spec. Cualquier desviación se escala a Wilvardo, no se cambia en silencio.
- TS estricto, cero `any`. Código y comentarios en español; identificadores en inglés (regla de idioma del repo).
- Commitlint: `<tipo-en-inglés-minúsculas>: <descripción-en-español>`.
- NO tocar: `docs/openapi.yaml`, `LegalDocumentService`/`legal_document.service.ts`, el módulo `evidence`, `app/helpers/billing_owner_guard.ts`, migraciones, seeders, `system_modules.constant.ts`.
- Las rutas de este archivo JAMÁS llevan `businessScope`; la consulta corre `runUnscoped` (lo hace `platformAdmin`).
- `fetchAllCompanyIds` solo cambia `private` → `public`: no se mueve, no cambia cuerpo ni orden.
- Fechas del DTO: ISO 8601 con zona (`DateTime.toISO()` de Luxon).
- Verificación no negociable tras tocar `app/constants/`: `node ace test unit --files="constants/"`.
- Rama de trabajo: `feature/USRH1790610965452-estado-aceptacion-por-tenant` (ya existe). No push sin pedido explícito.
- Los ids del universo van siempre enlazados (`?`/bindings Knex); nada del usuario se concatena en SQL.

## Review Focus

Los cinco casos que el spec implica y que más fácil se rompen, con el CA que los fija:

1. **Respaldo `users.role_id` de otra empresa** (entorno sin backfill del pivote): un `owner` de la empresa A con membresía `role_id NULL` en la empresa E no debe contar en E. → CA-7 (Task 7).
2. **Borrados suaves**: membresía retirada, usuario dado de baja o rol borrado dejan de sostener el estado; empresa borrada desaparece. → CA-6 (Task 7).
3. **Tipo sin versión vigente + filtro**: sin vigente, el documento es `sin-version-publicada`, `lastAcceptedAt: null`, y ningún filtro (`al-dia`, `pendiente`, `nunca`) devuelve empresas por él. → CA-8 (Task 6) y CA-10 (Task 7).
4. **Cuentas que no cuentan**: `root` de plataforma dentro de un tenant, roles no-owner (`admin`/`empleado`), aceptación biométrica. → CA-4, CA-7, CA-9 (Task 7).
5. **Fuga de datos (SEC-C-03)**: la fila solo puede tener las 4 llaves del contrato; jamás RFC, razón social, correo, firmante, IP ni user agent. → CA-12 (Task 7).

---

### Task 1: Cimientos del sub-slice — constantes, error de dominio, códigos e i18n

**Files:**
- Create: `app/modules/consent/platform/platform_consent.constants.ts`
- Create: `app/exceptions/platform_consent_error.ts`
- Create: `app/constants/platform_consent_error_codes.ts`
- Modify: `resources/langs/es.json`, `resources/langs/en.json`

**Interfaces:**
- Consumes: nada (primer task).
- Produces (los tasks 2-8 importan exactamente estos nombres):
  - `TENANT_ACCEPTANCE_ROLE_SLUGS = ['owner'] as const` y tipo `TenantAcceptanceRoleSlug` (**DA-1**)
  - `PLATFORM_ACCEPTANCE_DOCUMENT_TYPES = ['terms_conditions', 'privacy_notice'] as const` y tipo `PlatformAcceptanceDocumentType`
  - `PLATFORM_ACCEPTANCE_STATUS_FILTERS = ['al-dia', 'pendiente', 'nunca'] as const` y tipo `PlatformAcceptanceStatusFilter`
  - `PLATFORM_DOCUMENT_ACCEPTANCE_STATUSES = [...PLATFORM_ACCEPTANCE_STATUS_FILTERS, 'sin-version-publicada'] as const` y tipo `PlatformDocumentAcceptanceStatus`
  - `PLATFORM_ACCEPTANCES_DEFAULT_LIMIT = 20`, `PLATFORM_ACCEPTANCES_MAX_LIMIT = 100`
  - `PlatformConsentErrorKey = 'filtros-de-aceptaciones-invalidos'`, clase default `PlatformConsentError extends Error` con `readonly key` (espejo de `app/exceptions/legal_document_error.ts`)
  - `PLATFORM_CONSENT_ERROR_CODES = { INVALID_FILTERS: 'CONSENT.PLATFORM.001' } as const` (docblock: C usa 001-009, D 010-019)

- [ ] **Step 1: Crear `platform_consent.constants.ts` con las constantes y tipos de arriba**

Cada constante con docblock en español que diga qué regla de §4 respalda. DA-1 va comentada como decisión de Wilvardo 2026-09-29 y "único punto de la regla".

- [ ] **Step 2: Crear `app/exceptions/platform_consent_error.ts`**

Espejo exacto de `app/exceptions/legal_document_error.ts` (clase con `key` tipada, `name = 'PlatformConsentError'`, `message ?? key`).

- [ ] **Step 3: Crear `app/constants/platform_consent_error_codes.ts`**

`CONSENT.PLATFORM.001` para `INVALID_FILTERS`, con docblock del rango reservado (C 001-009, D 010-019) para que las historias hermanas no choquen.

- [ ] **Step 4: Agregar el bloque i18n en `resources/langs/es.json` y `en.json`**

Bloque de primer nivel nuevo `platformLegalAcceptances` (después del bloque `legalDocuments`):

```json
"platformLegalAcceptances": {
  "errors": {
    "filtros-de-aceptaciones-invalidos": {
      "title": "Filtros de aceptaciones inválidos",
      "detail": "Revisa la búsqueda (1 a 191 caracteres), el estado (al-dia, pendiente o nunca), la página y el límite (máximo 100)."
    }
  }
}
```

En `en.json`: title `"Invalid acceptance filters"`, detail `"Check the search (1 to 191 characters), the status (al-dia, pendiente or nunca), the page and the limit (maximum 100)."`. JSON válido (el archivo es grande: usar edición quirúrgica, no reescritura).

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && node ace test unit --files="constants/"`
Expected: cero errores de TS; suite de constantes en verde.

- [ ] **Step 6: Commit**

```bash
git add app/modules/consent/platform/platform_consent.constants.ts app/exceptions/platform_consent_error.ts app/constants/platform_consent_error_codes.ts resources/langs/es.json resources/langs/en.json
git commit -m "feat: Agregar constantes, error y códigos de aceptaciones de plataforma"
```

---

### Task 2: Archivo de rutas con guard + test de tabla (CA-17, SEC-C-01)

**Files:**
- Create: `start/routes/platform_legal_acceptance_routes.ts`
- Create: `tests/unit/routes/platform_legal_acceptance_routes.spec.ts`
- Modify: `start/routes.ts` (import tras `import './routes/platform_trial_routes.js'`, línea 37)

**Interfaces:**
- Consumes: nada de Task 1 (el archivo de rutas solo referencia el controller por string lazy: `'#modules/consent/platform/platform_consent.controller.index'` — no requiere que exista para que el test de tabla pase).
- Produces: la ruta `GET /api/platform/legal-acceptances` registrada; el test de tabla que congela el guard (las historias D1/D2 lo editan después).

- [ ] **Step 1: Escribir el test de tabla en rojo**

`tests/unit/routes/platform_legal_acceptance_routes.spec.ts`, espejo de `tests/unit/routes/platform_discount_code_routes.spec.ts` (lee el archivo, no bootea el server). Un solo grupo `platform_legal_acceptance_routes — guard de plataforma` con estos tests:

1. `declara un único router.group cerrado con prefijo y guard` — `content.match(/router\.group\(/g)` tiene exactamente 1 ocurrencia; incluye `.prefix('/api/platform')`, `middleware.auth({ guards: ['api'] })` y `middleware.platformAdmin()`.
2. `nunca declara businessScope()` — `assert.notInclude(content, 'businessScope')`.
3. `declara GET /legal-acceptances hacia el index` — incluye exactamente `router.get('/legal-acceptances', '#modules/consent/platform/platform_consent.controller.index')`.
4. `ninguna ruta fuera del grupo` — el índice de `router.group(` en el contenido es menor que el índice de la primera llamada `router.get(`, y no existe ninguna llamada `router.post(`, `router.put(`, `router.patch(` ni `router.delete(` (con este contenido, la única verb call del archivo es el GET).
5. Grupo `start/routes.ts — registro del módulo`: incluye `import './routes/platform_legal_acceptance_routes.js'`.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node ace test unit --files="routes/platform_legal_acceptance_routes.spec.ts"`
Expected: FAIL (archivo de rutas inexistente / import ausente).

- [ ] **Step 3: Crear `start/routes/platform_legal_acceptance_routes.ts`**

Espejo de `start/routes/platform_discount_code_routes.ts`: docblock con la lista de rutas y la nota de que es dato de plataforma sin scope de tenant (USRH1790610965452), luego:

```ts
router
  .group(() => {
    router.get(
      '/legal-acceptances',
      '#modules/consent/platform/platform_consent.controller.index'
    )
  })
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
```

- [ ] **Step 4: Importar en `start/routes.ts`**

Insertar `import './routes/platform_legal_acceptance_routes.js'` inmediatamente después de `import './routes/platform_trial_routes.js'` (§10 fija la posición).

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `node ace test unit --files="routes/platform_legal_acceptance_routes.spec.ts" && npm run typecheck`
Expected: PASS en los 5 tests; typecheck sin errores.

- [ ] **Step 6: Commit**

```bash
git add start/routes/platform_legal_acceptance_routes.ts tests/unit/routes/platform_legal_acceptance_routes.spec.ts start/routes.ts
git commit -m "feat: Registrar rutas de aceptaciones legales con guard de plataforma"
```

---

### Task 3: Puerto, DTO y `resolveDocumentStatus` (unit-testeable)

**Files:**
- Create: `app/modules/consent/platform/platform_consent.repository.ts` (puerto + tipos de entrada/salida)
- Create: `app/modules/consent/platform/dto/platform_legal_acceptance.dto.ts`
- Create: `app/modules/consent/platform/platform_consent.service.ts` (por ahora SOLO `resolveDocumentStatus`)
- Test: `tests/unit/modules/consent/platform/resolve_document_status.spec.ts`

**Interfaces:**
- Consumes: tipos de Task 1 (`PlatformAcceptanceDocumentType`, `PlatformAcceptanceStatusFilter`, `PlatformDocumentAcceptanceStatus`).
- Produces (Tasks 4-6 dependen de estas firmas exactas):

```ts
// platform_consent.repository.ts
export interface CurrentAcceptanceDocument {
  legalDocumentId: number
  type: PlatformAcceptanceDocumentType
  version: string
  publishedAt: DateTime | null
}
export interface CurrentAcceptanceDocuments {
  termsConditions: CurrentAcceptanceDocument | null
  privacyNotice: CurrentAcceptanceDocument | null
}
export interface DocumentAcceptanceFacts {
  lastAcceptedAt: DateTime | null   // última aceptación de un owner, cualquier versión
  acceptedCurrentAt: DateTime | null // alguna aceptación de la versión vigente
}
export interface TenantAcceptanceRow {
  businessUnitId: number
  businessUnitPublicId: string
  businessUnitName: string
  termsConditions: DocumentAcceptanceFacts
  privacyNotice: DocumentAcceptanceFacts
}
export interface ListTenantAcceptancesInput {
  businessUnitIds: number[]
  current: CurrentAcceptanceDocuments
  status?: PlatformAcceptanceStatusFilter
  page: number
  limit: number
}
export interface PlatformConsentRepository {
  findCurrentDocuments(): Promise<CurrentAcceptanceDocuments>
  listTenantAcceptances(
    input: ListTenantAcceptancesInput
  ): Promise<{ rows: TenantAcceptanceRow[]; total: number }>
}
```

```ts
// platform_consent.service.ts
export function resolveDocumentStatus(
  hasCurrent: boolean,
  lastAcceptedAt: DateTime | null,
  acceptedCurrent: boolean
): PlatformDocumentAcceptanceStatus
```

```ts
// dto/platform_legal_acceptance.dto.ts
export interface CurrentDocumentVersionDto { version: string; publishedAt: string | null }
export interface DocumentAcceptanceDto {
  status: PlatformDocumentAcceptanceStatus
  lastAcceptedAt: string | null
}
export interface TenantLegalAcceptanceDto {
  businessUnitPublicId: string
  businessUnitName: string
  termsConditions: DocumentAcceptanceDto
  privacyNotice: DocumentAcceptanceDto
}
export interface PlatformLegalAcceptancesResponse {
  type: 'success'
  currentVersions: {
    termsConditions: CurrentDocumentVersionDto | null
    privacyNotice: CurrentDocumentVersionDto | null
  }
  data: TenantLegalAcceptanceDto[]
  meta: { total: number; page: number; limit: number; lastPage: number }
}
```

- [ ] **Step 1: Escribir el test unitario de `resolveDocumentStatus` en rojo**

Tabla completa (debe quedar idéntica al predicado SQL del Task 4 — anexo A del spec):

```ts
test('sin versión vigente → sin-version-publicada, sin importar aceptaciones', () => {
  assert.equal(resolveDocumentStatus(false, DateTime.now(), true), 'sin-version-publicada')
})
test('aceptó la vigente → al-dia', () => {
  assert.equal(resolveDocumentStatus(true, DateTime.now(), true), 'al-dia')
})
test('aceptó solo una versión anterior → pendiente', () => {
  assert.equal(resolveDocumentStatus(true, DateTime.now(), false), 'pendiente')
})
test('nunca aceptó → nunca', () => {
  assert.equal(resolveDocumentStatus(true, null, false), 'nunca')
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node ace test unit --files="modules/consent/platform/resolve_document_status.spec.ts"`
Expected: FAIL (función no definida).

- [ ] **Step 3: Implementar puerto, DTO y `resolveDocumentStatus`**

`resolveDocumentStatus` es una tabla de decisión en orden: `!hasCurrent → 'sin-version-publicada'`; `acceptedCurrent → 'al-dia'`; `lastAcceptedAt !== null → 'pendiente'`; si no, `'nunca'`. En el DTO, además, dos funciones puras de mapeo que usará el servicio del Task 5: `toCurrentDocumentVersionDto(doc: CurrentAcceptanceDocument | null)` (fechas con `DateTime.toISO()`) y `toDocumentAcceptanceDto(status, lastAcceptedAt: DateTime | null)`. Docblocks en español citando la regla de §4 que cada pieza respalda.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node ace test unit --files="modules/consent/platform/resolve_document_status.spec.ts" && npm run typecheck`
Expected: PASS; typecheck limpio.

- [ ] **Step 5: Commit**

```bash
git add app/modules/consent/platform/platform_consent.repository.ts app/modules/consent/platform/dto/platform_legal_acceptance.dto.ts app/modules/consent/platform/platform_consent.service.ts tests/unit/modules/consent/platform/resolve_document_status.spec.ts
git commit -m "feat: Definir puerto, DTO y resolución de estado de aceptación"
```

---

### Task 4: Adaptador MySQL — vigentes, `ownerMembershipsQuery` (DA-1), agregación paginada y conteo

**Files:**
- Create: `app/modules/consent/platform/platform_consent.repository.mysql.ts`
- Modify: `app/services/platform_tenant_service.ts` — `fetchAllCompanyIds` (líneas ~580-610) pasa de `private` a `public`, **sin ningún otro cambio**

**Interfaces:**
- Consumes: `PlatformConsentRepository` y tipos del Task 3; constantes del Task 1; `db` de `@adonisjs/lucid/services/db`.
- Produces: `export default class PlatformConsentRepositoryMysql implements PlatformConsentRepository` con `findCurrentDocuments()` y `listTenantAcceptances(input)`; el método privado `ownerMembershipsQuery(businessUnitIds: number[])` (**único punto de DA-1**, junto con `TENANT_ACCEPTANCE_ROLE_SLUGS`).

- [ ] **Step 1: `findCurrentDocuments()`**

```ts
const rows = await db('legal_documents')
  .where('legal_document_is_current', 1)
  .where('legal_document_status', 'published')
  .whereIn('legal_document_type', PLATFORM_ACCEPTANCE_DOCUMENT_TYPES)
```
Mapear a `{ termsConditions: <fila terms_conditions> | null, privacyNotice: <fila privacy_notice> | null }` (a lo sumo una vigente por tipo). Nunca lanza si no hay vigente (fail-open a `null`, regla 4).

- [ ] **Step 2: `ownerMembershipsQuery(businessUnitIds)` — el único punto de DA-1**

```ts
return db
  .from('business_unit_users as buu')
  .innerJoin('users as u', (j) => {
    j.on('u.user_id', 'buu.user_id').whereNull('u.user_deleted_at')
  })
  .leftJoin('roles as pr', (j) => {
    j.on('pr.role_id', 'buu.role_id').whereNull('pr.role_deleted_at')
  })
  .leftJoin('roles as br', (j) => {
    j.on('br.role_id', 'u.role_id').whereNull('br.role_deleted_at')
  })
  .whereIn('buu.business_unit_id', businessUnitIds)
  .whereNull('buu.business_unit_user_deleted_at')
  .where((w) => {
    // Rol escrito en la pivote: manda él (vive en el par empresa-cuenta).
    w.where((pivot) => {
      pivot.whereNotNull('buu.role_id').whereIn('pr.role_slug', TENANT_ACCEPTANCE_ROLE_SLUGS)
    })
    // Respaldo users.role_id: solo cuenta si el rol es de ESTA empresa o global.
    w.orWhere((fallback) => {
      fallback
        .whereNull('buu.role_id')
        .whereIn('br.role_slug', TENANT_ACCEPTANCE_ROLE_SLUGS)
        .where((own) => {
          own.whereNull('br.business_unit_id')
          own.orWhereRaw('br.business_unit_id = buu.business_unit_id')
        })
    })
  })
  .distinct('buu.business_unit_id', 'buu.user_id')
```

Por qué esto cumple §4: los borrados suaves (membresía/usuario/rol) caen por joins y `whereNull` (reglas 5-6); `root` y cualquier no-owner quedan fuera porque su slug no está en `TENANT_ACCEPTANCE_ROLE_SLUGS` (reglas 1, 8); el respaldo solo cuenta si el rol pertenece a la misma empresa o es global (regla 7).

- [ ] **Step 3: `listTenantAcceptances(input)` — agregación, predicado de estado, página y conteo**

Tres piezas sobre `ownerMembershipsQuery`:

(a) Subconsulta de agregación por empresa:

```ts
const ownerAgg = db
  .from(this.ownerMembershipsQuery(input.businessUnitIds).as('om'))
  .innerJoin('user_consents as uc', 'uc.user_id', 'om.business_unit_id__user_id') // ver nota
  .innerJoin('legal_documents as ld', (j) => {
    j.on('ld.legal_document_id', 'uc.legal_document_id')
      // biométrico fuera EN LA CONSULTA (regla 9)
      .whereIn('ld.legal_document_type', PLATFORM_ACCEPTANCE_DOCUMENT_TYPES)
  })
  .select(
    'om.businessUnitId',
    db.raw("MAX(CASE WHEN ld.legal_document_type = 'terms_conditions' THEN uc.user_consent_accepted_at END) as tcLast"),
    db.raw("MAX(CASE WHEN ld.legal_document_type = 'privacy_notice' THEN uc.user_consent_accepted_at END) as pnLast"),
    ...(input.current.termsConditions
      ? [db.raw('MAX(CASE WHEN ld.legal_document_id = ? THEN uc.user_consent_accepted_at END) as tcCurrent', [input.current.termsConditions.legalDocumentId])]
      : [db.raw('NULL as tcCurrent')]),
    ...(input.current.privacyNotice
      ? [db.raw('MAX(CASE WHEN ld.legal_document_id = ? THEN uc.user_consent_accepted_at END) as pnCurrent', [input.current.privacyNotice.legalDocumentId])]
      : [db.raw('NULL as pnCurrent')])
  )
  .groupBy('om.businessUnitId')
```

Nota: la unión `uc.user_id = om.user_id` — ajustar los alias de columnas del `select` de `ownerMembershipsQuery` para que exponga `businessUnitId` y `userId` (p. ej. `.select(db.raw('DISTINCT buu.business_unit_id as businessUnitId, buu.user_id as userId'))`) y unir por esos nombres; si Knex no resuelve el alias de la subconsulta en el `join`, unir con `on` crudo por nombre.

(b) Predicado de estado (misma tabla que `resolveDocumentStatus`; si uno cambia, cambia el otro). Los documentos con vigente se derivan de `input.current`:

- `al-dia`: AND sobre cada doc con vigente de `agg.<doc>Current IS NOT NULL`.
- `pendiente`: OR sobre cada doc con vigente de `(agg.<doc>Last IS NOT NULL AND agg.<doc>Current IS NULL)`.
- `nunca`: OR sobre cada doc con vigente de `agg.<doc>Last IS NULL`.
- Si **ningún** doc tiene vigente: predicado `db.raw('1 = 0')` — cualquier filtro da lista vacía (regla 12).

`sin-version-publicada` nunca entra al predicado: no cuenta para el filtro.

(c) Página y conteo, misma forma:

```ts
const base = db
  .from('business_units as bu')
  .leftJoin(ownerAgg.as('agg'), 'agg.businessUnitId', 'bu.business_unit_id')
  .whereIn('bu.business_unit_id', input.businessUnitIds)
  .whereNull('bu.business_unit_deleted_at') // fail-closed, duplica el filtro del universo
// con input.status: base.andWhere(this.statusPredicate(input.current, input.status))

const rows = await base
  .clone()
  .select(
    'bu.business_unit_id as businessUnitId',
    'bu.business_unit_public_id as businessUnitPublicId',
    'bu.business_unit_name as businessUnitName',
    'agg.tcLast', 'agg.tcCurrent', 'agg.pnLast', 'agg.pnCurrent'
  )
  .orderBy('bu.business_unit_name', 'asc')
  .limit(input.limit)
  .offset((input.page - 1) * input.limit)

const [{ total }] = await base.clone().count('* as total')
```

Orden por nombre ascendente (regla 10). Mapear fechas a `DateTime | null` (Luxon `DateTime.fromJSDate` / `DateTime.isDateTime` según lo que devuelva el driver) para respetar `TenantAcceptanceRow`.

- [ ] **Step 4: Hacer público `fetchAllCompanyIds`**

En `app/services/platform_tenant_service.ts`: borrar la palabra `private` de `fetchAllCompanyIds` (línea ~580). Nada más — no mover, no renombrar, no tocar cuerpo ni orden.

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run lint -- app/modules/consent/platform/ app/services/platform_tenant_service.ts && node ace test unit --files="routes/"`
Expected: typecheck y lint limpios; test de rutas sigue en verde. (La prueba funcional del adaptador llega con los CA del Task 6.)

- [ ] **Step 6: Commit**

```bash
git add app/modules/consent/platform/platform_consent.repository.mysql.ts app/services/platform_tenant_service.ts
git commit -m "feat: Implementar adaptador MySQL de aceptaciones por tenant"
```

---

### Task 5: Servicio — universo, vigentes, estados y DTO

**Files:**
- Modify: `app/modules/consent/platform/platform_consent.service.ts` (agregar la clase; conserva `resolveDocumentStatus`)

**Interfaces:**
- Consumes: `PlatformConsentRepository` + `PlatformConsentRepositoryMysql` (Task 4), `PlatformTenantService#fetchAllCompanyIds` (público desde Task 4), DTO y `resolveDocumentStatus` (Task 3), constantes (Task 1).
- Produces (el controller del Task 6 consume esto):

```ts
export interface ListLegalAcceptancesFilters {
  search?: string
  status?: PlatformAcceptanceStatusFilter
  page?: number
  limit?: number
}
export default class PlatformConsentService {
  constructor(
    private readonly tenantService: PlatformTenantService = new PlatformTenantService(),
    private readonly repository: PlatformConsentRepository = new PlatformConsentRepositoryMysql()
  ) {}
  async listLegalAcceptances(
    filters: ListLegalAcceptancesFilters
  ): Promise<PlatformLegalAcceptancesResponse>
}
```

- [ ] **Step 1: Implementar `listLegalAcceptances`**

Flujo fijo (§7):

1. `page = filters.page ?? 1`; `limit = filters.limit ?? PLATFORM_ACCEPTANCES_DEFAULT_LIMIT`.
2. `current = await this.repository.findCurrentDocuments()`.
3. `universe = await this.tenantService.fetchAllCompanyIds(filters.search)`.
4. Si `universe.length === 0`: responder `data: []`, `meta: { total: 0, page, limit, lastPage: 1 }`, con `currentVersions` mapeado — **sin llamar** `listTenantAcceptances` (no se toca `user_consents`).
5. `{ rows, total } = await this.repository.listTenantAcceptances({ businessUnitIds: universe.map((u) => u.buId), current, status: filters.status, page, limit })`.
6. Por cada fila y cada documento: `status = resolveDocumentStatus(current[doc] !== null, row[doc].lastAcceptedAt, row[doc].acceptedCurrentAt !== null)` y `lastAcceptedAt = row[doc].lastAcceptedAt?.toISO() ?? null` (vía `toDocumentAcceptanceDto`). La fila DTO solo lleva las 4 llaves del contrato.
7. `lastPage = Math.max(1, Math.ceil(total / limit))` (página fuera de rango: `data: []` con el `meta` real).
8. `currentVersions` vía `toCurrentDocumentVersionDto(current.termsConditions)` / `privacyNotice`.

El servicio NO conoce la regla DA-1 (vive en el adaptador) ni los slugs de estado como texto suelto (viven en las constantes y en `resolveDocumentStatus`).

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run lint -- app/modules/consent/platform/`
Expected: limpio.

- [ ] **Step 3: Commit**

```bash
git add app/modules/consent/platform/platform_consent.service.ts
git commit -m "feat: Calcular estado de aceptación por empresa en el servicio"
```

---

### Task 6: Controller + validador + contrato del listado (CA-1, CA-2, CA-3, CA-8, CA-11, CA-13)

**Files:**
- Create: `app/modules/consent/platform/validators/list_platform_legal_acceptances.validator.ts`
- Create: `app/modules/consent/platform/platform_consent.controller.ts`
- Test: `tests/functional/platform_legal_acceptances.spec.ts`

**Interfaces:**
- Consumes: `PlatformConsentService#listLegalAcceptances(filters)` (Task 5), constantes (Task 1), `PlatformConsentError` + `PLATFORM_CONSENT_ERROR_CODES` (Task 1), i18n `platformLegalAcceptances.errors.filtros-de-aceptaciones-invalidos.*` (Task 1).
- Produces: `export const listPlatformLegalAcceptancesValidator` y `export default class PlatformConsentController { async index(ctx: HttpContext, service: PlatformConsentService = new PlatformConsentService()) }`.

- [ ] **Step 1: Implementar validador y controller**

Validador (VineJS, espejo de `listTenantsValidator` de `app/validators/platform_tenant.ts`):

```ts
export const listPlatformLegalAcceptancesValidator = vine.compile(
  vine.object({
    search: vine.string().trim().minLength(1).maxLength(191).optional(),
    status: vine.enum(PLATFORM_ACCEPTANCE_STATUS_FILTERS).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(PLATFORM_ACCEPTANCES_MAX_LIMIT).optional(),
  })
)
```

Controller `index` (espejo de `PlatformTenantController#index` y del manejo de errores de `legal_document.controller.ts:677-717`):

- JSDoc `@swagger` completo del endpoint (tags `Platform · Legal Acceptances`, operationId `listPlatformLegalAcceptances`, `@paramQuery` de los 4 filtros, `@responseBody` 200/401/403/422 con los cuerpos literales de §10). `docs/openapi.yaml` NO se toca.
- `try { payload = await request.validateUsing(listPlatformLegalAcceptancesValidator) } catch (error)`: si `error.code === 'E_VALIDATION_ERROR'` → `throw new PlatformConsentError('filtros-de-aceptaciones-invalidos')`; si no, relanzar.
- `try { result = await service.listLegalAcceptances({ search, status, page: page ?? 1, limit: limit ?? 20 }) ; return response.status(200).json(result) } catch (error) { return this.domainError(ctx, error) }`.
- `domainError`: si `error instanceof PlatformConsentError` → 422 con `{ type: 'error', title: i18n.formatMessage('platformLegalAcceptances.errors.filtros-de-aceptaciones-invalidos.title'), detail: i18n.formatMessage('platformLegalAcceptances.errors.filtros-de-aceptaciones-invalidos.detail'), key: error.key, code: PLATFORM_CONSENT_ERROR_CODES.INVALID_FILTERS }`; si no, `throw error`.

- [ ] **Step 2: Escribir la plantilla de fixtures del spec funcional**

En `tests/functional/platform_legal_acceptances.spec.ts` (actor de plataforma molde `tests/functional/platform_admin_scope_bypass.spec.ts:30-75`: rol `root` existente, `Person.create`, `User.create({ isPlatformAdmin: true, ... })`, `POST /api/platform/auth/login` → `data.token`, header `Authorization: Bearer`). Fixtures de negocio:

- `createTenant(name)`: `BusinessUnit.create` con nombre único (sello de timestamp) — molde de `tests/functional/platform_tenant_list_billing_completeness.spec.ts:80`.
- `createTenantRole(bu, slug)`: `Role.create({ roleSlug: slug, businessUnitId: bu.businessUnitId, roleActive: 1, ... })`.
- `createTenantUser(bu, role, { withPivotRole = true })`: `Person` + `User` + `BusinessUnitUser.create({ userId, businessUnitId, roleId: withPivotRole ? role.roleId : null })` — si el modelo obliga `roleId`, crear con rol y luego `db.table('business_unit_users').update('role_id', null)` para el caso respaldo.
- `publishDocument(type, version)`: `LegalDocument.create({ legalDocumentType, legalDocumentVersion, legalDocumentContent: { es: 'fixture' }, legalDocumentIsCurrent: true, legalDocumentStatus: 'published', legalDocumentPublishedAt })`; antes de publicar v2 como vigente, bajar `legalDocumentIsCurrent = false` de v1 (una sola vigente por tipo).
- `acceptDocument(user, legalDocument, acceptedAt)`: `UserConsent.create({ userId, legalDocumentId, userConsentDocumentVersion, userConsentAcceptedAt, userConsentIp: null, userConsentUserAgent: null })`.
- Login BO (CA-15/16): `POST /api/auth/login` con `userEmail`/`userPassword` — molde `tests/functional/user_tenant_isolation.spec.ts`.

- [ ] **Step 3: Escribir los CA del contrato y correrlos en rojo**

Cada test abre con su objetivo (regla que fija) y su nombre:

- `CA-1: owner al día en ambos documentos` — empresa A, owner acepta vigente de Términos y Aviso → 200; fila de A: `termsConditions = { status: 'al-dia', lastAcceptedAt: <ISO de la aceptación> }`, `privacyNotice` igual; `currentVersions.termsConditions.version` es la vigente.
- `CA-2: versión nueva publicada deja pendiente` — empresa B: owner acepta Términos v1, se publica v2 → `termsConditions = { status: 'pendiente', lastAcceptedAt: <ISO de v1> }`, `currentVersions.termsConditions.version` es v2, y `privacyNotice` conserva el estado que tenía.
- `CA-3: empresa sin aceptaciones` — empresa C recién creada, sin usuarios → aparece con `{ status: 'nunca', lastAcceptedAt: null }` en ambos, sin error.
- `CA-8: tipo sin versión vigente` — `privacy_notice` sin vigente (bajar `is_current` de todas sus filas) → `currentVersions.privacyNotice === null` y toda fila trae `privacyNotice = { status: 'sin-version-publicada', lastAcceptedAt: null }`.
- `CA-11: paginación, búsqueda y vacío` — 3 empresas: con `limit=2&page=2` → `data` trae solo la tercera en orden por nombre y `meta = { total: 3, page: 2, limit: 2, lastPage: 2 }`; con `search=<nombre de una>` la encuentra; con `search` de un RFC completo válido la encuentra (sembrar `tenant_billing_profiles` con `tenant_billing_profile_rfc_hash = blindIndex(rfc)`, molde del test de billing completeness) y la respuesta NO contiene el RFC; con `search` sin coincidencias → 200 con `data: []` y `meta.total = 0`.
- `CA-13: filtros inválidos` — `status=foo`, `limit=101` y `page=0` (tres peticiones) → 422 con `{ type: 'error', title: 'Filtros de aceptaciones inválidos', key: 'filtros-de-aceptaciones-invalidos', code: 'CONSENT.PLATFORM.001' }`.

Run: `node ace test functional --files="platform_legal_acceptances.spec.ts"`
Expected: FAIL (el endpoint aún no existe).

- [ ] **Step 4: Verificar que el endpoint cumple y los CA pasan**

Run: `node ace test functional --files="platform_legal_acceptances.spec.ts" && node ace test unit --files="routes/" && npm run typecheck`
Expected: CA-1, CA-2, CA-3, CA-8, CA-11 y CA-13 en verde; test de rutas y typecheck en verde. Si un CA falla por el SQL de agregación, el arreglo va en el adaptador (Task 4), no en el test.

- [ ] **Step 5: Commit**

```bash
git add app/modules/consent/platform/validators/list_platform_legal_acceptances.validator.ts app/modules/consent/platform/platform_consent.controller.ts tests/functional/platform_legal_acceptances.spec.ts
git commit -m "feat: Exponer listado de aceptaciones legales de plataforma"
```

---

### Task 7: Reglas de conteo — quién cuenta y quién no (CA-4, CA-5, CA-6, CA-7, CA-9, CA-10, CA-12)

**Files:**
- Test: `tests/functional/platform_legal_acceptances.spec.ts` (agregar tests; solo tocar product code si un CA resulta en rojo)

**Interfaces:**
- Consumes: fixtures del Task 6; endpoint ya operativo.
- Produces: la evidencia de que DA-1 y las reglas 5-9, 12 y SEC-C-03 quedan fijadas.

- [ ] **Step 1: Escribir los CA de conteo (se espera verde; si fallan, el bug está en `ownerMembershipsQuery` o en el predicado)**

- `CA-4: solo aceptó un no-owner` — empresa D: un usuario con rol `admin` y otro con `empleado` aceptan la vigente → D sale `nunca` en ese documento.
- `CA-5: owner en una empresa, empleado en otra` — usuario owner en A y `empleado` en E, aceptó la vigente → cuenta en A (`al-dia`), E sale `nunca`.
- `CA-6: borrados suaves` — owner con `business_unit_user_deleted_at` seteado, otro con `user_deleted_at`, otro cuyo rol tiene `role_deleted_at`: ninguno sostiene el estado (su empresa sale según los owners restantes); una empresa con `business_unit_deleted_at` NO aparece en la respuesta.
- `CA-7: respaldo de otra empresa y cuenta root` — membresía con `role_id NULL` cuyo `users.role_id` apunta al rol `owner` de OTRA empresa: no cuenta; y una cuenta `root` de plataforma miembro de la empresa con aceptación de la vigente: no cuenta.
- `CA-9: solo biométrico` — empresa cuyo owner solo aceptó `biometric_consent` → sale `nunca` en ambos.
- `CA-10: filtro no excluyente` — empresa F con Términos `pendiente` y Aviso `nunca`: aparece con `status=pendiente` Y con `status=nunca`; no aparece con `status=al-dia`; la empresa al día del CA-1 sí aparece con `status=al-dia`.
- `CA-12: minimización` — toda fila 200 tiene EXACTAMENTE las llaves `['businessUnitPublicId', 'businessUnitName', 'termsConditions', 'privacyNotice']` (lista cerrada, molde `EXPECTED_ITEM_KEYS` del test de billing completeness) y el cuerpo completo de la respuesta no contiene el RFC ni la razón social de ningún tenant sembrado.

- [ ] **Step 2: Correr la suite funcional completa de la HU**

Run: `node ace test functional --files="platform_legal_acceptances.spec.ts"`
Expected: los 13 CA (1-13) en verde. Rojo ⇒ corregir el adaptador (Task 4) o el servicio (Task 5) — jamás relajar el test: el spec es la fuente.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/platform_legal_acceptances.spec.ts
git commit -m "test: Cubrir reglas de conteo de aceptaciones por empresa"
```

---

### Task 8: Acceso exclusivo de plataforma (CA-14, CA-15, CA-16) y verificación final

**Files:**
- Test: `tests/functional/platform_legal_acceptances.spec.ts` (agregar tests)

**Interfaces:**
- Consumes: fixtures del Task 6 (login BO vía `POST /api/auth/login`).
- Produces: SEC-C-02 probada con los cuerpos exactos del guard.

- [ ] **Step 1: Escribir los CA de acceso**

- `CA-14: sin token` → 401 con el cuerpo existente del middleware `auth` (assertion sobre `key` del contrato de auth del repo; NO sobre datos de tenant — verificar que el cuerpo no menciona empresa alguna).
- `CA-15: owner de tenant con token del BO` → 403 con EXACTAMENTE `{ title: 'Acceso restringido a plataforma', detail: 'Esta sección es exclusiva de administradores de plataforma.', key: 'AUTH.PLATFORM.FORBIDDEN' }` — sin `code`, sin datos de ningún tenant.
- `CA-16: isPlatformAdmin con token del BO` (login BO, no consola) → mismo 403 exacto, sin `code`.

- [ ] **Step 2: Correr la suite completa de la HU y los guardrails**

Run: `node ace test functional --files="platform_legal_acceptances.spec.ts" && node ace test unit --files="routes/" && node ace test unit --files="constants/" && npm run typecheck && npm run lint:terminology`
Expected: CA-1 a CA-17 en verde; guardrails en verde.

- [ ] **Step 3: Cotejo final contra el Definition of Done (§15 del spec)**

- Sub-slice completo con cero `any`; `docs/openapi.yaml` intacto (`git diff --name-only docs/` vacío); sin migraciones ni seeders; 403 del guard sin `code` y sin tocar `platform_admin_middleware.ts`.

- [ ] **Step 4: Commit**

```bash
git add tests/functional/platform_legal_acceptances.spec.ts
git commit -m "test: Cubrir acceso exclusivo de plataforma al listado"
```

---

### Task 9: Manual de QA (API) — playbook de prueba manual del endpoint

**Files:**
- Create: `docs/superpowers/plans/2026-09-30-estado-aceptacion-qa-api.md`
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (**archivo NO versionado**: se edita para sembrar, pero no se commitea)

**Interfaces:**
- Consumes: endpoint del Task 6 ya operativo; contrato exacto de §10 y cuerpos de 401/403/422 fijados por CA-13..CA-16.
- Produces: el playbook que la hermana landlord (USRH1790654705035) y QA humana recorren con un cliente de API (Postman/Insomnia/Bruno).

**Constantes del proyecto (tomadas de manuales anteriores y del repo — no se inventan):**
- URL base: `http://127.0.0.1:3333`
- Contraseña de todos los usuarios de prueba: `password`; dominio `@gsti-tests.local`
- Token de consola: `POST /api/platform/auth/login` con `{ "userEmail": …, "userPassword": "password" }` → `data.token`. Token de backoffice: `POST /api/auth/login` con el mismo body.
- **Este endpoint NO lleva header `X-Business-Unit-Id`** (ruta de plataforma, corre sin scope): cualquier manual anterior del BO lo exige; aquí documentarlo como ausencia a propósito.
- Seeder compartido (el mismo de todos los paneles, no se crea uno nuevo): `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`

- [ ] **Step 1: Extender el seeder compartido con los datos de esta HU**

En `_tmp_do_not_commit_qa_seeder.ts` (agregar una línea al docblock de historia del encabezado), sembrar con **fechas fijas** para que los responses del manual sean literales:

- Usuarios (`qa-aceptacion-<variante>@gsti-tests.local`, password `password`): `qa-aceptacion-plataforma` (plataforma, entra por el login de consola), `qa-aceptacion-owner-bo` (owner de un tenant, entra por el login del BO), `qa-aceptacion-plataforma-bo` (`isPlatformAdmin` que entra por el login del BO).
- Tres tenants con nombre único y reconocible: `QA Aceptacion Al Dia`, `QA Aceptacion Pendiente`, `QA Aceptacion Nunca` — el prefijo `QA Aceptacion` es la seña para distinguirlos de los datos de otras historias que comparten la base. Nombres sin acentos: los valores de dato se comparan con SQL literal y el acento viaja mal entre clientes mysql con charsets distintos.
- Documentos legales: Términos v1.0 (deja de ser vigente) y v2.0 (vigente, `published`, con `publishedAt` fija), Aviso v1.0 (vigente, `published`, fecha fija).
- Owner + membresía por tenant; aceptaciones con `userConsentAcceptedAt` fijas: el owner de `Al Dia` aceptó v2.0 del Aviso y de Términos; el de `Pendiente` aceptó solo Términos v1.0; el de `Nunca`, ninguna. Uno de los tres tenants lleva perfil fiscal con RFC fijo válido (para el escenario de búsqueda por RFC vía blind index).
- Idempotente: si se vuelve a correr, deja el estado sembrado de nuevo.

- [ ] **Step 2: Correr el seeder y cotejar los cuerpos literales**

Run: `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts`
Expected: salida del seeder sin errores; los tres tenants y los tres usuarios existen. Cada response que el manual declara debe ser el real (regla de manuales: si el contrato real difiere del borrador, va el real y se corrige el manual). Los cuerpos de 401/403/422 se toman de lo que CA-14/15/16/13 ya fijaron — nada se inventa.

- [ ] **Step 3: Escribir el manual siguiendo la regla `manual-qa-api`**

Estructura obligatoria:

1. **Problema / Solución / Ejemplo** (dos párrafos + una línea `Ejemplo:` en lenguaje cotidiano) + **glosario** de términos de negocio (`tenant`, `propietario de la cuenta`, `versión vigente`, `pendiente de volver a aceptar`).
2. **Preparar**: el único comando del seeder + tabla de usuarios con la variante de cada uno + aclaración de que la pantalla puede traer datos de otras historias y la seña para reconocer los propios (prefijo `QA Aceptacion`). Sin interruptores globales → no hay paso de limpieza (decirlo).
3. **Un escenario por variante**, cada uno abriendo con su `Objetivo:` (qué se comprueba, en lenguaje de negocio, sin repetir literal el del otro) y luego endpoint + response exacto:
   - Lista completa → 200 con los tres tenants en su estado (`al-dia`, `pendiente`, `nunca`), `currentVersions` y `meta`.
   - Filtro `status=pendiente` → solo los pendientes; filtro `status=al-dia` → solo los al día.
   - Búsqueda por nombre → la encuentra; búsqueda por RFC completo → la encuentra y la respuesta NO contiene el RFC; búsqueda sin coincidencias → 200 con `data: []`, `total: 0`.
   - Paginación (`limit=1`) → `meta` con `lastPage` calculado para el universo real sembrado.
   - Sin token → 401 con el cuerpo existente del middleware `auth`.
   - Token del BO de un owner → 403 con exactamente `{ "title": "Acceso restringido a plataforma", "detail": "Esta sección es exclusiva de administradores de plataforma.", "key": "AUTH.PLATFORM.FORBIDDEN" }`, sin `code`.
   - `isPlatformAdmin` con token del BO → el mismo 403 exacto.
   - `status=foo` (y `limit=101`) → 422 con el cuerpo de CA-13 literal.
4. Después del response del primer escenario, la lista **"Qué significa cada dato"** en lenguaje de negocio: `status` con sus cuatro valores enumerados y traducidos, `lastAcceptedAt`, `currentVersions`, `meta.total/page/limit/lastPage`. Los escenarios siguientes solo explican lo nuevo y remiten al primero.
5. **Checklist** con una casilla por escenario.

Prohibido en el manual: rutas de archivo, nombres de clases/servicios/validadores, "revisa el código de X". Las fechas del response van literales a las fechas fijas del seeder. Nadie de empresa cliente puede probar esto: solo consola.

- [ ] **Step 4: Verificación estructural del manual**

- Cada escenario abre con `Objetivo:` propio y distinto.
- Cada response lleva status + body exactos; ningún "debería fallar".
- Ningún id hardcodeado: las únicas identificaciones son nombres sembrados y query params.
- El manual no promete verificaciones imposibles con la base sembrada (regla de no mentir sobre el ambiente).

- [ ] **Step 5: Commit (solo el manual — el seeder no se commitea)**

```bash
git add docs/superpowers/plans/2026-09-30-estado-aceptacion-qa-api.md
git commit -m "docs: Agregar manual de QA del listado de aceptaciones de plataforma"
```

---

## Notas de ejecución

- **El anexo A del spec no existe** en el sistema (buscado en `~/Downloads`, el repo y `~/Documents/projects`). Este plan deriva las tres consultas de §4/§7/§11; si el anexo aparece durante la ejecución, cotejar contra él y reportar divergencias — no corregir el SQL en silencio si cambia el sentido.
- **Suite `unit` completa:** solo corren los tests de tabla de rutas y `resolveDocumentStatus` sin BD; la suite unit completa necesita `sae_pruebas` (regla del repo).
- **Conflictos de merge previstos** (§17): USRH1790610965394 importa `platform_legal_document_routes.js` tras `platform_system_module_routes.js`; este plan importa tras `platform_trial_routes.js`. Trivial si el orden se respeta.
- **Hermana landlord:** la rama `feature/USRH1790610965452-estado-aceptacion-por-tenant` debe crearse también en `valanserh-landlord` desde `multitenant` (§15) — repositorio distinto, fuera de este plan de API.