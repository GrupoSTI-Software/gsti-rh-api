# Exigir permiso en escritura de Biométricos y Dispositivos del colaborador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declarar en el servidor el permiso que exige cada una de las 9 operaciones de escritura de biométricos (foto de rostro, huellas, registro biométrico) y dispositivos del colaborador, con soft-rollout (exigencia del módulo apagada), negativa estándar antes de tocar almacenamiento, y sin alterar checada facial ni alta automática de teléfono.

**Architecture:** Se reutiliza el `PermissionGate` declarativo (USRH1785766406721 / orden 3), el catálogo de permisos del módulo Empleados (orden 4) y la convención de declaración de la orden 7. Las nueve operaciones viven en rutas exclusivas de administración del expediente (`employee_biometric_face_id_routes`, `employee_biometric_routes`, `employee_device_routes`): cada escritura recibe `middleware.permissionGate(...)` en la ruta, después de `auth()` y `businessScope()`. No hay superficie compartida ni `ensureSecondaryPermission`. La verificación facial de checada (`POST /api/verify-face`), el alta de dispositivo al login y el canal WebSocket de enrolamiento quedan fuera de alcance (D-08 / deuda Wilvardo). No se crean permisos, no se concede nada a roles y no se enciende la exigencia del módulo (D-09).

**Tech Stack:** AdonisJS 6, Lucid, Japa (unit + functional), `PermissionGateMiddleware` / `PermissionGateService`, mapa `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS`, convención en `docs/superpowers/plans/2026-08-10-employees-permission-declaration-convention.md`.

## Global Constraints

- Historia: serie de órdenes de escritura del módulo Empleados; tramo Biométricos y Dispositivos (después de Turnos/Excepciones/Vacaciones).
- No inventar slugs; no modificar `EMPLOYEES_PERMISSION_CATALOG` ni seeders de permisos (regla 10).
- Slugs a usar (ya en catálogo): `upload-face-id`, `upload-fingers`, `tab-biometricos-write`, `tab-biometricos-delete`, `tab-dispositivos-write`, `tab-dispositivos-delete`.
- Bypass de todas las declaraciones: `standard` (owner y root; no `super-administrador`) — regla 11.
- No encender `system_modules.system_module_permission_enforcement_active` del módulo `employees` (regla 8 / D-09).
- No conceder permisos a ningún rol (regla 10 / D-03).
- Negativa del gate = misma forma HTTP 403 de orden 3 (`PERM.DENIED` / `PERM.UNRESOLVED`) — regla 14.
- Negativa **antes** de `UploadService.fileUpload` / `deleteFile` y antes de crear/actualizar/borrar el registro (regla 7): el middleware en ruta garantiza que el controlador no corre si falta permiso.
- Exentos (D-08, regla 6): `POST /api/verify-face` (checada facial) y alta automática de dispositivo en `POST /api/auth/login`. No declararles gate.
- Fuera de alcance (deuda de seguridad, dueño Wilvardo): canal WebSocket en `start/socket.ts` (`start-biometric-enrollment`, `biometric-enrollment-status`, etc.) que escribe huellas/estado de rostro sin sesión ni `permissionGate`. No tocar.
- No declarar gate en lecturas (GET de biométricos, Face ID, dispositivos, stream de foto).
- Una misma ruta declara un solo `permissionGate`; no apilar dos gates.
- El permiso se suma a sesión + `businessScope`; no lo reemplaza ni lo amplía (regla 12).
- Código, comentarios y docs del cambio en español; identificadores en inglés.
- Commits: Conventional Commits, tipo en inglés, descripción en español.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `app/constants/employees_write_permission_declarations.ts` | Extender el mapa (101 → 110) con las 9 declaraciones. |
| `start/routes/employee_biometric_face_id_routes.ts` | Gate en POST/PUT/DELETE de foto de rostro. |
| `start/routes/employee_biometric_routes.ts` | Gate en POST/PUT del registro, PUT fingers, PUT face. |
| `start/routes/employee_device_routes.ts` | Gate en PUT status y DELETE de dispositivo. |
| `tests/unit/constants/employees_write_permission_declarations.spec.ts` | Contar 110 y mapear las 9 claves. |
| `tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts` | Assert de strings en las 3 rutas + guards de exentos (verify-face, socket, login). |
| `tests/functional/employees/employees_biometricos_dispositivos_permission_gate.spec.ts` | Soft-rollout OFF + matriz ON (separación upload vs delete, face vs fingers, dispositivos) + bypass. |

**No se modifica:** catálogo, seeders, middleware core, `face_routes.ts`, login/alta de dispositivo, `start/socket.ts`, lecturas, stream de foto, exigencia del módulo.

### Mapa operación → clave → slug (las 9)

| # | Clave | HTTP | Slug |
|---|-------|------|------|
| 1 | `uploadEmployeeFaceId` | `POST /api/employees/:employeeId/biometric-face-id` | `upload-face-id` |
| 2 | `replaceEmployeeFaceId` | `PUT /api/employees/:employeeId/biometric-face-id` | `upload-face-id` |
| 3 | `deleteEmployeeFaceId` | `DELETE /api/employees/:employeeId/biometric-face-id` | `tab-biometricos-delete` |
| 4 | `updateEmployeeFingers` | `PUT /api/employees/:employeeId/biometrics/fingers` | `upload-fingers` |
| 5 | `createEmployeeBiometric` | `POST /api/employees/:employeeId/biometrics` | `tab-biometricos-write` |
| 6 | `updateEmployeeBiometric` | `PUT /api/employees/:employeeId/biometrics` | `tab-biometricos-write` |
| 7 | `updateEmployeeFaceStatus` | `PUT /api/employees/:employeeId/biometrics/face` | `tab-biometricos-write` |
| 8 | `updateEmployeeDeviceStatus` | `PUT /api/employee-devices/:employeeDeviceId/status` | `tab-dispositivos-write` |
| 9 | `deleteEmployeeDevice` | `DELETE /api/employee-devices/:employeeDeviceId` | `tab-dispositivos-delete` |

**Criterio de `#7`:** `updateFaceStatus` escribe el flag de rostro del registro biométrico (no la foto). Regla 4 → `tab-biometricos-write`. Distinto de `upload-face-id` (foto) y de `upload-fingers` (huellas).

---

### Task 1: Extender declaraciones de permiso (mapa 101 → 110)

**Files:**
- Modify: `app/constants/employees_write_permission_declarations.ts`
- Modify: `tests/unit/constants/employees_write_permission_declarations.spec.ts`

**Interfaces:**
- Consumes: `employeesStandard(action)`, `EMPLOYEES_PERMISSION_CATALOG` (solo asserts de test)
- Produces: 9 claves nuevas en `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS` (ver tabla)

- [ ] **Step 1: Write the failing test**

En `tests/unit/constants/employees_write_permission_declarations.spec.ts`, cambiar el conteo a 110 y agregar el test de mapeo (conservar los tests existentes de Persona/Domicilio/Bancos, Salud, Expediente y Turnos):

```typescript
test('declara exactamente 110 operaciones con module employees y bypass standard', ({ assert }) => {
  const keys = Object.keys(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS)
  assert.equal(keys.length, 110)

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

test('mapea Biométricos y Dispositivos de escritura', ({ assert }) => {
  const d = EMPLOYEES_WRITE_PERMISSION_DECLARATIONS
  assert.equal(d.uploadEmployeeFaceId.action, 'upload-face-id')
  assert.equal(d.replaceEmployeeFaceId.action, 'upload-face-id')
  assert.equal(d.deleteEmployeeFaceId.action, 'tab-biometricos-delete')
  assert.equal(d.updateEmployeeFingers.action, 'upload-fingers')
  assert.equal(d.createEmployeeBiometric.action, 'tab-biometricos-write')
  assert.equal(d.updateEmployeeBiometric.action, 'tab-biometricos-write')
  assert.equal(d.updateEmployeeFaceStatus.action, 'tab-biometricos-write')
  assert.equal(d.updateEmployeeDeviceStatus.action, 'tab-dispositivos-write')
  assert.equal(d.deleteEmployeeDevice.action, 'tab-dispositivos-delete')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts`

Expected: FAIL (count 101 ≠ 110 y/o claves ausentes).

- [ ] **Step 3: Write minimal implementation**

En `app/constants/employees_write_permission_declarations.ts`, actualizar el comentario del mapa para incluir “+ Biométricos/Dispositivos” y agregar al final del objeto (antes del `} as const`):

```typescript
  uploadEmployeeFaceId: employeesStandard('upload-face-id'),
  replaceEmployeeFaceId: employeesStandard('upload-face-id'),
  deleteEmployeeFaceId: employeesStandard('tab-biometricos-delete'),
  updateEmployeeFingers: employeesStandard('upload-fingers'),
  createEmployeeBiometric: employeesStandard('tab-biometricos-write'),
  updateEmployeeBiometric: employeesStandard('tab-biometricos-write'),
  updateEmployeeFaceStatus: employeesStandard('tab-biometricos-write'),
  updateEmployeeDeviceStatus: employeesStandard('tab-dispositivos-write'),
  deleteEmployeeDevice: employeesStandard('tab-dispositivos-delete'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/constants/employees_write_permission_declarations.ts \
  tests/unit/constants/employees_write_permission_declarations.spec.ts
git commit -m "$(cat <<'EOF'
feat: Declarar permisos de escritura de biométricos y dispositivos

EOF
)"
```

---

### Task 2: Gate en rutas de foto Face ID

**Files:**
- Modify: `start/routes/employee_biometric_face_id_routes.ts`
- Create: `tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts` (grupo Face ID; se ampliará en Tasks 3–4)

**Interfaces:**
- Consumes: `EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeFaceId|replaceEmployeeFaceId|deleteEmployeeFaceId`
- Produces: POST/PUT/DELETE de Face ID con `permissionGate`; GETs sin gate

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts`:

```typescript
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('employee_biometric_face_id_routes — PermissionGate Biométricos', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_biometric_face_id_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeFaceId)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.replaceEmployeeFaceId)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeFaceId)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 3)
    assert.notMatch(
      compact(content),
      /get\('\/:employeeId\/biometric-face-id'[\s\S]*?\)\.use\(middleware\.permissionGate/
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts`

Expected: FAIL (archivo de rutas aún sin `permissionGate`).

- [ ] **Step 3: Write minimal implementation**

Reemplazar el contenido de escrituras en `start/routes/employee_biometric_face_id_routes.ts` (mantener GETs y el comentario USRH; agregar import del mapa):

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

/**
 * USRH1783821206584: todo el grupo es administración desde el Backoffice con
 * sesión de usuario (bearerAuth) — incluidas `getPhotoToken`/`streamPhoto`,
 * que son un proxy server-side para servir la foto ya autenticada (no un
 * checador de dispositivo sin unidad activa como `POST /api/verify-face`,
 * que vive en `face_routes.ts` y se deja explícitamente sin `businessScope`).
 */
router
  .group(() => {
    router.get(
      '/:employeeId/biometric-face-id',
      '#controllers/employee_biometric_face_id_controller.getPhoto'
    )
    router
      .post(
        '/:employeeId/biometric-face-id',
        '#controllers/employee_biometric_face_id_controller.uploadPhoto'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeFaceId))
    router
      .put(
        '/:employeeId/biometric-face-id',
        '#controllers/employee_biometric_face_id_controller.replacePhoto'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.replaceEmployeeFaceId))
    router
      .delete(
        '/:employeeId/biometric-face-id',
        '#controllers/employee_biometric_face_id_controller.deletePhoto'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeFaceId))
    router.get(
      '/:employeeId/biometric-face-id-with-token/:token',
      '#controllers/employee_biometric_face_id_controller.getPhotoToken'
    )
    router.get(
      '/:employeeId/biometric-face-id-photo',
      '#controllers/employee_biometric_photos_controller.streamPhoto'
    )
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_biometric_face_id_routes.ts \
  tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso en carga y borrado de Face ID

EOF
)"
```

---

### Task 3: Gate en rutas del registro biométrico

**Files:**
- Modify: `start/routes/employee_biometric_routes.ts`
- Modify: `tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: `createEmployeeBiometric`, `updateEmployeeBiometric`, `updateEmployeeFingers`, `updateEmployeeFaceStatus`
- Produces: 4 escrituras con gate; 3 GETs sin gate

- [ ] **Step 1: Write the failing test**

Agregar al mismo archivo de unit routes:

```typescript
test.group('employee_biometric_routes — PermissionGate Biométricos', () => {
  test('escrituras declaran permissionGate y lecturas no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_biometric_routes.ts'),
      'utf8'
    )
    assert.include(content, 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS')
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBiometric)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBiometric)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeFingers)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeFaceStatus)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts`

Expected: FAIL en el grupo de `employee_biometric_routes`.

- [ ] **Step 3: Write minimal implementation**

Reemplazar `start/routes/employee_biometric_routes.ts` por:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/:employeeId/biometrics', '#controllers/employee_biometric_controller.show')
    router.get(
      '/:employeeId/biometrics/fingers',
      '#controllers/employee_biometric_controller.getFingers'
    )
    router.get(
      '/:employeeId/biometrics/face',
      '#controllers/employee_biometric_controller.getFaceStatus'
    )
    router
      .post('/:employeeId/biometrics', '#controllers/employee_biometric_controller.store')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeBiometric))
    router
      .put('/:employeeId/biometrics', '#controllers/employee_biometric_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeBiometric))
    router
      .put(
        '/:employeeId/biometrics/fingers',
        '#controllers/employee_biometric_controller.updateFingers'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeFingers))
    router
      .put(
        '/:employeeId/biometrics/face',
        '#controllers/employee_biometric_controller.updateFaceStatus'
      )
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeFaceStatus))
  })
  .prefix('/api/employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_biometric_routes.ts \
  tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso en escritura del registro biométrico

EOF
)"
```

---

### Task 4: Gate en rutas de dispositivos + guards de exentos

**Files:**
- Modify: `start/routes/employee_device_routes.ts`
- Modify: `tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts`

**Interfaces:**
- Consumes: `updateEmployeeDeviceStatus`, `deleteEmployeeDevice`
- Produces: PUT status y DELETE con gate; GETs sin gate; asserts de que verify-face, login y socket siguen sin `permissionGate`

- [ ] **Step 1: Write the failing test**

Agregar al mismo archivo unit:

```typescript
test.group('employee_device_routes — PermissionGate Dispositivos', () => {
  test('status y delete declaran permissionGate; GETs no', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_device_routes.ts'),
      'utf8'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeDeviceStatus)'
    )
    assert.include(
      compact(content),
      'permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeDevice)'
    )
    const matches =
      compact(content).match(/permissionGate\(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS\.\w+\)/g) ??
      []
    assert.equal(matches.length, 2)
  })
})

test.group('Biométricos/Dispositivos — caminos exentos sin permissionGate (D-08 / deuda)', () => {
  test('face_routes.ts (verify-face) no declara permissionGate', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/face_routes.ts'), 'utf8')
    assert.include(content, "prefix('/api/verify-face')")
    assert.notInclude(content, 'permissionGate')
  })

  test('login_routes no declara permissionGate sobre auth/login', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/login_routes.ts'), 'utf8')
    assert.notInclude(content, 'permissionGate')
  })

  test('socket.ts conserva enrolamiento sin permissionGate (deuda Wilvardo)', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/socket.ts'), 'utf8')
    assert.include(content, "socket.on('start-biometric-enrollment'")
    assert.include(content, "socket.on('biometric-enrollment-status'")
    assert.notInclude(content, 'permissionGate')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts`

Expected: FAIL en el grupo de `employee_device_routes` (los guards de exentos deben pasar ya).

- [ ] **Step 3: Write minimal implementation**

Reemplazar `start/routes/employee_device_routes.ts` por:

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router.get('/', '#controllers/employee_device_controller.index')
    router.get(
      '/employee/:employeeId',
      '#controllers/employee_device_controller.getByEmployee'
    )
    router
      .put(
        '/:employeeDeviceId/status',
        '#controllers/employee_device_controller.updateStatus'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateEmployeeDeviceStatus)
      )
    router
      .delete('/:employeeDeviceId', '#controllers/employee_device_controller.delete')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteEmployeeDevice))
  })
  .prefix('/api/employee-devices')
  .use(middleware.auth())
  .use(middleware.businessScope())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts`

Expected: PASS (todos los grupos del archivo).

- [ ] **Step 5: Commit**

```bash
git add start/routes/employee_device_routes.ts \
  tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts
git commit -m "$(cat <<'EOF'
feat: Exigir permiso en activación y baja de dispositivos

EOF
)"
```

---

### Task 5: Pruebas funcionales soft-rollout + matriz con exigencia ON

**Files:**
- Create: `tests/functional/employees/employees_biometricos_dispositivos_permission_gate.spec.ts`

**Interfaces:**
- Consumes: las 9 rutas ya gated; `SystemModule.systemModulePermissionEnforcementActive`; helpers de grant del patrón turnos/persona
- Produces: evidencia de D-09 (OFF = sin `PERM.DENIED`), matriz ON (upload ≠ delete, face ≠ fingers, dispositivos write ≠ delete), bypass owner/root, y teardown que deja exigencia OFF

- [ ] **Step 1: Write the failing test**

Crear el archivo funcional completo. Patrón tomado de `employees_persona_domicilio_bancos_permission_gate.spec.ts` y `employees_turnos_excepciones_vacaciones_permission_gate.spec.ts`.

```typescript
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeDevice from '#models/employee_device'
import EmployeeBiometric from '#models/employee_biometric'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

const TEST_PASSWORD = 'BiometricosDispositivosPermissionGate123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

interface EmployeeFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
}

async function permissionId(permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
    .first()
  if (!permission) throw new Error(`Se requiere el permiso "employees:${permissionSlug}" en BD.`)
  return permission.systemPermissionId
}

async function grantOnly(roleId: number, permissionSlugs: string[]) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({ roleId, systemPermissionId: await permissionId(slug) })
  }
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Bio pruebas ${stamp}`,
    businessUnitSlug: `bio-pruebas-${stamp}`,
    businessUnitLegalName: `Bio pruebas legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Bio pruebas ${stamp}`,
    roleSlug: `bio-pruebas-${stamp}`,
    roleDescription: 'Rol temporal para matriz de permisos biométricos',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'BioPermissionGate',
    personLastname: 'Test',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit, role }
}

async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function createEmployeeFixture(businessUnitId: number, prefix: string): Promise<EmployeeFixture> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'BioGate',
    personSecondLastname: prefix,
    personEmail: `employee-${prefix}-${stamp}@gsti-tests.local`,
  })
  const departmentInsert = await db.table('departments').insert({
    department_sync_id: stamp,
    department_code: `DEP-${stamp}`,
    department_name: `Departamento ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    department_created_at: now,
  })
  const departmentId = Number(departmentInsert[0])
  const positionInsert = await db.table('positions').insert({
    position_sync_id: stamp,
    position_code: `POS-${stamp}`,
    position_name: `Puesto ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: now,
  })
  const positionId = Number(positionInsert[0])
  const employeeInsert = await db.table('employees').insert({
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: 'Empleado',
    employee_last_name: 'BioGate',
    employee_second_last_name: prefix,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `employee-work-${prefix}-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })

  return {
    employee: await Employee.findOrFail(Number(employeeInsert[0])),
    person,
    departmentId,
    positionId,
  }
}

async function cleanupEmployeeFixture(fixture: EmployeeFixture | null) {
  if (!fixture) return
  const employeeId = fixture.employee.employeeId
  await db.from('employee_devices').where('employee_id', employeeId).delete()
  await db.from('employee_biometric_face_ids').where('employee_id', employeeId).delete()
  await db.from('employee_biometrics').where('employee_id', employeeId).delete()
  await Employee.query().where('employee_id', employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

async function createDeviceFixture(employeeId: number, businessUnitId: number, tokenSuffix: string) {
  return EmployeeDevice.create({
    employeeId,
    businessUnitId,
    employeeDeviceToken: `token-bio-gate-${tokenSuffix}`,
    employeeDeviceModel: 'TestPhone',
    employeeDeviceBrand: 'TestBrand',
    employeeDeviceType: 'mobile',
    employeeDeviceOs: 'android',
    employeeDeviceActive: 1,
  })
}

async function createFaceIdFixture(employeeId: number, businessUnitId: number, tokenSuffix: string) {
  return EmployeeBiometricFaceId.create({
    employeeId,
    businessUnitId,
    employeeBiometricFaceIdPhotoUrl: `employee-biometric-faces/test-${tokenSuffix}.jpg`,
    employeeBiometricFaceIdToken: `face-token-${tokenSuffix}`,
  })
}

async function createBiometricFixture(employeeId: number, businessUnitId: number) {
  return EmployeeBiometric.create({
    employeeId,
    businessUnitId,
    employeeBiometricData: JSON.stringify({ Fingers: [1, 4], Face: true }),
  })
}

function assertNotPermissionDenied(assert: any, response: any) {
  assert.notEqual(response.body()?.key, 'PERM.DENIED')
  assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
}

function assertPermissionDenied(assert: any, response: any) {
  assert.equal(response.status(), 403)
  assert.equal(response.body()?.key, 'PERM.DENIED')
  assert.equal(response.body()?.title, 'Sin permiso')
}

function buHeader(actor: TenantActor) {
  return { 'X-Business-Unit-Id': actor.businessUnit.businessUnitPublicId }
}

test.group('Biométricos/Dispositivos — soft-rollout (exigencia OFF)', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('bio-soft')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'soft')
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('sin grants: PUT fingers no responde PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/fingers`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ Fingers: [1, 4, 7] })
    assertNotPermissionDenied(assert, response)
  })

  test('sin grants: PUT device status no responde PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const device = await createDeviceFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'soft-status'
    )
    const response = await client
      .put(`/api/employee-devices/${device.employeeDeviceId}/status`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ employeeDeviceActive: 0 })
    assertNotPermissionDenied(assert, response)
  })

  test('sin grants: DELETE Face ID no responde PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const face = await createFaceIdFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'soft-delete'
    )
    const response = await client
      .delete(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertNotPermissionDenied(assert, response)
    // Puede fallar por S3 u otra causa; lo importante es que no sea PERM.DENIED
    void face
  })
})

test.group('Biométricos/Dispositivos — matriz con exigencia ON', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('bio-enforced')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'enforced')
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      const moduleAfterTeardown = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled = moduleAfterTeardown.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
    }
  })

  test('upload-face-id permite sustituir foto a nivel de gate; sin él PERM.DENIED antes de S3', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const denied = await client
      .post(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      // Sin archivo: si el gate corre primero, responde 403 y no llega a validar foto
      .file('photo', Buffer.from('fake-image'), { filename: 'face.jpg' })
    assertPermissionDenied(assert, denied)

    await grantOnly(actor!.role.roleId, ['upload-face-id'])
    const allowed = await client
      .post(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .file('photo', Buffer.from('fake-image'), { filename: 'face.jpg' })
    assertNotPermissionDenied(assert, allowed)
  })

  test('upload-face-id no alcanza para borrar Face ID (tab-biometricos-delete)', async ({
    client,
    assert,
  }) => {
    const face = await createFaceIdFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'sep-delete'
    )
    await grantOnly(actor!.role.roleId, ['upload-face-id'])
    const denied = await client
      .delete(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertPermissionDenied(assert, denied)
    const stillThere = await EmployeeBiometricFaceId.query()
      .where('employee_biometric_face_id_id', face.employeeBiometricFaceIdId)
      .whereNull('employee_biometric_face_id_deleted_at')
      .first()
    assert.isNotNull(stillThere)

    await grantOnly(actor!.role.roleId, ['tab-biometricos-delete'])
    const allowed = await client
      .delete(`/api/employees/${fixture!.employee.employeeId}/biometric-face-id`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertNotPermissionDenied(assert, allowed)
  })

  test('upload-fingers permite huellas; upload-face-id no las otorga', async ({ client, assert }) => {
    await createBiometricFixture(fixture!.employee.employeeId, actor!.businessUnit.businessUnitId)
    await grantOnly(actor!.role.roleId, ['upload-face-id'])
    const denied = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/fingers`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ Fingers: [2, 5] })
    assertPermissionDenied(assert, denied)

    await grantOnly(actor!.role.roleId, ['upload-fingers'])
    const allowed = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/fingers`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ Fingers: [2, 5] })
    assertNotPermissionDenied(assert, allowed)
  })

  test('tab-biometricos-write permite registro completo y face status; upload-fingers no', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['upload-fingers'])
    const deniedStore = await client
      .post(`/api/employees/${fixture!.employee.employeeId}/biometrics`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ Fingers: [1], Face: false })
    assertPermissionDenied(assert, deniedStore)

    const deniedFace = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/face`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ Face: true })
    assertPermissionDenied(assert, deniedFace)

    await grantOnly(actor!.role.roleId, ['tab-biometricos-write'])
    const allowedFace = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/face`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ Face: true })
    // Puede 404 si no hay registro previo; no debe ser PERM.DENIED
    assertNotPermissionDenied(assert, allowedFace)

    const allowedStore = await client
      .post(`/api/employees/${fixture!.employee.employeeId}/biometrics`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ Fingers: [1, 3], Face: true })
    assertNotPermissionDenied(assert, allowedStore)
  })

  test('tab-dispositivos-write permite status; delete exige tab-dispositivos-delete', async ({
    client,
    assert,
  }) => {
    const device = await createDeviceFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'sep-device'
    )
    await grantOnly(actor!.role.roleId, ['tab-dispositivos-write'])
    const statusOk = await client
      .put(`/api/employee-devices/${device.employeeDeviceId}/status`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
      .json({ employeeDeviceActive: 0 })
    assertNotPermissionDenied(assert, statusOk)

    const deniedDelete = await client
      .delete(`/api/employee-devices/${device.employeeDeviceId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertPermissionDenied(assert, deniedDelete)
    const stillThere = await EmployeeDevice.query()
      .where('employee_device_id', device.employeeDeviceId)
      .whereNull('employee_device_deleted_at')
      .first()
    assert.isNotNull(stillThere)

    await grantOnly(actor!.role.roleId, ['tab-dispositivos-delete'])
    const allowedDelete = await client
      .delete(`/api/employee-devices/${device.employeeDeviceId}`)
      .loginAs(actor!.user)
      .headers(buHeader(actor!))
    assertNotPermissionDenied(assert, allowedDelete)
  })

  test('sin permisos: las nueve escrituras responden PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const employeeId = fixture!.employee.employeeId
    const device = await createDeviceFixture(employeeId, actor!.businessUnit.businessUnitId, 'nine')
    const face = await createFaceIdFixture(employeeId, actor!.businessUnit.businessUnitId, 'nine')
    await createBiometricFixture(employeeId, actor!.businessUnit.businessUnitId)

    const ops = [
      client
        .post(`/api/employees/${employeeId}/biometric-face-id`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .file('photo', Buffer.from('x'), { filename: 'a.jpg' }),
      client
        .put(`/api/employees/${employeeId}/biometric-face-id`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .file('photo', Buffer.from('x'), { filename: 'a.jpg' }),
      client
        .delete(`/api/employees/${employeeId}/biometric-face-id`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!)),
      client
        .put(`/api/employees/${employeeId}/biometrics/fingers`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Fingers: [1] }),
      client
        .post(`/api/employees/${employeeId}/biometrics`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Fingers: [1], Face: false }),
      client
        .put(`/api/employees/${employeeId}/biometrics`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Fingers: [1], Face: false }),
      client
        .put(`/api/employees/${employeeId}/biometrics/face`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ Face: false }),
      client
        .put(`/api/employee-devices/${device.employeeDeviceId}/status`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!))
        .json({ employeeDeviceActive: 0 }),
      client
        .delete(`/api/employee-devices/${device.employeeDeviceId}`)
        .loginAs(actor!.user)
        .headers(buHeader(actor!)),
    ]

    for (const pending of ops) {
      const response = await pending
      assertPermissionDenied(assert, response)
    }

    const faceStill = await EmployeeBiometricFaceId.query()
      .where('employee_biometric_face_id_id', face.employeeBiometricFaceIdId)
      .whereNull('employee_biometric_face_id_deleted_at')
      .first()
    assert.isNotNull(faceStill)
    const deviceStill = await EmployeeDevice.query()
      .where('employee_device_id', device.employeeDeviceId)
      .whereNull('employee_device_deleted_at')
      .first()
    assert.isNotNull(deviceStill)
  })
})

test.group('Biométricos/Dispositivos — bypass standard (owner)', (group) => {
  let ownerActor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  let ownerRoleId: number

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()

    const ownerRole = await Role.query()
      .whereNull('role_deleted_at')
      .where('role_slug', 'owner')
      .firstOrFail()
    ownerRoleId = ownerRole.roleId

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    const businessUnit = await BusinessUnit.create({
      businessUnitName: `Bio owner ${stamp}`,
      businessUnitSlug: `bio-owner-${stamp}`,
      businessUnitLegalName: `Bio owner legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
    const person = await Person.create({
      personFirstname: 'Owner',
      personLastname: 'BioGate',
      personSecondLastname: 'Bypass',
      personEmail: `owner-bio-${stamp}@gsti-tests.local`,
    })
    const user = await User.create({
      userEmail: `owner-bio-${stamp}@gsti-tests.local`,
      userPassword: TEST_PASSWORD,
      userActive: 1,
      roleId: ownerRoleId,
      personId: person.personId,
      userEmailType: 'institutional',
    })
    await user.related('businessUnits').attach([businessUnit.businessUnitId])
    ownerActor = { user, person, businessUnit, role: ownerRole }
    fixture = await createEmployeeFixture(businessUnit.businessUnitId, 'owner')
  })

  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      if (ownerActor) {
        await BusinessUnitUser.query().where('user_id', ownerActor.user.userId).delete()
        await User.query().where('user_id', ownerActor.user.userId).delete()
        await Person.query().where('person_id', ownerActor.person.personId).delete()
        await BusinessUnit.query()
          .where('business_unit_id', ownerActor.businessUnit.businessUnitId)
          .delete()
      }
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('owner sin grants no recibe PERM.DENIED en PUT fingers', async ({ client, assert }) => {
    const response = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/fingers`)
      .loginAs(ownerActor!.user)
      .headers(buHeader(ownerActor!))
      .json({ Fingers: [9] })
    assertNotPermissionDenied(assert, response)
  })
})
```

**Notas de implementación del test (ajustar solo si el modelo lo exige):**
- Si `EmployeeBiometric.create` / `EmployeeBiometricFaceId.create` requieren columnas adicionales, alinear con el modelo Lucid (`app/models/employee_biometric.ts`, `employee_biometric_face_id.ts`).
- Si el soft-delete usa otro nombre de columna en query, usar el API del modelo (`EmployeeDevice.query().whereNull('employee_device_deleted_at')` ya es el patrón del controlador).
- El assert de “permitido” usa `assertNotPermissionDenied` (no exige 200): S3 u otras validaciones pueden fallar; el gate no debe ser la causa.
- Si `client.file(...)` no acepta `Buffer` en esta versión de Japa, usar un archivo temporal mínimo (`tmp/test-face.jpg`) con contenido JPEG/PNG válido de 1×1.

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test tests/functional/employees/employees_biometricos_dispositivos_permission_gate.spec.ts`

Expected: FAIL en el grupo ON (las rutas aún no estaban gated en un entorno sin Tasks 2–4; con Tasks 2–4 ya aplicadas, el soft-rollout debe pasar y la matriz ON debe pasar si los fixtures son válidos). Si se ejecuta **antes** de Tasks 2–4, la matriz ON falla porque no hay 403. Ejecutar esta Task **después** de 2–4.

Si al correr con gates ya puestos falla por fixtures/columnas, corregir solo el test (no relajar el gate).

- [ ] **Step 3: Ajustes mínimos de fixtures si hace falta**

Correr el suite y, si aparece error de columna o de validator, alinear el payload/fixture con el controlador real (`Fingers` / `Face` capitalizados como en `employee_biometric_controller.ts`; `employeeDeviceActive` como en `updateStatus`). No cambiar slugs ni quitar asserts de integridad.

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test tests/functional/employees/employees_biometricos_dispositivos_permission_gate.spec.ts`

Expected: PASS. Tras el suite, `employees.system_module_permission_enforcement_active === false`.

Verificación adicional recomendada (misma sesión):

```bash
node ace test tests/unit/constants/employees_write_permission_declarations.spec.ts \
  tests/unit/routes/employees_biometricos_dispositivos_permission_gate_routes.spec.ts \
  tests/functional/employees/employees_biometricos_dispositivos_permission_gate.spec.ts
```

Expected: PASS en los tres.

- [ ] **Step 5: Commit**

```bash
git add tests/functional/employees/employees_biometricos_dispositivos_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir matriz de permisos de biométricos y dispositivos

EOF
)"
```

---

## Self-Review

**1. Spec coverage**

| Regla / aceptación | Task |
|--------------------|------|
| 9 operaciones exigen permiso en servidor | Tasks 1–4 |
| Face ID carga/sustitución → `upload-face-id` | Tasks 1–2 |
| Huellas → `upload-fingers` (distinto de Face ID) | Tasks 1, 3, 5 |
| Borrar foto → `tab-biometricos-delete` | Tasks 1–2, 5 |
| Registro biométrico completo / face status → `tab-biometricos-write` | Tasks 1, 3, 5 |
| Device status → `tab-dispositivos-write`; delete → `tab-dispositivos-delete` | Tasks 1, 4, 5 |
| D-08: verify-face y login device exentos | Task 4 guards + Global Constraints |
| WebSocket enrolamiento = deuda, no se toca | Task 4 guard + Global Constraints |
| Negativa antes de almacenamiento | Gate en ruta (middleware antes del controlador) + asserts de integridad en Task 5 |
| Soft-rollout / D-09 exigencia apagada | Task 5 soft-rollout + teardown |
| No crear/renombrar/conceder permisos | Global Constraints; Task 1 solo mapa |
| Bypass standard (owner/root); DG necesita permiso | Task 5 bypass owner |
| Forma `PERM.DENIED` de orden 3 | Task 5 `assertPermissionDenied` |
| Cero regresión con exigencia OFF | Task 5 soft-rollout |
| Quién tiene permiso no nota diferencia | Solo middleware; sin cambios de controlador/validación |

**2. Placeholder scan:** sin TBD/TODO; código de rutas, declaraciones y tests completo.

**3. Type consistency:** claves `uploadEmployeeFaceId` … `deleteEmployeeDevice` usadas igual en Tasks 1–5; slugs alineados al catálogo (`upload-face-id`, `upload-fingers`, `tab-biometricos-*`, `tab-dispositivos-*`); conteo 101 → 110.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-12-employees-biometricos-dispositivos-permission-gate.md`.

**Proposed commit message (English):**

```
feat: Gate employee biometric and device write permissions

Declare nine Employees write operations with PermissionGate soft-rollout;
leave face verify, login device registration, and WebSocket enrollment ungated.
```

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
