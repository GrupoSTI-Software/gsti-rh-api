# Lectura sensible por categoría — Plan de pruebas QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar la matriz QA de USRH1787204602825: unitarios de regresión del motor ya entregado más una suite Japa HTTP (Functional / Integración) que demuestra CA-1 a CA-8 contra la app real, sin encender el interruptor del módulo Empleados y sin que falte una categoría produzca 403.

**Architecture:** El producto ya está en la rama. Los unitarios existentes son la red de caracterización del motor (catálogo, `evaluateEnforced`, ALS, fábrica `sensitiveSerialize`, wrap de `finish`, seeder 0058). Este plan añade el hueco unitario de `super-administrador` y una suite HTTP nueva que reutiliza el patrón de fixtures de `tests/functional/employees/employees_expediente_read_permission_gate.spec.ts`. El oráculo de máscara es `maskSensitiveValue`, no literales `•`. Las decisiones de contenido las toma `evaluateEnforced` (el interruptor OFF no otorga ni niega la lectura sensible). El wrap de `response.finish` se prueba de verdad: Lucid serializa después de `next()`.

**Tech Stack:** AdonisJS 6, Lucid, Japa (`@japa/runner` + HTTP client), `maskSensitiveValue`, `PermissionGateService.evaluateEnforced`, AsyncLocalStorage `SensitiveAccessContext`.

## Global Constraints

- Historia: USRH1787204602825 · orden 30. Spec: `spec-USRH1787204602825.md`. Plan de producto: `docs/superpowers/plans/2026-08-20-sensitive-read-by-category.md`.
- Rebanada **solo API**. Cero líneas de `valanserh-bo`. Sin migraciones. Sin endpoints nuevos. Sin cambiar `maskSensitiveValue` ni `MASK_CHAR`.
- Alcanza **únicamente las 11 columnas** con `maskedInApi: true`. Las 15 restantes son USRH1787204602828 (orden 31). No hay columna biométrica en esta rebanada: `sensitive-biometrico-read` no destapa ninguno de los 11.
- `evaluate` no cambia. `permission_gate_middleware.ts` sigue llamando a `evaluate`. **No se enciende** `system_module_permission_enforcement_active` de `employees`. Tras cada grupo, el interruptor queda `false`.
- `module-not-enforced` no otorga lectura sensible ni la niega. Sede: `evaluateEnforced`. Fail-closed: sin ALS, `unresolved`, sin clasificación o `reason` distinto de `granted`/`bypass` → tapado.
- Bypass `standard`: `root` y `owner` leen en claro sin los cinco slugs. `super-administrador` sí necesita el permiso.
- El permiso de categoría **nunca** rechaza la consulta (no 403, no `PERM.DENIED`). Decide el contenido, no el acceso a la pantalla. HTTP 200 con el dato tapado o en claro.
- Esta historia no toca `PiiAccessLogService`, `pii_reveal_routes.ts` ni `evidence.service.ts`. Un GET de ficha/médica no debe crear filas nuevas en `pii_access_logs`.
- Bancos y médica se crean con `Model.create()` (cifrado `prepare`). Prohibido `db.table('employee_banks').insert` de claro: `consume` devolvería `null` y el test mentiría.
- Código, comentarios y docs en español; identificadores en inglés. Commits: Conventional Commits, tipo en inglés, descripción en español.
- TDD de caracterización: el producto ya existe. Cada test nuevo **debe pasar**. Si falla, el bug es de producto (volver al plan de implementación); no se relaja la aserción.

---

## Contratos fijos de la suite

### Interruptor

`system_modules.system_module_permission_enforcement_active` del módulo `employees` permanece `false` (estado de entrega). Las pruebas ON no aplican a esta HU: el gate de pestaña sigue usando `evaluate` y con el interruptor apagado no niega.

### Oráculo de máscara (no hardcodear `•`)

| Campo | Claro de fixture | Categoría | Esperado tapado |
|-------|------------------|-----------|-----------------|
| `personCurp` | `ABCD123456MDFABC01` | identificacion | `maskSensitiveValue(curp, 'identificacion')` |
| `personRfc` | `VACW850312J95` | identificacion | idem RFC |
| `personImssNss` | `12345678901` | identificacion | idem NSS |
| `personEmail` | `juan-<stamp>@empresa.com` | contacto | primer carácter + `•••@` + dominio |
| `personPhone` | `5512345678` | contacto | últimos 4 |
| `personPhoneSecondary` | `5587654321` | contacto | últimos 4 |
| `employeeBankAccountClabe` | `012345678901234567` | financiero | últimos 4 |
| `employeeBankAccountNumber` | `123456789012` | financiero | últimos 4 |
| `employeeBankAccountCardNumber` | `4111111111111201` | financiero | últimos 4 |
| `employeeMedicalConditionDiagnosis` | `gripe ocupacional` | salud | `MASK_CHAR.repeat(5)` |
| `employeeMedicalConditionNotes` | `notas clinicas de prueba` | salud | `MASK_CHAR.repeat(5)` |

No sensible (siempre en claro): `personFirstname` (`SensRead`), `employeeCode`.

### Rutas HTTP de esta matriz

| Superficie | Método | Cuerpo |
|------------|--------|--------|
| Ficha | `GET /api/employees/:employeeId` | `data.employee.person.*` |
| Listado | `GET /api/employees/?search=<token>` | `data.employees.data[]` o `data.employees[]` |
| Persona (ALS dedicado) | `GET /api/persons/:personId` | `data.person.*` |
| Banco | `GET /api/employee-banks/:employeeBankId` | `data.employeeBank.*` |
| Médica | `GET /api/employee-medical-conditions/:id` | `data.showEmployeeMedicalCondition.*` |
| Sesión (sin ALS) | `GET /api/auth/session` | usuario Lucid en la raíz: `person.*` |

Todas las rutas de ficha/banco/médica/listado llevan `X-Business-Unit-Id` = `actor.businessUnit.businessUnitPublicId`. Sesión no exige ese header.

### Headers y auth

```typescript
.loginAs(actor.user).header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
```

### Nunca 403 por categoría

```typescript
assert.equal(response.status(), 200)
assert.notEqual(response.body()?.key, 'PERM.DENIED')
```

---

## Matriz Unit (regresión + hueco)

Automatizado. Sin interruptor ON/OFF de entrega: `evaluateEnforced` ignora el interruptor.

| # | Escenario | Archivo | Criterio de éxito |
|---|-----------|---------|-------------------|
| U.1 | `categoryOf` de las 11 columnas | `tests/unit/services/sensitive_fields_catalog_service.spec.ts` | Las 11 resuelven categoría; `personFirstname` → `null` |
| U.2 | `LEGAL_CATEGORIES` | mismo | Exactamente las cinco; ninguna huérfana en `SENSITIVE_FIELDS` |
| U.3 | `evaluateEnforced` root + switch OFF | `tests/unit/services/permission_gate_service.spec.ts` | `reason === 'bypass'`, no `module-not-enforced` |
| U.4 | `evaluateEnforced` cliente sin grant | mismo | `denied` |
| U.5 | `evaluate` switch OFF no cambia | mismo | `module-not-enforced` |
| U.6 | `evaluateEnforced` usuario nulo | mismo | `unresolved` |
| U.7 | `evaluateEnforced` con grant | mismo | `granted` con switch OFF |
| U.8 | **Hueco:** DG sin slug, switch OFF | mismo (Task 1) | `super-administrador` → `denied`, no bypass |
| U.9 | Mapa de cinco slugs | `tests/unit/constants/employees_sensitive_read_permissions.spec.ts` | `module: 'employees'`, `bypass: 'standard'`, slugs del catálogo |
| U.10 | ALS fail-closed | `tests/unit/utils/sensitive_access_context.spec.ts` | sin store → `canRead` false |
| U.11 | `isSensitiveReadAllowed` | `tests/unit/helpers/sensitive_read_decisions.spec.ts` | solo `granted`/`bypass`; `module-not-enforced` → false |
| U.12 | Wrap `send`/`finish` | mismo | serialize-after-next tapa; send/finish-after-run destapa |
| U.13 | Fábrica serialize | `tests/unit/helpers/sensitive_serialize.spec.ts` | claro vs tapado vs no clasificado vs null |
| U.14 | Wiring de 11 columnas | `tests/unit/models/sensitive_serialize_wiring.spec.ts` | fábrica, cero literales de categoría |
| U.15 | Montajes de ALS | `tests/unit/routes/sensitive_access_context_mounts.spec.ts` | kernel + businessScope (1) + optional (2 retornos) + 4 grupos |
| U.16 | Middleware dedicado | `tests/unit/middleware/sensitive_access_context_middleware.spec.ts` | abre ALS en `next()`, lo cierra al salir |
| U.17 | Seeder 0058 | `tests/unit/seeders/0058_sensitive_read_grants_backfill_seeder.spec.ts` | idempotente; no retira `reveal-sensitive-data` |

Correr batería:

```bash
node ace test --files tests/unit/services/sensitive_fields_catalog_service.spec.ts,tests/unit/services/permission_gate_service.spec.ts,tests/unit/constants/employees_sensitive_read_permissions.spec.ts,tests/unit/utils/sensitive_access_context.spec.ts,tests/unit/helpers/sensitive_read_decisions.spec.ts,tests/unit/helpers/sensitive_serialize.spec.ts,tests/unit/models/sensitive_serialize_wiring.spec.ts,tests/unit/routes/sensitive_access_context_mounts.spec.ts,tests/unit/middleware/sensitive_access_context_middleware.spec.ts,tests/unit/seeders/0058_sensitive_read_grants_backfill_seeder.spec.ts
```

---

## Matriz Functional / Integración (nuevo)

Japa HTTP real. Interruptor OFF. Esta es la capa CI de los CA.

| # | CA | Escenario | Criterio de éxito |
|---|----|-----------|-------------------|
| F.1 | CA-4 | Rol cliente, cero lecturas sensibles, cero bypass | 11 tapadas con el oráculo; `personFirstname` y `employeeCode` intactos; 200; no `PERM.DENIED` |
| F.2 | — | Solo `sensitive-biometrico-read` | Las 11 siguen tapadas (no hay columna biométrica en esta rebanada); 200 |
| F.3 | CA-1 | Solo `sensitive-contacto-read` | email/teléfonos en claro; CURP/RFC/NSS y bancos tapados; médica tapada; un solo 200 por request |
| F.4 | CA-2 | `owner` y `root` sin los cinco slugs, switch OFF | 11 en claro |
| F.5 | CA-2 | Rol cliente en el mismo escenario | 11 tapadas |
| F.6 | CA-2 | `super-administrador` sin slugs | 11 tapadas; 200 (no 403) |
| F.7 | CA-3 | Solo `sensitive-salud-read` | diagnóstico y notas en claro; identificación/contacto/bancos tapados; `pii_access_logs` del actor sin filas nuevas |
| F.8 | CA-6 | `GET /api/auth/session` con grants de contacto | `person.personEmail` tapado (sin ALS); 200 |
| F.9 | — | `GET /api/persons/:id` con contacto | email/teléfonos en claro (middleware `sensitiveAccess`, no `businessScope`) |
| F.10 | CA-8 | Listado 1 vs 2 empleados | consultas a `roles` y `role_system_permissions` no crecen con el N de empleados |
| F.11 | — | Aislamiento de unidad | ficha de empleado de otra BU → 404 de scope, no dato en claro |
| F.12 | CA-5 | Seeder dos veces | Cubierto por U.17; no duplicar HTTP |

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `tests/unit/services/permission_gate_service.spec.ts` | Añadir U.8: `evaluateEnforced` + `super-administrador` + switch OFF. |
| `tests/functional/employees/sensitive_read_by_category_support.ts` | Fixtures, oráculo, extractores de JSON, `grantOnly`, cleanup. Un solo lugar. |
| `tests/functional/employees/employees_sensitive_read_by_category.spec.ts` | Suite HTTP F.1–F.11. Un `test.group` con interruptor OFF forzado. |
| `tests/unit/seeders/0058_sensitive_read_grants_backfill_seeder.spec.ts` | CA-5 (ya existe; se corre, no se reescribe). |

**No se modifica producto** salvo que un test nuevo falle: entonces el arreglo vive en el plan de implementación, no aquí.

**No se crea:** suite con interruptor ON, tests de `pii_reveal`, tests de las 15 columnas de orden 31, montaje extra de `sensitiveAccess` en grupos que ya tienen `businessScope`.

---

### Task 1: Unitario U.8 — `evaluateEnforced` niega a dirección general con switch OFF

**Files:**
- Modify: `tests/unit/services/permission_gate_service.spec.ts` (grupo existente, tras el test `evaluateEnforced con interruptor apagado: rol de cliente sin concesión queda denied`)
- Test: mismo archivo

**Interfaces:**
- Consumes: `findPrivilegedRole('super-administrador')`, `fakeUser(roleId)`, `testModule`, `PermissionGateService.evaluateEnforced(user, { module, action: 'read', bypass: 'standard' })`
- Produces: cobertura U.8. Los tasks HTTP asumen que DG no es bypass `standard`.

- [ ] **Step 1: Write the characterization test**

Añadir al grupo `PermissionGateService`, con el interruptor del módulo de fixture en `false`:

```typescript
  test('evaluateEnforced con interruptor apagado: super-administrador NO tiene bypass standard', async ({
    assert,
  }) => {
    testModule.systemModulePermissionEnforcementActive = false
    await testModule.save()

    const direccionGeneral = await findPrivilegedRole('super-administrador')
    const service = new PermissionGateService()
    const decision = await service.evaluateEnforced(fakeUser(direccionGeneral.roleId), {
      module: MODULE_SLUG,
      action: 'read',
      bypass: 'standard',
    })

    assert.isFalse(decision.allowed)
    assert.equal(decision.reason, 'denied')
    assert.notEqual(decision.reason, 'bypass')
    assert.notEqual(decision.reason, 'module-not-enforced')
  })
```

- [ ] **Step 2: Run the new test**

Run: `node ace test --files tests/unit/services/permission_gate_service.spec.ts`

Expected: PASS (producto ya extrae `resolveByIdentity`; `hasPermissionGateBypass` con `'standard'` no incluye `super-administrador`). Si FAIL con `bypass` o `module-not-enforced`, parar: es regresión de CA-2 compañero.

- [ ] **Step 3: Run the unit battery listed in the matrix**

Run the comma-separated `--files` command from the Unit matrix.

Expected: PASS. Conteo de referencia previa: 52 tests del motor de esta HU + 1 nuevo (U.8).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/services/permission_gate_service.spec.ts
git commit -m "test: Cubrir evaluateEnforced sin bypass para super-administrador"
```

---

### Task 2: Fixtures HTTP y humo 200

**Files:**
- Create: `tests/functional/employees/sensitive_read_by_category_support.ts`
- Create: `tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

**Interfaces:**
- Consumes: modelos Lucid (`Person`, `Employee`, `EmployeeBank`, `EmployeeMedicalCondition`, `MedicalConditionType`, `Bank`, `User`, `Role`, `BusinessUnit`, `PiiAccessLog`), `TenantContext.run`, `maskSensitiveValue`
- Produces:
  - `TEST_PASSWORD: string`
  - `CLEAR_FIXED` (CURP/RFC/NSS/teléfonos/bancos/salud)
  - `TenantActor`, `SystemActor`, `SensitiveFixture`
  - `createActor(emailPrefix: string): Promise<TenantActor>`
  - `cleanupActor(actor: TenantActor | null): Promise<void>`
  - `createSystemActor(roleSlug: string, emailPrefix: string, businessUnitId: number): Promise<SystemActor>`
  - `cleanupSystemActor(actor: SystemActor | null): Promise<void>`
  - `grantOnly(roleId: number, permissionSlugs: string[]): Promise<void>`
  - `snapshotAndClearEmployeesGrants(roleId: number): Promise<RoleSystemPermission[]>`
  - `restoreEmployeesGrants(grants: RoleSystemPermission[]): Promise<void>`
  - `createSensitiveFixture(businessUnitId: number, prefix: string, sharedSearchToken?: string): Promise<SensitiveFixture>`
  - `cleanupSensitiveFixture(fixture: SensitiveFixture | null): Promise<void>`
  - `buHeader(actor: TenantActor): string`
  - `employeePerson(body)`, `employeeBank(body)`, `medicalCondition(body)`, `sessionPerson(body)`, `extractEmployeeRows(body)`
  - `expectNeverDenied(response, assert)`
  - `expectElevenMasked(person, bank, medical, clear, assert)`
  - `expectElevenClear(person, bank, medical, clear, assert)`
  - `expectContactoClearIdentificacionMasked(person, clear, assert)`

- [ ] **Step 1: Write the support module**

Crear `tests/functional/employees/sensitive_read_by_category_support.ts` con este contenido exacto:

```typescript
import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeBank from '#models/employee_bank'
import EmployeeMedicalCondition from '#models/employee_medical_condition'
import MedicalConditionType from '#models/medical_condition_type'
import Bank from '#models/bank'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import { TenantContext } from '#utils/tenant_context'
import { maskSensitiveValue } from '#helpers/sensitive_mask'

export const TEST_PASSWORD = 'SensitiveReadByCategoryQa123!'

export const CLEAR_FIXED = {
  curp: 'ABCD123456MDFABC01',
  rfc: 'VACW850312J95',
  nss: '12345678901',
  phone: '5512345678',
  phoneSecondary: '5587654321',
  clabe: '012345678901234567',
  account: '123456789012',
  card: '4111111111111201',
  diagnosis: 'gripe ocupacional',
  notes: 'notas clinicas de prueba',
  firstname: 'SensRead',
} as const

export interface ClearPii {
  email: string
  curp: string
  rfc: string
  nss: string
  phone: string
  phoneSecondary: string
  clabe: string
  account: string
  card: string
  diagnosis: string
  notes: string
  firstname: string
}

export interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

export interface SystemActor {
  user: User
  person: Person
  roleId: number
}

export interface SensitiveFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
  bank: EmployeeBank
  medical: EmployeeMedicalCondition
  medicalConditionType: MedicalConditionType
  clear: ClearPii
  searchToken: string
}

export async function permissionId(permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
    .first()
  if (!permission) {
    throw new Error(`Se requiere employees:${permissionSlug} en BD para este test.`)
  }
  return permission.systemPermissionId
}

export async function grantOnly(roleId: number, permissionSlugs: string[]) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await permissionId(slug),
    })
  }
}

export async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Sens read QA ${stamp}`,
    businessUnitSlug: `sens-read-qa-${stamp}`,
    businessUnitLegalName: `Sens read QA legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Sens read QA ${stamp}`,
    roleSlug: `sens-read-qa-${stamp}`,
    roleDescription: 'Rol temporal de lectura sensible por categoría',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'ActorSens',
    personLastname: 'Qa',
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

export async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

export async function createSystemActor(
  roleSlug: string,
  emailPrefix: string,
  businessUnitId: number
): Promise<SystemActor> {
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', roleSlug)
    .firstOrFail()
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'SistemaSens',
    personLastname: 'Qa',
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
  await user.related('businessUnits').attach([businessUnitId])
  return { user, person, roleId: role.roleId }
}

export async function cleanupSystemActor(actor: SystemActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

export async function activeEmployeesGrants(roleId: number) {
  return RoleSystemPermission.query()
    .where('role_id', roleId)
    .whereNull('role_system_permission_deleted_at')
    .whereHas('systemPermissions', (permissionQuery) =>
      permissionQuery
        .whereNull('system_permission_deleted_at')
        .whereHas('systemModule', (moduleQuery) =>
          moduleQuery
            .whereNull('system_module_deleted_at')
            .where('system_module_slug', 'employees')
        )
    )
}

export async function snapshotAndClearEmployeesGrants(roleId: number) {
  const grants = await activeEmployeesGrants(roleId)
  for (const grant of grants) await grant.delete()
  return grants
}

export async function restoreEmployeesGrants(grants: RoleSystemPermission[]) {
  for (const grant of grants) await grant.restore()
}

export async function createSensitiveFixture(
  businessUnitId: number,
  prefix: string,
  sharedSearchToken?: string
): Promise<SensitiveFixture> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const searchToken = sharedSearchToken ?? `${prefix}-${stamp}`
  const now = new Date()
  const clear: ClearPii = {
    ...CLEAR_FIXED,
    email: `juan-${stamp}@empresa.com`,
  }
  const person = await Person.create({
    personFirstname: CLEAR_FIXED.firstname,
    personLastname: 'Colaborador',
    personSecondLastname: searchToken,
    personEmail: clear.email,
    personPhone: clear.phone,
    personPhoneSecondary: clear.phoneSecondary,
    personCurp: clear.curp,
    personRfc: clear.rfc,
    personImssNss: clear.nss,
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
    employee_first_name: CLEAR_FIXED.firstname,
    employee_last_name: 'Colaborador',
    employee_second_last_name: searchToken,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `work-${prefix}-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })
  const employee = await Employee.findOrFail(Number(employeeInsert[0]))
  const bankRow = await Bank.query().whereNull('bank_deleted_at').firstOrFail()
  const bank = await EmployeeBank.create({
    employeeBankAccountClabe: clear.clabe,
    employeeBankAccountClabeLastNumbers: clear.clabe.slice(-4),
    employeeBankAccountNumber: clear.account,
    employeeBankAccountNumberLastNumbers: clear.account.slice(-4),
    employeeBankAccountCardNumber: clear.card,
    employeeBankAccountCardNumberLastNumbers: clear.card.slice(-4),
    employeeBankAccountCurrencyType: 'MXN',
    employeeId: employee.employeeId,
    bankId: bankRow.bankId,
  })
  const medicalConditionType = await TenantContext.run([businessUnitId], async () => {
    const type = new MedicalConditionType()
    type.medicalConditionTypeName = `TEST-MCT-SENS-${stamp}`
    type.medicalConditionTypeDescription = 'fixture lectura sensible'
    type.medicalConditionTypeActive = 1
    await type.save()
    return type
  })
  const medical = await EmployeeMedicalCondition.create({
    employeeId: employee.employeeId,
    medicalConditionTypeId: medicalConditionType.medicalConditionTypeId,
    employeeMedicalConditionDiagnosis: clear.diagnosis,
    employeeMedicalConditionNotes: clear.notes,
    employeeMedicalConditionActive: 1,
  })
  return {
    employee,
    person,
    departmentId,
    positionId,
    bank,
    medical,
    medicalConditionType,
    clear,
    searchToken,
  }
}

export async function cleanupSensitiveFixture(fixture: SensitiveFixture | null) {
  if (!fixture) return
  await EmployeeMedicalCondition.query()
    .where('employee_medical_condition_id', fixture.medical.employeeMedicalConditionId)
    .delete()
  await EmployeeBank.query()
    .where('employee_bank_id', fixture.bank.employeeBankId)
    .delete()
  await Employee.query().where('employee_id', fixture.employee.employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
  await TenantContext.runUnscoped(async () => {
    await MedicalConditionType.query()
      .where('medical_condition_type_id', fixture.medicalConditionType.medicalConditionTypeId)
      .delete()
  })
}

export function buHeader(actor: TenantActor) {
  return actor.businessUnit.businessUnitPublicId
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function employeePerson(body: Record<string, unknown>) {
  return asRecord(asRecord(asRecord(body.data).employee).person)
}

export function employeeBankBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).employeeBank)
}

export function medicalConditionBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).showEmployeeMedicalCondition)
}

export function personShowBody(body: Record<string, unknown>) {
  return asRecord(asRecord(body.data).person)
}

export function sessionPerson(body: Record<string, unknown>) {
  const direct = asRecord(body.person)
  if (Object.keys(direct).length > 0) return direct
  return asRecord(asRecord(asRecord(body.data).user).person)
}

export function extractEmployeeRows(body: Record<string, unknown>): Record<string, unknown>[] {
  const employees = asRecord(body.data).employees
  if (Array.isArray(employees)) return employees as Record<string, unknown>[]
  const nested = asRecord(employees).data
  return Array.isArray(nested) ? (nested as Record<string, unknown>[]) : []
}

export function expectNeverDenied(
  response: { status: () => number; body: () => { key?: string } | undefined },
  assert: Assert
) {
  assert.equal(response.status(), 200)
  assert.notEqual(response.body()?.key, 'PERM.DENIED')
}

export function expectPersonContactoClear(person: Record<string, unknown>, clear: ClearPii, assert: Assert) {
  assert.equal(person.personEmail, clear.email)
  assert.equal(person.personPhone, clear.phone)
  assert.equal(person.personPhoneSecondary, clear.phoneSecondary)
}

export function expectPersonContactoMasked(person: Record<string, unknown>, clear: ClearPii, assert: Assert) {
  assert.equal(person.personEmail, maskSensitiveValue(clear.email, 'contacto'))
  assert.equal(person.personPhone, maskSensitiveValue(clear.phone, 'contacto'))
  assert.equal(
    person.personPhoneSecondary,
    maskSensitiveValue(clear.phoneSecondary, 'contacto')
  )
}

export function expectPersonIdentificacionClear(
  person: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  assert.equal(person.personCurp, clear.curp)
  assert.equal(person.personRfc, clear.rfc)
  assert.equal(person.personImssNss, clear.nss)
}

export function expectPersonIdentificacionMasked(
  person: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  assert.equal(person.personCurp, maskSensitiveValue(clear.curp, 'identificacion'))
  assert.equal(person.personRfc, maskSensitiveValue(clear.rfc, 'identificacion'))
  assert.equal(person.personImssNss, maskSensitiveValue(clear.nss, 'identificacion'))
}

export function expectBankClear(bank: Record<string, unknown>, clear: ClearPii, assert: Assert) {
  assert.equal(bank.employeeBankAccountClabe, clear.clabe)
  assert.equal(bank.employeeBankAccountNumber, clear.account)
  assert.equal(bank.employeeBankAccountCardNumber, clear.card)
}

export function expectBankMasked(bank: Record<string, unknown>, clear: ClearPii, assert: Assert) {
  assert.equal(
    bank.employeeBankAccountClabe,
    maskSensitiveValue(clear.clabe, 'financiero')
  )
  assert.equal(
    bank.employeeBankAccountNumber,
    maskSensitiveValue(clear.account, 'financiero')
  )
  assert.equal(
    bank.employeeBankAccountCardNumber,
    maskSensitiveValue(clear.card, 'financiero')
  )
}

export function expectMedicalClear(
  medical: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  assert.equal(medical.employeeMedicalConditionDiagnosis, clear.diagnosis)
  assert.equal(medical.employeeMedicalConditionNotes, clear.notes)
}

export function expectMedicalMasked(
  medical: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  assert.equal(
    medical.employeeMedicalConditionDiagnosis,
    maskSensitiveValue(clear.diagnosis, 'salud')
  )
  assert.equal(
    medical.employeeMedicalConditionNotes,
    maskSensitiveValue(clear.notes, 'salud')
  )
}

export function expectNonSensitiveIntact(
  person: Record<string, unknown>,
  employee: Record<string, unknown>,
  assert: Assert
) {
  assert.equal(person.personFirstname, CLEAR_FIXED.firstname)
  assert.isString(String(employee.employeeCode ?? ''))
  assert.notEqual(String(employee.employeeCode ?? ''), '')
}

export function expectElevenMasked(
  person: Record<string, unknown>,
  bank: Record<string, unknown>,
  medical: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  expectPersonContactoMasked(person, clear, assert)
  expectPersonIdentificacionMasked(person, clear, assert)
  expectBankMasked(bank, clear, assert)
  expectMedicalMasked(medical, clear, assert)
}

export function expectElevenClear(
  person: Record<string, unknown>,
  bank: Record<string, unknown>,
  medical: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  expectPersonContactoClear(person, clear, assert)
  expectPersonIdentificacionClear(person, clear, assert)
  expectBankClear(bank, clear, assert)
  expectMedicalClear(medical, clear, assert)
}

export function expectContactoClearIdentificacionMasked(
  person: Record<string, unknown>,
  clear: ClearPii,
  assert: Assert
) {
  expectPersonContactoClear(person, clear, assert)
  expectPersonIdentificacionMasked(person, clear, assert)
}
```

- [ ] **Step 2: Write the failing smoke spec (group + GET ficha 200)**

Crear `tests/functional/employees/employees_sensitive_read_by_category.spec.ts`:

```typescript
import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import {
  buHeader,
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  employeePerson,
  expectNeverDenied,
  expectNonSensitiveIntact,
  grantOnly,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'

test.group('Lectura sensible por categoría — HTTP', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('sens-read-http')
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'sens-http')
  })

  group.teardown(async () => {
    try {
      await cleanupSensitiveFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('humo: GET ficha sin grants sensibles responde 200 y deja el nombre en claro', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    expectNeverDenied(response, assert)
    const body = response.body()
    const person = employeePerson(body)
    expectNonSensitiveIntact(person, body.data.employee, assert)
  })
})
```

- [ ] **Step 3: Run the smoke test**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

Expected: PASS. Si el extractor `data.employee.person` viene vacío, ajustar **solo** el extractor (no el producto) tras inspeccionar `Object.keys(response.body())` y `Object.keys(response.body().data)`. Si el status no es 200, parar e inspeccionar `response.body()`: un 404 de BU o de empleado es fixture, no de esta HU.

- [ ] **Step 4: Commit**

```bash
git add tests/functional/employees/sensitive_read_by_category_support.ts tests/functional/employees/employees_sensitive_read_by_category.spec.ts
git commit -m "test: Agregar fixtures HTTP de lectura sensible por categoría"
```

---

### Task 3: F.1 / F.2 — CA-4 fail-closed y biométrico no destapa

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_read_by_category.spec.ts` (añadir tests al grupo de Task 2)
- Test: mismo archivo

**Interfaces:**
- Consumes: `grantOnly`, `expectElevenMasked`, `employeePerson`, `employeeBankBody`, `medicalConditionBody`, `buHeader`, `fixture.clear`
- Produces: F.1 (CA-4) y F.2. Task 4 asume que cero grants tapa las 11.

- [ ] **Step 1: Write the two tests**

```typescript
  async function fetchSurfaces() {
    const header = buHeader(actor!)
    const employeeRes = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    const bankRes = await client
      .get(`/api/employee-banks/${fixture!.bank.employeeBankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    const medicalRes = await client
      .get(
        `/api/employee-medical-conditions/${fixture!.medical.employeeMedicalConditionId}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    return { employeeRes, bankRes, medicalRes }
  }
```

`client` no existe fuera del test: **no extraer `fetchSurfaces` al grupo**. Copiar el triple GET dentro de cada test, o declarar un helper de módulo que reciba `client`, `actor` y `fixture`:

Añadir en el support (mismo commit) **o** inline. Preferir helper de módulo en el spec:

```typescript
import type { ApiClient } from '@japa/api-client'
import {
  buHeader,
  employeeBankBody,
  employeePerson,
  expectElevenMasked,
  expectNeverDenied,
  expectNonSensitiveIntact,
  grantOnly,
  medicalConditionBody,
} from './sensitive_read_by_category_support.js'

async function getThreeSurfaces(
  client: ApiClient,
  actor: TenantActor,
  fixture: SensitiveFixture
) {
  const header = buHeader(actor)
  const employeeRes = await client
    .get(`/api/employees/${fixture.employee.employeeId}`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', header)
  const bankRes = await client
    .get(`/api/employee-banks/${fixture.bank.employeeBankId}`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', header)
  const medicalRes = await client
    .get(
      `/api/employee-medical-conditions/${fixture.medical.employeeMedicalConditionId}`
    )
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', header)
  return { employeeRes, bankRes, medicalRes }
}
```

Tests:

```typescript
  test('CA-4: sin lecturas sensibles las 11 van tapadas, el resto intacto y HTTP 200', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(employeeRes, assert)
    expectNeverDenied(bankRes, assert)
    expectNeverDenied(medicalRes, assert)
    const person = employeePerson(employeeRes.body())
    expectNonSensitiveIntact(person, employeeRes.body().data.employee, assert)
    expectElevenMasked(
      person,
      employeeBankBody(bankRes.body()),
      medicalConditionBody(medicalRes.body()),
      fixture!.clear,
      assert
    )
  })

  test('solo sensitive-biometrico-read no destapa ninguna de las 11', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-biometrico-read'])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(employeeRes, assert)
    expectElevenMasked(
      employeePerson(employeeRes.body()),
      employeeBankBody(bankRes.body()),
      medicalConditionBody(medicalRes.body()),
      fixture!.clear,
      assert
    )
  })
```

- [ ] **Step 2: Run the spec**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

Expected: PASS. Si bancos vienen `null`, el insert no pasó por `prepare`: corregir el fixture (`EmployeeBank.create`), no el oráculo.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_read_by_category.spec.ts tests/functional/employees/sensitive_read_by_category_support.ts
git commit -m "test: Cubrir CA-4 y biométrico sin efecto en las once columnas"
```

---

### Task 4: F.3 — CA-1 mixto (`sensitive-contacto-read`)

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

**Interfaces:**
- Consumes: `getThreeSurfaces`, `grantOnly(['sensitive-contacto-read'])`, `expectContactoClearIdentificacionMasked`, `expectBankMasked`, `expectMedicalMasked`
- Produces: F.3 (CA-1). Task 5 no depende de este grant.

- [ ] **Step 1: Write the mixed-category test**

```typescript
  test('CA-1: solo sensitive-contacto-read destapa correo y teléfonos; el resto tapado; 200', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(employeeRes, assert)
    expectNeverDenied(bankRes, assert)
    expectNeverDenied(medicalRes, assert)
    const person = employeePerson(employeeRes.body())
    expectContactoClearIdentificacionMasked(person, fixture!.clear, assert)
    expectBankMasked(employeeBankBody(bankRes.body()), fixture!.clear, assert)
    expectMedicalMasked(medicalConditionBody(medicalRes.body()), fixture!.clear, assert)
    expectNonSensitiveIntact(person, employeeRes.body().data.employee, assert)
  })
```

- [ ] **Step 2: Run the spec**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

Expected: PASS. Si contacto también va tapado, el wrap de `finish` no reentra ALS en esta ruta: volver a `app/helpers/sensitive_read_decisions.ts` (`reenterSensitiveReadOnResponse`), no cambiar el test.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_read_by_category.spec.ts
git commit -m "test: Cubrir CA-1 de lectura sensible mixta por contacto"
```

---

### Task 5: F.4 / F.5 / F.6 — CA-2 owner, root, cliente y dirección general

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

**Interfaces:**
- Consumes: `createSystemActor`, `cleanupSystemActor`, `snapshotAndClearEmployeesGrants`, `restoreEmployeesGrants`, `getThreeSurfaces`, `expectElevenClear`, `expectElevenMasked`
- Produces: F.4–F.6 (CA-2). Restaura grants de roles de sistema en `finally`.

- [ ] **Step 1: Write owner / root / DG / client tests**

El cliente del Task 3 ya cubre “rol sin slugs”. Este task añade bypass y DG. Cada rol de sistema limpia **solo** concesiones del módulo `employees` y las restaura:

```typescript
  test('CA-2: owner sin slugs sensibles y switch OFF recibe las 11 en claro', async ({
    client,
    assert,
  }) => {
    const owner = await createSystemActor(
      'owner',
      'sens-owner',
      actor!.businessUnit.businessUnitId
    )
    const snapshot = await snapshotAndClearEmployeesGrants(owner.roleId)
    try {
      const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
        client,
        { ...actor!, user: owner.user },
        fixture!
      )
      expectNeverDenied(employeeRes, assert)
      expectElevenClear(
        employeePerson(employeeRes.body()),
        employeeBankBody(bankRes.body()),
        medicalConditionBody(medicalRes.body()),
        fixture!.clear,
        assert
      )
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(owner)
    }
  })

  test('CA-2: root sin slugs sensibles y switch OFF recibe las 11 en claro', async ({
    client,
    assert,
  }) => {
    const root = await createSystemActor(
      'root',
      'sens-root',
      actor!.businessUnit.businessUnitId
    )
    const snapshot = await snapshotAndClearEmployeesGrants(root.roleId)
    try {
      const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
        client,
        { ...actor!, user: root.user },
        fixture!
      )
      expectNeverDenied(employeeRes, assert)
      expectElevenClear(
        employeePerson(employeeRes.body()),
        employeeBankBody(bankRes.body()),
        medicalConditionBody(medicalRes.body()),
        fixture!.clear,
        assert
      )
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(root)
    }
  })

  test('CA-2: super-administrador sin slugs recibe las 11 tapadas y 200', async ({
    client,
    assert,
  }) => {
    const dg = await createSystemActor(
      'super-administrador',
      'sens-dg',
      actor!.businessUnit.businessUnitId
    )
    const snapshot = await snapshotAndClearEmployeesGrants(dg.roleId)
    try {
      const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
        client,
        { ...actor!, user: dg.user },
        fixture!
      )
      expectNeverDenied(employeeRes, assert)
      expectElevenMasked(
        employeePerson(employeeRes.body()),
        employeeBankBody(bankRes.body()),
        medicalConditionBody(medicalRes.body()),
        fixture!.clear,
        assert
      )
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(dg)
    }
  })
```

`getThreeSurfaces` usa `actor.user` y `buHeader(actor)`. Pasar `{ ...actor!, user: owner.user }` reutiliza la misma BU header: el usuario de sistema está attached a esa BU en `createSystemActor`.

- [ ] **Step 2: Run the spec**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

Expected: PASS. Si owner/root salen tapados, es el bug de serialize-after-`next()` (CA-2 de producto). No marcar el test como skip.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_read_by_category.spec.ts
git commit -m "test: Cubrir CA-2 de bypass standard frente a dirección general"
```

---

### Task 6: F.7 — CA-3 salud y bitácora intacta

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

**Interfaces:**
- Consumes: `PiiAccessLog`, `grantOnly(['sensitive-salud-read'])`, `expectMedicalClear`, `expectPersonContactoMasked`, `expectPersonIdentificacionMasked`, `expectBankMasked`
- Produces: F.7 (CA-3)

- [ ] **Step 1: Write the health + audit test**

Añadir import: `import PiiAccessLog from '#models/pii_access_log'`

```typescript
  test('CA-3: sensitive-salud-read destapa diagnóstico y notas; bitácora sin filas nuevas', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-salud-read'])
    const before = await PiiAccessLog.query().where(
      'accessorUserId',
      actor!.user.userId
    )
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(medicalRes, assert)
    expectMedicalClear(medicalConditionBody(medicalRes.body()), fixture!.clear, assert)
    expectPersonContactoMasked(employeePerson(employeeRes.body()), fixture!.clear, assert)
    expectPersonIdentificacionMasked(
      employeePerson(employeeRes.body()),
      fixture!.clear,
      assert
    )
    expectBankMasked(employeeBankBody(bankRes.body()), fixture!.clear, assert)
    const after = await PiiAccessLog.query().where(
      'accessorUserId',
      actor!.user.userId
    )
    assert.equal(after.length, before.length)
  })
```

`PiiAccessLog.accessorUserId` mapea a `user_id`. El GET de ficha/médica no debe insertar filas (el revelado con motivo vive en `pii_reveal_routes.ts`, fuera de alcance).

- [ ] **Step 2: Run the spec**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_read_by_category.spec.ts
git commit -m "test: Cubrir CA-3 de lectura de salud sin escribir bitácora"
```

---

### Task 7: F.8 / F.9 — CA-6 sesión fail-closed y `GET /api/persons`

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

**Interfaces:**
- Consumes: `sessionPerson`, `personShowBody`, `grantOnly(['sensitive-contacto-read'])`, `maskSensitiveValue`
- Produces: F.8 (CA-6) y F.9 (superficie `sensitiveAccess`)

- [ ] **Step 1: Write session and persons tests**

El actor de grupo tiene `personEmail` de login (`@gsti-tests.local`), no el email del colaborador. Para CA-6 hay que poner PII de contacto en **la persona del actor** y recargar:

```typescript
  test('CA-6: GET /api/auth/session tapa el correo del actor aunque tenga contacto', async ({
    client,
    assert,
  }) => {
    const actorEmail = `sesion-${Date.now()}@empresa.com`
    actor!.person.personEmail = actorEmail
    actor!.person.personPhone = fixture!.clear.phone
    await actor!.person.save()
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])

    const response = await client.get('/api/auth/session').loginAs(actor!.user)
    expectNeverDenied(response, assert)
    const person = sessionPerson(response.body())
    assert.equal(person.personEmail, maskSensitiveValue(actorEmail, 'contacto'))
    assert.equal(person.personPhone, maskSensitiveValue(fixture!.clear.phone, 'contacto'))
  })

  test('GET /api/persons/:id con contacto destapa correo y teléfonos del colaborador', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
    const response = await client
      .get(`/api/persons/${fixture!.person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    const person = personShowBody(response.body())
    expectContactoClearIdentificacionMasked(person, fixture!.clear, assert)
  })
```

`GET /api/auth/session` no lleva `X-Business-Unit-Id`. No usar `POST /api/auth/login` aquí: el limiter y `userPasswordSetAt` (activación pendiente) lo hacen frágil; sesión con `loginAs` serializa `Person` por el mismo camino fail-closed.

- [ ] **Step 2: Run the spec**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

Expected: PASS. Si `/api/persons/:id` tapa el correo con el grant de contacto, el grupo no está montando `sensitiveAccess` o el wrap de `finish` no aplica en ese middleware. Revisar `start/routes/person_routes.ts` (ya debe tener `.use(middleware.sensitiveAccess())`).

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_read_by_category.spec.ts
git commit -m "test: Cubrir fail-closed de sesión y lectura sensible en persons"
```

---

### Task 8: F.10 / F.11 — CA-8 consultas constantes y aislamiento de unidad

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_read_by_category.spec.ts`
- Modify: `tests/functional/employees/sensitive_read_by_category_support.ts` (contador de SQL + segundo fixture)

**Interfaces:**
- Consumes: `db.connection()`, `grantOnly(['full-employee-assigned', 'sensitive-contacto-read'])`, `extractEmployeeRows`, segundo `createSensitiveFixture` / `createActor`
- Produces: F.10 (CA-8) y F.11 (tenant)

- [ ] **Step 1: Add the query counter to support**

```typescript
import db from '@adonisjs/lucid/services/db'

export function countGateLookups(sqls: string[]) {
  const roles = sqls.filter((sql) => /from\s+[`"]?roles[`"]?/i.test(sql)).length
  const grants = sqls.filter((sql) =>
    /from\s+[`"]?role_system_permissions[`"]?/i.test(sql)
  ).length
  return { roles, grants }
}

export async function withSqlLog<T>(work: () => Promise<T>): Promise<{
  result: T
  sqls: string[]
}> {
  const sqls: string[] = []
  const knex = db.connection().getWriteClient()
  const onQuery = (query: { sql?: string }) => {
    if (query.sql) sqls.push(query.sql)
  }
  knex.on('query', onQuery)
  try {
    const result = await work()
    return { result, sqls }
  } finally {
    knex.off('query', onQuery)
  }
}
```

- [ ] **Step 2: Write CA-8 and tenant tests**

El `search` del index concatena `employee_first_name`, `employee_last_name` y `employee_second_last_name`. Conceder `full-employee-assigned` para que `getRoleDepartments` devuelva todos los departamentos. `createSensitiveFixture` ya acepta `sharedSearchToken` (Task 2).

Secuencia CA-8: (1) listar con `fixture.searchToken` → 1 fila; (2) crear segundo fixture con ese mismo token; (3) volver a listar → 2 filas; (4) `countGateLookups` idéntico. `hasAccessToFullEmployees` también toca `role_system_permissions`; esas lookups deben ser iguales en ambas requests, no proporcionales a N.

```typescript
  test('CA-8: las lookups de roles y grants no crecen con el N de empleados del listado', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [
      'full-employee-assigned',
      'sensitive-contacto-read',
    ])
    const list = () =>
      client
        .get(
          `/api/employees/?search=${encodeURIComponent(fixture!.searchToken)}&limit=100`
        )
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))

    const one = await withSqlLog(() => list())
    expectNeverDenied(one.result, assert)
    assert.lengthOf(extractEmployeeRows(one.result.body()), 1)

    const second = await createSensitiveFixture(
      actor!.businessUnit.businessUnitId,
      'sens-ca8',
      fixture!.searchToken
    )
    try {
      const two = await withSqlLog(() => list())
      expectNeverDenied(two.result, assert)
      assert.lengthOf(extractEmployeeRows(two.result.body()), 2)
      const lookupsOne = countGateLookups(one.sqls)
      const lookupsTwo = countGateLookups(two.sqls)
      assert.equal(lookupsTwo.roles, lookupsOne.roles)
      assert.equal(lookupsTwo.grants, lookupsOne.grants)
    } finally {
      await cleanupSensitiveFixture(second)
    }
  })
```

Aislamiento:

```typescript
  test('empleado de otra unidad responde 404 de scope, no dato en claro', async ({
    client,
    assert,
  }) => {
    const other = await createActor('sens-other-bu')
    const foreign = await createSensitiveFixture(
      other.businessUnit.businessUnitId,
      'sens-foreign'
    )
    try {
      await grantOnly(actor!.role.roleId, [
        'sensitive-identificacion-read',
        'sensitive-contacto-read',
        'sensitive-financiero-read',
        'sensitive-salud-read',
        'sensitive-biometrico-read',
      ])
      const response = await client
        .get(`/api/employees/${foreign.employee.employeeId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      assert.equal(response.status(), 404)
      assert.notEqual(response.status(), 200)
    } finally {
      await cleanupSensitiveFixture(foreign)
      await cleanupActor(other)
    }
  })
```

- [ ] **Step 3: Run the spec**

Run: `node ace test --files tests/functional/employees/employees_sensitive_read_by_category.spec.ts`

Expected: PASS. Si el listado devuelve 0 filas, falta `full-employee-assigned` o el `search` no matchea `employee_second_last_name` (el index concatena nombre; `personSecondLastname` no entra). En ese caso filtrar por nombre: `search=fixture.searchToken` porque `employee_second_last_name` SÍ entra en el `CONCAT` de empleados. Confirmar que el update/create escribe `employee_second_last_name = searchToken`.

- [ ] **Step 4: Commit**

```bash
git add tests/functional/employees/employees_sensitive_read_by_category.spec.ts tests/functional/employees/sensitive_read_by_category_support.ts
git commit -m "test: Cubrir CA-8 de consultas constantes y aislamiento de unidad"
```

---

## E-API manual (no automatizar)

Misma matriz Functional contra el ambiente de prueba. No sustituye CI.

| # | Escenario | Criterio |
|---|-----------|----------|
| E-API.1 | Recaptura CA-2 | `GET /api/employees/:id` como `owner` usable (cuenta activada, sin 429). CURP y email en claro. Pegar JSON recortado en el PR. |
| E-API.2 | Recaptura CA-1 | Rol solo `sensitive-contacto-read`. Email/teléfonos claros; CURP tapado. |
| E-API.3 | CA-5 seeder en destino | Correr `0058` dos veces en el ambiente; mismo conteo en `role_system_permissions`. |
| E-API.4 | Login real | `POST /api/auth/login` (limiter aparte): `person` de la sesión tapado. Complementa F.8. |

---

## Fuera de esta plan

| Tema | Por qué |
|------|---------|
| Interruptor ON / `PERM.DENIED` de pestañas | Historia de expediente, no de esta HU |
| 15 columnas `maskedInApi: false` | USRH1787204602828 |
| `pii_reveal`, motivo, bitácora de revelado | Wilvardo / otra HU |
| Excel / exports | `maskSensitiveValue` no aplica igual; fuera de las 11 |
| Encender `system_module_permission_enforcement_active` | Entrega apagada |
| Montar `sensitiveAccess` en grupos con `businessScope` | Doble resolución; ya anidado en `TenantContext.run` |

---

## Self-review

1. **Spec coverage:** CA-1 → Task 4. CA-2 → Task 5 (+ U.8). CA-3 → Task 6. CA-4 → Task 3. CA-5 → U.17 (seeder unitario, no duplicar). CA-6 → Task 7. CA-7 (`unresolved` → tapado) → U.6 + fail-closed de fábrica U.13. CA-8 → Task 8. Nunca 403 → `expectNeverDenied` en F.1–F.9. Tenant → F.11. Bitácora → F.7. Superficie persons → F.9. Finish wrap → U.12 + F.3/F.4 (HTTP real).
2. **Placeholder scan:** sin TBD/TODO/`implement later`/`similar to Task N` en código. El helper `getThreeSurfaces` se define una vez en Task 3 y se reutiliza por nombre en Tasks 4–6.
3. **Type consistency:** `SensitiveFixture.clear`, `grantOnly`, `expectElevenMasked` / `expectElevenClear`, `createSensitiveFixture(..., sharedSearchToken?)`, `withSqlLog` / `countGateLookups` coinciden entre tasks.
