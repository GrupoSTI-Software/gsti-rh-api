# Alcance de empleados sin departamento — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario principal (`root`) y cualquier rol con el permiso `full-employee-assigned` vean a los empleados que no tienen departamento —y a toda la plantilla aunque la empresa no tenga ningún departamento— en la lista de Empleados, en la lista para asignar colaboradores y entre los destinatarios de un aviso a toda la empresa, sin cambiar lo que ve el acceso restringido y sin asomar a nadie de otra empresa.

**Architecture:** Hoy "toda la plantilla" se traduce en tres sitios como `whereIn('department_id', departamentosActivosDeLaEmpresa)`, y un empleado con `department_id = NULL` no cae en ninguno. La corrección es un único helper puro, `applyVisibleDepartmentsScope(query, departmentsList)`, que escribe el criterio correcto —`(department_id IN (…) OR department_id IS NULL)`, agrupado entre paréntesis— y que los tres sitios consumen en lugar de su `whereIn`. La condición que decide *cuándo* aplica el criterio (solo con acceso completo) no se toca: vive donde vivía, así el acceso restringido queda idéntico. El resto de las cláusulas de cada query (empresa, búsqueda, bajas) siguen afuera del paréntesis y acotan igual que hoy.

**Tech Stack:** AdonisJS 6 · Lucid · TypeScript estricto · Japa (`node ace test`) · MySQL

**Repo:** `gsti-rh-api` · **Rama:** `feature/USRH1788466831247-alcance-empleados-sin-departamento` · **Target:** `multitenant`

**HU:** USRH1788466831247 — *Ver a los empleados sin departamento cuando se tiene acceso a toda la plantilla*

---

## Global Constraints

- **Regla 1 y 2.** `root` y `full-employee-assigned` ven a los empleados sin departamento; una empresa sin departamentos nunca deja la lista vacía.
- **Regla 3.** El acceso restringido (sin `full-employee-assigned`, `root` aparte) ve **exactamente** lo que veía: sus colaboradores a cargo y él mismo. Ni un empleado más. Esto incluye la diferencia conocida de la lista para asignar (un restringido hoy ve toda la empresa ahí): **se deja como está**, es hallazgo aparte.
- **Regla 4.** El API no inventa texto: un empleado sin departamento sale con `department: null`. El "No asignado" ya lo pone la pantalla (verificado en la HU). **No se agrega ningún texto de relleno.**
- **Regla 5.** Incluir a los sin departamento no incluye: empleados de otra empresa, empleados dados de baja fuera del filtro `onlyInactive`, ni empleados que no coinciden con `search`. Por eso el criterio nuevo va **entre paréntesis** y en `AND` con todo lo demás.
- **Regla 6.** El puesto no participa: el criterio es solo por `department_id`. `position_id` no se toca.
- **Regla 7.** Un solo helper; los tres sitios lo consumen. Ninguno conserva su `whereIn` de departamentos.
- **Regla 8.** Un empleado que apunta a un departamento **dado de baja** sigue sin verse. Por eso el criterio es `IN (activos) OR IS NULL` y **no** "quitar el filtro": quitarlo mostraría a los de departamento eliminado, que esperan a USRH1788466831452.
- **Separación entre empresas, también fuera de una request.** El comando de avisos programados corre con el tenant en bypass; el `where business_unit_id = X` explícito de la query de destinatarios sigue afuera del paréntesis y es lo que acota. La prueba funcional lo verifica con una empresa ajena.
- **Nada que mande la pantalla decide el alcance.** `hasAccessToFullEmployees` y `departmentsList` se siguen resolviendo en el servidor con `RoleService` y `UserService`; este plan no agrega ningún parámetro de request.
- **TypeScript estricto, cero `any` nuevo.** `npm run typecheck` y `npm run lint` limpios antes de cada commit.
- **Nada se borra.** Este plan no retira archivos. Si algo se retirara, va a `__TO_DELETE__/` conservando su ruta (regla del `CLAUDE.md`).
- **Sin migraciones.** No cambia el esquema ni el catálogo.
- **Ubicar por nombre de función, no por número de línea.** Los números de este plan son del estado actual (archivos sin tocar) y sirven para orientarse; cada Task dice qué bloque buscar.

---

## Estado actual verificado

Todo lo de abajo se leyó contra el código el 2026-09-15.

### Cómo se resuelve hoy "quién ve qué"

| Pieza | Dónde | Qué hace |
|---|---|---|
| `RoleService.hasAccessToFullEmployees(roleId)` | `app/services/role_service.ts:356` | `true` si el rol tiene el permiso `full-employee-assigned` (módulo `employees`, sembrado en `database/seeders/0018_system_permission_seeder.ts:90`). |
| `UserService.getRoleDepartments(userId, hasAccessToFullEmployees)` | `app/services/user_service.ts:305` | Con `root` o acceso completo: **todos los departamentos activos** (`whereNull('department_deleted_at')`, acotados a la empresa por el mixin `withBusinessUnitScope`). Restringido: departamentos del rol + departamentos de sus colaboradores a cargo. |
| `resolveEmployeeRoleScope(userId, i18n)` | `app/helpers/resolve_employee_role_scope.ts` | Empaqueta lo anterior en `{ departmentsList, userResponsibleId }`. `userResponsibleId` viene con valor **solo** cuando el usuario es restringido. Lo usan los avisos y el tablero de estadísticas. |

### Los tres sitios que traducen "toda la plantilla" como "todos los departamentos"

| Vista de la HU | Controller | Sitio del defecto | Condición que lo enciende |
|---|---|---|---|
| Empleados (lista principal) | `EmployeeController.index` (`employee_controller.ts:684`) resuelve `hasAccessToFullEmployees`, `userResponsibleId` y `departmentsList` inline | `EmployeeService.index`, `employee_service.ts:478-483`: `.if(!filters.userResponsibleId, q => q.whereIn('departmentId', departmentsList))` | `!filters.userResponsibleId` ⇔ el usuario es `root` o tiene acceso completo |
| Lista para asignar colaboradores | `EmployeeController.indexToAssigned` (`employee_controller.ts:8715`), misma resolución inline | `EmployeeService.indexToAssigned`, `employee_service.ts:8402-8407`: mismo bloque | Igual |
| Avisos a toda la empresa (al guardar **y** al salir programado) | `NoticeController.store`/`update` (`notice_controller.ts:460`, `:657`) y `NoticeService.refreshCriteriaRecipients` (`notice_service.ts:1502`, lo llama `sendDueScheduled` desde el comando `notices:send-scheduled`) | `NoticeService.applyRoleScope`, `notice_service.ts:497-519`: última línea `query.whereIn('department_id', roleScope.departmentsList)` | Se llega a esa línea solo cuando `roleScope.userResponsibleId` es `null`, es decir, acceso completo |

**Los tres tienen la misma forma:** el acceso restringido toma otro camino (filtro de colaboradores a cargo) y **nunca llega al `whereIn` de departamentos**. Por eso cambiar solo ese `whereIn` deja intacto al restringido (regla 3) sin necesidad de tocar la condición.

**Por qué una empresa nueva ve la lista vacía:** `departmentsList` llega `[]` y Knex compila `whereIn(col, [])` como `1 = 0`. Con el criterio nuevo queda `(1 = 0 OR department_id IS NULL)`: exactamente los empleados sin departamento, que en una empresa sin departamentos son todos. Verificado compilando la query en un test unitario del repo (sin BD).

### Otros consumidores de `EmployeeService.index` — no cambian

`index` también lo llaman `assist_service.ts` (reportes de asistencia en Excel, vía `fetchEmployeesForExcelReport`), `sync_assists_service.ts:2974`, `position_service.ts:167` y `department_service.ts:324`. **Todos pasan `filters.departmentId` explícito** (recorren departamento → puesto → empleado), lo que agrega `department_id = X` en `AND` con el criterio nuevo: `department_id = X AND (department_id IN (…) OR department_id IS NULL)` es idéntico a hoy. Los reportes siguen sin incluir a los sin departamento, como decide la HU (eso es de USRH1788466831312 y USRH1788466831333).

### Lo que ya está bien y no se toca

- El listado devuelve `department: null` para quien no tiene departamento (preload de `belongsTo`). La pantalla ya lo pinta como "No asignado" (verificado en la HU).
- `verifyAudienceScope` (`notice_service.ts:527`) sigue rechazando un `departmentId` fuera de `departmentsList` para el público `department`. El público `company` no se rechaza, se recorta; el recorte es lo que corrige este plan.
- `EmployeeRoleScope` conserva su forma `{ departmentsList, userResponsibleId }`. No se agrega ningún campo: la información de "acceso completo" ya está codificada en `userResponsibleId === null`, y el helper no necesita saberlo porque **solo se le llama desde la rama de acceso completo**.

---

## Diseño: por qué `IN (…) OR IS NULL` y no "sin filtro"

Se consideró que, con acceso completo, la query simplemente no filtrara por departamento (la empresa ya acota). Se descarta por la **regla 8**: hoy `departmentsList` trae solo departamentos **activos**, así que el `whereIn` también excluye a los empleados cuyo departamento fue dado de baja. Quitar el filtro los haría aparecer de golpe, y la HU los reserva para USRH1788466831452. El `OR IS NULL` agrega exactamente el caso que la HU pide y nada más.

Se consideró también agregar `hasFullAccess` a `EmployeeRoleScope` y meter toda la regla (restringido + completo) en un helper único. Se descarta por la **regla 3**: `indexToAssigned` no aplica el filtro de colaboradores a cargo al restringido (lo ve todo), y un helper que unifique las dos ramas le cambiaría el comportamiento. La HU decide dejar eso como hallazgo aparte. El helper de este plan cubre solo el criterio de departamentos; la rama del restringido queda intacta en los tres sitios.

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `app/helpers/apply_visible_departments_scope.ts` | Única representación del criterio "departamento visible **o** sin departamento". Función pura sobre el query builder, sin acceso a BD ni a sesión. | **Crear** |
| `tests/unit/helpers/apply_visible_departments_scope.spec.ts` | Verifica el SQL exacto que compila el helper, incluido el paréntesis y el caso de lista vacía. Sin BD. | **Crear** |
| `app/services/employee_service.ts` | Lista de Empleados y lista para asignar. Solo cambian los dos bloques `.if(!filters.userResponsibleId, …)`. | **Modificar** (`index`, `indexToAssigned`) |
| `app/services/notice_service.ts` | Destinatarios de `company`/`department`, al guardar y al salir programado. Solo cambia la última línea de `applyRoleScope` y su doc. | **Modificar** (`applyRoleScope`) |
| `app/helpers/resolve_employee_role_scope.ts` | Solo el comentario de `departmentsList`, que hoy documenta la regla vieja. | **Modificar** (doc) |
| `tests/functional/employee_scope_sin_departamento.spec.ts` | Prueba de punta a punta de las tres vistas con `root`, un rol con acceso completo, un rol restringido y una empresa ajena; incluye el camino del programado. Corre sobre la base de desarrollo y limpia todo. | **Crear** |
| `tests/functional/notice_lifecycle.spec.ts` | Solo un comentario que describe el defecto como si fuera regla. | **Modificar** (comentario) |
| `docs/superpowers/plans/2026-09-15-alcance-empleados-sin-departamento-qa-api.md` | Manual de QA de API, hermano de este plan. Lo construye la Task 4. | **Crear** |
| `database/seeders/_tmp_do_not_commit_qa_seeder.ts` | Siembra las variantes de QA. Ya existe y está en `.git/info/exclude`: se le agregan casos. | **Modificar** (no se commitea) |

El helper va en `app/helpers/` porque ahí vive `resolve_employee_role_scope.ts`, la otra pieza del alcance, y porque la familia `#helpers/*` ya tiene tests en `tests/unit/helpers/`. Va en archivo propio y no dentro de `resolve_employee_role_scope.ts` porque ese archivo importa `UserService`, y meterlo en `employee_service.ts` abriría un ciclo de imports; el helper nuevo solo importa **tipos**.

---

## Task 1: Helper único del criterio de departamentos

**Files:**
- Create: `app/helpers/apply_visible_departments_scope.ts`
- Test: `tests/unit/helpers/apply_visible_departments_scope.spec.ts`

**Interfaces:**
- Consumes: nada del plan. Tipos: `ModelQueryBuilderContract` de `@adonisjs/lucid/types/model` y `Employee` de `#models/employee` (solo como tipo).
- Produces: `applyVisibleDepartmentsScope(query: ModelQueryBuilderContract<typeof Employee>, departmentsList: number[]): void`, exportada desde `#helpers/apply_visible_departments_scope`. Muta la query agregando **una** cláusula agrupada. Las Tasks 2 y 3 la consumen con ese nombre exacto.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/helpers/apply_visible_departments_scope.spec.ts`:

```ts
import { test } from '@japa/runner'
import Employee from '#models/employee'
import { applyVisibleDepartmentsScope } from '#helpers/apply_visible_departments_scope'

/**
 * USRH1788466831247 — el criterio con el que quien ve toda la plantilla
 * recorta por departamento. Se verifica el SQL que compila, sin BD: lo que
 * importa es la forma exacta de la cláusula (regla 5: agrupada, en AND con
 * el resto; regla 8: la lista sigue mandando para quien sí tiene
 * departamento).
 */
test.group('Alcance — departamento visible o sin departamento (USRH1788466831247)', () => {
  test('con departamentos, agrega IN (...) OR IS NULL entre paréntesis', ({ assert }) => {
    const query = Employee.query().where('business_unit_id', 7)
    applyVisibleDepartmentsScope(query, [1, 2])

    assert.equal(
      query.toQuery(),
      'select * from `employees` where `business_unit_id` = 7 and (`department_id` in (1, 2) or `department_id` is null)'
    )
  })

  test('sin departamentos (empresa nueva), la lista no se vacía: queda solo IS NULL', ({
    assert,
  }) => {
    const query = Employee.query().where('business_unit_id', 7)
    applyVisibleDepartmentsScope(query, [])

    assert.equal(
      query.toQuery(),
      'select * from `employees` where `business_unit_id` = 7 and (1 = 0 or `department_id` is null)'
    )
  })

  test('no toca el puesto ni ninguna otra columna', ({ assert }) => {
    const query = Employee.query()
    applyVisibleDepartmentsScope(query, [3])

    assert.notInclude(query.toQuery(), 'position_id')
    assert.equal(
      query.toQuery(),
      'select * from `employees` where (`department_id` in (3) or `department_id` is null)'
    )
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node ace test unit --files="apply_visible_departments_scope"
```

Esperado: FALLA con error de resolución de módulo (`Cannot find module '#helpers/apply_visible_departments_scope'`): el archivo todavía no existe.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `app/helpers/apply_visible_departments_scope.ts`:

```ts
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type Employee from '#models/employee'

/**
 * Recorta una query de empleados a los departamentos visibles para quien ve
 * toda la plantilla (`root` o `full-employee-assigned`), **incluyendo a los
 * empleados que no tienen departamento** (USRH1788466831247, reglas 1 y 2).
 *
 * Es la única representación de ese criterio: lo consumen la lista de
 * Empleados, la lista para asignar colaboradores y los destinatarios de un
 * aviso a toda la empresa (regla 7). Se llama solo desde la rama de acceso
 * completo; la rama del acceso restringido no pasa por aquí y no cambia
 * (regla 3).
 *
 * La cláusula va agrupada entre paréntesis para que el `OR` no se escape del
 * resto de la query: la empresa, la búsqueda y las bajas siguen acotando en
 * `AND` (regla 5), también cuando el aviso programado sale con el tenant en
 * bypass. Con `departmentsList` vacía —empresa sin departamentos— Knex
 * compila `1 = 0 OR department_id IS NULL`: se ven los sin departamento y la
 * lista no se vacía.
 *
 * Se conserva el `IN (…)` con los departamentos activos en vez de quitar el
 * filtro: un empleado que apunta a un departamento dado de baja sigue sin
 * verse (regla 8; lo corrige USRH1788466831452).
 *
 * @param query Query de `Employee` a la que se agrega el criterio. Se muta.
 * @param departmentsList Ids de los departamentos activos visibles para el rol.
 */
export function applyVisibleDepartmentsScope(
  query: ModelQueryBuilderContract<typeof Employee>,
  departmentsList: number[]
): void {
  query.where((scoped) => {
    scoped.whereIn('department_id', departmentsList).orWhereNull('department_id')
  })
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
node ace test unit --files="apply_visible_departments_scope"
```

Esperado: PASA, 3 de 3.

- [ ] **Step 5: Verificar tipos y estilo**

```bash
npm run typecheck && npm run lint
```

Esperado: ambos sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/helpers/apply_visible_departments_scope.ts tests/unit/helpers/apply_visible_departments_scope.spec.ts
git commit -m "feat(USRH1788466831247): criterio unico de departamentos visibles o sin departamento

Quien ve toda la plantilla la ve hoy como 'todos los departamentos', y un
empleado sin departamento no cae en ninguno. El helper escribe el criterio
correcto —IN (activos) OR IS NULL, agrupado— para que las tres vistas de la
HU lo consuman en las tareas siguientes. Se conserva el IN para que los de
departamento dado de baja sigan sin verse (regla 8).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Lista de Empleados y lista para asignar colaboradores

**Files:**
- Create: `tests/functional/employee_scope_sin_departamento.spec.ts`
- Modify: `app/services/employee_service.ts` — bloque `.if(!filters.userResponsibleId, …)` dentro de `index` (hoy `:478-483`) y dentro de `indexToAssigned` (hoy `:8402-8407`)

**Interfaces:**
- Consumes: `applyVisibleDepartmentsScope(query, departmentsList)` de `#helpers/apply_visible_departments_scope` (Task 1).
- Produces: nada nuevo. Las firmas `index(filters, departmentsList, allowedBusinessUnitIds)` e `indexToAssigned(filters, departmentsList, allowedBusinessUnitIds)` no cambian; los controllers no se tocan. La Task 3 agrega un `test.group` al spec que se crea aquí, con las mismas fixtures.

> **La prueba funcional corre sobre la base de desarrollo** (como todas las de `tests/functional/`): necesita `.env` con la BD local levantada y los seeders base aplicados (roles y permisos). Todo lo que crea lo borra en `teardown`. Si la base no está disponible, el spec falla en `setup` y no en las aserciones: revisar la conexión antes de sospechar del código.

- [ ] **Step 1: Escribir el spec funcional (grupo de Empleados y asignación)**

Crear `tests/functional/employee_scope_sin_departamento.spec.ts`. Contiene las fixtures compartidas y el primer grupo. La Task 3 le agrega el segundo grupo al final del archivo.

```ts
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import i18nManager from '@adonisjs/i18n/services/main'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Department from '#models/department'
import Employee from '#models/employee'
import Notice from '#models/notice'
import NoticeFile from '#models/notice_file'
import NoticeRecipient from '#models/notice_recipient'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import NoticeService from '#services/notice_service'
import { TenantContext } from '#utils/tenant_context'
import {
  grantNoticePermissions,
  revokeNoticePermissions,
} from './helpers/notice_permissions.js'

/**
 * USRH1788466831247 — quien ve toda la plantilla (`root` o un rol con
 * `full-employee-assigned`) ve también a los empleados sin departamento en
 * Empleados, en la lista para asignar colaboradores y entre los destinatarios
 * de un aviso a toda la empresa. El acceso restringido no cambia y nunca se
 * asoma un empleado de otra empresa.
 *
 * Corre sobre la base de desarrollo: todo lo que crea lo borra en teardown.
 */

const TEST_PASSWORD = 'AlcanceSinDepto123!'

interface EmployeeFixture {
  employee: Employee
  person: Person
}

interface Actor {
  user: User
  person: Person
  /** Rol temporal creado por el spec; `null` cuando usa el rol `root` del sistema. */
  role: Role | null
}

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Alcance ${label} ${s}`,
    businessUnitSlug: `alcance-${label}-${s}`,
    businessUnitLegalName: `Alcance ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createDepartment(unit: BusinessUnit, label: string): Promise<Department> {
  const s = stamp()
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `ALC-${s}`.slice(0, 50),
    departmentName: `Alcance ${label} ${s}`,
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: 1,
  })
}

/**
 * Empleado activo de la empresa. `departmentId: null` es el caso de la HU.
 * Lleva correo de trabajo para que cuente como destinatario de un aviso.
 */
async function createEmployee(
  unit: BusinessUnit,
  label: string,
  departmentId: number | null
): Promise<EmployeeFixture> {
  const s = stamp()
  const person = await Person.create({
    personFirstname: 'Alcance',
    personLastname: label,
    personSecondLastname: s,
    personEmail: `alcance-${label}-${s}@gsti-tests.local`,
  })
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `ALC-${s}`
  employee.employeeFirstName = 'Alcance'
  employee.employeeLastName = label
  employee.employeeSecondLastName = s
  employee.employeePayrollNum = `ALC-${s}`
  employee.employeeBusinessEmail = person.personEmail!
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = unit.businessUnitId
  employee.payrollBusinessUnitId = unit.businessUnitId
  employee.departmentId = departmentId
  employee.employeeTerminatedDate = null
  await employee.save()
  return { employee, person }
}

async function createRoleActor(unit: BusinessUnit, label: string): Promise<Actor> {
  const s = stamp()
  const role = await Role.create({
    roleName: `Alcance ${label} ${s}`,
    roleSlug: `alcance-${label}-${s}`,
    roleDescription: 'Rol temporal para el alcance de empleados sin departamento',
    roleActive: 1,
    roleBusinessAccess: unit.businessUnitSlug,
    roleManagementDays: 10,
  })
  return createUser(unit, label, role, s)
}

/** El usuario principal: rol `root` del sistema, ve toda la plantilla sin permiso. */
async function createRootActor(unit: BusinessUnit): Promise<Actor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
  const actor = await createUser(unit, 'root', role, stamp())
  return { ...actor, role: null }
}

async function createUser(unit: BusinessUnit, label: string, role: Role, s: string): Promise<Actor> {
  const email = `alcance-${label}-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: label,
    personSecondLastname: s,
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
  await user.related('businessUnits').attach([unit.businessUnitId])
  return { user, person, role }
}

/** Concede acciones del módulo `employees` (`read`, `full-employee-assigned`, …). */
async function grantEmployeesPermissions(
  roleId: number,
  slugs: string[]
): Promise<RoleSystemPermission[]> {
  const permissions = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .whereIn('system_permission_slug', slugs)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
  if (permissions.length !== slugs.length) {
    throw new Error(`Se requieren los permisos employees:${slugs.join(', ')} en BD para este test.`)
  }
  const grants: RoleSystemPermission[] = []
  for (const permission of permissions) {
    grants.push(
      await RoleSystemPermission.create({ roleId, systemPermissionId: permission.systemPermissionId })
    )
  }
  return grants
}

async function cleanupEmployees(fixtures: EmployeeFixture[]): Promise<void> {
  for (const { employee, person } of fixtures) {
    await UserResponsibleEmployee.query().withTrashed().where('employee_id', employee.employeeId).delete()
    await NoticeRecipient.query().withTrashed().where('employee_id', employee.employeeId).delete()
    await Employee.query().withTrashed().where('employee_id', employee.employeeId).delete()
    await Person.query().where('person_id', person.personId).delete()
  }
}

async function cleanupActor(actor: Actor | null): Promise<void> {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  if (actor.role) {
    await RoleSystemPermission.query().withTrashed().where('role_id', actor.role.roleId).delete()
    await Role.query().where('role_id', actor.role.roleId).delete()
  }
}

async function cleanupUnits(units: BusinessUnit[]): Promise<void> {
  for (const unit of units) {
    // Borrado físico, incluidos los departamentos dados de baja lógica.
    await Department.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

function header(unit: BusinessUnit): string {
  return unit.businessUnitPublicId
}

/** Lee el paginador Lucid de GET /api/employees/ y /to-assigned (data.employees.data). */
function employeeIds(body: Record<string, unknown> | null | undefined): number[] {
  const payload = (body?.data ?? {}) as Record<string, unknown>
  const employees = payload.employees
  let rows: unknown[] = []
  if (Array.isArray(employees)) {
    rows = employees
  } else if (employees && typeof employees === 'object') {
    const nested = (employees as { data?: unknown }).data
    if (Array.isArray(nested)) {
      rows = nested
    }
  }
  return rows
    .map((row) => Number((row as Record<string, unknown>).employeeId))
    .filter((id) => Number.isFinite(id) && id > 0)
}

test.group('Alcance sin departamento — Empleados y lista para asignar (USRH1788466831247)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let emptyUnit: BusinessUnit
  let root: Actor | null = null
  let completo: Actor | null = null
  let restringido: Actor | null = null
  let conDepto: EmployeeFixture
  let sinDepto: EmployeeFixture
  let deptoBaja: EmployeeFixture
  let sinDeptoBaja: EmployeeFixture
  let aCargoSinDepto: EmployeeFixture
  let ajenoSinDepto: EmployeeFixture
  let plantillaSinDeptos: EmployeeFixture[] = []

  group.setup(async () => {
    unit = await createUnit('empresa')
    foreignUnit = await createUnit('ajena')
    emptyUnit = await createUnit('nueva')

    const activo = await createDepartment(unit, 'Activo')
    const eliminado = await createDepartment(unit, 'Eliminado')

    conDepto = await createEmployee(unit, 'ConDepto', activo.departmentId)
    sinDepto = await createEmployee(unit, 'SinDepto', null)
    deptoBaja = await createEmployee(unit, 'DeptoBaja', eliminado.departmentId)
    sinDeptoBaja = await createEmployee(unit, 'SinDeptoBaja', null)
    aCargoSinDepto = await createEmployee(unit, 'ACargo', null)
    ajenoSinDepto = await createEmployee(foreignUnit, 'Ajeno', null)
    plantillaSinDeptos = [
      await createEmployee(emptyUnit, 'Nueva1', null),
      await createEmployee(emptyUnit, 'Nueva2', null),
      await createEmployee(emptyUnit, 'Nueva3', null),
    ]

    // Regla 8: el departamento dado de baja deja al empleado fuera, como hoy.
    await eliminado.delete()
    // Regla 5: un empleado dado de baja no entra aunque no tenga departamento.
    await sinDeptoBaja.employee.delete()

    root = await createRootActor(unit)
    completo = await createRoleActor(unit, 'completo')
    await grantEmployeesPermissions(completo.role!.roleId, ['read', 'full-employee-assigned'])
    restringido = await createRoleActor(unit, 'restringido')
    await grantEmployeesPermissions(restringido.role!.roleId, ['read'])
    await UserResponsibleEmployee.create({
      userId: restringido.user.userId,
      employeeId: aCargoSinDepto.employee.employeeId,
      userResponsibleEmployeeReadonly: 0,
      userResponsibleEmployeeDirectBoss: 0,
    })
  })

  group.teardown(async () => {
    await cleanupEmployees([
      conDepto,
      sinDepto,
      deptoBaja,
      sinDeptoBaja,
      aCargoSinDepto,
      ajenoSinDepto,
      ...plantillaSinDeptos,
    ])
    await cleanupActor(root)
    await cleanupActor(completo)
    await cleanupActor(restringido)
    await cleanupUnits([unit, foreignUnit, emptyUnit])
  })

  test('el usuario principal ve al empleado sin departamento junto a los demás', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/?page=1&limit=100')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', header(unit))

    response.assertStatus(200)
    const ids = employeeIds(response.body())
    assert.include(ids, conDepto.employee.employeeId)
    assert.include(ids, sinDepto.employee.employeeId)
    assert.notInclude(ids, deptoBaja.employee.employeeId, 'departamento dado de baja: regla 8')
    assert.notInclude(ids, sinDeptoBaja.employee.employeeId, 'empleado dado de baja: regla 5')
    assert.notInclude(ids, ajenoSinDepto.employee.employeeId, 'otra empresa: regla 5')
  })

  test('el empleado sin departamento sale con department nulo, sin texto de relleno', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/?page=1&limit=100')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', header(unit))

    response.assertStatus(200)
    const rows = ((response.body().data.employees as { data: Array<Record<string, unknown>> }).data)
    const row = rows.find((r) => Number(r.employeeId) === sinDepto.employee.employeeId)
    assert.isDefined(row)
    assert.isNull(row!.departmentId)
    assert.isNull(row!.department ?? null)
  })

  test('el permiso de acceso completo ve lo mismo que el usuario principal', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/?page=1&limit=100')
      .loginAs(completo!.user)
      .header('X-Business-Unit-Id', header(unit))

    response.assertStatus(200)
    const ids = employeeIds(response.body())
    assert.include(ids, conDepto.employee.employeeId)
    assert.include(ids, sinDepto.employee.employeeId)
    assert.notInclude(ids, deptoBaja.employee.employeeId)
    assert.notInclude(ids, ajenoSinDepto.employee.employeeId)
  })

  test('la búsqueda sigue aplicando al empleado sin departamento', async ({ client, assert }) => {
    const match = await client
      .get(`/api/employees/?page=1&limit=100&search=${sinDepto.employee.employeeSecondLastName}`)
      .loginAs(completo!.user)
      .header('X-Business-Unit-Id', header(unit))
    const miss = await client
      .get('/api/employees/?page=1&limit=100&search=NADIE-SE-LLAMA-ASI')
      .loginAs(completo!.user)
      .header('X-Business-Unit-Id', header(unit))

    match.assertStatus(200)
    miss.assertStatus(200)
    assert.deepEqual(employeeIds(match.body()), [sinDepto.employee.employeeId])
    assert.deepEqual(employeeIds(miss.body()), [])
  })

  test('en una empresa sin departamentos, el usuario principal ve a toda su plantilla', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/?page=1&limit=100')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', header(emptyUnit))

    response.assertStatus(200)
    const ids = employeeIds(response.body())
    assert.sameMembers(
      ids,
      plantillaSinDeptos.map((f) => f.employee.employeeId)
    )
  })

  test('la lista para asignar colaboradores incluye al empleado sin departamento', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/to-assigned?page=1&limit=100')
      .loginAs(completo!.user)
      .header('X-Business-Unit-Id', header(unit))

    response.assertStatus(200)
    const ids = employeeIds(response.body())
    assert.include(ids, conDepto.employee.employeeId)
    assert.include(ids, sinDepto.employee.employeeId)
    assert.notInclude(ids, deptoBaja.employee.employeeId)
    assert.notInclude(ids, sinDeptoBaja.employee.employeeId)
    assert.notInclude(ids, ajenoSinDepto.employee.employeeId)
  })

  test('el acceso restringido sigue viendo solo a sus colaboradores a cargo, tengan o no departamento', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/employees/?page=1&limit=100')
      .loginAs(restringido!.user)
      .header('X-Business-Unit-Id', header(unit))

    response.assertStatus(200)
    assert.deepEqual(employeeIds(response.body()), [aCargoSinDepto.employee.employeeId])
  })
})
```

- [ ] **Step 2: Correr el spec para verificar que falla por el motivo correcto**

```bash
node ace test functional --files="employee_scope_sin_departamento"
```

Esperado: **fallan** estos cuatro tests, todos en una aserción `include` sobre el id de `sinDepto` (o en `sameMembers` con lista vacía en el de la empresa nueva):

- "el usuario principal ve al empleado sin departamento junto a los demás"
- "el permiso de acceso completo ve lo mismo que el usuario principal"
- "en una empresa sin departamentos, el usuario principal ve a toda su plantilla"
- "la lista para asignar colaboradores incluye al empleado sin departamento"

Y **pasan** "el acceso restringido sigue viendo…" y el de `department` nulo puede fallar en `isDefined` (el empleado aún no aparece): también es esperado. "la búsqueda sigue aplicando…" falla en el `match` (aún no lo ve) y eso también es esperado.

Si el spec falla en `setup` (conexión, permisos `read`/`full-employee-assigned` inexistentes, rol `root` inexistente), **no es el código**: es la base local. Sembrar roles y permisos (`0006_role_seeder`, `0018_system_permission_seeder`) y reintentar.

- [ ] **Step 3: Agregar el import en `employee_service.ts`**

En el bloque de imports de `app/services/employee_service.ts`, junto a los demás `#helpers` (por ejemplo debajo de `import { isTerminatedEmployeesFilterRequested } from '#helpers/terminated_employees_filter'`):

```ts
import { applyVisibleDepartmentsScope } from '#helpers/apply_visible_departments_scope'
```

- [ ] **Step 4: Reemplazar el bloque en `index`**

Localizar el método `index` (`async index(filters: EmployeeFilterSearchInterface, departmentsList: Array<number>, allowedBusinessUnitIds: number[] = [])`) y dentro de su cadena de query, **este bloque** (hoy `:478-483`, justo después del `.if(filters.userResponsibleId && …)` de colaboradores a cargo):

```ts
      .if(
        !filters.userResponsibleId,
        (query) => {
          query.whereIn('departmentId', departmentsList)
        }
      )
```

**Dejar en su lugar exactamente esto:**

```ts
      .if(
        !filters.userResponsibleId,
        (query) => {
          applyVisibleDepartmentsScope(query, departmentsList)
        }
      )
```

Cambia una sola línea. La condición `!filters.userResponsibleId` **no se toca**: es la que mantiene idéntico al acceso restringido (regla 3).

- [ ] **Step 5: Reemplazar el bloque en `indexToAssigned`**

Localizar el método `indexToAssigned` (`async indexToAssigned(filters: EmployeeFilterSearchInterface, departmentsList: Array<number>, allowedBusinessUnitIds: number[] = [])`) y dentro de su cadena, el mismo bloque (hoy `:8402-8407`):

```ts
      .if(
        !filters.userResponsibleId,
        (query) => {
          query.whereIn('departmentId', departmentsList)
        }
      )
```

**Dejar en su lugar exactamente esto:**

```ts
      .if(
        !filters.userResponsibleId,
        (query) => {
          applyVisibleDepartmentsScope(query, departmentsList)
        }
      )
```

- [ ] **Step 6: Confirmar que no queda ningún `whereIn` de departamentos en las dos listas**

```bash
grep -n "whereIn('departmentId', departmentsList)" app/services/employee_service.ts
```

Esperado: **exactamente 1 resultado**, en `getAllVacationsByPeriod` (hoy `:2346`). Ese es el Reporte de vacaciones, que la HU reserva para USRH1788466831312: **no se toca**. Antes de este plan el `grep` daba 3.

- [ ] **Step 7: Correr el spec para verificar que pasa**

```bash
node ace test functional --files="employee_scope_sin_departamento"
```

Esperado: PASA, 7 de 7.

- [ ] **Step 8: Correr la suite unitaria completa, tipos y estilo**

```bash
node ace test unit && npm run typecheck && npm run lint
```

Esperado: todo limpio. No debe haber regresiones.

- [ ] **Step 9: Commit**

```bash
git add app/services/employee_service.ts tests/functional/employee_scope_sin_departamento.spec.ts
git commit -m "fix(USRH1788466831247): Empleados y lista para asignar muestran a los sin departamento

Con root o full-employee-assigned, index e indexToAssigned recortaban con
whereIn(departmentId, departamentosActivos): un empleado sin departamento no
caía en ninguno y una empresa sin departamentos veía la lista vacía. Los dos
consumen el helper unico; la condicion que decide cuando aplica no cambia,
asi que el acceso restringido ve exactamente lo mismo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Avisos a toda la empresa — al guardar y al salir programado

Las dos rutas (guardar desde el compositor y el envío programado desde el comando) resuelven destinatarios con `resolveRecipientsByCriteria`, que recorta con `applyRoleScope`. Una sola línea corrige ambas.

**Files:**
- Modify: `app/services/notice_service.ts` — método `applyRoleScope` (hoy `:492-519`) y su comentario
- Modify: `app/helpers/resolve_employee_role_scope.ts` — comentario de `departmentsList` (hoy `:11`)
- Modify: `tests/functional/notice_lifecycle.spec.ts` — comentario del `setup` (hoy `:222-223`)
- Test: `tests/functional/employee_scope_sin_departamento.spec.ts` (se agrega un grupo al final)

**Interfaces:**
- Consumes: `applyVisibleDepartmentsScope(query, departmentsList)` de `#helpers/apply_visible_departments_scope` (Task 1). Las fixtures `createUnit`, `createDepartment`, `createEmployee`, `createRoleActor`, `grantEmployeesPermissions`, `cleanupEmployees`, `cleanupActor`, `cleanupUnits`, `header` del spec de la Task 2.
- Produces: nada nuevo. `applyRoleScope` conserva firma `(query: ModelQueryBuilderContract<typeof Employee>, roleScope: EmployeeRoleScope): void` y sigue siendo `private`.

- [ ] **Step 1: Agregar el grupo de avisos al spec funcional**

Al **final** de `tests/functional/employee_scope_sin_departamento.spec.ts` (después del grupo de la Task 2), agregar:

```ts
test.group('Alcance sin departamento — avisos a toda la empresa (USRH1788466831247)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let completo: Actor | null = null
  let conDepto: EmployeeFixture
  let sinDepto: EmployeeFixture
  let deptoBaja: EmployeeFixture
  let ajenoSinDepto: EmployeeFixture
  let sinDeptoNuevo: EmployeeFixture | null = null
  let noticeGrants: RoleSystemPermission[] = []
  const createdNotices: number[] = []

  group.setup(async () => {
    unit = await createUnit('avisos')
    foreignUnit = await createUnit('avisos-ajena')
    const activo = await createDepartment(unit, 'Avisos')
    const eliminado = await createDepartment(unit, 'AvisosEliminado')
    conDepto = await createEmployee(unit, 'AvisoConDepto', activo.departmentId)
    sinDepto = await createEmployee(unit, 'AvisoSinDepto', null)
    deptoBaja = await createEmployee(unit, 'AvisoDeptoBaja', eliminado.departmentId)
    ajenoSinDepto = await createEmployee(foreignUnit, 'AvisoAjeno', null)
    await eliminado.delete()

    completo = await createRoleActor(unit, 'avisos-completo')
    await grantEmployeesPermissions(completo.role!.roleId, ['read', 'full-employee-assigned'])
    noticeGrants = await grantNoticePermissions(completo.role!.roleId, ['read', 'create'])
  })

  group.teardown(async () => {
    if (createdNotices.length > 0) {
      await NoticeRecipient.query().withTrashed().whereIn('notice_id', createdNotices).delete()
      await NoticeFile.query().withTrashed().whereIn('notice_id', createdNotices).delete()
      await Notice.query().withTrashed().whereIn('notice_id', createdNotices).delete()
    }
    await revokeNoticePermissions(noticeGrants)
    await cleanupEmployees(
      [conDepto, sinDepto, deptoBaja, ajenoSinDepto, sinDeptoNuevo].filter(
        (f): f is EmployeeFixture => f !== null
      )
    )
    await cleanupActor(completo)
    await cleanupUnits([unit, foreignUnit])
  })

  test('al guardar un programado para toda la empresa, el sin departamento es destinatario', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/notices')
      .json({
        noticeSubject: 'Toda la plantilla',
        noticeDescription: '<p>Mensaje</p>',
        noticeAudience: 'company',
        noticeSendMode: 'scheduled',
        noticeScheduledAt: DateTime.now().plus({ days: 1 }).toISO(),
      })
      .header('X-Business-Unit-Id', header(unit))
      .loginAs(completo!.user)

    response.assertStatus(201)
    const notice = response.body().data.notice
    createdNotices.push(notice.noticeId)
    const ids = (notice.recipients as Array<{ employeeId: number }>).map((r) => r.employeeId)
    assert.include(ids, conDepto.employee.employeeId)
    assert.include(ids, sinDepto.employee.employeeId)
    assert.notInclude(ids, deptoBaja.employee.employeeId, 'departamento dado de baja: regla 8')
    assert.notInclude(ids, ajenoSinDepto.employee.employeeId, 'otra empresa: regla 5')
  })

  test('al salir el programado, se vuelve a resolver con el mismo criterio y sin mezclar empresas', async ({
    assert,
  }) => {
    assert.isAbove(createdNotices.length, 0, 'depende del aviso guardado en el test anterior')
    const noticeId = createdNotices[0]
    // Entró a la empresa después de programar el aviso y sigue sin departamento:
    // al salir, cuenta hoy, no entonces.
    sinDeptoNuevo = await createEmployee(unit, 'AvisoSinDeptoNuevo', null)

    // El comando corre fuera de una request y con el tenant en bypass: es el
    // caso en el que solo el business_unit_id explícito acota.
    const service = new NoticeService(i18nManager.locale(i18nManager.defaultLocale))
    const notice = await Notice.findOrFail(noticeId)
    await TenantContext.runUnscoped(
      () => service.refreshCriteriaRecipients(notice),
      'test USRH1788466831247: envío programado'
    )

    const rows = await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', noticeId)
    const ids = rows.map((r) => r.employeeId)
    assert.include(ids, sinDepto.employee.employeeId)
    assert.include(ids, sinDeptoNuevo.employee.employeeId)
    assert.include(ids, conDepto.employee.employeeId)
    assert.notInclude(ids, deptoBaja.employee.employeeId)
    assert.notInclude(ids, ajenoSinDepto.employee.employeeId, 'otra empresa con el tenant en bypass')
  })
})
```

- [ ] **Step 2: Correr el spec para verificar que el grupo nuevo falla**

```bash
node ace test functional --files="employee_scope_sin_departamento"
```

Esperado: el grupo de la Task 2 PASA (7 de 7). Del grupo nuevo, **fallan** los dos tests en el `include` del id de `sinDepto` (el primero) y de `sinDepto`/`sinDeptoNuevo` (el segundo). Si el primero falla con `401`/`403`, el módulo de avisos tiene la exigencia encendida y faltan concesiones: revisar que `grantNoticePermissions` haya encontrado `read` y `create` del módulo `avisos-y-noticias`.

- [ ] **Step 3: Agregar el import en `notice_service.ts`**

En el bloque de imports de `app/services/notice_service.ts`, junto a `import { resolveEmployeeRoleScope, type EmployeeRoleScope } from '#helpers/resolve_employee_role_scope'`:

```ts
import { applyVisibleDepartmentsScope } from '#helpers/apply_visible_departments_scope'
```

- [ ] **Step 4: Reemplazar la última línea de `applyRoleScope` y su comentario**

Localizar el método `private applyRoleScope(` en `app/services/notice_service.ts`. **Borrar** su comentario de doc y la última línea del cuerpo:

```ts
  /**
   * Mismo recorte que `EmployeeService.index`: sin acceso completo a la
   * plantilla, solo los colaboradores a cargo del usuario y él mismo; con
   * acceso completo, los departamentos visibles para el rol.
   */
```

```ts
    query.whereIn('department_id', roleScope.departmentsList)
```

**Dejar en su lugar, respectivamente:**

```ts
  /**
   * Mismo recorte que `EmployeeService.index`: sin acceso completo a la
   * plantilla, solo los colaboradores a cargo del usuario y él mismo; con
   * acceso completo, los departamentos visibles para el rol **y los
   * empleados sin departamento** (USRH1788466831247). El `business_unit_id`
   * explícito de la query sigue acotando por fuera: también cuando el
   * programado sale con el tenant en bypass.
   */
```

```ts
    applyVisibleDepartmentsScope(query, roleScope.departmentsList)
```

El `if (userId) { … return }` de arriba —la rama del restringido— **no se toca**.

- [ ] **Step 5: Actualizar el comentario de `departmentsList` en el helper de alcance**

En `app/helpers/resolve_employee_role_scope.ts`, la interfaz `EmployeeRoleScope` documenta hoy:

```ts
  /** Departamentos visibles para el rol. `root` y `full-employee-assigned` ven todos. */
  departmentsList: number[]
```

**Dejar:**

```ts
  /**
   * Departamentos activos visibles para el rol. `root` y `full-employee-assigned`
   * ven todos; para ellos las listas y los avisos agregan además a los empleados
   * sin departamento con `applyVisibleDepartmentsScope` (USRH1788466831247).
   */
  departmentsList: number[]
```

- [ ] **Step 6: Corregir el comentario que describía el defecto como regla**

En `tests/functional/notice_lifecycle.spec.ts`, dentro del `group.setup` del grupo *"Avisos — ciclo de vida (v2, segunda entrega)"*, hay este comentario (hoy `:222-223`):

```ts
    // El listado de empleados —y con él `company`— solo alcanza a quien tiene
    // departamento: los dos actores lo necesitan para contar como público.
```

**Dejar:**

```ts
    // Departamento compartido para el escenario de público `department`. Desde
    // USRH1788466831247 `company` alcanza también a quien no tiene departamento.
```

No cambia ninguna aserción de ese spec: los actores conservan su departamento y el público `department` sigue necesitándolo.

- [ ] **Step 7: Confirmar que ya no queda ningún `whereIn` de departamentos en avisos**

```bash
grep -n "whereIn('department_id'" app/services/notice_service.ts
```

Esperado: **cero resultados**. Antes de este plan daba 1 (`applyRoleScope`).

- [ ] **Step 8: Correr los specs afectados**

```bash
node ace test functional --files="employee_scope_sin_departamento" && node ace test functional --files="notice_lifecycle"
```

Esperado: `employee_scope_sin_departamento` PASA 9 de 9; `notice_lifecycle` PASA completo, sin regresiones (su test *"un rol sin acceso completo: company se recorta a los colaboradores a cargo…"* es la regla 3 vista desde avisos, y debe seguir pasando).

- [ ] **Step 9: Tipos, estilo y suite unitaria**

```bash
node ace test unit && npm run typecheck && npm run lint
```

Esperado: todo limpio.

- [ ] **Step 10: Commit**

```bash
git add app/services/notice_service.ts app/helpers/resolve_employee_role_scope.ts tests/functional/employee_scope_sin_departamento.spec.ts tests/functional/notice_lifecycle.spec.ts
git commit -m "fix(USRH1788466831247): el aviso a toda la empresa llega a los sin departamento

applyRoleScope recortaba el publico company con whereIn(department_id,
departamentosActivos), asi que un empleado sin departamento nunca era
destinatario, ni al guardar ni al salir programado. Consume el helper unico;
el business_unit_id explicito sigue acotando por fuera del parentesis, tambien
con el tenant en bypass del comando.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Manual de prueba manual de API (hermano del plan)

Todo plan de este repo entrega su manual de QA hermano. Esta tarea lo construye.

**La regla manda:** `~/.cursor/rules/manual-qa-api.mdc` (`alwaysApply`). **Leerla completa antes de escribir una línea.** Cada step de abajo aplica una sección de esa regla y la nombra entre comillas; lo que sigue son las constantes y los datos de esta HU ya resueltos, no una versión de la regla. Si algo de aquí pareciera contradecirla, manda la regla.

**Files:**
- Create: `docs/superpowers/plans/2026-09-15-alcance-empleados-sin-departamento-qa-api.md`
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado, está en `.git/info/exclude`)

**Interfaces:**
- Consumes: el comportamiento entregado por las Tasks 2 y 3.
- Produces: nada que consuma otra tarea.

- [ ] **Step 1: "Antes de escribir: tomar las constantes del proyecto"**

La regla: *"abre un manual anterior del mismo API —o el código, si no hay ninguno— y anota la URL base local, el esquema de auth, la forma del envelope de éxito y de error, dónde vive el seeder de QA, y el dominio y contraseña de los usuarios de prueba."*

Manual anterior del mismo API: `docs/superpowers/plans/2026-09-14-reporte-asistencia-sin-departamento-qa-api.md`. Abrirlo y anotar. Lo que ya trae:

| Constante | Valor en el manual anterior |
|---|---|
| URL base local | `http://127.0.0.1:3333` |
| Esquema de auth | Resuelta por el cliente: `Authorization: Bearer <token>`. No se documenta el login |
| Header obligatorio en toda petición | `X-Business-Unit-Id: <identificador público de la empresa>`, resuelto en Preparar con una consulta por usuario |
| Seeder de QA | `database/seeders/_tmp_do_not_commit_qa_seeder.ts` |
| Comando del seeder | `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts` |
| Dominio de pruebas | `@gsti-tests.local` |
| Contraseña de prueba | `password` |

Lo que el manual anterior **no** trae y hay que anotar leyendo el código (la regla lo permite como fuente cuando el manual no lo tiene; leerlo es investigación, no se publica): la forma exacta del envelope de éxito de `GET /api/employees/`, `GET /api/employees/to-assigned` (`{ type, title, message, data: { employees: <paginador> } }`, con las filas en `data.employees.data` y los campos de cada fila) y de `POST /api/notices` (`201`, `data.notice` con `recipients`), y el envelope de error de los tres.

- [ ] **Step 2: "Setup — seeder QA (no versionado)"**

La regla: *"Todo lo necesario va en un solo archivo, el mismo que ya usan los paneles del producto — no crear uno nuevo"*; usuarios *"`qa-<feature>-<variante>@<dominio de pruebas>` con la contraseña de prueba del proyecto, uno por variante del caso"*; *"Roles, permisos y datos de negocio imprescindibles para la HU"*; *"Los ids que van en las URLs no se inventan ni se hardcodean: se entregan con la consulta que los resuelve"*; *"El playbook incluye un solo comando: el que corre ese seeder."*

Agregar al seeder existente, con `<feature>` = `alcance`:

**Usuarios (una variante cada uno):**

| | Correo | Variante |
|---|---|---|
| **A** | `qa-alcance-principal@gsti-tests.local` | Usuario principal (`root`) de la empresa de prueba |
| **B** | `qa-alcance-completo@gsti-tests.local` | Rol con `read` y `full-employee-assigned` en Empleados, y `read` y `create` en Avisos, en la empresa de prueba |
| **C** | `qa-alcance-restringido@gsti-tests.local` | Rol con solo `read` en Empleados; responsable de `QA-ALC-04` |
| **D** | `qa-alcance-nueva@gsti-tests.local` | Usuario principal (`root`) de una segunda empresa **sin ningún departamento** |

**Datos de negocio imprescindibles:** tres empresas (de prueba, nueva sin departamentos, ajena), un departamento activo y uno dado de baja en la empresa de prueba, y estos empleados activos con correo de trabajo:

| Código de nómina | Empresa | Estructura |
|---|---|---|
| `QA-ALC-01` | de prueba | Con departamento activo |
| `QA-ALC-02` | de prueba | Sin departamento ni puesto |
| `QA-ALC-03` | de prueba | Apunta al departamento dado de baja (sembrarlo, asignarlo y darlo de baja después) |
| `QA-ALC-04` | de prueba | Sin departamento; a cargo del usuario **C** (fila en `user_responsible_employees`) |
| `QA-ALC-05` | de prueba | Sin departamento y **dado de baja** |
| `QA-ALC-06` | ajena | Sin departamento |
| `QA-ALC-11`, `QA-ALC-12`, `QA-ALC-13` | nueva | Sin departamento |

**Consultas que entregan los ids** (van al manual, en Preparar; el manual nunca trae un número):

```sql
SELECT employee_id AS id FROM employees
WHERE employee_payroll_code = 'QA-ALC-02' AND employee_deleted_at IS NULL;
```

```sql
SELECT business_unit_public_id FROM business_units WHERE business_unit_slug = 'qa-alcance-prueba';
```

(una por empresa: `qa-alcance-prueba`, `qa-alcance-nueva`; la ajena no se usa en ningún header).

Correr el seeder y confirmar que termina sin error:

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

- [ ] **Step 3: "Alcance — solo la HU"**

La regla: *"Documentar únicamente lo que la historia pide validar. No pasos de configuración manual si se pueden sembrar. No casos borde ni regresiones. Si un caso de la HU no se puede provocar en un ambiente sembrado, se declara en una línea y no se le inventan pasos."*

Lo que la HU pide validar está en su sección *"Cómo sabremos que quedó bien"* y en *"Lo que no debe pasar"*. Un escenario por variante, nada más:

| # | Usuario | Endpoint | Qué pide la HU |
|---|---|---|---|
| 1 | **A** | `GET /api/employees/?page=1&limit=100` | El usuario principal encuentra a `QA-ALC-02` junto con los demás, con departamento vacío. No aparecen `QA-ALC-03` (departamento dado de baja), `QA-ALC-05` (dado de baja) ni `QA-ALC-06` (otra empresa) |
| 2 | **B** | mismo endpoint | *"Lo mismo ocurre cuando entra quien tiene… Acceso total a colaboradores asignados"* |
| 3 | **B** | mismo endpoint con `&search=<apellido de QA-ALC-02>` y luego con `&search=NADIE-SE-LLAMA-ASI` | *"que aparezcan empleados… que no coinciden con la búsqueda escrita"* no debe pasar |
| 4 | **B** | `GET /api/employees/to-assigned?page=1&limit=100` | *"en la lista para asignarle colaboradores a un responsable"* |
| 5 | **B** | `POST /api/notices` (público `company`, modo `scheduled`) | *"entre los destinatarios de un aviso programado para toda la empresa… al guardarlo"* |
| 6 | **C** | `GET /api/employees/?page=1&limit=100` | *"Un jefe con acceso restringido… sigue viendo a sus colaboradores a cargo, tengan o no departamento. No gana a nadie"* |
| 7 | **D** | `GET /api/employees/?page=1&limit=100` con el header de la empresa nueva | *"En una empresa recién creada, sin ningún departamento y con tres empleados… ve a los tres, no una lista vacía"* |

**Caso de la HU que no se puede provocar desde un cliente de API:** *"en el momento en que sale"* el aviso programado. Sale por un proceso agendado, no por una petición HTTP, y la regla solo admite un comando en el manual (el del seeder). Se declara en una línea en el manual —antes del primer escenario, como hace el manual anterior con su caso no observable— y no se le inventan pasos. Lo cubre la prueba funcional de la Task 3.

- [ ] **Step 4: "Formato — contrato, no código"**

La regla: *"Cada paso indica el endpoint (método + ruta + body si aplica) y el response exacto (status + body). Nunca 'debería fallar': el status y el identificador del error van escritos literales."* Permitido: *"métodos y rutas HTTP, bodies JSON, query params, status, envelopes, códigos de error, SQL de preparación o de consulta de ids, correos y contraseñas de prueba."* Prohibido: *"rutas de archivos, nombres de clases, servicios, validadores o middlewares, el lenguaje del backend, y cualquier 'revisa el código de X'. Quien prueba no abre el repo."* *"Los bodies de ejemplo van completos y pegables, con `"..."` solo en lo que no importa al caso."*

Para cada escenario de la tabla del Step 3, escribir el endpoint completo (método, ruta, headers `Authorization` y `X-Business-Unit-Id`, query params, body) y el response exacto. Los responses se derivan leyendo el contrato real en el código (status, envelope, nombre de cada campo) y se transcriben; el manual no dice de dónde salieron. El único body de esta HU es el del escenario 5; va completo y pegable:

```json
{
  "noticeSubject": "Aviso para toda la plantilla",
  "noticeDescription": "<p>Mensaje de prueba</p>",
  "noticeAudience": "company",
  "noticeSendMode": "scheduled",
  "noticeScheduledAt": "2026-12-31T10:00:00.000-06:00"
}
```

En los responses de lista, las filas de los colaboradores que **sí** aparecen se escriben con sus campos verificables (`employeeId` como `<id de QA-ALC-02, resuelto en Preparar>`, `employeePayrollCode`, `departmentId: null`, `department: null`) y `"..."` en lo que no importa al caso. Los que **no** deben aparecer se declaran debajo del response como ausencia verificable: *"`QA-ALC-06` no está en la lista"*.

- [ ] **Step 5: "Qué significa cada dato — en lenguaje de negocio, por escenario"**

La regla: *"Después del response exacto de cada escenario, agrega una lista corta que explique en lenguaje llano qué significa cada dato que ese escenario verifica"*; *"Un renglón por dato: `` `campo`: qué es en palabras simples ``"*; *"Cero términos técnicos y cero jerga de código: nada de tipos, formatos internos ni nombres de columnas."*

Y sus dos subsecciones:

- *"Valores fijos — se enumeran y explican todos"*: cada dato con valores cerrados se lista completo, con la traducción de cada valor, en el primer escenario donde aparece; *"Si un valor existe en el contrato pero no se puede provocar en el ambiente sembrado, se lista igual y se declara en una línea que no es observable aquí."* En esta HU son valores cerrados, al menos: `noticeAudience` (`company`, `department`, `manual`), `noticeSendMode` (`now`, `draft`, `scheduled`, `update`) y `noticeStatus` (`sent`, `scheduled`, `draft`) del response del escenario 5, más `noticeType` (`text`, `image`, `pdf`) si el response lo trae. Confirmar la lista completa contra el contrato al derivar el response (Step 4) y traducir cada valor; los que el manual no provoca (`department`, `manual`, `now`, `draft`, `update`, `sent`, `image`, `pdf`) se listan igual y se declaran no observables aquí.
- *"Sin redundancia — cada dato se explica una sola vez"*: en el primer escenario donde aparece. Los escenarios 2, 3, 6 y 7 repiten los datos del 1: llevan `(Los datos son los ya explicados en el Escenario 1.)`. El 4 explica solo lo que la lista para asignar estrena, con `Qué significa lo nuevo aquí:`. El 5 estrena el aviso completo.

- [ ] **Step 6: "Ejemplo cotidiano — que lo entienda cualquiera"**

La regla: *"Después de Problema / Solución, agrega un `Ejemplo:` de 2-4 líneas que ponga el mismo problema en un contexto común y sencillo (tienda, escuela, casa, fútbol, videojuegos) que un adolescente entienda sin conocer el producto ni el negocio."* *"Lenguaje llano: cero términos de negocio y cero términos técnicos. No inventa casos nuevos: solo ilustra con lo cotidiano lo ya dicho en Problema / Solución. Formato: una línea `Ejemplo: ...`"*.

Escribir Problema y Solución (dos párrafos, lenguaje llano, sin términos técnicos) a partir de *"¿Qué nos cuenta el usuario?"* y *"Qué se espera lograr"* de la HU, y debajo una sola línea `Ejemplo: ...` que ilustre exactamente eso (personas que existen y trabajan pero no aparecen en la lista de quien debería verlas todas, solo porque les falta un dato de agrupación).

- [ ] **Step 7: "Interruptores globales — avisar y restaurar"**

La regla: *"Si el recorrido enciende una bandera que no está acotada al tenant o a la empresa de prueba, el manual lo advierte antes del primer escenario… y termina con un paso de limpieza."*

Este recorrido no enciende ninguna: los permisos se conceden a roles sembrados y las tres empresas son de prueba. Por tanto **no hay sección de Limpieza** (punto 4 de la estructura mínima es condicional).

- [ ] **Step 8: "Estructura mínima" — armar el manual**

La regla fija cinco puntos; el manual lleva exactamente estos, en este orden:

1. *Problema / Solución / Ejemplo* (Step 6).
2. *Preparar* — el comando del seeder, la tabla de usuarios con la variante de cada uno, la tabla de colaboradores y las consultas de ids y de identificador de empresa (Step 2). Aquí va también la línea que declara el caso no provocable (Step 3).
3. *Un escenario por variante* — los siete del Step 3, cada uno con endpoint, response exacto (Step 4) y su lista de qué significa cada dato (Step 5).
4. *Limpieza* — no aplica (Step 7).
5. *Checklist* — una casilla por escenario, siete.

Crear `docs/superpowers/plans/2026-09-15-alcance-empleados-sin-departamento-qa-api.md` con eso.

- [ ] **Step 9: Revisar el manual contra la regla antes de commitear**

Releer el manual con la regla al lado y confirmar, punto por punto de su lista de *Prohibido* y de *Sin redundancia*:

- No hay rutas de archivos, nombres de clases, servicios, validadores ni middlewares, ni el lenguaje del backend, ni "revisa el código de X". El único `.ts` del manual es la ruta del seeder dentro del comando que la regla obliga a incluir.
- No hay login documentado.
- Ningún response dice "debería": status y cuerpo van literales.
- Ningún id va como número: todos como `<id de …, resuelto en Preparar>`.
- Cada dato se explica una sola vez; los escenarios sin datos nuevos remiten al escenario donde se explicó.
- Todos los valores cerrados están enumerados y traducidos, y los no observables declarados.
- Hay una línea `Ejemplo:` y solo una, después de Problema / Solución.
- No hay sección de Limpieza y no hay ningún comando además del seeder.

- [ ] **Step 10: Commit**

```bash
git add docs/superpowers/plans/2026-09-15-alcance-empleados-sin-departamento-qa-api.md
git commit -m "docs(USRH1788466831247): manual de QA de API del alcance sin departamento

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

El seeder **no** se agrega al commit: está en `.git/info/exclude` a propósito.

---

## Verificación del desarrollador (antes de entregar a QA)

Esto **no** es el manual de QA —ese lo construye la Task 4 y sigue su propia regla—. Esta lista es el humo que corre quien implementa antes de pasar la rama, con el backoffice apuntando al API local y los datos del seeder de QA.

**Empleados**

- [ ] Como usuario principal: `QA-ALC-02` aparece en la lista con la tarjeta de departamento en "No asignado". `QA-ALC-03` (departamento dado de baja) **no** aparece.
- [ ] Como usuario **B** (acceso completo): mismo resultado.
- [ ] Como usuario **C** (restringido): solo `QA-ALC-04`.
- [ ] Como usuario **D** en la empresa nueva: los tres empleados, no una lista vacía.
- [ ] Filtros de la pantalla (búsqueda, departamento, puesto, bajas) siguen funcionando igual sobre los demás empleados.

**Asignar colaboradores a un responsable**

- [ ] Como **B**, al elegir colaboradores para un responsable, `QA-ALC-02` está en la lista con su texto de departamento no especificado.

**Avisos y noticias**

- [ ] Como **B**, al redactar un aviso para toda la empresa, el conteo de destinatarios incluye a `QA-ALC-02` y `QA-ALC-04`; al guardarlo programado, están en la lista de destinatarios.
- [ ] Correr `node ace notices:send-scheduled` con un aviso vencido: `QA-ALC-02` lo recibe; `QA-ALC-06` (otra empresa) no.
- [ ] Público `department`: sin cambios; un departamento fuera del alcance del rol sigue respondiendo `departamento-fuera-de-alcance`.

**Lo que no debe haber cambiado**

- [ ] Reporte de vacaciones, Matriz de vencimientos y reportes de asistencia: iguales que hoy (los sin departamento **no** entran; es de USRH1788466831312/USRH1788466831333).
- [ ] Tablero de estadísticas de asistencia: igual que hoy (supuesto de la HU, ver pendientes).

---

## Fuera de alcance (anotado, no se toca)

- **La lista para asignar colaboradores con acceso restringido** sigue mostrando toda la empresa (`indexToAssigned` no aplica el filtro de colaboradores a cargo). La HU lo anota como hallazgo aparte; este plan no lo corrige ni lo empeora: la rama del restringido no pasa por el helper.
- **Reporte de vacaciones** (`getAllVacationsByPeriod`, `employee_service.ts:2346`), **Matriz de vencimientos**, **listas de departamentos** (`department_controller.ts`) y **reportes de asistencia**: reciben el criterio en USRH1788466831312. Se dejan con su `whereIn` actual a propósito; el `grep` del Task 2 Step 6 lo confirma.
- **Empleados con departamento dado de baja** (`QA-ALC-03`): siguen sin verse hasta USRH1788466831452.
- **El tablero de estadísticas de asistencia** (`attendance-stats.service.ts`) consume `resolveEmployeeRoleScope` pero aplica su propio recorte en su repositorio; no pasa por ninguno de los tres sitios y **no cambia** con este plan. Es el supuesto de la HU.
- **Aviso programado cuyo autor ya no existe**: se sigue resolviendo con la empresa completa (`roleScope === null` → sin recorte), como hoy.
- **Expedientes de empleado** (`app/services/employee_proceeding_file_service.ts`): tiene el mismo `whereIn('departmentId', departmentsList)` sin el `OR IS NULL` en seis sitios (un empleado sin departamento se sigue perdiendo para quien tiene acceso completo). No entra en este plan; queda reservado para USRH1788466831312.

---

## Pendientes con Wilvardo

- [ ] Confirmar el supuesto de la HU: el tablero de estadísticas de asistencia sigue excluyendo a los empleados sin departamento y queda fuera de este set.
- [ ] Confirmar que ningún cliente del listado (`GET /api/employees/`) depende de que `department` nunca venga `null` para quien tiene acceso completo. La pantalla de Empleados ya lo maneja ("No asignado"); la pregunta es por otros consumidores del mismo endpoint (exportaciones, integraciones).
- [ ] Dejar registrado el hallazgo de la lista para asignar con acceso restringido (ve toda la empresa) como historia aparte, según decide la HU.
