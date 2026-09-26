# Exigir permiso en escritura de Zonas, Anotaciones, Bonificaciones, Responsable/Asignados y Activos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declarar en el servidor el permiso que exige cada una de las 21 operaciones de escritura de zonas de trabajo, anotaciones del historial, bonificaciones, asignación de responsable/personal asignado, y activos/suministros del colaborador (con contratos de resguardo y fotografías de evidencia), con soft-rollout (exigencia del módulo apagada), OR de los dos permisos de administrar en responsable/asignados, y negativa estándar antes de almacenar evidencia fotográfica.

**Architecture:** Se reutiliza el `PermissionGate` declarativo (USRH1785766406721 / orden 3), el catálogo de permisos del módulo Empleados (orden 4) y la convención de declaración de la orden 7. Las 21 operaciones viven en rutas exclusivas de administración (`employee_zone_routes`, `employee_annotation_routes`, `employee_bonus_routes`, `user_responsible_employee_routes`, `employee_supplies`, `employee_supplies_response_contracts`, `employee_supply_assignament_photo`): cada escritura recibe `middleware.permissionGate(...)` en la ruta, después de `auth()` y de `businessScope()` cuando la ruta ya lo usa. La fotografía de evidencia se niega en el middleware, antes de que el controlador llame a `UploadService.fileUpload`. Para responsable/asignados, `action` acepta una lista (OR) porque las dos pestañas comparten las mismas tres operaciones HTTP (regla 5). Se crea exactamente un permiso nuevo (`manage-employee-supplies`) vía sincronización del catálogo, sin migraciones. No se concede nada a roles y no se enciende la exigencia del módulo (D-03 / D-09).

**Tech Stack:** AdonisJS 6, Lucid, Japa (unit + functional), `PermissionGateMiddleware` / `PermissionGateService`, mapa `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS`, catálogo `EMPLOYEES_PERMISSION_CATALOG`, `SystemPermissionCatalogSyncService`, convención en `docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md`.

## Global Constraints

- Historia: USRH1785766406727 (serie de órdenes de escritura del módulo Empleados; tramo Zonas / Anotaciones / Bonificaciones / Responsable-Asignados / Activos).
- Copia la forma de las órdenes 7 y 8; no reinventar autorización. Negativa = misma forma HTTP 403 (`PERM.DENIED` / `PERM.UNRESOLVED`) — regla 15.
- Bypass de todas las declaraciones: `standard` (owner y root; no `super-administrador`) — regla 12.
- No encender `system_modules.system_module_permission_enforcement_active` del módulo `employees` (regla 9 / D-09).
- No conceder permisos a ningún rol (regla 11 / D-03).
- Crear exactamente un permiso nuevo: `manage-employee-supplies` (módulo `employees`, sección `expediente`, `kind: 'write'`, `exceptionProfile: 'standard'`, sin `legacyEquivalence`). Materializarlo con `SystemPermissionCatalogSyncService`, sin migraciones (regla 8).
- Slugs ya registrados a usar (no inventar otros): `tab-zonas-write`, `tab-zonas-delete`, `tab-anotaciones-write`, `tab-anotaciones-delete`, `tab-trabajo-write`, `tab-trabajo-delete`, `manage-responsible-edit`, `manage-assigned-edit`.
- No usar `tab-responsable-write` / `tab-responsable-delete` / `tab-asignados-write` / `tab-asignados-delete` en estas escrituras: el backoffice ya consulta los cuatro permisos legacy sembrados (`manage-responsible-read|edit`, `manage-assigned-read|edit`); aquí se aplican los dos de administrar (regla 5). Los de consultar son orden 15.
- No usar `tab-expediente-write` ni `manage-files` para suministros: son independientes (regla 6).
- No usar `full-employee-assigned`: es de alcance de lectura y no participa en estas escrituras.
- Bonificaciones → `tab-trabajo-write` / `tab-trabajo-delete` (Wilvardo 2026-08-11). No crear sección de bonificaciones.
- Activos: un solo permiso para las 9 operaciones, sin separar escritura de eliminación (regla 7).
- Anotaciones: no tocar la verificación de autoría vigente (`Only the original creator can update this annotation`). El gate corre antes; si el autoría rechaza, el mensaje es el de siempre, no `PERM.DENIED` (regla 3). Borrar anotación ajena no tiene regla de autoría y esta historia no la agrega.
- La ruta de fotografías de activos hoy no tiene `businessScope()`. No agregarlo aquí: corresponde a USRH1785766406719 (orden 1). Coordinar merge: este plan solo añade `permissionGate` en las tres escrituras de `start/routes/employee_supply_assignament_photo.ts`.
- No declarar gate en lecturas (GET) ni en catálogos de la empresa (`/api/zones`, `/api/supplies`, `/api/supply-types`, características).
- Una misma ruta declara un solo `permissionGate`; no apilar dos gates. El OR de responsable/asignados es un solo gate con `action` lista, no dos middlewares.
- El permiso se suma a sesión + `businessScope` (donde ya existe); no lo reemplaza ni lo amplía (regla 13).
- Código, comentarios y docs del cambio en español; identificadores en inglés.
- Commits: Conventional Commits, tipo en inglés, descripción en español.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/constants/employees_permission_catalog.ts` | Agregar la entrada `manage-employee-supplies` (sección `expediente`). |
| `app/constants/permission_gate.ts` | Permitir `action: string \| readonly string[]` (OR). |
| `app/services/permission_gate_service.ts` | Evaluar OR sobre el set de slugs ya concedidos al rol. |
| `app/constants/employees_write_permission_declarations.ts` | Extender el mapa (126 → 147) con las 21 declaraciones. |
| `start/routes/employee_zone_routes.ts` | Gate en POST/PUT/DELETE de zonas del colaborador. |
| `start/routes/employee_annotation_routes.ts` | Gate en POST/PUT/DELETE de anotaciones. |
| `start/routes/employee_bonus_routes.ts` | Gate en POST/PUT/DELETE de bonificaciones. |
| `start/routes/user_responsible_employee_routes.ts` | Gate OR en POST/PUT/DELETE de la asignación responsable–colaborador. |
| `start/routes/employee_supplies.ts` | Gate en POST/PUT/POST retire/DELETE de la asignación de activo. |
| `start/routes/employee_supplies_response_contracts.ts` | Gate en POST/DELETE de contratos de resguardo. |
| `start/routes/employee_supply_assignament_photo.ts` | Gate en POST entrega, POST devolución y DELETE de fotografía. |
| `docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md` | Documentar OR de acciones y la excepción del slug nuevo. |
| `tests/unit/constants/employees_permission_catalog_granular.spec.ts` | Assert de la entrada nueva. |
| `tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts` | Compilar el slug nuevo. |
| `tests/unit/services/employees_permission_catalog_no_role_grants.spec.ts` | Sync materializa el slug y no concede roles. |
| `tests/unit/services/permission_gate_service.spec.ts` | Matriz OR (cualquiera / ninguno / interruptor apagado). |
| `tests/unit/constants/employees_write_permission_declarations.spec.ts` | Contar 147 y mapear las 21 claves. |
| `tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts` | Assert de strings en las 7 rutas + guards de exentos (catálogos, lecturas, foto sin businessScope nuevo). |
| `tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts` | Soft-rollout OFF + matriz ON (separación, OR, autoría, foto no almacenada, bypass). |
| `docs/superpowers/plans/2026-08-13-employees-zonas-anotaciones-bonificaciones-activos-permission-gate-qa-scenarios.md` | Matriz completa: unit, functional, e2e API y e2e backoffice, exigencia OFF y ON. |

**No se modifica:** seeders de permisos a mano, migraciones, middleware core más allá de `action` lista, `start/kernel.ts` (no hay segundo named middleware), rutas de catálogo (`zone_routes`, `supplies`, `supply_type`, características), lecturas, exigencia del módulo, verificación de autoría de anotaciones, alcance por unidad de negocio de fotografías.

### Mapa operación → clave → slug (las 21)

| # | Clave | HTTP | Slug |
|---|-------|------|------|
| 1 | `createEmployeeZone` | `POST /api/employee-zones` | `tab-zonas-write` |
| 2 | `updateEmployeeZone` | `PUT /api/employee-zones/:employeeZoneId` | `tab-zonas-write` |
| 3 | `deleteEmployeeZone` | `DELETE /api/employee-zones/:employeeZoneId` | `tab-zonas-delete` |
| 4 | `createEmployeeAnnotation` | `POST /api/employee-annotations` | `tab-anotaciones-write` |
| 5 | `updateEmployeeAnnotation` | `PUT /api/employee-annotations/:employeeAnnotationId` | `tab-anotaciones-write` |
| 6 | `deleteEmployeeAnnotation` | `DELETE /api/employee-annotations/:employeeAnnotationId` | `tab-anotaciones-delete` |
| 7 | `createEmployeeBonus` | `POST /api/employee-bonuses` | `tab-trabajo-write` |
| 8 | `updateEmployeeBonus` | `PUT /api/employee-bonuses/:employeeBonusId` | `tab-trabajo-write` |
| 9 | `deleteEmployeeBonus` | `DELETE /api/employee-bonuses/:employeeBonusId` | `tab-trabajo-delete` |
| 10 | `createUserResponsibleEmployee` | `POST /api/user-responsible-employees` | `['manage-responsible-edit', 'manage-assigned-edit']` |
| 11 | `updateUserResponsibleEmployee` | `PUT /api/user-responsible-employees/:userResponsibleEmployeeId` | `['manage-responsible-edit', 'manage-assigned-edit']` |
| 12 | `deleteUserResponsibleEmployee` | `DELETE /api/user-responsible-employees/:userResponsibleEmployeeId` | `['manage-responsible-edit', 'manage-assigned-edit']` |
| 13 | `createEmployeeSupply` | `POST /api/employee-supplies` | `manage-employee-supplies` |
| 14 | `updateEmployeeSupply` | `PUT /api/employee-supplies/:id` | `manage-employee-supplies` |
| 15 | `retireEmployeeSupply` | `POST /api/employee-supplies/:id/retire` | `manage-employee-supplies` |
| 16 | `deleteEmployeeSupply` | `DELETE /api/employee-supplies/:id` | `manage-employee-supplies` |
| 17 | `createEmployeeSupplyResponseContract` | `POST /api/employee-supplies-response-contracts` | `manage-employee-supplies` |
| 18 | `deleteEmployeeSupplyResponseContract` | `DELETE /api/employee-supplies-response-contracts/:id` | `manage-employee-supplies` |
| 19 | `uploadEmployeeSupplyAssignationPhoto` | `POST /api/employee-supply-assignation-photos/:employeeSupplyId/assignation` | `manage-employee-supplies` |
| 20 | `uploadEmployeeSupplyReturnPhoto` | `POST /api/employee-supply-assignation-photos/:employeeSupplyId/return` | `manage-employee-supplies` |
| 21 | `deleteEmployeeSupplyAssignationPhoto` | `DELETE /api/employee-supply-assignation-photos/:photoId` | `manage-employee-supplies` |

**Criterio de #10–12:** el servidor no puede saber desde cuál pestaña llega la petición. Un solo `permissionGate` con `action` lista (OR). Basta uno de los dos. Quien no tiene ninguno recibe `PERM.DENIED`.

**Criterio de #13–21:** D-06 — fotos y contratos heredan el permiso de su sección padre; es el mismo slug, no uno por superficie.

---

### Task 1: Registrar `manage-employee-supplies` en el catálogo

**Files:**
- Modify: `app/constants/employees_permission_catalog.ts`
- Modify: `tests/unit/constants/employees_permission_catalog_granular.spec.ts`
- Modify: `tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts`
- Modify: `tests/unit/services/employees_permission_catalog_no_role_grants.spec.ts`

**Interfaces:**
- Consumes: `ActionCatalogEntry<EmployeesSection>`, `SystemPermissionCatalogSyncService.sync()`
- Produces: slug literal `manage-employee-supplies` en `EmployeeActionSlug`; fila nueva en `system_permissions` al sincronizar; cero filas nuevas en `role_system_permissions`

- [ ] **Step 1: Write the failing test**

En `tests/unit/constants/employees_permission_catalog_granular.spec.ts`, agregar al final del grupo:

```typescript
  test('declara manage-employee-supplies en expediente, independiente de manage-files', ({
    assert,
  }) => {
    const action = EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === 'manage-employee-supplies')
    assert.exists(action)
    assert.equal(action!.displayName, 'Administrar suministros del colaborador')
    assert.equal(action!.kind, 'write')
    assert.equal(action!.section, 'expediente')
    assert.equal(action!.exceptionProfile, 'standard')
    assert.isUndefined(action!.legacyEquivalence)
    assert.isUndefined(action!.exemption)

    const expedienteWrite = EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === 'tab-expediente-write')
    assert.exists(expedienteWrite)
    assert.notEqual(expedienteWrite!.slug, action!.slug)
  })
```

En `tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts`, debajo de `validSlug`:

```typescript
const suppliesSlug: EmployeeActionSlug = 'manage-employee-supplies'
void suppliesSlug
```

En `tests/unit/services/employees_permission_catalog_no_role_grants.spec.ts`, agregar:

```typescript
import SystemPermission from '#models/system_permission'

  test('sync materializa manage-employee-supplies y no lo concede a ningún rol', async ({
    assert,
  }) => {
    const beforeGrants = await RoleSystemPermission.query().whereNull(
      'role_system_permission_deleted_at'
    )
    const result = await new SystemPermissionCatalogSyncService().sync()
    const permission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_permission_slug', 'manage-employee-supplies')
      .whereHas('systemModule', (query) =>
        query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
      )
      .first()
    assert.exists(permission)
    const afterGrants = await RoleSystemPermission.query().whereNull(
      'role_system_permission_deleted_at'
    )
    assert.equal(afterGrants.length, beforeGrants.length)
    const granted = afterGrants.filter(
      (row) => row.systemPermissionId === permission!.systemPermissionId
    )
    assert.equal(granted.length, 0)
    void result
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/constants/employees_permission_catalog_granular.spec.ts`

Expected: FAIL (`manage-employee-supplies` ausente).

- [ ] **Step 3: Write minimal implementation**

En `app/constants/employees_permission_catalog.ts`, insertar **después** del bloque B (después de `...tabActionsNoDelete('consentimiento', 'Consentimiento'),`) y **antes** del comentario `// --- C) Listado (nuevas) ---`:

```typescript
  // --- Suministros del colaborador (USRH1785766406727): un permiso para todo el ciclo ---
  {
    slug: 'manage-employee-supplies',
    displayName: 'Administrar suministros del colaborador',
    kind: 'write',
    section: 'expediente',
    exceptionProfile: 'standard',
  },
```

No agregar `legacyEquivalence`: no es la misma decisión que `manage-files` ni que `tab-expediente-write`. El sync materializa la fila porque la relación no es `exact`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```
node ace test tests/unit/constants/employees_permission_catalog_granular.spec.ts
node ace test tests/unit/services/employees_permission_catalog_no_role_grants.spec.ts
npx tsc --noEmit
```

Expected: PASS. `tsc` acepta `manage-employee-supplies` como `EmployeeActionSlug`. El sync crea la fila si no existía y no escribe en `role_system_permissions`.

- [ ] **Step 5: Commit**

```bash
git add app/constants/employees_permission_catalog.ts \
  tests/unit/constants/employees_permission_catalog_granular.spec.ts \
  tests/unit/constants/employees_permission_catalog_slug_types.type_check.ts \
  tests/unit/services/employees_permission_catalog_no_role_grants.spec.ts
git commit -m "$(cat <<'EOF'
feat: Registrar permiso de suministros del colaborador

EOF
)"
```

---

### Task 2: Extender PermissionGate para OR de acciones

**Files:**
- Modify: `app/constants/permission_gate.ts`
- Modify: `app/services/permission_gate_service.ts`
- Modify: `tests/unit/services/permission_gate_service.spec.ts`

**Interfaces:**
- Consumes: `PermissionGateOptions` existente (`module`, `bypass`, `action: string`)
- Produces: `PermissionGateOptions.action: string | readonly string[]`. `evaluate` permite si **cualquiera** de los slugs está en el set concedido al rol. Interruptor apagado y bypass se resuelven una sola vez (igual que hoy). La negativa HTTP no cambia. No hay segundo named middleware.

Esta extensión es la pieza mínima para la regla 5: las tres operaciones de responsable/asignados aceptan cualquiera de los dos permisos de administrar. No es un sistema de autorización nuevo; es el mismo `evaluate` sobre el set que ya carga el servicio.

- [ ] **Step 1: Write the failing test**

En `tests/unit/services/permission_gate_service.spec.ts`, al final del grupo (antes del cierre), agregar. El fixture del grupo ya tiene `testModule`, `readPermission` y `plainRole`. El test crea un segundo permiso `write` y lo borra al terminar:

```typescript
  test('action lista: permite si cualquiera de los slugs está concedido', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const writePermission = await SystemPermission.create({
      systemPermissionName: 'Write',
      systemPermissionSlug: 'write',
      systemModuleId: testModule.systemModuleId,
    })
    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: writePermission.systemPermissionId,
    })

    try {
      const service = new PermissionGateService()
      const firstOnly = await service.evaluate(fakeUser(plainRole.roleId), {
        module: MODULE_SLUG,
        action: ['read', 'write'],
        bypass: 'strict',
      })
      assert.isTrue(firstOnly.allowed)
      assert.equal(firstOnly.reason, 'granted')

      const serviceSecond = new PermissionGateService()
      const neither = await serviceSecond.evaluate(fakeUser(plainRole.roleId), {
        module: MODULE_SLUG,
        action: ['missing-a', 'missing-b'],
        bypass: 'strict',
      })
      assert.isFalse(neither.allowed)
      assert.equal(neither.reason, 'denied')
    } finally {
      await grant.delete()
      await SystemPermission.query()
        .where('system_permission_id', writePermission.systemPermissionId)
        .delete()
    }
  })

  test('action lista: interruptor apagado permite sin resolver identidad', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = false
    await testModule.save()

    const service = new PermissionGateService()
    const decision = await service.evaluate(null, {
      module: MODULE_SLUG,
      action: ['read', 'write'],
      bypass: 'strict',
    })

    assert.isTrue(decision.allowed)
    assert.equal(decision.reason, 'module-not-enforced')
  })

  test('action lista: basta el segundo slug si el primero no está concedido', async ({ assert }) => {
    testModule.systemModulePermissionEnforcementActive = true
    await testModule.save()

    const grant = await RoleSystemPermission.create({
      roleId: plainRole.roleId,
      systemPermissionId: readPermission.systemPermissionId,
    })

    try {
      const service = new PermissionGateService()
      const decision = await service.evaluate(fakeUser(plainRole.roleId), {
        module: MODULE_SLUG,
        action: ['write', 'read'],
        bypass: 'strict',
      })
      assert.isTrue(decision.allowed)
      assert.equal(decision.reason, 'granted')
    } finally {
      await grant.delete()
    }
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/services/permission_gate_service.spec.ts`

Expected: FAIL (TypeScript y/o `granted?.has` sobre un array).

- [ ] **Step 3: Write minimal implementation**

En `app/constants/permission_gate.ts`, reemplazar el campo `action`:

```typescript
export interface PermissionGateOptions {
  module: string
  /**
   * Slug de la acción, o lista de slugs en OR: basta con que el rol tenga
   * cualquiera. Un solo permissionGate por ruta; no apilar dos gates.
   */
  action: string | readonly string[]
  bypass: PermissionGateBypass
}
```

En `app/services/permission_gate_service.ts`, dentro de `evaluate`, después de resolver `granted`, reemplazar el chequeo de un solo slug:

```typescript
      const granted = await this.grantedActionSlugs(identity.roleId, options.module)
      const actions = Array.isArray(options.action) ? options.action : [options.action]
      if (actions.some((slug) => granted?.has(slug))) {
        return { allowed: true, reason: 'granted' }
      }
      return { allowed: false, reason: 'denied' }
```

En el `catch`, serializar la acción para el log:

```typescript
        { err: error, module: options.module, action: options.action },
```

(`pino` serializa arrays; no hace falta `join`).

No tocar `respondPermissionGateDenial`. No registrar un segundo named middleware en `start/kernel.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/services/permission_gate_service.spec.ts`

Expected: PASS (los tests previos de `action: string` siguen pasando: `['read']` y `'read'` son equivalentes para `.has`).

- [ ] **Step 5: Commit**

```bash
git add app/constants/permission_gate.ts \
  app/services/permission_gate_service.ts \
  tests/unit/services/permission_gate_service.spec.ts
git commit -m "$(cat <<'EOF'
feat: Permitir OR de acciones en el PermissionGate

EOF
)"
```

---

### Task 3: Extender declaraciones de permiso (mapa 126 → 147)

**Files:**
- Modify: `app/constants/employees_write_permission_declarations.ts`
- Modify: `tests/unit/constants/employees_write_permission_declarations.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md`

**Interfaces:**
- Consumes: `employeesStandard(action)` (ahora acepta string o lista), `EMPLOYEES_PERMISSION_CATALOG` (asserts), Task 1 slug, Task 2 tipo
- Produces: 21 claves nuevas en `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS` (ver tabla)

- [ ] **Step 1: Write the failing test**

En `tests/unit/constants/employees_write_permission_declarations.spec.ts`:

1. Cambiar el conteo a 147 y hacer que el loop acepte `action` lista:

```typescript
test('declara exactamente 147 operaciones con module employees y bypass standard', ({ assert }) => {
  const keys = Object.keys(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS)
  assert.equal(keys.length, 147)

  const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((a) => a.slug))

  for (const key of keys) {
    const decl =
      EMPLOYEES_WRITE_PERMISSION_DECLARATIONS[
        key as keyof typeof EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
      ]
    assert.equal(decl.module, 'employees')
    assert.equal(decl.bypass, 'standard')
    const actions = Array.isArray(decl.action) ? decl.action : [decl.action]
    for (const slug of actions) {
      assert.isTrue(catalogSlugs.has(slug), `slug ausente en catálogo: ${slug} (${key})`)
    }
  }
})
```

2. Agregar el test de mapeo (conservar los tests existentes de Persona, Salud, Expediente, Turnos, Biométricos y Evaluaciones):

```typescript
test('mapea Zonas, Anotaciones, Bonificaciones, Responsable/Asignados y Activos de escritura', ({
  assert,
}) => {
  const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
  assert.equal(d.createEmployeeZone.action, 'tab-zonas-write')
  assert.equal(d.updateEmployeeZone.action, 'tab-zonas-write')
  assert.equal(d.deleteEmployeeZone.action, 'tab-zonas-delete')

  assert.equal(d.createEmployeeAnnotation.action, 'tab-anotaciones-write')
  assert.equal(d.updateEmployeeAnnotation.action, 'tab-anotaciones-write')
  assert.equal(d.deleteEmployeeAnnotation.action, 'tab-anotaciones-delete')

  assert.equal(d.createEmployeeBonus.action, 'tab-trabajo-write')
  assert.equal(d.updateEmployeeBonus.action, 'tab-trabajo-write')
  assert.equal(d.deleteEmployeeBonus.action, 'tab-trabajo-delete')

  assert.deepEqual(d.createUserResponsibleEmployee.action, [
    'manage-responsible-edit',
    'manage-assigned-edit',
  ])
  assert.deepEqual(d.updateUserResponsibleEmployee.action, [
    'manage-responsible-edit',
    'manage-assigned-edit',
  ])
  assert.deepEqual(d.deleteUserResponsibleEmployee.action, [
    'manage-responsible-edit',
    'manage-assigned-edit',
  ])

  assert.equal(d.createEmployeeSupply.action, 'manage-employee-supplies')
  assert.equal(d.updateEmployeeSupply.action, 'manage-employee-supplies')
  assert.equal(d.retireEmployeeSupply.action, 'manage-employee-supplies')
  assert.equal(d.deleteEmployeeSupply.action, 'manage-employee-supplies')
  assert.equal(d.createEmployeeSupplyResponseContract.action, 'manage-employee-supplies')
  assert.equal(d.deleteEmployeeSupplyResponseContract.action, 'manage-employee-supplies')
  assert.equal(d.uploadEmployeeSupplyAssignationPhoto.action, 'manage-employee-supplies')
  assert.equal(d.uploadEmployeeSupplyReturnPhoto.action, 'manage-employee-supplies')
  assert.equal(d.deleteEmployeeSupplyAssignationPhoto.action, 'manage-employee-supplies')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts`

Expected: FAIL (count 126 ≠ 147 y/o claves ausentes).

- [ ] **Step 3: Write minimal implementation**

En `app/constants/employees_write_permission_declarations.ts`:

1. Ampliar el helper para aceptar lista:

```typescript
const employeesStandard = (
  action: string | readonly string[]
): PermissionGateOptions => ({
  module: 'employees',
  action,
  bypass: 'standard',
})
```

2. Actualizar el comentario del mapa para incluir “+ Zonas/Anotaciones/Bonificaciones/Responsable/Activos”.

3. Agregar al final del objeto (antes del `} as const satisfies ...`):

```typescript
  createEmployeeZone: employeesStandard('tab-zonas-write'),
  updateEmployeeZone: employeesStandard('tab-zonas-write'),
  deleteEmployeeZone: employeesStandard('tab-zonas-delete'),
  createEmployeeAnnotation: employeesStandard('tab-anotaciones-write'),
  updateEmployeeAnnotation: employeesStandard('tab-anotaciones-write'),
  deleteEmployeeAnnotation: employeesStandard('tab-anotaciones-delete'),
  createEmployeeBonus: employeesStandard('tab-trabajo-write'),
  updateEmployeeBonus: employeesStandard('tab-trabajo-write'),
  deleteEmployeeBonus: employeesStandard('tab-trabajo-delete'),
  createUserResponsibleEmployee: employeesStandard([
    'manage-responsible-edit',
    'manage-assigned-edit',
  ]),
  updateUserResponsibleEmployee: employeesStandard([
    'manage-responsible-edit',
    'manage-assigned-edit',
  ]),
  deleteUserResponsibleEmployee: employeesStandard([
    'manage-responsible-edit',
    'manage-assigned-edit',
  ]),
  createEmployeeSupply: employeesStandard('manage-employee-supplies'),
  updateEmployeeSupply: employeesStandard('manage-employee-supplies'),
  retireEmployeeSupply: employeesStandard('manage-employee-supplies'),
  deleteEmployeeSupply: employeesStandard('manage-employee-supplies'),
  createEmployeeSupplyResponseContract: employeesStandard('manage-employee-supplies'),
  deleteEmployeeSupplyResponseContract: employeesStandard('manage-employee-supplies'),
  uploadEmployeeSupplyAssignationPhoto: employeesStandard('manage-employee-supplies'),
  uploadEmployeeSupplyReturnPhoto: employeesStandard('manage-employee-supplies'),
  deleteEmployeeSupplyAssignationPhoto: employeesStandard('manage-employee-supplies'),
```

4. En la convención `docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md`:

- En la tabla de la sección 1, agregar filas:

| Tipo de operación | Slug |
|-------------------|------|
| Zonas de trabajo del colaborador (asignar / modificar) | `tab-zonas-write` |
| Quitar zona de trabajo del colaborador | `tab-zonas-delete` |
| Anotaciones del historial (agregar / corregir) | `tab-anotaciones-write` |
| Eliminar anotación del historial | `tab-anotaciones-delete` |
| Bonificaciones (registrar / modificar) | `tab-trabajo-write` |
| Eliminar bonificación | `tab-trabajo-delete` |
| Asignación responsable ↔ colaborador (crear / modificar / eliminar) | `manage-responsible-edit` **o** `manage-assigned-edit` (OR) |
| Activos y suministros del colaborador (ciclo completo: asignación, retiro, contratos, fotografías) | `manage-employee-supplies` |

- En el punto 1 de “Cómo elegir el permiso”, añadir: “Excepción documentada: `manage-employee-supplies` se registró en USRH1785766406727 porque el módulo Activos del menú no tiene permisos sembrados y declarar el permiso ahí lo dejaría fuera del interruptor de Empleados.”

- Agregar sección 5 al final:

```markdown
## 5. Operación que acepta cualquiera de varios permisos (OR)

Cuando una misma operación HTTP sirve a dos pestañas del expediente y el
servidor no puede saber desde cuál se ejecuta (responsable y asignados):

1. Declarar un solo `permissionGate` en la ruta (no apilar dos gates: eso sería AND).
2. Pasar `action` como lista de slugs. `PermissionGateService.evaluate` permite
   si el rol tiene **cualquiera**.
3. Quien no tiene ninguno recibe la misma 403 (`PERM.DENIED` / `PERM.UNRESOLVED`).
4. Los permisos de consultar de esas pestañas no se declaran aquí: son lectura.

Ejemplo canónico: `POST/PUT/DELETE /api/user-responsible-employees` exige
`manage-responsible-edit` o `manage-assigned-edit`.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/constants/employees_write_permission_declarations.ts \
  tests/unit/constants/employees_write_permission_declarations.spec.ts \
  docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md
git commit -m "$(cat <<'EOF'
feat: Declarar permisos de zonas, anotaciones, bonos, responsable y activos

EOF
)"
```

---

### Task 4: Gate en rutas de zonas del colaborador

**Files:**
- Modify: `start/routes/employee_zone_routes.ts`
- Create: `tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts` (grupo Zonas; se ampliará en Tasks 5–8)

**Interfaces:**
- Consumes: `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeZone|updateEmployeeZone|deleteEmployeeZone`
- Produces: POST/PUT/DELETE de `/api/employee-zones` con `permissionGate`; GET sin gate. `/api/zones` (catálogo de la empresa) sin gate.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('employee_zone_routes — PermissionGate Zonas', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_zone_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeZone)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeZone)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeZone)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notMatch(
      compact(content),
      /get\('\/:employeeZoneId'[\s\S]*?\)\.use\(middleware\.permissionGate/
    )
  })

  test('el catálogo de zonas de la empresa no declara permissionGate de Empleados', async ({
    assert,
  }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/zone_routes.ts'), 'utf8')
    assert.notInclude(content, 'permissionGate')
    assert.notInclude(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

Expected: FAIL (no hay `permissionGate` en `employee_zone_routes.ts`).

- [ ] **Step 3: Write minimal implementation**

Reemplazar `start/routes/employee_zone_routes.ts` por:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/employee_zone_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeZone))
    router
      .put('/:employeeZoneId', '#controllers/employee_zone_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeZone))
    router
      .delete('/:employeeZoneId', '#controllers/employee_zone_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeZone))
    router.get('/:employeeZoneId', '#controllers/employee_zone_controller.show')
  })
  .prefix('/api/employee-zones')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_zone_routes.ts \
  tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso en la escritura de zonas del colaborador

EOF
)"
```

---

### Task 5: Gate en rutas de anotaciones del historial

**Files:**
- Modify: `start/routes/employee_annotation_routes.ts`
- Modify: `tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: `createEmployeeAnnotation|updateEmployeeAnnotation|deleteEmployeeAnnotation`
- Produces: POST/PUT/DELETE con gate; GET `/`, GET `/employee/:employeeId`, GET `/:id` sin gate. El controlador de `update` conserva la verificación de autoría intacta (no se edita el controlador).

- [ ] **Step 1: Write the failing test**

Agregar al spec de rutas:

```typescript
test.group('employee_annotation_routes — PermissionGate Anotaciones', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_annotation_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAnnotation)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAnnotation)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAnnotation)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notInclude(compact(content), "get('/').use(middleware.permissionGate")
    assert.notInclude(
      compact(content),
      "get('/employee/:employeeId').use(middleware.permissionGate"
    )
    assert.notInclude(
      compact(content),
      "get('/:employeeAnnotationId').use(middleware.permissionGate"
    )
  })

  test('el controlador de update conserva el mensaje de autoría vigente', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/employee_annotation_controller.ts'),
      'utf8'
    )
    assert.include(content, 'Only the original creator can update this annotation')
    assert.include(content, 'currentEmployeeAnnotation.userId !== user.userId')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

Expected: FAIL en el grupo de anotaciones (rutas sin gate). El test de autoría ya pasa: no se toca el controlador.

- [ ] **Step 3: Write minimal implementation**

En `start/routes/employee_annotation_routes.ts`, importar declaraciones y colgar el gate solo en escrituras. Conservar `auth()` + `businessScope()` en el grupo. El archivo usa instancia del controlador; no cambiar eso:

```typescript
import router from '@adonisjs/core/services/router'
import EmployeeAnnotationController from '#controllers/employee_annotation_controller'
import { middleware } from '../kernel.js'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

const employeeAnnotationController = new EmployeeAnnotationController()

router
  .group(() => {
    router.get('/', employeeAnnotationController.index)
    router
      .post('/', employeeAnnotationController.store)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeAnnotation)
      )
    router.get('/employee/:employeeId', employeeAnnotationController.getByEmployee)
    router.get('/:employeeAnnotationId', employeeAnnotationController.show)
    router
      .put('/:employeeAnnotationId', employeeAnnotationController.update)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeAnnotation)
      )
    router
      .delete('/:employeeAnnotationId', employeeAnnotationController.delete)
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeAnnotation)
      )
  })
  .use(middleware.auth())
  .use(middleware.businessScope())
  .prefix('/api/employee-annotations')
```

No editar `app/controllers/employee_annotation_controller.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_annotation_routes.ts \
  tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso en la escritura de anotaciones del historial

EOF
)"
```

---

### Task 6: Gate en rutas de bonificaciones

**Files:**
- Modify: `start/routes/employee_bonus_routes.ts`
- Modify: `tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: `createEmployeeBonus|updateEmployeeBonus|deleteEmployeeBonus` (`tab-trabajo-write` / `tab-trabajo-delete`)
- Produces: POST/PUT/DELETE con gate; GET `/`, GET `/concepts/:employeeId`, GET `/:id` sin gate

- [ ] **Step 1: Write the failing test**

```typescript
test.group('employee_bonus_routes — PermissionGate Bonificaciones', () => {
  test('escrituras declaran permissionGate de Trabajo y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_bonus_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBonus)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBonus)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeBonus)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notInclude(compact(content), "get('/').use(middleware.permissionGate")
    assert.notInclude(
      compact(content),
      "get('/concepts/:employeeId').use(middleware.permissionGate"
    )
    assert.notInclude(compact(content), "get('/:employeeBonusId').use(middleware.permissionGate")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

Expected: FAIL en el grupo de bonificaciones.

- [ ] **Step 3: Write minimal implementation**

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/employee_bonus_controller.index')
    router
      .post('/', '#controllers/employee_bonus_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBonus))
    router.get('/concepts/:employeeId', '#controllers/employee_bonus_controller.concepts')
    router.get('/:employeeBonusId', '#controllers/employee_bonus_controller.show')
    router
      .put('/:employeeBonusId', '#controllers/employee_bonus_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBonus))
    router
      .delete('/:employeeBonusId', '#controllers/employee_bonus_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeBonus))
  })
  .prefix('/api/employee-bonuses')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_bonus_routes.ts \
  tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso de Trabajo en la escritura de bonificaciones

EOF
)"
```

---

### Task 7: Gate en rutas de responsable y personal asignado

**Files:**
- Modify: `start/routes/user_responsible_employee_routes.ts`
- Modify: `tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: `createUserResponsibleEmployee|updateUserResponsibleEmployee|deleteUserResponsibleEmployee` (`action` lista OR)
- Produces: POST/PUT/DELETE con un solo `permissionGate` cada uno; GET `/:id` sin gate. No hay segundo middleware.

- [ ] **Step 1: Write the failing test**

```typescript
test.group('user_responsible_employee_routes — PermissionGate Responsable/Asignados', () => {
  test('escrituras declaran un solo permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/user_responsible_employee_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createUserResponsibleEmployee)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateUserResponsibleEmployee)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteUserResponsibleEmployee)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notInclude(
      compact(content),
      "get('/:userResponsibleEmployeeId').use(middleware.permissionGate"
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

Expected: FAIL en el grupo de responsable.

- [ ] **Step 3: Write minimal implementation**

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/', '#controllers/user_responsible_employee_controller.store')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createUserResponsibleEmployee
        )
      )
    router
      .put('/:userResponsibleEmployeeId', '#controllers/user_responsible_employee_controller.update')
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateUserResponsibleEmployee
        )
      )
    router.get(
      '/:userResponsibleEmployeeId',
      '#controllers/user_responsible_employee_controller.show'
    )
    router
      .delete(
        '/:userResponsibleEmployeeId',
        '#controllers/user_responsible_employee_controller.delete'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteUserResponsibleEmployee
        )
      )
  })
  .prefix('/api/user-responsible-employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

Un gate por escritura. El OR vive en la declaración (`action` lista), no en dos `.use()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add start/routes/user_responsible_employee_routes.ts \
  tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso de administrar en la asignación de responsable

EOF
)"
```

---

### Task 8: Gate en rutas de activos, contratos y fotografías

**Files:**
- Modify: `start/routes/employee_supplies.ts`
- Modify: `start/routes/employee_supplies_response_contracts.ts`
- Modify: `start/routes/employee_supply_assignament_photo.ts`
- Modify: `tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: las 9 claves `*EmployeeSupply*` / `*Photo*` / `*Contract*` (`manage-employee-supplies`)
- Produces: 4 escrituras de asignación + 2 de contratos + 3 de fotos con gate; GET sin gate. Catálogos `/api/supplies` y `/api/supply-types` sin gate. Fotos: **no** agregar `businessScope()` (orden 1). El gate en la ruta garantiza que `UploadService.fileUpload` no corre si falta permiso.

Barrido D-08 (pendiente de esta historia): confirmar en este repositorio que estas 9 rutas viven solo bajo `middleware.auth()` de backoffice. Si apareciera una escritura del colaborador (firma de recepción), marcarla exenta y documentarla como deuda con dueño Wilvardo; no bloquear el resto.

- [ ] **Step 1: Write the failing test**

Agregar al spec de rutas:

```typescript
test.group('employee_supplies — PermissionGate Activos', () => {
  test('escrituras de asignación declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_supplies.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeSupply)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeSupply)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.retireEmployeeSupply)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSupply)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 4)
  })

  test('el catálogo de insumos de la empresa no declara permissionGate de Empleados', async ({
    assert,
  }) => {
    const supplies = await readFile(join(process.cwd(), 'start/routes/supplies.ts'), 'utf8')
    const types = await readFile(join(process.cwd(), 'start/routes/supply_type.ts'), 'utf8')
    assert.notInclude(supplies, 'permissionGate')
    assert.notInclude(types, 'permissionGate')
  })
})

test.group('employee_supplies_response_contracts — PermissionGate contratos', () => {
  test('POST y DELETE declaran permissionGate; GET no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_supplies_response_contracts.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeSupplyResponseContract)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSupplyResponseContract)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 2)
    assert.notInclude(content, 'permissionGateAnyOf')
  })
})

test.group('employee_supply_assignament_photo — PermissionGate fotografías', () => {
  test('POST entrega, POST devolución y DELETE declaran permissionGate; GET no', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_supply_assignament_photo.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeSupplyAssignationPhoto)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeSupplyReturnPhoto)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSupplyAssignationPhoto)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notInclude(content, 'businessScope')
  })
})
```

Barrido (paso del implementador, no un test de Japa): `rg "employee-supplies|employee-supply-assignation|employee-zones|employee-annotations|employee-bonuses|user-responsible-employees" start/routes --glob '*.ts'`. Confirmar que no hay grupo sin `middleware.auth()`. Resultado esperado al escribir este plan: las 21 operaciones están bajo `auth()`. No hay escritura del colaborador en este API para estos endpoints. Si el barrido encuentra una, detenerse y documentar exemption con owner Wilvardo.

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

Expected: FAIL en los tres grupos de activos.

- [ ] **Step 3: Write minimal implementation**

`start/routes/employee_supplies.ts`:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post('/employee-supplies', '#controllers/employee_supplies_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeSupply))
    router.get('/employee-supplies', '#controllers/employee_supplies_controller.index')
    router.get('/employee-supplies/:id', '#controllers/employee_supplies_controller.show')
    router
      .put('/employee-supplies/:id', '#controllers/employee_supplies_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeSupply))
    router
      .delete('/employee-supplies/:id', '#controllers/employee_supplies_controller.destroy')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSupply))
    router
      .post('/employee-supplies/:id/retire', '#controllers/employee_supplies_controller.retire')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.retireEmployeeSupply))
    router.get(
      '/employee-supplies/:id/with-relations',
      '#controllers/employee_supplies_controller.getWithRelations'
    )
    router.get(
      '/employee-supplies/by-employee/:employeeId',
      '#controllers/employee_supplies_controller.getByEmployee'
    )
    router.get(
      '/employee-supplies/active-by-employee/:employeeId',
      '#controllers/employee_supplies_controller.getActiveByEmployee'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

`start/routes/employee_supplies_response_contracts.ts`:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post(
        '/employee-supplies-response-contracts',
        '#controllers/employee_supplies_response_contracts_controller.store'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeSupplyResponseContract
        )
      )
    router.get(
      '/employee-supplies-response-contracts',
      '#controllers/employee_supplies_response_contracts_controller.index'
    )
    router.get(
      '/employee-supplies-response-contracts/:id',
      '#controllers/employee_supplies_response_contracts_controller.show'
    )
    router.get(
      '/employee-supplies-response-contracts/by-uuid/:uuid',
      '#controllers/employee_supplies_response_contracts_controller.getByUuid'
    )
    router
      .delete(
        '/employee-supplies-response-contracts/:id',
        '#controllers/employee_supplies_response_contracts_controller.destroy'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSupplyResponseContract
        )
      )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

`start/routes/employee_supply_assignament_photo.ts` — gate en escrituras, **sin** añadir `businessScope()`:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .post(
        '/employee-supply-assignation-photos/:employeeSupplyId/assignation',
        '#controllers/employee_supplie_assignation_photos_controller.uploadAssignation'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeSupplyAssignationPhoto
        )
      )
    router
      .post(
        '/employee-supply-assignation-photos/:employeeSupplyId/return',
        '#controllers/employee_supplie_assignation_photos_controller.uploadReturn'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeSupplyReturnPhoto
        )
      )
    router.get(
      '/employee-supply-assignation-photos/:employeeSupplyId/assignation',
      '#controllers/employee_supplie_assignation_photos_controller.getAssignation'
    )
    router.get(
      '/employee-supply-assignation-photos/:employeeSupplyId/return',
      '#controllers/employee_supplie_assignation_photos_controller.getReturn'
    )
    router
      .delete(
        '/employee-supply-assignation-photos/:photoId',
        '#controllers/employee_supplie_assignation_photos_controller.delete'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeSupplyAssignationPhoto
        )
      )
  })
  .prefix('/api')
  .use(middleware.auth())
```

Si al mergear la orden 1 el grupo ya trae `businessScope()`, dejarlo y colocar `permissionGate` en cada escritura (después de `auth` / `businessScope` del grupo). No revertir el alcance por unidad de negocio.

El middleware corre antes del controlador: `uploadAssignation` / `uploadReturn` / `store` de contratos no invocan `UploadService.fileUpload` si el gate niega. No hace falta mover código dentro del controlador.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts`

Expected: PASS (todos los grupos de Tasks 4–8).

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_supplies.ts \
  start/routes/employee_supplies_response_contracts.ts \
  start/routes/employee_supply_assignament_photo.ts \
  tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso en la escritura de activos, contratos y evidencias

EOF
)"
```

---

### Task 9: Pruebas funcionales — soft-rollout, matriz ON, OR, autoría y evidencia

**Files:**
- Create: `tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts`

**Interfaces:**
- Consumes: las 21 rutas con gate, `SystemPermissionCatalogSyncService` (materializa `manage-employee-supplies` si el entorno de test aún no lo tiene), interruptor del módulo `employees`
- Produces: evidencia de regla 9 (apagado = nadie nota el cambio), reglas 2/4/5/6/7/12 y conservación de autoría (regla 3)

Patrón: copiar helpers de `tests/functional/employees/employees_biometricos_dispositivos_permission_gate.spec.ts` (`createActor`, `createSystemActor`, `createEmployeeFixture`, `grantOnly`, `permissionId`, `snapshotAndClearEmployeesGrants`, `restoreEmployeesGrants`, `disableEnforcementAndVerify`, `assertPermissionDenied`, `assertNotPermissionDenied`, `buHeader`). Adaptar prefijos (`ZonasActivos` en vez de `Bio`). En `group.setup` de cada grupo ON, llamar `await new SystemPermissionCatalogSyncService().sync()` para que `permissionId('manage-employee-supplies')` no falle.

Teardown de **todos** los grupos: `disableEnforcementAndVerify` en `finally` para no dejar el interruptor encendido.

- [ ] **Step 1: Write the failing tests**

Crear el archivo con estos grupos. Los helpers se copian del spec de biométricos (mismos campos de `BusinessUnit` / `Role` / `Employee`); se añaden fixtures de zona, suministro y anotación.

Helpers adicionales a incluir (además de los copiados):

```typescript
import Zone from '#models/zone'
import EmployeeZone from '#models/employee_zone'
import EmployeeAnnotation from '#models/employee_annotation'
import EmployeeBonus from '#models/employee_bonus'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import SupplyType from '#models/supply_type'
import Supply from '#models/supplie'
import EmployeeSupplie from '#models/employee_supplie'
import EmployeeSupplieAssignationPhoto from '#models/employee_supplie_assignation_photo'
import SystemPermissionCatalogSyncService from '#services/system_permission_catalog_sync_service'
import { DateTime } from 'luxon'

const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

async function createZoneFixture(prefix: string) {
  const stamp = await uniqueStamp()
  return Zone.create({
    zoneName: `Zona ${prefix} ${stamp}`,
    zoneAddress: 'Calle de prueba',
    zonePolygon: '[]',
  })
}

async function createSupplyFixture(prefix: string) {
  const stamp = await uniqueStamp()
  const supplyType = await SupplyType.create({
    supplyTypeName: `Tipo ${prefix} ${stamp}`,
    supplyTypeSlug: `tipo-${prefix}-${stamp}`,
  })
  const supply = await Supply.create({
    supplyFileNumber: Number(`${Date.now()}${Math.floor(Math.random() * 100)}`.slice(-9)),
    supplyName: `Herramienta ${prefix} ${stamp}`,
    supplyTypeId: supplyType.supplyTypeId,
    supplyStatus: 'active',
  })
  return { supplyType, supply }
}

function bonusPayload(employeeId: number) {
  return {
    employeeId,
    employeeBonusConcept: 'Bono de asistencia',
    employeeBonusQuantity: 1,
    employeeBonusUnitAmount: 100,
    employeeBonusTotal: 100,
    employeeBonusAssignmentDate: '2026-08-01',
    employeeBonusPaymentDate: '2026-08-15',
  }
}
```

En `cleanupEmployeeFixture`, borrar también zonas, anotaciones, bonos, responsable, supplies y fotos ligadas al `employeeId` (hard delete en las tablas hijas, igual que biométricos).

**Grupo A — soft-rollout (exigencia OFF)**

```typescript
test.group('Zonas/Anotaciones/Bonos/Responsable/Activos - soft-rollout (exigencia OFF)', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule

  group.setup(async () => {
    await new SystemPermissionCatalogSyncService().sync()
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('za-off')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'off')
    await grantOnly(actor.role.roleId, [])
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('sin grants: las 21 escrituras no responden PERM.DENIED', async ({ client, assert }) => {
    const employeeId = fixture!.employee.employeeId
    const zone = await createZoneFixture('off')
    const { supply } = await createSupplyFixture('off')
    const assignment = await EmployeeSupplie.create({
      employeeId,
      supplyId: supply.supplyId,
      employeeSupplyStatus: 'active',
      employeeSupplyAssignamentDate: DateTime.now(),
    })

    const ops = [
      client.post('/api/employee-zones').loginAs(actor!.user).headers(buHeader(actor!)).json({
        employeeId,
        zoneId: zone.zoneId,
      }),
      client.post('/api/employee-annotations').loginAs(actor!.user).headers(buHeader(actor!)).json({
        employeeId,
        employeeAnnotationContent: 'Nota de prueba',
      }),
      client
        .post('/api/employee-bonuses')
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json(bonusPayload(employeeId)),
      client
        .post('/api/user-responsible-employees')
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ userId: actor!.user.userId, employeeId }),
      client.post('/api/employee-supplies').loginAs(actor!.user).headers(buHeader(actor!)).json({
        employeeId,
        supplyId: supply.supplyId,
        employeeSupplyAssignamentDate: '2026-08-01',
      }),
      client
        .post(`/api/employee-supply-assignation-photos/${assignment.employeeSupplyId}/assignation`)
        .loginAs(actor!.user)
        .file('photos', VALID_PNG_BUFFER, { filename: 'evidencia.png', contentType: 'image/png' }),
    ]

    for (const pending of ops) {
      const response = await pending
      assertNotPermissionDenied(assert, response)
    }
  })
})
```

**Grupo B — exigencia ON, matriz de negocio**

`group.setup`: `enforcementActive = true`, sync, actor con grants vacíos, fixture, zona, supply.

Tests (cada uno hace `grantOnly` y afirma el resultado):

1. `tab-zonas-write` permite asignar zona; el mismo rol sin `tab-trabajo-write` recibe `PERM.DENIED` al registrar bonificación; la zona queda persistida; no hay fila en `employee_bonuses`.

```typescript
  test('zonas sí y bonificaciones no: la zona queda y la bonificación no se registra', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-zonas-write'])
    const zone = await createZoneFixture('sep')
    const zoneRes = await client
      .post('/api/employee-zones')
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ employeeId: fixture!.employee.employeeId, zoneId: zone.zoneId })
    assertNotPermissionDenied(assert, zoneRes)
    const storedZone = await EmployeeZone.query()
      .where('employee_id', fixture!.employee.employeeId)
      .where('zone_id', zone.zoneId)
      .whereNull('employee_zone_deleted_at')
      .first()
    assert.isNotNull(storedZone)

    const bonusRes = await client
      .post('/api/employee-bonuses')
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json(bonusPayload(fixture!.employee.employeeId))
    assertPermissionDenied(assert, bonusRes)
    const bonusCount = await EmployeeBonus.query()
      .where('employee_id', fixture!.employee.employeeId)
      .whereNull('employee_bonus_deleted_at')
    assert.equal(bonusCount.length, 0)
  })
```

2. `tab-anotaciones-write` permite crear y corregir la propia; DELETE responde `PERM.DENIED` y la anotación sigue. Luego `tab-anotaciones-delete` permite borrar.

3. Autoría (regla 3): dos actores con `tab-anotaciones-write`. A crea la anotación. B hace PUT y recibe 403 con `message: 'Only the original creator can update this annotation'` y `key` distinto de `PERM.DENIED`. A hace PUT y no recibe `PERM.DENIED`.

```typescript
  test('corregir anotación ajena conserva el mensaje de autoría, no PERM.DENIED', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-anotaciones-write'])
    const other = await createActor('za-other')
    await grantOnly(other.role.roleId, ['tab-anotaciones-write'])
    try {
      const created = await EmployeeAnnotation.create({
        employeeId: fixture!.employee.employeeId,
        employeeAnnotationContent: 'Nota del autor original',
        employeeAnnotationActive: true,
        userId: actor!.user.userId,
      })
      const denied = await client
        .put(`/api/employee-annotations/${created.employeeAnnotationId}`)
        .loginAs(other.user)
        .headers(buHeader(actor!))
        .json({ employeeAnnotationContent: 'Intento ajeno' })
      assert.equal(denied.status(), 403)
      assert.equal(denied.body()?.message, 'Only the original creator can update this annotation')
      assert.notEqual(denied.body()?.key, 'PERM.DENIED')

      const own = await client
        .put(`/api/employee-annotations/${created.employeeAnnotationId}`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ employeeAnnotationContent: 'Corrección propia' })
      assertNotPermissionDenied(assert, own)
    } finally {
      await cleanupActor(other)
    }
  })
```

4. Borrar anotación ajena: con `tab-anotaciones-delete` no responde `PERM.DENIED` (no hay regla de autoría en delete).

5. OR responsable: solo `manage-responsible-edit` permite POST/PUT/DELETE de `/api/user-responsible-employees`. Solo `manage-assigned-edit` también. Sin ninguno → `PERM.DENIED` y la fila vigente no cambia.

```typescript
  test('basta manage-responsible-edit o manage-assigned-edit; sin ninguno se niega', async ({
    client,
    assert,
  }) => {
    const employeeId = fixture!.employee.employeeId
    await grantOnly(actor!.role.roleId, ['manage-responsible-edit'])
    const withResponsible = await client
      .post('/api/user-responsible-employees')
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ userId: actor!.user.userId, employeeId })
    assertNotPermissionDenied(assert, withResponsible)

    await grantOnly(actor!.role.roleId, ['manage-assigned-edit'])
    const assignment = await UserResponsibleEmployee.create({
      userId: actor!.user.userId,
      employeeId,
      userResponsibleEmployeeReadonly: 0,
      userResponsibleEmployeeDirectBoss: 1,
    })
    const withAssigned = await client
      .put(`/api/user-responsible-employees/${assignment.userResponsibleEmployeeId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({
        userId: actor!.user.userId,
        employeeId,
        userResponsibleEmployeeReadonly: 0,
        userResponsibleEmployeeDirectBoss: 0,
      })
    assertNotPermissionDenied(assert, withAssigned)

    await grantOnly(actor!.role.roleId, [])
    const denied = await client
      .delete(`/api/user-responsible-employees/${assignment.userResponsibleEmployeeId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertPermissionDenied(assert, denied)
    const still = await UserResponsibleEmployee.query()
      .where('user_responsible_employee_id', assignment.userResponsibleEmployeeId)
      .whereNull('user_responsible_employee_deleted_at')
      .first()
    assert.isNotNull(still)
  })
```

6. Activos: sin `manage-employee-supplies`, POST de entrega con foto → `PERM.DENIED`, cero filas en `employee_supplies` nuevas y cero en `employee_supplie_assignation_photos`. Con `tab-expediente-write` + `manage-files` (sin el de suministros) también `PERM.DENIED` (deslinde). Con `manage-employee-supplies`, las 9 operaciones no responden `PERM.DENIED`.

```typescript
  test('sin manage-employee-supplies la foto no se almacena y no se crea la asignación', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-expediente-write', 'manage-files'])
    const { supply } = await createSupplyFixture('deny-photo')
    const photosBefore = await EmployeeSupplieAssignationPhoto.query()
    const suppliesBefore = await EmployeeSupplie.query().where(
      'employee_id',
      fixture!.employee.employeeId
    )

    const createDenied = await client
      .post('/api/employee-supplies')
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({
        employeeId: fixture!.employee.employeeId,
        supplyId: supply.supplyId,
        employeeSupplyAssignamentDate: '2026-08-01',
      })
    assertPermissionDenied(assert, createDenied)

    const orphan = await EmployeeSupplie.create({
      employeeId: fixture!.employee.employeeId,
      supplyId: supply.supplyId,
      employeeSupplyStatus: 'active',
      employeeSupplyAssignamentDate: DateTime.now(),
    })
    const photoDenied = await client
      .post(`/api/employee-supply-assignation-photos/${orphan.employeeSupplyId}/assignation`)
      .loginAs(actor!.user)
      .file('photos', VALID_PNG_BUFFER, { filename: 'evidencia.png', contentType: 'image/png' })
    assertPermissionDenied(assert, photoDenied)

    const photosAfter = await EmployeeSupplieAssignationPhoto.query()
    assert.equal(photosAfter.length, photosBefore.length)
    const suppliesAfter = await EmployeeSupplie.query()
      .where('employee_id', fixture!.employee.employeeId)
      .whereNull('employee_supply_deleted_at')
    assert.equal(suppliesAfter.length, suppliesBefore.length + 1)
  })
```

El `orphan` se crea por el test para tener un `employeeSupplyId` contra el cual pegarle al endpoint de foto; la foto rechazada no agrega filas. La asignación HTTP `POST /api/employee-supplies` no debe haber creado una segunda fila (solo el `orphan` insertado a mano).

7. Con `manage-employee-supplies`: POST asignación, PUT, POST retire, DELETE, POST contrato (archivo mínimo), DELETE contrato, POST foto entrega, POST foto devolución, DELETE foto — ninguna responde `PERM.DENIED`.

**Grupo C — bypass standard**

```typescript
test.group('Zonas/Anotaciones/Bonos/Responsable/Activos - bypass standard', (group) => {
  // setup: enforcement ON, owner + root + super-administrador (slug super-administrador)
  // teardown: restore grants + disableEnforcementAndVerify

  test('owner y root sin grants no reciben PERM.DENIED en POST zona y POST bono', async ({
    client,
    assert,
  }) => {
    ownerGrants = await snapshotAndClearEmployeesGrants(ownerActor!.roleId)
    rootGrants = await snapshotAndClearEmployeesGrants(rootActor!.roleId)
    const zone = await createZoneFixture('bypass')
    for (const systemActor of [ownerActor!, rootActor!]) {
      const zoneRes = await client
        .post('/api/employee-zones')
        .loginAs(systemActor.user)
        .headers(buHeader(systemActor))
        .json({ employeeId: fixtureFor(systemActor).employee.employeeId, zoneId: zone.zoneId })
      assertNotPermissionDenied(assert, zoneRes)
    }
  })

  test('super-administrador sin grants recibe PERM.DENIED', async ({ client, assert }) => {
    const direccion = await createSystemActor('super-administrador', 'za-dg')
    const dgGrants = await snapshotAndClearEmployeesGrants(direccion.roleId)
    try {
      const zone = await createZoneFixture('dg')
      const dgFixture = await createEmployeeFixture(direccion.businessUnit.businessUnitId, 'dg')
      const denied = await client
        .post('/api/employee-zones')
        .loginAs(direccion.user)
        .headers(buHeader(direccion))
        .json({ employeeId: dgFixture.employee.employeeId, zoneId: zone.zoneId })
      assertPermissionDenied(assert, denied)
      await cleanupEmployeeFixture(dgFixture)
    } finally {
      await restoreEmployeesGrants(dgGrants)
      await cleanupSystemActor(direccion)
    }
  })
})
```

Completar el archivo con cleanup de `Zone`, `Supply`, `SupplyType` creados en cada test (borrar por id al final del test o en teardown) para no ensuciar la BD de prueba.

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts`

Expected: FAIL si alguna ruta quedó sin gate, o PASS en soft-rollout y FAIL en matriz ON. Si Tasks 4–8 están hechas, el spec debe poder llegar a rojo/verde por fixtures, no por ausencia de middleware.

- [ ] **Step 3: Write minimal implementation**

No hay código de producción nuevo en esta task: si un test de matriz ON falla porque una de las 21 rutas no declara gate, volver a la task de esa ruta. Si falla `permissionId('manage-employee-supplies')`, el `sync()` del setup no corrió o el catálogo no tiene la entrada (Task 1).

- [ ] **Step 4: Run test to verify it passes**

Run:

```
node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts
node ace test tests/unit/routes/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate_routes.spec.ts
node ace test tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts
```

Expected: PASS. Tras el suite, `system_modules.system_module_permission_enforcement_active` del módulo `employees` sigue en `false`.

- [ ] **Step 5: Commit**

```bash
git add tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir exigencia de permisos en zonas, anotaciones, bonos, responsable y activos

EOF
)"
```

---

### Task 10: Completar huecos funcionales y matriz QA (OFF/ON, API + BO)

**Files:**
- Modify: `tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts`
- Create: `docs/superpowers/plans/2026-08-13-employees-zonas-anotaciones-bonificaciones-activos-permission-gate-qa-scenarios.md`

**Interfaces:**
- Consumes: mismos helpers del spec funcional (`grantOnly`, `assertPermissionDenied`, `assertSuccess`, `bonusPayload`, `responsiblePayload`, `buHeader`, teardown que apaga el interruptor)
- Produces: F-ON.7 (bonos write ≠ delete), F-ON.11 (consultar no otorga escribir), F-ON.15 (GET sin `PERM.DENIED`), F-ON.16 (catálogos), F-ON.17 (401 sin sesión), F-ON.18 (`full-employee-assigned` no abre escritura). Matriz e2e API/BO documentada; no hay Playwright en este repo.

El código exacto de los seis tests está en `docs/superpowers/plans/2026-08-13-employees-zonas-anotaciones-bonificaciones-activos-permission-gate-qa-scenarios.md` §2 (bloque “Código de los huecos”). Pegarlo en el grupo ON del spec, antes del cierre de `test.group`. No crear un segundo archivo de tests.

- [ ] **Step 1: Write the failing tests**

Pegar en el grupo `Zonas/Anotaciones/Bonos/Responsable/Activos - matriz con exigencia ON` los tests:

- `tab-trabajo-write permite POST y PUT de bono, DELETE exige tab-trabajo-delete`
- `consultar responsable o asignados no permite escribir la asignación`
- `GET de las mismas familias sin permiso de escritura no responde PERM.DENIED`
- `catálogos de zonas e insumos no responden PERM.DENIED`
- `sin sesión las escrituras no responden PERM.DENIED`
- `full-employee-assigned no abre escritura de zona ni bono` (`grantOnly(..., ['full-employee-assigned'])`, POST zona y POST bono → `PERM.DENIED`)

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts`

Expected: FAIL solo si un hueco no está implementado en el spec (el gate ya está en las rutas). Los cinco primeros deben PASS si Task 9 está hecha; F-ON.18 FAIL únicamente si `full-employee-assigned` no existe en BD de test — en ese caso omitir el test y documentarlo en el QA como manual E-API-ON.

- [ ] **Step 3: Write minimal implementation**

No hay código de producción. Si F-ON.7 falla porque DELETE de bono no declara `tab-trabajo-delete`, volver a Task 6. Si F-ON.11 falla porque el OR incluye los slugs `-read`, corregir la declaración de Task 3: la lista es solo `manage-responsible-edit` y `manage-assigned-edit`.

Confirmar que el archivo QA existe en `docs/superpowers/plans/2026-08-13-employees-zonas-anotaciones-bonificaciones-activos-permission-gate-qa-scenarios.md` con las capas unit, functional, e2e API OFF/ON y e2e BO OFF/ON.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts`

Expected: PASS. Interruptor de `employees` queda `false`.

- [ ] **Step 5: Commit**

```bash
git add tests/functional/employees/employees_zonas_anotaciones_bonos_responsable_activos_permission_gate.spec.ts \
  docs/superpowers/plans/2026-08-13-employees-zonas-anotaciones-bonificaciones-activos-permission-gate-qa-scenarios.md
git commit -m "$(cat <<'EOF'
test: Completar matriz de permisos en zonas, bonos, responsable y lecturas

EOF
)"
```

---

## Self-Review

**1. Spec coverage**

| Regla / requisito | Task |
|-------------------|------|
| 21 escrituras exigen permiso | 3 (mapa) + 4–8 (rutas) + 9 (HTTP) |
| Zonas/anotaciones write ≠ delete | 3, 5, 9 |
| Autoría de anotaciones intacta, mensaje de siempre | 5 (guard de controlador), 9 (HTTP) |
| Bonificaciones = Trabajo | 3, 6, 9 |
| OR responsable/asignados; consultar fuera de alcance | 2, 3, 7, 9 |
| `manage-employee-supplies` nuevo, fotos/contratos heredan, foto antes de S3 | 1, 8, 9 |
| Un permiso para todo el ciclo del activo | 3, 8, 9 |
| Exactamente un permiso nuevo, sync sin migraciones | 1 |
| Entrega con exigencia apagada | 9 grupo A; no se escribe el flag en producción |
| No conceder a roles | 1 (sync test) |
| Owner/root bypass; dirección general no | 9 grupo C |
| Suma a auth + businessScope; no arreglar BU de fotos | 8 (guard `notInclude businessScope`) |
| Negativa estándar | 2 (no se toca `permission_gate_http`) + 9 asserts |
| Catálogos de zonas/activos fuera | 4 y 8 guards |
| Lecturas / descargas / backoffice UI / orden 1 fuera | no se tocan esas rutas salvo el gate de escritura |
| Barrido app colaborador | Task 8 (rg); resultado al planear: solo `auth()`, sin escritura del colaborador |
| Matriz unit + functional + e2e API/BO OFF y ON | Task 10 + archivo QA |

**2. Placeholder scan:** sin TBD / “implement later” / “similar to Task N” sin código.

**3. Type consistency:** claves del mapa Task 3 = las que consumen Tasks 4–8 = las que pega Task 9. Slug `manage-employee-supplies` nace en Task 1. OR usa `action: string | readonly string[]` de Task 2. No se usa `tab-responsable-write`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-13-employees-zonas-anotaciones-bonificaciones-activos-permission-gate.md`. Matriz de escenarios en `docs/superpowers/plans/2026-08-13-employees-zonas-anotaciones-bonificaciones-activos-permission-gate-qa-scenarios.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
