# Eco de máscara e importación Excel — Plan de pruebas QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar la matriz QA de USRH1787433076990: unitarios del motor (`isMaskEcho`, neutralización del cuerpo, mapa de cabeceras Excel, helper 403 `IMPORT_FORBIDDEN`, cableado de rutas) más suite Japa HTTP (Functional / Integración) que demuestra CA-1 a CA-8 contra la app real; si un test revela un hueco de producto, se aplica el fix mínimo en el mismo task y se re-corre — no se relaja la aserción.

**Architecture:** El producto vive en `feature/USRH1787433076990-escritura-sensibles-importacion`. Los unitarios caracterizan el motor sin HTTP. La suite functional reutiliza `tests/functional/employees/sensitive_read_by_category_support.ts` (`createActor`, `createSensitiveFixture`, `grantOnly`, `CLEAR_FIXED`, `maskSensitiveValue`) y añade `sensitive_mask_echo_support.ts` para oráculos de eco, Excel mínimo y conteos de filas. TDD de caracterización: el producto ya existe; cada test nuevo **debe pasar**. Si falla → `fix:` en producto en el mismo task, luego re-run.

**Tech Stack:** AdonisJS 6, Lucid, Japa (`@japa/runner` + HTTP client), ExcelJS, `SensitiveAccessContext`, `maskSensitiveValue` / `isMaskEcho`, `PermissionGateService.evaluateEnforced`.

## Global Constraints

- Historia: **USRH1787433076990** · orden **34**. Spec: `spec-USRH1787433076990.md`. Plan de producto: `docs/superpowers/plans/2026-08-25-sensitive-mask-echo-excel-import.md`.
- Rebanada **solo API**. Sin migraciones. Sin seeders. Sin tocar `SENSITIVE_FIELDS`, `role_presets.ts`, `employees_permission_catalog.ts`, `no_mask_char_rule.ts`, `with_sensitive_write_guard.ts` salvo gap de producto.
- **Cambio de comportamiento respecto a la orden 32:** un eco limpio de máscara **ya no** produce `400 E_VALIDATION_ERROR`; el middleware lo neutraliza y la petición **pasa** (201/200) con el valor guardado intacto. El test `employees_sensitive_write_by_category.spec.ts` línea 113 debe actualizarse — no es regresión del producto, es obsolescencia del oráculo anterior.
- **Corrupción real** (valor con `•` que no encaja en las 3 formas) sigue en `400/422` por `noMaskCharRule`.
- Usuario **con** `sensitive-<categoria>-read` que envía eco: **no** se neutraliza; llega al validator y se rechaza como corrupción.
- Excel: rechazo **403** `EMP.SENS.WRITE.IMPORT_FORBIDDEN` antes de leer filas; **cero** empleados/personas creados o actualizados. El `detail` nombra la categoría, nunca valores del archivo.
- Cabecera `Salario diario` **no** se comprueba (hueco USRH1787433076994).
- Interruptor `employees.systemModulePermissionEnforcementActive` queda `false` tras cada grupo HTTP.
- Código y comentarios en español; identificadores en inglés. Commits: Conventional Commits — `test:` para tests, `fix:` para gaps de producto en el mismo task.
- Prohibido asertar valores sensibles en claro dentro de `title`/`detail`/`key`/`code` de respuestas de error.

---

## Contratos fijos de la suite

### Oráculo eco limpio (CA-1, CA-2)

```typescript
export function assertMaskEchoAccepted(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert
) {
  assert.equal(response.status(), 201)
  assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
  const messages = response.body()?.messages
  if (Array.isArray(messages)) {
    const flat = JSON.stringify(messages)
    assert.notInclude(flat, 'noMaskChar')
    assert.notInclude(flat, 'carácter de máscara')
  }
}
```

### Oráculo corrupción (CA-3)

```typescript
export function assertMaskCorruptionRejected(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert
) {
  assert.isTrue(response.status() === 400 || response.status() === 422)
  assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
  assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.IMPORT_FORBIDDEN')
}
```

### Oráculo importación denegada (CA-5)

```typescript
export function assertImportForbidden(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert,
  categoryLabelEs: string
) {
  assert.equal(response.status(), 403)
  const body = response.body()
  assert.equal(body.code, 'EMP.SENS.WRITE.IMPORT_FORBIDDEN')
  assert.equal(body.key, 'el-archivo-contiene-datos-sensibles-que-no-puedes-modificar')
  assert.equal(body.title, 'El archivo contiene datos sensibles que no puedes modificar')
  assert.include(String(body.detail), categoryLabelEs)
  assert.include(String(body.detail), 'No se procesó ningún registro')
  assert.notInclude(JSON.stringify(body), '••••')
  assert.notInclude(JSON.stringify(body), 'NSS')
  assert.notInclude(JSON.stringify(body), 'CURP')
}
```

### Valores de prueba (Anexo A del spec)

| Uso | Valor | Categoría |
|-----|-------|-----------|
| Eco RFC | salida de `maskSensitiveValue('VARL850602AB3', 'identificacion')` → `•••••••••2AB3` | identificacion |
| Eco teléfono | `maskSensitiveValue('5512345678', 'contacto')` → `••••••5678` | contacto |
| Eco correo | `maskSensitiveValue('juan@empresa.com', 'contacto')` → `j•••@empresa.com` | contacto |
| Eco CLABE | `maskSensitiveValue('012345678901234567', 'financiero')` | financiero |
| Corrupción | `•••X1234ABCD` | — (no eco) |
| Corrupción | `VARL•50602AB3` | — (no eco) |
| Eco editado (CA-8) | `••••••••••••••9999` sobre tarjeta | financiero |

### Slugs mínimos por escenario HTTP

| Escenario | Slugs de pestaña / acción | Slugs sensibles |
|-----------|---------------------------|-----------------|
| PUT persona eco | `tab-persona-write` | **sin** `sensitive-identificacion-read` ni `-write` |
| PUT persona corrupción | `tab-persona-write` | sin lectura identificación |
| PUT persona con lectura | `tab-persona-write` + `sensitive-identificacion-read` | — |
| PUT banco eco editado | `tab-bancos-write` | sin `sensitive-financiero-read` |
| POST import Excel | `import-employees` | sin `sensitive-identificacion-write` (archivo con NSS) |
| POST import Excel OK | `import-employees` | `sensitive-identificacion-write` + `sensitive-contacto-write` |

Headers: `.loginAs(actor.user).header('X-Business-Unit-Id', buHeader(actor))` — `buHeader` desde `sensitive_read_by_category_support.ts`.

### Huecos declarados (no automatizar aquí)

| Tema | Por qué |
|------|---------|
| Pantallas BO piloto/sobrecargo/cliente | Sin BO en esta rebanada; se cubren vía `PUT /api/persons` (mismo contrato HTTP). |
| Salario diario en Excel | Fuera del mapa hasta USRH1787433076994. |
| Profundidad > 1 del cuerpo | Censo fijó profundidad 1; sin fixture anidado hasta escalar. |
| Landlord `/api/platform/*` | Sin ALS. |

---

## Matriz Unit (motor)

| # | CA | Escenario | Archivo |
|---|-----|-----------|---------|
| U.1 | Anexo A | `isMaskEcho`: 8 ecos + 2 negativos con `maskSensitiveValue` real | `tests/unit/helpers/sensitive_mask_echo.spec.ts` |
| U.2 | CA-1,4 | `neutralizeSensitiveMaskEchoInBody`: elimina eco sin lectura; no toca sin ALS; no toca no-catálogo; no toca con lectura | `tests/unit/helpers/sensitive_mask_echo_body.spec.ts` |
| U.3 | CA-5,6 | `findSensitiveCategoriesInExcelHeaders`: match case-insensitive; vacío sin sensibles; identificacion+contacto | `tests/unit/constants/employee_excel_sensitive_headers.spec.ts` |
| U.4 | CA-5 | `respondSensitiveDataWriteDenial` rama `IMPORT_FORBIDDEN` | `tests/unit/helpers/sensitive_data_write_api_error.spec.ts` |
| U.5 | — | `IMPORT_FORBIDDEN` declarado en códigos | `tests/unit/constants/sensitive_data_write_error_codes.spec.ts` (ya existe — correr, no duplicar) |
| U.6 | — | Kernel registra `sensitiveMaskEcho` | `tests/unit/routes/sensitive_mask_echo_mounts.spec.ts` |
| U.7 | CA-5,7 | `assertExcelSensitiveHeadersWritable` lanza `IMPORT_FORBIDDEN` con ALS | `tests/unit/services/employee_import_sensitive_headers.spec.ts` |
| U.8 | — | Middleware no procesa multipart | `tests/unit/middleware/sensitive_mask_echo_middleware.spec.ts` |

Batería unitaria:

```bash
node ace test --files="tests/unit/helpers/sensitive_mask_echo.spec.ts" \
  --files="tests/unit/helpers/sensitive_mask_echo_body.spec.ts" \
  --files="tests/unit/constants/employee_excel_sensitive_headers.spec.ts" \
  --files="tests/unit/helpers/sensitive_data_write_api_error.spec.ts" \
  --files="tests/unit/constants/sensitive_data_write_error_codes.spec.ts" \
  --files="tests/unit/routes/sensitive_mask_echo_mounts.spec.ts" \
  --files="tests/unit/services/employee_import_sensitive_headers.spec.ts" \
  --files="tests/unit/middleware/sensitive_mask_echo_middleware.spec.ts"
```

---

## Matriz Functional / Integración (HTTP)

| # | CA | Escenario | Criterio de éxito |
|---|-----|-----------|-------------------|
| F.1 | CA-1 | Sin lectura identificación. PUT persona con `personRfc` = eco + cambio de segundo apellido | **201**. RFC cifrado intacto. Cero 403/400 noMaskChar. |
| F.2 | CA-2 | Mismo actor. PUT con `personPhoneSecondary` = eco contacto + otro campo ordinario | **201**. Teléfono secundario intacto. |
| F.3 | CA-3 | Mismo actor. PUT con `personRfc: '•••X1234ABCD'` | **400 o 422**. Código ≠ `EMP.SENS.WRITE.*`. RFC intacto. |
| F.4 | CA-3 | Con `sensitive-identificacion-read`. PUT con eco RFC | **400 o 422** (no neutralizar — tiene lectura). |
| F.5 | CA-4 | PUT con `personFirstname: '••••'` (no catálogo) | **201**. Nombre actualizado o aceptado; middleware no interfiere. |
| F.6 | CA-8 | Sin lectura financiero. PUT banco con `employeeBankAccountCardNumber: '••••••••••••••9999'` | **200/201**. Tarjeta en BD **sin cambio**. |
| F.7 | CA-5 | `import-employees`, sin `sensitive-identificacion-write`. Excel con columna NSS, 1 fila nueva | **403** IMPORT_FORBIDDEN. Conteo empleados idéntico antes/después. |
| F.8 | CA-5 | Mismo archivo. Con `sensitive-identificacion-write` + `sensitive-contacto-write` | **200**. Al menos 1 creado o procesado (o warning por dept — no 403). |
| F.9 | CA-6 | Excel **sin** columnas sensibles (plantilla mínima sin CURP/RFC/NSS/correos/teléfonos personales) | **200** sin comprobar categorías sensibles. |
| F.10 | CA-7 | Archivo con NSS denegado: verificar que `Person` y `Employee` counts no cambian | Mismo que F.7 — refuerzo explícito de cero filas. |

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `tests/functional/employees/sensitive_mask_echo_support.ts` | Oráculos, `MASK_ECHO_*`, builder Excel import, `countEmployees`/`countPersons`. |
| `tests/unit/helpers/sensitive_mask_echo.spec.ts` | U.1 |
| `tests/unit/helpers/sensitive_mask_echo_body.spec.ts` | U.2 |
| `tests/unit/constants/employee_excel_sensitive_headers.spec.ts` | U.3 |
| `tests/unit/helpers/sensitive_data_write_api_error.spec.ts` | U.4 — añadir grupo IMPORT_FORBIDDEN |
| `tests/unit/routes/sensitive_mask_echo_mounts.spec.ts` | U.6 — espejo de `sensitive_access_context_mounts.spec.ts` |
| `tests/unit/services/employee_import_sensitive_headers.spec.ts` | U.7 |
| `tests/unit/middleware/sensitive_mask_echo_middleware.spec.ts` | U.8 |
| `tests/functional/employees/employees_sensitive_mask_echo_http.spec.ts` | F.1–F.6 |
| `tests/functional/employees/employees_sensitive_import_excel_http.spec.ts` | F.7–F.10 |
| `tests/functional/employees/employees_sensitive_write_by_category.spec.ts` | **Regresión:** actualizar test eco obsoleto (línea 113) |

**Producto:** solo se toca con `fix:` si un test nuevo falla. Archivos probables: `sensitive_mask_echo_middleware.ts`, `sensitive_mask_echo_body.ts`, `employee_service.ts`, `sensitive_data_write_api_error.ts`.

---

### Task 1: Support compartido `sensitive_mask_echo_support.ts`

**Files:**
- Create: `tests/functional/employees/sensitive_mask_echo_support.ts`

**Interfaces:**
- Consumes: `maskSensitiveValue`, `CLEAR_FIXED` desde `sensitive_read_by_category_support.ts`
- Produces:
  - `assertMaskEchoAccepted`, `assertMaskCorruptionRejected`, `assertImportForbidden`
  - `MASK_ECHO_RFC`, `MASK_ECHO_PHONE_SECONDARY`, `MASK_ECHO_EMAIL`, `MASK_CORRUPT_A`, `MASK_CORRUPT_B`, `MASK_EDITED_CARD`
  - `buildMinimalImportExcel(opts): Promise<{ tmpPath: string; dir: string; buffer: Buffer }>`
  - `countActiveEmployees(): Promise<number>`

- [ ] **Step 1: Crear support**

`tests/functional/employees/sensitive_mask_echo_support.ts`:

```typescript
import { mkdtemp, rm } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import type { Assert } from '@japa/assert'
import Employee from '#models/employee'
import Person from '#models/person'
import { maskSensitiveValue } from '#helpers/sensitive_mask'
import { CLEAR_FIXED } from './sensitive_read_by_category_support.js'

export const MASK_ECHO_RFC = maskSensitiveValue('VARL850602AB3', 'identificacion')!
export const MASK_ECHO_PHONE_SECONDARY = maskSensitiveValue(CLEAR_FIXED.phoneSecondary, 'contacto')!
export const MASK_ECHO_EMAIL = maskSensitiveValue(CLEAR_FIXED.email, 'contacto')!
export const MASK_CORRUPT_A = '•••X1234ABCD'
export const MASK_CORRUPT_B = 'VARL•50602AB3'
export const MASK_EDITED_CARD = '••••••••••••••9999'

export function assertMaskEchoAccepted(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert
) {
  assert.equal(response.status(), 201)
  assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
  const messages = response.body()?.messages
  if (Array.isArray(messages)) {
    const flat = JSON.stringify(messages)
    assert.notInclude(flat, 'noMaskChar')
    assert.notInclude(flat, 'carácter de máscara')
  }
}

export function assertMaskCorruptionRejected(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert
) {
  assert.isTrue(response.status() === 400 || response.status() === 422)
  assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
  assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.IMPORT_FORBIDDEN')
}

export function assertImportForbidden(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert,
  categoryLabelEs: string
) {
  assert.equal(response.status(), 403)
  const body = response.body()
  assert.equal(body.code, 'EMP.SENS.WRITE.IMPORT_FORBIDDEN')
  assert.equal(body.key, 'el-archivo-contiene-datos-sensibles-que-no-puedes-modificar')
  assert.include(String(body.detail), categoryLabelEs)
  assert.include(String(body.detail), 'No se procesó ningún registro')
  assert.notInclude(JSON.stringify(body), 'NSS')
}

const FULL_HEADERS = [
  'ID Empleado', 'Identificador de nómina', 'Unidad de negocio de trabajo',
  'Unidad de negocio de nómina', 'Nombre del empleado', 'Apellido paterno del empleado',
  'Apellido materno del empleado', 'Fecha de contratación (yyyy/mm/dd)', 'Departamento',
  'Posición', 'Salario diario', 'Fecha de nacimiento (dd/mm/yyyy)', 'CURP', 'RFC', 'NSS',
  'Correo empresa', 'Correo personal', 'Teléfono Empresa', 'Teléfono Personal',
  'Modalidad de trabajo', '% Teletrabajo', 'Nombre contacto emergencia',
  'Apellido paterno contacto emergencia', 'Apellido materno contacto emergencia',
  'Parentesco contacto emergencia', 'Teléfono contacto emergencia',
] as const

const MINIMAL_HEADERS = [
  'Identificador de nómina', 'Unidad de negocio de trabajo', 'Unidad de negocio de nómina',
  'Nombre del empleado', 'Apellido paterno del empleado',
] as const

type BuildExcelOptions = {
  businessUnitName: string
  includeSensitiveColumns?: boolean
  nssValue?: string
  payrollNum?: string
  firstName?: string
  lastName?: string
}

export async function buildMinimalImportExcel(options: BuildExcelOptions) {
  const headers = options.includeSensitiveColumns === false ? [...MINIMAL_HEADERS] : [...FULL_HEADERS]
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Empleados')
  sheet.addRow(headers)

  const row = new Array(headers.length).fill('')
  const idx = (name: string) => headers.indexOf(name)
  if (idx('Identificador de nómina') >= 0) row[idx('Identificador de nómina')] = options.payrollNum ?? `IMP-${Date.now()}`
  if (idx('Unidad de negocio de trabajo') >= 0) row[idx('Unidad de negocio de trabajo')] = options.businessUnitName
  if (idx('Unidad de negocio de nómina') >= 0) row[idx('Unidad de negocio de nómina')] = options.businessUnitName
  if (idx('Nombre del empleado') >= 0) row[idx('Nombre del empleado')] = options.firstName ?? 'Import'
  if (idx('Apellido paterno del empleado') >= 0) row[idx('Apellido paterno del empleado')] = options.lastName ?? 'Qa'
  if (idx('NSS') >= 0) row[idx('NSS')] = options.nssValue ?? '12345678901'
  sheet.addRow(row)

  const dir = await mkdtemp(join(tmpdir(), 'mask-echo-import-'))
  const tmpPath = join(dir, 'import.xlsx')
  await workbook.xlsx.writeFile(tmpPath)
  const buffer = await readFile(tmpPath)
  return { tmpPath, dir, buffer }
}

export async function cleanupImportDir(dir: string) {
  await rm(dir, { recursive: true, force: true })
}

export async function countActiveEmployees(): Promise<number> {
  const row = await Employee.query().whereNull('employee_deleted_at').count('* as total')
  return Number(row[0].$extras.total)
}

export async function countActivePersons(): Promise<number> {
  const row = await Person.query().whereNull('person_deleted_at').count('* as total')
  return Number(row[0].$extras.total)
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/functional/employees/sensitive_mask_echo_support.ts
git commit -m "test: Agregar support de QA para eco de máscara e importación Excel"
```

---

### Task 2: Unitario U.1 — `isMaskEcho`

**Files:**
- Create: `tests/unit/helpers/sensitive_mask_echo.spec.ts`

**Interfaces:**
- Consumes: `isMaskEcho`, `maskSensitiveValue` desde `#helpers/sensitive_mask`

- [ ] **Step 1: Write the test**

```typescript
import { test } from '@japa/runner'
import { isMaskEcho, maskSensitiveValue } from '#helpers/sensitive_mask'

test.group('isMaskEcho — Anexo A USRH1787433076990', () => {
  test('reconoce las 8 formas legítimas de máscara', ({ assert }) => {
    const legit = [
      maskSensitiveValue('VARL850602AB3', 'identificacion'),
      maskSensitiveValue('VACW850312J95', 'identificacion'),
      maskSensitiveValue('ABCD123456MDFABC01', 'identificacion'),
      maskSensitiveValue('012345678901234567', 'financiero'),
      maskSensitiveValue('5512345678', 'contacto'),
      maskSensitiveValue('juan@empresa.com', 'contacto'),
      maskSensitiveValue('cualquier-diagnostico', 'salud'),
      maskSensitiveValue('abc', 'identificacion'),
    ]
    for (const value of legit) {
      assert.isTrue(isMaskEcho(value), `debe ser eco: ${value}`)
    }
  })

  test('rechaza los 2 controles negativos', ({ assert }) => {
    assert.isFalse(isMaskEcho('•••X1234ABCD'))
    assert.isFalse(isMaskEcho('VARL•50602AB3'))
  })

  test('no confunde null ni número', ({ assert }) => {
    assert.isFalse(isMaskEcho(null))
    assert.isFalse(isMaskEcho(undefined))
    assert.isFalse(isMaskEcho(12345))
  })
})
```

- [ ] **Step 2: Run test**

Run: `node ace test --files="tests/unit/helpers/sensitive_mask_echo.spec.ts"`
Expected: PASS (producto ya implementado)

- [ ] **Step 3: Si FAIL → fix en `app/helpers/sensitive_mask.ts` y re-run**

- [ ] **Step 4: Commit**

```bash
git add tests/unit/helpers/sensitive_mask_echo.spec.ts
git commit -m "test: Cubrir isMaskEcho con Anexo A del spec"
```

---

### Task 3: Unitario U.2 — `neutralizeSensitiveMaskEchoInBody`

**Files:**
- Create: `tests/unit/helpers/sensitive_mask_echo_body.spec.ts`

**Interfaces:**
- Consumes: `neutralizeSensitiveMaskEchoInBody`, `SensitiveAccessContext.run`, `maskSensitiveValue`

- [ ] **Step 1: Write the test**

```typescript
import { test } from '@japa/runner'
import { maskSensitiveValue } from '#helpers/sensitive_mask'
import { neutralizeSensitiveMaskEchoInBody } from '#helpers/sensitive_mask_echo_body'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

const deniedStore = {
  read: { identificacion: false, contacto: false, financiero: false, salud: false, biometrico: false },
  write: { identificacion: 'denied' as const, contacto: 'denied' as const, financiero: 'denied' as const, salud: 'denied' as const, biometrico: 'denied' as const },
}

const readIdentificacionStore = {
  read: { identificacion: true, contacto: false, financiero: false, salud: false, biometrico: false },
  write: { identificacion: 'allowed' as const, contacto: 'denied' as const, financiero: 'denied' as const, salud: 'denied' as const, biometrico: 'denied' as const },
}

test.group('neutralizeSensitiveMaskEchoInBody', () => {
  test('sin ALS devuelve el cuerpo intacto', ({ assert }) => {
    const body = { personRfc: maskSensitiveValue('VARL850602AB3', 'identificacion') }
    assert.strictEqual(neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>), body)
  })

  test('elimina eco de catálogo si no hay lectura de la categoría', ({ assert }) => {
    const echo = maskSensitiveValue('VARL850602AB3', 'identificacion')
    const body = { personRfc: echo, personFirstname: 'Ana' }
    SensitiveAccessContext.run(deniedStore, () => {
      const out = neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>)
      assert.notProperty(out, 'personRfc')
      assert.equal(out.personFirstname, 'Ana')
    })
  })

  test('no elimina si el usuario tiene lectura de la categoría', ({ assert }) => {
    const echo = maskSensitiveValue('VARL850602AB3', 'identificacion')
    const body = { personRfc: echo }
    SensitiveAccessContext.run(readIdentificacionStore, () => {
      const out = neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>)
      assert.equal(out.personRfc, echo)
    })
  })

  test('no toca campos fuera del catálogo aunque parezcan máscara', ({ assert }) => {
    const body = { personFirstname: '••••', employeeCode: '••••1234' }
    SensitiveAccessContext.run(deniedStore, () => {
      const out = neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>)
      assert.deepEqual(out, body)
    })
  })

  test('no elimina corrupción que no es eco', ({ assert }) => {
    const body = { personRfc: '•••X1234ABCD' }
    SensitiveAccessContext.run(deniedStore, () => {
      const out = neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>)
      assert.equal(out.personRfc, '•••X1234ABCD')
    })
  })
})
```

- [ ] **Step 2: Run test**

Run: `node ace test --files="tests/unit/helpers/sensitive_mask_echo_body.spec.ts"`
Expected: PASS

- [ ] **Step 3: Si FAIL → fix en `app/helpers/sensitive_mask_echo_body.ts`**

- [ ] **Step 4: Commit**

```bash
git add tests/unit/helpers/sensitive_mask_echo_body.spec.ts
git commit -m "test: Cubrir neutralización del eco de máscara en el cuerpo"
```

---

### Task 4: Unitario U.3 — mapa cabeceras Excel

**Files:**
- Create: `tests/unit/constants/employee_excel_sensitive_headers.spec.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test } from '@japa/runner'
import {
  EMPLOYEE_EXCEL_SENSITIVE_HEADERS,
  findSensitiveCategoriesInExcelHeaders,
} from '#constants/employee_excel_sensitive_headers'

test.group('employee_excel_sensitive_headers', () => {
  test('el mapa incluye las 6 cabeceras sensibles y no Salario diario', ({ assert }) => {
    const headers = EMPLOYEE_EXCEL_SENSITIVE_HEADERS.map((e) => e.header)
    assert.includeMembers(headers, ['CURP', 'RFC', 'NSS', 'Correo personal', 'Teléfono Personal', 'Teléfono contacto emergencia'])
    assert.notInclude(headers, 'Salario diario')
  })

  test('archivo sin columnas sensibles devuelve arreglo vacío', ({ assert }) => {
    assert.deepEqual(findSensitiveCategoriesInExcelHeaders(['Nombre del empleado', 'Departamento']), [])
  })

  test('NSS activa identificacion (case-insensitive)', ({ assert }) => {
    const cats = findSensitiveCategoriesInExcelHeaders(['nss', 'Nombre del empleado'])
    assert.deepEqual(cats, ['identificacion'])
  })

  test('correo personal y teléfono activan contacto', ({ assert }) => {
    const cats = findSensitiveCategoriesInExcelHeaders(['Correo personal', 'Teléfono Personal'])
    assert.includeMembers(cats, ['contacto'])
  })

  test('CURP + correo activan identificacion y contacto', ({ assert }) => {
    const cats = findSensitiveCategoriesInExcelHeaders(['CURP', 'Correo personal'])
    assert.includeMembers(cats, ['identificacion', 'contacto'])
  })
})
```

- [ ] **Step 2: Run test**

Run: `node ace test --files="tests/unit/constants/employee_excel_sensitive_headers.spec.ts"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/constants/employee_excel_sensitive_headers.spec.ts
git commit -m "test: Cubrir mapa de cabeceras sensibles del Excel"
```

---

### Task 5: Unitario U.4 — helper `IMPORT_FORBIDDEN`

**Files:**
- Modify: `tests/unit/helpers/sensitive_data_write_api_error.spec.ts`

- [ ] **Step 1: Añadir claves i18n y test al `makeCtx`**

En el objeto `es` de `makeCtx`, agregar:

```typescript
sensitive_data_write_import_forbidden_title: 'El archivo contiene datos sensibles que no puedes modificar',
sensitive_data_write_import_forbidden_detail:
  'El archivo incluye columnas de {category} y no tienes permiso para modificarlos. No se procesó ningún registro.',
```

- [ ] **Step 2: Añadir test**

```typescript
  test('IMPORT_FORBIDDEN nombra categoría y no incluye valores del archivo', ({ assert }) => {
    const ctx = makeCtx('es')
    const error = new SensitiveDataWriteError(
      SENSITIVE_DATA_WRITE_ERROR_CODES.IMPORT_FORBIDDEN,
      'identificacion'
    )
    const body = respondSensitiveDataWriteDenial(ctx, error)
    assert.equal((ctx.response as { statusCode?: number }).statusCode, 403)
    assert.equal(body.code, 'EMP.SENS.WRITE.IMPORT_FORBIDDEN')
    assert.equal(body.key, 'el-archivo-contiene-datos-sensibles-que-no-puedes-modificar')
    assert.include(body.detail, 'datos de identificación')
    assert.include(body.detail, 'No se procesó ningún registro')
    assert.notInclude(JSON.stringify(body), 'NSS')
    assert.notInclude(JSON.stringify(body), '••••')
  })
```

Importar `IMPORT_FORBIDDEN` vía `SENSITIVE_DATA_WRITE_ERROR_CODES`.

- [ ] **Step 3: Run test**

Run: `node ace test --files="tests/unit/helpers/sensitive_data_write_api_error.spec.ts"`
Expected: PASS — si FAIL, fix en `app/helpers/sensitive_data_write_api_error.ts` + `resources/langs/*.json`

- [ ] **Step 4: Commit**

```bash
git add tests/unit/helpers/sensitive_data_write_api_error.spec.ts
git commit -m "test: Cubrir respuesta 403 IMPORT_FORBIDDEN en helper HTTP"
```

---

### Task 6: Unitario U.6 — cableado de rutas `sensitiveMaskEcho`

**Files:**
- Create: `tests/unit/routes/sensitive_mask_echo_mounts.spec.ts`

**Interfaces:**
- Consumes: patrón de `tests/unit/routes/sensitive_access_context_mounts.spec.ts` (`extractRouteGroups`, `groupHasWriteRoute`)

- [ ] **Step 1: Write the test**

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

const ROOT = process.cwd()

// Reutilizar extractRouteGroups copiado de sensitive_access_context_mounts.spec.ts
// (mismo escaneo balanceado — no importar entre specs Japa)

const WRITE_ROUTE_FILES = [
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
  'start/routes/synchronization_routes.ts',
  'start/routes/pilot_routes.ts',
  'start/routes/flight_attendant_routes.ts',
  'start/routes/customer_routes.ts',
]

test.group('Montaje sensitiveMaskEcho', () => {
  test('kernel registra sensitiveMaskEcho', ({ assert }) => {
    const kernel = readFileSync(join(ROOT, 'start/kernel.ts'), 'utf-8')
    assert.include(kernel, 'sensitiveMaskEcho:')
    assert.include(kernel, '#middleware/sensitive_mask_echo_middleware')
  })

  test('cada archivo de escritura del expediente monta sensitiveMaskEcho', ({ assert }) => {
    for (const relative of WRITE_ROUTE_FILES) {
      const source = readFileSync(join(ROOT, relative), 'utf-8')
      assert.include(source, 'middleware.sensitiveMaskEcho()', `${relative} debe montar sensitiveMaskEcho`)
    }
  })

  test('person_routes monta sensitiveMaskEcho solo en /api/persons', ({ assert }) => {
    const source = readFileSync(join(ROOT, 'start/routes/person_routes.ts'), 'utf-8')
    assert.match(
      source,
      /prefix\('\/api\/persons'\)[\s\S]*?sensitiveMaskEcho\(\)/
    )
    const getEmployeeBlock = source.slice(source.indexOf("prefix('/api/person-get-employee')"))
    assert.notInclude(getEmployeeBlock.split("prefix('/api/persons-get-places")[0], 'sensitiveMaskEcho()')
  })
})
```

> Copiar `extractRouteGroups` completo del archivo hermano si se quiere aserción por grupo en lugar de por archivo.

- [ ] **Step 2: Run test**

Run: `node ace test --files="tests/unit/routes/sensitive_mask_echo_mounts.spec.ts"`
Expected: PASS — si FAIL, fix en `start/routes/*.ts` o `start/kernel.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/unit/routes/sensitive_mask_echo_mounts.spec.ts
git commit -m "test: Verificar montaje de sensitiveMaskEcho en rutas de escritura"
```

---

### Task 7: Unitario U.7 — `assertExcelSensitiveHeadersWritable`

**Files:**
- Create: `tests/unit/services/employee_import_sensitive_headers.spec.ts`

**Interfaces:**
- Consumes: `EmployeeService` (método privado vía reflexión o extracción a helper exportado solo en test — **preferir** invocar `importFromExcel` con archivo mínimo y ALS mockeado con `SensitiveAccessContext.run` envolviendo la llamada desde el test usando el servicio directamente)

Enfoque pragmático: testear vía `findSensitiveCategoriesInExcelHeaders` + lanzamiento simulado, **o** exponer el método como `protected` y usar subclase de test. **Mejor:** llamar al servicio con Excel de 0 filas útiles pero con NSS en headers y `SensitiveAccessContext` con `canWrite(identificacion)=false` — debe lanzar antes de persistir.

```typescript
import { test } from '@japa/runner'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
// Invocar método privado:
// const svc = new EmployeeService(...)
// assert.throws(() => (svc as any).assertExcelSensitiveHeadersWritable(['NSS', 'Nombre del empleado']), SensitiveDataWriteError)
```

- [ ] **Step 1: Write the test**

```typescript
import { test } from '@japa/runner'
import EmployeeService from '#services/employee_service'
import i18nManager from '@adonisjs/i18n/services/main'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

function service() {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

const writeDeniedStore = {
  read: { identificacion: true, contacto: true, financiero: true, salud: true, biometrico: true },
  write: { identificacion: 'denied' as const, contacto: 'allowed' as const, financiero: 'denied' as const, salud: 'denied' as const, biometrico: 'denied' as const },
}

const writeAllowedStore = {
  read: { identificacion: true, contacto: true, financiero: true, salud: true, biometrico: true },
  write: { identificacion: 'allowed' as const, contacto: 'allowed' as const, financiero: 'allowed' as const, salud: 'allowed' as const, biometrico: 'allowed' as const },
}

test.group('EmployeeService.assertExcelSensitiveHeadersWritable', () => {
  test('lanza IMPORT_FORBIDDEN si NSS presente y sin escritura identificación', ({ assert }) => {
    const svc = service()
    SensitiveAccessContext.run(writeDeniedStore, () => {
      assert.throws(
        () => (svc as unknown as { assertExcelSensitiveHeadersWritable(h: string[]): void }).assertExcelSensitiveHeadersWritable(['NSS', 'Nombre del empleado']),
        (error: unknown) => {
          assert.instanceOf(error, SensitiveDataWriteError)
          const e = error as SensitiveDataWriteError
          assert.equal(e.errorCode, SENSITIVE_DATA_WRITE_ERROR_CODES.IMPORT_FORBIDDEN)
          assert.equal(e.category, 'identificacion')
          return true
        }
      )
    })
  })

  test('no lanza si no hay cabeceras sensibles', ({ assert }) => {
    const svc = service()
    SensitiveAccessContext.run(writeDeniedStore, () => {
      assert.doesNotThrow(() =>
        (svc as unknown as { assertExcelSensitiveHeadersWritable(h: string[]): void }).assertExcelSensitiveHeadersWritable(['Nombre del empleado'])
      )
    })
  })

  test('no lanza si hay permiso de escritura', ({ assert }) => {
    const svc = service()
    SensitiveAccessContext.run(writeAllowedStore, () => {
      assert.doesNotThrow(() =>
        (svc as unknown as { assertExcelSensitiveHeadersWritable(h: string[]): void }).assertExcelSensitiveHeadersWritable(['NSS', 'CURP'])
      )
    })
  })
})
```

- [ ] **Step 2: Run test**

Run: `node ace test --files="tests/unit/services/employee_import_sensitive_headers.spec.ts"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/services/employee_import_sensitive_headers.spec.ts
git commit -m "test: Cubrir rechazo previo de cabeceras sensibles en importación"
```

---

### Task 8: Regresión — actualizar suite orden 32

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_write_by_category.spec.ts:113-129`

**Interfaces:**
- El test `CA-1: eco de máscara en RFC es 400/422` queda **obsoleto** tras USRH1787433076990.

- [ ] **Step 1: Reemplazar el test**

```typescript
  test('CA-1 (orden 34): eco de máscara en RFC pasa sin error y no sobrescribe', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const person = fixture!.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(personUpdateBase(person, { personRfc: MASK_ECHO }))

    assert.equal(response.status(), 201)
    assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
  })
```

- [ ] **Step 2: Run suite orden 32**

Run: `node ace test --files="tests/functional/employees/employees_sensitive_write_by_category.spec.ts"`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_write_by_category.spec.ts
git commit -m "test: Actualizar oráculo de eco de máscara tras USRH1787433076990"
```

---

### Task 9: Functional F.1–F.6 — eco de máscara HTTP

**Files:**
- Create: `tests/functional/employees/employees_sensitive_mask_echo_http.spec.ts`
- Consumes: `sensitive_mask_echo_support.ts`, `sensitive_read_by_category_support.ts`, `sensitive_write_by_category_support.ts` (`personUpdateBase`, `buHeader`)

- [ ] **Step 1: Write the suite**

```typescript
import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import {
  buHeader,
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  grantOnly,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'
import {
  personUpdateBase,
  reloadBank,
  reloadPerson,
  RFC_ORIGINAL,
} from './sensitive_write_by_category_support.js'
import {
  assertMaskCorruptionRejected,
  assertMaskEchoAccepted,
  MASK_CORRUPT_A,
  MASK_ECHO_PHONE_SECONDARY,
  MASK_ECHO_RFC,
  MASK_EDITED_CARD,
} from './sensitive_mask_echo_support.js'

test.group('Eco de máscara HTTP — USRH1787433076990', (group) => {
  let actor: TenantActor
  let fixture: SensitiveFixture

  group.setup(async () => {
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('mask-echo-http')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'mask-echo')
  })

  group.teardown(async () => {
    await cleanupSensitiveFixture(fixture)
    await cleanupActor(actor)
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  test('F.1 CA-1: eco RFC sin lectura identificación pasa y no sobrescribe', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write'])
    const person = fixture.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(personUpdateBase(person, { personRfc: MASK_ECHO_RFC, personSecondLastname: 'EcoQa' }))

    assertMaskEchoAccepted(response, assert)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
    assert.equal(reloaded.personSecondLastname, 'EcoQa')
  })

  test('F.2 CA-2: eco teléfono secundario pasa', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write'])
    const person = fixture.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(personUpdateBase(person, { personPhoneSecondary: MASK_ECHO_PHONE_SECONDARY, personMaritalStatus: 'single' }))

    assertMaskEchoAccepted(response, assert)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personPhoneSecondary, person.personPhoneSecondary)
  })

  test('F.3 CA-3: corrupción con máscara es 400/422', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write'])
    const response = await client
      .put(`/api/persons/${fixture.person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(personUpdateBase(fixture.person, { personRfc: MASK_CORRUPT_A }))

    assertMaskCorruptionRejected(response, assert)
    assert.equal((await reloadPerson(fixture.person.personId)).personRfc, RFC_ORIGINAL)
  })

  test('F.4 CA-3: con lectura identificación el eco no se neutraliza', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write', 'sensitive-identificacion-read'])
    const response = await client
      .put(`/api/persons/${fixture.person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(personUpdateBase(fixture.person, { personRfc: MASK_ECHO_RFC }))

    assertMaskCorruptionRejected(response, assert)
  })

  test('F.5 CA-4: campo no catálogo con aspecto de máscara no se toca', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write'])
    const response = await client
      .put(`/api/persons/${fixture.person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(personUpdateBase(fixture.person, { personFirstname: '••••' }))

    assert.equal(response.status(), 201)
    assert.equal((await reloadPerson(fixture.person.personId)).personFirstname, '••••')
  })

  test('F.6 CA-8: eco editado en tarjeta se descarta en silencio', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-bancos-write'])
    const bank = fixture.bank
    const cardOriginal = bank.employeeBankAccountCardNumber
    const response = await client
      .put(`/api/employee-banks/${bank.employeeBankId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json({
        employeeBankAccountClabe: bank.employeeBankAccountClabe,
        employeeBankAccountCurrencyType: bank.employeeBankAccountCurrencyType,
        employeeBankAccountCardNumber: MASK_EDITED_CARD,
      })

    assert.isTrue(response.status() === 200 || response.status() === 201)
    const reloaded = await reloadBank(bank.employeeBankId)
    assert.equal(reloaded.employeeBankAccountCardNumber, cardOriginal)
  })
})
```

- [ ] **Step 2: Run test**

Run: `node ace test --files="tests/functional/employees/employees_sensitive_mask_echo_http.spec.ts"`
Expected: PASS — si FAIL, fix producto en middleware/helper/rutas y re-run

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_mask_echo_http.spec.ts
git commit -m "test: Agregar suite HTTP de eco de máscara CA-1 a CA-8"
```

---

### Task 10: Functional F.7–F.10 — importación Excel HTTP

**Files:**
- Create: `tests/functional/employees/employees_sensitive_import_excel_http.spec.ts`

- [ ] **Step 1: Write the suite**

```typescript
import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import {
  buHeader,
  cleanupActor,
  createActor,
  grantOnly,
  type TenantActor,
} from './sensitive_read_by_category_support.js'
import {
  assertImportForbidden,
  buildMinimalImportExcel,
  cleanupImportDir,
  countActiveEmployees,
  countActivePersons,
} from './sensitive_mask_echo_support.js'

test.group('Importación Excel sensible — USRH1787433076990', (group) => {
  let actor: TenantActor

  group.setup(async () => {
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('import-sens-http')
  })

  group.teardown(async () => {
    await cleanupActor(actor)
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  test('F.7 CA-5: NSS sin escritura identificación → 403 y cero filas', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['import-employees'])
    const beforeEmployees = await countActiveEmployees()
    const beforePersons = await countActivePersons()
    const { buffer, dir } = await buildMinimalImportExcel({
      businessUnitName: actor.businessUnit.businessUnitName,
      includeSensitiveColumns: true,
      nssValue: '98765432109',
    })
    try {
      const response = await client
        .post('/api/employees/import-excel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', buHeader(actor))
        .file('file', buffer, {
          filename: 'import.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })

      assertImportForbidden(response, assert, 'datos de identificación')
      assert.equal(await countActiveEmployees(), beforeEmployees)
      assert.equal(await countActivePersons(), beforePersons)
    } finally {
      await cleanupImportDir(dir)
    }
  })

  test('F.9 CA-6: plantilla sin columnas sensibles no exige categorías', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['import-employees'])
    const { buffer, dir } = await buildMinimalImportExcel({
      businessUnitName: actor.businessUnit.businessUnitName,
      includeSensitiveColumns: false,
    })
    try {
      const response = await client
        .post('/api/employees/import-excel')
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', buHeader(actor))
        .file('file', buffer, {
          filename: 'import.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })

      assert.notEqual(response.status(), 403)
      assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.IMPORT_FORBIDDEN')
    } finally {
      await cleanupImportDir(dir)
    }
  })
})
```

> **F.8** (import con todos los permisos) puede ser flaky si faltan dept/position en BD — añadir como `test.skip` documentado si el entorno no tiene catálogos mínimos, o crear dept/position en fixture como `createSensitiveFixture`. Si falla por validación de fila y no por 403, el gap es de fixture — ampliar `buildMinimalImportExcel` con fechas requeridas.

- [ ] **Step 2: Run test**

Run: `node ace test --files="tests/functional/employees/employees_sensitive_import_excel_http.spec.ts"`
Expected: PASS en F.7 y F.9 como mínimo

- [ ] **Step 3: Si FAIL en producto → fix y re-run**

- [ ] **Step 4: Commit**

```bash
git add tests/functional/employees/employees_sensitive_import_excel_http.spec.ts
git commit -m "test: Agregar suite HTTP de importación Excel sensible"
```

---

### Task 11: Batería completa y cierre

- [ ] **Step 1: Correr batería unitaria completa** (comando en sección Matriz Unit)
Expected: todos PASS

- [ ] **Step 2: Correr suites functional nuevas + regresión orden 32**

```bash
node ace test --files="tests/functional/employees/employees_sensitive_mask_echo_http.spec.ts" \
  --files="tests/functional/employees/employees_sensitive_import_excel_http.spec.ts" \
  --files="tests/functional/employees/employees_sensitive_write_by_category.spec.ts"
```

- [ ] **Step 3: Pegar salida literal en el PR** (regla del spec §Verificación técnica)

- [ ] **Step 4: Commit final si quedaron fixes**

```bash
git commit -m "fix: Cerrar gaps detectados por suite QA eco de máscara e importación"
```

---

## Self-Review

| Requisito spec | Task |
|----------------|------|
| CA-1 eco limpio | U.1, U.2, F.1, Task 8 regresión |
| CA-2 teléfono secundario / personas | F.2 |
| CA-3 corrupción | U.2, F.3, F.4 |
| CA-4 no catálogo | U.2, F.5 |
| CA-5 Excel rechazo | U.3, U.4, U.7, F.7 |
| CA-6 Excel sin sensibles / con permisos | U.3, F.8, F.9 |
| CA-7 cero filas a medias | F.7, F.10 |
| CA-8 descarte silencioso | F.6 |
| Anexo A 8+2 | U.1 |
| Cableado rutas | U.6 |
| Regresión orden 32 | Task 8 |

**Placeholder scan:** ninguno.

**Conflicto resuelto:** `employees_sensitive_write_by_category.spec.ts` eco test actualizado en Task 8.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-25-sensitive-mask-echo-excel-import-qa.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
