# Clasificar y ocultar el salario diario sin destruirlo al guardar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el salario diario vigente quede inventariado como dato financiero, oculto para quien no tenga `sensitive-financiero-read`, y que ningún guardado de ficha ni carga masiva de Excel pueda borrarlo o ponerlo en cero cuando quien guarda no lo ve.

**Architecture:** Tres frentes inseparables. (1) **Clasificar y ocultar:** entrada en `SENSITIVE_FIELDS` + `serialize: sensitiveSerializeNumeric` en `Employee.dailySalary` — mecánica ya construida para `EmployeeSalaryHistory.salaryDaily`. (2) **Cerrar el eco destructivo:** semántica `ausente o vacío = no modificar` en `PUT /api/employees/:id`, replicando el precedente de `positionLevelConfigId`; sin esto, el backoffice que reenvía `dailySalary: null` dejaría el salario en `0` y escribiría un asiento falso en el historial. (3) **Excel:** enmascarar la celda 11 en la plantilla de descarga, ignorar celdas tapadas en la reimportación, y agregar `Salario diario` al mapa de cabeceras sensibles de USRH1787433076990 para el 403 previo a procesar filas.

**Tech Stack:** AdonisJS 6 (Lucid), `SensitiveAccessContext`, `sensitiveSerializeNumeric`, ExcelJS, `SENSITIVE_EXPORT_PLACEHOLDER` (`*****`), `valanserh-bo` (Nuxt 3, 3 archivos).

## Global Constraints

- Historia: **USRH1787433076994** · orden **38** · spec fuente: `spec-USRH1787433076994.md`. **No va a Asana.**
- Rama: `feature/USRH1787433076994-clasificar-salario-diario` · **Target:** rama de USRH1787433076990 (`feature/USRH*-escritura-sensibles-importacion`).
- **Sin migraciones. Sin seeders. Sin endpoints nuevos. Sin permisos nuevos.**
- **Dependencia dura:** USRH1787433076990 debe estar mergeada (mapa `EMPLOYEE_EXCEL_SENSITIVE_HEADERS`, `assertExcelSensitiveHeadersWritable`, `EMP.SENS.WRITE.IMPORT_FORBIDDEN`). Si falta, **parar y escalar a Wilvardo**.
- **`0` y `null` no son lo mismo.** Todo `|| 0` y `?? 0` sobre `dailySalary` en caminos de **actualización** es bug de pérdida de datos. Altas (`POST`, alta desde Excel) conservan `|| 0`.
- **Prohibido** usar `sensitiveSerialize` (cadena) en `dailySalary`: devolvería `••0.50` y filtraría magnitud. Solo `sensitiveSerializeNumeric` → `null`.
- **No tocar:** `sensitive_serialize.ts`, `sensitive_mask.ts`, `sensitive_access_context.ts`, `role_presets.ts`, `employees_permission_catalog.ts`, `EmployeeService.ts` del BO, `withSensitiveWriteGuard`, `person_controller.ts`, `position_salary_range_*`.
- **Sin tests automatizados nuevos** (regla vigente). Sí se actualizan aserciones de tests unitarios existentes que rompería el cambio. Validación principal: 8 pruebas manuales del spec.
- Código y comentarios en español; identificadores en inglés. Commits: Conventional Commits (tipo en inglés, descripción en español).
- **Deuda declarada (no resolver aquí):** cifrado en reposo de `Employee.dailySalary` (Wilvardo) · exports de asistencia con `toPay`/`discountFaults` · escritura del salario sin `withSensitiveWriteGuard` · espejos de auditoría de `PositionSalaryRangeAudit` · regresión PWA colaborador (remedio: conceder `sensitive-financiero-read` al rol).

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/constants/sensitive_fields.ts` | Entrada `Employee.dailySalary` → `financiero` / `cifrar` / `encrypted: false`; conteo encabezado 27 → 28. |
| `app/models/employee.ts` | `@column({ serialize: sensitiveSerializeNumeric(...) })` + `@swagger` de `dailySalary`. |
| `app/controllers/employee_controller.ts` | `PUT`: `dailySalary` solo si número finito en payload; `@swagger` semántica ausencia. |
| `app/services/employee_service.ts` | Eco destructivo en `update()`; helper `templateSensitiveNumericCellValue`; celda 11; guard reimportación `:3471`/`:3725`. |
| `app/constants/employee_excel_sensitive_headers.ts` | `{ header: 'Salario diario', category: 'financiero' }`. |
| `app/constants/sensitive_export_inventory.ts` | Reescribir `excludedReason` de exports de asistencia (condición activada). |
| `tests/unit/constants/employee_excel_sensitive_headers.spec.ts` | Actualizar aserción: ahora incluye `Salario diario`. |
| `tests/unit/services/sensitive_fields_catalog_service.spec.ts` | Actualizar: `categoryOf('Employee','dailySalary')` → `'financiero'`. |
| `tests/unit/helpers/sensitive_serialize.spec.ts` | Actualizar test fail-closed: con clasificación, sin permiso → `null`; con permiso → número. |
| `valanserh-bo/components/employeeInfoForm/script.ts` | Exponer `canReadFinancial`. |
| `valanserh-bo/components/employeeInfoForm/index.vue` | `:can-read="canReadFinancial"` en bloque salario. |
| `valanserh-bo/tests/employeeFormTabs/sensitive-category-bindings.spec.ts` | Aserción `:can-read="canReadFinancial"`. |

**No se crean archivos nuevos.**

---

### Task 0: Pre-vuelo — dependencias y línea base

**Files:**
- Read: `app/constants/employee_excel_sensitive_headers.ts`, `app/constants/sensitive_data_write_error_codes.ts`, `app/services/employee_service.ts:3186-3196`, `app/utils/sensitive_access_context.ts`
- Read: `app/helpers/sensitive_serialize.ts`, `app/models/employee_salary_history.ts:80-91`

**Interfaces:**
- Consumes: nada
- Produces: confirmación de que USRH1787433076990 está presente; salario de prueba anotado (p.ej. `850.50`)

- [ ] **Step 1: Verificar dependencias de USRH1787433076990**

Run:
```bash
test -f app/constants/sensitive_data_write_error_codes.ts && echo "error codes OK"
test -f app/constants/employee_excel_sensitive_headers.ts && echo "header map OK"
grep -n "assertExcelSensitiveHeadersWritable" app/services/employee_service.ts
grep -n "IMPORT_FORBIDDEN" app/constants/sensitive_data_write_error_codes.ts
```
Expected: los cuatro existen. Si falta alguno → **parar y escalar a Wilvardo**.

- [ ] **Step 2: Confirmar que `dailySalary` aún no está clasificado**

Run:
```bash
grep -n "Employee.*dailySalary\|dailySalary" app/constants/sensitive_fields.ts
grep -n "serialize" app/models/employee.ts | head -5
```
Expected: no hay entrada `Employee`/`dailySalary` en el catálogo; `employee.ts:252-253` sigue siendo `@column()` plano.

- [ ] **Step 3: Anotar anclas del eco destructivo (líneas actuales)**

| Punto | Archivo | Línea aprox. | Problema hoy |
|-------|---------|--------------|--------------|
| Controller | `employee_controller.ts` | `1561`, `1586` | `request.input('dailySalary') \|\| 0` |
| Service update | `employee_service.ts` | `814`, `841` | `employee.dailySalary \|\| 0` |
| Excel parse | `employee_service.ts` | `3471` | `parseFloat \|\| 0` |
| Excel persist | `employee_service.ts` | `3725` | `??` no filtra `0` |
| Excel export | `employee_service.ts` | `5286` | lee propiedad directa, sin máscara |

- [ ] **Step 4: Commit vacío de inicio (opcional)**

```bash
git commit --allow-empty -m "docs: Iniciar USRH1787433076994 clasificar salario diario"
```

---

### Task 1: Inventariar `Employee.dailySalary` en el catálogo

**Files:**
- Modify: `app/constants/sensitive_fields.ts:80` (conteo encabezado) y `:183-192` (bloque financiero)
- Test: `tests/unit/services/sensitive_fields_catalog_service.spec.ts:27-31`

**Interfaces:**
- Consumes: `SensitiveField`, `LegalCategory` existentes
- Produces: `SensitiveFieldsCatalogService.categoryOf('Employee', 'dailySalary')` → `'financiero'`; `pendingEncryption()` sube en 1

- [ ] **Step 1: Actualizar test existente (fallará hasta Step 3)**

En `tests/unit/services/sensitive_fields_catalog_service.spec.ts`, reemplazar el bloque que espera `null`:

```typescript
  test('Employee.dailySalary está clasificado como financiero (USRH1787433076994)', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.equal(catalog.categoryOf('Employee', 'dailySalary'), 'financiero')
  })
```

Y eliminar o reemplazar el test `'devuelve null si el par modelo/columna no está clasificado'` para que use otro campo no clasificado, p.ej.:

```typescript
  test('devuelve null si el par modelo/columna no está clasificado', ({ assert }) => {
    const catalog = new SensitiveFieldsCatalogService()
    assert.isNull(catalog.categoryOf('Person', 'personFirstname'))
    assert.isNull(catalog.categoryOf('Employee', 'employeeCode'))
  })
```

- [ ] **Step 2: Correr test — debe fallar**

Run: `node ace test tests/unit/services/sensitive_fields_catalog_service.spec.ts`
Expected: FAIL — `categoryOf('Employee', 'dailySalary')` devuelve `null`.

- [ ] **Step 3: Agregar entrada al catálogo**

En `app/constants/sensitive_fields.ts`:

1. Línea 80: cambiar `(27 columnas)` → `(28 columnas)`.

2. Insertar **antes** del bloque `EmployeeSalaryHistory` (línea ~183):

```typescript
  // ─── Employee: financiero (VIGENTE, EN CLARO — cifrado en HU aparte) ──────
  // Dato vivo del que se derivan EmployeeSalaryHistory.salaryDaily y el cálculo
  // de nómina. Se clasifica y se oculta en serialización; NO se cifra todavía
  // (decisión de Wilvardo 2026-08-22). Entra en pendingEncryption() a propósito:
  // el indicador de brecha LFPDPPP sube en 1 hasta que la HU de cifrado lo cierre.
  { model: 'Employee', column: 'dailySalary', legalCategory: 'financiero', treatment: 'cifrar', encrypted: false },
```

**Importante:** `treatment: 'cifrar'` con `encrypted: false` es deliberado — sube el indicador de brecha LFPDPPP. No usar `enmascarar`.

- [ ] **Step 4: Correr test — debe pasar**

Run: `node ace test tests/unit/services/sensitive_fields_catalog_service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/constants/sensitive_fields.ts tests/unit/services/sensitive_fields_catalog_service.spec.ts
git commit -m "feat: Inventariar Employee.dailySalary como dato financiero sensible"
```

---

### Task 2: Ocultar en serialización del modelo `Employee`

**Files:**
- Modify: `app/models/employee.ts:252-253` y `@swagger` línea ~93
- Test: `tests/unit/helpers/sensitive_serialize.spec.ts:125-142`

**Interfaces:**
- Consumes: `categoryOf('Employee', 'dailySalary')` de Task 1
- Produces: `GET /api/employees/:id` devuelve `dailySalary: null` sin `sensitive-financiero-read`; `number` con permiso

- [ ] **Step 1: Actualizar test de serialize**

En `tests/unit/helpers/sensitive_serialize.spec.ts`, reemplazar el test `'sin clasificación entrega null'` por:

```typescript
  test('Employee.dailySalary sin permiso financiero entrega null (no enmascarado por partes)', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('Employee', 'dailySalary')
    SensitiveAccessContext.run(
      {
        read: {
          identificacion: true,
          contacto: true,
          financiero: false,
          salud: true,
          biometrico: true,
        },
        write: deniedWrite,
      },
      () => {
        assert.isNull(serialize(850.5))
      }
    )
  })

  test('Employee.dailySalary con permiso financiero entrega el importe', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('Employee', 'dailySalary')
    SensitiveAccessContext.run(
      {
        read: {
          identificacion: true,
          contacto: true,
          financiero: true,
          salud: true,
          biometrico: true,
        },
        write: deniedWrite,
      },
      () => {
        assert.equal(serialize(850.5), 850.5)
        assert.equal(typeof serialize(850.5), 'number')
      }
    )
  })
```

- [ ] **Step 2: Correr test — el de permiso fallará**

Run: `node ace test tests/unit/helpers/sensitive_serialize.spec.ts`
Expected: FAIL en el test con permiso (modelo aún sin clasificación en serialize del decorador hasta Step 3, o serialize no aplicado).

- [ ] **Step 3: Aplicar `serialize` en el modelo**

En `app/models/employee.ts`:

1. Agregar import:
```typescript
import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'
```

2. Reemplazar:
```typescript
  @column()
  declare dailySalary: number
```
por:
```typescript
  @column({
    serialize: sensitiveSerializeNumeric('Employee', 'dailySalary'),
  })
  declare dailySalary: number
```

3. Actualizar `@swagger` de `dailySalary` (~línea 93):
```yaml
 *          dailySalary:
 *            type: number
 *            nullable: true
 *            description: Salario diario vigente. Sin permiso de lectura financiera se entrega null, nunca enmascarado por partes.
```

- [ ] **Step 4: Correr test — debe pasar**

Run: `node ace test tests/unit/helpers/sensitive_serialize.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/models/employee.ts tests/unit/helpers/sensitive_serialize.spec.ts
git commit -m "feat: Ocultar dailySalary en serialización según permiso financiero"
```

---

### Task 3: Cerrar el eco destructivo en `PUT` (criterio CA-2 — verificar primero)

**Files:**
- Modify: `app/controllers/employee_controller.ts:1561`, `:1573-1586`, `@swagger` ~1355
- Modify: `app/services/employee_service.ts:813-814`, `:841`
- Manual: captura de `employees.daily_salary` y `employee_salary_histories` antes/después

**Interfaces:**
- Consumes: `Employee` con `dailySalary` opcional en update (propiedad ausente = no modificar)
- Produces: `update(current, employee)` conserva salario cuando `'dailySalary' not in employee`; historial solo si cambió de verdad

- [ ] **Step 1: Corregir el controller — presencia condicional**

En `employee_controller.ts`, método `update` (~línea 1561):

**Antes:**
```typescript
      const dailySalary = request.input('dailySalary') || 0
      // ...
      const employee = {
        // ...
        dailySalary: dailySalary,
```

**Después:**
```typescript
      const dailySalaryRaw = request.input('dailySalary')
      const dailySalaryFinite =
        typeof dailySalaryRaw === 'number' && Number.isFinite(dailySalaryRaw)
          ? dailySalaryRaw
          : null
      // ...
      const employee: Record<string, unknown> = {
        // ... (campos existentes sin dailySalary)
      }
      if (dailySalaryFinite !== null) {
        employee.dailySalary = dailySalaryFinite
      }
```

Ajustar el tipo del objeto `employee` según el patrón del archivo (puede ser `Partial<Employee>` o spread condicional — seguir el estilo de `positionLevelConfigId` en `:1725-1735`).

Actualizar `@swagger` del PUT (~1355):
```yaml
 *          dailySalary:
 *            type: number
 *            description: Salario diario. Ausente, null o no numérico = no modificar. El valor 0 es válido y sí se persiste.
```

- [ ] **Step 2: Corregir el service — conservar si ausente**

En `app/services/employee_service.ts`, método `update()` (~813-841):

**Antes:**
```typescript
    const salarioAnterior = currentEmployee.dailySalary
    const salarioNuevo = employee.dailySalary || 0
    // ...
    currentEmployee.dailySalary = salarioNuevo
```

**Después:**
```typescript
    const salarioAnterior = currentEmployee.dailySalary
    const salarioNuevo =
      'dailySalary' in employee &&
      typeof employee.dailySalary === 'number' &&
      Number.isFinite(employee.dailySalary)
        ? employee.dailySalary
        : currentEmployee.dailySalary
    // ...
    if ('dailySalary' in employee &&
        typeof employee.dailySalary === 'number' &&
        Number.isFinite(employee.dailySalary)) {
      currentEmployee.dailySalary = employee.dailySalary
    }
```

El bloque `:862-870` (historial) queda intacto — recibe `salarioNuevo` efectivo; si se conservó, `salarioAnterior === salarioNuevo` → sin asiento.

**No tocar** `employee_service.ts:738` (`store`/alta) ni `:4015` (alta desde Excel).

- [ ] **Step 3: Verificación manual del eco (CA-2 — obligatoria)**

Preparar colaborador con `daily_salary = 850.50` en BD.

1. Usuario con `tab-trabajo-write` **sin** `sensitive-financiero-read`.
2. `GET /api/employees/:id` → confirmar `dailySalary: null`.
3. `PUT /api/employees/:id` con cuerpo completo incluyendo `"dailySalary": null` y un cambio en `employeeBusinessEmail`.
4. Verificar:
   - HTTP **201**
   - `employees.daily_salary` sigue `850.50`
   - `employee_salary_histories` sin filas nuevas
5. Repetir omitiendo la clave `dailySalary` del JSON → mismo resultado.
6. Usuario **con** permiso: `PUT` con `"dailySalary": 0` → persiste `0` y genera asiento.

- [ ] **Step 4: Commit**

```bash
git add app/controllers/employee_controller.ts app/services/employee_service.ts
git commit -m "fix: Conservar salario diario cuando el payload no trae valor finito"
```

---

### Task 4: Enmascarar salario en plantilla Excel de importación

**Files:**
- Modify: `app/services/employee_service.ts` — helper nuevo junto a `:4841` y celda `:5286`

**Interfaces:**
- Consumes: `SENSITIVE_EXPORT_PLACEHOLDER` de `#constants/sensitive_export_placeholder`
- Produces: `private templateSensitiveNumericCellValue(maskSensitive, value): string | number`

- [ ] **Step 1: Agregar helper numérico**

En `app/services/employee_service.ts`, junto a `templateSensitiveCellValue` (~4841):

```typescript
  /**
   * Valor numérico sensible en plantilla de importación.
   * Sin permiso de export completo se escribe el marcador `*****`.
   */
  private templateSensitiveNumericCellValue(
    maskSensitive: boolean | undefined,
    value: number | null | undefined
  ): string | number {
    if (maskSensitive) {
      return SENSITIVE_EXPORT_PLACEHOLDER
    }
    return value ?? 0
  }
```

Verificar que `SENSITIVE_EXPORT_PLACEHOLDER` ya está importado en el archivo.

- [ ] **Step 2: Usar helper en celda 11**

Reemplazar (~5286):
```typescript
        worksheet.getCell(rowNum, 11).value = emp.dailySalary ?? 0
```
por:
```typescript
        worksheet.getCell(rowNum, 11).value = this.templateSensitiveNumericCellValue(
          options?.maskSensitive,
          emp.dailySalary
        )
```

**Nota:** lee `emp.dailySalary` (propiedad del modelo), no el valor serializado — por eso el `serialize` del Task 2 no basta solo.

- [ ] **Step 3: Verificación manual (CA-3, mitad descarga)**

1. Usuario sin permiso de exportación completa → descargar plantilla.
2. Columna 11 (*Salario diario*) debe mostrar `*****` (igual que CURP/RFC/NSS).
3. Usuario con permiso → columna 11 muestra importes reales.

- [ ] **Step 4: Commit**

```bash
git add app/services/employee_service.ts
git commit -m "feat: Enmascarar salario diario en plantilla Excel de importación"
```

---

### Task 5: Guard de reimportación — celda tapada no borra salario

**Files:**
- Modify: `app/services/employee_service.ts:3470-3471`, `:3725`

**Interfaces:**
- Consumes: `hasImportCellValue(value)` existente (~4855)
- Produces: `data.dailySalary` queda `undefined` si celda vacía o `*****`; `existingEmployee.dailySalary` solo se asigna si `dailySalary` presente en `employeeData`

- [ ] **Step 1: Parse condicional en `extractEmployeeDataFromRow`**

Reemplazar (~3470-3471):
```typescript
      } else if (header.includes('salario diario')) {
        data.dailySalary = typeof rawValue === 'number' ? rawValue : (Number.parseFloat(value) || 0)
```

por:
```typescript
      } else if (header.includes('salario diario')) {
        if (this.hasImportCellValue(rawValue ?? value)) {
          const parsed =
            typeof rawValue === 'number' ? rawValue : Number.parseFloat(String(value))
          if (Number.isFinite(parsed)) {
            data.dailySalary = parsed
          }
        }
```

- [ ] **Step 2: Persist condicional en actualización desde Excel**

Reemplazar (~3725):
```typescript
    existingEmployee.dailySalary = employeeData.dailySalary ?? existingEmployee.dailySalary
```

por:
```typescript
    if (
      employeeData.dailySalary !== undefined &&
      employeeData.dailySalary !== null &&
      Number.isFinite(employeeData.dailySalary)
    ) {
      existingEmployee.dailySalary = employeeData.dailySalary
    }
```

**No tocar** `:4015` (alta desde Excel: `employeeData.dailySalary || 0`).

- [ ] **Step 3: Verificación manual (CA-3, mitad reimportación)**

1. Descargar plantilla con `*****` en columna 11 (usuario sin permiso export).
2. Editar solo códigos de nómina; no tocar columna 11.
3. Subir con usuario que **sí** tenga `sensitive-financiero-write`.
4. Verificar: códigos actualizados; ningún `daily_salary` cambió en BD.

- [ ] **Step 4: Commit**

```bash
git add app/services/employee_service.ts
git commit -m "fix: Ignorar celda tapada de salario diario en reimportación Excel"
```

---

### Task 6: Gobierno de carga masiva — cabecera `Salario diario` exige permiso financiero

**Files:**
- Modify: `app/constants/employee_excel_sensitive_headers.ts`
- Test: `tests/unit/constants/employee_excel_sensitive_headers.spec.ts`
- Test: `tests/unit/services/employee_import_sensitive_headers.spec.ts` (agregar caso financiero)

**Interfaces:**
- Consumes: `findSensitiveCategoriesInExcelHeaders`, `assertExcelSensitiveHeadersWritable` de USRH1787433076990
- Produces: archivo con cabecera *Salario diario* sin `sensitive-financiero-write` → 403 `EMP.SENS.WRITE.IMPORT_FORBIDDEN`

- [ ] **Step 1: Actualizar test del mapa de cabeceras**

En `tests/unit/constants/employee_excel_sensitive_headers.spec.ts`:

```typescript
  test('el mapa incluye las 7 cabeceras sensibles incluyendo Salario diario', ({ assert }) => {
    const headers = EMPLOYEE_EXCEL_SENSITIVE_HEADERS.map((e) => e.header)
    assert.includeMembers(headers, [
      'CURP',
      'RFC',
      'NSS',
      'Correo personal',
      'Teléfono Personal',
      'Teléfono contacto emergencia',
      'Salario diario',
    ])
  })

  test('Salario diario activa financiero', ({ assert }) => {
    const cats = findSensitiveCategoriesInExcelHeaders(['Salario diario', 'Nombre del empleado'])
    assert.deepEqual(cats, ['financiero'])
  })
```

- [ ] **Step 2: Correr test — debe fallar**

Run: `node ace test tests/unit/constants/employee_excel_sensitive_headers.spec.ts`
Expected: FAIL — `Salario diario` no está en el mapa.

- [ ] **Step 3: Agregar entrada al mapa**

En `app/constants/employee_excel_sensitive_headers.ts`, agregar al arreglo:

```typescript
  { header: 'Salario diario', category: 'financiero' as const },
```

Actualizar comentario del archivo: quitar "sin Salario diario".

- [ ] **Step 4: Agregar caso en test de import headers**

En `tests/unit/services/employee_import_sensitive_headers.spec.ts`, agregar:

```typescript
  test('Salario diario sin permiso financiero lanza IMPORT_FORBIDDEN', ({ assert }) => {
    const svc = makeServiceWithSensitiveContext({ financiero: false })
    assert.throws(
      () => svc.assertExcelSensitiveHeadersWritable(['Salario diario', 'Nombre del empleado']),
      SensitiveDataWriteError
    )
  })
```

(Ajustar al helper/factory que ya use ese archivo.)

- [ ] **Step 5: Correr tests — deben pasar**

Run:
```bash
node ace test tests/unit/constants/employee_excel_sensitive_headers.spec.ts
node ace test tests/unit/services/employee_import_sensitive_headers.spec.ts
```
Expected: PASS

- [ ] **Step 6: Verificación manual (CA-4)**

1. Usuario con `import-employees` **sin** `sensitive-financiero-write`.
2. `POST /api/employees/import-excel` con archivo que incluye cabecera *Salario diario*.
3. Verificar **403** con:
```json
{
  "title": "El archivo contiene datos sensibles que no puedes modificar",
  "detail": "El archivo incluye la columna Salario diario, que es un dato financiero. No tienes permiso para modificarlos. No se procesó ningún registro.",
  "key": "el-archivo-contiene-datos-sensibles-que-no-puedes-modificar",
  "code": "EMP.SENS.WRITE.IMPORT_FORBIDDEN"
}
```
4. Confirmar cero filas escritas en BD.
5. Mismo archivo con `sensitive-financiero-write` → 200.

- [ ] **Step 7: Commit**

```bash
git add app/constants/employee_excel_sensitive_headers.ts tests/unit/constants/employee_excel_sensitive_headers.spec.ts tests/unit/services/employee_import_sensitive_headers.spec.ts
git commit -m "feat: Exigir permiso financiero para importar columna Salario diario"
```

---

### Task 7: Declarar deuda de exports de asistencia en el inventario

**Files:**
- Modify: `app/constants/sensitive_export_inventory.ts:205-206` y `:218-219` (bloque `assists-excel-by-employee`)

**Interfaces:**
- Consumes: condición activada por entrada `Employee.dailySalary` en catálogo
- Produces: `excludedReason` actualizado — export pasa a "en alcance" pendiente de PiiExportService

- [ ] **Step 1: Reescribir `excludedReason` de `assists-excel-all`**

Reemplazar el texto de `excludedReason` (~206) para declarar explícitamente:

- `Employee.dailySalary` **ya está** en el catálogo (USRH1787433076994).
- Este export deriva `toPay`/`discountFaults` del salario real.
- La condición de `sensitive_export_inventory.ts:206` ("si se añadiera un campo del catálogo…") **se cumple**.
- **Deuda con dueño Wilvardo:** exige PiiExportService (motivo + asiento + variante enmascarada) — historia no levantada en esta corrida.
- Hasta entonces: protegido solo por gates actuales (`display-payments-summary`, `display-discounts-summary`, `see-payroll`).
- El `reportType assistance_incident_summary_payroll` no deriva montos de `dailySalary` (solo horas/conteos).

- [ ] **Step 2: Reescribir `excludedReason` de `assists-excel-by-employee`**

Mismo razonamiento, scope `single`, con nota de no-oráculo de scope.

- [ ] **Step 3: Commit**

```bash
git add app/constants/sensitive_export_inventory.ts
git commit -m "docs: Declarar deuda de exports de asistencia tras clasificar dailySalary"
```

---

### Task 8: Backoffice — la pantalla deja de mentir (repo `valanserh-bo`)

**Files (repositorio separado `valanserh-bo`):**
- Modify: `components/employeeInfoForm/script.ts:197-198`
- Modify: `components/employeeInfoForm/index.vue:366`
- Modify: `tests/employeeFormTabs/sensitive-category-bindings.spec.ts:49`

**Interfaces:**
- Consumes: `useSensitiveCategoryAccess('financiero')` ya instanciado en `script.ts:91`
- Produces: `canReadFinancial` expuesto; bloque salario usa `:can-read="canReadFinancial"`

- [ ] **Step 1: Exponer `canReadFinancial` en el setup**

En `components/employeeInfoForm/script.ts`, en el `return` del setup (~197-198), junto a `canWriteFinancial`:

```typescript
    canReadFinancial: financialAccess.canRead,
```

- [ ] **Step 2: Cablear en la plantilla**

En `components/employeeInfoForm/index.vue:366`:

```vue
:can-read="canReadFinancial"
```

(reemplazar `:can-read="true"`)

- [ ] **Step 3: Actualizar aserción del test existente**

En `tests/employeeFormTabs/sensitive-category-bindings.spec.ts:49`:

```typescript
    expect(salaryBlock).toContain(':can-read="canReadFinancial"')
```

- [ ] **Step 4: Verificación manual (CA-6)**

1. Usuario sin `sensitive-financiero-read` → pestaña Trabajo: campo salario vacío con leyenda de dato protegido (no campo mudo).
2. Con permiso → comportamiento actual: valor visible, `isDailySalaryEditable`, motivo de cambio al modificar.

- [ ] **Step 5: Commit en `valanserh-bo`**

```bash
git add components/employeeInfoForm/script.ts components/employeeInfoForm/index.vue tests/employeeFormTabs/sensitive-category-bindings.spec.ts
git commit -m "fix: Cablear lectura financiera al bloque de salario diario"
```

---

### Task 9: Swagger restante y lint

**Files:**
- Modify: `app/controllers/employee_controller.ts` — `@swagger` de `dailySalary` en create (~860) si aplica

- [ ] **Step 1: Actualizar `@swagger` del POST/create si declara `dailySalary`**

Alinear descripción con la del modelo: nullable en respuestas; en alta el valor por defecto sigue siendo `0`.

- [ ] **Step 2: Lint**

Run: `node ace lint`
Expected: limpio

- [ ] **Step 3: Commit**

```bash
git add app/controllers/employee_controller.ts
git commit -m "docs: Actualizar swagger de dailySalary tras clasificación financiera"
```

---

### Task 10: Verificación integral y notas de PR

**Files:**
- Read: Anexo C del spec — 11 grupos de rutas sin `businessScope`/`sensitiveAccess`
- Manual: las 8 pruebas del spec §Verificación técnica

- [ ] **Step 1: CA-1 — ocultamiento en GET y listado**

Usuario solo `tab-trabajo-read`, sin `sensitive-financiero-read`:
- `GET /api/employees/:id` → `dailySalary: null` (no `0`, no string enmascarado)
- Listado de colaboradores → igual
Con `sensitive-financiero-read` → `number` con valor real.

- [ ] **Step 2: CA-5 — cálculos de nómina intactos**

Usuario sin lectura financiera genera resumen de incidencias → `toPay` y `discountFaults` idénticos a antes del cambio (`assist_service.ts` lee propiedad del modelo, no serialización).

- [ ] **Step 3: Recorrido Anexo C (11 grupos — resultado literal en PR)**

Verificar cada grupo del spec:
`certifications_routes` · `employee_contract_type_routes` · `employee_record_property_routes` · `exception_request_routes` · `shift_exception_evidence_routes` · `shift_for_employees` · `supplies` · `synchronization_routes` · `system_setting_trade_name_routes` · `system_settings_employees` · `vacation_authorization_signatures_routes`

Si alguno serializa `Employee` sin contexto sensible → `dailySalary: null` para todos incluido `root`. Arreglo: montar `middleware.sensitiveAccess()` en el grupo — **nunca** relajar el contexto.

- [ ] **Step 4: PWA colaborador (prueba 7)**

`valanserh-pwa-employee` perfil propio:
- Rol actual sin `sensitive-financiero-read` → `'---'`
- Tras conceder permiso desde matriz de roles → importe visible
- Documentar remedio de configuración en notas de liberación.

- [ ] **Step 5: Deudas en el PR (obligatorio)**

Anotar las 4 deudas:
1. Cifrado en reposo de `Employee.dailySalary` (Wilvardo)
2. Exports de asistencia → PiiExportService (condición activada)
3. Escritura del salario sin comprobación de categoría en `PUT`
4. Espejos de `PositionSalaryRangeAudit` en claro

Anotar: indicador `pendingEncryption()` sube en 1 — deuda visible, no retroceso.

- [ ] **Step 6: Commit final de notas (opcional)**

```bash
git commit --allow-empty -m "docs: Verificación manual USRH1787433076994 completada"
```

---

## Self-Review

**1. Spec coverage:**

| Requisito | Task |
|-----------|------|
| RB-1 Inventariar como financiero | Task 1 |
| RB-2 Solo lectura con permiso | Tasks 1-2 |
| RB-3 Guardado sin permiso no cambia salario | Task 3 |
| RB-4 Ausente/vacío = no modificar | Task 3 |
| RB-5 Historial solo si cambió | Task 3 (lógica intacta) |
| RB-6 Plantilla tapa salario | Task 4 |
| RB-7 Celda tapada no modifica | Task 5 |
| RB-8 Import exige permiso financiero | Task 6 |
| RB-9 Cálculos usan salario real | Task 10 (verificación) |
| RB-10 Inventariado, en claro en BD | Task 1 (`encrypted: false`) |
| CA-6 Pantalla no miente | Task 8 |
| Deuda exports asistencia | Task 7 |

**2. Placeholder scan:** Sin TBD ni "implementar después". Código concreto en cada step.

**3. Type consistency:** `dailySalary` opcional en update vía `'dailySalary' in employee`; `templateSensitiveNumericCellValue` devuelve `string | number`; serialize devuelve `number | null`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-25-clasificar-salario-diario.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
