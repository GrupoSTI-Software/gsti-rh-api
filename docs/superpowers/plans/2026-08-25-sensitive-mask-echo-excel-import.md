# Neutralizar eco de máscara y gobernar importación Excel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un dato sensible devuelto tapado sin modificar nunca produzca error de captura (en cualquier pantalla), y que un archivo de carga masiva con columnas sensibles se acepte o rechace completo antes de procesar ningún renglón.

**Architecture:** Dos frentes independientes con un solo punto lógico cada uno. (1) Middleware `sensitiveMaskEcho` montado **después de `auth()` y del middleware que abre `SensitiveAccessContext`** (`businessScope` o `sensitiveAccess`): recorre el cuerpo en profundidad 1, elimina claves del catálogo cuyo valor sea eco de máscara y el usuario no tenga `canRead(categoria)`, y reescribe con `request.updateBody()`. (2) En `importFromExcel`, tras `validateExcelHeaders` y **antes** de `worksheet.eachRow` de datos: mapa cabecera → categoría + `canWrite`; si falta permiso, `throw SensitiveDataWriteError(IMPORT_FORBIDDEN)`. El recorrido de persistencia corre dentro de `SensitiveAccessContext.runUnguarded('importación masiva', fn)` para que el mixin de la orden 32 no dispare a mitad de archivo.

**Tech Stack:** AdonisJS 6, VineJS (`noMaskCharRule` intacto), `SensitiveAccessContext` (ALS, orden 30/32), `maskSensitiveValue` / `isMaskEcho`, ExcelJS, i18n `resources/langs/{es,en}.json`.

## Global Constraints

- Historia: **USRH1787433076990** · orden **34** · cuarta y última del tramo de escritura por categoría. Spec fuente: `spec-USRH1787433076990.md` (anexo del usuario). **No va a Asana.**
- Rebanada **solo API**. Cero líneas de `valanserh-bo`. **Sin migraciones. Sin seeders.** Sin endpoints nuevos. Sin tocar `SENSITIVE_FIELDS`, `role_presets.ts`, `employees_permission_catalog.ts`, `with_sensitive_write_guard.ts`, `no_mask_char_rule.ts`.
- Target de rama: `feature/USRH1787433076990-escritura-sensibles-importacion` sobre la rama de la orden 32 (`feature/USRH1787204602831-escritura-sensibles-categoria`).
- **Bloqueo:** al empezar verificar que existen `SensitiveAccessContext.canRead`, `canWrite`, `runUnguarded` y `app/constants/sensitive_data_write_error_codes.ts`. Si falta alguno, **parar y escalar a Wilvardo** (órdenes 30/32 incompletas).
- **Sin tests automatizados** (regla vigente del equipo y spec §Alcance). Validación con las 8 pruebas manuales del spec; resultado literal en el PR.
- Código y comentarios en español; identificadores en inglés. Commits: Conventional Commits, tipo en inglés, descripción en español.
- **No relajar `noMaskCharRule`:** sigue rechazando corrupción real y ecos de quien sí tiene lectura.
- **Descarte silencioso declarado:** valor con forma de máscara editado por quien no tiene lectura se elimina del cuerpo sin aviso; documentar en contrato de API y nota a soporte.
- **Salario diario fuera:** cabecera `Salario diario` → `Employee.dailySalary` **no está en el catálogo** hoy; el mapa de cabeceras **no la incluye**. Hueco con dueño USRH1787433076994 (orden 38).
- **Profundidad del cuerpo:** profundidad **1** (objeto plano). Censo en Task 0. Si aparece un contraejemplo en implementación, **escalar a Wilvardo** antes de añadir recursión.
- Montaje del middleware: **nombrado, después de `auth()`**, condicionado por `canRead === false`. Alternativa global en `router.use` solo con aprobación explícita de Wilvardo.
- El middleware **solo elimina claves**; nunca escribe ni sustituye valores.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/helpers/sensitive_mask.ts` | Agregar `MASK_ECHO_PATTERNS` + `isMaskEcho(value)`. `maskSensitiveValue` intacto. |
| `app/helpers/sensitive_mask_echo_body.ts` | `neutralizeSensitiveMaskEchoInBody(body)` — recorrido profundidad 1, usa catálogo + `isMaskEcho` + `canRead`. |
| `app/middleware/sensitive_mask_echo_middleware.ts` | Solo POST/PUT/PATCH con cuerpo JSON; llama al helper y `updateBody`. |
| `start/kernel.ts` | Registrar `sensitiveMaskEcho` en `router.named`. |
| `start/routes/*.ts` (17 grupos de escritura) | `.use(middleware.sensitiveMaskEcho())` **después** de `businessScope()` o `sensitiveAccess()`. |
| `app/constants/employee_excel_sensitive_headers.ts` | Mapa ampliable cabecera Excel → `LegalCategory` (Anexo B del spec). |
| `app/constants/sensitive_data_write_error_codes.ts` | Agregar `IMPORT_FORBIDDEN: 'EMP.SENS.WRITE.IMPORT_FORBIDDEN'`. |
| `app/helpers/sensitive_data_write_api_error.ts` | Rama `IMPORT_FORBIDDEN` con `{ title, detail, key, code }` del contrato. |
| `app/services/employee_service.ts` | `assertExcelSensitiveHeadersWritable` tras headers; `runUnguarded` en persistencia. |
| `app/controllers/employee_controller.ts` | `@swagger` 403 import; el `catch` ya reconoce `SensitiveDataWriteError` — verificar que `IMPORT_FORBIDDEN` responde bien. |
| `resources/langs/es.json` / `en.json` | Textos del 403 de importación. |
| `tests/unit/constants/sensitive_data_write_error_codes.spec.ts` | Actualizar: `IMPORT_FORBIDDEN` **sí** se declara (invertir test de la orden 32). |

**No se modifica:** `app/mixins/with_sensitive_write_guard.ts` · `app/validators/*` · `app/constants/sensitive_fields.ts` · migraciones · seeders · `valanserh-bo`.

---

### Task 0: Pre-vuelo y censo de profundidad del cuerpo

**Files:**
- Read: `app/utils/sensitive_access_context.ts`, `app/constants/sensitive_data_write_error_codes.ts`, `app/mixins/with_sensitive_write_guard.ts`
- Read: validators con `noMaskCharRule` en `app/validators/`
- Documentar en comentario de `app/helpers/sensitive_mask_echo_body.ts` (Task 3)

**Interfaces:**
- Consumes: nada
- Produces: decisión documentada **profundidad 1** y lista de columnas sensibles en cuerpo HTTP

- [ ] **Step 1: Verificar dependencias de la orden 32**

Run:
```bash
grep -n "runUnguarded\|canRead\|canWrite" app/utils/sensitive_access_context.ts
test -f app/constants/sensitive_data_write_error_codes.ts && echo OK
test -f app/mixins/with_sensitive_write_guard.ts && echo OK
```
Expected: los tres existen. Si falta alguno → **parar y escalar**.

- [ ] **Step 2: Censo de profundidad — confirmar profundidad 1**

Revisar validators que usan `noMaskCharRule` (todos en `app/validators/`):

| Validator | Claves sensibles | ¿Anidadas? |
|-----------|------------------|------------|
| `person.ts` | `personCurp`, `personRfc`, `personImssNss`, `personEmail`, `personPhone`, `personPhoneSecondary` | No — objeto plano |
| `employee_bank.ts` | `employeeBankAccountClabe`, `employeeBankAccountNumber`, `employeeBankAccountCardNumber` | No |
| `employee_medical_condition.ts` | `employeeMedicalConditionDiagnosis`, `employeeMedicalConditionNotes` | No — `propertyValues[]` no es catálogo |
| `employee_emergency_contact.ts` | `employeeEmergencyContactPhone` | No |
| `employee_spouse.ts` | `employeeSpousePhone` | No |
| `employee_lactation_period.ts` | `employeeLactationPeriodNotes` | No |
| `work_disability_note.ts` | `workDisabilityNoteDescription` | No |
| `traumatic_event_report.ts` | `traumaticEventReportInvolvedPeople`, `traumaticEventReportDescription` | No |

Controllers relevantes usan `request.input('personCurp')` etc. — cuerpo plano (`person_controller.ts`, pantallas piloto/sobrecargo/cliente vía `PUT /api/persons`).

**Decisión:** profundidad **1**. El helper solo recorre `Object.keys(body)`; no desciende a `propertyValues` ni a arrays.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "docs: Documentar censo de profundidad 1 para eco de máscara"
```
(Solo si Task 0 no generó archivos; el comentario definitivo va en Task 3.)

---

### Task 1: `isMaskEcho` en `sensitive_mask.ts`

**Files:**
- Modify: `app/helpers/sensitive_mask.ts` (al final, después de `maskEmail`)
- Manual check: Anexo A del spec

**Interfaces:**
- Consumes: `MASK_CHAR` existente
- Produces:
  - `MASK_ECHO_PATTERNS: readonly RegExp[]` (3 patrones del spec)
  - `isMaskEcho(value: unknown): boolean`

- [ ] **Step 1: Agregar patrones y función**

Al final de `app/helpers/sensitive_mask.ts`:

```typescript
/** Formas que `maskSensitiveValue` puede producir — reconocimiento sin BD (USRH1787433076990). */
export const MASK_ECHO_PATTERNS: readonly RegExp[] = [
  /^•+$/, // salud / biométrico y valores len ≤ 4
  /^•+[^•]{4}$/, // identificación, financiero, teléfonos
  /^[^•]•{3}@[^•]+$/, // correo contacto
]

export function isMaskEcho(value: unknown): boolean {
  return typeof value === 'string' && MASK_ECHO_PATTERNS.some((pattern) => pattern.test(value))
}
```

- [ ] **Step 2: Verificación manual con el helper real**

Run en `node ace repl`:
```javascript
const { maskSensitiveValue, isMaskEcho } = await import('#helpers/sensitive_mask')

// 8 ecos legítimos (Anexo A)
const cases = [
  [maskSensitiveValue('VARL850602AB3', 'identificacion'), true],
  [maskSensitiveValue('VACW850312J95', 'identificacion'), true],
  [maskSensitiveValue('ABCD123456MDFABC01', 'identificacion'), true],
  [maskSensitiveValue('012345678901234567', 'financiero'), true],
  [maskSensitiveValue('5512345678', 'contacto'), true],
  [maskSensitiveValue('juan@empresa.com', 'contacto'), true],
  [maskSensitiveValue('cualquier-diagnostico', 'salud'), true],
  [maskSensitiveValue('abc', 'identificacion'), true],
  ['•••X1234ABCD', false],
  ['VARL•50602AB3', false],
]
for (const [val, expected] of cases) {
  const got = isMaskEcho(val)
  if (got !== expected) throw new Error(`${val} → ${got}, expected ${expected}`)
}
console.log('isMaskEcho: 10/10 OK')
```

Expected: `isMaskEcho: 10/10 OK`

- [ ] **Step 3: Lint**

Run: `node ace lint app/helpers/sensitive_mask.ts`
Expected: limpio

- [ ] **Step 4: Commit**

```bash
git add app/helpers/sensitive_mask.ts
git commit -m "feat: Agregar isMaskEcho para reconocer ecos de máscara"
```

---

### Task 2: Helper de neutralización del cuerpo

**Files:**
- Create: `app/helpers/sensitive_mask_echo_body.ts`
- Modify: `app/helpers/sensitive_mask.ts` (solo si hace falta reexport; preferible import directo)

**Interfaces:**
- Consumes: `isMaskEcho` de `#helpers/sensitive_mask`, `SENSITIVE_FIELDS` vía `SensitiveFieldsCatalogService`, `SensitiveAccessContext.canRead`
- Produces:
  - `neutralizeSensitiveMaskEchoInBody(body: Record<string, unknown>): Record<string, unknown>`
  - Mapa estático `SENSITIVE_COLUMN_KEYS: ReadonlySet<string>` y `columnCategory: Map<string, LegalCategory>` construidos una vez desde el catálogo

- [ ] **Step 1: Implementar helper**

`app/helpers/sensitive_mask_echo_body.ts`:

```typescript
import type { LegalCategory } from '#constants/sensitive_fields'
import { SENSITIVE_FIELDS } from '#constants/sensitive_fields'
import { isMaskEcho } from '#helpers/sensitive_mask'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

/**
 * Censo USRH1787433076990 Task 0: profundidad 1 — el BO envía objeto plano
 * en todas las pantallas de expediente gobernadas; propertyValues médicos no son catálogo.
 */
const columnCategory = new Map<string, LegalCategory>(
  SENSITIVE_FIELDS.map((field) => [field.column, field.legalCategory])
)

export const SENSITIVE_COLUMN_KEYS: ReadonlySet<string> = new Set(columnCategory.keys())

export function neutralizeSensitiveMaskEchoInBody(
  body: Record<string, unknown>
): Record<string, unknown> {
  if (!SensitiveAccessContext.isActive()) return body

  let changed = false
  const next: Record<string, unknown> = { ...body }

  for (const key of Object.keys(next)) {
    if (!SENSITIVE_COLUMN_KEYS.has(key)) continue
    const value = next[key]
    if (!isMaskEcho(value)) continue

    const category = columnCategory.get(key)!
    if (SensitiveAccessContext.canRead(category)) continue

    delete next[key]
    changed = true
  }

  return changed ? next : body
}
```

- [ ] **Step 2: Verificación manual rápida en repl**

```javascript
const { neutralizeSensitiveMaskEchoInBody } = await import('#helpers/sensitive_mask_echo_body')
const { SensitiveAccessContext } = await import('#utils/sensitive_access_context')
const { maskSensitiveValue } = await import('#helpers/sensitive_mask')

const echo = maskSensitiveValue('VARL850602AB3', 'identificacion')
const body = { personRfc: echo, personFirstname: 'Ana' }

SensitiveAccessContext.run(
  {
    read: { identificacion: false, contacto: false, financiero: false, salud: false, biometrico: false },
    write: { identificacion: 'denied', contacto: 'denied', financiero: 'denied', salud: 'denied', biometrico: 'denied' },
  },
  () => {
    const out = neutralizeSensitiveMaskEchoInBody(body)
    if ('personRfc' in out) throw new Error('debe eliminar personRfc')
    if (out.personFirstname !== 'Ana') throw new Error('no tocar no sensible')
  }
)
console.log('neutralize OK')
```

Expected: `neutralize OK`

- [ ] **Step 3: Lint y commit**

```bash
node ace lint app/helpers/sensitive_mask_echo_body.ts
git add app/helpers/sensitive_mask_echo_body.ts
git commit -m "feat: Agregar helper para neutralizar eco de máscara en el cuerpo"
```

---

### Task 3: Middleware `sensitiveMaskEcho`

**Files:**
- Create: `app/middleware/sensitive_mask_echo_middleware.ts`
- Modify: `start/kernel.ts`

**Interfaces:**
- Consumes: `neutralizeSensitiveMaskEchoInBody`, `ctx.request.body()`, `ctx.request.updateBody()`
- Produces: middleware registrado como `sensitiveMaskEcho` en `router.named`

- [ ] **Step 1: Crear middleware**

`app/middleware/sensitive_mask_echo_middleware.ts`:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { neutralizeSensitiveMaskEchoInBody } from '#helpers/sensitive_mask_echo_body'

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH'])

export default class SensitiveMaskEchoMiddleware {
  async handle({ request }: HttpContext, next: NextFn) {
    if (!WRITE_METHODS.has(request.method())) {
      return next()
    }

    const contentType = request.header('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      return next()
    }

    const body = request.body()
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return next()
    }

    const neutralized = neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>)
    if (neutralized !== body) {
      request.updateBody({ ...request.body(), ...neutralized })
    }

    return next()
  }
}
```

> **Nota `updateBody`:** mismo patrón que `resolve_business_unit_id_param.ts` — mezcla query + body. Solo se omiten claves del catálogo; no se inyectan valores.

- [ ] **Step 2: Registrar en kernel**

En `start/kernel.ts`, dentro de `router.named({...})`, después de `sensitiveAccess`:

```typescript
  /** Neutraliza reenvío de datos enmascarados (USRH1787433076990). Requiere ALS abierto. */
  sensitiveMaskEcho: () => import('#middleware/sensitive_mask_echo_middleware'),
```

- [ ] **Step 3: Lint**

Run: `node ace lint app/middleware/sensitive_mask_echo_middleware.ts start/kernel.ts`

- [ ] **Step 4: Commit**

```bash
git add app/middleware/sensitive_mask_echo_middleware.ts start/kernel.ts
git commit -m "feat: Registrar middleware sensitiveMaskEcho"
```

---

### Task 4: Montar middleware en grupos de escritura del expediente

**Files:**
- Modify: 17 archivos de rutas (ver lista abajo)

**Interfaces:**
- Consumes: `middleware.sensitiveMaskEcho()` de `#start/kernel`
- Produces: cadena `.use(middleware.auth()).use(middleware.businessScope()|sensitiveAccess()).use(middleware.sensitiveMaskEcho())` en cada grupo con POST/PUT/PATCH de los 10 modelos gobernados

- [ ] **Step 1: Montar en grupos con `businessScope()`**

Agregar `.use(middleware.sensitiveMaskEcho())` **inmediatamente después** de `businessScope()`:

- `start/routes/employee_routes.ts` (grupo `/api/employees`)
- `start/routes/employee_bank_routes.ts`
- `start/routes/employee_medical_condition_routes.ts`
- `start/routes/employee_emergency_contact_routes.ts`
- `start/routes/employee_spouse_routes.ts`
- `start/routes/work_disability_note_routes.ts`
- `start/routes/traumatic_event_report_routes.ts`
- `start/routes/traumatic_event_report_v1_routes.ts`
- `start/routes/employee_lactation_periods_routes.ts`
- `start/routes/employee_biometric_routes.ts`
- `start/routes/employee_biometric_face_id_routes.ts`
- `start/routes/user_routes.ts` (grupos con escritura)

Ejemplo (`employee_bank_routes.ts`):

```typescript
  .prefix('/api/employee-banks')
  .use(middleware.auth())
  .use(middleware.businessScope())
  .use(middleware.sensitiveMaskEcho())
```

- [ ] **Step 2: Montar en grupos con `sensitiveAccess()`**

Agregar `.use(middleware.sensitiveMaskEcho())` después de `sensitiveAccess()`:

- `start/routes/person_routes.ts` — **solo** el grupo `prefix('/api/persons')`, no `person-get-employee`
- `start/routes/pilot_routes.ts`
- `start/routes/flight_attendant_routes.ts`
- `start/routes/customer_routes.ts`
- `start/routes/synchronization_routes.ts`

- [ ] **Step 3: Verificar orden de middleware**

Orden obligatorio: `auth()` → `businessScope()` | `sensitiveAccess()` → `sensitiveMaskEcho()` → `permissionGate(...)` (si aplica por ruta).

Run:
```bash
grep -n "sensitiveMaskEcho" start/routes/*.ts | wc -l
```
Expected: al menos 17 líneas (un grupo por archivo listado; `person_routes` cuenta 1).

- [ ] **Step 4: Commit**

```bash
git add start/routes/
git commit -m "feat: Montar sensitiveMaskEcho en rutas de escritura del expediente"
```

---

### Task 5: Mapa cabecera Excel → categoría

**Files:**
- Create: `app/constants/employee_excel_sensitive_headers.ts`

**Interfaces:**
- Consumes: `LegalCategory` de `#constants/sensitive_fields`
- Produces:
  - `EMPLOYEE_EXCEL_SENSITIVE_HEADERS: readonly { header: string; category: LegalCategory }[]`
  - `findSensitiveCategoriesInExcelHeaders(headers: string[]): LegalCategory[]` — categorías presentes en el archivo (match case-insensitive exacto contra `header`)

- [ ] **Step 1: Crear mapa ampliable (Anexo B)**

`app/constants/employee_excel_sensitive_headers.ts`:

```typescript
import type { LegalCategory } from '#constants/sensitive_fields'

/**
 * Cabeceras del Excel de importación que escriben columnas del catálogo sensible.
 * Tabla ampliable de una línea — USRH1787433076994 añade Salario diario → financiero.
 * USRH1787433076990: sin Salario diario (no clasificado hoy).
 */
export const EMPLOYEE_EXCEL_SENSITIVE_HEADERS = [
  { header: 'CURP', category: 'identificacion' as const },
  { header: 'RFC', category: 'identificacion' as const },
  { header: 'NSS', category: 'identificacion' as const },
  { header: 'Correo personal', category: 'contacto' as const },
  { header: 'Teléfono Personal', category: 'contacto' as const },
  { header: 'Teléfono contacto emergencia', category: 'contacto' as const },
] as const satisfies ReadonlyArray<{ header: string; category: LegalCategory }>

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase()
}

export function findSensitiveCategoriesInExcelHeaders(headers: string[]): LegalCategory[] {
  const present = new Set<LegalCategory>()
  const normalizedFileHeaders = new Set(
    headers.filter((h) => typeof h === 'string' && h.trim() !== '').map(normalizeHeader)
  )

  for (const entry of EMPLOYEE_EXCEL_SENSITIVE_HEADERS) {
    if (normalizedFileHeaders.has(normalizeHeader(entry.header))) {
      present.add(entry.category)
    }
  }

  return [...present]
}
```

- [ ] **Step 2: Lint y commit**

```bash
node ace lint app/constants/employee_excel_sensitive_headers.ts
git add app/constants/employee_excel_sensitive_headers.ts
git commit -m "feat: Agregar mapa de cabeceras sensibles del Excel de importación"
```

---

### Task 6: Comprobación previa y `runUnguarded` en `employee_service`

**Files:**
- Modify: `app/services/employee_service.ts` (~2697 y bucle de persistencia ~2813+)
- Import: `findSensitiveCategoriesInExcelHeaders`, `SENSITIVE_WRITE_CATEGORY_ORDER`, `SensitiveAccessContext`, `SensitiveDataWriteError`, `SENSITIVE_DATA_WRITE_ERROR_CODES`

**Interfaces:**
- Consumes: `headers` de `validateExcelHeaders`, `SensitiveAccessContext.canWrite`, `SENSITIVE_WRITE_CATEGORY_ORDER` de `#mixins/with_sensitive_write_guard`
- Produces:
  - `private assertExcelSensitiveHeadersWritable(headers: string[]): void` — lanza `SensitiveDataWriteError(IMPORT_FORBIDDEN, category)` si falta `canWrite`
  - `importFromExcel` envuelve persistencia en `runUnguarded`

- [ ] **Step 1: Agregar método privado**

En `EmployeeService`, cerca de `validateExcelHeaders`:

```typescript
import { findSensitiveCategoriesInExcelHeaders } from '#constants/employee_excel_sensitive_headers'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import { SENSITIVE_WRITE_CATEGORY_ORDER } from '#mixins/with_sensitive_write_guard'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

private assertExcelSensitiveHeadersWritable(headers: string[]): void {
  const categoriesPresent = findSensitiveCategoriesInExcelHeaders(headers)
  if (categoriesPresent.length === 0) return

  const denied = categoriesPresent.filter((category) => !SensitiveAccessContext.canWrite(category))
  if (denied.length === 0) return

  const category =
    SENSITIVE_WRITE_CATEGORY_ORDER.find((item) => denied.includes(item)) ?? denied[0]
  throw new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.IMPORT_FORBIDDEN, category)
}
```

- [ ] **Step 2: Llamar justo después de `validateExcelHeaders`**

En `importFromExcel`, reemplazar:

```typescript
const { headers, headerRowNumber } = this.validateExcelHeaders(worksheet)

// Obtener departamentos...
```

por:

```typescript
const { headers, headerRowNumber } = this.validateExcelHeaders(worksheet)
this.assertExcelSensitiveHeadersWritable(headers)

// Obtener departamentos...
```

Esto corre **antes** de `worksheet.eachRow` que recolecta filas de datos (~2767).

- [ ] **Step 3: Envolver persistencia en `runUnguarded`**

Extraer el bloque desde la recolección de filas (`worksheet.eachRow` / `rows`) hasta el final del procesamiento (incluye `createPerson`, `updateExistingEmployee`, `syncCreatedEmployeesToZkDevices`) dentro de:

```typescript
return SensitiveAccessContext.runUnguarded('importación masiva', async () => {
  // ... todo el código existente desde eachRow hasta return del resultado
})
```

La comprobación de cabeceras y `assertExcelSensitiveHeadersWritable` quedan **fuera** de `runUnguarded`.

- [ ] **Step 4: Lint**

Run: `node ace lint app/services/employee_service.ts`

- [ ] **Step 5: Commit**

```bash
git add app/services/employee_service.ts
git commit -m "feat: Validar permisos sensibles en cabeceras Excel antes de importar"
```

---

### Task 7: Código `IMPORT_FORBIDDEN`, i18n y respuesta HTTP

**Files:**
- Modify: `app/constants/sensitive_data_write_error_codes.ts`
- Modify: `app/helpers/sensitive_data_write_api_error.ts`
- Modify: `resources/langs/es.json`, `resources/langs/en.json`
- Modify: `tests/unit/constants/sensitive_data_write_error_codes.spec.ts`

**Interfaces:**
- Consumes: `SensitiveDataWriteError` con `errorCode === IMPORT_FORBIDDEN` y `category`
- Produces: respuesta 403:
```json
{
  "title": "El archivo contiene datos sensibles que no puedes modificar",
  "detail": "El archivo incluye columnas de datos de identificación y no tienes permiso para modificarlos. No se procesó ningún registro.",
  "key": "el-archivo-contiene-datos-sensibles-que-no-puedes-modificar",
  "code": "EMP.SENS.WRITE.IMPORT_FORBIDDEN"
}
```

- [ ] **Step 1: Agregar código**

En `app/constants/sensitive_data_write_error_codes.ts`:

```typescript
export const SENSITIVE_DATA_WRITE_ERROR_CODES = {
  FORBIDDEN: 'EMP.SENS.WRITE.FORBIDDEN',
  UNRESOLVED: 'EMP.SENS.WRITE.UNRESOLVED',
  /** Archivo Excel con columnas sensibles sin permiso de escritura — 403, rechazo total. */
  IMPORT_FORBIDDEN: 'EMP.SENS.WRITE.IMPORT_FORBIDDEN',
} as const
```

Actualizar el comentario del archivo: ya no es “orden 33”; es esta rebanada.

- [ ] **Step 2: Rama en `respondSensitiveDataWriteDenial`**

En `app/helpers/sensitive_data_write_api_error.ts`, antes del branch `UNRESOLVED`:

```typescript
  if (error.errorCode === SENSITIVE_DATA_WRITE_ERROR_CODES.IMPORT_FORBIDDEN) {
    const category = error.category ?? 'identificacion'
    return {
      title: ctx.i18n.t('sensitive_data_write_import_forbidden_title'),
      detail: ctx.i18n.t('sensitive_data_write_import_forbidden_detail', {
        category: categoryLabel(ctx, category),
      }),
      key: 'el-archivo-contiene-datos-sensibles-que-no-puedes-modificar',
      code: error.errorCode,
    }
  }
```

- [ ] **Step 3: Textos i18n**

`resources/langs/es.json`:
```json
"sensitive_data_write_import_forbidden_title": "El archivo contiene datos sensibles que no puedes modificar",
"sensitive_data_write_import_forbidden_detail": "El archivo incluye columnas de {category} y no tienes permiso para modificarlos. No se procesó ningún registro."
```

`resources/langs/en.json`:
```json
"sensitive_data_write_import_forbidden_title": "The file contains sensitive data you cannot modify",
"sensitive_data_write_import_forbidden_detail": "The file includes {category} columns and you do not have permission to modify them. No records were processed."
```

(Reutilizar claves `sensitive_data_write_category_*` existentes para `{category}`.)

- [ ] **Step 4: Actualizar test unitario de códigos**

En `tests/unit/constants/sensitive_data_write_error_codes.spec.ts`, reemplazar el test que niega `IMPORT_FORBIDDEN` por:

```typescript
  test('declara IMPORT_FORBIDDEN para rechazo de Excel', ({ assert }) => {
    assert.equal(
      SENSITIVE_DATA_WRITE_ERROR_CODES.IMPORT_FORBIDDEN,
      'EMP.SENS.WRITE.IMPORT_FORBIDDEN'
    )
  })
```

Run: `node ace test tests/unit/constants/sensitive_data_write_error_codes.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add app/constants/sensitive_data_write_error_codes.ts app/helpers/sensitive_data_write_api_error.ts resources/langs/es.json resources/langs/en.json tests/unit/constants/sensitive_data_write_error_codes.spec.ts
git commit -m "feat: Agregar respuesta 403 IMPORT_FORBIDDEN para carga masiva"
```

---

### Task 8: Swagger y verificación del `catch` de importación

**Files:**
- Modify: `app/controllers/employee_controller.ts` (~6985 swagger, ~7292 catch)

**Interfaces:**
- Consumes: `respondSensitiveDataWriteDenial` ya importado; `isSensitiveDataWriteError` ya en catch
- Produces: documentación OpenAPI del 403 `EMP.SENS.WRITE.IMPORT_FORBIDDEN`

- [ ] **Step 1: Agregar respuesta 403 en `@swagger` de `import-excel`**

Dentro de `responses` del bloque `/api/employees/import-excel`:

```yaml
 *       403:
 *         description: Archivo con columnas sensibles sin permiso de escritura
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 title:
 *                   type: string
 *                   example: El archivo contiene datos sensibles que no puedes modificar
 *                 detail:
 *                   type: string
 *                 key:
 *                   type: string
 *                   example: el-archivo-contiene-datos-sensibles-que-no-puedes-modificar
 *                 code:
 *                   type: string
 *                   example: EMP.SENS.WRITE.IMPORT_FORBIDDEN
```

Añadir nota en `description` del endpoint sobre descarte silencioso de ecos en otras rutas (una línea, referencia al contrato).

- [ ] **Step 2: Confirmar que el catch no devuelve 500**

El `catch` en `importFromExcel` ya tiene:
```typescript
if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
```
Verificar que `IMPORT_FORBIDDEN` cae ahí y no en el branch de 500.

- [ ] **Step 3: Commit**

```bash
git add app/controllers/employee_controller.ts
git commit -m "docs: Documentar 403 IMPORT_FORBIDDEN en importación Excel"
```

---

### Task 9: Pruebas manuales obligatorias (resultado literal en el PR)

**Files:**
- Ninguno (validación manual)

**Interfaces:**
- Consumes: API en staging/local, roles de prueba, archivos Excel de prueba
- Produces: tabla de resultados en descripción del PR

- [ ] **Step 1: Eco limpio — persona (CA-1, CA-2, teléfono secundario)**

Rol **sin** `sensitive-identificacion-read` y **sin** `sensitive-contacto-read`.

1. `PUT /api/persons/:id` con ficha completa y `personRfc` = salida de `maskSensitiveValue('VARL850602AB3','identificacion')` sin tocar.
   - Expected: **201**, sin `E_VALIDATION_ERROR`, RFC en BD intacto.
2. Mismo rol: guardar desde piloto / sobrecargo / cliente corrigiendo solo licencia.
   - Expected: pasa; CURP intacta.
3. `personPhoneSecondary` en pestaña Persona con eco tapado.
   - Expected: pasa (CA-2 caso vivo).

- [ ] **Step 2: Controles negativos (CA-3, CA-4)**

1. Enviar `personRfc: '•••X1234ABCD'` → **400** `E_VALIDATION_ERROR` / `noMaskChar`.
2. Rol **con** `sensitive-identificacion-read`: eco `•••…` en RFC → **400** (no neutralizar).
3. Campo no catálogo con aspecto de máscara (p. ej. `employeeFirstName: '••••'`) → llega intacto, sin error por máscara.

- [ ] **Step 3: Descarte silencioso (CA-8)**

Rol sin `sensitive-financiero-read`. `PUT /api/employee-banks/:id` con `employeeBankAccountCardNumber: '••••••••••••••9999'` (editado sobre máscara).
- Expected: **200**, tarjeta en BD **sin cambio**.

- [ ] **Step 4: Excel — rechazo previo (CA-5, CA-7)**

1. Contar empleados/personas antes de importar.
2. Rol con `import-employees`, **sin** `sensitive-identificacion-write`. Archivo con columna `NSS`.
3. `POST /api/employees/import-excel` con archivo.
   - Expected: **403**, `code: EMP.SENS.WRITE.IMPORT_FORBIDDEN`, `key: el-archivo-contiene-datos-sensibles-que-no-puedes-modificar`, detail nombra identificación, **cero filas** procesadas, conteo BD idéntico.

- [ ] **Step 5: Excel — casos que pasan (CA-6)**

1. Archivo sin columnas sensibles → import normal.
2. Con `sensitive-identificacion-write` + `sensitive-contacto-write` y columnas CURP/RFC/NSS/correos/teléfonos → mismo resultado que antes de la rebanada.

- [ ] **Step 6: Registrar resultados literales en el PR**

Copiar status HTTP, `code`, y observaciones de BD en la descripción del PR (plantilla del spec §Verificación técnica).

- [ ] **Step 7: Commit vacío o nota en PR** (sin código)

---

### Task 10: Lint final y documentación a soporte

**Files:**
- Modify: comentario en `app/middleware/sensitive_mask_echo_middleware.ts` o README interno si existe contrato API

- [ ] **Step 1: Lint completo**

Run: `node ace lint`
Expected: limpio

- [ ] **Step 2: Párrafo para soporte (pegar en PR o wiki)**

> Un valor sensible cuya forma coincide con una máscara del sistema (`•`) se trata como no enviado cuando el usuario no tiene permiso de lectura de esa categoría. Si el usuario escribió sobre la máscara en vez de borrarla primero, ese valor se descarta sin aviso y el dato guardado no cambia.

- [ ] **Step 3: Commit final si quedaron ajustes de lint**

```bash
git commit -m "chore: Lint y documentación de descarte silencioso de máscara"
```

---

## Self-Review

| Requisito del spec | Task |
|--------------------|------|
| CA-1 eco limpio no estorba | 1, 2, 3, 4, 9 |
| CA-2 piloto/sobrecargo/cliente + teléfono secundario | 3, 4, 9 |
| CA-3 valor corrupto sigue 400 | 1 (no neutraliza), 9 |
| CA-4 campo no clasificado intacto | 2 (solo catálogo), 9 |
| CA-5 Excel rechazo por cabecera | 5, 6, 7, 9 |
| CA-6 Excel casos que pasan | 5, 6, 9 |
| CA-7 nunca a mitad de camino | 6 (`runUnguarded`), 9 |
| CA-8 descarte silencioso declarado | 7, 9, 10 |
| Salario diario fuera del mapa | 5 (documentado) |
| Sin migraciones/seeders/BO | Global Constraints |
| `isMaskEcho` junto a `maskSensitiveValue` | 1 |
| Mapa ampliable para orden 38 | 5 |
| Profundidad del cuerpo fijada | 0, 2 |

**Placeholder scan:** ninguno.

**Type consistency:** `IMPORT_FORBIDDEN` en códigos, excepción, helper HTTP e i18n alineados. `SENSITIVE_WRITE_CATEGORY_ORDER` reutilizado del mixin.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-25-sensitive-mask-echo-excel-import.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
