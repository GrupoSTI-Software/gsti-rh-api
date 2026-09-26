# Escritura sensible por categoría legal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exigir el permiso `sensitive-<categoria>-write` solo cuando una columna clasificada **cambia de valor**, en alta y en edición, con rechazo atómico y 403 `{ title, detail, key, code }` que nombra la categoría y nunca el valor.

**Architecture:** Un mixin Lucid `withSensitiveWriteGuard()` registra `before('save')` y compara `$dirty` contra `$original` con `normalizeToken`. La categoría sale de `SensitiveFieldsCatalogService.categoryOf`. El permiso se lee síncrono de `SensitiveAccessContext` (ALS ya abierto por la orden 30). El hook lanza `SensitiveDataWriteError`; cada `catch` HTTP lo traduce a 403. Fuera de petición (sin ALS) el mixin no hace nada. La renovación del token biométrico en la consulta de foto corre dentro de `runUnguarded`.

**Tech Stack:** AdonisJS 6, Lucid, AsyncLocalStorage, `PermissionGateService.evaluateEnforced`, catálogo `SENSITIVE_FIELDS`, Japa (unitarios del motor y del cableado; la matriz HTTP de los CA se valida a mano).

## Global Constraints

- Historia: USRH1787204602831 · orden 32 · tercera del tramo API. Spec fuente: `spec-USRH1787204602831.md` (anexo del usuario). **No va a Asana.**
- Rebanada **solo API**. Cero líneas de `valanserh-bo`. Sin migraciones. Sin seeders. Sin endpoints nuevos. Sin tocar `SENSITIVE_FIELDS`, `role_presets.ts`, ni `employees_permission_catalog.ts`.
- Target de rama: la rama de la orden 31 (`feature/USRH1787204602828-lectura-sensibles-columnas-2`), no `multitenant`.
- Gobierna **20 de 27** columnas del catálogo (las 20 de los 10 modelos de expediente). Fuera, con dueño Wilvardo: `ContractorCompany.rfc`, `TenantBillingProfile.rfc`, `EmployeeSalaryHistory.dailySalary`, `PositionSalaryRange.minDailySalary` / `maxDailySalary`, `UserConsent.ip` / `userAgent`, y `Employee.currentDailySalary` (ni cifrado ni clasificado).
- Eco de máscara e importación Excel **no se neutralizan aquí** (orden 33). El mixin **sí** se dispara en el import HTTP si hay transición real: es petición de usuario. No envolver el import en `runUnguarded`. El código `EMP.SENS.WRITE.IMPORT_FORBIDDEN` **no se declara** (constante muerta).
- `evaluate` no se toca. `evaluateEnforced` ya existe en `PermissionGateService` (orden 30). Verificarlo al empezar; si faltara, **parar y escalar**. No reimplementarlo. No llamar a `evaluate` para escritura sensible.
- `module-not-enforced` no otorga escritura sensible. Fail-closed de permiso: `unresolved` → 403 `EMP.SENS.WRITE.UNRESOLVED`. Fail-open de contexto: sin ALS (comandos, seeders, jobs) el mixin no exige.
- Bypass `standard`: `root` y `owner` escriben sin los cinco slugs. `super-administrador` sí necesita el permiso.
- Un gate por ruta. Prohibido montar `permissionGate(sensitive-*-write)` en rutas. Prohibido `RoleService.hasAccess`.
- La exigencia se dispara por **transición de valor**, no por presencia de la clave. `null` / `undefined` / `''` son equivalentes (`normalizeToken`).
- Petición mixta: rechazo total (un `save()`, un throw antes de persistir).
- Alta = misma regla. Consulta nunca 403 de escritura (CA-6: `runUnguarded` solo en `updateToken`).
- Código, comentarios y docs del cambio en español; identificadores en inglés.
- Commits: Conventional Commits, tipo en inglés, descripción en español.
- La HU declara que no hay suite HTTP nueva. Igual que las órdenes 30/31, sí hay unitarios Japa del motor, del mapa de slugs, del ALS y del cableado (mixin + `catch`). Los 8 CA se validan a mano y el resultado literal va en el PR.
- **Drift de nombres respecto al spec (aplicar en silencio):** el código real usa `canRead` / `isActive` / `run` / `evaluateEnforced` / `EMPLOYEES_SENSITIVE_READ_PERMISSIONS` / `categoryOf` / `withBusinessUnitScope` / `normalizeToken` (hoy **privada** en `app/helpers/employee_termination_record.ts`) / `resources/langs/{es,en}.json` / `start/kernel.ts` (`sensitiveAccess`). No inventar los alias del spec (`canRead`, `evaluateEnforced`, `start/kernel.ts`, etc.).
- **Drift necesario del store (documentado, no se escala):** el spec pide `write: Record<LegalCategory, boolean>`, pero el CA-7 exige distinguir `denied` de `unresolved`. El store de escritura es tri-estado `'allowed' | 'denied' | 'unresolved'`. `canWrite(category)` sigue siendo boolean (`=== 'allowed'`, si no `false`).
- **Orden de categoría en el 403 mixto:** `LEGAL_CATEGORIES` hoy es `identificacion, financiero, biometrico, salud, contacto`. El CA-3 pide `identificacion → contacto → financiero → salud → biometrico`. No se reordena `LEGAL_CATEGORIES` (rompería iteración de lectura). Se declara `SENSITIVE_WRITE_CATEGORY_ORDER` solo para el mensaje de denegación.
- Anclas del spec validadas el 2026-08-24 contra este árbol. Drift trivial de líneas `compose(...)`: usar las líneas reales de cada modelo (Task 7), no las del Anexo A del spec.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/constants/sensitive_data_write_error_codes.ts` | `EMP.SENS.WRITE.FORBIDDEN` y `UNRESOLVED`. Archivo propio; no mezclar con `EMP.SENS.READ.*`. |
| `app/exceptions/sensitive_data_write_error.ts` | Excepción de dominio. Carga `errorCode`, `httpStatus=403`, `category` opcional. **Cero valores de dato** en `message`/`detail`. |
| `app/helpers/sensitive_data_write_api_error.ts` | `isSensitiveDataWriteError` + `respondSensitiveDataWriteDenial(ctx, error)` → `{ title, detail, key, code }`. |
| `app/constants/employees_write_permission_declarations.ts` | `EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS: Record<LegalCategory, PermissionGateOptions>`. |
| `app/utils/sensitive_access_context.ts` | Store `{ read, write, unguarded? }`. `canRead` sobre `read`. Nuevos `canWrite`, `writeDecision`, `isUnguarded`, `runUnguarded`. `run` pasa a recibir el store completo. |
| `app/helpers/sensitive_read_decisions.ts` | Además de lectura, resuelve las 5 escrituras con `evaluateEnforced` y abre el store combinado. El nombre del helper **no se renombra** (evitar drive-by en 3 middlewares). |
| `app/helpers/employee_termination_record.ts` | Exportar `normalizeToken` (hoy función privada). |
| `app/mixins/with_sensitive_write_guard.ts` | `assertSensitiveWriteAllowed` + factory `withSensitiveWriteGuard()`. `before('save')`. |
| 10 modelos del Anexo A | Una llamada `withSensitiveWriteGuard()` en su `compose(...)`. |
| `app/services/employee_biometric_face_id_service.ts` | `updateToken` envuelto en `runUnguarded`. |
| 10 controllers del Anexo B + 2 extras de censo | Primera línea del `catch`: reconocer la excepción y devolver 403. |
| `resources/langs/es.json` / `en.json` | Títulos, detalles y etiquetas de categoría. |
| Tests unitarios listados por tarea | Motor, mapa, ALS, helper HTTP, mixin, cableado, censo. |

**No se modifica:** `app/services/permission_gate_service.ts` · `app/constants/sensitive_fields.ts` (salvo que se reexporte el orden de escritura desde otro archivo) · `app/constants/employees_permission_catalog.ts` · `app/constants/role_presets.ts` · `app/helpers/sensitive_mask.ts` · `app/helpers/sensitive_serialize.ts` · `app/validators/*` · `start/kernel.ts` · `start/routes/*` (el censo **verifica** montaje; no agrega `permissionGate` de categoría). · migraciones · seeders.

**Callers de `SensitiveAccessContext.run` que hay que migrar al nuevo store (Task 4):** `app/helpers/sensitive_read_decisions.ts`, `tests/unit/utils/sensitive_access_context.spec.ts`, `tests/unit/helpers/sensitive_serialize.spec.ts`, `tests/unit/helpers/sensitive_read_decisions.spec.ts`, `tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts`.

---

### Task 1: Códigos `EMP.SENS.WRITE.*` y excepción de dominio

**Files:**
- Create: `app/constants/sensitive_data_write_error_codes.ts`
- Create: `app/exceptions/sensitive_data_write_error.ts`
- Test: `tests/unit/constants/sensitive_data_write_error_codes.spec.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN: 'EMP.SENS.WRITE.FORBIDDEN'`
  - `SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED: 'EMP.SENS.WRITE.UNRESOLVED'`
  - `type SensitiveDataWriteErrorCode`
  - `class SensitiveDataWriteError` con `errorCode`, `httpStatus` (403), `category?: LegalCategory`

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/constants/sensitive_data_write_error_codes.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'

test.group('SENSITIVE_DATA_WRITE_ERROR_CODES', () => {
  test('declara FORBIDDEN y UNRESOLVED con convención EMP.SENS.WRITE', ({ assert }) => {
    assert.equal(SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN, 'EMP.SENS.WRITE.FORBIDDEN')
    assert.equal(SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED, 'EMP.SENS.WRITE.UNRESOLVED')
  })

  test('no declara IMPORT_FORBIDDEN (lo emite la orden 33)', ({ assert }) => {
    assert.notProperty(SENSITIVE_DATA_WRITE_ERROR_CODES, 'IMPORT_FORBIDDEN')
  })
})

test.group('SensitiveDataWriteError', () => {
  test('es 403, expone categoría y no mete valores en el message', ({ assert }) => {
    const error = new SensitiveDataWriteError(
      SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN,
      'financiero'
    )
    assert.equal(error.httpStatus, 403)
    assert.equal(error.errorCode, 'EMP.SENS.WRITE.FORBIDDEN')
    assert.equal(error.category, 'financiero')
    assert.notInclude(error.message.toLowerCase(), 'clabe')
    assert.notMatch(error.message, /\d{10,}/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/constants/sensitive_data_write_error_codes.spec.ts`
Expected: FAIL — no encuentra el módulo `#constants/sensitive_data_write_error_codes`.

- [ ] **Step 3: Write minimal implementation**

`app/constants/sensitive_data_write_error_codes.ts`:

```typescript
/**
 * Catálogo ÚNICO de códigos de error de escritura de datos sensibles
 * (cadena CAP-06-01-09, tramo API, orden 32 / USRH1787204602831).
 *
 * Convención: `EMP.SENS.WRITE.<SEMANTICO>` en SCREAMING_SNAKE, sin numeración.
 * Archivo propio: no mezclar con `EMP.SENS.READ.*`.
 * `EMP.SENS.WRITE.IMPORT_FORBIDDEN` lo agrega la orden 33; no se declara aquí.
 */
export const SENSITIVE_DATA_WRITE_ERROR_CODES = {
  /** Transición real de un dato sensible sin el permiso de su categoría — 403. */
  FORBIDDEN: 'EMP.SENS.WRITE.FORBIDDEN',
  /** El motor no pudo determinar el permiso; fail-closed — 403. */
  UNRESOLVED: 'EMP.SENS.WRITE.UNRESOLVED',
} as const

export type SensitiveDataWriteErrorCode =
  (typeof SENSITIVE_DATA_WRITE_ERROR_CODES)[keyof typeof SENSITIVE_DATA_WRITE_ERROR_CODES]
```

`app/exceptions/sensitive_data_write_error.ts`:

```typescript
import type { LegalCategory } from '#constants/sensitive_fields'
import type { SensitiveDataWriteErrorCode } from '#constants/sensitive_data_write_error_codes'

/**
 * Excepción de dominio: transición de dato sensible no autorizada.
 * Prohibido incluir el valor intentado o el guardado en `message`.
 */
export class SensitiveDataWriteError extends Error {
  readonly errorCode: SensitiveDataWriteErrorCode
  readonly httpStatus: number = 403
  readonly category?: LegalCategory

  constructor(errorCode: SensitiveDataWriteErrorCode, category?: LegalCategory) {
    super('Sensitive data write denied')
    this.name = 'SensitiveDataWriteError'
    this.errorCode = errorCode
    this.category = category
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/constants/sensitive_data_write_error_codes.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/constants/sensitive_data_write_error_codes.ts app/exceptions/sensitive_data_write_error.ts tests/unit/constants/sensitive_data_write_error_codes.spec.ts
git commit -m "feat: agregar códigos y excepción de escritura sensible"
```

---

### Task 2: Respuesta HTTP 403 `{ title, detail, key, code }` e i18n

**Files:**
- Create: `app/helpers/sensitive_data_write_api_error.ts`
- Modify: `resources/langs/es.json` (añadir claves al final del objeto raíz, antes del `}`)
- Modify: `resources/langs/en.json` (igual)
- Test: `tests/unit/helpers/sensitive_data_write_api_error.spec.ts`

**Interfaces:**
- Consumes: `SensitiveDataWriteError`, `SENSITIVE_DATA_WRITE_ERROR_CODES`
- Produces:
  - `isSensitiveDataWriteError(error: unknown): error is SensitiveDataWriteError`
  - `respondSensitiveDataWriteDenial(ctx: HttpContext, error: SensitiveDataWriteError): { title: string, detail: string, key: string, code: string }`
  - Etiquetas de categoría: identificación / contacto / financieros / salud / biométricos (español en `detail`; i18n en `en.json`)

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/helpers/sensitive_data_write_api_error.spec.ts`:

```typescript
import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import {
  isSensitiveDataWriteError,
  respondSensitiveDataWriteDenial,
} from '#helpers/sensitive_data_write_api_error'

function makeCtx(locale: 'es' | 'en' = 'es'): HttpContext {
  const messages: Record<string, Record<string, string>> = {
    es: {
      sensitive_data_write_forbidden_title: 'Sin permiso para modificar datos sensibles',
      sensitive_data_write_forbidden_detail:
        'No tienes permiso para modificar {category}. Ningún dato de la petición se guardó.',
      sensitive_data_write_unresolved_title: 'No se pudo determinar el permiso de escritura',
      sensitive_data_write_unresolved_detail:
        'No se pudo determinar si tienes permiso para modificar datos sensibles. Ningún dato de la petición se guardó.',
      sensitive_data_write_category_identificacion: 'datos de identificación',
      sensitive_data_write_category_contacto: 'datos de contacto',
      sensitive_data_write_category_financiero: 'datos financieros',
      sensitive_data_write_category_salud: 'datos de salud',
      sensitive_data_write_category_biometrico: 'datos biométricos',
    },
    en: {
      sensitive_data_write_forbidden_title: 'Not allowed to modify sensitive data',
      sensitive_data_write_forbidden_detail:
        'You are not allowed to modify {category}. No data from the request was saved.',
      sensitive_data_write_unresolved_title: 'Write permission could not be determined',
      sensitive_data_write_unresolved_detail:
        'It could not be determined whether you are allowed to modify sensitive data. No data from the request was saved.',
      sensitive_data_write_category_identificacion: 'identification data',
      sensitive_data_write_category_contacto: 'contact data',
      sensitive_data_write_category_financiero: 'financial data',
      sensitive_data_write_category_salud: 'health data',
      sensitive_data_write_category_biometrico: 'biometric data',
    },
  }
  const table = messages[locale]
  return {
    i18n: {
      locale,
      t: (key: string, params?: Record<string, string>) => {
        let text = table[key] ?? key
        if (params) {
          for (const [name, value] of Object.entries(params)) {
            text = text.replace(`{${name}}`, value)
          }
        }
        return text
      },
    },
    response: {
      status(code: number) {
        ;(this as { statusCode?: number }).statusCode = code
        return this
      },
    },
  } as unknown as HttpContext
}

test.group('isSensitiveDataWriteError', () => {
  test('reconoce la excepción y rechaza un Error genérico', ({ assert }) => {
    const denied = new SensitiveDataWriteError(
      SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN,
      'financiero'
    )
    assert.isTrue(isSensitiveDataWriteError(denied))
    assert.isFalse(isSensitiveDataWriteError(new Error('boom')))
    assert.isFalse(isSensitiveDataWriteError({ message: 'nope' }))
  })
})

test.group('respondSensitiveDataWriteDenial', () => {
  test('FORBIDDEN nombra la categoría, fija 403 y no incluye valores', ({ assert }) => {
    const ctx = makeCtx('es')
    const error = new SensitiveDataWriteError(
      SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN,
      'financiero'
    )
    const body = respondSensitiveDataWriteDenial(ctx, error)
    assert.equal((ctx.response as { statusCode?: number }).statusCode, 403)
    assert.equal(body.title, 'Sin permiso para modificar datos sensibles')
    assert.equal(body.key, 'sin-permiso-para-modificar-datos-sensibles')
    assert.equal(body.code, 'EMP.SENS.WRITE.FORBIDDEN')
    assert.equal(
      body.detail,
      'No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó.'
    )
    assert.notInclude(body.detail, '012345678901234567')
    assert.notInclude(JSON.stringify(body), '••••')
  })

  test('UNRESOLVED no nombra categoría ni valores', ({ assert }) => {
    const ctx = makeCtx('es')
    const error = new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED)
    const body = respondSensitiveDataWriteDenial(ctx, error)
    assert.equal(body.code, 'EMP.SENS.WRITE.UNRESOLVED')
    assert.equal(body.key, 'no-se-pudo-determinar-el-permiso-de-escritura')
    assert.equal(body.title, 'No se pudo determinar el permiso de escritura')
    assert.notInclude(body.detail.toLowerCase(), 'identificacion')
    assert.notInclude(body.detail.toLowerCase(), 'clabe')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/helpers/sensitive_data_write_api_error.spec.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write minimal implementation**

Añadir al objeto raíz de `resources/langs/es.json` (mantener JSON válido, coma en la clave anterior):

```json
  "sensitive_data_write_forbidden_title": "Sin permiso para modificar datos sensibles",
  "sensitive_data_write_forbidden_detail": "No tienes permiso para modificar {category}. Ningún dato de la petición se guardó.",
  "sensitive_data_write_unresolved_title": "No se pudo determinar el permiso de escritura",
  "sensitive_data_write_unresolved_detail": "No se pudo determinar si tienes permiso para modificar datos sensibles. Ningún dato de la petición se guardó.",
  "sensitive_data_write_category_identificacion": "datos de identificación",
  "sensitive_data_write_category_contacto": "datos de contacto",
  "sensitive_data_write_category_financiero": "datos financieros",
  "sensitive_data_write_category_salud": "datos de salud",
  "sensitive_data_write_category_biometrico": "datos biométricos"
```

Añadir al objeto raíz de `resources/langs/en.json`:

```json
  "sensitive_data_write_forbidden_title": "Not allowed to modify sensitive data",
  "sensitive_data_write_forbidden_detail": "You are not allowed to modify {category}. No data from the request was saved.",
  "sensitive_data_write_unresolved_title": "Write permission could not be determined",
  "sensitive_data_write_unresolved_detail": "It could not be determined whether you are allowed to modify sensitive data. No data from the request was saved.",
  "sensitive_data_write_category_identificacion": "identification data",
  "sensitive_data_write_category_contacto": "contact data",
  "sensitive_data_write_category_financiero": "financial data",
  "sensitive_data_write_category_salud": "health data",
  "sensitive_data_write_category_biometrico": "biometric data"
```

`app/helpers/sensitive_data_write_api_error.ts`:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import type { LegalCategory } from '#constants/sensitive_fields'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'

export type SensitiveDataWriteDenialBody = {
  title: string
  detail: string
  key: string
  code: string
}

export function isSensitiveDataWriteError(error: unknown): error is SensitiveDataWriteError {
  return error instanceof SensitiveDataWriteError
}

function categoryLabel(ctx: HttpContext, category: LegalCategory): string {
  return ctx.i18n.t(`sensitive_data_write_category_${category}`)
}

export function respondSensitiveDataWriteDenial(
  ctx: HttpContext,
  error: SensitiveDataWriteError
): SensitiveDataWriteDenialBody {
  ctx.response.status(403)

  if (error.errorCode === SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED) {
    return {
      title: ctx.i18n.t('sensitive_data_write_unresolved_title'),
      detail: ctx.i18n.t('sensitive_data_write_unresolved_detail'),
      key: 'no-se-pudo-determinar-el-permiso-de-escritura',
      code: error.errorCode,
    }
  }

  const category = error.category ?? 'identificacion'
  return {
    title: ctx.i18n.t('sensitive_data_write_forbidden_title'),
    detail: ctx.i18n.t('sensitive_data_write_forbidden_detail', {
      category: categoryLabel(ctx, category),
    }),
    key: 'sin-permiso-para-modificar-datos-sensibles',
    code: error.errorCode,
  }
}
```

Confirmado contra el repo (`empresas_contratantes_controller.ts:107`, `employee_controller.ts:108`, `repse_registrations_controller.ts:81`): `ctx.i18n.t(key, params?, fallback?)` es la API real. El helper y el test de arriba ya usan esa firma; no hay que adaptar nada.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/helpers/sensitive_data_write_api_error.spec.ts`
Expected: PASS. Si falla por `formatMessage` vs `t`, ajustar helper y test a la API real; no cambiar el contrato `{ title, detail, key, code }`.

- [ ] **Step 5: Commit**

```bash
git add app/helpers/sensitive_data_write_api_error.ts resources/langs/es.json resources/langs/en.json tests/unit/helpers/sensitive_data_write_api_error.spec.ts
git commit -m "feat: devolver 403 de escritura sensible sin revelar valores"
```

---

### Task 3: Mapa `EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS`

**Files:**
- Modify: `app/constants/employees_write_permission_declarations.ts` (al final del archivo, después de `EMPLOYEES_MANAGE_VACATION_PERMISSION`)
- Modify: `tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts` (añadir los cinco slugs `-write` junto a los `-read`)
- Test: `tests/unit/constants/employees_sensitive_write_permissions.spec.ts`

**Interfaces:**
- Consumes: `LegalCategory`, `EmployeeActionSlug`, `PermissionGateOptions`
- Produces: `EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS: Record<LegalCategory, PermissionGateOptions>` con `module: 'employees'`, `bypass: 'standard'`, `action: 'sensitive-<cat>-write'`

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/constants/employees_sensitive_write_permissions.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import { LEGAL_CATEGORIES } from '#constants/sensitive_fields'

test.group('EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS', () => {
  test('declara las cinco categorías con module employees, bypass standard y slug del catálogo', ({
    assert,
  }) => {
    const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((action) => action.slug))

    assert.deepEqual(
      Object.keys(EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS).sort(),
      [...LEGAL_CATEGORIES].sort()
    )

    const expected: Record<string, string> = {
      identificacion: 'sensitive-identificacion-write',
      contacto: 'sensitive-contacto-write',
      financiero: 'sensitive-financiero-write',
      salud: 'sensitive-salud-write',
      biometrico: 'sensitive-biometrico-write',
    }

    for (const category of LEGAL_CATEGORIES) {
      const declaration = EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS[category]
      assert.equal(declaration.module, 'employees')
      assert.equal(declaration.bypass, 'standard')
      assert.equal(declaration.action, expected[category])
      assert.isTrue(
        catalogSlugs.has(declaration.action as string),
        `slug ausente en catálogo: ${String(declaration.action)}`
      )
    }
  })
})
```

Añadir en `tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts`, junto a los slugs `-read`:

```typescript
const sensitiveIdentificacionWrite: EmployeeActionSlug = 'sensitive-identificacion-write'
void sensitiveIdentificacionWrite
const sensitiveContactoWrite: EmployeeActionSlug = 'sensitive-contacto-write'
void sensitiveContactoWrite
const sensitiveFinancieroWrite: EmployeeActionSlug = 'sensitive-financiero-write'
void sensitiveFinancieroWrite
const sensitiveSaludWrite: EmployeeActionSlug = 'sensitive-salud-write'
void sensitiveSaludWrite
const sensitiveBiometricoWrite: EmployeeActionSlug = 'sensitive-biometrico-write'
void sensitiveBiometricoWrite
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/constants/employees_sensitive_write_permissions.spec.ts`
Expected: FAIL — `EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS` no está exportado.

- [ ] **Step 3: Write minimal implementation**

En `app/constants/employees_write_permission_declarations.ts`:

1. Añadir imports (si no están):

```typescript
import type { EmployeeActionSlug } from '#constants/employees_permission_catalog'
import type { LegalCategory } from '#constants/sensitive_fields'
```

2. Añadir helper tipado **después** de `employeesStandard`:

```typescript
const employeesSensitiveWrite = (action: EmployeeActionSlug): PermissionGateOptions =>
  employeesStandard(action)
```

3. Añadir al **final del archivo**:

```typescript
/**
 * Permisos de escritura por categoría legal (USRH1787204602831).
 * Consumidos por `resolveSensitiveWriteDecisions`; no se montan en rutas.
 * Un slug inventado no compila: `employeesSensitiveWrite` exige `EmployeeActionSlug`.
 */
export const EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS: Record<LegalCategory, PermissionGateOptions> = {
  identificacion: employeesSensitiveWrite('sensitive-identificacion-write'),
  contacto: employeesSensitiveWrite('sensitive-contacto-write'),
  financiero: employeesSensitiveWrite('sensitive-financiero-write'),
  salud: employeesSensitiveWrite('sensitive-salud-write'),
  biometrico: employeesSensitiveWrite('sensitive-biometrico-write'),
}
```

No tocar `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS`. No conceder permisos a ningún rol.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/constants/employees_sensitive_write_permissions.spec.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: PASS (los cinco slugs `-write` son literales del catálogo).

- [ ] **Step 5: Commit**

```bash
git add app/constants/employees_write_permission_declarations.ts tests/unit/constants/employees_sensitive_write_permissions.spec.ts tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts
git commit -m "feat: declarar mapa de escritura sensible por categoría"
```

---

### Task 4: ALS — store de lectura+escritura, `canWrite`, `runUnguarded`

**Files:**
- Modify: `app/utils/sensitive_access_context.ts`
- Modify: todos los callers de `SensitiveAccessContext.run` listados en File Structure
- Test: `tests/unit/utils/sensitive_access_context.spec.ts` (reescribir)

**Interfaces:**
- Consumes: `LegalCategory`
- Produces:
  - `type SensitiveWriteDecision = 'allowed' | 'denied' | 'unresolved'`
  - `type SensitiveAccessStore = { read: Record<LegalCategory, boolean>, write: Record<LegalCategory, SensitiveWriteDecision>, unguarded?: boolean }`
  - `canRead(category)` lee `store.read[category] ?? false` (comportamiento de lectura **idéntico**)
  - `canWrite(category): boolean` → `store.write[category] === 'allowed'` (si no, `false`)
  - `writeDecision(category): SensitiveWriteDecision` → `store.write[category] ?? 'denied'` si hay store; el mixin no debe llamarlo sin `isActive()`
  - `isUnguarded(): boolean`
  - `runUnguarded<T>(reason: string, fn: () => T): T` — copia el store actual, pone `unguarded: true`, `logger.warn({ reason }, ...)`
  - `run<T>(store: SensitiveAccessStore, fn: () => T): T`

- [ ] **Step 1: Write the failing test**

Reemplazar `tests/unit/utils/sensitive_access_context.spec.ts` por:

```typescript
import { test } from '@japa/runner'
import {
  SensitiveAccessContext,
  type SensitiveAccessStore,
  type SensitiveWriteDecision,
} from '#utils/sensitive_access_context'
import type { LegalCategory } from '#constants/sensitive_fields'

const deniedRead: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

const deniedWrite: Record<LegalCategory, SensitiveWriteDecision> = {
  identificacion: 'denied',
  contacto: 'denied',
  financiero: 'denied',
  salud: 'denied',
  biometrico: 'denied',
}

function store(overrides: Partial<SensitiveAccessStore> = {}): SensitiveAccessStore {
  return {
    read: { ...deniedRead, ...overrides.read },
    write: { ...deniedWrite, ...overrides.write },
    unguarded: overrides.unguarded,
  }
}

test.group('SensitiveAccessContext', () => {
  test('sin contexto activo canRead y canWrite son false y isActive es false', ({ assert }) => {
    assert.isFalse(SensitiveAccessContext.isActive())
    assert.isFalse(SensitiveAccessContext.canRead('contacto'))
    assert.isFalse(SensitiveAccessContext.canWrite('financiero'))
    assert.isFalse(SensitiveAccessContext.isUnguarded())
  })

  test('canRead lee el mapa read y canWrite solo es true si write es allowed', ({ assert }) => {
    SensitiveAccessContext.run(
      store({
        read: { ...deniedRead, contacto: true },
        write: { ...deniedWrite, financiero: 'allowed', salud: 'unresolved' },
      }),
      () => {
        assert.isTrue(SensitiveAccessContext.isActive())
        assert.isTrue(SensitiveAccessContext.canRead('contacto'))
        assert.isFalse(SensitiveAccessContext.canRead('financiero'))
        assert.isTrue(SensitiveAccessContext.canWrite('financiero'))
        assert.isFalse(SensitiveAccessContext.canWrite('salud'))
        assert.isFalse(SensitiveAccessContext.canWrite('contacto'))
        assert.equal(SensitiveAccessContext.writeDecision('salud'), 'unresolved')
        assert.equal(SensitiveAccessContext.writeDecision('contacto'), 'denied')
      }
    )
  })

  test('runUnguarded marca unguarded, conserva read/write y registra el motivo', ({ assert }) => {
    SensitiveAccessContext.run(
      store({ read: { ...deniedRead, biometrico: true } }),
      () => {
        assert.isFalse(SensitiveAccessContext.isUnguarded())
        SensitiveAccessContext.runUnguarded('renovación del token biométrico en consulta de foto', () => {
          assert.isTrue(SensitiveAccessContext.isUnguarded())
          assert.isTrue(SensitiveAccessContext.isActive())
          assert.isTrue(SensitiveAccessContext.canRead('biometrico'))
          assert.isFalse(SensitiveAccessContext.canWrite('biometrico'))
        })
        assert.isFalse(SensitiveAccessContext.isUnguarded())
      }
    )
  })

  test('al salir de run el store no se filtra', ({ assert }) => {
    SensitiveAccessContext.run(store({ write: { ...deniedWrite, salud: 'allowed' } }), () => {
      assert.isTrue(SensitiveAccessContext.canWrite('salud'))
    })
    assert.isFalse(SensitiveAccessContext.canWrite('salud'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/utils/sensitive_access_context.spec.ts`
Expected: FAIL — `canWrite` / `runUnguarded` no existen; `run` aún espera `Record<LegalCategory, boolean>`.

- [ ] **Step 3: Write minimal implementation**

Reemplazar `app/utils/sensitive_access_context.ts` por:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks'
import logger from '@adonisjs/core/services/logger'
import type { LegalCategory } from '#constants/sensitive_fields'

export type SensitiveWriteDecision = 'allowed' | 'denied' | 'unresolved'

export type SensitiveAccessStore = {
  read: Record<LegalCategory, boolean>
  write: Record<LegalCategory, SensitiveWriteDecision>
  unguarded?: boolean
}

const storage = new AsyncLocalStorage<SensitiveAccessStore>()

const emptyRead: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

const emptyWrite: Record<LegalCategory, SensitiveWriteDecision> = {
  identificacion: 'denied',
  contacto: 'denied',
  financiero: 'denied',
  salud: 'denied',
  biometrico: 'denied',
}

/**
 * Contexto request-scoped de acceso sensible (lectura: USRH1787204602825;
 * escritura: USRH1787204602831).
 *
 * Lectura fail-closed: sin store, `canRead` es false.
 * Escritura: el mixin no exige si `!isActive()` (fail-open fuera de HTTP).
 * Con store activo, `canWrite` solo es true si la decisión es `allowed`.
 */
export const SensitiveAccessContext = {
  canRead(category: LegalCategory): boolean {
    return storage.getStore()?.read[category] ?? false
  },

  canWrite(category: LegalCategory): boolean {
    return storage.getStore()?.write[category] === 'allowed'
  },

  writeDecision(category: LegalCategory): SensitiveWriteDecision {
    return storage.getStore()?.write[category] ?? 'denied'
  },

  isActive(): boolean {
    return storage.getStore() !== undefined
  },

  isUnguarded(): boolean {
    return storage.getStore()?.unguarded === true
  },

  run<T>(store: SensitiveAccessStore, fn: () => T): T {
    return storage.run(store, fn)
  },

  runUnguarded<T>(reason: string, fn: () => T): T {
    logger.warn({ reason }, 'SensitiveAccessContext.runUnguarded: exigencia de escritura sensible omitida')
    const current = storage.getStore()
    const next: SensitiveAccessStore = current
      ? { ...current, read: { ...current.read }, write: { ...current.write }, unguarded: true }
      : { read: { ...emptyRead }, write: { ...emptyWrite }, unguarded: true }
    return storage.run(next, fn)
  },
}
```

Actualizar **cada** caller de `run` para pasar `{ read: decisionesAnteriores, write: emptyWrite }`. En `app/helpers/sensitive_read_decisions.ts` la Task 5 llenará `write` de verdad; **en esta task** basta un `write` todo `'denied'` para que compile y los tests de serialize/lectura sigan pasando (sin store write allowed, `canRead` no cambia).

Plantilla de migración de un test de serialize:

Antes:

```typescript
SensitiveAccessContext.run({ ...allDenied, contacto: true }, () => {
```

Después:

```typescript
SensitiveAccessContext.run(
  {
    read: { ...allDenied, contacto: true },
    write: {
      identificacion: 'denied',
      contacto: 'denied',
      financiero: 'denied',
      salud: 'denied',
      biometrico: 'denied',
    },
  },
  () => {
```

`reenterSensitiveReadOnResponse` debe reabrir el **mismo** `SensitiveAccessStore` (no solo `read`), para que un `save` durante `finish` (no debería haberlo) siga viendo `write`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node ace test tests/unit/utils/sensitive_access_context.spec.ts tests/unit/helpers/sensitive_serialize.spec.ts tests/unit/helpers/sensitive_read_decisions.spec.ts tests/unit/middleware/sensitive_access_context_middleware.spec.ts tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts
```

Expected: PASS. Si algún test de lectura sigue llamando `run` con el mapa plano, migrarlo. No relajar `canRead`.

- [ ] **Step 5: Commit**

```bash
git add app/utils/sensitive_access_context.ts app/helpers/sensitive_read_decisions.ts tests/unit/utils/sensitive_access_context.spec.ts tests/unit/helpers/sensitive_serialize.spec.ts tests/unit/helpers/sensitive_read_decisions.spec.ts tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts
git commit -m "refactor: extender el contexto sensible con decisiones de escritura"
```

---

### Task 5: Resolver las cinco escrituras con `evaluateEnforced`

**Files:**
- Modify: `app/helpers/sensitive_read_decisions.ts`
- Test: `tests/unit/helpers/sensitive_read_decisions.spec.ts` (añadir grupo de escritura)

**Interfaces:**
- Consumes: `PermissionGateService.evaluateEnforced`, `EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS`, `LEGAL_CATEGORIES`, `SensitiveAccessStore`
- Produces:
  - `classifySensitiveWriteDecision(decision: PermissionGateDecision): SensitiveWriteDecision`
  - `resolveSensitiveWriteDecisions(ctx: HttpContext): Promise<Record<LegalCategory, SensitiveWriteDecision>>`
  - `runWithSensitiveReadDecisions` abre `{ read, write }` (write ya no es todo `denied`)

Reglas de `classifySensitiveWriteDecision`:
- `reason === 'granted' || reason === 'bypass'` → `'allowed'`
- `reason === 'unresolved'` → `'unresolved'`
- cualquier otro (`denied`, y por defensa `module-not-enforced` si alguien llamara `evaluate`) → `'denied'`

Misma instancia: `ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())` — la de lectura, no un `new` por categoría.

- [ ] **Step 1: Write the failing test**

Añadir al final de `tests/unit/helpers/sensitive_read_decisions.spec.ts`:

```typescript
import {
  classifySensitiveWriteDecision,
  resolveSensitiveWriteDecisions,
} from '#helpers/sensitive_read_decisions'
import type { PermissionGateDecision } from '#services/permission_gate_service'

test.group('classifySensitiveWriteDecision', () => {
  test('granted y bypass permiten; unresolved se distingue; el resto niega', ({ assert }) => {
    const cases: Array<[PermissionGateDecision, string]> = [
      [{ allowed: true, reason: 'granted' }, 'allowed'],
      [{ allowed: true, reason: 'bypass' }, 'allowed'],
      [{ allowed: false, reason: 'unresolved' }, 'unresolved'],
      [{ allowed: false, reason: 'denied' }, 'denied'],
      [{ allowed: true, reason: 'module-not-enforced' }, 'denied'],
    ]
    for (const [decision, expected] of cases) {
      assert.equal(classifySensitiveWriteDecision(decision), expected, decision.reason)
    }
  })
})

test.group('resolveSensitiveWriteDecisions', () => {
  test('usa evaluateEnforced y clasifica por categoría', async ({ assert }) => {
    const ctx = makeCtx((action) => {
      if (action === 'sensitive-contacto-write') return { allowed: true, reason: 'granted' }
      if (action === 'sensitive-identificacion-write') return { allowed: false, reason: 'unresolved' }
      return { allowed: false, reason: 'denied' }
    })
    const write = await resolveSensitiveWriteDecisions(ctx)
    assert.equal(write.contacto, 'allowed')
    assert.equal(write.identificacion, 'unresolved')
    assert.equal(write.financiero, 'denied')
  })
})

test.group('runWithSensitiveReadDecisions write half', () => {
  test('dentro de next() canWrite respeta la concesión de escritura', async ({ assert }) => {
    const ctx = makeCtx((action) => {
      if (String(action).endsWith('-read')) return { allowed: true, reason: 'bypass' }
      if (action === 'sensitive-financiero-write') return { allowed: true, reason: 'granted' }
      return { allowed: false, reason: 'denied' }
    })
    let sawWrite = false
    await runWithSensitiveReadDecisions(ctx, (async () => {
      sawWrite = SensitiveAccessContext.canWrite('financiero')
      assert.isFalse(SensitiveAccessContext.canWrite('salud'))
    }) as NextFn)
    assert.isTrue(sawWrite)
  })
})
```

`makeCtx` ya finge `evaluateEnforced` leyendo `options.action`. Si el fake actual ignora `action`, extenderlo para recibir el slug (el spec de lectura ya pasa `options.action`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/helpers/sensitive_read_decisions.spec.ts`
Expected: FAIL — `classifySensitiveWriteDecision` no exportado.

- [ ] **Step 3: Write minimal implementation**

En `app/helpers/sensitive_read_decisions.ts` añadir imports:

```typescript
import { EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS } from '#constants/employees_write_permission_declarations'
import type { SensitiveWriteDecision, SensitiveAccessStore } from '#utils/sensitive_access_context'
```

Añadir:

```typescript
export function classifySensitiveWriteDecision(
  decision: PermissionGateDecision
): SensitiveWriteDecision {
  if (decision.reason === 'granted' || decision.reason === 'bypass') return 'allowed'
  if (decision.reason === 'unresolved') return 'unresolved'
  return 'denied'
}

export async function resolveSensitiveWriteDecisions(
  ctx: HttpContext
): Promise<Record<LegalCategory, SensitiveWriteDecision>> {
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
  const decisions = {} as Record<LegalCategory, SensitiveWriteDecision>
  for (const category of LEGAL_CATEGORIES) {
    const decision = await service.evaluateEnforced(
      ctx.auth.user,
      EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS[category]
    )
    decisions[category] = classifySensitiveWriteDecision(decision)
  }
  return decisions
}
```

Cambiar `runWithSensitiveReadDecisions`:

```typescript
export async function runWithSensitiveReadDecisions(
  ctx: HttpContext,
  next: NextFn
): Promise<unknown> {
  const read = await resolveSensitiveReadDecisions(ctx)
  const write = await resolveSensitiveWriteDecisions(ctx)
  const store: SensitiveAccessStore = { read, write }
  reenterSensitiveReadOnResponse(ctx, store)
  return SensitiveAccessContext.run(store, () => next())
}
```

Ajustar `reenterSensitiveReadOnResponse` para aceptar `SensitiveAccessStore` y hacer `SensitiveAccessContext.run(store, ...)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/helpers/sensitive_read_decisions.spec.ts tests/unit/middleware/sensitive_access_context_middleware.spec.ts`
Expected: PASS. El middleware no cambia: sigue llamando `runWithSensitiveReadDecisions`.

- [ ] **Step 5: Commit**

```bash
git add app/helpers/sensitive_read_decisions.ts tests/unit/helpers/sensitive_read_decisions.spec.ts
git commit -m "feat: resolver escritura sensible con evaluateEnforced"
```

---

### Task 6: Mixin — transición de valor y denegación

**Files:**
- Modify: `app/helpers/employee_termination_record.ts` (exportar `normalizeToken`)
- Create: `app/mixins/with_sensitive_write_guard.ts`
- Test: `tests/unit/mixins/with_sensitive_write_guard.spec.ts`
- Test: `tests/unit/helpers/employee_termination_record.spec.ts` (si no hay cobertura de `normalizeToken`, añadir un grupo corto; si el archivo de test no existe, crearlo solo con `normalizeToken`)

**Interfaces:**
- Consumes: `SensitiveAccessContext.isActive/isUnguarded/writeDecision`, `SensitiveFieldsCatalogService.categoryOf`, `normalizeToken`, `SENSITIVE_DATA_WRITE_ERROR_CODES`, `SensitiveDataWriteError`
- Produces:
  - `export function normalizeToken(value: unknown): string | null` (misma implementación: `null|undefined|''` → `null`, si no `String(value)`)
  - `SENSITIVE_WRITE_CATEGORY_ORDER: readonly LegalCategory[]` = `['identificacion','contacto','financiero','salud','biometrico']`
  - `assertSensitiveWriteAllowed(model: SensitiveWriteModel): void`
  - `withSensitiveWriteGuard()` — factory Lucid, `before('save', assertSensitiveWriteAllowed)`

`SensitiveWriteModel`:

```typescript
export type SensitiveWriteModel = {
  constructor: { name: string }
  $dirty: Record<string, unknown>
  $original: Record<string, unknown>
}
```

Algoritmo de `assertSensitiveWriteAllowed` (cerrar y no reinterpretar):

1. Si `!SensitiveAccessContext.isActive()` → `return`.
2. Si `SensitiveAccessContext.isUnguarded()` → `return`.
3. `denied: LegalCategory[] = []`, `unresolved = false`.
4. Para cada `column` de `Object.keys(model.$dirty)`:
   - `category = catalog.categoryOf(model.constructor.name, column)`.
   - Si `category === null` → continuar (columna no clasificada, regla 13).
   - Si `normalizeToken(model.$dirty[column]) === normalizeToken(model.$original[column])` → continuar (no hay transición; cubre alta con `undefined` vs `''`).
   - `decision = SensitiveAccessContext.writeDecision(category)`.
   - `'allowed'` → continuar.
   - `'unresolved'` → `unresolved = true`.
   - `'denied'` → `denied.push(category)` si no estaba.
5. Si `unresolved` → `throw new SensitiveDataWriteError(UNRESOLVED)` (sin categoría).
6. Si `denied.length > 0` → `throw new SensitiveDataWriteError(FORBIDDEN, SENSITIVE_WRITE_CATEGORY_ORDER.find(c => denied.includes(c))!)`.
7. Si no, return.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/mixins/with_sensitive_write_guard.spec.ts`:

```typescript
import { test } from '@japa/runner'
import type { LegalCategory } from '#constants/sensitive_fields'
import {
  SensitiveAccessContext,
  type SensitiveAccessStore,
  type SensitiveWriteDecision,
} from '#utils/sensitive_access_context'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import {
  assertSensitiveWriteAllowed,
  type SensitiveWriteModel,
} from '#mixins/with_sensitive_write_guard'

const deniedRead: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

const deniedWrite: Record<LegalCategory, SensitiveWriteDecision> = {
  identificacion: 'denied',
  contacto: 'denied',
  financiero: 'denied',
  salud: 'denied',
  biometrico: 'denied',
}

function store(write?: Partial<Record<LegalCategory, SensitiveWriteDecision>>): SensitiveAccessStore {
  return {
    read: { ...deniedRead },
    write: { ...deniedWrite, ...write },
  }
}

function person(partial: {
  dirty: Record<string, unknown>
  original?: Record<string, unknown>
}): SensitiveWriteModel {
  return {
    constructor: { name: 'Person' },
    $dirty: partial.dirty,
    $original: partial.original ?? {},
  }
}

test.group('assertSensitiveWriteAllowed', () => {
  test('sin ALS no lanza (fail-open de comandos y seeders)', ({ assert }) => {
    assert.isFalse(SensitiveAccessContext.isActive())
    assert.doesNotThrow(() =>
      assertSensitiveWriteAllowed(
        person({ dirty: { personRfc: 'VARL850602AB3' } })
      )
    )
  })

  test('columna no clasificada no exige permiso', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      assert.doesNotThrow(() =>
        assertSensitiveWriteAllowed(
          person({
            dirty: { personLastname: 'García', personMaritalStatus: 'married' },
            original: { personLastname: 'López', personMaritalStatus: 'single' },
          })
        )
      )
    })
  })

  test('null, undefined y vacío son equivalentes: no hay transición', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      assert.doesNotThrow(() =>
        assertSensitiveWriteAllowed(
          person({
            dirty: { personRfc: null, personEmail: '' },
            original: { personRfc: undefined, personEmail: null },
          })
        )
      )
    })
  })

  test('mismo valor que el guardado no exige permiso', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      assert.doesNotThrow(() =>
        assertSensitiveWriteAllowed(
          person({
            dirty: { personRfc: 'GOMC880315HRA' },
            original: { personRfc: 'GOMC880315HRA' },
          })
        )
      )
    })
  })

  test('transición real sin permiso lanza FORBIDDEN de identificación', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      try {
        assertSensitiveWriteAllowed(
          person({
            dirty: { personRfc: 'VARL850602AB3', personLastname: 'García' },
            original: { personRfc: 'GOMC880315HRA', personLastname: 'López' },
          })
        )
        assert.fail('debía lanzar')
      } catch (error) {
        assert.instanceOf(error, SensitiveDataWriteError)
        const denied = error as SensitiveDataWriteError
        assert.equal(denied.errorCode, SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN)
        assert.equal(denied.category, 'identificacion')
        assert.notInclude(denied.message, 'VARL850602AB3')
        assert.notInclude(denied.message, 'GOMC880315HRA')
      }
    })
  })

  test('petición mixta reporta identificación primero y no menciona el teléfono', ({ assert }) => {
    SensitiveAccessContext.run(store({ contacto: 'allowed' }), () => {
      try {
        assertSensitiveWriteAllowed(
          person({
            dirty: { personPhone: '5511111111', personCurp: 'AAAA800101HDFRRN09' },
            original: { personPhone: '5500000000', personCurp: 'BBBB800101HDFRRN09' },
          })
        )
        assert.fail('debía lanzar')
      } catch (error) {
        const denied = error as SensitiveDataWriteError
        assert.equal(denied.category, 'identificacion')
        assert.equal(denied.errorCode, SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN)
      }
    })
  })

  test('alta con CLABE sin permiso financiero lanza FORBIDDEN', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      try {
        assertSensitiveWriteAllowed({
          constructor: { name: 'EmployeeBank' },
          $dirty: { employeeBankAccountClabe: '012345678901234567', employeeBankAccountType: 'checking' },
          $original: {},
        })
        assert.fail('debía lanzar')
      } catch (error) {
        assert.equal((error as SensitiveDataWriteError).category, 'financiero')
      }
    })
  })

  test('alta con CLABE y permiso financiero no lanza', ({ assert }) => {
    SensitiveAccessContext.run(store({ financiero: 'allowed' }), () => {
      assert.doesNotThrow(() =>
        assertSensitiveWriteAllowed({
          constructor: { name: 'EmployeeBank' },
          $dirty: { employeeBankAccountClabe: '012345678901234567' },
          $original: {},
        })
      )
    })
  })

  test('write unresolved lanza UNRESOLVED', ({ assert }) => {
    SensitiveAccessContext.run(store({ identificacion: 'unresolved' }), () => {
      try {
        assertSensitiveWriteAllowed(
          person({ dirty: { personRfc: 'VARL850602AB3' }, original: { personRfc: 'GOMC880315HRA' } })
        )
        assert.fail('debía lanzar')
      } catch (error) {
        assert.equal(
          (error as SensitiveDataWriteError).errorCode,
          SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED
        )
      }
    })
  })

  test('isUnguarded no lanza aunque haya transición biométrica', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      SensitiveAccessContext.runUnguarded('test', () => {
        assert.doesNotThrow(() =>
          assertSensitiveWriteAllowed({
            constructor: { name: 'EmployeeBiometricFaceId' },
            $dirty: { employeeBiometricFaceIdToken: 'new-token' },
            $original: { employeeBiometricFaceIdToken: 'old-token' },
          })
        )
      })
    })
  })

  test('diagnóstico de salud sin permiso lanza categoría salud', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      try {
        assertSensitiveWriteAllowed({
          constructor: { name: 'EmployeeMedicalCondition' },
          $dirty: { employeeMedicalConditionDiagnosis: 'nuevo' },
          $original: { employeeMedicalConditionDiagnosis: 'previo' },
        })
        assert.fail('debía lanzar')
      } catch (error) {
        assert.equal((error as SensitiveDataWriteError).category, 'salud')
      }
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/mixins/with_sensitive_write_guard.spec.ts`
Expected: FAIL — módulo `#mixins/with_sensitive_write_guard` no existe.

- [ ] **Step 3: Write minimal implementation**

En `app/helpers/employee_termination_record.ts` cambiar `function normalizeToken` por `export function normalizeToken`. No cambiar su cuerpo.

`app/mixins/with_sensitive_write_guard.ts`:

```typescript
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { BaseModel } from '@adonisjs/lucid/orm'
import type { LegalCategory } from '#constants/sensitive_fields'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import { normalizeToken } from '#helpers/employee_termination_record'
import SensitiveFieldsCatalogService from '#services/sensitive_fields_catalog_service'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

const catalog = new SensitiveFieldsCatalogService()

/** Orden determinista del 403 mixto (CA-3). No reordenar LEGAL_CATEGORIES. */
export const SENSITIVE_WRITE_CATEGORY_ORDER: readonly LegalCategory[] = [
  'identificacion',
  'contacto',
  'financiero',
  'salud',
  'biometrico',
]

export type SensitiveWriteModel = {
  constructor: { name: string }
  $dirty: Record<string, unknown>
  $original: Record<string, unknown>
}

export function assertSensitiveWriteAllowed(model: SensitiveWriteModel): void {
  if (!SensitiveAccessContext.isActive()) return
  if (SensitiveAccessContext.isUnguarded()) return

  const denied: LegalCategory[] = []
  let unresolved = false

  for (const column of Object.keys(model.$dirty)) {
    const category = catalog.categoryOf(model.constructor.name, column)
    if (category === null) continue
    if (normalizeToken(model.$dirty[column]) === normalizeToken(model.$original[column])) continue

    const decision = SensitiveAccessContext.writeDecision(category)
    if (decision === 'allowed') continue
    if (decision === 'unresolved') {
      unresolved = true
      continue
    }
    if (!denied.includes(category)) denied.push(category)
  }

  if (unresolved) {
    throw new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED)
  }

  if (denied.length === 0) return

  const category =
    SENSITIVE_WRITE_CATEGORY_ORDER.find((item) => denied.includes(item)) ?? denied[0]
  throw new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN, category)
}

export function withSensitiveWriteGuard() {
  return function <T extends NormalizeConstructor<typeof BaseModel>>(superclass: T) {
    class SensitiveWriteGuardedModel extends superclass {
      static boot() {
        super.boot()
        this.before('save', (row) => {
          assertSensitiveWriteAllowed(row as unknown as SensitiveWriteModel)
        })
      }
    }
    return SensitiveWriteGuardedModel
  }
}
```

Lucid 21 en este repo expone `$dirty` y `$original` (con `$`). Si al implementar el tipo del modelo usara otros getters, adaptar **solo** esos nombres, no la regla de transición.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/mixins/with_sensitive_write_guard.spec.ts tests/unit/helpers/employee_termination_record.spec.ts`
Expected: PASS. Si `employee_termination_record.spec.ts` no existe, no crearlo salvo que `normalizeToken` se pruebe en el grupo del mixin (ya cubierto por equivalencia null/'').

- [ ] **Step 5: Commit**

```bash
git add app/helpers/employee_termination_record.ts app/mixins/with_sensitive_write_guard.ts tests/unit/mixins/with_sensitive_write_guard.spec.ts
git commit -m "feat: exigir permiso de categoría en transiciones de dato sensible"
```

---

### Task 7: Aplicar el mixin a los 10 modelos

**Files:**
- Modify: `app/models/person.ts` — `compose(BaseModel, SoftDeletes)` → añadir `withSensitiveWriteGuard()`
- Modify: `app/models/employee_bank.ts`
- Modify: `app/models/employee_medical_condition.ts`
- Modify: `app/models/employee_emergency_contact.ts` (compose real ~L48)
- Modify: `app/models/employee_spouse.ts` (compose real ~L51)
- Modify: `app/models/work_disability_note.ts` (compose multilínea ~L45-49)
- Modify: `app/models/traumatic_event_report.ts` (compose real ~L63)
- Modify: `app/models/employee_lactation_period.ts` (compose multilínea ~L101-105)
- Modify: `app/models/employee_biometric.ts` (compose real ~L38)
- Modify: `app/models/employee_biometric_face_id.ts` (compose multilínea ~L45-49)
- Test: `tests/unit/mixins/sensitive_write_guard_wiring.spec.ts`

**Interfaces:**
- Consumes: `withSensitiveWriteGuard`
- Produces: los 10 modelos disparan `assertSensitiveWriteAllowed` en cada `save()`

Líneas reales a tocar (validar de nuevo el día de implementar):

```
Person: export default class Person extends compose(BaseModel, SoftDeletes)
EmployeeBank: compose(BaseModel, SoftDeletes, withBusinessUnitScope())
EmployeeMedicalCondition: compose(BaseModel, SoftDeletes, withBusinessUnitScope())
EmployeeEmergencyContact: compose(BaseModel, SoftDeletes, withBusinessUnitScope())
EmployeeSpouse: compose(BaseModel, SoftDeletes, withBusinessUnitScope())
WorkDisabilityNote: compose(BaseModel, SoftDeletes, withBusinessUnitScope())
TraumaticEventReport: compose(BaseModel, SoftDeletes)
EmployeeLactationPeriod: compose(BaseModel, SoftDeletes, withBusinessUnitScope())
EmployeeBiometric: compose(BaseModel, SoftDeletes, withBusinessUnitScope())
EmployeeBiometricFaceId: compose(BaseModel, SoftDeletes, withBusinessUnitScope())
```

En todos: importar `withSensitiveWriteGuard` desde `#mixins/with_sensitive_write_guard` y añadirlo **al final** del `compose(...)`.

Ejemplo Person:

```typescript
import { withSensitiveWriteGuard } from '#mixins/with_sensitive_write_guard'

export default class Person extends compose(BaseModel, SoftDeletes, withSensitiveWriteGuard()) {
```

Ejemplo multilínea (`EmployeeBiometricFaceId`):

```typescript
export default class EmployeeBiometricFaceId extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope(),
  withSensitiveWriteGuard()
) {
```

No tocar columnas, `serialize`, `prepare` ni `consume`.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/mixins/sensitive_write_guard_wiring.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const ROOT = process.cwd()

const models = [
  'app/models/person.ts',
  'app/models/employee_bank.ts',
  'app/models/employee_medical_condition.ts',
  'app/models/employee_emergency_contact.ts',
  'app/models/employee_spouse.ts',
  'app/models/work_disability_note.ts',
  'app/models/traumatic_event_report.ts',
  'app/models/employee_lactation_period.ts',
  'app/models/employee_biometric.ts',
  'app/models/employee_biometric_face_id.ts',
]

test.group('Cableado withSensitiveWriteGuard', () => {
  test('los 10 modelos importan y componen el mixin de escritura sensible', ({ assert }) => {
    for (const relative of models) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      assert.include(source, "from '#mixins/with_sensitive_write_guard'", relative)
      assert.include(source, 'withSensitiveWriteGuard()', relative)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/mixins/sensitive_write_guard_wiring.spec.ts`
Expected: FAIL — los modelos no importan el mixin.

- [ ] **Step 3: Write minimal implementation**

Editar los 10 `compose` como arriba. Cero lógica nueva en el cuerpo de las clases.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/mixins/sensitive_write_guard_wiring.spec.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: PASS (`compose` acepta el mixin igual que `withBusinessUnitScope`).

- [ ] **Step 5: Commit**

```bash
git add app/models/person.ts app/models/employee_bank.ts app/models/employee_medical_condition.ts app/models/employee_emergency_contact.ts app/models/employee_spouse.ts app/models/work_disability_note.ts app/models/traumatic_event_report.ts app/models/employee_lactation_period.ts app/models/employee_biometric.ts app/models/employee_biometric_face_id.ts tests/unit/mixins/sensitive_write_guard_wiring.spec.ts
git commit -m "feat: aplicar guarda de escritura sensible a los diez modelos"
```

---

### Task 8: Vía de escape — `updateToken` en consulta de foto

**Files:**
- Modify: `app/services/employee_biometric_face_id_service.ts` método `updateToken` (~L184-190)
- Test: `tests/unit/services/employee_biometric_face_id_update_token_unguarded.spec.ts`

**Interfaces:**
- Consumes: `SensitiveAccessContext.runUnguarded`
- Produces: `updateToken` persiste el token dentro de `runUnguarded('renovación del token biométrico en consulta de foto de rostro', ...)`. Único call site de `runUnguarded` en `app/` (los tests pueden llamarlo).

No envolver `uploadPhoto` / `replacePhoto`. No envolver `deletePhoto` (usa `.delete()`, no dispara `before('save')`).

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/services/employee_biometric_face_id_update_token_unguarded.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

test.group('EmployeeBiometricFaceIdService.updateToken', () => {
  test('envuelve el save en runUnguarded con motivo de consulta de foto', ({ assert }) => {
    const source = readFileSync(
      join(process.cwd(), 'app/services/employee_biometric_face_id_service.ts'),
      'utf-8'
    )
    assert.include(source, 'SensitiveAccessContext.runUnguarded')
    assert.include(source, 'renovación del token biométrico en consulta de foto de rostro')
    const unguardedCount = source.split('runUnguarded').length - 1
    assert.equal(unguardedCount, 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/services/employee_biometric_face_id_update_token_unguarded.spec.ts`
Expected: FAIL — `runUnguarded` no aparece en el servicio.

- [ ] **Step 3: Write minimal implementation**

En `app/services/employee_biometric_face_id_service.ts`:

```typescript
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
```

Reemplazar `updateToken` por:

```typescript
  async updateToken(
    biometricFaceId: EmployeeBiometricFaceId,
    token: string
  ): Promise<EmployeeBiometricFaceId> {
    return SensitiveAccessContext.runUnguarded(
      'renovación del token biométrico en consulta de foto de rostro',
      async () => {
        biometricFaceId.employeeBiometricFaceIdToken = token
        await biometricFaceId.save()
        return biometricFaceId
      }
    )
  }
```

`runUnguarded` está tipado `fn: () => T`. Si TypeScript se queja de async (ALS + Promise), cambiar la firma de `runUnguarded` a `fn: () => T | Promise<T>` y **no** devolver la Promise fuera del `storage.run` (el `return storage.run(next, fn)` ya propaga la Promise). No usar `void save()` suelto.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/services/employee_biometric_face_id_update_token_unguarded.spec.ts tests/unit/mixins/with_sensitive_write_guard.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/employee_biometric_face_id_service.ts app/utils/sensitive_access_context.ts tests/unit/services/employee_biometric_face_id_update_token_unguarded.spec.ts
git commit -m "feat: exceptuar la renovación del token biométrico en la consulta de foto"
```

---

### Task 9: Reconocer el error en los `catch` HTTP (27 + censo)

**Files:**
- Modify: los 10 controllers del Anexo B
- Modify: `app/controllers/user_controller.ts` (`store`, `update`) — censo: copian `person.personEmail`
- Modify: `app/controllers/employee_controller.ts` (`importFromExcel`) — censo: `Person.save` con CURP/RFC/NSS/correo/teléfono
- Test: `tests/unit/controllers/sensitive_write_catch_wiring.spec.ts`

**Interfaces:**
- Consumes: `isSensitiveDataWriteError`, `respondSensitiveDataWriteDenial`
- Produces: esos `catch` devuelven 403 del helper **antes** de caer al 500. Ninguno incluye `error.message` de esta excepción en el body (el helper no lo pone).

Línea canónica (idéntica en todos). Va **primera** dentro del `catch`:

```typescript
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
```

Si el método no tiene `ctx` sino destructuring, pasar a `(ctx: HttpContext)` y `const { request, response, i18n } = ctx` en la primera línea, **o** dejar el destructuring y usar el `HttpContext` completo si ya es el primer argumento con otro nombre. Lo que no vale: llamar al helper sin `i18n`/`response`.

Imports en cada controller:

```typescript
import {
  isSensitiveDataWriteError,
  respondSensitiveDataWriteDenial,
} from '#helpers/sensitive_data_write_api_error'
```

**Anexo B — 27 métodos (nombres reales de este árbol):**

| Controller | Métodos |
|---|---|
| `person_controller.ts` | `store` · `update` |
| `employee_bank_controller.ts` | `store` · `update` |
| `employee_medical_condition_controller.ts` | `store` · `update` |
| `employee_emergency_contact_controller.ts` | `store` · `update` |
| `employee_spouse_controller.ts` | `store` · `update` |
| `work_disability_note_controller.ts` | `store` · `update` |
| `traumatic_event_report_controller.ts` | `store` · `storeFromEmployee` · `update` |
| `employee_lactation_periods_controller.ts` | `store` · `update` · `revokeConflict` · `reassignConflict` · `reassignConflictsBulk` |
| `employee_biometric_controller.ts` | `store` · `updateFingers` · `updateFaceStatus` · `update` |
| `employee_biometric_face_id_controller.ts` | `uploadPhoto` · `replacePhoto` · `getPhotoToken` |

No tocar `deletePhoto`.

**Extras de censo (sin ellos el mixin lanza y el `catch` actual responde 500):**

| Controller | Métodos | Por qué |
|---|---|---|
| `user_controller.ts` | `store` · `update` | `person.personEmail = user.userEmail` + `person.save()` bajo `businessScope` |
| `employee_controller.ts` | `importFromExcel` | `createPerson` / update de persona con columnas clasificadas. Sigue siendo 403 `FORBIDDEN` (no `IMPORT_FORBIDDEN`). No `runUnguarded`. |

`platform_user_controller.store` crea `Person` **sin** ALS (`/api/platform`, sin `businessScope`). El mixin **no lanza**. No montar `sensitiveAccess` ahí en esta rebanada (cambiaría el contrato landlord). Dejarlo escrito en el censo del PR como hueco declarado.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/controllers/sensitive_write_catch_wiring.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const ROOT = process.cwd()

const files: Record<string, number> = {
  'app/controllers/person_controller.ts': 2,
  'app/controllers/employee_bank_controller.ts': 2,
  'app/controllers/employee_medical_condition_controller.ts': 2,
  'app/controllers/employee_emergency_contact_controller.ts': 2,
  'app/controllers/employee_spouse_controller.ts': 2,
  'app/controllers/work_disability_note_controller.ts': 2,
  'app/controllers/traumatic_event_report_controller.ts': 3,
  'app/controllers/employee_lactation_periods_controller.ts': 5,
  'app/controllers/employee_biometric_controller.ts': 4,
  'app/controllers/employee_biometric_face_id_controller.ts': 3,
  'app/controllers/user_controller.ts': 2,
  'app/controllers/employee_controller.ts': 1,
}

test.group('Catch de SensitiveDataWriteError', () => {
  test('cada controller del censo llama al helper el número de veces esperado', ({ assert }) => {
    let total = 0
    for (const [relative, expected] of Object.entries(files)) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      assert.include(source, 'isSensitiveDataWriteError', relative)
      assert.include(source, 'respondSensitiveDataWriteDenial', relative)
      const count = source.split('isSensitiveDataWriteError').length - 1
      assert.equal(count, expected + 1, `${relative} import + ${expected} catch`)
      total += expected
    }
    assert.equal(total, 30)
  })
})
```

El `+ 1` cuenta el identificador en el `import`. Si el import se parte en dos líneas con ambos nombres, `isSensitiveDataWriteError` aparece 1 (import) + N (catches). Ajustar el assert al conteo real tras el primer FAIL, sin bajar de 30 llamadas al helper en catches (30 = `respondSensitiveDataWriteDenial` sin contar import, o contar ese símbolo).

Conteo más robusto: `source.split('respondSensitiveDataWriteDenial').length - 1` debe ser `expected + 1` (import + catches).

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/controllers/sensitive_write_catch_wiring.spec.ts`
Expected: FAIL — los controllers no importan el helper.

- [ ] **Step 3: Write minimal implementation**

En **cada** método de la tabla, primera línea del `catch` existente. Ejemplo real `person_controller.update` (~L634):

```typescript
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      if (error.code === 'E_VALIDATION_ERROR') {
```

`person_controller.store` hoy es `async store({ request, response, i18n }: HttpContext)`. Cambiar a:

```typescript
  async store(ctx: HttpContext) {
    const { request, response, i18n } = ctx
```

y usar `ctx` en el helper. Repetir el patrón donde el `catch` no tenga `ctx`.

`getPhotoToken` también lleva la línea: si alguien llama `save` fuera de `runUnguarded`, debe ser 403 y no 500. Con la Task 8 bien hecha, esa rama no se ejerce en CA-6.

No cambiar status de éxito (Person `update` sigue 201).

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/controllers/sensitive_write_catch_wiring.spec.ts`
Expected: PASS (total 30 reconocimientos).

- [ ] **Step 5: Commit**

```bash
git add app/controllers/person_controller.ts app/controllers/employee_bank_controller.ts app/controllers/employee_medical_condition_controller.ts app/controllers/employee_emergency_contact_controller.ts app/controllers/employee_spouse_controller.ts app/controllers/work_disability_note_controller.ts app/controllers/traumatic_event_report_controller.ts app/controllers/employee_lactation_periods_controller.ts app/controllers/employee_biometric_controller.ts app/controllers/employee_biometric_face_id_controller.ts app/controllers/user_controller.ts app/controllers/employee_controller.ts tests/unit/controllers/sensitive_write_catch_wiring.spec.ts
git commit -m "feat: mapear denegación de escritura sensible a 403 en los puntos HTTP"
```

---

### Task 10: Swagger 403 y censo de rutas bajo contexto

**Files:**
- Modify: bloques `@swagger` de los métodos de la Task 9 (respuesta `403` con el esquema nuevo; no borrar los 200/201 vigentes)
- Modify: `tests/unit/routes/sensitive_access_context_mounts.spec.ts` (ampliar censo)
- Test: el mismo archivo de montajes

**Interfaces:**
- Consumes: contrato `{ title, detail, key, code }`
- Produces: documentación OpenAPI + prueba de que toda ruta HTTP que hace `save()` de los 10 modelos pasa por `businessScope` o `sensitiveAccess`, salvo el hueco landlord documentado

Snippet swagger (pegar en cada método de escritura del Anexo B y extras). No inventar 200 nuevos:

```yaml
 *       '403':
 *         description: Sin permiso de categoría para la transición de un dato sensible. Ningún campo se guardó.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 title:
 *                   type: string
 *                   example: Sin permiso para modificar datos sensibles
 *                 detail:
 *                   type: string
 *                   example: No tienes permiso para modificar datos financieros. Ningún dato de la petición se guardó.
 *                 key:
 *                   type: string
 *                   example: sin-permiso-para-modificar-datos-sensibles
 *                 code:
 *                   type: string
 *                   example: EMP.SENS.WRITE.FORBIDDEN
```

- [ ] **Step 1: Write the failing test**

Añadir a `tests/unit/routes/sensitive_access_context_mounts.spec.ts`:

```typescript
  test('rutas de escritura de los 10 modelos abren businessScope o sensitiveAccess', ({
    assert,
  }) => {
    const writeRouteFiles = [
      'start/routes/person_routes.ts',
      'start/routes/employee_bank_routes.ts',
      'start/routes/employee_medical_condition_routes.ts',
      'start/routes/employee_emergency_contact_routes.ts',
      'start/routes/employee_spouse_routes.ts',
      'start/routes/work_disability_note_routes.ts',
      'start/routes/traumatic_event_report_routes.ts',
      'start/routes/traumatic_event_report_v1_routes.ts',
      'start/routes/employee_lactation_periods_routes.ts',
      'start/routes/employee_biometric_routes.ts',
      'start/routes/employee_biometric_face_id_routes.ts',
      'start/routes/user_routes.ts',
      'start/routes/employee_routes.ts',
    ]
    for (const relative of writeRouteFiles) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      const hasBusiness = source.includes('middleware.businessScope()')
      const hasSensitive = source.includes('middleware.sensitiveAccess()')
      assert.isTrue(
        hasBusiness || hasSensitive,
        `${relative} debe montar businessScope o sensitiveAccess`
      )
    }
  })

  test('la consola landlord no abre contexto sensible (hueco declarado)', ({ assert }) => {
    const source = readFileSync(join(ROOT, 'start/routes/platform_routes.ts'), 'utf-8')
    assert.notInclude(source, 'middleware.businessScope()')
    assert.notInclude(source, 'middleware.sensitiveAccess()')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/sensitive_access_context_mounts.spec.ts`
Expected: el primer test nuevo debería **pasar ya** (las rutas de empleados ya llevan `businessScope`; persons llevan `sensitiveAccess`). Si algún archivo de la lista no existe o cambió de nombre, corregir la lista (drift trivial). Si `employee_biometric_face_id_routes.ts` tiene otro path, usar el path real. Esta task **no** agrega middleware nuevo; si una ruta de escritura de los 10 modelos **no** tiene contexto, **eso es defecto de censo**: montar `sensitiveAccess` **solo** si el grupo ya tiene `auth()` y no puede llevar `businessScope` (mismo patrón que persons). Si hay duda de alcance (p. ej. una ruta pública), escalar a Wilvardo — no fail-open en silencio.

Si el test pasa en verde de entrada, no reescribirlo para hacerlo fallar: seguir al Step 3 de swagger.

- [ ] **Step 3: Write minimal implementation**

Pegar el bloque `403` en los `@swagger` de los métodos de la Task 9. No cambiar summaries ni ejemplos de éxito.

Confirmar nombres de archivos de rutas con `ls start/routes | rg 'person|bank|medical|emergency|spouse|disability|traumatic|lactation|biometric|user_routes|employee_routes'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/sensitive_access_context_mounts.spec.ts`
Expected: PASS

Run: `node ace lint`
Expected: limpio.

- [ ] **Step 5: Commit**

```bash
git add start/routes tests/unit/routes/sensitive_access_context_mounts.spec.ts app/controllers
git commit -m "docs: documentar 403 de escritura sensible y censar rutas bajo contexto"
```

(`git add` solo de controllers/rutas realmente tocados en el diff; no añadir archivos ajenos.)

---

## Verificación manual (PR — resultado literal)

Ejecutar **en este orden**. Si el paso 1 falla, detenerse y rehacer el mixin (la rebanada está mal).

1. **CA-1 primero.** Usuario con `tab-persona-write` y **sin** ningún `sensitive-*-write`. PUT ficha completa de Persona con `personRfc: null` (el BO lo manda así) y cambio de segundo apellido / estado civil. Esperado: **201**, RFC cifrado intacto, **cero** 403. Repetir con eco `"•••••••••2AB3"`: **400/422** de `noMaskCharRule`, **nunca** 403.
2. **CA-2.** Mismo usuario, `personRfc` distinto válido. Esperado: **403** `EMP.SENS.WRITE.FORBIDDEN`, `detail` con «datos de identificación», body sin RFC nuevo ni viejo, fila intacta.
3. **CA-3.** Usuario con `sensitive-contacto-write` y sin identificación. Misma petición: teléfono nuevo + CURP nueva. Esperado: 403 identificación; **tampoco** se guarda el teléfono.
4. **CA-4.** Bancos: CLABE distinta → 403 financieros. CLABE `null` + cambio de tipo de cuenta → **200**, CLABE intacta.
5. **CA-5.** POST banco con CLABE sin permiso → 403 y no hay fila. Con `sensitive-financiero-write` → 201.
6. **CA-6.** GET foto con token distinto, sin `sensitive-biometrico-write`. Esperado: **200**, foto, token renovado, log `runUnguarded`.
7. **CA-7.** Módulo `employees` con exigencia en 0. Rol cliente sin slugs: cambio de CLABE → 403 FORBIDDEN. `owner`/`root`: pasa. Forzar `unresolved` (p. ej. usuario sin rol cargable) → 403 `UNRESOLVED`.
8. **CA-8.** Sin ningún write de categoría: editar nombre/estado civil/ciudad → 201. Condición médica diagnóstico → 403 salud. Reemplazo biométrico → 403 biométricos, registro previo intacto.
9. Pegar en el PR la tabla de rutas del censo (archivo de rutas → `businessScope` o `sensitiveAccess`) y la nota del hueco `/api/platform/users`.
10. Comunicar a Wilvardo el riesgo de despliegue: nadie tiene los cinco `-write`; hace falta aplicar paquetes de rol por empresa **antes** de liberar, o `owner`/`root` como salida. Esta rebanada muerde con el interruptor del módulo aún apagado.

---

## Handoff

Plan listo en `docs/superpowers/plans/2026-08-24-sensitive-write-by-category.md`.

**1. Subagent-Driven (recomendado)** — un subagente por tarea, revisión entre tareas.

**2. Inline Execution** — esta sesión, `executing-plans`, lotes con checkpoints.

¿Cuál?
