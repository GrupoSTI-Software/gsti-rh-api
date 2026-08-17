# Exigir permiso en escritura de Condición médica, Lactancia e Incapacidades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declarar en el servidor el permiso que exige cada una de las 25 operaciones de escritura de condición médica, periodos de lactancia e incapacidades laborales del colaborador, con soft-rollout (exigencia del módulo apagada), conservando intacta la comprobación legacy de lactancia y dejando fuera el aviso automático de vencimiento.

**Architecture:** Se reutiliza el `PermissionGate` declarativo (orden 3), el catálogo de permisos del módulo Empleados (orden 4) y la convención de declaración de la orden 7 / Persona-Domicilio-Bancos. Las 25 escrituras reciben `middleware.permissionGate(...)` en la ruta, leyendo de `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS`. Condición médica usa `tab-condicion-medica-write` / `tab-condicion-medica-delete`. Lactancia usa `tab-periodos-lactancia-write` / `tab-periodos-lactancia-delete` y **suma** el gate al `assertHasPermission` legacy (`employees` / `update-information`) sin retirarlo. Incapacidades usan el permiso único `manage-work-disabilities` también en eliminaciones. El comando ACE `lactation:notify-expiring` (cron) no declara permiso. No se crean permisos nuevos, no se concede nada a roles y no se enciende la exigencia del módulo.

**Tech Stack:** AdonisJS 6, Lucid, Japa (unit + functional), `PermissionGateMiddleware` / `PermissionGateService`, convención en `docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md`.

## Global Constraints

- Historia: serie órdenes 8–14 del módulo Empleados; escritura de Condición médica / Periodos de lactancia / Incapacidades (después de Persona/Domicilio/Bancos, USRH1785766406726).
- No inventar slugs; no modificar `EMPLOYEES_PERMISSION_CATALOG` ni el seeder de catálogo (regla 9).
- Slugs a usar: `tab-condicion-medica-write`, `tab-condicion-medica-delete`, `tab-periodos-lactancia-write`, `tab-periodos-lactancia-delete`, `manage-work-disabilities`.
- Bypass de todas las declaraciones: `standard` (owner y root; no `super-administrador`) — regla 13.
- No encender `system_modules.system_module_permission_enforcement_active` del módulo `employees` (regla 10).
- No conceder permisos a ningún rol (regla 12).
- Conservar completa la comprobación legacy de lactancia (`assertHasPermission` → `update-information` / `read`) en controladores; no retirarla ni debilitarla (regla 7).
- El aviso automático `lactation:notify-expiring` (comando + cron) no exige permiso; el disparo manual HTTP sí exige `tab-periodos-lactancia-write` (regla 6).
- No tocar catálogos de tipos de condición médica (`/api/medical-condition-types*`) — regla 8.
- No declarar gate en lecturas: en particular `GET .../employee/:employeeId` de condición médica e incapacidades (app colaborador / web colaborador).
- No tocar descargas de reporte de cumplimiento ni evidencias (orden 17), ni lecturas de sección (órdenes 15–16), ni turnos/vacaciones (orden 11), ni backoffice (orden 20).
- Negativa del gate nuevo = misma forma HTTP 403 de orden 3 (`PERM.DENIED` / `PERM.UNRESOLVED`) — regla 16.
- Una misma ruta declara un solo `permissionGate`; no apilar dos gates (limitación conocida de la forma).
- Código, comentarios y docs del cambio en español; identificadores en inglés.
- Commits: Conventional Commits, tipo en inglés, descripción en español.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/constants/employees_write_permission_declarations.ts` | Extender el mapa con las 25 declaraciones (40 → 65 claves). |
| `start/routes/employee_medical_condition_routes.ts` | Gate en alta/edición/baja de condición médica; GETs sin gate. |
| `start/routes/employee_lactation_periods_routes.ts` | Gate en las 10 escrituras de lactancia; lecturas/reportes sin gate. |
| `start/routes/work_disability_routes.ts` | Gate en alta/edición/baja de incapacidad; GETs sin gate. |
| `start/routes/work_disability_period_routes.ts` | Gate en alta/edición/baja de periodo de incapacidad. |
| `start/routes/work_disability_note_routes.ts` | Gate en alta/edición/baja de nota médica de incapacidad. |
| `start/routes/work_disability_period_expense_routes.ts` | Gate en alta/edición/baja de gasto de periodo. |
| `tests/unit/constants/employees_write_permission_declarations.spec.ts` | Contar y mapear las 25 claves nuevas. |
| `tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts` | Assert de strings en rutas + guards (legacy lactancia, comando automático, GETs colaborador, catálogos). |
| `tests/functional/employees/employees_salud_lactancia_incapacidades_permission_gate.spec.ts` | Soft-rollout + matriz con exigencia ON (separación write/delete, manage único, doble auth lactancia, bypass). |

**No se modifica:** catálogo, seeders de permisos, middleware, controladores de lactancia (salvo verificación de que siguen con legacy), comando `lactation_notify_expiring.ts`, scheduler, rutas de catálogos médicos, lecturas, backoffice, exigencia del módulo.

### Mapa operación → clave → slug (las 25)

| # | Clave en mapa | HTTP | Slug |
|---|---------------|------|------|
| 1 | `createEmployeeMedicalCondition` | `POST /api/employee-medical-conditions` | `tab-condicion-medica-write` |
| 2 | `updateEmployeeMedicalCondition` | `PUT /api/employee-medical-conditions/:id` | `tab-condicion-medica-write` |
| 3 | `deleteEmployeeMedicalCondition` | `DELETE /api/employee-medical-conditions/:id` | `tab-condicion-medica-delete` |
| 4 | `createEmployeeLactationPeriod` | `POST /api/employee-lactation-periods` | `tab-periodos-lactancia-write` |
| 5 | `updateEmployeeLactationPeriod` | `PUT /api/employee-lactation-periods/:id` | `tab-periodos-lactancia-write` |
| 6 | `deleteEmployeeLactationPeriod` | `DELETE /api/employee-lactation-periods/:id` | `tab-periodos-lactancia-delete` |
| 7 | `regenerateLactationShiftExceptions` | `POST .../:id/regenerate-shift-exceptions` | `tab-periodos-lactancia-write` |
| 8 | `runLactationExpiringCheck` | `POST .../notifications/run-expiring-check` | `tab-periodos-lactancia-write` |
| 9 | `revokeLactationConflict` | `DELETE .../:id/conflicts/:shiftExceptionId` | `tab-periodos-lactancia-write` |
| 10 | `reassignLactationConflict` | `POST .../:id/conflicts/:shiftExceptionId/reassign` | `tab-periodos-lactancia-write` |
| 11 | `reassignLactationConflictsBulk` | `POST .../:id/conflicts/reassign-bulk` | `tab-periodos-lactancia-write` |
| 12 | `createLactationEvidence` | `POST .../:periodId/evidences` | `tab-periodos-lactancia-write` |
| 13 | `deleteLactationEvidence` | `DELETE .../:periodId/evidences/:evidenceId` | `tab-periodos-lactancia-delete` |
| 14 | `createWorkDisability` | `POST /api/work-disabilities` | `manage-work-disabilities` |
| 15 | `updateWorkDisability` | `PUT /api/work-disabilities/:id` | `manage-work-disabilities` |
| 16 | `deleteWorkDisability` | `DELETE /api/work-disabilities/:id` | `manage-work-disabilities` |
| 17 | `createWorkDisabilityPeriod` | `POST /api/work-disability-periods` | `manage-work-disabilities` |
| 18 | `updateWorkDisabilityPeriod` | `PUT /api/work-disability-periods/:id` | `manage-work-disabilities` |
| 19 | `deleteWorkDisabilityPeriod` | `DELETE /api/work-disability-periods/:id` | `manage-work-disabilities` |
| 20 | `createWorkDisabilityNote` | `POST /api/work-disability-notes` | `manage-work-disabilities` |
| 21 | `updateWorkDisabilityNote` | `PUT /api/work-disability-notes/:id` | `manage-work-disabilities` |
| 22 | `deleteWorkDisabilityNote` | `DELETE /api/work-disability-notes/:id` | `manage-work-disabilities` |
| 23 | `createWorkDisabilityPeriodExpense` | `POST /api/work-disability-period-expenses` | `manage-work-disabilities` |
| 24 | `updateWorkDisabilityPeriodExpense` | `PUT /api/work-disability-period-expenses/:id` | `manage-work-disabilities` |
| 25 | `deleteWorkDisabilityPeriodExpense` | `DELETE /api/work-disability-period-expenses/:id` | `manage-work-disabilities` |

---

### Task 1: Extender declaraciones de permiso (mapa 40 → 65)

**Files:**
- Modify: `app/constants/employees_write_permission_declarations.ts`
- Modify: `tests/unit/constants/employees_write_permission_declarations.spec.ts`

**Interfaces:**
- Consumes: `employeesStandard(action)`, `EMPLOYEES_PERMISSION_CATALOG` (solo asserts de test)
- Produces: 25 claves nuevas en `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS` (ver tabla arriba)

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
  test('declara exactamente 65 operaciones con module employees y bypass standard', ({ assert }) => {
    const keys = Object.keys(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS)
    assert.equal(keys.length, 65)

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

  test('mapea Condición médica, Lactancia e Incapacidades de escritura', ({ assert }) => {
    const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
    assert.equal(d.createEmployeeMedicalCondition.action, 'tab-condicion-medica-write')
    assert.equal(d.updateEmployeeMedicalCondition.action, 'tab-condicion-medica-write')
    assert.equal(d.deleteEmployeeMedicalCondition.action, 'tab-condicion-medica-delete')

    assert.equal(d.createEmployeeLactationPeriod.action, 'tab-periodos-lactancia-write')
    assert.equal(d.updateEmployeeLactationPeriod.action, 'tab-periodos-lactancia-write')
    assert.equal(d.deleteEmployeeLactationPeriod.action, 'tab-periodos-lactancia-delete')
    assert.equal(d.regenerateLactationShiftExceptions.action, 'tab-periodos-lactancia-write')
    assert.equal(d.runLactationExpiringCheck.action, 'tab-periodos-lactancia-write')
    assert.equal(d.revokeLactationConflict.action, 'tab-periodos-lactancia-write')
    assert.equal(d.reassignLactationConflict.action, 'tab-periodos-lactancia-write')
    assert.equal(d.reassignLactationConflictsBulk.action, 'tab-periodos-lactancia-write')
    assert.equal(d.createLactationEvidence.action, 'tab-periodos-lactancia-write')
    assert.equal(d.deleteLactationEvidence.action, 'tab-periodos-lactancia-delete')

    assert.equal(d.createWorkDisability.action, 'manage-work-disabilities')
    assert.equal(d.updateWorkDisability.action, 'manage-work-disabilities')
    assert.equal(d.deleteWorkDisability.action, 'manage-work-disabilities')
    assert.equal(d.createWorkDisabilityPeriod.action, 'manage-work-disabilities')
    assert.equal(d.updateWorkDisabilityPeriod.action, 'manage-work-disabilities')
    assert.equal(d.deleteWorkDisabilityPeriod.action, 'manage-work-disabilities')
    assert.equal(d.createWorkDisabilityNote.action, 'manage-work-disabilities')
    assert.equal(d.updateWorkDisabilityNote.action, 'manage-work-disabilities')
    assert.equal(d.deleteWorkDisabilityNote.action, 'manage-work-disabilities')
    assert.equal(d.createWorkDisabilityPeriodExpense.action, 'manage-work-disabilities')
    assert.equal(d.updateWorkDisabilityPeriodExpense.action, 'manage-work-disabilities')
    assert.equal(d.deleteWorkDisabilityPeriodExpense.action, 'manage-work-disabilities')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts`

Expected: FAIL (count 40 ≠ 65 y/o claves ausentes).

- [ ] **Step 3: Write minimal implementation**

En `app/constants/employees_write_permission_declarations.ts`, agregar al objeto existente (mantener las 40 claves actuales):

```typescript
  // …claves existentes orden 7 + Persona/Domicilio/Bancos…
  createEmployeeMedicalCondition: employeesStandard('tab-condicion-medica-write'),
  updateEmployeeMedicalCondition: employeesStandard('tab-condicion-medica-write'),
  deleteEmployeeMedicalCondition: employeesStandard('tab-condicion-medica-delete'),
  createEmployeeLactationPeriod: employeesStandard('tab-periodos-lactancia-write'),
  updateEmployeeLactationPeriod: employeesStandard('tab-periodos-lactancia-write'),
  deleteEmployeeLactationPeriod: employeesStandard('tab-periodos-lactancia-delete'),
  regenerateLactationShiftExceptions: employeesStandard('tab-periodos-lactancia-write'),
  runLactationExpiringCheck: employeesStandard('tab-periodos-lactancia-write'),
  revokeLactationConflict: employeesStandard('tab-periodos-lactancia-write'),
  reassignLactationConflict: employeesStandard('tab-periodos-lactancia-write'),
  reassignLactationConflictsBulk: employeesStandard('tab-periodos-lactancia-write'),
  createLactationEvidence: employeesStandard('tab-periodos-lactancia-write'),
  deleteLactationEvidence: employeesStandard('tab-periodos-lactancia-delete'),
  createWorkDisability: employeesStandard('manage-work-disabilities'),
  updateWorkDisability: employeesStandard('manage-work-disabilities'),
  deleteWorkDisability: employeesStandard('manage-work-disabilities'),
  createWorkDisabilityPeriod: employeesStandard('manage-work-disabilities'),
  updateWorkDisabilityPeriod: employeesStandard('manage-work-disabilities'),
  deleteWorkDisabilityPeriod: employeesStandard('manage-work-disabilities'),
  createWorkDisabilityNote: employeesStandard('manage-work-disabilities'),
  updateWorkDisabilityNote: employeesStandard('manage-work-disabilities'),
  deleteWorkDisabilityNote: employeesStandard('manage-work-disabilities'),
  createWorkDisabilityPeriodExpense: employeesStandard('manage-work-disabilities'),
  updateWorkDisabilityPeriodExpense: employeesStandard('manage-work-disabilities'),
  deleteWorkDisabilityPeriodExpense: employeesStandard('manage-work-disabilities'),
} as const satisfies Record<string, PermissionGateOptions>
```

Actualizar el comentario del mapa: mapa acumulado de escrituras del módulo Empleados (orden 7 + Persona/Domicilio/Bancos + Condición médica/Lactancia/Incapacidades).

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/constants/employees_write_permission_declarations.ts \
  tests/unit/constants/employees_write_permission_declarations.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar permisos de escritura de salud, lactancia e incapacidades

EOF
)"
```

---

### Task 2: Cablear PermissionGate en Condición médica (ops 1–3)

**Files:**
- Modify: `start/routes/employee_medical_condition_routes.ts`
- Create: `tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeMedicalCondition` / `updateEmployeeMedicalCondition` / `deleteEmployeeMedicalCondition`
- Produces: las 3 escrituras con gate; `GET /`, `GET /:id`, `GET /employee/:employeeId` sin gate

- [ ] **Step 1: Write the failing route-string test**

Crear `tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('employee_medical_condition_routes — PermissionGate', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_medical_condition_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeMedicalCondition)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeMedicalCondition)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeMedicalCondition)'
    )
    // La consulta del colaborador no debe llevar gate de escritura
    assert.notMatch(
      content,
      /getByEmployee[\s\S]{0,200}permissionGate/
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`

Expected: FAIL (archivo de rutas sin `permissionGate`).

- [ ] **Step 3: Wire the route file**

Reescribir las tres escrituras con `.use(middleware.permissionGate(...))`. Este archivo hoy usa instancia de controlador; conservar ese estilo:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import EmployeeMedicalConditionController from '#controllers/employee_medical_condition_controller'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

const employeeMedicalConditionController = new EmployeeMedicalConditionController()

router
  .group(() => {
    router.get('/', employeeMedicalConditionController.index)
    router
      .post('/', employeeMedicalConditionController.store)
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeMedicalCondition
        )
      )
    router.get('/employee/:employeeId', employeeMedicalConditionController.getByEmployee)
    router.get('/:employeeMedicalConditionId', employeeMedicalConditionController.show)
    router
      .put('/:employeeMedicalConditionId', employeeMedicalConditionController.update)
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeMedicalCondition
        )
      )
    router
      .delete('/:employeeMedicalConditionId', employeeMedicalConditionController.delete)
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeMedicalCondition
        )
      )
  })
  .prefix('/api/employee-medical-conditions')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_medical_condition_routes.ts \
  tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar PermissionGate en condición médica del colaborador

EOF
)"
```

---

### Task 3: Cablear PermissionGate en Periodos de lactancia (ops 4–13) sin tocar legacy

**Files:**
- Modify: `start/routes/employee_lactation_periods_routes.ts`
- Modify: `tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`
- Verify (no edit unless broken): `app/controllers/employee_lactation_periods_controller.ts`, `app/controllers/employee_lactation_period_evidences_controller.ts`

**Interfaces:**
- Consumes: las 10 claves de lactancia del mapa
- Produces: 10 escrituras con gate; lecturas/reportes/conflicts GET sin gate; `assertHasPermission` legacy intacto

- [ ] **Step 1: Write the failing route-string + legacy-guard tests**

Agregar al archivo de tests unitarios de rutas:

```typescript
test.group('employee_lactation_periods_routes — PermissionGate', () => {
  test('las 10 escrituras declaran permissionGate', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_lactation_periods_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    const keys = [
      'createEmployeeLactationPeriod',
      'updateEmployeeLactationPeriod',
      'deleteEmployeeLactationPeriod',
      'regenerateLactationShiftExceptions',
      'runLactationExpiringCheck',
      'revokeLactationConflict',
      'reassignLactationConflict',
      'reassignLactationConflictsBulk',
      'createLactationEvidence',
      'deleteLactationEvidence',
    ]
    for (const key of keys) {
      assert.include(content, `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`)
    }
    const matches =
      content.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 10)
    // Lecturas / reportes / download no llevan gate (sus handlers no aparecen junto a permissionGate)
    assert.notMatch(content, /complianceReport[\s\S]{0,80}permissionGate/)
    assert.notMatch(content, /listConflicts[\s\S]{0,80}permissionGate/)
    assert.notMatch(content, /listAllConflicts[\s\S]{0,80}permissionGate/)
    assert.notMatch(content, /downloadUrl[\s\S]{0,80}permissionGate/)
  })
})

test.group('lactancia — comprobación legacy intacta', () => {
  test('controladores siguen exigiendo update-information vía assertHasPermission', async ({
    assert,
  }) => {
    const periods = await readFile(
      join(process.cwd(), 'app/controllers/employee_lactation_periods_controller.ts'),
      'utf8'
    )
    const evidences = await readFile(
      join(process.cwd(), 'app/controllers/employee_lactation_period_evidences_controller.ts'),
      'utf8'
    )
    assert.include(periods, "update: 'update-information'")
    assert.include(periods, 'assertHasPermission')
    assert.include(periods, "key: 'sin-permiso'")
    assert.include(evidences, 'assertHasPermission')
    assert.include(evidences, "key: 'sin-permiso'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`

Expected: FAIL en el grupo de lactancia (rutas sin gate). El grupo legacy debe PASS ya (no se toca).

- [ ] **Step 3: Wire the 10 write routes**

Patrón (mismo archivo, sin cambiar orden de rutas literales vs `/:id`):

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get(
      '/employee-lactation-periods',
      '#controllers/employee_lactation_periods_controller.index'
    )
    router
      .post(
        '/employee-lactation-periods',
        '#controllers/employee_lactation_periods_controller.store'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeLactationPeriod
        )
      )
    // …GET compliance-report / export sin gate…
    router
      .post(
        '/employee-lactation-periods/notifications/run-expiring-check',
        '#controllers/employee_lactation_periods_controller.runExpiringCheck'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.runLactationExpiringCheck)
      )
    // …GET conflicts global sin gate…
    router
      .put(
        '/employee-lactation-periods/:id',
        '#controllers/employee_lactation_periods_controller.update'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeLactationPeriod
        )
      )
    router
      .delete(
        '/employee-lactation-periods/:id',
        '#controllers/employee_lactation_periods_controller.destroy'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeLactationPeriod
        )
      )
    router
      .post(
        '/employee-lactation-periods/:id/regenerate-shift-exceptions',
        '#controllers/employee_lactation_periods_controller.regenerateShiftExceptions'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.regenerateLactationShiftExceptions
        )
      )
    // …GET :id/conflicts sin gate…
    router
      .post(
        '/employee-lactation-periods/:id/conflicts/reassign-bulk',
        '#controllers/employee_lactation_periods_controller.reassignConflictsBulk'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.reassignLactationConflictsBulk
        )
      )
    router
      .delete(
        '/employee-lactation-periods/:id/conflicts/:shiftExceptionId',
        '#controllers/employee_lactation_periods_controller.revokeConflict'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.revokeLactationConflict)
      )
    router
      .post(
        '/employee-lactation-periods/:id/conflicts/:shiftExceptionId/reassign',
        '#controllers/employee_lactation_periods_controller.reassignConflict'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.reassignLactationConflict)
      )
    // …GET evidences / download-url sin gate…
    router
      .post(
        '/employee-lactation-periods/:periodId/evidences',
        '#controllers/employee_lactation_period_evidences_controller.store'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createLactationEvidence)
      )
    router
      .delete(
        '/employee-lactation-periods/:periodId/evidences/:evidenceId',
        '#controllers/employee_lactation_period_evidences_controller.destroy'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteLactationEvidence)
      )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

**Prohibido en esta tarea:** borrar, comentar o cambiar `ACTION_PERMISSION_MAP` / `assertHasPermission` en los controladores.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`

Expected: PASS (rutas + legacy)

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_lactation_periods_routes.ts \
  tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar PermissionGate en periodos de lactancia sin retirar legacy

EOF
)"
```

---

### Task 4: Cablear PermissionGate en Incapacidades (ops 14–25)

**Files:**
- Modify: `start/routes/work_disability_routes.ts`
- Modify: `start/routes/work_disability_period_routes.ts`
- Modify: `start/routes/work_disability_note_routes.ts`
- Modify: `start/routes/work_disability_period_expense_routes.ts`
- Modify: `tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: las 12 claves `*WorkDisability*` del mapa → todas `manage-work-disabilities`
- Produces: 12 escrituras con gate; `GET /api/work-disabilities/employee/:employeeId` sin gate

- [ ] **Step 1: Write the failing route-string tests**

```typescript
test.group('work_disability_*_routes — PermissionGate', () => {
  test('incapacidad, periodos, notas y gastos declaran manage-work-disabilities', async ({
    assert,
  }) => {
    const files = [
      'start/routes/work_disability_routes.ts',
      'start/routes/work_disability_period_routes.ts',
      'start/routes/work_disability_note_routes.ts',
      'start/routes/work_disability_period_expense_routes.ts',
    ]
    const keys = [
      'createWorkDisability',
      'updateWorkDisability',
      'deleteWorkDisability',
      'createWorkDisabilityPeriod',
      'updateWorkDisabilityPeriod',
      'deleteWorkDisabilityPeriod',
      'createWorkDisabilityNote',
      'updateWorkDisabilityNote',
      'deleteWorkDisabilityNote',
      'createWorkDisabilityPeriodExpense',
      'updateWorkDisabilityPeriodExpense',
      'deleteWorkDisabilityPeriodExpense',
    ]
    let joined = ''
    for (const file of files) {
      joined += await readFile(join(process.cwd(), file), 'utf8')
    }
    for (const key of keys) {
      assert.include(joined, `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`)
    }
    const matches =
      joined.match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ?? []
    assert.equal(matches.length, 12)

    const disabilities = await readFile(
      join(process.cwd(), 'start/routes/work_disability_routes.ts'),
      'utf8'
    )
    assert.notMatch(disabilities, /getByEmployee[\s\S]{0,200}permissionGate/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`

Expected: FAIL en el grupo de incapacidades.

- [ ] **Step 3: Wire the four route files**

Ejemplo `work_disability_routes.ts`:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/work_disability_controller.index')
    router
      .post('/', '#controllers/work_disability_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createWorkDisability))
    router
      .delete('/:workDisabilityId', '#controllers/work_disability_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteWorkDisability))
    router
      .put('/:workDisabilityId', '#controllers/work_disability_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateWorkDisability))
    router.get('/:workDisabilityId', '#controllers/work_disability_controller.show')
    router.get('/employee/:employeeId', '#controllers/work_disability_controller.getByEmployee')
  })
  .prefix('/api/work-disabilities')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

Periodos / notas / gastos: mismo patrón — gate solo en `post`/`put`/`delete`; `get` sin gate. Claves según tabla del mapa.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add start/routes/work_disability_routes.ts \
  start/routes/work_disability_period_routes.ts \
  start/routes/work_disability_note_routes.ts \
  start/routes/work_disability_period_expense_routes.ts \
  tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar PermissionGate en incapacidades laborales y dependientes

EOF
)"
```

---

### Task 5: Guards — aviso automático, catálogos médicos y lecturas colaborador

**Files:**
- Modify: `tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`
- Read-only verify: `commands/lactation_notify_expiring.ts`, `start/scheduler.ts`, `start/routes/medical_condition_type_routes.ts`, `start/routes/medical_condition_type_property_routes.ts`, `start/routes/medical_condition_type_property_value_routes.ts`

**Interfaces:**
- Consumes: archivos existentes sin cambios de producción
- Produces: tests que fallen si alguien mete gate donde no corresponde

- [ ] **Step 1: Write the guard tests**

```typescript
test.group('guards — fuera de alcance de esta historia', () => {
  test('comando y scheduler de aviso automático no usan permissionGate', async ({ assert }) => {
    const command = await readFile(
      join(process.cwd(), 'commands/lactation_notify_expiring.ts'),
      'utf8'
    )
    const scheduler = await readFile(join(process.cwd(), 'start/scheduler.ts'), 'utf8')
    assert.notInclude(command, 'permissionGate')
    assert.notInclude(command, 'PermissionGate')
    assert.notInclude(scheduler, 'permissionGate')
    assert.include(scheduler, 'lactation:notify-expiring')
  })

  test('catálogos de tipos de condición médica no declaran gate de sección', async ({
    assert,
  }) => {
    const files = [
      'start/routes/medical_condition_type_routes.ts',
      'start/routes/medical_condition_type_property_routes.ts',
      'start/routes/medical_condition_type_property_value_routes.ts',
    ]
    for (const file of files) {
      const content = await readFile(join(process.cwd(), file), 'utf8')
      assert.notInclude(content, 'permissionGate')
      assert.notInclude(content, 'tab-condicion-medica')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it passes (guards are red-flag tests)**

Run: `node ace test tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts`

Expected: PASS (estado actual correcto; fallarán si una tarea futura los rompe).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
test: Guardar aviso automático y catálogos médicos fuera del PermissionGate

EOF
)"
```

---

### Task 6: Tests funcionales — soft-rollout (exigencia apagada)

**Files:**
- Create: `tests/functional/employees/employees_salud_lactancia_incapacidades_permission_gate.spec.ts`

**Interfaces:**
- Consumes: rutas ya cableadas; `SystemModule.systemModulePermissionEnforcementActive = false`
- Produces: evidencia de regla 10 (el gate nuevo no cambia nada)

- [ ] **Step 1: Write the failing soft-rollout tests**

Crear el archivo reutilizando helpers del patrón de `tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts` (`createActor`, `cleanupActor`, `permissionId`, `grantOnly`, `createEmployeeFixture`, `createSystemActor`). Copiar/adaptar esos helpers al nuevo archivo (no importar desde el otro spec).

Casos mínimos (exigencia **OFF**):

```typescript
test.group('Salud/Lactancia/Incapacidades — PermissionGate soft-rollout', (group) => {
  // setup: forzar employees.systemModulePermissionEnforcementActive = false
  // teardown: dejarla en false
  // actor sin grants de sección nueva

  test('con exigencia apagada, POST condición médica no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/employee-medical-conditions')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture.employee.employeeId,
        medicalConditionTypeId: medicalConditionType.medicalConditionTypeId,
        employeeMedicalConditionDiagnosis: 'Soft rollout diagnosis',
      })
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada, POST incapacidad no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const coverage = await InsuranceCoverageType.query()
      .whereNull('insurance_coverage_type_deleted_at')
      .firstOrFail()
    const response = await client
      .post('/api/work-disabilities')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture.employee.employeeId,
        insuranceCoverageTypeId: coverage.insuranceCoverageTypeId,
      })
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
  })

  test('con exigencia apagada y con update-information, POST lactancia no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    // Conceder solo el permiso legacy; NO conceder tab-periodos-lactancia-write
    await grantOnly(actor.role.roleId, ['update-information'])
    const response = await client
      .post('/api/employee-lactation-periods')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture.employee.employeeId,
        employeeLactationPeriodStartDate: '2026-01-01',
        employeeLactationPeriodEndDate: '2026-06-01',
        employeeLactationPeriodType: 'reduced_hour',
      })
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
    // Si falla, no debe ser por el gate nuevo; puede ser validación de negocio
  })

  test('con exigencia apagada y sin update-information, lactancia sigue respondiendo sin-permiso legacy', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, [])
    const response = await client
      .post('/api/employee-lactation-periods')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture.employee.employeeId,
        employeeLactationPeriodStartDate: '2026-01-01',
        employeeLactationPeriodEndDate: '2026-06-01',
        employeeLactationPeriodType: 'reduced_hour',
      })
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'sin-permiso')
  })
})
```

Fixtures de catálogo (copiar el patrón de los isolation specs):
- `medicalConditionTypeId`: crear con `MedicalConditionType` en el setup del grupo (como `medical_condition_type_tenant_isolation.spec.ts`), no hardcodear `1`.
- `insuranceCoverageTypeId`: leer el primero activo de BD como en `work_disability_tenant_isolation.spec.ts`.
- `employeeLactationPeriodType`: usar `'reduced_hour'` o `'two_rest_periods'` (valores reales del dominio).

- [ ] **Step 2: Run test to verify soft-rollout behavior**

Run: `node ace test tests/functional/employees/employees_salud_lactancia_incapacidades_permission_gate.spec.ts`

Expected: soft-rollout PASS; si faltan fixtures, completar helpers hasta que pasen.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_salud_lactancia_incapacidades_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir soft-rollout de PermissionGate en salud, lactancia e incapacidades

EOF
)"
```

---

### Task 7: Tests funcionales — matriz con exigencia ON

**Files:**
- Modify: `tests/functional/employees/employees_salud_lactancia_incapacidades_permission_gate.spec.ts`

**Interfaces:**
- Consumes: flag ON temporal; grants parciales vía `grantOnly`
- Produces: evidencia de reglas 1–7, 13; teardown deja flag OFF

- [ ] **Step 1: Write the enforcement-ON matrix**

```typescript
test.group('Salud/Lactancia/Incapacidades — PermissionGate exigencia ON', (group) => {
  // setup: systemModulePermissionEnforcementActive = true
  // teardown: = false SIEMPRE

  test('sin tab-condicion-medica-write, POST condición médica → PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, ['update-information'])
    const response = await client
      .post('/api/employee-medical-conditions')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture.employee.employeeId,
        medicalConditionTypeId: medicalConditionType.medicalConditionTypeId,
        employeeMedicalConditionDiagnosis: 'Denied',
      })
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
  })

  test('con write sin delete, DELETE condición médica → PERM.DENIED y el registro permanece', async ({
    client,
    assert,
  }) => {
    // Crear el registro vía Lucid (sin pasar por el gate), luego intentar borrarlo
    // con rol que solo tiene write. Patrón idéntico a createBankFixture en orden 8.
    const condition = await EmployeeMedicalCondition.create({
      employeeId: fixture.employee.employeeId,
      medicalConditionTypeId: medicalConditionType.medicalConditionTypeId,
      employeeMedicalConditionDiagnosis: 'Solo write',
      employeeMedicalConditionActive: 1,
    })
    await grantOnly(actor.role.roleId, ['tab-condicion-medica-write'])
    const response = await client
      .delete(`/api/employee-medical-conditions/${condition.employeeMedicalConditionId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
    assert.isNotNull(
      await EmployeeMedicalCondition.query()
        .where('employee_medical_condition_id', condition.employeeMedicalConditionId)
        .whereNull('employee_medical_condition_deleted_at')
        .first()
    )
  })

  test('con manage-work-disabilities, DELETE incapacidad no responde PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const coverage = await InsuranceCoverageType.query()
      .whereNull('insurance_coverage_type_deleted_at')
      .firstOrFail()
    const disability = new WorkDisability()
    disability.workDisabilityUuid = `test-wd-pg-${Date.now()}`
    disability.employeeId = fixture.employee.employeeId
    disability.insuranceCoverageTypeId = coverage.insuranceCoverageTypeId
    await disability.save()

    await grantOnly(actor.role.roleId, ['manage-work-disabilities'])
    const response = await client
      .delete(`/api/work-disabilities/${disability.workDisabilityId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })

  test('sin manage-work-disabilities, POST y DELETE incapacidad → PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const coverage = await InsuranceCoverageType.query()
      .whereNull('insurance_coverage_type_deleted_at')
      .firstOrFail()
    await grantOnly(actor.role.roleId, ['update-information'])
    const create = await client
      .post('/api/work-disabilities')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture.employee.employeeId,
        insuranceCoverageTypeId: coverage.insuranceCoverageTypeId,
      })
    assert.equal(create.status(), 403)
    assert.equal(create.body()?.key, 'PERM.DENIED')

    const disability = new WorkDisability()
    disability.workDisabilityUuid = `test-wd-pg-del-${Date.now()}`
    disability.employeeId = fixture.employee.employeeId
    disability.insuranceCoverageTypeId = coverage.insuranceCoverageTypeId
    await disability.save()
    const del = await client
      .delete(`/api/work-disabilities/${disability.workDisabilityId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
    assert.equal(del.status(), 403)
    assert.equal(del.body()?.key, 'PERM.DENIED')
  })

  test('lactancia: solo permiso nuevo sin update-information → mensaje legacy sin-permiso', async ({
    client,
    assert,
  }) => {
    // Exigencia ON: el gate nuevo deja pasar; el legacy rechaza
    await grantOnly(actor.role.roleId, ['tab-periodos-lactancia-write'])
    const response = await client
      .post('/api/employee-lactation-periods')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture.employee.employeeId,
        employeeLactationPeriodStartDate: '2026-01-01',
        employeeLactationPeriodEndDate: '2026-06-01',
        employeeLactationPeriodType: 'reduced_hour',
      })
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'sin-permiso')
  })

  test('lactancia: solo update-information sin permiso nuevo → PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, ['update-information'])
    const response = await client
      .post('/api/employee-lactation-periods')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture.employee.employeeId,
        employeeLactationPeriodStartDate: '2026-01-01',
        employeeLactationPeriodEndDate: '2026-06-01',
        employeeLactationPeriodType: 'reduced_hour',
      })
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
  })

  test('lactancia: ambas autorizaciones permiten alta', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, [
      'update-information',
      'tab-periodos-lactancia-write',
    ])
    const response = await client
      .post('/api/employee-lactation-periods')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
      .json({
        employeeId: fixture.employee.employeeId,
        employeeLactationPeriodStartDate: '2026-01-01',
        employeeLactationPeriodEndDate: '2026-06-01',
        employeeLactationPeriodType: 'reduced_hour',
      })
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
    assert.notEqual(response.body()?.key, 'sin-permiso')
  })

  test('disparo manual de aviso exige tab-periodos-lactancia-write', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, ['update-information'])
    const response = await client
      .post('/api/employee-lactation-periods/notifications/run-expiring-check')
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
    assert.equal(response.status(), 403)
    assert.equal(response.body()?.key, 'PERM.DENIED')
  })

  test('owner evade el gate y super-administrador no', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'employees-salud-owner')
    const superAdmin = await createSystemActor(
      'super-administrador',
      'employees-salud-super-admin'
    )
    let ownerGrants: RoleSystemPermission[] = []
    let superAdminGrants: RoleSystemPermission[] = []
    try {
      ownerGrants = await snapshotAndClearEmployeesGrants(owner.roleId)
      superAdminGrants = await snapshotAndClearEmployeesGrants(superAdmin.roleId)

      const ownerResponse = await client
        .post('/api/employee-medical-conditions')
        .loginAs(owner.user)
        .header('X-Business-Unit-Id', owner.businessUnit.businessUnitPublicId)
        .json({
          employeeId: fixture.employee.employeeId,
          medicalConditionTypeId: medicalConditionType.medicalConditionTypeId,
          employeeMedicalConditionDiagnosis: 'Owner bypass',
        })
      assert.notEqual(ownerResponse.body()?.key, 'PERM.DENIED')

      const superAdminResponse = await client
        .post('/api/employee-medical-conditions')
        .loginAs(superAdmin.user)
        .header('X-Business-Unit-Id', superAdmin.businessUnit.businessUnitPublicId)
        .json({
          employeeId: fixture.employee.employeeId,
          medicalConditionTypeId: medicalConditionType.medicalConditionTypeId,
          employeeMedicalConditionDiagnosis: 'DG denied',
        })
      assert.equal(superAdminResponse.status(), 403)
      assert.equal(superAdminResponse.body()?.key, 'PERM.DENIED')
    } finally {
      await restoreEmployeesGrants(ownerGrants)
      await restoreEmployeesGrants(superAdminGrants)
      await cleanupSystemActor(owner)
      await cleanupSystemActor(superAdmin)
    }
  })

  test('GET condición médica e incapacidades por employeeId no responden PERM.DENIED sin grants', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, [])
    const medical = await client
      .get(`/api/employee-medical-conditions/employee/${fixture.employee.employeeId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
    const disabilities = await client
      .get(`/api/work-disabilities/employee/${fixture.employee.employeeId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
    assert.notEqual(medical.body()?.key, 'PERM.DENIED')
    assert.notEqual(disabilities.body()?.key, 'PERM.DENIED')
  })
})
```

Helpers a copiar del spec de Persona/Domicilio/Bancos: `createActor`, `cleanupActor`, `createSystemActor`, `cleanupSystemActor`, `permissionId`, `grantOnly`, `createEmployeeFixture`, `snapshotAndClearEmployeesGrants`, `restoreEmployeesGrants`, `activeEmployeesGrants`. En el setup del grupo ON crear también `medicalConditionType` (`MedicalConditionType.create(...)`) y limpiarlo en teardown. Modelos: `EmployeeMedicalCondition`, `WorkDisability`, `InsuranceCoverageType`, `MedicalConditionType`.

- [ ] **Step 2: Run the full functional suite**

Run: `node ace test tests/functional/employees/employees_salud_lactancia_incapacidades_permission_gate.spec.ts`

Expected: PASS; al terminar, `employees.systemModulePermissionEnforcementActive === false`.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_salud_lactancia_incapacidades_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir matriz ON de PermissionGate en salud, lactancia e incapacidades

EOF
)"
```

---

### Task 8: Verificación final de cobertura (las 25)

**Files:**
- Modify: `tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts` (assert consolidado)

**Interfaces:**
- Consumes: todas las rutas cableadas + mapa
- Produces: un test que falla si falta cualquiera de las 25 declaraciones en rutas

- [ ] **Step 1: Write the coverage checklist test**

```typescript
test.group('cobertura — 25 escrituras de salud/lactancia/incapacidades', () => {
  test('cada clave del dominio aparece exactamente una vez en rutas', async ({ assert }) => {
    const routeFiles = [
      'start/routes/employee_medical_condition_routes.ts',
      'start/routes/employee_lactation_periods_routes.ts',
      'start/routes/work_disability_routes.ts',
      'start/routes/work_disability_period_routes.ts',
      'start/routes/work_disability_note_routes.ts',
      'start/routes/work_disability_period_expense_routes.ts',
    ]
    const expected = [
      'createEmployeeMedicalCondition',
      'updateEmployeeMedicalCondition',
      'deleteEmployeeMedicalCondition',
      'createEmployeeLactationPeriod',
      'updateEmployeeLactationPeriod',
      'deleteEmployeeLactationPeriod',
      'regenerateLactationShiftExceptions',
      'runLactationExpiringCheck',
      'revokeLactationConflict',
      'reassignLactationConflict',
      'reassignLactationConflictsBulk',
      'createLactationEvidence',
      'deleteLactationEvidence',
      'createWorkDisability',
      'updateWorkDisability',
      'deleteWorkDisability',
      'createWorkDisabilityPeriod',
      'updateWorkDisabilityPeriod',
      'deleteWorkDisabilityPeriod',
      'createWorkDisabilityNote',
      'updateWorkDisabilityNote',
      'deleteWorkDisabilityNote',
      'createWorkDisabilityPeriodExpense',
      'updateWorkDisabilityPeriodExpense',
      'deleteWorkDisabilityPeriodExpense',
    ]
    assert.equal(expected.length, 25)

    let joined = ''
    for (const file of routeFiles) {
      joined += await readFile(join(process.cwd(), file), 'utf8')
    }
    for (const key of expected) {
      const needle = `permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.${key})`
      const count = joined.split(needle).length - 1
      assert.equal(count, 1, `${key} debe aparecer exactamente una vez en rutas`)
    }
  })
})
```

- [ ] **Step 2: Run all related tests**

Run:

```bash
node ace test \
  tests/unit/constants/employees_write_permission_declarations.spec.ts \
  tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts \
  tests/functional/employees/employees_salud_lactancia_incapacidades_permission_gate.spec.ts
```

Expected: PASS

- [ ] **Step 3: Manual smoke checklist (ambiente local, flag OFF)**

1. Con sesión de capturista habitual: registrar/editar/borrar condición médica, periodo de lactancia (si tenía `update-information`), incapacidad — mismo resultado que antes.
2. Confirmar en BD: `system_modules.system_module_permission_enforcement_active = 0` para slug `employees`.
3. Confirmar que `node ace lactation:notify-expiring` corre sin error de permiso (no hay auth HTTP).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/routes/employees_salud_lactancia_incapacidades_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
test: Verificar cobertura de las 25 escrituras de salud, lactancia e incapacidades

EOF
)"
```

---

## Self-Review

**1. Spec coverage**

| Requisito | Task |
|-----------|------|
| Regla 1 — 25 ops con permiso | Tasks 1–4, 8 |
| Regla 2 — write ≠ delete en médica y lactancia | Task 1 (slugs), Task 7 (matriz) |
| Regla 3 — dependencias de lactancia heredan sección | Task 1 (mismas claves write/delete), Task 3 |
| Regla 4 — revocar/reasignar = write; borrar periodo/evidencia = delete | Task 1 |
| Regla 5 — incapacidades con un solo `manage-work-disabilities` | Tasks 1, 4, 7 |
| Regla 6 — automático sin permiso; manual con write | Tasks 3, 5, 7 |
| Regla 7 — legacy lactancia intacta + doble auth | Tasks 3, 6, 7 |
| Regla 8 — catálogos médicos fuera | Task 5 |
| Regla 9 — no crear permisos | Global; Task 1 solo declara |
| Regla 10 — soft-rollout | Task 6; Global |
| Regla 12 — no conceder a roles | Global |
| Regla 13 — owner/root bypass; DG no | Task 7 |
| Regla 14 — auth + businessScope se mantienen | Tasks 2–4 (no se quitan) |
| Regla 15 — comportamiento igual con permiso | implícito (solo gate) |
| Regla 16 — forma de negativa del middleware | Task 7 (`PERM.DENIED`) |
| Consultas colaborador intactas | Tasks 2, 4, 7 |
| Órdenes 15/16/17/11/20 fuera | Global Constraints |

**2. Placeholder scan:** sin TBD/TODO; tests y código de rutas incluidos; fixtures de IDs de catálogo se resuelven contra seeders/fixtures existentes en la Task 6 (no se dejan abiertos).

**3. Type consistency:** claves del mapa (`createEmployeeMedicalCondition`, `runLactationExpiringCheck`, `deleteWorkDisabilityPeriodExpense`, etc.) son las mismas en Tasks 1, 2, 3, 4, 7 y 8.

---

## Notas para el implementador

1. **Orden del middleware en lactancia con exigencia ON:** el `permissionGate` de ruta corre antes del controlador. Por eso “solo permiso nuevo” llega a `assertHasPermission` y recibe `sin-permiso`; “solo legacy” muere en el gate con `PERM.DENIED`. Documentado en regla 7: soporte no debe tratar el mensaje legacy como bug del control nuevo.
2. **Revocar/reasignar vs excepciones de turno (orden 11):** esta historia no exige un segundo permiso de excepciones. Si la orden 11 lo pidiera, no cabe en un solo `permissionGate` y sería historia aparte (decisión abierta del spec).
3. **Evidencias:** subir = write; eliminar = delete. No hay permiso propio de evidencia.
4. **No ejecutar** el comando de aviso en tests funcionales con side effects de correo salvo que el suite ya mockee el mailer; el caso de “automático no pide permiso” se cubre con el guard de strings del comando (Task 5). El disparo manual HTTP sí se prueba en Task 7.
