# Exigir permiso en escritura de Expediente documental y Certificaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declarar en el servidor el permiso que exige cada una de las 17 operaciones de escritura del expediente documental y de las certificaciones del colaborador, con soft-rollout (exigencia del módulo apagada), evaluación caso por caso en superficies compartidas (`/api/proceeding-files` y `/api/proceeding-file-type-property-values`), y negativa antes de guardar cualquier archivo.

**Architecture:** Se reutiliza el `PermissionGate` declarativo (orden 3), el catálogo de permisos del módulo Empleados (orden 4) y la convención de declaración de la orden 7 / Persona-Domicilio-Bancos (§4 superficie compartida). Once operaciones de dominio exclusivo del colaborador reciben `middleware.permissionGate(...)` en la ruta. Las seis escrituras compartidas de archivos genéricos y valores de propiedades **no** llevan gate en la ruta: el controlador resuelve si el documento pertenece al área `employee` y, solo entonces, exige `tab-expediente-write` / `tab-expediente-delete` vía `ensureSecondaryPermission` **antes** de `UploadService.fileUpload` y de crear/actualizar/borrar el registro. Certificaciones (ciclo del colaborador + catálogo de la empresa) usan `tab-certificaciones-write` / `tab-certificaciones-delete`. No se crean permisos nuevos, no se concede nada a roles y no se enciende la exigencia del módulo.

**Tech Stack:** AdonisJS 6, Lucid, Japa (unit + functional), `PermissionGateMiddleware` / `PermissionGateService`, `ensureSecondaryPermission`, convención en `docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md`.

## Global Constraints

- Historia: serie órdenes 8–14 del módulo Empleados; escritura de Expediente documental y Certificaciones (después de Salud/Lactancia/Incapacidades).
- No inventar slugs; no modificar `EMPLOYEES_PERMISSION_CATALOG` ni el seeder de catálogo (regla 11).
- Slugs a usar: `tab-expediente-write`, `tab-expediente-delete`, `tab-certificaciones-write`, `tab-certificaciones-delete`.
- Bypass de todas las declaraciones: `standard` (owner y root; no `super-administrador`) — regla 9.
- No encender `system_modules.system_module_permission_enforcement_active` del módulo `employees` (regla 7 / D-09).
- No conceder permisos a ningún rol (regla 8 / D-03).
- Negativa del gate = misma forma HTTP 403 de orden 3 (`PERM.DENIED` / `PERM.UNRESOLVED`) — regla 12.
- Negativa **antes** de `UploadService.fileUpload` / `deleteFile` y antes de crear/actualizar/borrar el registro (regla 4): una operación negada no deja archivos huérfanos.
- Superficie compartida: exigir Empleados **solo** si `proceeding_file_type_area_to_use === 'employee'`; áreas `aircraft`, `pilot`, `flight-attendant`, `customer`, `system-setting` quedan como hoy (regla 5).
- Fuera de alcance (deuda documentada, Wilvardo 2026-08-11): las 11 escrituras del catálogo de tipos de documento / propiedades / correos (`/api/proceeding-file-types*`, `/api/proceeding-file-type-properties*`, `/api/proceeding-file-type-emails*`). No declararles gate ni slug nuevo.
- Fuera de alcance: requisitos de certificación por puesto (`/api/positions/:positionId/certification-requirements*`) — reportar a Wilvardo para asignar dueño.
- Catálogo de certificaciones de la empresa (`POST/PUT/DELETE /api/certifications`) se gobierna con `tab-certificaciones-*` (misma sección que el ciclo del colaborador; no hay permiso separado; D-06). Pendiente de confirmación residual con Wilvardo; implementar así.
- No declarar gate en lecturas ni descargas (órdenes 15–17).
- Una misma ruta declara un solo `permissionGate`; no apilar dos gates.
- Código, comentarios y docs del cambio en español; identificadores en inglés.
- Commits: Conventional Commits, tipo en inglés, descripción en español.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/constants/employees_write_permission_declarations.ts` | Extender el mapa (65 → 76) + 2 constantes para área `employee` en superficies compartidas. |
| `app/helpers/proceeding_file_is_employee_area.ts` | Resolver si un tipo / archivo / valor de propiedad pertenece al área `employee`. |
| `start/routes/employee_record_routes.ts` | Gate en alta/edición/baja de registros dinámicos. |
| `start/routes/employee_proceeding_file_routes.ts` | Gate en alta/edición/baja del vínculo colaborador–documento. |
| `start/routes/certifications_routes.ts` | Gate en alta/edición/baja del catálogo de certificaciones. |
| `start/routes/employee_certification_upload_routes.ts` | Gate en carga y baja de comprobantes. |
| `app/controllers/proceeding_file_controller.ts` | Evaluación caso por caso en `store`/`update`/`delete` antes de subir/borrar archivo. |
| `app/controllers/proceeding_file_type_property_value_controller.ts` | Evaluación caso por caso en `store`/`update`/`delete` antes de subir archivo. |
| `tests/unit/constants/employees_write_permission_declarations.spec.ts` | Contar y mapear las 11 claves + 2 constantes. |
| `tests/unit/helpers/proceeding_file_is_employee_area.spec.ts` | Área employee vs otras; ausente → false. |
| `tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts` | Assert de strings en rutas + guards de deuda (catálogo tipos / puestos sin gate). |
| `tests/unit/controllers/proceeding_file_employee_area_permission_gate.spec.ts` | Assert de orden: `ensureSecondaryPermission` antes de `fileUpload` en el controlador. |
| `tests/functional/employees/employees_expediente_certificaciones_permission_gate.spec.ts` | Soft-rollout + matriz con exigencia ON (separación write/delete, área ajena, bypass owner/root, mensajes propios de certificación). |

**No se modifica:** catálogo, seeders de permisos, middleware, rutas de aeronaves/pilotos/sobrecargos/clientes/system-settings-proceeding-files, catálogo de tipos, requisitos por puesto, lecturas, descargas, exigencia del módulo.

### Mapa operación → clave / constante → slug (las 17)

| # | Clave o constante | HTTP | Slug | Forma |
|---|-------------------|------|------|-------|
| 1 | `createEmployeeRecord` | `POST /api/employee-records` | `tab-expediente-write` | ruta |
| 2 | `updateEmployeeRecord` | `PUT /api/employee-records/:id` | `tab-expediente-write` | ruta |
| 3 | `deleteEmployeeRecord` | `DELETE /api/employee-records/:id` | `tab-expediente-delete` | ruta |
| 4 | `createEmployeeProceedingFile` | `POST /api/employees-proceeding-files` | `tab-expediente-write` | ruta |
| 5 | `updateEmployeeProceedingFile` | `PUT /api/employees-proceeding-files/:id` | `tab-expediente-write` | ruta |
| 6 | `deleteEmployeeProceedingFile` | `DELETE /api/employees-proceeding-files/:id` | `tab-expediente-delete` | ruta |
| 7 | `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION` | `POST /api/proceeding-files` (solo área `employee`) | `tab-expediente-write` | controlador |
| 8 | `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION` | `PUT /api/proceeding-files/:id` (solo área `employee`) | `tab-expediente-write` | controlador |
| 9 | `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION` | `DELETE /api/proceeding-files/:id` (solo área `employee`) | `tab-expediente-delete` | controlador |
| 10 | `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION` | `POST /api/proceeding-file-type-property-values` (solo área `employee`) | `tab-expediente-write` | controlador |
| 11 | `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION` | `PUT /api/proceeding-file-type-property-values/:id` (solo área `employee`) | `tab-expediente-write` | controlador |
| 12 | `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION` | `DELETE /api/proceeding-file-type-property-values/:id` (solo área `employee`) | `tab-expediente-delete` | controlador |
| 13 | `createCertification` | `POST /api/certifications` | `tab-certificaciones-write` | ruta |
| 14 | `updateCertification` | `PUT /api/certifications/:id` | `tab-certificaciones-write` | ruta |
| 15 | `deleteCertification` | `DELETE /api/certifications/:id` | `tab-certificaciones-delete` | ruta |
| 16 | `createEmployeeCertificationUpload` | `POST /api/employees/:employeeId/certifications/:certificationId/uploads` | `tab-certificaciones-write` | ruta |
| 17 | `deleteEmployeeCertificationUpload` | `DELETE /api/employees/.../uploads/:employeeCertificationId` | `tab-certificaciones-delete` | ruta |

---

### Task 1: Extender declaraciones de permiso (mapa 65 → 76 + constantes)

**Files:**
- Modify: `app/constants/employees_write_permission_declarations.ts`
- Modify: `tests/unit/constants/employees_write_permission_declarations.spec.ts`

**Interfaces:**
- Consumes: `employeesStandard(action)`, `EMPLOYEES_PERMISSION_CATALOG` (solo asserts de test)
- Produces:
  - 11 claves nuevas en `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS` (ver tabla, filas con forma “ruta”)
  - `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION: PermissionGateOptions` → `tab-expediente-write`
  - `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION: PermissionGateOptions` → `tab-expediente-delete`

- [ ] **Step 1: Write the failing test**

Ampliar `tests/unit/constants/employees_write_permission_declarations.spec.ts`: cambiar el conteo a 76 y agregar el test de mapeo:

```typescript
import { test } from '@japa/runner'
import {
  EMPLOYEES_WRITE_PERMISSION_DECLARATIONS,
  EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION,
  EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION,
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION,
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION,
} from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'

test.group('EMPLOYEES_WRITE_PERMISSION_DECLARATIONS', () => {
  test('declara exactamente 76 operaciones con module employees y bypass standard', ({ assert }) => {
    const keys = Object.keys(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 76)

    const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((a) => a.slug))

    for (const key of keys) {
      const decl =
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS[
          key as keyof typeof EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
        ]
      assert.equal(decl.module, 'employees')
      assert.equal(decl.bypass, 'standard')
      assert.isTrue(catalogSlugs.has(decl.action), `slug ausente en catálogo: ${decl.action} (${key})`)
    }
  })

  // …conservar tests existentes de Persona/Domicilio/Bancos y Salud/Lactancia/Incapacidades…

  test('mapea Expediente documental y Certificaciones de escritura', ({ assert }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.createEmployeeRecord.action, 'tab-expediente-write')
    assert.equal(d.updateEmployeeRecord.action, 'tab-expediente-write')
    assert.equal(d.deleteEmployeeRecord.action, 'tab-expediente-delete')
    assert.equal(d.createEmployeeProceedingFile.action, 'tab-expediente-write')
    assert.equal(d.updateEmployeeProceedingFile.action, 'tab-expediente-write')
    assert.equal(d.deleteEmployeeProceedingFile.action, 'tab-expediente-delete')
    assert.equal(d.createCertification.action, 'tab-certificaciones-write')
    assert.equal(d.updateCertification.action, 'tab-certificaciones-write')
    assert.equal(d.deleteCertification.action, 'tab-certificaciones-delete')
    assert.equal(d.createEmployeeCertificationUpload.action, 'tab-certificaciones-write')
    assert.equal(d.deleteEmployeeCertificationUpload.action, 'tab-certificaciones-delete')

    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION.action, 'tab-expediente-write')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION.action, 'tab-expediente-delete')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION.bypass, 'standard')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION.bypass, 'standard')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION.module, 'employees')
    assert.equal(EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION.module, 'employees')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts`

Expected: FAIL (count 65 ≠ 76 y/o claves/constantes ausentes).

- [ ] **Step 3: Write minimal implementation**

En `app/constants/employees_write_permission_declarations.ts`, agregar al objeto existente (mantener las 65 claves actuales) y las dos constantes al final del archivo:

```typescript
  // …claves existentes…
  createEmployeeRecord: employeesStandard('tab-expediente-write'),
  updateEmployeeRecord: employeesStandard('tab-expediente-write'),
  deleteEmployeeRecord: employeesStandard('tab-expediente-delete'),
  createEmployeeProceedingFile: employeesStandard('tab-expediente-write'),
  updateEmployeeProceedingFile: employeesStandard('tab-expediente-write'),
  deleteEmployeeProceedingFile: employeesStandard('tab-expediente-delete'),
  createCertification: employeesStandard('tab-certificaciones-write'),
  updateCertification: employeesStandard('tab-certificaciones-write'),
  deleteCertification: employeesStandard('tab-certificaciones-delete'),
  createEmployeeCertificationUpload: employeesStandard('tab-certificaciones-write'),
  deleteEmployeeCertificationUpload: employeesStandard('tab-certificaciones-delete'),
} as const satisfies Record<string, PermissionGateOptions>

/** Permiso cuando se escribe un proceeding file / valor de propiedad del área employee. */
export const EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-expediente-write')

/** Permiso cuando se elimina un proceeding file / valor de propiedad del área employee. */
export const EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-expediente-delete')
```

Actualizar el comentario del mapa: incluir “+ Expediente/Certificaciones”.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/constants/employees_write_permission_declarations.ts \
  tests/unit/constants/employees_write_permission_declarations.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar permisos de escritura de expediente y certificaciones

EOF
)"
```

---

### Task 2: Helper `proceedingFileIsEmployeeArea`

**Files:**
- Create: `app/helpers/proceeding_file_is_employee_area.ts`
- Test: `tests/unit/helpers/proceeding_file_is_employee_area.spec.ts`

**Interfaces:**
- Consumes: tablas `proceeding_file_types`, `proceeding_files`, `proceeding_file_type_property_values` (vía `db`)
- Produces:
  - `proceedingFileTypeIsEmployeeArea(proceedingFileTypeId: number): Promise<boolean>`
  - `proceedingFileIsEmployeeArea(proceedingFileId: number): Promise<boolean>`
  - `proceedingFileTypePropertyValueIsEmployeeArea(valueId: number): Promise<boolean>`

Criterio: área `employee` → `true`. Cualquier otra área, tipo/archivo/valor ausente o soft-deleted → `false` (el controlador responde 404/400 como hoy; no se exige permiso de Empleados sobre un recurso inexistente o de otro dominio).

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  proceedingFileTypeIsEmployeeArea,
  proceedingFileIsEmployeeArea,
  proceedingFileTypePropertyValueIsEmployeeArea,
} from '#helpers/proceeding_file_is_employee_area'

test.group('proceedingFileIsEmployeeArea helpers', (group) => {
  const createdTypeIds: number[] = []
  const createdFileIds: number[] = []
  const createdValueIds: number[] = []
  const createdPropertyIds: number[] = []

  group.teardown(async () => {
    if (createdValueIds.length) {
      await db.from('proceeding_file_type_property_values').whereIn('proceeding_file_type_property_value_id', createdValueIds).delete()
    }
    if (createdPropertyIds.length) {
      await db.from('proceeding_file_type_properties').whereIn('proceeding_file_type_property_id', createdPropertyIds).delete()
    }
    if (createdFileIds.length) {
      await db.from('proceeding_files').whereIn('proceeding_file_id', createdFileIds).delete()
    }
    if (createdTypeIds.length) {
      await db.from('proceeding_file_types').whereIn('proceeding_file_type_id', createdTypeIds).delete()
    }
  })

  async function createType(area: string) {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const now = new Date()
    const insert = await db.table('proceeding_file_types').insert({
      proceeding_file_type_name: `PFType ${area} ${stamp}`,
      proceeding_file_type_slug: `pftype-${area}-${stamp}`,
      proceeding_file_type_area_to_use: area,
      proceeding_file_type_active: 1,
      proceeding_file_type_created_at: now,
      proceeding_file_type_updated_at: now,
    })
    const id = Number(insert[0])
    createdTypeIds.push(id)
    return id
  }

  async function createFile(typeId: number) {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const now = new Date()
    const insert = await db.table('proceeding_files').insert({
      proceeding_file_name: `file-${stamp}`,
      proceeding_file_path: `proceeding-files/file-${stamp}.pdf`,
      proceeding_file_type_id: typeId,
      proceeding_file_active: 1,
      proceeding_file_uuid: `uuid-${stamp}`,
      proceeding_file_created_at: now,
      proceeding_file_updated_at: now,
    })
    const id = Number(insert[0])
    createdFileIds.push(id)
    return id
  }

  test('tipo employee → true; aircraft → false; ausente → false', async ({ assert }) => {
    const employeeTypeId = await createType('employee')
    const aircraftTypeId = await createType('aircraft')
    assert.isTrue(await proceedingFileTypeIsEmployeeArea(employeeTypeId))
    assert.isFalse(await proceedingFileTypeIsEmployeeArea(aircraftTypeId))
    assert.isFalse(await proceedingFileTypeIsEmployeeArea(0))
  })

  test('archivo hereda el área de su tipo', async ({ assert }) => {
    const employeeTypeId = await createType('employee')
    const pilotTypeId = await createType('pilot')
    const employeeFileId = await createFile(employeeTypeId)
    const pilotFileId = await createFile(pilotTypeId)
    assert.isTrue(await proceedingFileIsEmployeeArea(employeeFileId))
    assert.isFalse(await proceedingFileIsEmployeeArea(pilotFileId))
    assert.isFalse(await proceedingFileIsEmployeeArea(0))
  })

  test('valor de propiedad hereda el área del proceeding file', async ({ assert }) => {
    const employeeTypeId = await createType('employee')
    const customerTypeId = await createType('customer')
    const employeeFileId = await createFile(employeeTypeId)
    const customerFileId = await createFile(customerTypeId)

    const now = new Date()
    const propInsert = await db.table('proceeding_file_type_properties').insert({
      proceeding_file_type_id: employeeTypeId,
      proceeding_file_type_property_name: `prop-${Date.now()}`,
      proceeding_file_type_property_type: 'Text',
      proceeding_file_type_property_category_name: 'Test',
      proceeding_file_type_property_created_at: now,
      proceeding_file_type_property_updated_at: now,
    })
    const propertyId = Number(propInsert[0])
    createdPropertyIds.push(propertyId)

    const empValueInsert = await db.table('proceeding_file_type_property_values').insert({
      proceeding_file_type_property_id: propertyId,
      proceeding_file_id: employeeFileId,
      proceeding_file_type_property_value_value: 'ok',
      proceeding_file_type_property_value_active: 1,
      proceeding_file_type_property_value_created_at: now,
      proceeding_file_type_property_value_updated_at: now,
    })
    const empValueId = Number(empValueInsert[0])
    createdValueIds.push(empValueId)

    const custValueInsert = await db.table('proceeding_file_type_property_values').insert({
      proceeding_file_type_property_id: propertyId,
      proceeding_file_id: customerFileId,
      proceeding_file_type_property_value_value: 'other',
      proceeding_file_type_property_value_active: 1,
      proceeding_file_type_property_value_created_at: now,
      proceeding_file_type_property_value_updated_at: now,
    })
    const custValueId = Number(custValueInsert[0])
    createdValueIds.push(custValueId)

    assert.isTrue(await proceedingFileTypePropertyValueIsEmployeeArea(empValueId))
    assert.isFalse(await proceedingFileTypePropertyValueIsEmployeeArea(custValueId))
    assert.isFalse(await proceedingFileTypePropertyValueIsEmployeeArea(0))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/helpers/proceeding_file_is_employee_area.spec.ts`

Expected: FAIL con módulo/helper no encontrado.

- [ ] **Step 3: Write minimal implementation**

Crear `app/helpers/proceeding_file_is_employee_area.ts`:

```typescript
import db from '@adonisjs/lucid/services/db'

const EMPLOYEE_AREA = 'employee'

/**
 * Indica si el tipo de proceeding file pertenece al área de colaboradores.
 * Usado por la regla de superficie compartida del PermissionGate (Expediente).
 */
export async function proceedingFileTypeIsEmployeeArea(
  proceedingFileTypeId: number
): Promise<boolean> {
  if (!Number.isInteger(proceedingFileTypeId) || proceedingFileTypeId <= 0) {
    return false
  }
  const row = await db
    .from('proceeding_file_types')
    .whereNull('proceeding_file_type_deleted_at')
    .where('proceeding_file_type_id', proceedingFileTypeId)
    .where('proceeding_file_type_area_to_use', EMPLOYEE_AREA)
    .first()
  return Boolean(row)
}

/**
 * Indica si el proceeding file pertenece al área de colaboradores (vía su tipo).
 */
export async function proceedingFileIsEmployeeArea(proceedingFileId: number): Promise<boolean> {
  if (!Number.isInteger(proceedingFileId) || proceedingFileId <= 0) {
    return false
  }
  const row = await db
    .from('proceeding_files')
    .innerJoin(
      'proceeding_file_types',
      'proceeding_files.proceeding_file_type_id',
      'proceeding_file_types.proceeding_file_type_id'
    )
    .whereNull('proceeding_files.proceeding_file_deleted_at')
    .whereNull('proceeding_file_types.proceeding_file_type_deleted_at')
    .where('proceeding_files.proceeding_file_id', proceedingFileId)
    .where('proceeding_file_types.proceeding_file_type_area_to_use', EMPLOYEE_AREA)
    .first()
  return Boolean(row)
}

/**
 * Indica si el valor de propiedad pertenece a un documento del área de colaboradores.
 */
export async function proceedingFileTypePropertyValueIsEmployeeArea(
  proceedingFileTypePropertyValueId: number
): Promise<boolean> {
  if (
    !Number.isInteger(proceedingFileTypePropertyValueId) ||
    proceedingFileTypePropertyValueId <= 0
  ) {
    return false
  }
  const row = await db
    .from('proceeding_file_type_property_values as v')
    .innerJoin('proceeding_files as f', 'v.proceeding_file_id', 'f.proceeding_file_id')
    .innerJoin(
      'proceeding_file_types as t',
      'f.proceeding_file_type_id',
      't.proceeding_file_type_id'
    )
    .whereNull('v.proceeding_file_type_property_value_deleted_at')
    .whereNull('f.proceeding_file_deleted_at')
    .whereNull('t.proceeding_file_type_deleted_at')
    .where('v.proceeding_file_type_property_value_id', proceedingFileTypePropertyValueId)
    .where('t.proceeding_file_type_area_to_use', EMPLOYEE_AREA)
    .first()
  return Boolean(row)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/helpers/proceeding_file_is_employee_area.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/helpers/proceeding_file_is_employee_area.ts \
  tests/unit/helpers/proceeding_file_is_employee_area.spec.ts
git commit -m "$(cat <<'EOF'
feat: Agregar helper para detectar proceeding file del área employee

EOF
)"
```

---

### Task 3: Cablear PermissionGate en registros dinámicos y vínculo expediente (ops 1–6)

**Files:**
- Modify: `start/routes/employee_record_routes.ts`
- Modify: `start/routes/employee_proceeding_file_routes.ts`
- Create: `tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: claves `createEmployeeRecord`…`deleteEmployeeProceedingFile`
- Produces: 6 rutas con gate después de `auth()` / `businessScope()`; GETs sin gate

- [ ] **Step 1: Write the failing route-string test**

```typescript
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('employee_record_routes — PermissionGate Expediente', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/employee_record_routes.ts'), 'utf8')
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeRecord)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeRecord)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeRecord)')
    const matches =
      content.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 3)
  })
})

test.group('employee_proceeding_file_routes — PermissionGate Expediente', () => {
  test('escrituras declaran permissionGate; index/show/download no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_proceeding_file_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeProceedingFile)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeProceedingFile)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeProceedingFile)'
    )
    const matches =
      content.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 3)
    assert.notMatch(content, /download[\s\S]{0,120}permissionGate/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts`

Expected: FAIL (rutas sin `permissionGate`).

- [ ] **Step 3: Wire the route files**

`start/routes/employee_record_routes.ts`:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_record_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeRecord))
    router
      .put('/:employeeRecordId', '#controllers/employee_record_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeRecord))
    router
      .delete('/:employeeRecordId', '#controllers/employee_record_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeRecord))
    router.get('/:employeeRecordId', '#controllers/employee_record_controller.show')
  })
  .prefix('/api/employee-records')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

`start/routes/employee_proceeding_file_routes.ts`:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get(
      '/get-expired-and-expiring',
      '#controllers/employee_proceeding_file_controller.getExpiresAndExpiring'
    )
    router.get('/', '#controllers/employee_proceeding_file_controller.index')
    router
      .post('/', '#controllers/employee_proceeding_file_controller.store')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeProceedingFile
        )
      )
    router
      .put(
        '/:employeeProceedingFileId',
        '#controllers/employee_proceeding_file_controller.update'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeProceedingFile
        )
      )
    router
      .delete(
        '/:employeeProceedingFileId',
        '#controllers/employee_proceeding_file_controller.delete'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeProceedingFile
        )
      )
    router.get(
      '/:employeeProceedingFileId',
      '#controllers/employee_proceeding_file_controller.show'
    )
    router.get(
      '/:employeeProceedingFileId/download',
      '#controllers/employee_proceeding_file_controller.download'
    )
  })
  .prefix('/api/employees-proceeding-files')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts`

Expected: PASS (los grupos de este task).

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_record_routes.ts \
  start/routes/employee_proceeding_file_routes.ts \
  tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar PermissionGate en registros y vínculo del expediente

EOF
)"
```

---

### Task 4: Cablear PermissionGate en certificaciones (ops 13–17)

**Files:**
- Modify: `start/routes/certifications_routes.ts`
- Modify: `start/routes/employee_certification_upload_routes.ts`
- Modify: `tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: `createCertification`, `updateCertification`, `deleteCertification`, `createEmployeeCertificationUpload`, `deleteEmployeeCertificationUpload`
- Produces: 5 rutas con gate; GETs de categorías/listado/historial/download-url sin gate

- [ ] **Step 1: Write the failing route-string + debt-guard tests**

Agregar al archivo de tests de rutas:

```typescript
test.group('certifications_routes — PermissionGate', () => {
  test('escrituras del catálogo declaran permissionGate; lecturas no', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/certifications_routes.ts'), 'utf8')
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createCertification)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateCertification)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteCertification)')
    const matches =
      content.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 3)
  })
})

test.group('employee_certification_upload_routes — PermissionGate', () => {
  test('carga y baja declaran permissionGate; historial y download-url no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_certification_upload_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeCertificationUpload)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeCertificationUpload)'
    )
    const matches =
      content.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 2)
    assert.notMatch(content, /download-url[\s\S]{0,160}permissionGate/)
  })
})

test.group('Deuda — catálogo de tipos y requisitos por puesto sin gate Empleados', () => {
  test('rutas del catálogo de tipos de documento no declaran permissionGate', async ({ assert }) => {
    for (const rel of [
      'start/routes/proceeding_file_type_routes.ts',
      'start/routes/proceeding_file_type_property_routes.ts',
      'start/routes/proceeding_file_type_email_routes.ts',
      'start/routes/position_certification_requirement_routes.ts',
    ]) {
      const content = await readFile(join(process.cwd(), rel), 'utf8')
      assert.notInclude(content, 'permissionGate')
      assert.notInclude(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts`

Expected: FAIL en grupos de certificaciones (deuda ya debería pasar).

- [ ] **Step 3: Wire the route files**

`start/routes/certifications_routes.ts`:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/certification-categories', '#controllers/certifications_controller.indexCategories')
    router.get('/certifications', '#controllers/certifications_controller.index')
    router
      .post('/certifications', '#controllers/certifications_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createCertification))
    router
      .put('/certifications/:id', '#controllers/certifications_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateCertification))
    router
      .delete('/certifications/:id', '#controllers/certifications_controller.destroy')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteCertification))
  })
  .prefix('/api')
  .use(middleware.auth())
```

`start/routes/employee_certification_upload_routes.ts`:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get(
      '/:employeeId/certifications/:certificationId/uploads',
      '#controllers/employee_certification_upload_controller.index'
    )
    router
      .post(
        '/:employeeId/certifications/:certificationId/uploads',
        '#controllers/employee_certification_upload_controller.store'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeCertificationUpload
        )
      )
    router.get(
      '/:employeeId/certifications/:certificationId/uploads/:employeeCertificationId/download-url',
      '#controllers/employee_certification_upload_controller.downloadUrl'
    )
    router
      .delete(
        '/:employeeId/certifications/:certificationId/uploads/:employeeCertificationId',
        '#controllers/employee_certification_upload_controller.destroy'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeCertificationUpload
        )
      )
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add start/routes/certifications_routes.ts \
  start/routes/employee_certification_upload_routes.ts \
  tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar PermissionGate en certificaciones y comprobantes

EOF
)"
```

---

### Task 5: Superficie compartida en `proceeding_file_controller` (ops 7–9)

**Files:**
- Modify: `app/controllers/proceeding_file_controller.ts`
- Create: `tests/unit/controllers/proceeding_file_employee_area_permission_gate.spec.ts`
- Modify: `tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts` (assert: ruta sin `permissionGate`)

**Interfaces:**
- Consumes: `proceedingFileTypeIsEmployeeArea`, `proceedingFileIsEmployeeArea`, `ensureSecondaryPermission`, `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION`, `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION`
- Produces: `processProceedingFileMultipartStore`, `update` y `delete` exigen permiso solo si el documento es área `employee`, y **antes** de `fileUpload` / borrado definitivo del registro

Reglas de área en `update`:
- Si el archivo actual es área `employee` → exigir write.
- Si el tipo nuevo (cuando cambia `proceedingFileTypeId`) es área `employee` → exigir write.
- Si ninguno es `employee` → no exigir Empleados.

- [ ] **Step 1: Write the failing source-order + route-guard tests**

```typescript
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('proceeding_file_controller — gate área employee antes de upload', () => {
  test('store/update/delete usan ensureSecondaryPermission y helpers de área', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/proceeding_file_controller.ts'),
      'utf8'
    )
    assert.include(content, 'ensureSecondaryPermission')
    assert.include(content, 'EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION')
    assert.include(content, 'EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION')
    assert.include(content, 'proceedingFileTypeIsEmployeeArea')
    assert.include(content, 'proceedingFileIsEmployeeArea')

    // En processProceedingFileMultipartStore, el gate debe aparecer antes del primer fileUpload
    const storeFnStart = content.indexOf('export async function processProceedingFileMultipartStore')
    const firstUpload = content.indexOf('fileUpload', storeFnStart)
    const gateInStore = content.indexOf('ensureSecondaryPermission', storeFnStart)
    assert.isTrue(storeFnStart >= 0)
    assert.isTrue(gateInStore >= 0 && gateInStore < firstUpload)

    // En update, el gate debe aparecer antes de fileUpload
    const updateStart = content.indexOf('async update(')
    const uploadInUpdate = content.indexOf('fileUpload', updateStart)
    const gateInUpdate = content.indexOf('ensureSecondaryPermission', updateStart)
    assert.isTrue(gateInUpdate >= 0 && gateInUpdate < uploadInUpdate)
  })
})

test.group('proceeding_file_routes — sin permissionGate de ruta', () => {
  test('la ruta compartida no monta permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/proceeding_file_routes.ts'),
      'utf8'
    )
    assert.notInclude(content, 'permissionGate')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/controllers/proceeding_file_employee_area_permission_gate.spec.ts`

Expected: FAIL (imports/helpers ausentes en el controlador).

- [ ] **Step 3: Write minimal implementation**

Imports a agregar en `proceeding_file_controller.ts`:

```typescript
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import {
  proceedingFileTypeIsEmployeeArea,
  proceedingFileIsEmployeeArea,
} from '#helpers/proceeding_file_is_employee_area'
import {
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION,
  EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION,
} from '#constants/employees_write_permission_declarations'
```

Cambiar la firma de `processProceedingFileMultipartStore` para conservar el `HttpContext` completo:

```typescript
export async function processProceedingFileMultipartStore(
  ctx: HttpContext,
  options?: ProceedingFileMultipartStoreOptions
) {
  const { request, response } = ctx
  // …flujo actual hasta resolver `proceedingFileType`…
```

Inmediatamente **después** de confirmar que `proceedingFileType` existe y **antes** de cualquier `fileUpload` (idealmente antes del bloque que construye `proceedingFile` / exclusividad), insertar:

```typescript
  if (await proceedingFileTypeIsEmployeeArea(proceedingFileTypeId)) {
    const allowed = await ensureSecondaryPermission(
      ctx,
      EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION
    )
    if (!allowed) {
      return
    }
  }
```

En `update`, cambiar la firma a `async update(ctx: HttpContext)` (destructurar `request`, `response`, `auth` desde `ctx`). Tras cargar `currentProceedingFile` y **antes** de `validateUsing` / `fileUpload`:

```typescript
      const nextTypeId = Number(
        request.input('proceedingFileTypeId') ?? currentProceedingFile.proceedingFileTypeId
      )
      const requiresEmployeePermission =
        (await proceedingFileIsEmployeeArea(Number(proceedingFileId))) ||
        (await proceedingFileTypeIsEmployeeArea(nextTypeId))
      if (requiresEmployeePermission) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
```

Nota: si hoy `validateUsing` ocurre antes de cargar el registro, **reordenar** para: (1) leer `proceedingFileId`, (2) cargar registro, (3) gate, (4) validar, (5) subir archivo. No cambiar mensajes ni validaciones de negocio.

En `delete`, cambiar a `async delete(ctx: HttpContext)`. Tras cargar `currentProceedingFile` y antes de `proceedingFileService.delete`:

```typescript
      if (await proceedingFileIsEmployeeArea(Number(proceedingFileId))) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION
        )
        if (!allowed) {
          return
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/controllers/proceeding_file_employee_area_permission_gate.spec.ts tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/controllers/proceeding_file_controller.ts \
  tests/unit/controllers/proceeding_file_employee_area_permission_gate.spec.ts \
  tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso de expediente en proceeding files del área employee

EOF
)"
```

---

### Task 6: Superficie compartida en valores de propiedades (ops 10–12)

**Files:**
- Modify: `app/controllers/proceeding_file_type_property_value_controller.ts`
- Modify: `tests/unit/controllers/proceeding_file_employee_area_permission_gate.spec.ts` (o archivo hermano del mismo grupo)
- Modify: `tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: `proceedingFileIsEmployeeArea`, `proceedingFileTypePropertyValueIsEmployeeArea`, `ensureSecondaryPermission`, constantes write/delete de área employee
- Produces: `store`/`update`/`delete` con gate solo para área `employee`, antes de `fileUpload`

- [ ] **Step 1: Write the failing source-order tests**

```typescript
test.group('proceeding_file_type_property_value_controller — gate área employee', () => {
  test('store/update/delete usan ensureSecondaryPermission antes de fileUpload', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/proceeding_file_type_property_value_controller.ts'),
      'utf8'
    )
    assert.include(content, 'ensureSecondaryPermission')
    assert.include(content, 'EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_WRITE_PERMISSION')
    assert.include(content, 'EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_DELETE_PERMISSION')
    assert.include(content, 'proceedingFileIsEmployeeArea')
    assert.include(content, 'proceedingFileTypePropertyValueIsEmployeeArea')

    const storeStart = content.indexOf('async store(')
    const firstUpload = content.indexOf('fileUpload', storeStart)
    const gateInStore = content.indexOf('ensureSecondaryPermission', storeStart)
    assert.isTrue(gateInStore >= 0 && gateInStore < firstUpload)
  })
})

test.group('proceeding_file_type_property_value_routes — sin permissionGate de ruta', () => {
  test('la ruta compartida no monta permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/proceeding_file_type_property_value_routes.ts'),
      'utf8'
    )
    assert.notInclude(content, 'permissionGate')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/controllers/proceeding_file_employee_area_permission_gate.spec.ts`

Expected: FAIL en el grupo de property values.

- [ ] **Step 3: Write minimal implementation**

En `store(ctx)`: leer `proceedingFileId` del input **antes** de validar/subir; si `await proceedingFileIsEmployeeArea(Number(proceedingFileId))`, llamar `ensureSecondaryPermission` con WRITE; si niega, `return`. Luego el flujo actual (validate → file opcional → create).

En `update(ctx)` / `delete(ctx)`: tras parsear el id de ruta, si `await proceedingFileTypePropertyValueIsEmployeeArea(id)`, exigir WRITE o DELETE respectivamente **antes** de `fileUpload` / `service.delete`.

No montar `permissionGate` en `start/routes/proceeding_file_type_property_value_routes.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/controllers/proceeding_file_employee_area_permission_gate.spec.ts tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/controllers/proceeding_file_type_property_value_controller.ts \
  tests/unit/controllers/proceeding_file_employee_area_permission_gate.spec.ts \
  tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso de expediente en valores de propiedades del área employee

EOF
)"
```

---

### Task 7: Pruebas funcionales — soft-rollout (exigencia OFF)

**Files:**
- Create: `tests/functional/employees/employees_expediente_certificaciones_permission_gate.spec.ts`

**Interfaces:**
- Consumes: rutas de ops 1–17 ya cableadas; flag del módulo en `false` (estado de merge)
- Produces: suite que demuestra que sin exigencia nadie recibe `PERM.DENIED` por estos gates

Patrón: copiar helpers de actor/fixture de `tests/functional/employees/employees_salud_lactancia_incapacidades_permission_gate.spec.ts` (crear BU + rol sin permisos + user + employee). No encender la exigencia en este grupo. Al teardown, no tocar el flag (debe seguir apagado).

- [ ] **Step 1: Write the failing functional soft-rollout tests**

Crear el archivo copiando el harness de
`tests/functional/employees/employees_salud_lactancia_incapacidades_permission_gate.spec.ts`
(`TenantActor`, `EmployeeFixture`, `createActor`, `cleanupActor`, `createEmployeeFixture`,
`cleanupEmployeeFixture`, `grantOnly`, `permissionId`, `createSystemActor`,
`cleanupSystemActor`, `snapshotAndClearEmployeesGrants`, `restoreEmployeesGrants`).

Fixtures adicionales en `group.setup` del soft-rollout:

```typescript
import EmployeeRecordProperty from '#models/employee_record_property'
import CertificationCategory from '#models/certification_category'
import db from '@adonisjs/lucid/services/db'

/** PDF mínimo válido (header %PDF). */
const VALID_PDF_BUFFER = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
  'utf8'
)

async function ensureEmployeeRecordProperty(): Promise<EmployeeRecordProperty> {
  const existing = await EmployeeRecordProperty.query()
    .whereNull('employee_record_property_deleted_at')
    .where('employee_record_property_type', 'Text')
    .first()
  if (existing) return existing
  return EmployeeRecordProperty.create({
    employeeRecordPropertyName: `Prop soft ${Date.now()}`,
    employeeRecordPropertyType: 'Text',
    employeeRecordPropertyCategoryName: 'Expediente soft-rollout',
  })
}

async function ensureCertificationCategory(): Promise<CertificationCategory> {
  const existing = await CertificationCategory.query()
    .where('certification_category_is_active', 1)
    .first()
  if (existing) return existing
  return CertificationCategory.create({
    certificationCategoryName: `Cat soft ${Date.now()}`,
    certificationCategoryKey: `cat-soft-${Date.now()}`,
    certificationCategoryIsActive: 1,
    certificationCategoryDisplayOrder: 999,
  })
}

async function createProceedingFileTypeForArea(area: string): Promise<number> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const now = new Date()
  const insert = await db.table('proceeding_file_types').insert({
    proceeding_file_type_name: `PFType ${area} ${stamp}`,
    proceeding_file_type_slug: `pftype-${area}-${stamp}`,
    proceeding_file_type_area_to_use: area,
    proceeding_file_type_active: 1,
    proceeding_file_type_created_at: now,
    proceeding_file_type_updated_at: now,
  })
  return Number(insert[0])
}
```

```typescript
test.group('Expediente/Certificaciones — PermissionGate soft-rollout', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  let recordProperty: EmployeeRecordProperty
  let certificationCategory: CertificationCategory
  let employeeProceedingFileTypeId: number
  const createdProceedingFileTypeIds: number[] = []

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    if (employeesModule.systemModulePermissionEnforcementActive) {
      throw new Error('Este suite de soft-rollout exige el interruptor del módulo apagado.')
    }
    actor = await createActor('employees-expediente-cert-soft')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'soft')
    recordProperty = await ensureEmployeeRecordProperty()
    certificationCategory = await ensureCertificationCategory()
    employeeProceedingFileTypeId = await createProceedingFileTypeForArea('employee')
    createdProceedingFileTypeIds.push(employeeProceedingFileTypeId)
  })

  group.teardown(async () => {
    if (createdProceedingFileTypeIds.length) {
      await db
        .from('proceeding_file_types')
        .whereIn('proceeding_file_type_id', createdProceedingFileTypeIds)
        .delete()
    }
    await cleanupEmployeeFixture(fixture)
    await cleanupActor(actor)
    const moduleAfter = await SystemModule.findOrFail(employeesModule.systemModuleId)
    if (moduleAfter.systemModulePermissionEnforcementActive) {
      throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
    }
  })

  test('con exigencia apagada, POST employee-records no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/employee-records')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture!.employee.employeeId,
        employeeRecordPropertyId: recordProperty.employeeRecordPropertyId,
        employeeRecordValue: 'soft-rollout',
        employeeRecordActive: true,
      })
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada, POST certifications no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client.post('/api/certifications').loginAs(actor!.user).json({
      name: `Cert soft ${Date.now()}`,
      categoryId: certificationCategory.certificationCategoryId,
      isExternal: false,
      renewalPeriodDays: 365,
      businessUnitIds: [actor!.businessUnit.businessUnitId],
    })
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada, POST proceeding-files área employee no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/proceeding-files')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .file('file', VALID_PDF_BUFFER, {
        filename: 'soft-rollout.pdf',
        contentType: 'application/pdf',
      })
      .field('proceedingFileTypeId', String(employeeProceedingFileTypeId))
      .field('proceedingFileName', 'soft-rollout.pdf')
      .field('proceedingFileActive', 'true')
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/functional/employees/employees_expediente_certificaciones_permission_gate.spec.ts`

Expected: FAIL hasta que existan declaraciones + gates (si Tasks 1–6 ya pasaron, este step debe pasar o fallar solo por nombres de columna de fixture; ajustar fixtures hasta verde sin encender el módulo).

- [ ] **Step 3: Adjust fixtures only (no product code)**

No cambiar producto en este task salvo bugs de wiring descubiertos; el soft-rollout debe pasar con el código de Tasks 1–6.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/functional/employees/employees_expediente_certificaciones_permission_gate.spec.ts`

Expected: PASS del grupo soft-rollout; interruptor sigue apagado.

- [ ] **Step 5: Commit**

```bash
git add tests/functional/employees/employees_expediente_certificaciones_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir soft-rollout del gate de expediente y certificaciones

EOF
)"
```

---

### Task 8: Pruebas funcionales — exigencia ON (matriz de aceptación)

**Files:**
- Modify: `tests/functional/employees/employees_expediente_certificaciones_permission_gate.spec.ts`

**Interfaces:**
- Consumes: mismo harness; enciende `systemModulePermissionEnforcementActive` solo dentro del group ON y lo apaga en `teardown` (igual que salud/lactancia)
- Produces: cobertura de las reglas de aceptación del brief

- [ ] **Step 1: Write the failing enforcement-ON tests**

Agregar un segundo `test.group('Expediente/Certificaciones — PermissionGate exigencia ON', …)` con `setup` que pone el flag en `true` y `teardown` que lo deja en `false` (lanzar error si queda encendido).

Casos mínimos (cada uno con `grantOnly` explícito). En el `setup` del grupo ON crear además:
`aircraftProceedingFileTypeId`, una certificación de la categoría de prueba (`certificationId`),
y —para los deletes— un vínculo `employees-proceeding-files` y dos uploads de cumplimiento
(usar owner temporal o servicio directo en setup; limpiar en teardown).

```typescript
async function countProceedingFilesForType(typeId: number): Promise<number> {
  const row = await db
    .from('proceeding_files')
    .whereNull('proceeding_file_deleted_at')
    .where('proceeding_file_type_id', typeId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

async function countCertificationUploads(
  employeeId: number,
  certificationId: number
): Promise<number> {
  const row = await db
    .from('employee_certifications')
    .whereNull('employee_certification_deleted_at')
    .where('employee_id', employeeId)
    .where('certification_id', certificationId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

  test('con tab-expediente-write, POST proceeding-files área employee no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-expediente-write'])
    const response = await client
      .post('/api/proceeding-files')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .file('file', VALID_PDF_BUFFER, {
        filename: 'with-write.pdf',
        contentType: 'application/pdf',
      })
      .field('proceedingFileTypeId', String(employeeProceedingFileTypeId))
      .field('proceedingFileName', 'with-write.pdf')
      .field('proceedingFileActive', 'true')
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('sin tab-expediente-write, POST proceeding-files área employee → PERM.DENIED y no crea registro', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const before = await countProceedingFilesForType(employeeProceedingFileTypeId)
    const response = await client
      .post('/api/proceeding-files')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .file('file', VALID_PDF_BUFFER, {
        filename: 'denied.pdf',
        contentType: 'application/pdf',
      })
      .field('proceedingFileTypeId', String(employeeProceedingFileTypeId))
      .field('proceedingFileName', 'denied.pdf')
      .field('proceedingFileActive', 'true')
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    const after = await countProceedingFilesForType(employeeProceedingFileTypeId)
    assert.equal(after, before)
  })

  test('POST proceeding-files área aircraft sin permiso de expediente no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .post('/api/proceeding-files')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .file('file', VALID_PDF_BUFFER, {
        filename: 'aircraft.pdf',
        contentType: 'application/pdf',
      })
      .field('proceedingFileTypeId', String(aircraftProceedingFileTypeId))
      .field('proceedingFileName', 'aircraft.pdf')
      .field('proceedingFileActive', 'true')
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })

  test('con write sin delete, DELETE employees-proceeding-files → PERM.DENIED y el vínculo permanece', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-expediente-write'])
    const response = await client
      .delete(`/api/employees-proceeding-files/${employeeProceedingFileLinkId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    const stillThere = await db
      .from('employee_proceeding_files')
      .whereNull('employee_proceeding_file_deleted_at')
      .where('employee_proceeding_file_id', employeeProceedingFileLinkId)
      .first()
    assert.isNotNull(stillThere)
  })

  test('sin tab-certificaciones-write, POST upload de cumplimiento → PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const before = await countCertificationUploads(
      fixture!.employee.employeeId,
      certificationId
    )
    const response = await client
      .post(
        `/api/employees/${fixture!.employee.employeeId}/certifications/${certificationId}/uploads`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
      .file('file', VALID_PDF_BUFFER, {
        filename: 'cert-denied.pdf',
        contentType: 'application/pdf',
      })
      .field('compliedAt', '2026-08-01')
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    const after = await countCertificationUploads(fixture!.employee.employeeId, certificationId)
    assert.equal(after, before)
  })

  test('sin tab-certificaciones-delete, DELETE upload → PERM.DENIED; historial intacto', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-certificaciones-write'])
    const before = await countCertificationUploads(
      fixture!.employee.employeeId,
      certificationId
    )
    const response = await client
      .delete(
        `/api/employees/${fixture!.employee.employeeId}/certifications/${certificationId}/uploads/${currentUploadId}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    const after = await countCertificationUploads(fixture!.employee.employeeId, certificationId)
    assert.equal(after, before)
  })

  test('con delete, borrar cumplimiento no reciente conserva el aviso propio (no PERM.*)', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [
      'tab-certificaciones-write',
      'tab-certificaciones-delete',
    ])
    const response = await client
      .delete(
        `/api/employees/${fixture!.employee.employeeId}/certifications/${certificationId}/uploads/${olderUploadId}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
    // El servicio responde el aviso de negocio (código EC_* / mensaje
    // "Solo se puede borrar el cumplimiento más reciente.").
    assert.match(JSON.stringify(response.body()), /más reciente/i)
  })

  test('owner y root evaden el gate estándar sin grants', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'employees-expediente-owner')
    const root = await createSystemActor('root', 'employees-expediente-root')
    let ownerGrants: RoleSystemPermission[] = []
    let rootGrants: RoleSystemPermission[] = []
    try {
      ownerGrants = await snapshotAndClearEmployeesGrants(owner.roleId)
      rootGrants = await snapshotAndClearEmployeesGrants(root.roleId)
      for (const systemActor of [owner, root]) {
        const response = await client
          .post('/api/certifications')
          .loginAs(systemActor.user)
          .json({
            name: `Cert bypass ${systemActor.user.userEmail}`,
            categoryId: certificationCategoryId,
            isExternal: false,
            renewalPeriodDays: 365,
            businessUnitIds: [systemActor.businessUnit.businessUnitId],
          })
        assert.notEqual(response.body()?.key, 'PERM.DENIED')
      }
    } finally {
      await restoreEmployeesGrants(ownerGrants)
      await restoreEmployeesGrants(rootGrants)
      await cleanupSystemActor(root)
      await cleanupSystemActor(owner)
    }
  })
```

- [ ] **Step 2: Run test to verify failures are the intended denials**

Run: `node ace test tests/functional/employees/employees_expediente_certificaciones_permission_gate.spec.ts`

Expected: los casos ON fallan solo si falta wiring; corregir producto si algún caso no niega o niega de más (p. ej. aircraft).

- [ ] **Step 3: Fix product gaps if any (minimal)**

Solo si un caso de aceptación falla por wiring incompleto (olvidar gate en una ruta, orden incorrecto respecto a upload). No ampliar alcance.

- [ ] **Step 4: Run full related suite**

Run:

```bash
node ace test \
  tests/unit/constants/employees_write_permission_declarations.spec.ts \
  tests/unit/helpers/proceeding_file_is_employee_area.spec.ts \
  tests/unit/routes/employees_expediente_certificaciones_permission_gate_routes.spec.ts \
  tests/unit/controllers/proceeding_file_employee_area_permission_gate.spec.ts \
  tests/functional/employees/employees_expediente_certificaciones_permission_gate.spec.ts
```

Expected: PASS; tras el suite, `system_module_permission_enforcement_active` del módulo `employees` = `false`.

- [ ] **Step 5: Commit**

```bash
git add tests/functional/employees/employees_expediente_certificaciones_permission_gate.spec.ts \
  app/controllers/proceeding_file_controller.ts \
  app/controllers/proceeding_file_type_property_value_controller.ts \
  start/routes
git commit -m "$(cat <<'EOF'
test: Cubrir exigencia ON del gate de expediente y certificaciones

EOF
)"
```

---

### Task 9: Documentar deudas fuera de alcance

**Files:**
- Create: `docs/superpowers/plans/2026-08-11-employees-proceeding-file-type-catalog-debt.md`

**Interfaces:**
- Consumes: decisión Wilvardo 2026-08-11 + exclusión de requisitos por puesto
- Produces: deuda con dueño explícita (sin slug nuevo)

- [ ] **Step 1: Write the debt note**

```markdown
# Deuda: catálogo de tipos de documento y requisitos de certificación por puesto

**Fecha:** 2026-08-11
**Historia origen:** Exigir permiso en escritura de Expediente documental y Certificaciones

## Catálogo de tipos de documento (11 escrituras)

Rutas sin gate de Empleados (a propósito):

1. `POST /api/proceeding-file-types`
2. `POST /api/proceeding-file-types/create-employee-type`
3. `POST /api/proceeding-file-types/create-system-setting-type`
4. `PUT /api/proceeding-file-types/:proceedingFileTypeId`
5. `DELETE /api/proceeding-file-types/:proceedingFileTypeId`
6. `POST /api/proceeding-file-type-properties`
7. `POST /api/proceeding-file-type-properties/create-multiple`
8. `DELETE /api/proceeding-file-type-properties/:proceedingFileTypePropertyId`
9. `POST /api/proceeding-file-type-emails`
10. `PUT /api/proceeding-file-type-emails/:proceedingFileTypeEmailId`
11. `DELETE /api/proceeding-file-type-emails/:proceedingFileTypeEmailId`

**Motivo:** catálogo compartido con aeronaves, pilotos, sobrecargos, clientes y ajustes de empresa; no existe permiso configurable de administración en el módulo Empleados; declarar un slug de colaboradores gobernaría mal un catálogo ajeno.

**Dueño / siguiente paso:** Wilvardo — gobernar cuando se decida el módulo dueño o cuando ese dominio migre al motor de permisos. No crear slug en Empleados mientras tanto.

**Confirmado:** Wilvardo, 2026-08-11.

## Requisitos de certificación por puesto

Rutas:

- `POST /api/positions/:positionId/certification-requirements`
- `DELETE /api/positions/:positionId/certification-requirements/:certificationId`

**Motivo:** tocan certificaciones pero pertenecen al catálogo de puestos; no aparecen en el esbozo del set de Empleados (órdenes 8–14).

**Dueño / siguiente paso:** asignar dueño con Wilvardo (puestos vs certificaciones).
```

- [ ] **Step 2: Verify the file exists and has no placeholders**

Run: `rg -n "TBD|TODO|implement later" docs/superpowers/plans/2026-08-11-employees-proceeding-file-type-catalog-debt.md`

Expected: sin coincidencias.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-11-employees-proceeding-file-type-catalog-debt.md
git commit -m "$(cat <<'EOF'
docs: Documentar deuda del catálogo de tipos de documento y requisitos por puesto

EOF
)"
```

---

## Self-Review

**1. Spec coverage**

| Requisito | Task |
|-----------|------|
| 17 escrituras con permiso de su sección | Tasks 1, 3–6 |
| Negativa antes de guardar archivo / sin huérfanos | Tasks 5–6 (orden source) + Task 8 (no crea registro) |
| Superficie compartida solo área `employee` | Tasks 2, 5, 6, 8 |
| Soft-rollout / interruptor apagado al merge | Tasks 7–8 teardown |
| No conceder permisos / no crear slugs | Global Constraints + Task 1 |
| Bypass standard (owner/root; no dirección general) | Task 8 |
| Catálogo tipos = deuda | Task 9 + guard Task 4 |
| Requisitos por puesto = fuera | Task 9 + guard Task 4 |
| Catálogo certificaciones con `tab-certificaciones-*` | Tasks 1, 4, 8 |
| Forma de negativa idéntica; avisos propios intactos | Task 8 (caso “solo el más reciente”) |
| Quien tiene permiso no nota diferencia | soft-rollout + casos con permiso ON |

**2. Placeholder scan:** sin TBD/TODO genéricos; pasos con código o asserts concretos; payloads HTTP de Tasks 7–8 alineados a `createCertificationValidator` / multipart de proceeding files.

**3. Type consistency:** claves del mapa, constantes `EMPLOYEES_PROCEEDING_FILE_EMPLOYEE_AREA_*`, helpers `proceedingFile*IsEmployeeArea` y slugs `tab-expediente-*` / `tab-certificaciones-*` alineados entre tasks.
