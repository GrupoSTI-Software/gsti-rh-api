# Exigir permiso en escritura de Persona, Domicilio y Bancos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declarar en el servidor el permiso que exige cada una de las 19 operaciones de escritura de datos personales, domicilio y datos bancarios del colaborador, con soft-rollout (exigencia del módulo apagada) y evaluación caso por caso en la superficie compartida `/api/persons`.

**Architecture:** Se reutiliza el `PermissionGate` declarativo (orden 3), el catálogo de permisos del módulo Empleados (orden 4) y la convención de declaración de la orden 7. Diecisiete operaciones de dominio exclusivo del colaborador reciben `middleware.permissionGate(...)` en la ruta. Las dos escrituras de `Person` (`PUT`/`DELETE /api/persons/:personId`) no llevan gate en la ruta: el controlador resuelve si la persona está ligada a un colaborador no eliminado y, solo entonces, exige `tab-persona-write` / `tab-persona-delete` vía `ensureSecondaryPermission` (reglas 6 y 7). No se crean permisos nuevos, no se concede nada a roles y no se enciende la exigencia del módulo.

**Tech Stack:** AdonisJS 6, Lucid, Japa (unit + functional), `PermissionGateMiddleware` / `PermissionGateService`, convención en `docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md`.

## Global Constraints

- Historia: USRH1785766406725 serie órdenes 8–14; esta es la de Persona / Domicilio / Bancos (escritura).
- No inventar slugs; no modificar `EMPLOYEES_PERMISSION_CATALOG` ni el seeder de catálogo (regla 16).
- Slugs a usar: `tab-persona-write`, `tab-persona-delete`, `tab-domicilio-write`, `tab-domicilio-delete`, `tab-bancos-write`, `tab-bancos-delete`.
- Bypass de todas las declaraciones: `standard` (owner y root; no `super-administrador`) — regla 13.
- No encender `system_modules.system_module_permission_enforcement_active` del módulo `employees` (regla 10).
- No conceder permisos a ningún rol (regla 12).
- No tocar importación Excel (`import-employees` ya declarado en orden 7; regla 9).
- No agregar `businessScope` donde hoy no existe (`/api/address`, `/api/persons`) — regla 14.
- Negativa = misma forma HTTP 403 de orden 3 (`PERM.DENIED` / `PERM.UNRESOLVED`) — regla 17.
- Negativa antes de validar el cuerpo cuando el permiso aplica — regla 8.
- Código, comentarios y docs del cambio en español; identificadores en inglés.
- Commits: Conventional Commits, tipo en inglés, descripción en español.
- Pendiente abierto con Wilvardo (tratar colaborador dado de baja): hasta que decida lo contrario, **sí exigir** el permiso si existe fila en `employees` con `employee_deleted_at IS NULL`, aunque tenga fecha de baja (`employee_terminated_date`). Solo la baja lógica (soft-delete del colaborador) deja de exigir.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/constants/employees_write_permission_declarations.ts` | Extender el mapa con las 17 declaraciones de ruta + 2 constantes para Persona colaborador. |
| `docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md` | Agregar §4: criterio de superficie compartida (regla 7) para órdenes 10–14. |
| `app/helpers/person_is_collaborator.ts` | Resolver si un `personId` corresponde a colaborador no eliminado. |
| `start/routes/address_routes.ts` | Gate en alta/edición de contenido de domicilio. |
| `start/routes/employee_address_routes.ts` | Gate en alta/edición/baja del vínculo domicilio–colaborador. |
| `start/routes/employee_bank_routes.ts` | Gate en alta/edición/baja de datos bancarios. |
| `start/routes/employee_children_routes.ts` | Gate en alta/edición/baja de hijos (`tab-persona-*`). |
| `start/routes/employee_spouse_routes.ts` | Gate en alta/edición/baja de cónyuge (`tab-persona-*`). |
| `start/routes/employee_emergency_contact_routes.ts` | Gate en alta/edición/baja de contactos de emergencia (`tab-persona-*`). |
| `app/controllers/person_controller.ts` | Evaluación caso por caso en `update`/`delete` antes de validar. |
| `tests/unit/constants/employees_write_permission_declarations.spec.ts` | Contar y mapear las nuevas claves. |
| `tests/unit/helpers/person_is_collaborator.spec.ts` | Colaborador activo, dado de baja (terminated), soft-deleted, cliente, sin vínculo. |
| `tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts` | Assert de strings en archivos de rutas. |
| `tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts` | Soft-rollout + matriz con exigencia ON (separación de permisos, cliente vs colaborador, denial-before-validation). |

**No se modifica:** catálogo, seeders de permisos, middleware, import Excel, rutas de pilotos/sobrecargos (reutilizan `/api/persons`), lectura, backoffice, exigencia del módulo.

---

### Task 1: Extender declaraciones de permiso (mapa + constantes Persona)

**Files:**
- Modify: `app/constants/employees_write_permission_declarations.ts`
- Modify: `tests/unit/constants/employees_write_permission_declarations.spec.ts`

**Interfaces:**
- Consumes: `employeesStandard(action)`, `EMPLOYEES_PERMISSION_CATALOG` (solo para asserts de test)
- Produces:
  - 17 claves nuevas en `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS` (ver lista abajo)
  - `EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION: PermissionGateOptions` → `tab-persona-write`
  - `EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION: PermissionGateOptions` → `tab-persona-delete`

- [ ] **Step 1: Write the failing test**

Reemplazar/ampliar `tests/unit/constants/employees_write_permission_declarations.spec.ts`:

```typescript
import { test } from '@japa/runner'
import {
  EMPLOYEES_WRITE_PERMISSION_DECLARATIONS,
  EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION,
  EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION,
} from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'

test.group('EMPLOYEES_WRITE_PERMISSION_DECLARATIONS', () => {
  test('declara exactamente 40 operaciones con module employees y bypass standard', ({ assert }) => {
    const keys = Object.keys(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 40)

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

  test('mapea Persona, Domicilio y Bancos de escritura', ({ assert }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.createAddress.action, 'tab-domicilio-write')
    assert.equal(d.updateAddress.action, 'tab-domicilio-write')
    assert.equal(d.createEmployeeAddress.action, 'tab-domicilio-write')
    assert.equal(d.updateEmployeeAddress.action, 'tab-domicilio-write')
    assert.equal(d.deleteEmployeeAddress.action, 'tab-domicilio-delete')
    assert.equal(d.createEmployeeBank.action, 'tab-bancos-write')
    assert.equal(d.updateEmployeeBank.action, 'tab-bancos-write')
    assert.equal(d.deleteEmployeeBank.action, 'tab-bancos-delete')
    assert.equal(d.createEmployeeChild.action, 'tab-persona-write')
    assert.equal(d.updateEmployeeChild.action, 'tab-persona-write')
    assert.equal(d.deleteEmployeeChild.action, 'tab-persona-delete')
    assert.equal(d.createEmployeeSpouse.action, 'tab-persona-write')
    assert.equal(d.updateEmployeeSpouse.action, 'tab-persona-write')
    assert.equal(d.deleteEmployeeSpouse.action, 'tab-persona-delete')
    assert.equal(d.createEmployeeEmergencyContact.action, 'tab-persona-write')
    assert.equal(d.updateEmployeeEmergencyContact.action, 'tab-persona-write')
    assert.equal(d.deleteEmployeeEmergencyContact.action, 'tab-persona-delete')
    assert.equal(EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION.action, 'tab-persona-write')
    assert.equal(EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION.action, 'tab-persona-delete')
    assert.equal(EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION.bypass, 'standard')
    assert.equal(EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION.bypass, 'standard')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts`

Expected: FAIL (count 23 ≠ 40 y/o exports ausentes).

- [ ] **Step 3: Write minimal implementation**

En `app/constants/employees_write_permission_declarations.ts`, agregar al objeto existente (mantener las 23 claves actuales) y exportar las dos constantes:

```typescript
  // …claves existentes de la orden 7…
  createAddress: employeesStandard('tab-domicilio-write'),
  updateAddress: employeesStandard('tab-domicilio-write'),
  createEmployeeAddress: employeesStandard('tab-domicilio-write'),
  updateEmployeeAddress: employeesStandard('tab-domicilio-write'),
  deleteEmployeeAddress: employeesStandard('tab-domicilio-delete'),
  createEmployeeBank: employeesStandard('tab-bancos-write'),
  updateEmployeeBank: employeesStandard('tab-bancos-write'),
  deleteEmployeeBank: employeesStandard('tab-bancos-delete'),
  createEmployeeChild: employeesStandard('tab-persona-write'),
  updateEmployeeChild: employeesStandard('tab-persona-write'),
  deleteEmployeeChild: employeesStandard('tab-persona-delete'),
  createEmployeeSpouse: employeesStandard('tab-persona-write'),
  updateEmployeeSpouse: employeesStandard('tab-persona-write'),
  deleteEmployeeSpouse: employeesStandard('tab-persona-delete'),
  createEmployeeEmergencyContact: employeesStandard('tab-persona-write'),
  updateEmployeeEmergencyContact: employeesStandard('tab-persona-write'),
  deleteEmployeeEmergencyContact: employeesStandard('tab-persona-delete'),
} as const satisfies Record<string, PermissionGateOptions>

/** Permiso cuando se editan datos personales de una persona ligada a colaborador. */
export const EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-persona-write')

/** Permiso cuando se borra una persona ligada a colaborador. */
export const EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION: PermissionGateOptions =
  employeesStandard('tab-persona-delete')
```

Actualizar el comentario del mapa: ya no son “23 operaciones”, sino el mapa acumulado de escrituras del módulo Empleados (orden 7 + Persona/Domicilio/Bancos).

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/constants/employees_write_permission_declarations.ts \
  tests/unit/constants/employees_write_permission_declarations.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar permisos de escritura de Persona, Domicilio y Bancos

EOF
)"
```

---

### Task 2: Documentar el criterio de superficie compartida (regla 7)

**Files:**
- Modify: `docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md`

**Interfaces:**
- Consumes: convención §§1–3 existente
- Produces: §4 que las órdenes 10–14 deben copiar sin reinterpretar

- [ ] **Step 1: Write the documentation section**

Agregar al final del archivo de convención:

```markdown
## 4. Superficie de escritura compartida con otros dominios

Cuando una misma operación HTTP sirve a varios dominios del producto
(p. ej. `PUT /api/persons/:personId` sirve a colaborador, cliente y usuario)
y **no** existe una acción del módulo Empleados que aplique a los demás dominios:

1. **No** declarar `permissionGate` sobre la ruta completa.
2. Resolver caso por caso si el registro tocado corresponde a un colaborador
   (vínculo `employees.person_id` con `employee_deleted_at IS NULL`).
3. Si corresponde a colaborador, exigir el permiso del módulo Empleados con
   `ensureSecondaryPermission` (mismo `PermissionGateService.evaluate`,
   mismo interruptor de módulo, mismo bypass del catálogo, misma respuesta 403).
4. Si no corresponde a colaborador, no exigir permiso de Empleados: la operación
   sigue como hoy para ese dominio.
5. Evaluar el permiso **antes** de validar el cuerpo de la petición cuando el
   caso colaborador aplica, para no revelar reglas de validación de una sección
   a la que no se tiene acceso.

Ejemplo canónico: escritura de datos personales de `Person` — exige
`tab-persona-write` / `tab-persona-delete` solo si la persona está ligada a
un colaborador. Pilotos y sobrecargos son colaboradores (tienen fila en
`employees`), así que quedan cubiertos aunque se editen desde otra pantalla.
La persona de un cliente no queda cubierta.
```

- [ ] **Step 2: Verify the file renders coherently**

Run: `wc -l docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md`

Expected: archivo con §§1–4; sin placeholders.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md
git commit -m "$(cat <<'EOF'
docs: Documentar criterio de superficie compartida en PermissionGate

EOF
)"
```

---

### Task 3: Helper `personIsCollaborator`

**Files:**
- Create: `app/helpers/person_is_collaborator.ts`
- Test: `tests/unit/helpers/person_is_collaborator.spec.ts`

**Interfaces:**
- Consumes: modelo `Employee` (query Lucid)
- Produces: `personIsCollaborator(personId: number): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import Employee from '#models/employee'
import BusinessUnit from '#models/business_unit'
import { personIsCollaborator } from '#helpers/person_is_collaborator'

test.group('personIsCollaborator', (group) => {
  let businessUnitId: number
  const createdPersonIds: number[] = []
  const createdEmployeeIds: number[] = []
  const createdDepartmentIds: number[] = []
  const createdPositionIds: number[] = []

  group.setup(async () => {
    const bu = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_active', 1)
      .firstOrFail()
    businessUnitId = bu.businessUnitId
  })

  group.teardown(async () => {
    if (createdEmployeeIds.length) {
      await db.from('employees').whereIn('employee_id', createdEmployeeIds).delete()
    }
    if (createdPositionIds.length) {
      await db.from('positions').whereIn('position_id', createdPositionIds).delete()
    }
    if (createdDepartmentIds.length) {
      await db.from('departments').whereIn('department_id', createdDepartmentIds).delete()
    }
    if (createdPersonIds.length) {
      await Person.query().whereIn('person_id', createdPersonIds).delete()
    }
  })

  async function createPerson(prefix: string) {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const person = await Person.create({
      personFirstname: 'Helper',
      personLastname: 'Collaborator',
      personSecondLastname: prefix,
      personEmail: `person-collab-${prefix}-${stamp}@gsti-tests.local`,
    })
    createdPersonIds.push(person.personId)
    return person
  }

  async function createEmployeeFor(personId: number, prefix: string, opts?: { terminated?: boolean; softDeleted?: boolean }) {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const now = new Date()
    const departmentInsert = await db.table('departments').insert({
      department_sync_id: stamp,
      department_code: `DEP-PIC-${stamp}`,
      department_name: `Dep ${prefix}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      department_active: 1,
      department_created_at: now,
    })
    const departmentId = Number(departmentInsert[0])
    createdDepartmentIds.push(departmentId)
    const positionInsert = await db.table('positions').insert({
      position_sync_id: stamp,
      position_code: `POS-PIC-${stamp}`,
      position_name: `Pos ${prefix}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      position_active: 1,
      position_created_at: now,
    })
    const positionId = Number(positionInsert[0])
    createdPositionIds.push(positionId)
    const employeeInsert = await db.table('employees').insert({
      employee_sync_id: `EMP-PIC-${stamp}`,
      employee_code: `EMP-PIC-${stamp}`,
      employee_first_name: 'Helper',
      employee_last_name: 'Collaborator',
      employee_second_last_name: prefix,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      department_id: departmentId,
      position_id: positionId,
      person_id: personId,
      employee_type_id: 1,
      employee_work_schedule: 'Onsite',
      employee_business_email: `emp-pic-${prefix}-${stamp}@gsti-tests.local`,
      employee_terminated_date: opts?.terminated ? '2024-01-15' : null,
      employee_deleted_at: opts?.softDeleted ? now : null,
      employee_created_at: now,
    })
    const employeeId = Number(employeeInsert[0])
    createdEmployeeIds.push(employeeId)
    return employeeId
  }

  test('retorna true si hay colaborador no eliminado', async ({ assert }) => {
    const person = await createPerson('active')
    await createEmployeeFor(person.personId, 'active')
    assert.isTrue(await personIsCollaborator(person.personId))
  })

  test('retorna true si el colaborador tiene baja operativa pero no soft-delete (decisión interim)', async ({
    assert,
  }) => {
    const person = await createPerson('term')
    await createEmployeeFor(person.personId, 'term', { terminated: true })
    assert.isTrue(await personIsCollaborator(person.personId))
  })

  test('retorna false si el colaborador está soft-deleted', async ({ assert }) => {
    const person = await createPerson('soft')
    await createEmployeeFor(person.personId, 'soft', { softDeleted: true })
    assert.isFalse(await personIsCollaborator(person.personId))
  })

  test('retorna false si no hay vínculo con colaborador', async ({ assert }) => {
    const person = await createPerson('orphan')
    assert.isFalse(await personIsCollaborator(person.personId))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/helpers/person_is_collaborator.spec.ts`

Expected: FAIL con módulo/helper no encontrado.

- [ ] **Step 3: Write minimal implementation**

Crear `app/helpers/person_is_collaborator.ts`:

```typescript
import Employee from '#models/employee'

/**
 * Indica si la persona está ligada a un colaborador no eliminado.
 * Usado por la regla de superficie compartida del PermissionGate (Persona).
 * Incluye colaboradores con baja operativa; excluye soft-delete.
 */
export async function personIsCollaborator(personId: number): Promise<boolean> {
  const employee = await Employee.query()
    .whereNull('employee_deleted_at')
    .where('person_id', personId)
    .first()
  return employee !== null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/helpers/person_is_collaborator.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/helpers/person_is_collaborator.ts tests/unit/helpers/person_is_collaborator.spec.ts
git commit -m "$(cat <<'EOF'
feat: Agregar helper para detectar persona ligada a colaborador

EOF
)"
```

---

### Task 4: Declarar PermissionGate en rutas de Domicilio

**Files:**
- Modify: `start/routes/address_routes.ts`
- Modify: `start/routes/employee_address_routes.ts`
- Test: `tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts` (crear; este task solo agrega el grupo Domicilio)

**Interfaces:**
- Consumes: `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createAddress|updateAddress|createEmployeeAddress|updateEmployeeAddress|deleteEmployeeAddress`
- Produces: 5 rutas con gate después de `auth()` (y `businessScope()` donde ya exista)

- [ ] **Step 1: Write the failing route-string test**

Crear `tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('address_routes — PermissionGate Domicilio', () => {
  test('alta y edición de contenido declaran permissionGate', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/address_routes.ts'), 'utf8')
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createAddress)')
    assert.include(content, 'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateAddress)')
  })
})

test.group('employee_address_routes — PermissionGate Domicilio', () => {
  test('vínculo domicilio–colaborador declara permissionGate en escrituras', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_address_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAddress)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAddress)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAddress)'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`

Expected: FAIL (strings ausentes).

- [ ] **Step 3: Wire route gates**

`start/routes/address_routes.ts`:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/address_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createAddress))
    router
      .put('/:addressId', '#controllers/address_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateAddress))
  })
  .prefix('/api/address')
  .use(middleware.auth())
// …dejar el grupo address-get-places sin cambios…
```

`start/routes/employee_address_routes.ts`:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/employee_address_controller.index')
    router
      .post('/', '#controllers/employee_address_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAddress))
    router
      .put('/:employeeAddressId', '#controllers/employee_address_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAddress))
    router
      .delete('/:employeeAddressId', '#controllers/employee_address_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAddress))
    router.get('/:employeeAddressId', '#controllers/employee_address_controller.show')
  })
  .prefix('/api/employee-address')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`

Expected: PASS (grupos Domicilio).

- [ ] **Step 5: Commit**

```bash
git add start/routes/address_routes.ts start/routes/employee_address_routes.ts \
  tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar PermissionGate en escrituras de domicilio del colaborador

EOF
)"
```

---

### Task 5: Declarar PermissionGate en rutas de Bancos

**Files:**
- Modify: `start/routes/employee_bank_routes.ts`
- Modify: `tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: `createEmployeeBank|updateEmployeeBank|deleteEmployeeBank`
- Produces: 3 rutas con gate

- [ ] **Step 1: Write the failing route-string test**

Agregar al archivo de tests de rutas:

```typescript
test.group('employee_bank_routes — PermissionGate Bancos', () => {
  test('alta, edición y baja declaran permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_bank_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBank)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBank)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeBank)'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`

Expected: FAIL en el grupo Bancos.

- [ ] **Step 3: Wire route gates**

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_bank_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBank))
    router
      .put('/:employeeBankId', '#controllers/employee_bank_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBank))
    router
      .delete('/:employeeBankId', '#controllers/employee_bank_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeBank))
    router.get('/:employeeBankId', '#controllers/employee_bank_controller.show')
  })
  .prefix('/api/employee-banks')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_bank_routes.ts \
  tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar PermissionGate en escrituras de datos bancarios

EOF
)"
```

---

### Task 6: Declarar PermissionGate en hijos, cónyuge y contactos de emergencia

**Files:**
- Modify: `start/routes/employee_children_routes.ts`
- Modify: `start/routes/employee_spouse_routes.ts`
- Modify: `start/routes/employee_emergency_contact_routes.ts`
- Modify: `tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: claves `*EmployeeChild|Spouse|EmergencyContact` del mapa (todas `tab-persona-write` / `tab-persona-delete`)
- Produces: 9 rutas con gate (regla 4: heredan Persona; no permisos propios)

- [ ] **Step 1: Write the failing route-string tests**

```typescript
test.group('employee_children_routes — PermissionGate Persona', () => {
  test('hijos declaran tab-persona en escrituras', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_children_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeChild)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeChild)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeChild)'
    )
  })
})

test.group('employee_spouse_routes — PermissionGate Persona', () => {
  test('cónyuge declara tab-persona en escrituras', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_spouse_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeSpouse)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeSpouse)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSpouse)'
    )
  })
})

test.group('employee_emergency_contact_routes — PermissionGate Persona', () => {
  test('contactos de emergencia declaran tab-persona en escrituras', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_emergency_contact_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeEmergencyContact)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeEmergencyContact)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeEmergencyContact)'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`

Expected: FAIL en los tres grupos nuevos.

- [ ] **Step 3: Wire the three route files**

Patrón idéntico en cada uno (ejemplo hijos):

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_children_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeChild))
    router
      .put('/:employeeChildrenId', '#controllers/employee_children_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeChild))
    router
      .delete('/:employeeChildrenId', '#controllers/employee_children_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeChild))
    router.get('/:employeeChildrenId', '#controllers/employee_children_controller.show')
  })
  .prefix('/api/employee-children')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

Cónyuge: mismas tres escrituras con `createEmployeeSpouse` / `updateEmployeeSpouse` / `deleteEmployeeSpouse`.  
Emergencia: `createEmployeeEmergencyContact` / `updateEmployeeEmergencyContact` / `deleteEmployeeEmergencyContact`; dejar los `GET` (incluido `getByEmployeeId`) sin gate.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`

Expected: PASS (todos los grupos del archivo).

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_children_routes.ts \
  start/routes/employee_spouse_routes.ts \
  start/routes/employee_emergency_contact_routes.ts \
  tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar PermissionGate en hijos, cónyuge y contactos de emergencia

EOF
)"
```

---

### Task 7: Evaluación caso por caso en `PersonController` (ops 18–19)

**Files:**
- Modify: `app/controllers/person_controller.ts` (`update` ~518, `delete` ~734)
- Test: cubrir vía functional en Task 8/9; aquí un test unitario de orden de evaluación no aplica fácilmente — el criterio de aceptación es el functional. Agregar assert de import/uso en un test de string del controlador.

**Interfaces:**
- Consumes: `personIsCollaborator(personId)`, `ensureSecondaryPermission(ctx, options)`, `EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION`, `EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION`
- Produces: `update`/`delete` exigen permiso solo si la persona es colaborador; negativa antes de `validateUsing` / borrado

- [ ] **Step 1: Write the failing controller-string test**

Agregar a `tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts` (o archivo hermano `tests/unit/controllers/person_collaborator_permission_gate.spec.ts`):

```typescript
test.group('person_controller — PermissionGate condicional colaborador', () => {
  test('update y delete usan personIsCollaborator y ensureSecondaryPermission', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/person_controller.ts'),
      'utf8'
    )
    assert.include(content, "from '#helpers/person_is_collaborator'")
    assert.include(content, "from '#helpers/permission_gate_secondary'")
    assert.include(content, 'EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION')
    assert.include(content, 'EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION')
    assert.include(content, 'personIsCollaborator')
    assert.include(content, 'ensureSecondaryPermission')
    // No debe declarar gate incondicional en la ruta de persons
    const routes = await readFile(join(process.cwd(), 'start/routes/person_routes.ts'), 'utf8')
    assert.notInclude(routes, 'permissionGate')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`

Expected: FAIL (imports ausentes en controlador).

- [ ] **Step 3: Implement conditional gate in controller**

Imports al inicio de `person_controller.ts`:

```typescript
import { personIsCollaborator } from '#helpers/person_is_collaborator'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import {
  EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION,
  EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION,
} from '#constants/employees_write_permission_declarations'
```

Cambiar firmas a `async update(ctx: HttpContext)` y `async delete(ctx: HttpContext)` (como `employee_controller.update`), desestructurando `{ request, response, i18n }` desde `ctx`.

En `update`, **inmediatamente después** de validar que `personId` existe (bloqueo 400 actual) y **antes** de `Person.query()` / `validateUsing` / `verifyInfo`:

```typescript
if (await personIsCollaborator(Number(personId))) {
  const allowed = await ensureSecondaryPermission(
    ctx,
    EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION
  )
  if (!allowed) {
    return
  }
}
```

En `delete`, misma posición (tras chequear `personId`, antes de cargar/borrar):

```typescript
if (await personIsCollaborator(Number(personId))) {
  const allowed = await ensureSecondaryPermission(
    ctx,
    EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION
  )
  if (!allowed) {
    return
  }
}
```

No tocar `store` (alta de persona: fuera de alcance, decisión con Wilvardo).

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/controllers/person_controller.ts \
  tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso de Persona solo si la persona es colaborador

EOF
)"
```

---

### Task 8: Tests funcionales — soft-rollout (exigencia apagada)

**Files:**
- Create: `tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts`

**Interfaces:**
- Consumes: rutas ya cableadas; `SystemModule.systemModulePermissionEnforcementActive = false`
- Produces: evidencia de regla 10 (nadie nota el cambio)

- [ ] **Step 1: Write the failing soft-rollout tests**

Crear el archivo reutilizando helpers del patrón de `tests/functional/employees/employees_write_permission_gate.spec.ts` (`createActor`, `cleanupActor`, `permissionId`, `grantOnly`, `createEmployeeFixture`). Copiar/adaptar esos helpers al nuevo archivo (no importar desde el otro spec).

Casos mínimos (exigencia **OFF**, rol **sin** permisos de sección):

```typescript
test.group('Persona/Domicilio/Bancos — PermissionGate soft-rollout', (group) => {
  // setup: forzar employees.systemModulePermissionEnforcementActive = false
  // teardown: dejarla en false

  test('con exigencia apagada, POST /api/employee-banks no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    // actor sin grants; fixture empleado
    const response = await client
      .post('/api/employee-banks')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        employeeBankAccountClabe: '012180001234567890',
        employeeBankAccountCurrencyType: 'MXN',
        employeeId: fixture.employee.employeeId,
        bankId: 1,
      })
    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada, PUT persona-colaborador no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/persons/${fixture.person.personId}`)
      .loginAs(actor.user)
      .json({
        personFirstname: 'Soft',
        personLastname: 'Rollout',
        personPhone: '5550000000',
      })
    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })

  test('con exigencia apagada, POST /api/address no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const response = await client.post('/api/address').loginAs(actor.user).json({
      addressZipcode: 64000,
      addressCountry: 'México',
      addressState: 'Nuevo León',
      addressTownship: 'Monterrey',
      addressCity: 'Monterrey',
      addressSettlement: 'Centro',
      addressStreet: 'Calle Soft',
      addressTypeId: 1,
    })
    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })
})
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `node ace test tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts`

Expected: con Tasks 4–7 ya integrados y exigencia OFF → PASS (si falla por setup de fixture, corregir helpers; no debe fallar por 403 de permiso).

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Verificar soft-rollout del PermissionGate en Persona, Domicilio y Bancos

EOF
)"
```

---

### Task 9: Tests funcionales — matriz con exigencia encendida

**Files:**
- Modify: `tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts`

**Interfaces:**
- Consumes: mismas rutas; toggle exigencia ON solo dentro del `group.setup` / OFF en `teardown`
- Produces: cobertura de reglas 2, 3, 4, 5, 6, 8, 13

- [ ] **Step 1: Write the failing acceptance matrix**

Agregar segundo `test.group('Persona/Domicilio/Bancos — PermissionGate exigencia ON', …)`:

1. **Capturista** (`grantOnly` → `['tab-persona-write', 'tab-persona-delete', 'tab-domicilio-write', 'tab-domicilio-delete']`, sin bancos):
   - `POST /api/address` → no 403 `PERM.DENIED`
   - `POST /api/employee-children` con payload mínimo válido → no 403 `PERM.DENIED`
   - `POST /api/employee-banks` → **403** `PERM.DENIED` y la cuenta no se crea
   - `DELETE /api/employee-banks/:id` (precrear banco como root/setup) → **403** `PERM.DENIED` y el banco sigue existiendo

2. **Nómina** (`grantOnly` → `['tab-bancos-write', 'tab-bancos-delete']`):
   - `POST /api/employee-banks` → no 403 `PERM.DENIED`
   - `POST /api/employee-emergency-contacts` → **403** `PERM.DENIED` (hereda Persona, regla 4)

3. **Persona colaborador sin permiso**:
   - `grantOnly([])` o solo `tab-bancos-write`
   - `PUT /api/persons/:collaboratorPersonId` con cuerpo **inválido** (p. ej. omitir `personFirstname` o enviar tipo incorrecto) → **403** `PERM.DENIED`, no error de validación (regla 8)

4. **Persona cliente sin permiso de Empleados**:
   - Crear `Person` + fila `customers` con ese `person_id`, sin fila `employees`
   - Mismo actor sin `tab-persona-write`
   - `PUT /api/persons/:customerPersonId` con payload válido mínimo → **no** 403 `PERM.DENIED` (regla 6)

5. **Bypass**:
   - Usuario con rol `owner` (o el patrón `createSystemActor('owner', …)` de la orden 7) sin grants de sección → `POST /api/employee-banks` no 403 por permiso
   - Usuario `super-administrador` sin grants → **sí** 403 `PERM.DENIED` (regla 13)

6. **Delete vs write (regla 5)**:
   - Actor solo con `tab-bancos-write` (sin `tab-bancos-delete`) → `DELETE /api/employee-banks/:id` → 403 `PERM.DENIED`
   - Actor solo con `tab-persona-write` (sin delete) → `DELETE /api/employee-children/:id` → 403 `PERM.DENIED`

Ejemplos de payloads:

```typescript
const bankPayload = (employeeId: number) => ({
  employeeBankAccountClabe: '012180001234567890',
  employeeBankAccountCurrencyType: 'MXN',
  employeeId,
  bankId: 1,
})

const childPayload = (employeeId: number) => ({
  employeeChildrenFirstname: 'Hijo',
  employeeChildrenLastname: 'Prueba',
  employeeChildrenSecondLastname: 'Gate',
  employeeId,
})

const emergencyPayload = (employeeId: number) => ({
  employeeEmergencyContactFirstname: 'Contacto',
  employeeEmergencyContactLastname: 'Emergencia',
  employeeEmergencyContactPhone: '5551112233',
  employeeId,
})
```

Para precrear banco/hijo en tests de DELETE, insertar vía modelo/controlador con un actor owner/setup o `db.table(...)` limpio en teardown.

- [ ] **Step 2: Run tests — expect RED where behavior missing, then GREEN**

Run: `node ace test tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts`

Expected: PASS completo. Si algún caso de cliente falla porque el PUT persona exige campos adicionales, ajustar payload al validador sin cambiar la regla de permiso.

- [ ] **Step 3: Confirm module enforcement left OFF after suite**

Tras el group teardown, verificar en BD o con un assert en teardown que `employees.systemModulePermissionEnforcementActive === false`.

- [ ] **Step 4: Commit**

```bash
git add tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir matriz de aceptación del PermissionGate en Persona, Domicilio y Bancos

EOF
)"
```

---

### Task 10: Verificación final de cobertura de las 19 operaciones

**Files:**
- Ninguno nuevo; checklist de revisión

**Interfaces:**
- Consumes: mapa + rutas + controlador
- Produces: confirmación de que ninguna de las 19 queda sin declaración

- [ ] **Step 1: Run the full related suite**

```bash
node ace test \
  tests/unit/constants/employees_write_permission_declarations.spec.ts \
  tests/unit/helpers/person_is_collaborator.spec.ts \
  tests/unit/routes/employees_persona_domicilio_bancos_permission_gate_routes.spec.ts \
  tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts
```

Expected: PASS

- [ ] **Step 2: Manual checklist against regla 1**

| # | Operación | Declaración | Mecanismo |
|---|-----------|-------------|-----------|
| 1 | `POST /api/address` | `createAddress` → `tab-domicilio-write` | ruta |
| 2 | `PUT /api/address/:addressId` | `updateAddress` → `tab-domicilio-write` | ruta |
| 3 | `POST /api/employee-address` | `createEmployeeAddress` → `tab-domicilio-write` | ruta |
| 4 | `PUT /api/employee-address/:id` | `updateEmployeeAddress` → `tab-domicilio-write` | ruta |
| 5 | `DELETE /api/employee-address/:id` | `deleteEmployeeAddress` → `tab-domicilio-delete` | ruta |
| 6 | `POST /api/employee-banks` | `createEmployeeBank` → `tab-bancos-write` | ruta |
| 7 | `PUT /api/employee-banks/:id` | `updateEmployeeBank` → `tab-bancos-write` | ruta |
| 8 | `DELETE /api/employee-banks/:id` | `deleteEmployeeBank` → `tab-bancos-delete` | ruta |
| 9 | `POST /api/employee-children` | `createEmployeeChild` → `tab-persona-write` | ruta |
| 10 | `PUT /api/employee-children/:id` | `updateEmployeeChild` → `tab-persona-write` | ruta |
| 11 | `DELETE /api/employee-children/:id` | `deleteEmployeeChild` → `tab-persona-delete` | ruta |
| 12 | `POST /api/employee-spouses` | `createEmployeeSpouse` → `tab-persona-write` | ruta |
| 13 | `PUT /api/employee-spouses/:id` | `updateEmployeeSpouse` → `tab-persona-write` | ruta |
| 14 | `DELETE /api/employee-spouses/:id` | `deleteEmployeeSpouse` → `tab-persona-delete` | ruta |
| 15 | `POST /api/employee-emergency-contacts` | `createEmployeeEmergencyContact` → `tab-persona-write` | ruta |
| 16 | `PUT /api/employee-emergency-contacts/:id` | `updateEmployeeEmergencyContact` → `tab-persona-write` | ruta |
| 17 | `DELETE /api/employee-emergency-contacts/:id` | `deleteEmployeeEmergencyContact` → `tab-persona-delete` | ruta |
| 18 | `PUT /api/persons/:personId` | `EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION` | caso por caso |
| 19 | `DELETE /api/persons/:personId` | `EMPLOYEES_PERSON_COLLABORATOR_DELETE_PERMISSION` | caso por caso |

- [ ] **Step 3: Confirm out-of-scope intact**

- `POST /api/persons` sin `permissionGate`
- `person_routes.ts` sin `permissionGate`
- Import Excel sigue solo con `import-employees`
- `system_module_permission_enforcement_active` de `employees` sigue `false` en el ambiente de integración
- Ningún seeder concede los nuevos usos a roles

- [ ] **Step 4: Final commit only if checklist edits were needed**

Si solo se corrieron tests sin cambios de código, no crear commit vacío.

---

## Self-Review

**1. Spec coverage**

| Regla / expectativa | Task |
|---------------------|------|
| 19 operaciones con permiso | 1, 4–7, 10 |
| Bancos permiso propio (2) | 1, 5, 9 |
| Domicilio permiso propio (3) | 1, 4, 9 |
| Hijos/cónyuge/emergencia heredan Persona (4) | 1, 6, 9 |
| Delete ≠ write (5) | 1, 9 |
| Solo colaborador en Persona; piloto/sobrecargo cubiertos; cliente no (6) | 3, 7, 9 |
| Criterio superficie compartida escrito (7) | 2 |
| Denial before validation (8) | 7, 9 |
| Import Excel fuera (9) | Global Constraints + Task 10 |
| Soft-rollout / exigencia apagada (10) | 8, Global |
| No encender hasta órdenes 20/21/24 (11) | Global (no toggle) |
| No conceder permisos (12) | Global |
| Owner/root bypass; DG no (13) | 9 |
| No ampliar businessScope (14) | Tasks 4–7 (address/persons sin scope nuevo) |
| Sin cambio de comportamiento con permiso (15) | soft-rollout + gates solo acceso |
| No crear permisos (16) | Task 1 solo declara |
| Misma forma de negativa (17) | middleware / `ensureSecondaryPermission` |

**2. Placeholder scan:** sin TBD/TODO de implementación; decisión abierta de Wilvardo resuelta con default interim documentado en Global Constraints.

**3. Type consistency:** claves del mapa = nombres usados en `permissionGate(...)` y en tests de strings; constantes Persona = nombres usados en controlador.

---

## Notas para el implementador

- Copiar el estilo de commits de la orden 7 (`feat:` / `test:` / `docs:` con descripción en español).
- Si Wilvardo decide que colaborador dado de baja **deja** de exigir permiso, cambiar `personIsCollaborator` para exigir además `employee_terminated_date IS NULL` y actualizar el test interim — no tocar las 17 rutas.
- Pilotos/sobrecargos: no hay rutas propias de identidad; la cobertura es `PUT/DELETE /api/persons/:personId` + vínculo `employees`.
- Antes de encender exigencia en producción: órdenes 20, 21 y 24 (fuera de este plan).
