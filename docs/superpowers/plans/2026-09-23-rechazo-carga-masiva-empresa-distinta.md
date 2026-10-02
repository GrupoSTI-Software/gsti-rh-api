# Rechazo de carga masiva por empresa distinta — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `importFromExcel` rechace completo (sin crear ni modificar nada) cualquier archivo con filas que declaren una empresa distinta de la activa en cualquiera de las dos columnas, reportando todas las filas ofensoras, y que el fallo al guardar un dato protegido detenga la carga en vez de absorberse.

**Architecture:** Validación previa todo-o-nada en la pasada 1 del importador: se resuelve la empresa activa una sola vez (misma fuente que el cupo), se comparan los ids ya resueltos por `mapBusinessUnit` de ambas columnas contra la activa, y si hay ofensoras se lanza un error tipado `isCompanyMismatchError` antes del cupo y antes de la pasada 2. El controlador lo traduce a 422 con el listado. Regla 5: el `catch` de la pasada 2 re-lanza `SensitiveDataWriteError` (vía predicado puro testeable) en vez de registrarlo como fila fallida.

**Tech Stack:** AdonisJS 6 · Lucid MySQL · ExcelJS · Japa (`node ace test`) · i18n (`resources/langs/es.json`, `en.json`) · BD desechable `sae_pruebas`

**Repo:** `gsti-rh-api` · **Rama:** `feature/USRH1789747321650-rechazo-carga-masiva-empresa-distinta` (verificar con `git branch --show-current` al empezar). **No se abre PR ni se hace push sin petición explícita.**

**HU:** USRH1789747321650 — *Rechazo de carga masiva por empresa distinta* · **Spec técnico:** `spec-USRH1789747321650.md` (versión viva enlazada en la HU; si el spec se corrige, el enlace manda sobre este plan en el literal que difiera). La descripción de la HU en el mensaje original es el qué y el porqué; este plan es el cómo. **Dependencia de bloqueo:** USRH1789698261610 (unicidad de identidad por empresa — CURP acotada por empresa en carga masiva, ya en esta rama).

---

## Global Constraints

Copiadas de la HU (§Reglas de negocio). Cada tarea las hereda.

- **Regla 1.** El archivo es de una sola empresa: la activa al subirlo. Si alguna fila declara otra, no se procesa nada del archivo y se reporta el motivo con las filas que lo causaron.
- **Regla 2.** La regla 1 aplica a las DOS columnas: empresa de trabajo y empresa de nómina. Basta que cualquiera declare otra empresa.
- **Regla 3.** El formato no cambia: mismas columnas, mismo llenado. Quien sube archivos de una sola empresa no percibe diferencia.
- **Regla 4.** Duplicado dentro de la propia empresa: sin cambio — se salta la fila, se reporta como duplicada y sigue el resto.
- **Regla 5.** Fallo al guardar un dato protegido: detiene la carga y se reporta. Hoy se absorbe; deja de pasar inadvertido.
- **Regla 6.** Rechazo = cero escrituras: la información queda como antes de subirlo. La revisión es entera antes de tocar nada.
- **Regla 7.** No sanea, no corrige, no reasigna trabajadores ya cargados.
- **Decisión de alcance (fijada en este plan):** un nombre de empresa que `mapBusinessUnit` no resuelve a ninguna empresa real (`null`) conserva el comportamiento de hoy (fallback silencioso / fila inválida según el caso). Solo un nombre que resuelve a OTRA empresa real dispara el rechazo. Razonamiento: la HU cubre "declara una empresa distinta", no errores de captura; cambiar el fallback rompería archivos de una sola empresa (regla 3).
- **Decisión de alcance (regla 5):** "detiene" = no procesa las filas restantes y responde 403; lo ya creado en filas anteriores queda (igual que ante cualquier error 500 a media carga). No se envuelve la pasada 2 en transacción: sería un cambio mayor fuera de esta historia.
- **Sin migración.** Esta historia no toca esquema ni catálogo: no hace falta `migration:fresh` ni `permissions:check-consistency`.
- **TypeScript estricto, cero `any` nuevo** (el archivo ya usa `any` en firmas existentes; no se agrega). `logger` de Adonis, nunca `console.*`. Código y comentarios en español; identificadores en inglés.
- **Status HTTP fijados:** empresa distinta → **422** (contenido válido sintácticamente pero inaceptable por regla de negocio; cabeceras/filas siguen 400, cupo sigue 409, sensible sigue 403).
- **Tests contra `sae_pruebas`:** `node ace test` fija `NODE_ENV=test` solo. Nunca dos migraciones a la vez (`GET_LOCK` global). Nada se retira a `__TO_DELETE__/` en esta HU. Cada commit lista sus archivos; nunca `git add -A`. No commitear `pnpm-lock.yaml` ni `pnpm-workspace.yaml` si están sucios por causas ajenas.
- **Ubicar por nombre de función, no por número de línea.** Los números son del estado al 2026-09-23 y sirven para orientarse.

---

## Estructura de archivos

| | Archivo | Responsabilidad |
|---|---|---|
| E1 | `app/interfaces/employee_import_result_interface.ts` | Tipo `EmployeeImportCompanyMismatchRow` (`row`, `businessUnit`, `payrollBusinessUnit`) |
| E2 | `app/constants/employee_import_error_codes.ts` | `VAL_COMPANY: 'EMP.IMPORT.VAL_COMPANY'` |
| E3 | `app/helpers/employee_import_api_error.ts` | Rama `isCompanyMismatchError` → 422 + `key` + `code` + `data.offendingRows`; predicado `shouldAbortImportOnRowError` (regla 5) |
| E4 | `resources/langs/es.json`, `resources/langs/en.json` | `employee_import_val_company_title` + `_detail` (ambos idiomas o ninguno) |
| E5 | `app/services/employee_service.ts` | Activa una sola vez; compara las dos columnas resueltas en pasada 1; lanza con TODAS las ofensoras antes del cupo y de la pasada 2; re-lanza sensible en pasada 2 |
| E6 | `app/controllers/employee_controller.ts` | Rama 422 de empresa distinta en `importFromExcel` (catch) |
| E7 | `docs/openapi.yaml` | Documenta el `422` de `POST /api/employees/import-excel` |
| N1 | `tests/unit/helpers/employee_import_company_mismatch.spec.ts` | Resolver 422 + predicado regla 5 (puro, sin BD) |
| N2 | `tests/functional/services/employee_import_company_scope.spec.ts` | Los 6 criterios de la HU con Excel real de dos empresas |
| QA | `docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-qa-api.md` | Playbook manual API (lo recorre una persona) |
| C | `docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-cierre.md` | Resumen de cierre (sin PR) |

**Decisión del plan, revertible:** el rechazo viaja como `Error` tipado con `isCompanyMismatchError` (mismo patrón que `isHeaderValidationError` / `isRowLimitError`), no como clase nueva. Si Wilvardo prefiere clase de dominio, se cambia solo E3/E5/E6 sin tocar los tests funcionales (ellos asertan el 422 y el listado, no el mecanismo).

---

## Preparación (una sola vez)

- [ ] Confirmar rama y árbol (salvo los dos yaml sucios por causas ajenas):

```bash
git branch --show-current && git status --short
```

Expected: `feature/USRH1789747321650-rechazo-carga-masiva-empresa-distinta`, solo `M pnpm-lock.yaml` y `?? pnpm-workspace.yaml`.

- [ ] Confirmar que la rama trae la dependencia (CURP acotada por empresa en carga masiva):

```bash
grep -n "personWithCurpExists(employeeData.curp, businessUnitId)" app/services/employee_service.ts && grep -n "livePersonWithIdentityExists('curp'" app/services/employee_service.ts
```

Expected: ambas líneas existen (vienen de USRH1789698261610). Si faltan, avisar: la dependencia de bloqueo no está y este plan no aplica.

---

### Task 1: Contrato del rechazo — código, textos y resolvedor 422 (reglas 1, 2, 6)

**Files:**
- Modify: `app/constants/employee_import_error_codes.ts` (agregar `VAL_COMPANY`)
- Modify: `app/interfaces/employee_import_result_interface.ts` (agregar tipo de fila ofensora)
- Modify: `app/helpers/employee_import_api_error.ts` (rama 422 + predicado regla 5)
- Modify: `resources/langs/es.json`, `resources/langs/en.json` (2 claves por idioma)
- Test: `tests/unit/helpers/employee_import_company_mismatch.spec.ts` (crear)

**Interfaces:**
- Consumes: patrón existente `resolveEmployeeImportApiError` + `translate()`; `isSensitiveDataWriteError` de `#helpers/sensitive_data_write_api_error`.
- Produces:
  - `EMPLOYEE_IMPORT_ERROR_CODES.VAL_COMPANY = 'EMP.IMPORT.VAL_COMPANY'`
  - `EmployeeImportCompanyMismatchRow = { row: number; businessUnit: string; payrollBusinessUnit: string }`
  - `EmployeeImportValCompanyErrorData = { offendingRows: EmployeeImportCompanyMismatchRow[] }`
  - `resolveEmployeeImportApiError(err con isCompanyMismatchError, 422)` → `{ title, message, detail, status: 422, errorCode: VAL_COMPANY, key: 'empresa-distinta-en-archivo', data: { offendingRows } }`
  - `shouldAbortImportOnRowError(error): boolean` — `true` solo ante `SensitiveDataWriteError`.

- [ ] **Step 1: Agregar el código en `app/constants/employee_import_error_codes.ts`**

Después de la entrada `VAL_ROWS` (ancla: `VAL_ROWS: 'EMP.IMPORT.VAL_ROWS',`), insertar:

```ts
  /** Alguna fila declara una empresa distinta de la activa (trabajo o nómina) */
  VAL_COMPANY: 'EMP.IMPORT.VAL_COMPANY',
```

- [ ] **Step 2: Agregar el tipo en `app/interfaces/employee_import_result_interface.ts`**

Al final del archivo, agregar:

```ts
/**
 * Fila que declara una empresa distinta de la activa (USRH1789747321650,
 * reglas 1 y 2). Lleva los nombres tal como venían en el archivo para que
 * quien lo armó pueda corregirlo sin abrir el Excel original.
 */
export interface EmployeeImportCompanyMismatchRow {
  row: number
  businessUnit: string
  payrollBusinessUnit: string
}
```

- [ ] **Step 3: Agregar las claves i18n (español primero, inglés espejo)**

En `resources/langs/es.json`, después de esta línea exacta (verificada en `:187`):

```json
  "employee_import_val_rows_message": "El archivo supera el número máximo de filas de datos permitido por importación. Divide el archivo en lotes más pequeños.",
```

insertar:

```json
  "employee_import_val_company_title": "El archivo declara otra empresa",
  "employee_import_val_company_message": "Alguna fila del archivo declara una empresa distinta de la que tienes activa. No se procesó ninguna fila: corrige las empresas del archivo y vuelve a subirlo.",
```

En `resources/langs/en.json`, después de su espejo de `employee_import_val_rows_message`, insertar:

```json
  "employee_import_val_company_title": "The file declares a different company",
  "employee_import_val_company_message": "Some row in the file declares a company different from your active one. No rows were processed: fix the companies in the file and upload it again.",
```

- [ ] **Step 4: Agregar la rama y el predicado en `app/helpers/employee_import_api_error.ts`**

4a. Imports: al bloque existente agregar (verificar que falten con `grep -n "sensitive_data_write_api_error\|VAL_COMPANY" app/helpers/employee_import_api_error.ts`):

```ts
import { isSensitiveDataWriteError } from './sensitive_data_write_api_error.js'
import type { EmployeeImportCompanyMismatchRow } from '../interfaces/employee_import_result_interface.js'
```

4b. Tipo de dato del 422, junto a `EmployeeImportValFileErrorData`:

```ts
export type EmployeeImportValCompanyErrorData = {
  offendingRows: EmployeeImportCompanyMismatchRow[]
}
```

4c. Ampliar el campo `data` de `ResolvedEmployeeImportError` de:

```ts
  data?: EmployeeImportValFileErrorData | null
```

a:

```ts
  data?: EmployeeImportValFileErrorData | EmployeeImportValCompanyErrorData | null
```

4d. Rama nueva en `resolveEmployeeImportApiError`, inmediatamente DESPUÉS del bloque `isRowLimitError` y ANTES del `if (fallbackStatus >= 500)`:

```ts
  if ((err as { isCompanyMismatchError?: boolean })?.isCompanyMismatchError) {
    // USRH1789747321650 reglas 1, 2 y 6: el archivo es de una sola empresa.
    // `err.message` ya trae el conteo y el listado de filas (interpolados en
    // `createCompanyMismatchValidationError`); el fallback i18n es genérico.
    const companyDetail =
      err.message ??
      translate(
        i18n,
        'employee_import_val_company_message',
        'Alguna fila del archivo declara una empresa distinta de la que tienes activa. No se procesó ninguna fila.'
      )
    return {
      title: translate(i18n, 'employee_import_val_company_title', 'El archivo declara otra empresa'),
      message: companyDetail,
      detail: companyDetail,
      status: 422,
      errorCode: EMPLOYEE_IMPORT_ERROR_CODES.VAL_COMPANY,
      key: 'empresa-distinta-en-archivo',
      data: {
        offendingRows: (err as { offendingRows?: EmployeeImportCompanyMismatchRow[] }).offendingRows ?? [],
      },
    }
  }
```

4e. Predicado de la regla 5, al final del archivo:

```ts
/**
 * ¿Este error de fila debe detener toda la importación? (USRH1789747321650,
 * regla 5). Solo el fallo al guardar un dato protegido: no es una fila
 * fallida más y nunca se registra como tal. Cualquier otro error sigue el
 * camino por fila de siempre.
 */
export function shouldAbortImportOnRowError(error: unknown): boolean {
  return isSensitiveDataWriteError(error)
}
```

- [ ] **Step 5: Escribir el spec puro que falla**

Crear `tests/unit/helpers/employee_import_company_mismatch.spec.ts`:

```ts
import { test } from '@japa/runner'
import {
  resolveEmployeeImportApiError,
  shouldAbortImportOnRowError,
} from '#helpers/employee_import_api_error'
import { EMPLOYEE_IMPORT_ERROR_CODES } from '#constants/employee_import_error_codes'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'

/** USRH1789747321650 reglas 1, 2, 5 y 6 a nivel de contrato (puro, sin BD). */

test.group('rechazo por empresa distinta — resolvedor', () => {
  test('isCompanyMismatchError resuelve 422 con key, code y todas las filas ofensoras', ({ assert }) => {
    const offendingRows = [
      { row: 3, businessUnit: 'Empresa B', payrollBusinessUnit: 'Empresa A' },
      { row: 5, businessUnit: 'Empresa A', payrollBusinessUnit: 'Empresa B' },
    ]
    const error = new Error('El archivo declara una empresa distinta de la activa en 2 fila(s).')
    ;(error as any).isCompanyMismatchError = true
    ;(error as any).statusCode = 422
    ;(error as any).offendingRows = offendingRows

    const resolved = resolveEmployeeImportApiError(error, 422)

    assert.equal(resolved.status, 422)
    assert.equal(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.VAL_COMPANY)
    assert.equal(resolved.key, 'empresa-distinta-en-archivo')
    assert.isString(resolved.title)
    assert.isString(resolved.detail)
    assert.deepEqual((resolved.data as { offendingRows: unknown }).offendingRows, offendingRows)
  })

  test('el cuerpo no incluye datos personales, solo filas y nombres de empresa', ({ assert }) => {
    const error = new Error('mismatch')
    ;(error as any).isCompanyMismatchError = true
    ;(error as any).offendingRows = [{ row: 2, businessUnit: 'Empresa B', payrollBusinessUnit: 'Empresa B' }]

    const raw = JSON.stringify(resolveEmployeeImportApiError(error, 422))
    assert.notMatch(raw, /CURP|RFC|NSS|person_|ER_DUP_ENTRY|[0-9a-f]{64}/)
  })

  test('un error común no toma la rama de empresa distinta', ({ assert }) => {
    const resolved = resolveEmployeeImportApiError(new Error('Fila vacía o sin datos de empleado'), 400)
    assert.notEqual(resolved.errorCode, EMPLOYEE_IMPORT_ERROR_CODES.VAL_COMPANY)
  })
})

test.group('regla 5 — predicado de detención', () => {
  test('el fallo de dato protegido detiene; cualquier otro error no', ({ assert }) => {
    const sensitive = new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN, 'identificacion')
    assert.isTrue(shouldAbortImportOnRowError(sensitive))
    assert.isFalse(shouldAbortImportOnRowError(new Error('CURP duplicado')))
    assert.isFalse(shouldAbortImportOnRowError(null))
  })
})
```

- [ ] **Step 6: Correr para verificar que falla**

```bash
node ace test unit --files="employee_import_company_mismatch"
```

Expected: FAIL (`resolveEmployeeImportApiError` sin rama / `shouldAbortImportOnRowError is not a function`). Aplicar los Steps 1-4 y repetir.

- [ ] **Step 7: Verde + typecheck**

```bash
node ace test unit --files="employee_import_company_mismatch" && npm run typecheck
```

Expected: PASS (4 casos) y `tsc` limpio.

- [ ] **Step 8: Commit**

```bash
git add app/constants/employee_import_error_codes.ts app/interfaces/employee_import_result_interface.ts app/helpers/employee_import_api_error.ts resources/langs/es.json resources/langs/en.json tests/unit/helpers/employee_import_company_mismatch.spec.ts
git commit -m "feat(USRH1789747321650): contrato del rechazo por empresa distinta y predicado de detención sensible"
```

---

### Task 2: Todo-o-nada por empresa en la pasada 1 (reglas 1, 2, 6)

**Files:**
- Modify: `app/services/employee_service.ts` (`importFromExcel` + `createCompanyMismatchValidationError`)
- Test: se cubre con la spec funcional de la Task 5 + test de contenido de esta tarea

**Interfaces:**
- Consumes: `resolveImportScopeBusinessUnitId(allowedBusinessUnitIds)` (misma fuente que el cupo); `mapBusinessUnit(nombre, businessUnits)` (resolución existente por nombre); tipo `EmployeeImportCompanyMismatchRow` (Task 1).
- Produces: `createCompanyMismatchValidationError(offendingRows)` → `Error` con `isCompanyMismatchError`, `statusCode 422`, `offendingRows`. Lanzado DESPUÉS del loop de filas y ANTES de `assertImportWithinQuota` y de la pasada 2.

- [ ] **Step 1: Resolver la empresa activa y el caché justo antes del loop de filas**

Inmediatamente ANTES del `for (const { row, rowNumber } of rows)` de la pasada 1 (después del corte por `maxDataRows` y de la validación de cabeceras, para no enmascarar sus 400 con un 500 de scope), insertar:

```ts
      // USRH1789747321650 regla 1: el archivo es de una sola empresa, la activa.
      // Misma fuente que el cupo (`resolveImportScopeBusinessUnitId`): el supuesto
      // de la historia es que siempre hay una sola activa; sin ella no hay contra
      // qué comparar y se propaga el mismo error que el cupo lanzaría.
      const activeBusinessUnitId = this.resolveImportScopeBusinessUnitId(allowedBusinessUnitIds)
      const companyMismatchRows: EmployeeImportCompanyMismatchRow[] = []

      // Caché por nombre normalizado: un archivo repite 2-3 nombres en todas sus
      // filas; sin caché serían 2 llamadas a `mapBusinessUnit` (Levenshtein sobre
      // el padrón completo) por fila dentro de una sola petición HTTP.
      const businessUnitResolutionCache = new Map<string, number | null>()
      const resolveBusinessUnitByName = (businessUnitName: string): number | null => {
        const normalizedName = String(businessUnitName ?? '').trim().toLowerCase()
        if (businessUnitResolutionCache.has(normalizedName)) {
          return businessUnitResolutionCache.get(normalizedName) ?? null
        }
        // Nombres no únicos entre tenants: primero en el scope (si resuelve ahí,
        // es la activa); solo si no resuelve se consulta el padrón completo para
        // distinguir "otra empresa real" de "nombre no resuelto".
        const businessUnitId =
          this.mapBusinessUnit(businessUnitName, businessUnits) ??
          this.mapBusinessUnit(businessUnitName, allBusinessUnitsForResolution)
        businessUnitResolutionCache.set(normalizedName, businessUnitId)
        return businessUnitId
      }
```

Agregar el import del tipo junto a los existentes (`:23-26`):

```ts
import type {
  EmployeeImportResult,
  EmployeeImportRowError,
  EmployeeImportCompanyMismatchRow,
} from '../interfaces/employee_import_result_interface.js'
```

- [ ] **Step 1b: Cargar todas las empresas activas para resolución de nombres**

Inmediatamente DESPUÉS de la consulta filtrada de `businessUnits` (ancla: el `if (allowedBusinessUnitIds.length > 0)` con `businessUnitsQuery.whereIn(...)` y `const businessUnits = await businessUnitsQuery`), insertar:

```ts
      // USRH1789747321650 regla 2: los nombres declarados se resuelven contra
      // TODAS las empresas activas, no solo las del scope. Con scope=[activa],
      // la empresa ajena nunca estaría en `businessUnits`, `mapBusinessUnit`
      // devolvería null y el caso de la historia sería invisible (lo demostró
      // el funcional de la Task 5). La creación sigue usando `businessUnits`
      // (scope): nada se crea ni se modifica fuera de la empresa activa.
      const allBusinessUnitsForResolution = await BusinessUnit.query()
        .whereNull('business_unit_deleted_at')
        .where('business_unit_active', 1)
        .select('businessUnitId', 'businessUnitName')
```

- [ ] **Step 2: Comparar las dos columnas resueltas dentro del loop de filas**

Sustituir el bloque de mapeo actual (ancla exacta `:2935-2952`, desde `// Mapear unidad de negocio de trabajo por nombre` hasta la línea de `finalPayrollBusinessUnitId`):

```ts
          // Mapear unidad de negocio de trabajo por nombre (scope primero + caché —
          // Steps 1 y 1b: con solo el padrón completo, un nombre compartido con
          // otro tenant resolvería ajeno y rechazaría archivos legítimos)
          let businessUnitId = resolveBusinessUnitByName(employeeData.businessUnit)
          // USRH1789747321650 reglas 1 y 2: si el nombre resolvió a una empresa
          // real distinta de la activa, la fila condena el archivo completo.
          // Un nombre que no resuelve (null) conserva el comportamiento de hoy
          // (decisión de alcance: no es "otra empresa declarada", es captura
          // incompleta; la regla 3 lo deja intacto).
          const declaredWorkId = businessUnitId
          // Si no se encuentra, usar la primera unidad de negocio de la base de datos (sin mensaje)
          if (businessUnitId === null && businessUnits.length > 0) {
            businessUnitId = businessUnits[0].businessUnitId
          }

          // Mapear unidad de negocio de nómina por nombre (scope primero + caché, igual que trabajo)
          let payrollBusinessUnitId = resolveBusinessUnitByName(employeeData.payrollBusinessUnit)
          const declaredPayrollId = payrollBusinessUnitId
          // Si no se encuentra, usar la primera unidad de negocio de la base de datos (sin mensaje)
          if (payrollBusinessUnitId === null && businessUnits.length > 0) {
            payrollBusinessUnitId = businessUnits[0].businessUnitId
          }

          // USRH1789747321650 reglas 1, 2 y 6: basta que CUALQUIERA de las dos
          // columnas declare otra empresa. La fila se aparta y el archivo se
          // rechaza entero DESPUÉS de revisar todas (el listado completo es
          // parte del entregable, no un adorno). Vale también para filas de
          // actualización: "alguna fila" no distingue altas de correcciones.
          const declaresOtherCompany =
            (declaredWorkId !== null && declaredWorkId !== activeBusinessUnitId) ||
            (declaredPayrollId !== null && declaredPayrollId !== activeBusinessUnitId)
          if (declaresOtherCompany) {
            companyMismatchRows.push({
              row: rowNumber,
              businessUnit: String(employeeData.businessUnit ?? '').trim(),
              payrollBusinessUnit: String(employeeData.payrollBusinessUnit ?? '').trim(),
            })
            continue
          }
```

- [ ] **Step 3b: El `catch` externo deja pasar el rechazo (no lo envuelve)**

El `catch` externo de `importFromExcel` (ancla: el comentario `// Errores de validación (cabeceras inválidas o tope de filas) se` + `if (error.isHeaderValidationError || error.isRowLimitError)`) re-lanza los errores tipados y envuelve el resto en `Error genérico`. Sin passthrough, el rechazo de la Step 3 llegaría al controlador como 500 sin `offendingRows`. Agregar junto a las otras condiciones, mismo estilo (el `catch` ya es `(error: any)` existente: leer la bandera no agrega `any` nuevo):

```ts
      if (error.isCompanyMismatchError) {
        throw error
      }
```

Y al test de contenido de la Step 5 agregar:

```ts
    assert.include(content, 'if (error.isCompanyMismatchError) {')
```

- [ ] **Step 3: Lanzar el rechazo entero antes del cupo y antes de la pasada 2**

Inmediatamente DESPUÉS del cierre del `for (const { row, rowNumber } of rows)` de la pasada 1 (ancla: la línea `await this.assertImportWithinQuota(allowedBusinessUnitIds, newEmployeesCount)`), insertar ANTES de esa línea:

```ts
      // USRH1789747321650 regla 6: el rechazo ocurre antes de tocar cualquier
      // cosa (ni cupo que evaluar, ni fila que crear o modificar). Un rechazo a
      // media carga dejaría media plantilla dada de alta.
      if (companyMismatchRows.length > 0) {
        throw this.createCompanyMismatchValidationError(companyMismatchRows)
      }

```

(dejando la línea de `assertImportWithinQuota` intacta debajo).

- [ ] **Step 4: Agregar la fábrica del error junto a las existentes**

Junto a `createRowLimitValidationError` (ancla `:3279-3287`), agregar después de ese método:

```ts
  /**
   * Rechazo todo-o-nada: alguna fila declara una empresa distinta de la activa
   * (USRH1789747321650, reglas 1, 2 y 6). El mensaje enumera TODAS las filas
   * ofensoras con lo que cada una declaraba, para corregir de una vez. Solo
   * nombres de empresa y números de fila: ningún dato personal.
   */
  private createCompanyMismatchValidationError(
    offendingRows: EmployeeImportCompanyMismatchRow[]
  ): Error {
    const listing = offendingRows
      .map(
        (item) =>
          `Fila ${item.row} (trabajo «${item.businessUnit}», nómina «${item.payrollBusinessUnit}»)`
      )
      .join('; ')
    const error = new Error(
      `El archivo declara una empresa distinta de la activa en ${offendingRows.length} fila(s): ${listing}. No se procesó ninguna fila: corrige las empresas del archivo y vuelve a subirlo.`
    )
    ;(error as any).isCompanyMismatchError = true
    ;(error as any).statusCode = 422
    ;(error as any).offendingRows = offendingRows
    return error
  }
```

- [ ] **Step 5: Test de contenido del cableado**

Agregar al final de `tests/unit/services/employee_import_excel_result.spec.ts` (grupo nuevo, mismo archivo, sin BD):

```ts
test.group('employee_service importFromExcel — USRH1789747321650', () => {
  test('la pasada 1 compara ambas columnas resueltas y rechaza antes del cupo y de la pasada 2', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'this.resolveImportScopeBusinessUnitId(allowedBusinessUnitIds)')
    assert.include(content, 'allBusinessUnitsForResolution')
    assert.include(content, 'resolveBusinessUnitByName')
    assert.include(content, 'businessUnitResolutionCache')
    assert.include(content, 'const declaredWorkId = businessUnitId')
    assert.include(content, 'const declaredPayrollId = payrollBusinessUnitId')
    assert.include(content, 'companyMismatchRows.push({')
    assert.include(content, 'throw this.createCompanyMismatchValidationError(companyMismatchRows)')
    assert.include(content, 'isCompanyMismatchError')
  })

  test('el rechazo se lanza antes de evaluar el cupo (cero escrituras por construcción)', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')
    const rejectIdx = content.indexOf('throw this.createCompanyMismatchValidationError(companyMismatchRows)')
    const quotaIdx = content.indexOf('await this.assertImportWithinQuota(allowedBusinessUnitIds, newEmployeesCount)')
    const loopIdx = content.indexOf('for (const { rowNumber, employeeData, businessUnitId, payrollBusinessUnitId, isUpdate } of validRows)')
    assert.isAbove(rejectIdx, 0)
    assert.isBelow(rejectIdx, quotaIdx)
    assert.isBelow(rejectIdx, loopIdx)
  })
})
```

- [ ] **Step 6: Verde (unitarios tocados) + typecheck**

```bash
node ace test unit --files="employee_import_company_mismatch" --files="employee_import_excel_result" && npm run typecheck
```

Expected: PASS y `tsc` limpio. (El funcional de la Task 5 aún no existe: fallará hasta entonces solo si se corre.)

- [ ] **Step 7: Commit**

```bash
git add app/services/employee_service.ts tests/unit/services/employee_import_excel_result.spec.ts
git commit -m "feat(USRH1789747321650): rechazar archivo completo cuando alguna fila declara otra empresa"
```

---

### Task 3: La regla 5 deja de absorberse (fallo de dato protegido detiene la carga)

**Files:**
- Modify: `app/services/employee_service.ts` (`catch` de la pasada 2)
- Test: Task 1 (predicado, ya en verde) + test de contenido de esta tarea

**Interfaces:**
- Consumes: `shouldAbortImportOnRowError` (Task 1); `importRowErrorMessage` (sin cambio para el resto).
- Produces: ante `SensitiveDataWriteError` en la pasada 2, el error se propaga al `catch` externo (que ya lo re-lanza en `:3126-3128`) y el controlador responde 403. Ninguna fila posterior se procesa.

- [ ] **Step 1: Re-lanzar el error sensible en el `catch` de la pasada 2**

Sustituir el `catch` actual de la pasada 2 (ancla exacta `:3076-3079`):

```ts
        } catch (error: any) {
          skipped++
          rowErrors.push({ row: rowNumber, message: importRowErrorMessage(error) })
        }
```

por:

```ts
        } catch (error: any) {
          // USRH1789747321650 regla 5 (restaura la intención del bloque
          // comentado de la revisión sensitive-write-by-category): el fallo al
          // guardar un dato protegido detiene la carga y se reporta vía 403
          // del controlador. No es una fila fallida más ni desaparece del
          // reporte. El `catch` externo ya re-lanza sensibles (`:3126-3128`).
          // Nota honesta: esta guarda hoy es inalcanzable porque la importación
          // corre en `runUnguarded` y el permiso sensible se exige por cabeceras
          // antes de las pasadas; se conserva como defensa futura.
          if (shouldAbortImportOnRowError(error)) throw error
          skipped++
          rowErrors.push({ row: rowNumber, message: importRowErrorMessage(error) })
        }
```

Agregar el import en su propia línea (el predicado vive en `employee_import_api_error`, no junto a `importRowErrorMessage`):

```ts
import { shouldAbortImportOnRowError } from '#helpers/employee_import_api_error'
```

- [ ] **Step 2: Test de contenido (el `catch` externo ya re-lanza: no se toca)**

Agregar al grupo `USRH1789747321650` de `tests/unit/services/employee_import_excel_result.spec.ts` (mismo archivo de la Task 2):

```ts
  test('regla 5: el catch de la pasada 2 re-lanza el error sensible antes de registrar fila fallida', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, 'if (shouldAbortImportOnRowError(error)) throw error')
    // El catch externo ya re-lanzaba sensibles: no se duplica, se verifica.
    assert.include(content, 'if (isSensitiveDataWriteError(error)) {')
  })

  test('regla 4 intacta: el duplicado de CURP sigue siendo salto de fila con el resto cargando', ({
    assert,
  }) => {
    const content = readFileSync(SERVICE_FILE, 'utf-8')

    assert.include(content, "rowErrors.push({ row: rowNumber, message: 'CURP duplicado' })")
  })
```

- [ ] **Step 3: Verde + typecheck**

```bash
node ace test unit --files="employee_import_company_mismatch" --files="employee_import_excel_result" && npm run typecheck
```

Expected: PASS y `tsc` limpio.

- [ ] **Step 4: Commit**

```bash
git add app/services/employee_service.ts tests/unit/services/employee_import_excel_result.spec.ts
git commit -m "fix(USRH1789747321650): detener la carga y reportar el fallo al guardar un dato protegido"
```

---

### Task 4: El controlador responde el 422 con el listado (y OpenAPI lo documenta)

**Files:**
- Modify: `app/controllers/employee_controller.ts` (rama en el `catch` de `importFromExcel`)
- Modify: `docs/openapi.yaml` (respuesta `422` de `POST /api/employees/import-excel`)
- Test: `tests/unit/controllers/employee_import_excel_controller.spec.ts` (grupo nuevo, contenido)

**Interfaces:**
- Consumes: `resolveEmployeeImportApiError(error, 422)` con la rama de la Task 1.
- Produces: `422 { type: 'error', title, message, detail, key: 'empresa-distinta-en-archivo', code: 'EMP.IMPORT.VAL_COMPANY', data: { offendingRows } }`.

- [ ] **Step 1: Agregar la rama 422 en el `catch` de `importFromExcel`**

En `app/controllers/employee_controller.ts`, en el `catch` del método `importFromExcel`, inmediatamente ANTES del bloque que detecta cabeceras (ancla: el comentario `// Detectar errores de validación de cabeceras`), insertar:

```ts
      // USRH1789747321650 reglas 1 y 6: el archivo declaraba otra empresa.
      // Rechazo todo-o-nada con el listado de filas para corregir (422, no 400:
      // las cabeceras y el formato eran válidos; lo inaceptable es el contenido).
      if ((error as { isCompanyMismatchError?: boolean }).isCompanyMismatchError) {
        const resolved = resolveEmployeeImportApiError(error, 422, i18n)
        response.status(resolved.status)
        return {
          type: 'error',
          title: resolved.title,
          message: resolved.message,
          detail: resolved.detail,
          key: resolved.key,
          code: resolved.errorCode,
          data: resolved.data,
        }
      }

```

(El `catch` ya maneja 403 sensible antes y 409 de cupo antes: esta rama no los toca. Verificar con `grep -n "isSensitiveDataWriteError(error)\|EmployeeQuotaError\|isHeaderValidationError" app/controllers/employee_controller.ts` que el orden leído es 403 → 409 → [nuevo 422] → 400 → 500.)

- [ ] **Step 2: Documentar el 422 en `docs/openapi.yaml`**

En la sección `POST /api/employees/import-excel` (ancla: el bloque `'403':` de `Sin permiso de categoría`), insertar DESPUÉS del bloque `409` y ANTES del `500` (copiar el estilo del `409`, con su `examples:`):

```yaml
      '422':
        description: |
          Alguna fila declara una empresa distinta de la activa (trabajo o nómina).
          No se aplica ninguna fila del Excel (todo-o-nada).
        content:
          application/json:
            schema:
              type: object
              properties:
                type:
                  type: string
                  example: error
                title:
                  type: string
                message:
                  type: string
                detail:
                  type: string
                key:
                  type: string
                  example: empresa-distinta-en-archivo
                code:
                  type: string
                  example: EMP.IMPORT.VAL_COMPANY
                data:
                  type: object
                  properties:
                    offendingRows:
                      type: array
                      items:
                        type: object
                        properties:
                          row:
                            type: integer
                          businessUnit:
                            type: string
                          payrollBusinessUnit:
                            type: string
            examples:
              empresaDistinta:
                value:
                  type: error
                  title: El archivo declara otra empresa
                  message: "El archivo declara una empresa distinta de la activa en 1 fila(s): Fila 3 (trabajo «Empresa B», nómina «Empresa A»). No se procesó ninguna fila: corrige las empresas del archivo y vuelve a subirlo."
                  detail: "El archivo declara una empresa distinta de la activa en 1 fila(s): Fila 3 (trabajo «Empresa B», nómina «Empresa A»). No se procesó ninguna fila: corrige las empresas del archivo y vuelve a subirlo."
                  key: empresa-distinta-en-archivo
                  code: EMP.IMPORT.VAL_COMPANY
                  data:
                    offendingRows:
                      - row: 3
                        businessUnit: Empresa B
                        payrollBusinessUnit: Empresa A
```

- [ ] **Step 3: Test de contenido del controlador**

Agregar a `tests/unit/controllers/employee_import_excel_controller.spec.ts`:

```ts
test.group('employee_controller importFromExcel — USRH1789747321650', () => {
  test('422 por empresa distinta antes de la rama 400; responde key, code y data', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')
    const methodStart = content.indexOf('async importFromExcel')
    const methodBody = content.slice(methodStart, methodStart + 9000)

    assert.include(methodBody, 'isCompanyMismatchError')
    assert.include(methodBody, 'resolveEmployeeImportApiError(error, 422')
    assert.include(methodBody, 'code: resolved.errorCode')
    assert.include(methodBody, 'data: resolved.data')

    const mismatchIdx = methodBody.indexOf('isCompanyMismatchError')
    const headersIdx = methodBody.indexOf('isHeaderValidationError')
    assert.isBelow(mismatchIdx, headersIdx)
  })

  test('OpenAPI documenta el 422 de empresa distinta en import-excel', ({ assert }) => {
    const openapiFile = join(process.cwd(), 'docs/openapi.yaml')
    const content = readFileSync(openapiFile, 'utf-8')
    const sectionStart = content.indexOf('/api/employees/import-excel:')
    const sectionEnd = content.indexOf('/api/employees/{employeeId}/temporary-assignments:')
    const section = content.slice(sectionStart, sectionEnd)

    assert.include(section, "'422':")
    assert.include(section, 'empresa-distinta-en-archivo')
    assert.include(section, 'EMP.IMPORT.VAL_COMPANY')
    assert.include(section, 'offendingRows')
  })
})
```

- [ ] **Step 4: Verde + typecheck**

```bash
node ace test unit --files="employee_import_excel_controller" && npm run typecheck
```

Expected: PASS y `tsc` limpio.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/employee_controller.ts docs/openapi.yaml tests/unit/controllers/employee_import_excel_controller.spec.ts
git commit -m "feat(USRH1789747321650): responder 422 con las filas ofensoras ante empresa distinta"
```

---

### Task 5: Spec funcional con Excel real — los 6 criterios de la HU

**Files:**
- Test: `tests/functional/services/employee_import_company_scope.spec.ts` (crear)

**Interfaces:**
- Consumes: `EmployeeService#importFromExcel(file, [unitAId])` directo (nivel servicio, como `employee_import_quota.spec.ts`: sin ruido de auth/gate); `BusinessUnit` origen `platform` (sin plan: `resolveQuota` devuelve `{ limit: null, source: 'none' }` y el cupo pasa); `Person`/`Employee` para conteos antes/después.
- Produces: 6 casos (criterios 1-6 de la HU). El rechazo se aserta por el error tipado (`isCompanyMismatchError`, `offendingRows`, cero escrituras); el 422 HTTP ya quedó fijado en Tasks 1 y 4.
- Infra obligatoria (hallazgo de la primera ejecución): las llamadas a `importFromExcel` van envueltas en `SensitiveAccessContext.run` con un store de escritura permitida (precedente: `tests/unit/services/employee_import_sensitive_headers.spec.ts`), porque las cabeceras CURP/RFC/NSS/salario/contacto activan `assertExcelSensitiveHeadersWritable` ANTES de la lógica de empresa. Y cero `any`: `isCompanyMismatchError`/`offendingRows` se leen con un tipo explícito de forma (`unknown` + predicado), nunca `(error as any)`.

- [ ] **Step 1: Escribir la spec que falla**

Crear `tests/functional/services/employee_import_company_scope.spec.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import i18nManager from '@adonisjs/i18n/services/main'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import Person from '#models/person'
import EmployeeService from '#services/employee_service'

/**
 * USRH1789747321650 — rechazo de carga masiva por empresa distinta.
 * Nivel servicio (como employee_import_quota.spec.ts): el 422 HTTP ya está
 * fijado en unitarios; aquí se prueba el todo-o-nada contra BD real.
 * Empresas `platform`: el cupo no estorba (`{ limit: null, source: 'none' }`).
 */

const STAMP = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

const IMPORT_HEADERS = [
  'ID Empleado',
  'Identificador de nómina',
  'Unidad de negocio de trabajo',
  'Unidad de negocio de nómina',
  'Nombre del empleado',
  'Apellido paterno del empleado',
  'Apellido materno del empleado',
  'Fecha de contratación (yyyy/mm/dd)',
  'Departamento',
  'Posición',
  'Salario diario',
  'Fecha de nacimiento (dd/mm/yyyy)',
  'CURP',
  'RFC',
  'NSS',
  'Correo empresa',
  'Correo personal',
  'Teléfono Empresa',
  'Teléfono Personal',
  'Modalidad de trabajo',
  '% Teletrabajo',
  'Nombre contacto emergencia',
  'Apellido paterno contacto emergencia',
  'Apellido materno contacto emergencia',
  'Parentesco contacto emergencia',
  'Teléfono contacto emergencia',
] as const

type ImportRowInput = {
  // Riesgo declarado de la HU: el material compartido asumía la misma empresa
  // en ambas columnas. Este constructor acepta nómina distinta a propósito.
  payrollNum: string
  workUnitName: string
  payrollUnitName?: string
  firstName: string
  lastName: string
  curp?: string
}

function getService(): EmployeeService {
  return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
}

function buildImportRow(row: ImportRowInput): (string | number)[] {
  const values = new Array(IMPORT_HEADERS.length).fill('') as (string | number)[]
  values[0] = ''
  values[1] = row.payrollNum
  values[2] = row.workUnitName
  values[3] = row.payrollUnitName ?? row.workUnitName
  values[4] = row.firstName
  values[5] = row.lastName
  if (row.curp) values[12] = row.curp
  return values
}

async function writeImportExcel(rows: ImportRowInput[]): Promise<{ tmpPath: string; dir: string }> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Empleados')
  worksheet.addRow([...IMPORT_HEADERS])
  for (const row of rows) {
    worksheet.addRow(buildImportRow(row))
  }
  const dir = await mkdtemp(join(tmpdir(), `employee-import-company-${STAMP}-`))
  const tmpPath = join(dir, 'import.xlsx')
  await workbook.xlsx.writeFile(tmpPath)
  return { tmpPath, dir }
}

function asUploadFile(tmpPath: string) {
  return {
    tmpPath,
    clientName: 'import.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1024,
  }
}

async function createPlatformUnit(tag: string): Promise<BusinessUnit> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `Rechazo Carga ${tag} ${stamp}`
  businessUnit.businessUnitSlug = `rechazo-carga-${tag.toLowerCase()}-${stamp}`
  businessUnit.businessUnitLegalName = `Rechazo Carga ${tag} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  businessUnit.businessUnitOrigin = 'platform'
  await businessUnit.save()
  return businessUnit
}

async function countEmployeesIn(businessUnitId: number): Promise<number> {
  return Employee.query().where('business_unit_id', businessUnitId).whereNull('employee_deleted_at').exec().then((rows) => rows.length)
}

async function countPersonsIn(businessUnitId: number): Promise<number> {
  return Person.query().where('business_unit_id', businessUnitId).exec().then((rows) => rows.length)
}

test.group('EmployeeService.importFromExcel — empresa distinta (USRH1789747321650)', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  const personIds: number[] = []

  group.setup(async () => {
    unitA = await createPlatformUnit('A')
    unitB = await createPlatformUnit('B')
  })

  group.teardown(async () => {
    const employees = await Employee.query().whereIn('business_unit_id', [unitA.businessUnitId, unitB.businessUnitId])
    for (const employee of employees) {
      await employee.delete()
    }
    if (personIds.length > 0) {
      await Person.query().whereIn('person_id', personIds).delete()
    }
    await BusinessUnit.query().whereIn('business_unit_id', [unitA.businessUnitId, unitB.businessUnitId]).delete()
  })

  async function importAsA(rows: ImportRowInput[], cleanup: (fn: () => Promise<void>) => void) {
    const { tmpPath, dir } = await writeImportExcel(rows)
    cleanup(async () => {
      await rm(dir, { recursive: true, force: true })
    })
    return getService().importFromExcel(asUploadFile(tmpPath), [unitA.businessUnitId])
  }

  test('criterio 1 — archivo todo de la activa: carga como hoy', async ({ assert, cleanup }) => {
    const beforeEmployees = await countEmployeesIn(unitA.businessUnitId)
    const result = await importAsA(
      [
        { payrollNum: `RC-OK-1-${STAMP}`, workUnitName: unitA.businessUnitName, firstName: 'Carga', lastName: 'OkUno' },
        { payrollNum: `RC-OK-2-${STAMP}`, workUnitName: unitA.businessUnitName, firstName: 'Carga', lastName: 'OkDos' },
      ],
      cleanup
    )
    assert.equal(result.summary.created, 2)
    assert.equal(result.rowErrors.length, 0)
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployees + 2)
    const created = await Employee.query().where('business_unit_id', unitA.businessUnitId).orderBy('employee_id', 'desc').limit(2)
    for (const employee of created) {
      const person = await Person.findOrFail(employee.personId)
      personIds.push(person.personId)
    }
  })

  test('criterio 2 — una fila con trabajo distinto: rechazo completo, nada creado, fila identificada', async ({
    assert,
    cleanup,
  }) => {
    const beforeEmployeesA = await countEmployeesIn(unitA.businessUnitId)
    const beforePersonsA = await countPersonsIn(unitA.businessUnitId)
    try {
      await importAsA(
        [
          { payrollNum: `RC-W-1-${STAMP}`, workUnitName: unitA.businessUnitName, firstName: 'Carga', lastName: 'Bien' },
          { payrollNum: `RC-W-2-${STAMP}`, workUnitName: unitB.businessUnitName, firstName: 'Carga', lastName: 'Mal' },
        ],
        cleanup
      )
      assert.fail('debió rechazar el archivo completo')
    } catch (error) {
      assert.equal((error as any).isCompanyMismatchError, true)
      assert.equal((error as any).statusCode, 422)
      const offending = (error as any).offendingRows as Array<{ row: number }>
      assert.equal(offending.length, 1)
      assert.equal(offending[0].row, 3)
    }
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployeesA)
    assert.equal(await countPersonsIn(unitA.businessUnitId), beforePersonsA)
  })

  test('criterio 3 — trabajo de la activa pero nómina distinta: mismo rechazo', async ({ assert, cleanup }) => {
    const beforeEmployeesA = await countEmployeesIn(unitA.businessUnitId)
    try {
      await importAsA(
        [
          {
            payrollNum: `RC-P-1-${STAMP}`,
            workUnitName: unitA.businessUnitName,
            payrollUnitName: unitB.businessUnitName,
            firstName: 'Carga',
            lastName: 'NominaMal',
          },
        ],
        cleanup
      )
      assert.fail('debió rechazar el archivo completo')
    } catch (error) {
      assert.equal((error as any).isCompanyMismatchError, true)
      assert.equal(((error as any).offendingRows as Array<{ row: number }>).length, 1)
    }
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployeesA)
  })

  test('criterio 4 — varias filas ofensoras: el rechazo las enumera todas', async ({ assert, cleanup }) => {    try {
      await importAsA(
        [
          { payrollNum: `RC-M-1-${STAMP}`, workUnitName: unitB.businessUnitName, firstName: 'Carga', lastName: 'MalUno' },
          { payrollNum: `RC-M-2-${STAMP}`, workUnitName: unitA.businessUnitName, firstName: 'Carga', lastName: 'Bien' },
          {
            payrollNum: `RC-M-3-${STAMP}`,
            workUnitName: unitA.businessUnitName,
            payrollUnitName: unitB.businessUnitName,
            firstName: 'Carga',
            lastName: 'MalDos',
          },
        ],
        cleanup
      )
      assert.fail('debió rechazar el archivo completo')
    } catch (error) {
      const offending = (error as any).offendingRows as Array<{ row: number }>
      assert.equal(offending.length, 2)
      assert.deepEqual(
        offending.map((item) => item.row),
        [2, 4]
      )
      assert.match((error as Error).message, /Fila 2.*Fila 4/s)
    }
  })

  test('criterio 5 / regla 4 — CURP ya registrada en la propia empresa: esa fila se salta, el resto carga', async ({
    assert,
    cleanup,
  }) => {
    const seeded = new Person()
    seeded.personFirstname = 'Sembrada'
    seeded.personLastname = 'Duplicada'
    seeded.personSecondLastname = 'Scope'
    seeded.personCurp = `RCCURPSEED${STAMP}`.slice(0, 18)
    seeded.businessUnitId = unitA.businessUnitId
    await seeded.save()
    personIds.push(seeded.personId)

    const beforeEmployees = await countEmployeesIn(unitA.businessUnitId)
    const result = await importAsA(
      [
        { payrollNum: `RC-D-1-${STAMP}`, workUnitName: unitA.businessUnitName, firstName: 'Carga', lastName: 'Dup', curp: seeded.personCurp },
        { payrollNum: `RC-D-2-${STAMP}`, workUnitName: unitA.businessUnitName, firstName: 'Carga', lastName: 'Libre' },
      ],
      cleanup
    )
    assert.equal(result.summary.created, 1)
    assert.equal(result.rowErrors.length, 1)
    assert.equal(result.rowErrors[0].message, 'CURP duplicado')
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployees + 1)
    const created = await Employee.query().where('business_unit_id', unitA.businessUnitId).orderBy('employee_id', 'desc').firstOrFail()
    const person = await Person.findOrFail(created.personId)
    personIds.push(person.personId)
  })
})
```

Notas de la spec (no son opcionales): `importAsA` pasa `allowedBusinessUnitIds = [unitA]` = empresa activa. Los `row` esperados son números de fila del Excel (cabecera = fila 1: primera fila de datos = 2). El `STAMP` va en `payrollNum`/`personCurp` para no chocar con otras corridas (CURP acotada por empresa desde la dependencia: la sembrada solo bloquea en A). La limpieza borra empleados de A y B ANTES que personas y unidades (FK). Si `countEmployeesIn` falla por el mixin de scope en tests, sustituir por `db.from('employees')...` como en `employee_import_quota.spec.ts` (precedente copiable).

- [ ] **Step 2: Correr para verificar que falla**

```bash
node ace test functional --files="employee_import_company_scope"
```

Expected: FAIL en los criterios 2-4 (`debió rechazar el archivo completo` / `isCompanyMismatchError` undefined) hasta aplicar la Task 2; criterio 1 y 5 en verde desde el inicio (reglas 3 y 4: sin cambio). Si la Task 2 ya está aplicada, el rojo debió verse al crear la spec primero: el orden es spec → correr → implementar.

- [ ] **Step 3: Verde con la Task 2 aplicada + typecheck**

```bash
node ace test functional --files="employee_import_company_scope" && npm run typecheck
```

Expected: PASS (5 casos) y `tsc` limpio. Si un caso de rechazo no lanza, revisar que `unitB.businessUnitName` resuelva por `mapBusinessUnit` a otra empresa real (nombres distintos con similitud < 0.8: los prefijos `Rechazo Carga A/B` + stamp garantizan diferencia).

- [ ] **Step 4: Corrida del área de importación (regresión: el camino más largo del producto)**

```bash
node ace test unit --files="employee_import_excel_result" --files="employee_import_excel_bulk_performance" --files="employee_import_api_error" --files="employee_import_company_mismatch" --files="employee_import_quota" && node ace test functional --files="employee_import_company_scope"
```

Expected: todo PASS. Además correr la suite sensible del import (usa cabeceras sensibles, no toca empresas):

```bash
node ace test functional --files="employees_sensitive_import_excel_http"
```

Expected: PASS (el 403 de cabeceras sigue intacto; la regla 5 no lo toca).

- [ ] **Step 5: Commit**

```bash
git add tests/functional/services/employee_import_company_scope.spec.ts
git commit -m "test(USRH1789747321650): criterios de rechazo por empresa distinta en carga masiva"
```

---

### Task 6: Manual QA API y cierre (sin PR)

**Files:**
- Create: `docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-qa-api.md`
- Create: `docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-cierre.md`
- Modify (no versionado, `.git/info/exclude`): `database/seeders/_tmp_do_not_commit_qa_seeder.ts` — función `seedRechazoCargaMasivaQa` y su llamada en `run()` (verificar el nombre real del runner con `grep -n "seedEmpresaDuenaPersonaQa\|seedUnicidadIdentidadQa" database/seeders/_tmp_do_not_commit_qa_seeder.ts` y copiar el estilo)

**Interfaces:**
- Consumes: seeder QA existente (mismo archivo, mismo estilo); empresas `qa-carga-a` y `qa-carga-b` (origen `platform`), capturista `qa-carga-capturista-a@gsti-tests.local` con la contraseña de prueba del proyecto.
- Produces: manual de 4 escenarios (trabajo distinto, nómina distinta, varias filas, duplicado propio que sigue igual) + cierre con notas de revisión.

- [ ] **Step 1: Agregar el bloque del seeder (no versionado)**

Al final del seeder, estilo de los bloques anteriores:

```ts
/**
 * USRH1789747321650 — Rechazo de carga masiva por empresa distinta.
 * Dos empresas platform con un capturista en A. Sin personas sembradas:
 * cada escenario sube su propio archivo y el rechazo no deja nada.
 */
async function seedRechazoCargaMasivaQa(): Promise<void> {
  const rootRole = await Role.query().where('role_slug', 'root').whereNull('role_deleted_at').firstOrFail()

  async function ensureUnit(slug: string, name: string): Promise<BusinessUnit> {
    return BusinessUnit.firstOrCreate(
      { businessUnitSlug: slug },
      { businessUnitName: name, businessUnitLegalName: `${name} SA de CV`, businessUnitActive: 1, businessUnitOrigin: 'platform' },
    )
  }

  const unitA = await ensureUnit('qa-carga-a', 'QA Carga Empresa A')
  await ensureUnit('qa-carga-b', 'QA Carga Empresa B')

  const email = 'qa-carga-capturista-a@gsti-tests.local'
  const user = await createAlcanceUser(email, 'CargaCapturistaA', rootRole.roleId, unitA.businessUnitId)
  const person = await Person.find(user.personId)
  if (person && person.businessUnitId !== unitA.businessUnitId) {
    person.businessUnitId = unitA.businessUnitId
    await person.save()
  }
}
```

y en `run()`, después del último `seed...Qa()` existente, agregar `await seedRechazoCargaMasivaQa()`. (Si `createAlcanceUser` tiene otro nombre en el archivo, usar el que revele el grep y anotarlo en el cierre.)

- [ ] **Step 2: Correr el seeder contra la BD de desarrollo migrada**

```bash
node ace migration:run && node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Expected: sin error. Verificar:

```sql
SELECT business_unit_slug, business_unit_name FROM business_units WHERE business_unit_slug IN ('qa-carga-a', 'qa-carga-b');
```

Expected: las dos empresas.

- [ ] **Step 3: Escribir el manual QA API**

Crear `docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-qa-api.md` (formato de `2026-09-22-unicidad-identidad-por-empresa-qa-api.md`: Problema/Solución/Ejemplo, Preparar, tabla de usuarios, un escenario por variante con endpoint + response exacto, checklist; cada dato explicado una sola vez; bodies pegables con `"..."` solo en lo irrelevante). Contenido mínimo:

- Problema/Solución/Ejemplo: el archivo que mezcla empresas se cargaba entero en la activa sin avisar; ahora se rechaza entero con el motivo y las filas. Ejemplo cotidiano de 2-4 líneas (p. ej. listas de asistencia de dos escuelas).
- Preparar: `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts` (un solo comando, el del seeder compartido); tabla de un solo usuario `qa-carga-capturista-a@gsti-tests.local` + contraseña de prueba `password` (variante única: capturista de A; B nunca actúa — su nombre solo aparece escrito dentro de los archivos, así que no necesita usuario); SQL para los identificadores públicos de A y B (`SELECT business_unit_slug, business_unit_public_id FROM business_units WHERE business_unit_slug IN ('qa-carga-a', 'qa-carga-b');` — los ids no se inventan); URL base `http://127.0.0.1:3333` y auth por `Authorization: Bearer <token>` asumida resuelta por el cliente (constantes tomadas del manual anterior `2026-09-22-unicidad-identidad-por-empresa-qa-api.md`, según exige la regla).
- Archivos de prueba (cómo se arman, sin inventar rutas): descargar la plantilla real con `GET /api/employees/template-excel` (ruta verificada en `start/routes/employee_routes.ts`, prefijo `/api/employees`) y llenar solo las 5 columnas obligatorias que exige `collectMissingRequiredImportFields` (`Identificador de nómina`, `Unidad de negocio de trabajo`, `Unidad de negocio de nómina`, `Nombre del empleado`, `Apellido paterno del empleado`); las dos columnas de empresa se escriben con los nombres sembrados `QA Carga Empresa A` / `QA Carga Empresa B` (deterministas del seeder; `mapBusinessUnit` casa por nombre). Subida por `POST /api/employees/import-excel` multipart campo `file`.
- Escenario 1 (positivo): archivo de 2 filas todo de A → `POST /api/employees/import-excel` responde `200` con `created: 2`, `rowErrors: []`. Explicar `summary`, `rowErrors`, `warnings` una sola vez aquí, con valores fijos enumerados (`type`: puede valer `success` —se hizo lo pedido—, `warning` —se procesó con filas con error o avisos— o `error` —no se procesó nada—).
- Escenario 2 (trabajo distinto): 1 fila de A + 1 de B en trabajo → `422` con `key: empresa-distinta-en-archivo`, `code: EMP.IMPORT.VAL_COMPANY` y `data.offendingRows` con la fila 3. Verificar con SQL que no se creó nadie (`SELECT COUNT(*) FROM employees WHERE ...` antes/después). Explicar `key`/`code`/`data.offendingRows` aquí.
- Escenario 3 (nómina distinta): trabajo todo A, una nómina B → mismo `422`. (Datos ya explicados en el 2.)
- Escenario 4 (regla 4 intacta): archivo todo de A con una CURP ya registrada en A → `200` con esa fila en `rowErrors` como `CURP duplicado` y el resto creado. (Sin explicación repetida.)
- Cierre del manual: línea `Sin limpieza: este recorrido no toca ningún interruptor global.` + Checklist de 4 casillas.
- Declarar en una línea lo no revisable aquí: el fallo de dato protegido a media carga (regla 5) no se puede provocar con base sembrada (requiere denegar escritura sensible a mitad del guardado); se cubre con el unitario del predicado + revisión de código del `catch`.

- [ ] **Step 4: Levantar el ambiente y entregar — el recorrido lo hace una persona**

Regla `~/.cursor/rules/manual-qa-execution.mdc`: un playbook lo camina **una persona**, nunca el agente.

```bash
node ace serve --hmr
```

Expected: API arriba en `http://127.0.0.1:3333` sobre la BD de desarrollo sembrada en el Step 2. Entregar la ruta del manual y la tabla de usuarios. Si algún response difiere en `title`/`detail`/`key`, **se corrige el manual**, no el código.

- [ ] **Step 5: Escribir el resumen de cierre (sin abrir PR)**

Crear `docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-cierre.md` con:

```markdown
# Resumen de cierre — USRH1789747321650 Rechazo de carga masiva por empresa distinta

## Qué cambia

Pasada 1 del importador compara las dos columnas resueltas contra la activa
(misma fuente que el cupo) y rechaza el archivo entero con 422
(`empresa-distinta-en-archivo` / `EMP.IMPORT.VAL_COMPANY`) enumerando TODAS
las filas ofensoras, antes del cupo y antes de crear o modificar nada.
El `catch` de la pasada 2 re-lanza el fallo de dato protegido (403) en vez
de registrarlo como fila fallida.

## Qué NO cambia

Formato del archivo, columnas, pasos de subida; duplicado intra-empresa
(salta y sigue); cupo (409); 403 de cabeceras sensibles; status de todo lo
demás. Nombres no resueltos conservan el fallback de hoy. Sin migración,
sin catálogo, sin pantallas.

## Notas para revisión (los puntos que más atención piden)

- No es fuga entre clientes: hoy todo caía en la activa; es claridad, no seguridad.
- Se revisaron las DOS columnas (la de nómina tiene criterio propio).
- Regla 5: lo que antes seguía ahora detiene con 403 — cambio declarado.
- Alcance: `null` no resuelto ≠ empresa distinta (ver Global Constraints).
- Suite de importación en verde antes y después (incluida la sensible HTTP).

## Pruebas

Spec funcional `tests/functional/services/employee_import_company_scope.spec.ts`
(5 casos, criterios 1-5; regla 5 en unitario del predicado + contenido del catch).
Manual hermano (4 escenarios). Lo no revisable con base sembrada, declarado en el manual.
```

Commits:

```bash
git add docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-qa-api.md
git commit -m "docs(USRH1789747321650): manual de QA de API de rechazo por empresa distinta"
git add docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-cierre.md
git commit -m "docs(USRH1789747321650): resumen de cierre de rechazo por empresa distinta"
```

---

## Self-review (hecho al escribir el plan)

**Cobertura de la HU.** Criterio 1 (todo de la activa, igual que hoy) → Task 5 caso 1 + QA Esc. 1. Criterio 2 (trabajo distinto, rechazo total con fila) → Tasks 1+2+4 + Task 5 caso 2 + QA Esc. 2. Criterio 3 (nómina distinta, criterio propio) → misma cadena + Task 5 caso 3 + QA Esc. 3. Criterio 4 (todas las ofensoras enumeradas) → `companyMismatchRows` tras loop completo (Task 2 Step 3) + Task 5 caso 4. Criterio 5 (duplicado propio intacto) → sin tocar la rama CURP (Task 3 Step 2 lo fija) + Task 5 caso 5 + QA Esc. 4. Criterio 6 (dato protegido detiene y reporta) → Task 3 (predicado + re-lanzamiento + 403 existente) + QA con línea de no-revisable. Reglas 3 (formato) y 7 (no sanea) → nada las toca; regla 6 → rechazo antes del cupo y de la pasada 2 (Task 2 Step 5 lo aserta por posición en el archivo).

**Placeholders.** Ninguno funcional: códigos, llaves, textos es/en, SQL, asserts, mensajes y comandos van literales. Quedan solo valores de entorno local (tokens, ids públicos, stamps) y la confirmación del nombre del ayudante del seeder QA (con instrucción exacta de grep + fallback), que no pueden fijarse en un plan.

**Consistencia de tipos.** `EmployeeImportCompanyMismatchRow` definido una vez en la interfaz e importado por servicio, helper y specs. `offendingRows` viaja en `data` del 422 y en la propiedad del error con el mismo nombre. `shouldAbortImportOnRowError(error): boolean` — servicio y unitario la llaman igual. `VAL_COMPANY`/`empresa-distinta-en-archivo` idénticos en constante, helper, controlador, OpenAPI y specs.
