# Addendum — Alineación con spec técnico USRH1789747321650

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinear lo implementado (Tasks 1-6 + fix waves, rama `feature/USRH1789747321650-rechazo-carga-masiva-empresa-distinta`) con el contrato del spec técnico `/Users/noeabelvargaslopez/Downloads/spec-USRH1789747321650.md`, que manda donde afecta flujo: 409 (no 422), detección por celda cruda sin salir del scope (anti-requisito §12), tope de 20 filas, saneo del `catch` de fila, celda vacía = activa, indistinguibilidad abuso, fail-closed con empresa inactiva.

**Architecture:** Se revierte la resolución fuera del scope (`allBusinessUnitsForResolution` + caché se eliminan: el problema de nombres duplicados entre tenants desaparece por construcción al no salir nunca del scope). Ofensora = celda con contenido que no resuelve contra la lista de un elemento. El rechazo conserva su punto todo-o-nada (antes del cupo y de la pasada 2) pero con el contrato del spec (409, `archivo-de-otra-empresa`, `EMP.IMPORT.VAL_BUSINESS_UNIT`, `detail` con tope). El `catch` de fila se cierra por omisión (CA-11) conservando el rethrow sensible y la familia controlada.

**Tech Stack:** AdonisJS 6 · Lucid MySQL · ExcelJS · Japa · i18n es/en · BD desechable `sae_pruebas`

**Repo/Rama:** `gsti-rh-api` · `feature/USRH1789747321650-rechazo-carga-masiva-empresa-distinta`. No PR, no push sin petición explícita.

## Contraste spec vs implementado (fuente: spec §§4-13; manda el spec)

| # | Punto | Spec | Implementado | Veredicto |
|---|---|---|---|---|
| 1 | Status + contrato | **409**, `code:'EMP.IMPORT.VAL_BUSINESS_UNIT'`, `key:'archivo-de-otra-empresa'`, título `'El archivo tiene empleados de otra empresa'` | 422, `EMP.IMPORT.VAL_COMPANY`, `empresa-distinta-en-archivo` | **Gap → Task 7** (el BO pinta el 409 por el camino del cupo) |
| 2 | Detección | Celda cruda con contenido que **no resuelve** contra `businessUnits` (1 elemento). **PROHIBIDO salir del scope** (§12, anti-requisito: oráculo de empresas) | Resuelve scope-primero con fallback al padrón completo | **Gap → Task 8** (el fallback viola §12 aunque sea de lectura; además sobran caché y caso de nombre duplicado) |
| 3 | Celda vacía | Significa la activa, **no rechaza** (CA-8); nombre inventado/typo **sí rechaza** igual (CA-9) | Vacío y typo caen al fallback silencioso y cargan | **Gap → Task 8** (usar `hasImportCellValue` como exige zona 2) |
| 4 | `detail` | Nombra la activa, lista hasta **20 filas** y cierra con `… y N filas más` | Sin tope, otros textos | **Gap → Task 8** |
| 5 | `catch` de fila | Mensaje controlado para lo redactado por el importador; **genérico** (`'No fue posible procesar esta fila'`) para lo demás + traza al log (CA-11, DoD grep) | `error.message` crudo viaja al cliente (vía `importRowErrorMessage`) | **Gap → Task 9** |
| 6 | Empresa inactiva | `activeBusinessUnit null` → no se evalúa nada, fail-closed de hoy intacto | Sin guarda: todo lo no vacío sería ofensor | **Gap → Task 8** |
| 7 | `logger.warn` estructurado antes de lanzar | `userId` si disponible, id activa, números de fila, conteos; **nunca** nombres ni `err.message` | No existe | **Gap → Task 8** (sin `userId`: el servicio no lo tiene plumbeado; se deja constancia) |
| 8 | Bloque comentado `:2975-3014` | Borrar conservando la llave de `:3015` | Sigue ahí | **Gap → Task 8** |
| 9 | Cuota intacta (CA-7) | Aborto antes de `assertImportWithinQuota`, verificado en BD | Aborto antes del cupo (order-testeado) + cero escrituras probadas en BD | **Cubierto por construcción** (cero creados ⇒ consumo intacto; no se agrega test de billing) |
| 10 | CA-6 e2e (403 a media pasada 2) | Error sintético que aborta con 403 | Guarda instalada + unit del predicado, pero inalcanzable bajo `runUnguarded` (hallazgo verificado de revisión final) | **Superseded por arquitectura** (el 403 real es el de cabeceras, con e2e propio en verde). Requiere confirmación de Wilvardo solo si quiere el e2e literal |
| 11 | Forma interna (clase N1, factory, nombre `foreignRows`) | `employee_import_business_unit_error.ts` espejo de quota | `Error` tipado con flags + `companyMismatchRows` | **Desviación consciente**: contrato observable idéntico, cero impacto en flujo; no se migra de forma |
| 12 | Ubicación del spec funcional | `tests/functional/employees/employee_import_business_unit_mismatch.spec.ts`, casos CA-1..CA-11 nombrados | `tests/functional/services/employee_import_company_scope.spec.ts`, 6 casos | **Desviación consciente**: se agregan los casos de negocio faltantes (CA-8, CA-9, tope-20) sin renombrar archivo |

## Global Constraints (heredados + los del spec)

- Reglas 1-7 de la HU (ver plan base). Más del spec: **celda vacía = activa y no rechaza** (CA-8); **indistinguible ajena vs inexistente** (CA-9, un solo mensaje); **nunca** ids, nombres resueltos en base, "no existe" / "otro cliente", ni PII de filas en cuerpo ni log (CA-10); **409 no 400** (decisión cerrada); **no presentarlo como cierre de fuga** (encuadre §1).
- **PROHIBIDO salir del scope** para resolver o redactar: ni `business_units` completa, ni `findMostSimilar` fuera de `businessUnits`, ni nombres resueltos en base en mensajes o logs.
- `detail` con tope de 20 + `… y N filas más.`; `key` fijo kebab español; `code` punteado aparte.
- Criterio de procedencia (§7 zona 6): controlado = lo que el importador redacta; lo demás = genérico + log. **Sin manejador por tipo de excepción.**
- Sin migración, sin validators, sin `person_service`/`person`/`person_controller`, sin rutas, sin BO, sin catálogo.
- TS estricto, cero `any` nuevo; español código/comentarios; `logger` nunca `console.*`; i18n 3 claves en ambos idiomas o ninguno.
- Tests contra `sae_pruebas`; nada a `__TO_DELETE__/`; commits por archivo listado, nunca `git add -A`; no commitear pnpm-yamls ajenos.

---

## Estructura de archivos (este addendum)

| | Archivo | Responsabilidad |
|---|---|---|
| E1 | `app/constants/employee_import_error_codes.ts` | `VAL_BUSINESS_UNIT` (reemplaza `VAL_COMPANY`, que se retira) |
| E2 | `app/helpers/employee_import_api_error.ts` | Rama 409 + textos del spec + predicado intacto; saneo queda en el servicio (zona 6), no aquí |
| E3 | `app/services/employee_service.ts` | Detección cruda en scope, guarda inactiva, warn estructurado, factory con tope, passthrough intacto, catch saneado, borrado del bloque comentado |
| E4 | `app/controllers/employee_controller.ts` | Resolver con 409 + `@swagger` del 409 (reemplaza el 422) |
| E5 | `resources/langs/es.json`, `en.json` | `employee_import_val_business_unit_{title,message,detail}` (las `company_*` se retiran) |
| E6 | `tests/functional/services/employee_import_company_scope.spec.ts` | Casos CA-8, CA-9, tope-20; adaptar contrato 409; retirar caso de nombre duplicado (obsoleto por diseño) |
| E7 | `tests/unit/services/employee_import_excel_result.spec.ts` | Contenido actualizado (cruda-en-scope, sin padrón, sin `error.message` en push) |
| E8 | `tests/unit/helpers/employee_import_company_mismatch.spec.ts` | Contrato 409 + caso de tope-20 en factory |
| E9 | `tests/unit/controllers/employee_import_excel_controller.spec.ts` | 409 en OpenAPI y rama |
| QA | manual QA (mismo archivo) | Contrato 409 + escenario celda vacía; resto intacto |
| C | cierre (mismo archivo) | Reflejar 409, detección cruda y DoD del spec |

---

### Task 7: Contrato 409 (reemplaza el 422)

**Files:**
- Modify: `app/constants/employee_import_error_codes.ts` (quitar `VAL_COMPANY`, agregar `VAL_BUSINESS_UNIT: 'EMP.IMPORT.VAL_BUSINESS_UNIT'`)
- Modify: `app/helpers/employee_import_api_error.ts` (rama: status 409, `key: 'archivo-de-otra-empresa'`; textos por defecto del spec)
- Modify: `resources/langs/es.json`, `en.json` (quitar `employee_import_val_company_*`; agregar las 3 claves)
- Modify: `app/controllers/employee_controller.ts` (resolver con 409; `@swagger` 409 reemplaza 422)
- Modify: `docs/openapi.yaml` (bloque 409 reemplaza el 422: `archivo-de-otra-empresa`, `EMP.IMPORT.VAL_BUSINESS_UNIT`, `offendingRows`)
- Test: `tests/unit/helpers/employee_import_company_mismatch.spec.ts`, `tests/unit/controllers/employee_import_excel_controller.spec.ts`

**Interfaces:**
- Consumes: forma de `employeeImportQuotaExceededError` (409 todo-o-nada, *"No se aplicó ninguna línea del archivo"*).
- Produces: `resolveEmployeeImportApiError(err, 409)` → `{title:'El archivo tiene empleados de otra empresa', message, detail, status:409, errorCode:VAL_BUSINESS_UNIT, key:'archivo-de-otra-empresa', data:{offendingRows}}`. `message` = `detail` (envelope estable).

- [ ] **Step 1: Constante (reemplazo, no adición)**

En `app/constants/employee_import_error_codes.ts`, sustituir la línea de `VAL_COMPANY` por:

```ts
  /** Alguna fila declara una empresa distinta de la activa (trabajo o nómina) */
  VAL_BUSINESS_UNIT: 'EMP.IMPORT.VAL_BUSINESS_UNIT',
```

- [ ] **Step 2: i18n (3 claves por idioma, retirar las 2 anteriores)**

En `resources/langs/es.json`, sustituir el bloque `employee_import_val_company_*` por:

```json
  "employee_import_val_business_unit_title": "El archivo tiene empleados de otra empresa",
  "employee_import_val_business_unit_message": "Alguna fila del archivo declara una empresa distinta de la que tienes activa. No se procesó ninguna fila: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo.",
  "employee_import_val_business_unit_detail": "Alguna fila del archivo declara una empresa distinta de la que tienes activa. No se procesó ninguna fila: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo.",
```

Espejo en `resources/langs/en.json`:

```json
  "employee_import_val_business_unit_title": "The file contains employees from another company",
  "employee_import_val_business_unit_message": "Some row in the file declares a company different from your active one. No rows were processed: upload one file per company, or switch the active company and try again.",
  "employee_import_val_business_unit_detail": "Some row in the file declares a company different from your active one. No rows were processed: upload one file per company, or switch the active company and try again.",
```

- [ ] **Step 3: Rama del resolver (409, mismos campos)**

En `app/helpers/employee_import_api_error.ts`, sustituir la rama `isCompanyMismatchError` por status 409, `EMPLOYEE_IMPORT_ERROR_CODES.VAL_BUSINESS_UNIT`, `key: 'archivo-de-otra-empresa'`, título i18n `employee_import_val_business_unit_title` (fallback literal español) y detalle = `err.message ?? translate(..._detail...)`. El tipo `EmployeeImportValCompanyErrorData` se renombra a `EmployeeImportValBusinessUnitErrorData` (misma forma); `ResolvedEmployeeImportValFileError` no se toca.

- [ ] **Step 4: Controlador + OpenAPI (409 reemplaza 422)**

En `app/controllers/employee_controller.ts`: `resolveEmployeeImportApiError(error, 409, i18n)` en la rama existente (orden 403→409cupo→409empresa→400→500 intacto; comentario actualizado a 409). En `docs/openapi.yaml`: el bloque `'422'` se convierte en `'409'` con `key: archivo-de-otra-empresa`, `code: EMP.IMPORT.VAL_BUSINESS_UNIT` y el ejemplo del spec (fila 12/13/40 con `…`).

- [ ] **Step 5: Specs unitarios actualizados**

En `tests/unit/helpers/employee_import_company_mismatch.spec.ts`: 409, `VAL_BUSINESS_UNIT`, `archivo-de-otra-empresa`, PII-case intacto; agregar caso de tope: factory con 21 filas → `message`/`detail` contiene `… y 1 filas más.` (ver Task 8 Step 4 por el formato exacto). En `tests/unit/controllers/employee_import_excel_controller.spec.ts`: `'409':` + literales nuevos (retirar menciones al 422 de empresa).

- [ ] **Step 6: Verde + typecheck**

```bash
node ace test unit --files="employee_import_company_mismatch" --files="employee_import_excel_controller" --files="employee_import_api_error" && npm run typecheck
```

Expected: PASS y `tsc` limpio.

- [ ] **Step 7: Commit**

```bash
git add app/constants/employee_import_error_codes.ts app/helpers/employee_import_api_error.ts resources/langs/es.json resources/langs/en.json app/controllers/employee_controller.ts docs/openapi.yaml tests/unit/helpers/employee_import_company_mismatch.spec.ts tests/unit/controllers/employee_import_excel_controller.spec.ts
git commit -m "feat(USRH1789747321650): contrato 409 del spec para empresa distinta"
```

---

### Task 8: Detección cruda en scope + factory con tope + warn + limpieza (zonas 1-4)

**Files:**
- Modify: `app/services/employee_service.ts` (zonas 1-4 de §7 del spec)
- Test: `tests/unit/services/employee_import_excel_result.spec.ts` (contenido)

**Interfaces:**
- Consumes: `mapBusinessUnit(celda, businessUnits)` (siempre la lista de 1 elemento), `hasImportCellValue`, `logger` (ya importado en el servicio).
- Produces: `foreignRows: Array<{ row: number; declared: string }>` (una entrada por celda ofensora, valor tecleado); `assertImportSingleBusinessUnit(foreignRows, activeBusinessUnit)` que lanza el error tipado 409 con `offendingRows`; `logger.warn` estructurado antes de lanzar.

- [ ] **Step 1: Declaraciones (zona 1) — nombre activa sin consulta extra**

Junto a `activeBusinessUnitId` (ya existe, ahora justo antes del `for` de filas), agregar:

```ts
      // Spec §7 zona 1: el nombre de la activa sale de la lista ya filtrada
      // (un elemento). Sin consulta extra y sin rozar el anti-requisito §12.
      const activeBusinessUnit =
        businessUnits.find((unit) => unit.businessUnitId === activeBusinessUnitId) ?? null
      const foreignRows: Array<{ row: number; declared: string }> = []
```

- [ ] **Step 2: Recolección cruda por celda (zona 2) — reemplaza declaredWorkId/declaredPayrollId, el padrón completo y el caché**

Sustituir todo el bloque de comparación (desde `resolveBusinessUnitByName`/`declaredWorkId` hasta el `companyMismatchRows.push`) por, para cada columna (`businessUnit` = trabajo, `payrollBusinessUnit` = nómina):

```ts
          // Spec §7 zona 2: la comparación es sobre la celda cruda contra la
          // lista de un elemento. Comparar ids nunca detecta nada (el fallback
          // los iguala). Vacía = activa, no ofende (CA-8). Con activa
          // desconocida (inactiva/baja) no se evalúa nada: fail-closed intacto.
          if (activeBusinessUnit !== null) {
            for (const cell of [employeeData.businessUnit, employeeData.payrollBusinessUnit]) {
              const typed = String(cell ?? '').trim()
              if (
                this.hasImportCellValue(cell) &&
                this.mapBusinessUnit(cell, businessUnits) === null
              ) {
                foreignRows.push({ row: rowNumber, businessUnit: typed, payrollBusinessUnit: typed })
              }
            }
          }
```

Notas vinculantes: `companyMismatchRows`, `allBusinessUnitsForResolution`, `resolveBusinessUnitByName` y `businessUnitResolutionCache` se **eliminan** (el caché y el padrón sobran: la lista es de 1 elemento; el caso de nombre duplicado entre tenants desaparece por construcción). El tipo `EmployeeImportCompanyMismatchRow` (`{row, businessUnit, payrollBusinessUnit}`) se reutiliza poniendo el valor tecleado en ambas (una entrada por celda ofensora; el `detail` cita cada una). Los fallbacks a `businessUnits[0]` y la creación quedan byte-identicas (regla 3).

- [ ] **Step 3: Aborto + warn estructurado (zona 3 + §12)**

Sustituir el `throw this.createCompanyMismatchValidationError(companyMismatchRows)` previo al cupo por:

```ts
      // Spec §7 zona 3: todo-o-nada en el mismo punto que el cupo, antes de
      // escribir la primera fila. Sin warn estructurado no hay lanzamiento.
      if (foreignRows.length > 0) {
        logger.warn(
          {
            businessUnitId: activeBusinessUnitId,
            rows: foreignRows.map((item) => item.row),
            rowCount: foreignRows.length,
            totalRows,
          },
          'Carga masiva rechazada: el archivo declara empresas distintas de la activa'
        )
        throw this.createCompanyMismatchValidationError(foreignRows)
      }
```

(Desviación declarada: sin `userId` — el servicio no lo tiene plumbeado; nunca nombres del archivo: entrada no confiable con posible PII pegada; nunca `err.message`: `log_redact_paths` no lo cubre.)

- [ ] **Step 4: Factory con textos del spec y tope de 20**

Sustituir `createCompanyMismatchValidationError` por:

```ts
  /**
   * Rechazo todo-o-nada por empresa distinta (USRH1789747321650, spec §10).
   * `detail` con tope de 20 filas y cierre `… y N filas más.` El listado cita
   * lo que el usuario tecleó (su propio dato), nunca nada resuelto en base.
   */
  private createCompanyMismatchValidationError(
    offendingRows: EmployeeImportCompanyMismatchRow[]
  ): Error & { isCompanyMismatchError: true; statusCode: 409; offendingRows: EmployeeImportCompanyMismatchRow[] } {
    const activeName = activeBusinessUnitName // ver nota: se pasa como parámetro
    const shown = offendingRows.slice(0, 20)
    const listing = shown
      .map((item) => `fila ${item.row} («${item.businessUnit}»)`)
      .join(', ')
    const tail =
      offendingRows.length > shown.length ? ` … y ${offendingRows.length - shown.length} filas más.` : ''
    const error = new Error(
      `La empresa activa es «${activeName}». Estas filas declaran otra: ${listing}.${tail} No se aplicó ninguna línea del archivo: sube un archivo por empresa, o cambia la empresa activa y vuelve a intentarlo.`
    )
    return Object.assign(error, {
      isCompanyMismatchError: true as const,
      statusCode: 409 as const,
      offendingRows,
    })
  }
```

Nota vinculante: `activeBusinessUnitName` sale de `activeBusinessUnit.businessUnitName`; como la factory es método sin acceso al scope local, se pasa como **parámetro** (`createCompanyMismatchValidationError(offendingRows, activeName)`). El `statusCode` del error tipado pasa a 409 (el `catch` externo y el controlador leen la bandera, no el número, pero el número viaja correcto).

- [ ] **Step 5: Borrar el bloque comentado conservando la llave (zona 4)**

Borrar el bloque comentado de la pasada 2 (ancla por contenido: desde `//   if (this.hasImportCellValue(employeeData.curp)) {` con `//     const curpExists` hasta su `// }` de cierre), **conservando la llave viva que cierra el `if` anterior**. Verificación obligatoria inmediata (ningún test la atrapa):

```bash
npm run typecheck && npm run lint
```

Expected: ambos limpios.

- [ ] **Step 6: Contenido actualizado**

En `tests/unit/services/employee_import_excel_result.spec.ts`, grupo USRH1789747321650: retirar asserts de `allBusinessUnitsForResolution`/`resolveBusinessUnitByName`/caché y del `422`; agregar:

```ts
    assert.include(content, 'this.mapBusinessUnit(cell, businessUnits)')
    assert.include(content, 'hasImportCellValue(cell)')
    assert.include(content, 'activeBusinessUnit !== null')
    assert.include(content, 'logger.warn')
    assert.notInclude(content, 'allBusinessUnitsForResolution')
    assert.notMatch(content, /rowErrors\.push\(\{ row: rowNumber, message: error\.message/)
```

(la última aserción es DoD del spec: `error.message` ya no aparece en ningún `rowErrors.push` — se vuelve verde total en la Task 9.)

- [ ] **Step 7: Commit**

```bash
git add app/services/employee_service.ts tests/unit/services/employee_import_excel_result.spec.ts
git commit -m "feat(USRH1789747321650): detección cruda en scope con tope y warn según spec"
```

---

### Task 9: Saneo del catch de fila (zona 6, CA-11; W2 intacto)

**Files:**
- Modify: `app/services/employee_service.ts` (`catch` de la pasada 2)
- Test: contenido (misma E7 de la Task 8)

**Interfaces:**
- Consumes: `shouldAbortImportOnRowError` (Task 3, intacto y primero), `personIdentityDuplicatedIndexFromError` (vía `importRowErrorMessage` actual: separar).
- Produces: fila fallida con texto controlado o genérico; traza al log; el resto del archivo sigue (regla 4 extendida al catch).

- [ ] **Step 1: Cerrar por omisión (procedencia, no tipo de excepción)**

Sustituir el cuerpo del `catch` de la pasada 2 (tras el rethrow sensible) por:

```ts
          if (shouldAbortImportOnRowError(error)) throw error
          // Spec §7 zona 6 (CA-11): lo que el importador redacta viaja tal cual;
          // lo no reconocido sale genérico y su traza va al log del servidor.
          // Criterio de procedencia, no manejador por tipo: cubre por omisión
          // índices, drivers y excepciones futuras sin conocerlas.
          const controlledMessage =
            personIdentityDuplicatedIndexFromError(error) !== null
              ? importRowErrorMessage(error)
              : null
          if (controlledMessage !== null) {
            skipped++
            rowErrors.push({ row: rowNumber, message: controlledMessage })
          } else {
            logger.error(
              { err: error, row: rowNumber, businessUnitId },
              'Fila de carga masiva no procesada'
            )
            skipped++
            rowErrors.push({ row: rowNumber, message: 'No fue posible procesar esta fila' })
          }
```

Notas vinculantes: `businessUnitId` es la variable del loop (scope, nunca ajena). `'CURP duplicado'` del pre-chequeo no pasa por aquí (hace `continue` antes) y queda intacto (CA-5). `importRowErrorMessage` sigue existiendo pero ya **no** se usa como passthrough crudo. Agregar el import de `personIdentityDuplicatedIndexFromError` desde `#helpers/person_identity_api_error` (ya se importa `importRowErrorMessage` de ahí).

- [ ] **Step 2: Verde + typecheck + lint**

```bash
node ace test unit --files="employee_import_excel_result" --files="employee_import_company_mismatch" && npm run typecheck && npm run lint
```

Expected: PASS y limpios (incluida la aserción DoD de la Task 8 Step 6).

- [ ] **Step 3: Commit**

```bash
git add app/services/employee_service.ts tests/unit/services/employee_import_excel_result.spec.ts
git commit -m "fix(USRH1789747321650): sanear mensaje de fila a genérico con traza al log"
```

---

### Task 10: Funcional — CA-8, CA-9, tope-20 y re-verde total

**Files:**
- Modify: `tests/functional/services/employee_import_company_scope.spec.ts`
- (Sin producción)

**Interfaces:**
- Consumes: `importFromExcel(file, [unitAId])` + contexto sensible permitido (infra existente de la spec).
- Produces: casos CA-1 (variante vacía), CA-8, CA-9, CA-4 con 3 ofensoras, tope-20 (unitario en Task 7) + suite en verde.

- [ ] **Step 1: Adaptar contrato (409) y retirar el caso de nombre duplicado**

En la spec: `statusCode` esperado 422 → 409; `isCompanyMismatchError` intacto; el caso "tercera empresa con mismo nombre carga normal" se **retira** (obsoleto: sin salir del scope, el nombre ajeno idéntico es indistinguible del propio y carga — es CA-1, no un caso). Donde asertaba textos viejos, usar los del spec §10.

- [ ] **Step 2: Agregar CA-8 (celda vacía = activa)**

```ts
  test('CA-8 — celdas de empresa vacías: 200, la vacía significa la activa', async ({ assert, cleanup }) => {
    const beforeEmployees = await countEmployeesIn(unitA.businessUnitId)
    const result = await importAsA(
      [
        { payrollNum: `RC-E-1-${STAMP}`, workUnitName: '', payrollUnitName: '', firstName: 'Carga', lastName: 'Vacia' },
        { payrollNum: `RC-E-2-${STAMP}`, workUnitName: unitA.businessUnitName, payrollUnitName: '', firstName: 'Carga', lastName: 'Mixta' },
      ],
      cleanup
    )
    assert.equal(result.summary.created, 2)
    assert.equal(result.rowErrors.length, 0)
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployees + 2)
    // persons creadas → personIds.push (mismo patrón de criterio 1)
  })
```

(Precondición: `collectMissingRequiredImportFields` exige las columnas no vacías… **verificar al implementar**: si el validador de requeridos rechaza la celda vacía con `'Falta el campo obligatorio'`, CA-8 choca con él y el spec manda igual (celda vacía = activa). En ese caso el fix es eximir del requerido solo la evaluación de empresa, no el resto — reportarlo como hallazgo del implementador antes de tocar el validador de requeridos. No inventar: leer `collectMissingRequiredImportFields` primero.)

- [ ] **Step 3: Agregar CA-9 (indistinguible ajena vs inventada)**

```ts
  test('CA-9 — nombre real ajeno e inventado: respuestas indistinguibles', async ({ assert, cleanup }) => {
    const asAReal = await importFailsAsA([{ payrollNum: `RC-X-1-${STAMP}`, workUnitName: unitB.businessUnitName, firstName: 'Carga', lastName: 'Real' }], cleanup)
    const asAInvented = await importFailsAsA([{ payrollNum: `RC-X-2-${STAMP}`, workUnitName: `Empresa Inexistente ${STAMP}`, firstName: 'Carga', lastName: 'Fake' }], cleanup)
    // mismo statusCode (409), mismo key/code/title; detail difiere SOLO en el eco tecleado
    assert.equal(asAReal.statusCode, asAInvented.statusCode)
    // (comparar vía resolver: mismo key/code; el title/detail con el eco propio)
  })
```

(Implementar el helper `importFailsAsA` que capture el error tipado; comparar `statusCode`, y vía `resolveEmployeeImportApiError(err, 409)` el `key`/`code`/`title` idénticos. Cero escrituras en ambos.)

- [ ] **Step 4: CA-4 con tres ofensoras no consecutivas (ya existe: verificar que cita las tres)**

El caso 4 actual usa 2 ofensoras; llevarlo a **3 no consecutivas** y asertar las 3 filas en `offendingRows` y en el `detail`. El tope-20 queda en el unitario de la Task 7 (21 filas sintéticas).

- [ ] **Step 4b: CA-11 sintético (error desconocido → genérico, resto sigue)**

```ts
  test('CA-11 — excepción no reconocida en una fila: genérico + resto creado', async ({ assert, cleanup }) => {
    const beforeEmployees = await countEmployeesIn(unitA.businessUnitId)
    const result = await importAsA(
      [
        { payrollNum: `RC-U-1-${STAMP}`, workUnitName: unitA.businessUnitName, firstName: 'Carga', lastName: 'Rota', curp: 'X'.repeat(200) },
        { payrollNum: `RC-U-2-${STAMP}`, workUnitName: unitA.businessUnitName, firstName: 'Carga', lastName: 'Sana' },
      ],
      cleanup
    )
    // (Ajustar el valor rupturista a lo que realmente rompa escritura sin pasar validaciones previas: leer validatePersonData primero. Si 'X'.repeat(200) lo ataja una validación con mensaje propio, buscar otro rupturista de escritura —p. ej. dailySalary no numérico ya cae antes— y documentar cuál funcionó.)
    assert.equal(result.summary.created, 1)
    assert.equal(result.rowErrors.length, 1)
    assert.equal(result.rowErrors[0].message, 'No fue posible procesar esta fila')
    const raw = JSON.stringify(result)
    assert.notMatch(raw, /person_curp|ER_DUP_ENTRY|[0-9a-f]{64}/)
    assert.equal(await countEmployeesIn(unitA.businessUnitId), beforeEmployees + 1)
  })
```

- [ ] **Step 5: Verde total del área + typecheck**

```bash
node ace test unit --files="employee_import_excel_result" --files="employee_import_excel_bulk_performance" --files="employee_import_api_error" --files="employee_import_company_mismatch" --files="employee_import_quota" && node ace test functional --files="employee_import_company_scope" && node ace test functional --files="employees_sensitive_import_excel_http" && npm run typecheck
```

Expected: todo PASS. (La lista de 13 specs del Anexo B no está disponible en esta sesión: correr además `node ace test 2>&1 | tail -20` antes del commit y triagear.)

- [ ] **Step 6: Commit**

```bash
git add tests/functional/services/employee_import_company_scope.spec.ts
git commit -m "test(USRH1789747321650): casos CA-8, CA-9 y tope del spec técnico"
```

---

### Task 11: Manual QA + cierre alineados (sin PR, lo recorre una persona)

**Files:**
- Modify: manual QA (mismo archivo) · cierre (mismo archivo)

- [ ] **Step 1: Contrato 409 en el manual**

Sustituir en todos los escenarios de rechazo: `422` → `409`, `key: archivo-de-otra-empresa`, `code: EMP.IMPORT.VAL_BUSINESS_UNIT`, título `'El archivo tiene empleados de otra empresa'` y `detail` con la forma del spec §10 (activa + filas + `No se aplicó ninguna línea del archivo…`). Actualizar `Qué significa` del `key`/`code` (una sola vez, Escenario 2).

- [ ] **Step 2: Escenario de celda vacía (CA-8)**

Agregar escenario: archivo con ambas columnas vacías → `200`, se crea con normalidad. (Condicionado al hallazgo de la Task 10 Step 2: si el requerido bloqueó el vacío y se eximió, el manual lo refleja; si no, este escenario no existe y CA-8 queda solo en funcional.)

- [ ] **Step 3: Cierre alineado**

En el cierre: 409 + `archivo-de-otra-empresa`; detección cruda en scope con anti-requisito §12 explícito (sin padrón, sin oráculo); tope-20; saneo del catch (CA-11) con DoD grep; CA-7 por construcción (cero escrituras + aborto antes del cupo); CA-6 e2e superseded por `runUnguarded` (pendiente de confirmación Wilvardo solo si quiere el literal); lista de desviaciones conscientes (forma del error N1, ubicación del spec, `message=detail`, `data.offendingRows` aditivo, sin `userId` en el warn).

- [ ] **Step 4: Commits**

```bash
git add docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-qa-api.md
git commit -m "docs(USRH1789747321650): alinear manual QA con el spec técnico"
git add docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-cierre.md
git commit -m "docs(USRH1789747321650): alinear cierre con el spec técnico"
```

---

## Self-review (hecho al escribir el addendum)

**Cobertura del spec.** CA-1 (incluye variante vacía vía CA-8) → Tasks 8+10+11. CA-2/CA-3 (409, cero escrituras en BD incl. direcciones/contactos — el conteo de `persons`/`employees` ya existe; direcciones/contactos: el aborto precede a toda creación, cubierto por construcción) → Tasks 7+8+10. CA-4 (tres + tope-20) → Tasks 8 (factory) + 7 (unit 21 filas) + 10 (3 no consecutivas). CA-5 → intacto (pre-chequeo no lanza; N3 cubierto por caso existente). CA-6 e2e → documentado como superseded (único punto que pide confirmación). CA-7 → por construcción + orden-testeado. CA-8 → Task 10 caso nuevo (con bandera de choque con el requerido). CA-9/CA-10 → diseño crudo-en-scope + caso comparativo + warn sin nombres. CA-11 → Task 9 + DoD grep + caso sintético: **pendiente** — el plan no incluye caso funcional sintético de error desconocido; agregarlo en Task 10 Step 4b: forzar en una fila un valor que rompa escritura (p. ej. CURP larguísima que viole columna) y asertar `message:'No fue posible procesar esta fila'` + resto creado. **Se agrega como Step 4b.**

**Placeholders.** Ninguno funcional: códigos, llaves, textos, mensajes, comandos y firmas van literales. Quedan: verificación de `collectMissingRequiredImportFields` vs CA-8 (bandera explícita al implementador), `userId` no plumbeado (desviación declarada), y salidas locales (tokens, ids).

**Consistencia.** `foreignRows:{row, declared}` vs tipo reutilizado `{row, businessUnit, payrollBusinessUnit}`: el plan fija reutilizar el tipo con el valor tecleado en ambos campos (una entrada por celda). `statusCode:409` en error, rama y OpenAPI. `VAL_BUSINESS_UNIT` en constante/helper/spec/OpenAPI/manual. Tres claves i18n en ambos idiomas; retirar las `company_*`.
