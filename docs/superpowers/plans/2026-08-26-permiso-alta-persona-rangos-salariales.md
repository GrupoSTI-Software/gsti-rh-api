# Exigir permiso en el alta de persona y en los rangos salariales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los dos boquetes de gobierno que encontró la responsable de RH: declarar cuatro decisiones configurables para rangos salariales de puestos (con gates en siete rutas), clasificar los cuatro importes de la bitácora como información financiera (efecto inmediato), y exigir `tab-persona-write` al dar de alta una persona destinada a colaborador sin romper el alta de clientes ni sobrecargos.

**Architecture:** Se reutiliza el `PermissionGate` declarativo ya construido (middleware + `PermissionGateService`), el patrón de enumeración de módulo (`actionsEnumerated: true` + catálogo propio + `actionsByModule`), y `sensitiveSerializeNumeric` para tapar importes por categoría legal (independiente del interruptor de exigencia). El alta de persona no usa `personIsCollaborator` (no hay `personId` todavía): el cliente declara `personSubjectType` en el cuerpo, con fallback fail-closed a `collaborator`. Los tres archivos del BO son obligatorios para que clientes y sobrecargos sigan pasando cuando se encienda la exigencia de `employees`.

**Tech Stack:** AdonisJS 6 (API `gsti-rh-api`), Nuxt 3 (BO `gsti-rh-bo`, 3 archivos), Lucid, `PermissionGateMiddleware`, `ensureSecondaryPermission`, `sensitiveSerializeNumeric`, `SystemPermissionCatalogSyncService` (seeder `0055`).

## Global Constraints

- Historia: **USRH1787433076995** · spec `spec-USRH1787433076995.md` · rama `feature/USRH*-permiso-alta-persona-rangos-salariales`.
- **Depende de (mergeada antes):** USRH1787433076994 — dueña de `sensitive_fields.ts`; esta HU añade 4 entradas **debajo** del bloque `PositionSalaryRange`, sin reordenar.
- **Sin migraciones, sin seeder nuevo, sin endpoints nuevos.**
- Las 4 acciones nuevas de `positions` nacen **sin conceder a nadie** y **sin `legacyEquivalence`** (nada sembrado bajo `systemModuleId: 3`).
- **No encender** `system_module_permission_enforcement_active` de `employees` ni de `positions` (decisión Wilvardo, posterior, por cliente).
- **No ampliar** `role_presets.ts` ni el catálogo tipado del BO (`sessionPermissions/**`).
- **No consumir** permisos de `positions` en pantallas del BO (otra HU).
- **No tocar** `personIsCollaborator`, `position_salary_range_controller.ts`, `employeeInfoForm/**`.
- Protección de importes de bitácora: aplica **desde el día 1** (no depende del interruptor).
- Gates de ruta + permiso secundario en `store`: **inertes** con exigencia apagada (estado de fábrica).
- Negativa HTTP 403: forma de `permission_gate_http.ts` — `{ title, detail, key }` con `key: 'PERM.DENIED'` o `'PERM.UNRESOLVED'`.
- Permiso de alta de colaborador: reutilizar `employees:tab-persona-write` (slug `tab-persona-write`) — **no inventar permiso nuevo**.
- Permiso de listado: reutilizar `employees:tab-persona-read`.
- Código y comentarios en español; identificadores en inglés; commits Conventional Commits (tipo en inglés, descripción en español).
- **Tests automatizados no se estiman** (regla del equipo); verificación manual según Task 8 y escenarios QA.
- **Drift resuelto (2026-08-26):** el spec listaba 3 consumidores de `POST /api/persons`, pero el BO tiene un **cuarto**: `gsti-rh-bo/components/pilotInfoForm/script.ts:148`. **Decisión tomada con el usuario:** se amplía el alcance de la API — `pilot` se agrega como quinto literal de `PERSON_SUBJECT_TYPES` en `app/constants/person_subject_type.ts` (Task 5), con el mismo tratamiento que `flight-attendant` (no exige permiso). El resolutor fail-closed cubre el caso de que el BO nunca llegue a declararlo.
- **Alcance recortado (2026-08-26, decisión del usuario):** esta HU queda **acotada exclusivamente a `gsti-rh-api`**. La Task 7 original (3-4 archivos de `gsti-rh-bo` declarando destino) **queda fuera de alcance** — no se crea rama ni se hacen commits en `gsti-rh-bo`. Consecuencia aceptada: hasta que una HU futura del BO declare `personSubjectType`, **todas** las llamadas actuales a `POST /api/persons` (colaborador, cliente, sobrecargo, piloto) seguirán cayendo fail-closed a `'collaborator'` una vez que se encienda la exigencia de `employees` — en ese momento el alta de clientes/sobrecargos/pilotos por el BO empezaría a exigir `tab-persona-write`, hasta que el BO se actualice. Es un riesgo conocido y aceptado explícitamente, no un defecto de esta implementación: el fail-closed es exactamente el comportamiento correcto para un cliente que no declara destino (regla de negocio 6 del spec). La verificación manual de Task 8 se ajusta para probar `POST /api/persons` con `personSubjectType` declarado vía llamadas HTTP directas, no a través del BO.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/constants/positions_permission_catalog.ts` | **Nuevo.** Tipo `PositionsSection`, 4 acciones del apartado `salary-ranges`. |
| `app/constants/positions_permission_declarations.ts` | **Nuevo.** Mapas `POSITIONS_READ/WRITE/DELETE/AUDIT` con helper `positionsStandard`. |
| `app/constants/person_subject_type.ts` | **Nuevo.** Literales, tipo y `resolvePersonSubjectType` fail-closed. |
| `app/constants/system_modules_catalog.ts` | `positions` → `actionsEnumerated: true`; actualizar docblock. |
| `app/constants/system_permission_catalog.ts` | Import + entrada `positions` en `actionsByModule` + re-export de tipos. |
| `start/routes/position_salary_range_routes.ts` | Gate declarativo en las 7 rutas (Anexo B). |
| `app/models/position_salary_range_audit.ts` | `serialize: sensitiveSerializeNumeric(...)` en 4 columnas. |
| `app/constants/sensitive_fields.ts` | +4 entradas `PositionSalaryRangeAudit`; actualizar conteo docblock. |
| `start/routes/person_routes.ts` | Gate en `GET /`; reescribir comentario USRH1785766406726. |
| `app/controllers/person_controller.ts` | `store`: resolver destino + `ensureSecondaryPermission` antes de validar. |
| `app/validators/person.ts` | `personSubjectType` opcional en `createPersonValidator`. |
| `gsti-rh-bo/resources/scripts/services/PersonService.ts` | `store(person, subjectType?)` envía destino en body. |
| `gsti-rh-bo/components/customerInfoForm/script.ts` | Declarar `'customer'`. |
| `gsti-rh-bo/components/flightAttendantInfoForm/script.ts` | Declarar `'flight-attendant'`. |
| `gsti-rh-bo/components/pilotInfoForm/script.ts` | Declarar `'pilot'` (drift resuelto — ver Global Constraints). |

**Sin cambios (condición de la HU):** `person_is_collaborator.ts`, `person_service.ts`, `position_salary_range_controller.ts`, `position_salary_range_service.ts`, `employees_permission_catalog.ts`, `role_presets.ts`, `database/migrations/**`, `database/seeders/**`, `employeeInfoForm/**`, `sessionPermissions/**`, `positionInfoForm/**`.

---

### Task 1: Catálogo de permisos del módulo `positions`

**Files:**
- Create: `app/constants/positions_permission_catalog.ts`
- Create: `app/constants/positions_permission_declarations.ts`

**Interfaces:**
- Consumes: `ActionCatalogEntry` de `#constants/permission_catalog_types`, `PermissionGateOptions` de `#constants/permission_gate`
- Produces:
  - `POSITIONS_PERMISSION_CATALOG` — 4 entradas `as const satisfies ActionCatalogEntry<PositionsSection>[]`
  - `PositionsSection` = `'salary-ranges'`
  - `PositionActionSlug` — unión de slugs
  - `POSITIONS_READ_PERMISSION_DECLARATIONS`, `POSITIONS_WRITE_PERMISSION_DECLARATIONS`, `POSITIONS_DELETE_PERMISSION_DECLARATIONS`, `POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS` — objetos con 7 claves totales para las rutas

- [ ] **Step 1: Crear `positions_permission_catalog.ts`**

```typescript
import type { ActionCatalogEntry } from '#constants/permission_catalog_types'

/** Sección en inglés: positions no tiene pestañas de UI como employees. */
export type PositionsSection = 'salary-ranges'

export const POSITIONS_PERMISSION_CATALOG = [
  {
    slug: 'salary-ranges-read',
    displayName: 'Ver rangos salariales del puesto',
    kind: 'read',
    section: 'salary-ranges',
    exceptionProfile: 'standard',
    // Sin legacyEquivalence: 0018 no siembra permisos con systemModuleId: 3.
  },
  {
    slug: 'salary-ranges-write',
    displayName: 'Registrar y corregir rangos salariales',
    kind: 'write',
    section: 'salary-ranges',
    exceptionProfile: 'standard',
  },
  {
    slug: 'salary-ranges-delete',
    displayName: 'Cerrar rangos salariales',
    kind: 'delete',
    section: 'salary-ranges',
    exceptionProfile: 'standard',
  },
  {
    slug: 'salary-ranges-audit-read',
    displayName: 'Consultar la bitácora del rango salarial',
    kind: 'read',
    section: 'salary-ranges',
    exceptionProfile: 'standard',
  },
] as const satisfies ActionCatalogEntry<PositionsSection>[]

export type PositionActionSlug = (typeof POSITIONS_PERMISSION_CATALOG)[number]['slug']
```

- [ ] **Step 2: Crear `positions_permission_declarations.ts`**

Molde: `employees_write_permission_declarations.ts:3-11`. Un solo archivo con dos mapas exportados (decisión consciente por tamaño — 7 claves):

```typescript
import type { PermissionGateOptions } from '#constants/permission_gate'
import type { PositionActionSlug } from '#constants/positions_permission_catalog'

const positionsStandard = (action: PositionActionSlug): PermissionGateOptions => ({
  module: 'positions',
  action,
  bypass: 'standard',
})

export const POSITIONS_READ_PERMISSION_DECLARATIONS = {
  indexSalaryRanges: positionsStandard('salary-ranges-read'),
  currentSalaryRange: positionsStandard('salary-ranges-read'),
  historySalaryRanges: positionsStandard('salary-ranges-read'),
} as const satisfies Record<string, PermissionGateOptions>

export const POSITIONS_WRITE_PERMISSION_DECLARATIONS = {
  storeSalaryRange: positionsStandard('salary-ranges-write'),
  updateSalaryRange: positionsStandard('salary-ranges-write'),
} as const satisfies Record<string, PermissionGateOptions>

export const POSITIONS_DELETE_PERMISSION_DECLARATIONS = {
  closeSalaryRange: positionsStandard('salary-ranges-delete'),
} as const satisfies Record<string, PermissionGateOptions>

export const POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS = {
  auditSalaryRange: positionsStandard('salary-ranges-audit-read'),
} as const satisfies Record<string, PermissionGateOptions>
```

- [ ] **Step 3: Verificar compilación**

Run: `npm run typecheck` (o `node ace build` si no hay script dedicado)
Expected: sin errores de tipos en los archivos nuevos

- [ ] **Step 4: Commit**

```bash
git add app/constants/positions_permission_catalog.ts app/constants/positions_permission_declarations.ts
git commit -m "feat: Declarar catálogo de permisos del módulo positions"
```

---

### Task 2: Registrar el módulo `positions` en el índice maestro

**Files:**
- Modify: `app/constants/system_modules_catalog.ts:13-16,28`
- Modify: `app/constants/system_permission_catalog.ts:10-13,33-35`

**Interfaces:**
- Consumes: `POSITIONS_PERMISSION_CATALOG`, `PositionsSection`, `PositionActionSlug`
- Produces: `SYSTEM_PERMISSION_CATALOG.actionsByModule.positions` disponible para sync y `validateCatalogIntegrity`

- [ ] **Step 1: Activar enumeración en `system_modules_catalog.ts`**

Cambiar línea 28:

```typescript
{ slug: 'positions', legacySystemModuleId: 3, actionsEnumerated: true },
```

Actualizar docblock `:13-16` — ya no es "solo `employees`"; mencionar que `positions` también está enumerado (USRH1787433076995).

- [ ] **Step 2: Agregar entrada en `system_permission_catalog.ts`**

```typescript
import { POSITIONS_PERMISSION_CATALOG } from '#constants/positions_permission_catalog'
// ...
export { POSITIONS_PERMISSION_CATALOG } from '#constants/positions_permission_catalog'
export type { PositionsSection, PositionActionSlug } from '#constants/positions_permission_catalog'

export const SYSTEM_PERMISSION_CATALOG: SystemPermissionCatalog = {
  modules: SYSTEM_MODULES_CATALOG,
  actionsByModule: {
    employees: EMPLOYEES_PERMISSION_CATALOG,
    positions: POSITIONS_PERMISSION_CATALOG,
  },
}
```

- [ ] **Step 3: Verificar integridad del catálogo**

Run: `node ace permissions:check-consistency`
Expected: las 4 acciones de `positions` aparecen en `declaredNotRegistered` (esperado **antes** de sembrar); `knownDebtModules` **ya no incluye** `positions`

- [ ] **Step 4: Commit**

```bash
git add app/constants/system_modules_catalog.ts app/constants/system_permission_catalog.ts
git commit -m "feat: Enumerar permisos del módulo positions en el índice maestro"
```

---

### Task 3: Gates declarativos en las 7 rutas de rangos salariales

**Files:**
- Modify: `start/routes/position_salary_range_routes.ts:6-12`

**Interfaces:**
- Consumes: declaraciones de Task 1
- Produces: rutas protegidas según Anexo B

- [ ] **Step 1: Añadir imports y gates**

```typescript
import {
  POSITIONS_READ_PERMISSION_DECLARATIONS,
  POSITIONS_WRITE_PERMISSION_DECLARATIONS,
  POSITIONS_DELETE_PERMISSION_DECLARATIONS,
  POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS,
} from '#constants/positions_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/position_salary_range_controller.store')
      .use(middleware.permissionGate(POSITIONS_WRITE_PERMISSION_DECLARATIONS.storeSalaryRange))
    router
      .get('/', '#controllers/position_salary_range_controller.index')
      .use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.indexSalaryRanges))
    router
      .get('/current', '#controllers/position_salary_range_controller.current')
      .use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.currentSalaryRange))
    router
      .get('/history', '#controllers/position_salary_range_controller.history')
      .use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.historySalaryRanges))
    router
      .patch('/:positionSalaryRangeId', '#controllers/position_salary_range_controller.update')
      .use(middleware.permissionGate(POSITIONS_WRITE_PERMISSION_DECLARATIONS.updateSalaryRange))
    router
      .get('/:positionSalaryRangeId/audit', '#controllers/position_salary_range_controller.audit')
      .use(middleware.permissionGate(POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS.auditSalaryRange))
    router
      .delete('/:positionSalaryRangeId', '#controllers/position_salary_range_controller.close')
      .use(middleware.permissionGate(POSITIONS_DELETE_PERMISSION_DECLARATIONS.closeSalaryRange))
  })
```

- [ ] **Step 2: Verificar que ninguna ruta quedó sin gate**

Run: `grep -n "permissionGate" start/routes/position_salary_range_routes.ts | wc -l`
Expected: **7**

- [ ] **Step 3: Commit**

```bash
git add start/routes/position_salary_range_routes.ts
git commit -m "feat: Exigir permiso en las siete rutas de rangos salariales"
```

---

### Task 4: Clasificar importes de bitácora como información financiera

**Files:**
- Modify: `app/models/position_salary_range_audit.ts:86-149`
- Modify: `app/constants/sensitive_fields.ts:80,195-199` (añadir **debajo** del bloque `PositionSalaryRange`)

**Interfaces:**
- Consumes: `sensitiveSerializeNumeric` de `#helpers/sensitive_serialize`
- Produces: serialización condicional en audit; +4 entradas en `SENSITIVE_FIELDS`

- [ ] **Step 1: Añadir `serialize` en las 4 columnas del modelo**

Importar al inicio:

```typescript
import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'
```

En cada `@column` de `oldMinSalaryDaily`, `oldMaxSalaryDaily`, `newMinSalaryDaily`, `newMaxSalaryDaily`, agregar **solo** `serialize` (no tocar `prepare`/`consume` ni `serializeAs`):

```typescript
@column({
  prepare: (value: number | string | null) =>
    value !== null && value !== undefined ? encryption.encrypt(String(value)) : null,
  consume: (value: string | null) => {
    if (value === null || value === undefined) return null
    try {
      return Number(encryption.decrypt(value))
    } catch {
      return value
    }
  },
  serialize: sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'oldMinSalaryDaily'),
})
declare oldMinSalaryDaily: number | null
```

(Repetir con el nombre de columna correcto para las otras tres.)

- [ ] **Step 2: Registrar en `sensitive_fields.ts`**

Añadir al final del arreglo, después del bloque `PositionSalaryRange`:

```typescript
// ─── PositionSalaryRangeAudit: financiero (YA CIFRADO, faltaba serialize) ──
// Espejo auditado del rango. Ancla: app/models/position_salary_range_audit.ts
{ model: 'PositionSalaryRangeAudit', column: 'oldMinSalaryDaily', legalCategory: 'financiero', treatment: 'cifrar', encrypted: true },
{ model: 'PositionSalaryRangeAudit', column: 'oldMaxSalaryDaily', legalCategory: 'financiero', treatment: 'cifrar', encrypted: true },
{ model: 'PositionSalaryRangeAudit', column: 'newMinSalaryDaily', legalCategory: 'financiero', treatment: 'cifrar', encrypted: true },
{ model: 'PositionSalaryRangeAudit', column: 'newMaxSalaryDaily', legalCategory: 'financiero', treatment: 'cifrar', encrypted: true },
```

Actualizar docblock `:80`: contar con `grep -c "model: '" app/constants/sensitive_fields.ts` (esperado **32** si USRH1787433076994 ya está mergeada; **28→32** según baseline del spec).

- [ ] **Step 3: Verificar wiring**

Run: `grep "sensitiveSerializeNumeric('PositionSalaryRangeAudit'" app/models/position_salary_range_audit.ts | wc -l`
Expected: **4**

- [ ] **Step 4: Commit**

```bash
git add app/models/position_salary_range_audit.ts app/constants/sensitive_fields.ts
git commit -m "fix: Ocultar importes de bitácora salarial sin permiso financiero"
```

---

### Task 5: Criterio de destino del alta de persona (API)

**Files:**
- Create: `app/constants/person_subject_type.ts`
- Modify: `app/validators/person.ts:6-7`
- Modify: `app/controllers/person_controller.ts:312-365` (método `store`)

**Interfaces:**
- Consumes: `ensureSecondaryPermission`, `EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION`
- Produces:
  - `PERSON_SUBJECT_TYPES` (5 literales — el spec original declaraba 4; `'pilot'` se agregó por drift resuelto con el usuario, ver Global Constraints), `PersonSubjectType`, `resolvePersonSubjectType(raw: unknown): PersonSubjectType`
  - `store` exige permiso solo cuando destino resuelto es `'collaborator'`

- [ ] **Step 1: Crear `person_subject_type.ts`**

```typescript
export const PERSON_SUBJECT_TYPES = [
  'collaborator',
  'customer',
  'flight-attendant',
  'pilot',
  'system-user',
] as const

export type PersonSubjectType = (typeof PERSON_SUBJECT_TYPES)[number]

const NON_COLLABORATOR_SUBJECTS = new Set<PersonSubjectType>([
  'customer',
  'flight-attendant',
  'pilot',
  'system-user',
])

/**
 * Resuelve el destino declarado en el alta de persona.
 * Ausente, vacío o desconocido → 'collaborator' (fail-closed).
 */
export function resolvePersonSubjectType(raw: unknown): PersonSubjectType {
  if (typeof raw !== 'string') {
    return 'collaborator'
  }
  const normalized = raw.trim()
  if (normalized === '') {
    return 'collaborator'
  }
  if ((PERSON_SUBJECT_TYPES as readonly string[]).includes(normalized)) {
    return normalized as PersonSubjectType
  }
  return 'collaborator'
}

export function personSubjectRequiresCollaboratorWritePermission(
  subjectType: PersonSubjectType
): boolean {
  return !NON_COLLABORATOR_SUBJECTS.has(subjectType)
}
```

- [ ] **Step 2: Añadir campo opcional al validador**

En `createPersonValidator`, como primer campo del objeto (antes de `personFirstname`):

```typescript
import { PERSON_SUBJECT_TYPES } from '#constants/person_subject_type'

// dentro de vine.object({...}):
personSubjectType: vine.enum(PERSON_SUBJECT_TYPES).optional(),
```

Valores fuera de la enumeración → `422` (no llegan al resolutor fail-closed).

- [ ] **Step 3: Modificar `person_controller.store`**

Imports:

```typescript
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import { EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION } from '#constants/employees_write_permission_declarations'
import {
  resolvePersonSubjectType,
  personSubjectRequiresCollaboratorWritePermission,
} from '#constants/person_subject_type'
```

Al inicio de `store`, **antes** de armar el objeto y **antes** de `request.validateUsing`:

```typescript
async store(ctx: HttpContext) {
  const { request, response, i18n } = ctx
  try {
    const subjectType = resolvePersonSubjectType(request.input('personSubjectType'))
    if (personSubjectRequiresCollaboratorWritePermission(subjectType)) {
      const allowed = await ensureSecondaryPermission(
        ctx,
        EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION
      )
      if (!allowed) {
        return
      }
    }
    // ... resto sin cambio (inputs, validateUsing, create, respuesta 201)
```

Actualizar bloque swagger del `store` (`:230-234` aprox.): documentar `personSubjectType` como enum opcional con los 5 literales y nota de que no se persiste.

- [ ] **Step 4: Verificar que `update`/`delete` no se tocaron**

Run: `grep -n "personSubjectType" app/controllers/person_controller.ts`
Expected: solo referencias en `store` y swagger de `store`

- [ ] **Step 5: Commit**

```bash
git add app/constants/person_subject_type.ts app/validators/person.ts app/controllers/person_controller.ts
git commit -m "feat: Exigir permiso de persona al dar de alta un colaborador"
```

---

### Task 6: Gate de listado de personas

**Files:**
- Modify: `start/routes/person_routes.ts:4-12`

**Interfaces:**
- Consumes: `EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION` de `employees_read_permission_declarations.ts`
- Produces: `GET /api/persons` protegido con `tab-persona-read`

- [ ] **Step 1: Reescribir comentario y montar gate en `index`**

Reemplazar comentario `:4-9` — hoy dice que el control vive solo en `update`/`delete`; el criterio nuevo incluye `index` (gate declarativo) y `store` (controlador).

```typescript
import { EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION } from '#constants/employees_read_permission_declarations'

// USRH1787433076995 — `/api/persons` sigue siendo superficie compartida.
// `GET /` exige tab-persona-read (gate declarativo).
// `POST /` exige tab-persona-write solo cuando personSubjectType resuelve a collaborator (controlador).
// `PUT`/`DELETE` conservan evaluación por vínculo (personIsCollaborator + ensureSecondaryPermission).

router
  .group(() => {
    router
      .get('/', '#controllers/person_controller.index')
      .use(middleware.permissionGate(EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION))
    router.post('/', '#controllers/person_controller.store')
    // ...
```

**No** montar gate en `POST /` — es condicional por destino.

- [ ] **Step 2: Confirmar cero consumidores de `GET /api/persons` en BO**

Run (desde repo BO):

```bash
grep -rn "/persons" gsti-rh-bo --include="*.ts" --include="*.vue" | grep -v node_modules
```

Expected: **ninguna** llamada a colección `GET /persons` (solo `POST`, `PUT`, `GET /:id`)

- [ ] **Step 3: Commit**

```bash
git add start/routes/person_routes.ts
git commit -m "feat: Exigir permiso de lectura en el listado de personas"
```

---

### Task 7: FUERA DE ALCANCE (decisión del usuario, 2026-08-26)

**Esta task no se ejecuta.** El usuario acotó esta HU exclusivamente a `gsti-rh-api`; no se toca `gsti-rh-bo`, no se crea rama ahí ni se hacen commits. El texto original queda documentado abajo únicamente como referencia histórica de lo que el spec pedía — **no ejecutar ninguno de estos pasos**.

<details>
<summary>Texto original de la task (no ejecutar)</summary>

**Repo:** este task se ejecuta en `gsti-rh-bo` (repositorio distinto de `gsti-rh-api`), un checkout hermano en `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-bo`. Commits y verificación corren ahí, no en `gsti-rh-api`.

**Files:**
- Modify: `gsti-rh-bo/resources/scripts/services/PersonService.ts:39-53`
- Modify: `gsti-rh-bo/components/customerInfoForm/script.ts:113`
- Modify: `gsti-rh-bo/components/flightAttendantInfoForm/script.ts:148`
- Modify: `gsti-rh-bo/components/pilotInfoForm/script.ts:148` (drift resuelto con el usuario — el spec original solo listaba 3 archivos; el barrido de código encontró un cuarto consumidor de `POST /api/persons` y se decidió ampliar el alcance con el mismo tratamiento que `flight-attendant`)

**Interfaces:**
- Consumes: API acepta `personSubjectType` opcional, con 5 literales (`PERSON_SUBJECT_TYPES` de Task 5)
- Produces: clientes, sobrecargos y pilotos envían destino no-colaborador; colaborador omite campo (default correcto vía `employeeService.storePerson`)

- [ ] **Step 1: Tipar y extender `PersonService.store`**

Crear tipo local (sin `any`):

```typescript
export type PersonSubjectType =
  | 'collaborator'
  | 'customer'
  | 'flight-attendant'
  | 'pilot'
  | 'system-user'

async store(person: PeopleInterface, subjectType?: PersonSubjectType) {
  const headers = { ...this.GENERAL_HEADERS }
  let responseRequest: any = null
  try {
    await $fetch(`${this.API_PATH}/persons`, {
      headers,
      method: 'POST',
      body: subjectType ? { ...person, personSubjectType: subjectType } : { ...person },
      // ...
```

Cuando `subjectType` es `undefined`, no enviar el campo (comportamiento del formulario de colaborador).

- [ ] **Step 2: Declarar destino en formularios**

`customerInfoForm/script.ts:113`:

```typescript
personResponse = await personService.store(this.customer.person, 'customer')
```

`flightAttendantInfoForm/script.ts:148`:

```typescript
personResponse = await personService.store(this.flightAttendant.person, 'flight-attendant')
```

`pilotInfoForm/script.ts:148`:

```typescript
personResponse = await personService.store(this.pilot.person, 'pilot')
```

- [ ] **Step 3: Verificar consumidores de `POST /api/persons`**

Run:

```bash
grep -rn "personService.store\|storePerson" gsti-rh-bo --include="*.ts"
```

Expected: **4** consumidores — `customerInfoForm`, `flightAttendantInfoForm`, `pilotInfoForm` (los tres declarando destino explícito) y `employeeInfoForm` (vía `employeeService.storePerson` → mismo endpoint, sin declarar — cae fail-closed a `collaborator`, comportamiento correcto). Si aparece un quinto consumidor no contemplado, detener y escalar antes de continuar (mismo criterio que resolvió el drift de `pilotInfoForm`).

- [ ] **Step 4: Commit (en repo BO)**

```bash
git add resources/scripts/services/PersonService.ts components/customerInfoForm/script.ts components/flightAttendantInfoForm/script.ts components/pilotInfoForm/script.ts
git commit -m "feat: Declarar destino del alta de persona en clientes, sobrecargos y pilotos"
```

</details>

---

### Task 8: Sincronización, consistencia y verificación manual

**Files:**
- Verify only (sin cambios de código)

- [ ] **Step 1: Sembrar catálogo dos veces**

Run (API):

```bash
node ace db:seed
node ace db:seed
```

Expected:
- 1.ª pasada: `createdPermissionSlugs` incluye las **4** de `positions`
- 2.ª pasada: `createdPermissionSlugs` **vacío**
- `SELECT count(*) FROM role_system_permissions` idéntico antes/después

- [ ] **Step 2: Consistencia del catálogo**

Run: `node ace permissions:check-consistency`
Expected tras sembrar: `declaredNotRegistered` y `registeredNotDeclared` **sin entradas nuevas**; `knownDebtModules` sin `positions`

- [ ] **Step 3: Árbol de sesión**

`GET /api/auth/session/permissions` con rol no privilegiado:
- nodo `positions` con `sections` **no vacío** (1 sección, 4 acciones)
- ningún rol gana ni pierde concesiones existentes (comparar `allowed: true` antes/después)

- [ ] **Step 4: Matriz manual — rangos salariales (CA-2)**

Con exigencia de `positions` **OFF** (default): las 7 rutas responden como hoy.

Con exigencia **ON** y rol con solo `salary-ranges-read`:
- `GET /`, `GET /current`, `GET /history` → 200
- `POST /`, `PATCH /:id`, `DELETE /:id` → 403 `PERM.DENIED`
- `GET /:id/audit` → 403 (falta `salary-ranges-audit-read`)

Negativa esperada:

```json
{
  "title": "Sin permiso",
  "detail": "No tienes permiso para realizar esta operación.",
  "key": "PERM.DENIED"
}
```

- [ ] **Step 5: Matriz manual — bitácora (CA-3, efecto inmediato)**

`GET /api/position-salary-ranges/:id/audit`:
- Rol **sin** `sensitive-financiero-read`: `oldMinSalaryDaily`, `oldMaxSalaryDaily`, `newMinSalaryDaily`, `newMaxSalaryDaily` en **`null`**; `action`, `actorId`, `reason`, fechas intactos
- Rol **con** `sensitive-financiero-read`: los cuatro importes completos
- Funciona **con exigencia de positions apagada**

- [ ] **Step 6: Matriz manual — alta de persona (CA-4, CA-5)**

**Nota de alcance:** Task 7 (declarar destino en el BO) quedó fuera de alcance por decisión del usuario. Esta verificación se hace con llamadas HTTP directas a la API (curl/Postman), simulando lo que el BO enviaría, en vez de a través de las pantallas reales del BO.

Con exigencia de `employees` **ON** y rol **sin** `tab-persona-write`:
- `POST /api/persons` sin `personSubjectType` → 403, **no** fila en `persons`
- `POST /api/persons` con `personSubjectType: 'customer'` → 201
- `POST /api/persons` con `personSubjectType: 'flight-attendant'` → 201
- `POST /api/persons` con `personSubjectType: 'pilot'` → 201
- `POST /api/persons` con `personSubjectType: 'collaborator'` → 403 (mismo trato que ausente)
- `POST /api/persons` con `personSubjectType: 'valor-invalido'` **y rol sin `tab-persona-write`** → 403 (el resolutor fail-closed lo trata como `'collaborator'` y el chequeo de permiso corre antes que la validación del enum — comportamiento correcto, ver Anexo C y "Notas para IA" del spec: "en la duda, se pide permiso" y la comprobación va antes de `validateUsing`)
- `POST /api/persons` con `personSubjectType: 'valor-invalido'` **y rol con `tab-persona-write`** → 422 (el chequeo de permiso pasa, y ahí sí el validador rechaza el enum inválido)

Con exigencia **OFF**: todo responde como antes del merge (los 9 gates nuevos son inertes).

`GET /api/persons` con exigencia ON y sin `tab-persona-read` → 403.

**Riesgo aceptado y documentado (no corregir en esta HU):** mientras el BO (`gsti-rh-bo`) no declare `personSubjectType`, las llamadas reales desde `customerInfoForm`, `flightAttendantInfoForm` y `pilotInfoForm` seguirán sin ese campo y caerán fail-closed a `collaborator`. Esto significa que, el día que alguien encienda la exigencia de `employees` en un cliente, el alta real de clientes/sobrecargos/pilotos desde el BO empezará a exigir `tab-persona-write` hasta que una HU futura actualice el BO. Documentar esto en el PR.

- [ ] **Step 7: Lint y tipos**

Run en ambos repos:

```bash
npm run lint
npm run typecheck
```

Expected: limpio, **cero `any`** nuevo (incluido parámetro de `PersonService.store`)

- [ ] **Step 8: Commit final de deuda documentada (si aplica)**

Si quedó abierto el drift de `pilotInfoForm`, documentar en el PR body la decisión pendiente con Wilvardo.

---

## Self-Review (spec coverage)

| Requisito | Task |
|-----------|------|
| 4 decisiones nuevas en Roles (módulo `positions`) | Task 1, 2 |
| 7 rutas con gate | Task 3 |
| 4 importes de bitácora clasificados financiero + null sin permiso | Task 4 |
| Alta colaborador pide `tab-persona-write` | Task 5 |
| Destino declarado, fail-closed | Task 5, 7 |
| Listado personas pide `tab-persona-read` | Task 6 |
| Interruptor apagado → gates inertes | Task 8 (verificación OFF) |
| Nuevas decisiones sin conceder | Task 8 Step 1 |
| Protección importes desde día 1 | Task 4, 8 Step 5 |
| BO: 4 archivos obligatorios (3 del spec + `pilotInfoForm` por drift resuelto) | **Fuera de alcance** — decisión del usuario, Task 7 no se ejecuta |
| Sin migraciones / sin seeder nuevo | Global Constraints |
| Regla 11: nómina/reportes sin cambio | No hay task que los toque ✓ |

**Gap resuelto (API):** cuarto consumidor `pilotInfoForm` — el enum de la API ya cubre `'pilot'` (Task 5), no queda abierto del lado de la API.

**Alcance recortado (BO):** por decisión explícita del usuario, esta ejecución no toca `gsti-rh-bo`. El riesgo de que el alta de clientes/sobrecargos/pilotos empiece a exigir permiso cuando se encienda `employees` (por no declarar destino desde el BO) queda documentado como deuda aceptada, no como defecto de esta implementación.

**Placeholder scan:** ninguno.

**Type consistency:** slugs `salary-ranges-*`, `PersonSubjectType`, mapas de declaraciones alineados entre Tasks 1–3.

---

## Dependencias y coordinación

- **Entra después de:** USRH1787433076994 (clasificar salario diario) — comparte `sensitive_fields.ts`.
- **Espeja criterio de:** USRH1787433076991 (enumeración de módulo attendance monitor).
- **Hereda decisión de encendido de:** USRH1786931495734 (exigencia módulo `employees`).
- **Fuera de alcance:** `role_presets.ts`, consumo BO de permisos `positions`, USRH1787204602831 (escritura por categoría).

---

## Estimación (del spec)

12 h · 3 SP · complejidad L — reparto: catálogo positions 2.75 h · destino alta 2.75 h · gates 0.75 h · serialize 1 h · BO 0.75 h · verificación manual 3.5 h · PR 0.5 h.

**Corte si rebasa (en orden):** (1) fusionar `salary-ranges-audit-read` bajo `salary-ranges-read`; (2) posponer gate de `GET /api/persons`. Los frentes de catálogo positions y destino del alta **no son cortables**.
