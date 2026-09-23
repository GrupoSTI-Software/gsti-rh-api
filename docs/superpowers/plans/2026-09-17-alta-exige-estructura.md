# Alta de empleado exige departamento y puesto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ninguna alta nueva nazca sin departamento o sin puesto, con un registro de relleno o con la estructura de otra empresa, y que todo rechazo del alta le diga al usuario qué corregir (nunca la pantalla de error general).

**Architecture:** Hoy `POST /api/employees` rellena en silencio con "Sin departamento" / "Sin posición" cuando faltan, y `verifyStructureExist` solo comprueba que el id exista y no esté eliminado — no mira la empresa del empleado. El cambio retira ese relleno, exige los dos datos con un mensaje que dice cuál falta (o que faltan los dos), y reutiliza `EmployeeStructureService.verifyAssignable` (ya existe por USRH1788466831270) para confirmar que el id existe, no está eliminado y pertenece a la empresa del empleado. El `E_VALIDATION_ERROR` del alta sale como 400, igual que ya hace la edición. El importador de Excel y `syncCreate` (biométricos) no pasan por `store`: no se tocan.

**Tech Stack:** AdonisJS 6 · Lucid · VineJS · TypeScript estricto · Japa (`node ace test`) · MySQL

**Repo:** `gsti-rh-api` · **Rama:** `feature/USRH1789328927556-alta-exige-estructura` · **Target:** `multitenant`

**HU:** USRH1789328927556 — *Alta de empleado exige departamento y puesto*

---

## Global Constraints

- **Regla 1.** Al dar de alta un empleado, `departmentId` y `positionId` son **obligatorios**. Si falta uno, el mensaje dice cuál; si faltan los dos, el mensaje lo dice. No se crea nada.
- **Regla 2.** El alta **nunca** completa un departamento o un puesto faltante con "Sin Departamento", "Sin posición" ni ningún otro valor. Vacío o en cero cuenta como faltante: `null`, `undefined`, `''`, `0`, `'0'`.
- **Regla 3.** El departamento y el puesto tienen que existir, no estar eliminados (`*_deleted_at IS NULL`) y pertenecer a la empresa del empleado: `businessUnitId` del empleado, **no** las empresas a las que tiene acceso quien captura. Si no se cumple, se rechaza.
- **Regla 4.** Todo rechazo del alta por un dato mal capturado es un mensaje, **nunca** la pantalla de error general. El BO abre `error.vue` con cualquier status `>= 500`. Un `E_VALIDATION_ERROR` en `store` tiene que salir como **400**, no como 500 (la edición ya lo hace).
- **Regla 5.** Si el alta se rechaza, la persona capturada para ese acto se libera si quedó huérfana (`releasePersonIfOrphan`, ya existe). El reintento no choca con su correo.
- **Regla 6.** El importador de Excel (`EmployeeService.createEmployee` privado) y la sincronización con biométricos (`EmployeeService.syncCreate`) **siguen** pudiendo crear empleados sin departamento ni puesto. Las reglas 1 y 3 no les aplican. Esta historia no los toca.
- **Mismo mensaje para no existe / eliminado / de otra empresa.** Texto fijo, el de USRH1788466831270: **"El departamento no existe en la empresa del empleado"** y **"El puesto no existe en la empresa del empleado"**. No se distingue. No se revela si el id existe en otra empresa.
- **Mensajes de faltante (texto fijo de esta HU).** Locale por defecto `es` (`config/i18n.ts:8`):
  - Faltan los dos → `message`: **"Faltan el departamento y el puesto"**
  - Falta el departamento → `message`: **"Falta el departamento"**
  - Falta el puesto → `message`: **"Falta el puesto"**
- **La edición no cambia.** `PUT /api/employees/:id` ya permite vacíos (USRH1788466831270). No se toca.
- **Pilotos y sobrecargos no se modifican.** Su formulario sigue enviando departamento y puesto vacíos; reciben el mensaje claro del `POST /api/employees`. Efecto conocido y aceptado.
- **Se conservan las demás revisiones del alta.** Tipo de empleado, persona, empresa y empresa de nómina siguen en `verifyInfoExist`. Solo se retira la parte de departamento y puesto (el relleno + `verifyStructureExist`).
- **Intentos rechazados por id que no resuelve.** Un departamento o puesto que no existe, está eliminado o es de otra empresa se anota con `ScopeDeniedLogService.log` (mismo patrón que la edición: `domain`, `action: 'assign-to-employee'`, `requestedId`, sin datos del empleado). Best-effort.
- **Nada que mande la pantalla decide la empresa.** La empresa contra la que se verifica es `businessUnitId` del empleado (el body, o el que inyecta `businessScope` desde el header si falta).
- **Sin migraciones ni catálogo.** No cambia el esquema. Los registros de relleno se retiran en USRH1789328927648; esta historia solo deja de usarlos en el alta.
- **TypeScript estricto, cero `any` nuevo.** `npm run typecheck` y `npm run lint` limpios antes de cada commit.
- **Nada se borra.** Si algo se retirara, va a `__TO_DELETE__/`. Aquí no se retira ningún archivo: `verifyStructureExist` se elimina como método (código muerto dentro de un archivo que sigue en uso).
- **No commitear `pnpm-lock.yaml` ni `pnpm-workspace.yaml`.** Están modificados/sin seguimiento por causas ajenas. Cada commit lista sus archivos explícitamente; nunca `git add -A`.
- **Ubicar por nombre de función, no por número de línea.** Los números son del estado actual y sirven para orientarse.

---

## Estado actual verificado

Todo lo de abajo se leyó contra el código el 2026-09-17, en `feature/USRH1789328927556-alta-exige-estructura` (ya contiene USRH1788466831270).

### El camino del alta y dónde inventa estructura

`POST /api/employees` → `EmployeeController.store` (`app/controllers/employee_controller.ts`). En orden:

| Paso | Dónde | Qué hace hoy con la estructura |
|---|---|---|
| Arma el literal `employee` | `:1098-1136` | `departmentId` y `positionId` via `request.input(..., null)`. |
| **Relleno** | `:1137-1154` | Si falta o es `'0'`, busca `Department` con nombre `'Sin departamento'` y `Position` con nombre `'Sin posición'` (empresa fundadora; el mixin de tenant puede ocultarlos si el usuario no tiene esa empresa). |
| `createEmployeeValidator` | `:1156` | `departmentId` y `positionId` son `vine.number().optional()`: ausentes pasan; `null` y `''` lanzan `E_VALIDATION_ERROR`. |
| `verifyStructureExist` | `:1159` | Exige ambos; busca que existan y no estén eliminados. **No mira la empresa.** Mensaje en inglés: `"The department was not found with the entered ID"`. |
| `verifyInfoExist` | `:1160` | Tipo, persona, empresa, empresa de nómina. Ya no mira estructura (USRH1788466831270). |
| `releasePersonIfOrphan` | `:1166-1168`, `:1181-1183`, catch `:1242-1246` | Si el alta se rechaza, libera la persona huérfana del acto (USRH1785436961832). |
| `assertAssignable` (nivel) | `:1199` | Corre contra el `positionId` **efectivo post-relleno**. |
| `employeeService.create` | `:1227` | Copia `departmentId` y `positionId` a ciegas. |
| `catch` | `:1279-1289` | **`E_VALIDATION_ERROR` → 500 "Server error"** (la edición ya lo traduce a 400; el alta no). |

**Por qué Pilotos y Sobrecargos fallan mal:** su formulario no exige departamento ni puesto y envía vacío o cero. Si quien captura tiene alcance a la empresa fundadora, el relleno cuelga al empleado de "Sin Departamento". Si no, `verifyStructureExist` responde "The department was not found". Si Vine ve `''`, cae al catch como 500 y el BO abre `error.vue`.

**Por qué se acepta estructura de otra empresa:** `verifyStructureExist` no filtra por `business_unit_id`. Quien tiene acceso a dos empresas puede mandar un id de la otra y pasa.

**Por qué el importador y los biométricos no se rompen:** no llaman a `store`. El Excel entra por `EmployeeService` (método privado `createEmployee`, `:4123`) y el relleno que todavía usa se retira en USRH1789328927648. `syncCreate` (`:208`) escribe `departmentId` / `positionId` tal cual vienen, sin pasar por el validador ni por `verifyStructureExist`.

### Quién más usa `verifyStructureExist`

Solo `EmployeeController.store` y `tests/functional/employee_verify_info_exist.spec.ts`. Ningún servicio, job ni importador. Se puede retirar del alta sin tocar a nadie más.

### Lo que ya existe y se reutiliza

| Pieza | Dónde | Para qué la usa este plan |
|---|---|---|
| `EmployeeStructureService.verifyAssignable` | `app/services/employee_structure_service.ts:91` | Regla 3. Ya confirma existe + vigente + `business_unit_id` de la empresa del empleado, dentro de `TenantContext.runUnscoped`. Inexistente, eliminado y ajeno son indistinguibles. |
| `ScopeDeniedLogService.log` | `app/services/scope_denied_log_service.ts` | Mismo registro de accesos bloqueados que la edición. |
| `releasePersonIfOrphan` | `employee_service.ts:2651` | Regla 5. Ya lo llama `store` en cada rechazo. |
| i18n de "no existe en la empresa" | `resources/langs/es.json:169-172` | Se reusa tal cual. Esta HU solo agrega las claves de **faltante**. |
| Convención 400 de `E_VALIDATION_ERROR` | `employee_controller.ts` `update` catch | Se copia al catch de `store`. |
| `i18n.t(key)` en el controller | `employee_controller.ts` | Título y mensaje. Locale por defecto `es`. |

### Efectos conocidos que la HU acepta y este plan no corrige

- El formulario de Pilotos y Sobrecargos no se cambia. Si envía el alta sin departamento o sin puesto, el usuario ve el mensaje claro. Fuera de alcance.
- Traducir al español los demás mensajes de `verifyInfoExist` (tipo, persona, empresa) queda como mejora aparte. El supuesto de la HU lo declara.
- El importador puede seguir colgando filas sin departamento del relleno hasta USRH1789328927648. Esta historia no lo toca.
- Si alguien da de alta un empleado con `businessUnitId` distinto del departamento que envía, el rechazo es el de departamento no encontrado (supuesto de la HU; las pantallas envían la empresa seleccionada).

---

## Diseño: por qué una función pura de faltante + reutilizar `verifyAssignable`

Se consideró dejar `verifyStructureExist` y solo cambiarle los textos. Se descarta: no mira la empresa del empleado (regla 3) y mezcla "faltante" con "no existe" en el mismo mensaje en inglés.

Se consideró exigir `departmentId` y `positionId` en Vine (`min(1)`). Se descarta: Vine no puede decir "faltan los dos" en un solo mensaje, y `0` / `''` (lo que mandan Pilotos) caerían como error de tipo o de mínimo, no como "Falta el departamento". La obligatoriedad se resuelve **antes** de Vine, sobre el valor crudo, para que el caso de Pilotos reciba el mensaje de negocio.

Se consideró un catálogo de códigos + excepción. Se descarta (YAGNI/KISS): la HU pide un rechazo con un mensaje; el patrón `{ status, type, title, message, detail, key }` que ya usa este `store` lo cubre. Los ids que no resuelven reutilizan las claves i18n de la edición.

**Orden en `store` tras el cambio:**

1. Leer el body (igual).
2. **No rellenar.**
3. `requireEmployeeStructureForCreate` sobre los valores crudos. Si falta algo → 400 + liberar persona. Vine no corre.
4. `createEmployeeValidator` (el resto de datos).
5. `verifyAssignable` contra `businessUnitId` del empleado, con los dos ids a verificar.
6. `verifyInfoExist` (tipo, persona, empresa, nómina) — sin cambios.
7. Nivel de puesto, `create`, igual.
8. `catch`: `E_VALIDATION_ERROR` → 400.

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `app/services/employee_structure_service.ts` | Añade la función pura que decide si el alta trae departamento y puesto, o cuál falta. `verifyAssignable` no se toca. | **Modificar** |
| `tests/unit/services/employee_structure_create_required.spec.ts` | La función pura: vacío, `0`, uno, los dos. Sin BD. | **Crear** |
| `app/validators/employee.ts` | `createEmployeeValidator`: `departmentId` y `positionId` pasan a `nullable().optional()` para que `null` no reviente Vine si alguien reordena. La obligatoriedad no vive aquí. | **Modificar** |
| `resources/langs/es.json`, `resources/langs/en.json` | Título y mensaje de los tres faltantes. Las claves de "no existe en la empresa" ya están. | **Modificar** |
| `app/controllers/employee_controller.ts` | `store`: retira el relleno; exige estructura; verifica con `verifyAssignable`; `E_VALIDATION_ERROR` → 400. | **Modificar** (`store` only) |
| `app/services/employee_service.ts` | Retira `verifyStructureExist` (ya no tiene consumidores). | **Modificar** |
| `tests/functional/employee_verify_info_exist.spec.ts` | Quita los dos tests de `verifyStructureExist`. `verifyInfoExist` sin estructura sigue pasando. | **Modificar** |
| `tests/functional/employee_alta_exige_estructura.spec.ts` | Punta a punta por HTTP con `root`: los "cómo sabremos" y los "lo que no debe pasar". | **Crear** |
| `docs/superpowers/plans/2026-09-17-alta-exige-estructura-qa-api.md` | Manual de QA de API, hermano de este plan. Lo construye la Task 3. | **Crear** |
| `database/seeders/_tmp_do_not_commit_qa_seeder.ts` | Siembra las variantes de QA. Ya existe y está en `.git/info/exclude`: se le agregan casos. | **Modificar** (no se commitea) |

La función nueva va en `employee_structure_service.ts` (el archivo de la HU hermana) porque es la única representación de "qué estructura es válida para un empleado". No va en `employee_service.ts` (8 400 líneas) ni en el controller.

---

## Task 1: Función pura — qué falta en el alta

**Files:**
- Modify: `app/services/employee_structure_service.ts` — al final del archivo, después de la clase, o justo antes de `resolveEmployeeStructureUpdate`
- Test: `tests/unit/services/employee_structure_create_required.spec.ts`

**Interfaces:**
- Consumes: nada del plan. No consulta BD.
- Produces (los consume la Task 2 con estos nombres exactos):
  - `isMissingStructureId(value: unknown): boolean`
  - `requireEmployeeStructureForCreate(input: { departmentId: unknown; positionId: unknown }): { ok: true } | { ok: false; missing: EmployeeStructureMissing }`
  - `export type EmployeeStructureMissing = 'department' | 'position' | 'both'`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/services/employee_structure_create_required.spec.ts`:

```ts
import { test } from '@japa/runner'
import {
  isMissingStructureId,
  requireEmployeeStructureForCreate,
} from '#services/employee_structure_service'

/**
 * USRH1789328927556 — al dar de alta, departamento y puesto son obligatorios
 * (regla 1). Vacío o en cero cuenta como faltante (regla 2). Sin BD.
 */
test.group('Estructura del empleado — obligatoriedad al alta (USRH1789328927556)', () => {
  test('regla 2: null, undefined, cadena vacía, 0 y "0" cuentan como faltante', ({ assert }) => {
    assert.isTrue(isMissingStructureId(null))
    assert.isTrue(isMissingStructureId(undefined))
    assert.isTrue(isMissingStructureId(''))
    assert.isTrue(isMissingStructureId('   '))
    assert.isTrue(isMissingStructureId(0))
    assert.isTrue(isMissingStructureId('0'))
  })

  test('un id positivo no es faltante', ({ assert }) => {
    assert.isFalse(isMissingStructureId(1))
    assert.isFalse(isMissingStructureId('12'))
  })

  test('regla 1: faltan los dos → missing both', ({ assert }) => {
    assert.deepEqual(requireEmployeeStructureForCreate({ departmentId: null, positionId: 0 }), {
      ok: false,
      missing: 'both',
    })
    assert.deepEqual(requireEmployeeStructureForCreate({}), {
      ok: false,
      missing: 'both',
    })
  })

  test('regla 1: falta solo el departamento', ({ assert }) => {
    assert.deepEqual(
      requireEmployeeStructureForCreate({ departmentId: '', positionId: 7 }),
      { ok: false, missing: 'department' }
    )
  })

  test('regla 1: falta solo el puesto', ({ assert }) => {
    assert.deepEqual(
      requireEmployeeStructureForCreate({ departmentId: 3, positionId: '0' }),
      { ok: false, missing: 'position' }
    )
  })

  test('los dos presentes pasan', ({ assert }) => {
    assert.deepEqual(
      requireEmployeeStructureForCreate({ departmentId: 3, positionId: '4' }),
      { ok: true }
    )
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node ace test unit --files="employee_structure_create_required"
```

Esperado: FAIL — `isMissingStructureId` / `requireEmployeeStructureForCreate` no exportados.

- [ ] **Step 3: Implementación mínima**

En `app/services/employee_structure_service.ts`, **después** de `export type EmployeeStructureField` (hoy alrededor de la línea 34) agregar:

```ts
export type EmployeeStructureMissing = 'department' | 'position' | 'both'

/**
 * Vacío o en cero cuenta como faltante al alta (USRH1789328927556, regla 2).
 * No trata un string no numérico ("abc") como faltante: eso lo rechaza Vine
 * como dato mal formado (regla 4), no como "Falta el departamento".
 */
export function isMissingStructureId(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true
  }
  return value === 0 || value === '0'
}

/**
 * Decide si el alta trae departamento y puesto, o cuál falta (regla 1).
 * Función pura: no consulta nada y no inventa valores (regla 2).
 */
export function requireEmployeeStructureForCreate(input: {
  departmentId?: unknown
  positionId?: unknown
}): { ok: true } | { ok: false; missing: EmployeeStructureMissing } {
  const departmentMissing = isMissingStructureId(input.departmentId)
  const positionMissing = isMissingStructureId(input.positionId)
  if (departmentMissing && positionMissing) {
    return { ok: false, missing: 'both' }
  }
  if (departmentMissing) {
    return { ok: false, missing: 'department' }
  }
  if (positionMissing) {
    return { ok: false, missing: 'position' }
  }
  return { ok: true }
}
```

No tocar `resolveEmployeeStructureUpdate` ni `verifyAssignable`.

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
node ace test unit --files="employee_structure_create_required" --files="employee_structure_resolution"
```

Esperado: PASA. El segundo archivo confirma que no se rompió la resolución de la edición.

- [ ] **Step 5: Verificar tipos y estilo**

```bash
npm run typecheck && npm run lint
```

Esperado: ambos sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/services/employee_structure_service.ts tests/unit/services/employee_structure_create_required.spec.ts
git commit -m "$(cat <<'EOF'
feat(USRH1789328927556): decidir que falta en la estructura del alta

El alta exige departamento y puesto; vacio o cero cuenta como faltante.
La funcion es pura y no inventa valores de relleno.

EOF
)"
```

---

## Task 2: El alta exige estructura, no rellena y responde con un mensaje

**Files:**
- Modify: `app/validators/employee.ts` — `createEmployeeValidator`, líneas `departmentId: vine.number().optional(),` y `positionId: vine.number().optional(),`
- Modify: `resources/langs/es.json` — junto a `employee_department_not_in_business_unit_message` (hoy `:170`)
- Modify: `resources/langs/en.json` — mismo bloque (hoy `:169`)
- Modify: `app/controllers/employee_controller.ts` — `store` (relleno `:1137-1154`, `verifyStructureExist` `:1159-1161`, catch `:1279-1289`)
- Modify: `app/services/employee_service.ts` — eliminar `verifyStructureExist` (hoy `:1226-1281`)
- Modify: `tests/functional/employee_verify_info_exist.spec.ts` — quitar los dos tests de `verifyStructureExist`
- Test: `tests/functional/employee_alta_exige_estructura.spec.ts`

**Interfaces:**
- Consumes: `requireEmployeeStructureForCreate`, `EmployeeStructureMissing` (Task 1); `EmployeeStructureService.verifyAssignable`, `ScopeDeniedLogService.log`, `releasePersonIfOrphan` (ya existen).
- Produces: `POST /api/employees` rechaza sin crear cuando falta estructura o no es de la empresa del empleado; `E_VALIDATION_ERROR` sale 400; `verifyStructureExist` deja de existir.

- [ ] **Step 1: Escribir el test HTTP que falla**

Crear `tests/functional/employee_alta_exige_estructura.spec.ts`:

```ts
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Department from '#models/department'
import Position from '#models/position'
import Employee from '#models/employee'

/**
 * USRH1789328927556 — el alta exige departamento y puesto de la empresa del
 * empleado, no rellena, y cada rechazo es un mensaje (nunca 500). Punta a
 * punta por HTTP con `root`: tiene acceso a las dos empresas, así que si un
 * departamento ajeno se rechaza es porque cuenta la empresa del empleado.
 * Corre sobre la base de desarrollo y borra todo en teardown.
 */

const TEST_PASSWORD = 'AltaExigeEstructura123!'
const NONEXISTENT_ID = 2_000_000_000

function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function createUnit(label: string): Promise<BusinessUnit> {
  const s = stamp()
  return BusinessUnit.create({
    businessUnitName: `Alta ${label} ${s}`,
    businessUnitSlug: `alta-${label}-${s}`,
    businessUnitLegalName: `Alta ${label} legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function createDepartment(unit: BusinessUnit, label: string): Promise<Department> {
  const s = stamp()
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `ALT-${s}`.slice(0, 50),
    departmentName: `Alta ${label} ${s}`,
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

async function createPosition(unit: BusinessUnit, label: string): Promise<Position> {
  const s = stamp()
  return Position.create({
    positionSyncId: Date.now() + Math.floor(Math.random() * 1000),
    positionCode: `ALT-${s}`.slice(0, 50),
    positionName: `Alta ${label} ${s}`.slice(0, 100),
    positionActive: 1,
    businessUnitId: unit.businessUnitId,
    companyId: unit.businessUnitId,
  })
}

interface Actor {
  user: User
  person: Person
}

async function createRootActor(unit: BusinessUnit): Promise<Actor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
  const s = stamp()
  const email = `alta-root-${s}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'Root',
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
  return { user, person }
}

async function createPerson(email: string): Promise<Person> {
  return Person.create({
    personFirstname: 'Alta',
    personLastname: 'Estructura',
    personSecondLastname: stamp(),
    personEmail: email,
  })
}

async function cleanupActor(actor: Actor | null): Promise<void> {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function cleanupUnits(units: BusinessUnit[]): Promise<void> {
  for (const unit of units) {
    await Position.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await Department.query().withTrashed().where('business_unit_id', unit.businessUnitId).delete()
    await BusinessUnit.query().where('business_unit_id', unit.businessUnitId).delete()
  }
}

async function cleanupPerson(person: Person | null): Promise<void> {
  if (!person) return
  const employee = await Employee.query()
    .withTrashed()
    .where('person_id', person.personId)
    .first()
  if (employee) {
    await db.from('employee_offboardings').where('employee_id', employee.employeeId).delete()
    await db.from('employee_salary_history').where('employee_id', employee.employeeId).delete()
    await Employee.query().withTrashed().where('employee_id', employee.employeeId).delete()
  }
  await Person.query().withTrashed().where('person_id', person.personId).delete()
}

test.group('Alta exige estructura — POST /api/employees (USRH1789328927556)', (group) => {
  let unit: BusinessUnit
  let foreignUnit: BusinessUnit
  let root: Actor | null = null
  let activeDepartment: Department
  let activePosition: Position
  let deletedDepartment: Department
  let foreignDepartment: Department
  let foreignPosition: Position

  group.setup(async () => {
    unit = await createUnit('empresa')
    foreignUnit = await createUnit('ajena')
    activeDepartment = await createDepartment(unit, 'Activo')
    activePosition = await createPosition(unit, 'Activo')
    deletedDepartment = await createDepartment(unit, 'Eliminado')
    foreignDepartment = await createDepartment(foreignUnit, 'Ajeno')
    foreignPosition = await createPosition(foreignUnit, 'Ajeno')
    await deletedDepartment.delete()
    root = await createRootActor(unit)
    await root.user.related('businessUnits').attach([foreignUnit.businessUnitId])
  })

  group.teardown(async () => {
    await cleanupActor(root)
    await cleanupUnits([unit, foreignUnit])
  })

  function storeBody(person: Person, overrides: Record<string, unknown> = {}) {
    return {
      employeeFirstName: 'Alta',
      employeeLastName: 'Estructura',
      employeeSecondLastName: 'QA',
      companyId: unit.businessUnitId,
      personId: person.personId,
      employeeTypeId: 1,
      businessUnitId: unit.businessUnitId,
      payrollBusinessUnitId: unit.businessUnitId,
      employeeWorkSchedule: 'Onsite',
      employeeWorkScheduleHybridConfig: null,
      employeeBusinessEmail: person.personEmail,
      ...overrides,
    }
  }

  function post(client: ApiClient, person: Person, overrides: Record<string, unknown> = {}) {
    return client
      .post('/api/employees')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', unit.businessUnitPublicId)
      .json(storeBody(person, overrides))
  }

  test('sin departamento ni puesto no crea y dice que faltan los dos (reglas 1 y 2)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-ambos-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, { departmentId: 0, positionId: '' })

      response.assertStatus(400)
      assert.equal(response.body().type, 'warning')
      assert.equal(response.body().message, 'Faltan el departamento y el puesto')
      assert.notEqual(response.body().title, 'Server error')
      const created = await Employee.query().where('person_id', person.personId).first()
      assert.isNull(created)
      const released = await Person.query().withTrashed().where('person_id', person.personId).first()
      assert.isNotNull(released?.deletedAt)
    } finally {
      await cleanupPerson(person)
    }
  })

  test('con departamento y sin puesto dice que falta el puesto (regla 1)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-puesto-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: activeDepartment.departmentId,
        positionId: null,
      })

      response.assertStatus(400)
      assert.equal(response.body().message, 'Falta el puesto')
      const created = await Employee.query().where('person_id', person.personId).first()
      assert.isNull(created)
    } finally {
      await cleanupPerson(person)
    }
  })

  test('con puesto y sin departamento dice que falta el departamento (regla 1)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-depto-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: 0,
        positionId: activePosition.positionId,
      })

      response.assertStatus(400)
      assert.equal(response.body().message, 'Falta el departamento')
    } finally {
      await cleanupPerson(person)
    }
  })

  test('con departamento y puesto de su empresa se crea (camino feliz)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-ok-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: activeDepartment.departmentId,
        positionId: activePosition.positionId,
      })

      response.assertStatus(201)
      assert.equal(response.body().type, 'success')
      assert.equal(response.body().data.employee.departmentId, activeDepartment.departmentId)
      assert.equal(response.body().data.employee.positionId, activePosition.positionId)
      const row = await db
        .from('employees')
        .where('person_id', person.personId)
        .whereNull('employee_deleted_at')
        .first()
      assert.equal(row.department_id, activeDepartment.departmentId)
      assert.equal(row.position_id, activePosition.positionId)
    } finally {
      await cleanupPerson(person)
    }
  })

  test('un rechazo no deja la persona a medias: el reintento con el mismo correo procede (regla 5)', async ({
    client,
    assert,
  }) => {
    const email = `alta-reintento-${stamp()}@gsti-tests.local`
    const first = await createPerson(email)
    const rejected = await post(client, first, { departmentId: 0, positionId: 0 })
    rejected.assertStatus(400)

    const second = await createPerson(email)
    try {
      const response = await post(client, second, {
        departmentId: activeDepartment.departmentId,
        positionId: activePosition.positionId,
      })

      response.assertStatus(201)
      assert.equal(response.body().data.employee.departmentId, activeDepartment.departmentId)
    } finally {
      await cleanupPerson(first)
      await cleanupPerson(second)
    }
  })

  test('rechaza un departamento de otra empresa con el mismo mensaje que uno inexistente (regla 3)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-ajeno-${stamp()}@gsti-tests.local`)
    try {
      const foreign = await post(client, person, {
        departmentId: foreignDepartment.departmentId,
        positionId: activePosition.positionId,
      })
      const missing = await post(client, person, {
        departmentId: NONEXISTENT_ID,
        positionId: activePosition.positionId,
      })

      foreign.assertStatus(400)
      missing.assertStatus(400)
      assert.equal(foreign.body().message, 'El departamento no existe en la empresa del empleado')
      assert.equal(missing.body().message, foreign.body().message)
      const created = await Employee.query().where('person_id', person.personId).first()
      assert.isNull(created)
    } finally {
      await cleanupPerson(person)
    }
  })

  test('rechaza un puesto de otra empresa con el mensaje de puesto (regla 3)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-puesto-ajeno-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: activeDepartment.departmentId,
        positionId: foreignPosition.positionId,
      })

      response.assertStatus(400)
      assert.equal(response.body().message, 'El puesto no existe en la empresa del empleado')
    } finally {
      await cleanupPerson(person)
    }
  })

  test('un departamento eliminado usa el mismo mensaje que uno inexistente (regla 3)', async ({
    client,
    assert,
  }) => {
    const person = await createPerson(`alta-eliminado-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: deletedDepartment.departmentId,
        positionId: activePosition.positionId,
      })

      response.assertStatus(400)
      assert.equal(response.body().message, 'El departamento no existe en la empresa del empleado')
    } finally {
      await cleanupPerson(person)
    }
  })

  test('un dato mal formado sale 400, no 500 (regla 4)', async ({ client, assert }) => {
    const person = await createPerson(`alta-vine-${stamp()}@gsti-tests.local`)
    try {
      const response = await post(client, person, {
        departmentId: activeDepartment.departmentId,
        positionId: activePosition.positionId,
        employeeTypeId: 'no-es-numero',
      })

      response.assertStatus(400)
      assert.equal(response.body().title, 'Error de validación')
      assert.notEqual(response.body().title, 'Server error')
      const created = await Employee.query().where('person_id', person.personId).first()
      assert.isNull(created)
    } finally {
      await cleanupPerson(person)
    }
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node ace test functional --files="employee_alta_exige_estructura"
```

Esperado: FAIL. El caso "faltan los dos" no ve `"Faltan el departamento y el puesto"`: hoy o se crea colgado del relleno (si "Sin departamento" es visible) o responde `"The department was not found with the entered ID"`. El caso Vine sale 500 con `"Server error"`.

- [ ] **Step 3: i18n — claves de faltante**

En `resources/langs/es.json`, **justo después** de `employee_position_not_in_business_unit_message`:

```json
  "employee_structure_required_both_title": "Departamento y puesto obligatorios",
  "employee_structure_required_both_message": "Faltan el departamento y el puesto",
  "employee_department_required_title": "Departamento obligatorio",
  "employee_department_required_message": "Falta el departamento",
  "employee_position_required_title": "Puesto obligatorio",
  "employee_position_required_message": "Falta el puesto",
```

En `resources/langs/en.json`, el mismo sitio:

```json
  "employee_structure_required_both_title": "Department and position required",
  "employee_structure_required_both_message": "Department and position are required",
  "employee_department_required_title": "Department required",
  "employee_department_required_message": "Department is required",
  "employee_position_required_title": "Position required",
  "employee_position_required_message": "Position is required",
```

No tocar `employee_department_not_in_business_unit_*` ni `employee_position_not_in_business_unit_*`.

- [ ] **Step 4: Validador de alta acepta `null` (la obligatoriedad no vive aquí)**

En `app/validators/employee.ts`, sustituir

```ts
    departmentId: vine.number().optional(),
```

por

```ts
    // USRH1789328927556: la obligatoriedad se resuelve en store con
    // requireEmployeeStructureForCreate (regla 1), para poder decir cuál
    // falta o que faltan los dos. Vine solo acepta el valor; 0 y vacío
    // los trata el controller como faltantes (regla 2) ANTES de validar.
    departmentId: vine.number().nullable().optional(),
```

y

```ts
    positionId: vine.number().optional(),
```

por

```ts
    positionId: vine.number().nullable().optional(),
```

Actualizar el comentario de `updateEmployeeValidator` que hoy dice "Solo el alta (`createEmployeeValidator` + relleno en `store`) los sigue exigiendo" — el relleno ya no existe:

```ts
    // USRH1788466831270, regla 1: al editar no son obligatorios. Ausente =
    // conservar lo guardado; `null` = dejar sin asignar (regla 9). El alta
    // los exige en store (USRH1789328927556), no en este validador.
```

- [ ] **Step 5: `store` — retirar relleno, exigir, verificar, 400 en Vine**

En `app/controllers/employee_controller.ts`:

1. Ampliar el import de `#services/employee_structure_service`:

```ts
import EmployeeStructureService, {
  requireEmployeeStructureForCreate,
  resolveEmployeeStructureUpdate,
} from '#services/employee_structure_service'
```

`ScopeDeniedLogService` ya está importado.

2. **Borrar** el bloque de relleno (`if (!employee.departmentId || employee.departmentId.toString() === '0')` y el de puesto). No queda ningún `Department.query().where('department_name', 'Sin departamento')` ni `Position.query().where('position_name', 'Sin posición')` en `store`.

3. **Antes** de `request.validateUsing(createEmployeeValidator)`, insertar (el `EmployeeService` hay que instanciarlo aquí, no después):

```ts
      const employeeService = new EmployeeService(i18n)
      const requiredStructure = requireEmployeeStructureForCreate({
        departmentId: departmentId,
        positionId: positionId,
      })
      if (!requiredStructure.ok) {
        if (personId) {
          await employeeService.releasePersonIfOrphan(personId)
        }
        const messageKey =
          requiredStructure.missing === 'both'
            ? 'employee_structure_required_both'
            : `employee_${requiredStructure.missing}_required`
        response.status(400)
        return {
          type: 'warning',
          title: i18n.t(`${messageKey}_title`),
          message: i18n.t(`${messageKey}_message`),
          detail: i18n.t(`${messageKey}_message`),
          key: 'alta-empleado-invalida',
        }
      }
      const data = await request.validateUsing(createEmployeeValidator)
      employee.departmentId = data.departmentId ?? employee.departmentId
      employee.positionId = data.positionId ?? employee.positionId
      const structureCheck = await new EmployeeStructureService().verifyAssignable({
        departmentId: Number(employee.departmentId),
        positionId: Number(employee.positionId),
        businessUnitId: Number(employee.businessUnitId),
        departmentIdToVerify: Number(employee.departmentId),
        positionIdToVerify: Number(employee.positionId),
      })
      if (!structureCheck.ok) {
        await ScopeDeniedLogService.log({
          domain: structureCheck.field,
          action: 'assign-to-employee',
          requestedId: structureCheck.requestedId,
          actorUserId: auth.user?.userId ?? null,
          businessUnitScope,
        })
        if (personId) {
          await employeeService.releasePersonIfOrphan(personId)
        }
        response.status(400)
        return {
          type: 'warning',
          title: i18n.t(`employee_${structureCheck.field}_not_in_business_unit_title`),
          message: i18n.t(`employee_${structureCheck.field}_not_in_business_unit_message`),
          detail: i18n.t(`employee_${structureCheck.field}_not_in_business_unit_message`),
          key: 'alta-empleado-invalida',
        }
      }
      const exist = await employeeService.verifyInfoExist(employee)
```

4. **Borrar** las dos líneas que hoy encadenan `verifyStructureExist` + `verifyInfoExist`:

```ts
      const structureExist = await employeeService.verifyStructureExist(employee)
      const exist =
        structureExist.status === 200 ? await employeeService.verifyInfoExist(employee) : structureExist
```

`exist` queda asignado solo por `verifyInfoExist`. El `if (exist.status !== 200)` que sigue (libera persona y responde) no se toca.

5. Actualizar el comentario del nivel de puesto: ya no dice "post-fallback Sin posición". Queda:

```ts
      // Pertenencia del nivel de puesto (USRH1785964117188): corre contra el
      // positionId del alta (ya exigido y verificado) y antes de persistir.
```

6. En el `catch` de `store`, **antes** del `const messageError = ... status(500)`, insertar el mismo bloque que ya tiene `update`:

```ts
      if (error?.code === 'E_VALIDATION_ERROR') {
        // Regla 4 (USRH1789328927556): un dato mal formado es un rechazo por
        // datos, no un error del servidor. Con 500 el BO abre la pantalla de
        // error general y el usuario pierde lo capturado.
        response.status(400)
        return {
          type: 'warning',
          title: i18n.t('validation_error'),
          message: error.messages?.[0]?.message ?? i18n.t('validation_error'),
          errors: error.messages,
          key: 'alta-empleado-invalida',
        }
      }
```

El `if (error.code === 'E_VALIDATION_ERROR')` que queda dentro del armado del 500 se puede dejar: ya no se alcanza para ese código.

No tocar `update`. No tocar import-excel. No tocar `syncCreate`.

- [ ] **Step 6: Retirar `verifyStructureExist`**

En `app/services/employee_service.ts`, borrar el método `verifyStructureExist` completo (el bloque que empieza en el comentario "Departamento y puesto obligatorios y vigentes" y termina en el `return { status: 200, ... }`).

Actualizar el comentario de `verifyInfoExist` que remite a `verifyStructureExist`:

```ts
   * Comprobaciones compartidas por alta y edición: tipo de empleado, persona
   * (solo alta), empresa y empresa de nómina. La estructura del ALTA se
   * revisa en store con requireEmployeeStructureForCreate +
   * EmployeeStructureService.verifyAssignable (USRH1789328927556). La de la
   * edición, en EmployeeStructureService y solo cuando cambia
   * (USRH1788466831270).
```

En `tests/functional/employee_verify_info_exist.spec.ts`:

- Actualizar el comentario del archivo: ya no menciona `verifyStructureExist`.
- Borrar los dos tests `'verifyStructureExist (alta) sigue exigiendo…'`.
- Dejar los dos de `verifyInfoExist` (pasa sin estructura; sigue rechazando tipo inexistente).
- Si `department` queda sin uso, quitar su creación en `setup` y el import de `Department`.

- [ ] **Step 7: Correr los tests**

```bash
node ace test functional --files="employee_alta_exige_estructura" --files="employee_verify_info_exist" --files="employee_edicion_sin_estructura" --files="employee_structure_service"
node ace test unit --files="employee_structure_create_required" --files="employee_structure_resolution" --files="employee_update_validator"
```

Esperado: PASA. La edición no se rompe. `verifyInfoExist` sigue pasando sin estructura.

- [ ] **Step 8: Verificar tipos y estilo**

```bash
npm run typecheck && npm run lint
```

Esperado: ambos sin errores. Cero referencias a `verifyStructureExist` (`rg verifyStructureExist` no debe devolver archivos vivos).

- [ ] **Step 9: Commit**

```bash
git add app/validators/employee.ts resources/langs/es.json resources/langs/en.json app/controllers/employee_controller.ts app/services/employee_service.ts tests/functional/employee_verify_info_exist.spec.ts tests/functional/employee_alta_exige_estructura.spec.ts
git commit -m "$(cat <<'EOF'
feat(USRH1789328927556): exigir departamento y puesto al alta

El alta ya no rellena con Sin Departamento ni acepta estructura de otra
empresa. Si falta un dato lo dice; si el id no es de la empresa del
empleado, el mensaje es el mismo que si no existiera. Un dato mal
formado sale 400, no la pantalla de error general.

EOF
)"
```

---

## Task 3: Manual de QA de API

**Files:**
- Create: `docs/superpowers/plans/2026-09-17-alta-exige-estructura-qa-api.md`
- Modify: `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no se commitea)

**Interfaces:**
- Consumes: el contrato HTTP de la Task 2 (status, `type`, `title`, `message` literales).
- Produces: playbook recorrible con Postman/Insomnia/Bruno y seeder idempotente.

Leer antes de escribir, en este orden: `.cursor/rules/manual-qa-api.mdc` (regla), `docs/superpowers/plans/2026-09-17-editar-empleado-sin-estructura-qa-api.md` (constantes de este API: URL `http://127.0.0.1:3333`, envelope `{ type, title, message, data }`, seeder `_tmp_do_not_commit_qa_seeder.ts`, dominio `gsti-tests.local`, contraseña `password`), y el seeder para no chocar con `QA-EDI-*`.

- [ ] **Step 1: Anotar el contrato observado**

Contra el servidor local, con el usuario que siembre el Step 2, disparar una vez cada variante y copiar status + body literales al manual. No inventar textos.

| Variante | Endpoint | `message` esperado |
|---|---|---|
| Faltan los dos (`departmentId: 0`, `positionId: ""`) | `POST /api/employees` | `Faltan el departamento y el puesto` · 400 · `type: warning` |
| Solo departamento | `POST /api/employees` | `Falta el puesto` · 400 |
| Departamento + puesto de su empresa | `POST /api/employees` | éxito · 201 · `data.employee.departmentId` / `positionId` con los ids |
| Departamento de la otra empresa | `POST /api/employees` | `El departamento no existe en la empresa del empleado` · 400 |
| Departamento inexistente (`2000000000`) | `POST /api/employees` | el mismo `message` que el ajeno · 400 |
| Departamento dado de baja | `POST /api/employees` | el mismo `message` que el ajeno · 400 |
| `employeeTypeId` no numérico | `POST /api/employees` | `title: Error de validación` · 400 (no 500) |
| Reintento tras rechazo | `POST /api/persons` con el mismo correo + `POST /api/employees` con estructura | persons 201 · employees 201 |
| Excel sin departamento | `POST /api/employees/import-excel` | el mismo éxito que hoy (no 400 de esta HU) |

La persona se crea en cada escenario con `POST /api/persons` (el asistente y Pilotos lo hacen igual). El body del alta lleva ese `personId`. Tras un 400, consultar que no exista empleado con ese `personId` y que `POST /api/persons` con el mismo correo vuelva a aceptar.

- [ ] **Step 2: Sembrar en el seeder QA (no se commitea)**

En `database/seeders/_tmp_do_not_commit_qa_seeder.ts`, junto a `seedEdicionSinEstructuraQa` (hoy se llama desde el `run` alrededor de `:1071`), agregar `seedAltaExigeEstructuraQa` e invocarla desde `run`. Idempotente por slug / código / correo. Prefijo `QA-ALT-*` para no chocar con `QA-EDI-*`.

**Usuarios (una variante cada uno):**

| | Correo | Variante |
|---|---|---|
| **A** | `qa-alta-principal@gsti-tests.local` | Usuario principal (`root`) con acceso a la empresa de prueba **y** a la ajena |

(Una sola variante: la HU no cambia quién puede dar de alta; lo que se prueba es la empresa del empleado, y el usuario con acceso a las dos es quien lo demuestra. Contraseña: `password`, la del seeder.)

**Datos de negocio imprescindibles:** dos empresas (`qa-alta-prueba`, `qa-alta-ajena`); en la de prueba un departamento activo (`QA-ALT-DEPT-ACTIVO`), un puesto activo (`QA-ALT-POS-ACTIVO`) y un departamento dado de baja (`QA-ALT-DEPT-BAJA`, sembrarlo y darlo de baja después); en la ajena un departamento (`QA-ALT-DEPT-AJENO`) y un puesto (`QA-ALT-POS-AJENO`). **No** sembrar empleados: el recorrido los crea. Reutilizar `createAlcanceUser` (ya existe en el seeder) para el usuario A, igual que `seedEdicionSinEstructuraQa`.

Patrón a copiar (cambiar prefijos `EDI` → `ALT`, slugs `qa-edicion-*` → `qa-alta-*`, correo `qa-edicion-principal@…` → `qa-alta-principal@…`):

```ts
async function seedAltaExigeEstructuraQa(): Promise<void> {
  const buPrueba = await BusinessUnit.firstOrCreate(
    { businessUnitSlug: 'qa-alta-prueba' },
    {
      businessUnitName: 'QA Alta Prueba',
      businessUnitLegalName: 'QA Alta Prueba SA de CV',
      businessUnitActive: 1,
    },
  )
  const buAjena = await BusinessUnit.firstOrCreate(
    { businessUnitSlug: 'qa-alta-ajena' },
    {
      businessUnitName: 'QA Alta Ajena',
      businessUnitLegalName: 'QA Alta Ajena SA de CV',
      businessUnitActive: 1,
    },
  )
  await Department.firstOrCreate(
    { departmentCode: 'QA-ALT-DEPT-ACTIVO' },
    {
      departmentSyncId: DateTime.now().toMillis(),
      departmentName: 'QA Alta Depto Activo',
      departmentAlias: '',
      departmentIsDefault: false,
      departmentActive: 1,
      companyId: 1,
      businessUnitId: buPrueba.businessUnitId,
    },
  )
  await Position.firstOrCreate(
    { positionCode: 'QA-ALT-POS-ACTIVO' },
    {
      positionName: 'QA Alta Puesto Activo',
      positionAlias: 'QA alta',
      positionIsDefault: false,
      positionActive: 1,
      companyId: 1,
      businessUnitId: buPrueba.businessUnitId,
      positionSyncId: DateTime.now().toMillis(),
    },
  )
  await Department.firstOrCreate(
    { departmentCode: 'QA-ALT-DEPT-AJENO' },
    {
      departmentSyncId: DateTime.now().toMillis(),
      departmentName: 'QA Alta Depto Ajeno',
      departmentAlias: '',
      departmentIsDefault: false,
      departmentActive: 1,
      companyId: 1,
      businessUnitId: buAjena.businessUnitId,
    },
  )
  await Position.firstOrCreate(
    { positionCode: 'QA-ALT-POS-AJENO' },
    {
      positionName: 'QA Alta Puesto Ajeno',
      positionAlias: 'QA alta',
      positionIsDefault: false,
      positionActive: 1,
      companyId: 1,
      businessUnitId: buAjena.businessUnitId,
      positionSyncId: DateTime.now().toMillis(),
    },
  )
  let deptoBaja = await Department.query()
    .where('department_code', 'QA-ALT-DEPT-BAJA')
    .withTrashed()
    .first()
  if (!deptoBaja) {
    deptoBaja = await Department.create({
      departmentSyncId: DateTime.now().toMillis(),
      departmentCode: 'QA-ALT-DEPT-BAJA',
      departmentName: 'QA Alta Depto Baja',
      departmentAlias: '',
      departmentIsDefault: false,
      departmentActive: 1,
      companyId: 1,
      businessUnitId: buPrueba.businessUnitId,
    })
    await deptoBaja.delete()
  }
  const rootRole = await Role.query().where('role_slug', 'root').whereNull('role_deleted_at').firstOrFail()
  const userA = await createAlcanceUser(
    'qa-alta-principal@gsti-tests.local',
    'AltaPrincipal',
    rootRole.roleId,
    buPrueba.businessUnitId,
  )
  const attachedAjena = await userA
    .related('businessUnits')
    .query()
    .where('business_units.business_unit_id', buAjena.businessUnitId)
    .first()
  if (!attachedAjena) {
    await userA.related('businessUnits').attach([buAjena.businessUnitId])
  }
  console.log('[qa-seeder] alta-exige-estructura: empresas, estructura y usuario listos')
}
```

**Consultas que entregan los ids** (van al manual, en Preparar; el manual nunca trae un número):

```sql
SELECT business_unit_public_id FROM business_units WHERE business_unit_slug = 'qa-alta-prueba';
SELECT business_unit_id FROM business_units WHERE business_unit_slug = 'qa-alta-prueba';
SELECT business_unit_id FROM business_units WHERE business_unit_slug = 'qa-alta-ajena';
SELECT department_id FROM departments WHERE department_code = 'QA-ALT-DEPT-ACTIVO';
SELECT position_id FROM positions WHERE position_code = 'QA-ALT-POS-ACTIVO';
SELECT department_id FROM departments WHERE department_code = 'QA-ALT-DEPT-BAJA';
SELECT department_id FROM departments WHERE department_code = 'QA-ALT-DEPT-AJENO';
SELECT position_id FROM positions WHERE position_code = 'QA-ALT-POS-AJENO';
```

Tras un escenario, el `personId` y el `employeeId` se resuelven así (sustituye el correo de esa corrida):

```sql
SELECT person_id FROM people WHERE person_email = 'qa-alta-s1@gsti-tests.local';
SELECT employee_id, department_id, position_id FROM employees
WHERE employee_business_email = 'qa-alta-s1@gsti-tests.local' AND employee_deleted_at IS NULL;
```

Correr el seeder y confirmar que termina sin error:

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

- [ ] **Step 3: "Alcance — solo la HU"**

Escenarios, uno por "cómo sabremos" y por "lo que no debe pasar", en este orden. Usuario **A** en todos. Cada alta crea primero a la persona (`POST /api/persons`) y luego al empleado (`POST /api/employees`). Correos `qa-alta-s1@…` … `qa-alta-s8@…` para no chocar entre corridas.

1. **A** da de alta sin departamento ni puesto (`departmentId: 0`, `positionId: ""`) — el envío de Pilotos/Sobrecargos → `400`, `message: "Faltan el departamento y el puesto"`; consultar: no hay empleado; `POST /api/persons` con el mismo correo → `201`.
2. **A** da de alta con solo el departamento activo de su empresa → `400`, `message: "Falta el puesto"`.
3. **A** da de alta con el departamento y el puesto activos de su empresa → `201`; en `data.employee`, esos dos ids; ningún texto "Sin Departamento".
4. **A** intenta dar de alta en la empresa de prueba con el departamento de la ajena (tiene acceso a las dos) → `400`, `message: "El departamento no existe en la empresa del empleado"`; no se crea empleado.
5. **A** intenta con `departmentId: 2000000000` y el puesto activo → `400`, **el mismo** `message` que el escenario 4.
6. **A** intenta con el departamento dado de baja y el puesto activo → `400`, el mismo `message` que el 4.
7. **A** envía `employeeTypeId: "no-es-numero"` con departamento y puesto válidos → `400`, `title: "Error de validación"` (no `500` / `"Server error"`).
8. **A** importa un Excel de empleados (`POST /api/employees/import-excel`) con una fila de la empresa de prueba **sin** departamento — `GET /api/employees/template-excel` para la plantilla, deja vacía la columna de departamento, llena identificador de nómina `QA-ALT-IMP-01`, unidad de trabajo, unidad de nómina, nombre y apellido. La importación responde el éxito de siempre (no el 400 de esta HU). Declarar en el escenario que el relleno que el importador todavía usa se retira en otra historia; aquí solo se verifica que no se rompió.

Declarar en una línea, sin inventarle pasos: **"un alta desde la app u otra integración sin departamento"** no se puede provocar con el ambiente sembrado (supuesto a validar con Wilvardo). No se le inventan pasos.

- [ ] **Step 4: "Formato — contrato, no código"**

El body del `POST /api/employees` va entero y pegable. `"..."` solo en nombre/apellido que no importan. `departmentId`, `positionId`, `personId`, `businessUnitId` y `payrollBusinessUnitId` **siempre** visibles. El `POST /api/persons` de cada escenario también va pegable (`personFirstname`, `personLastname`, `personEmail`). Responses `201`/`400` con `type`, `title`, `message` literales. Prohibido: archivos, clases, Vine, "revisa el código".

Body base del alta (sustituye los ids resueltos en Preparar):

```json
{
  "employeeFirstName": "Alta",
  "employeeLastName": "Uno",
  "employeeSecondLastName": "QA",
  "companyId": "<business_unit_id de qa-alta-prueba>",
  "departmentId": 0,
  "positionId": "",
  "personId": "<person_id del POST /api/persons de este escenario>",
  "employeeTypeId": 1,
  "businessUnitId": "<business_unit_id de qa-alta-prueba>",
  "payrollBusinessUnitId": "<business_unit_id de qa-alta-prueba>",
  "employeeWorkSchedule": "Onsite",
  "employeeWorkScheduleHybridConfig": null,
  "employeeBusinessEmail": "qa-alta-s1@gsti-tests.local"
}
```

- [ ] **Step 5: "Qué significa cada dato — en lenguaje de negocio, por escenario"**

Valores fijos, en el primer escenario donde aparecen:

- `type`: puede valer `success` (sí se dio de alta) o `warning` (no se dio de alta y el mensaje dice qué corregir).
- `departmentId`: el departamento del colaborador dentro de su empresa. En el escenario 1 no viaja (o va vacío); en el 3 es el departamento activo de su empresa.
- `positionId`: el puesto del colaborador dentro de su empresa.
- `message` de faltante: se explica en el 1 (los dos) y en el 2 (solo el puesto) con `Qué significa lo nuevo aquí:`.
- `message` de "no existe en la empresa": se explica en el 4; el 5 y el 6 remiten al 4 (mismo texto a propósito: no se distingue si no existe, ya no está o es de otra empresa).
- `title: Error de validación` en el 7: el dato no se entendió y hay que corregirlo; no es una falla del sistema.

Sin redundancia: el 3 remite al 1 para `type`/`data.employee` y solo explica los ids asignados.

- [ ] **Step 6: "Ejemplo cotidiano"**

Después de Problema / Solución, una línea `Ejemplo:` en contexto de escuela/equipo, sin "empleado", "departamento", "puesto" ni "empresa". Sugerencia: inscribir a un alumno nuevo exige salón y grado de SU escuela; si no los eliges, te dicen cuál falta; no te lo anotan en el salón "sin salón" de otra escuela, ni te echan de la ventanilla con un error que borra la ficha.

- [ ] **Step 7: Estructura mínima e interruptores**

Problema / Solución / `Ejemplo:` → Preparar (seeder + tabla A) → 8 escenarios → Checklist con 8 casillas. **Sin sección de Limpieza**: no se enciende ningún interruptor global.

Header de cada petición: `Authorization: Bearer <token de A>` y `X-Business-Unit-Id: <público de qa-alta-prueba>`. El usuario actúa siempre desde la empresa de prueba, incluso cuando el body trae un departamento de la ajena.

- [ ] **Step 8: Recorrer el manual de punta a punta contra el servidor local**

Levantar el API (`npm run dev`), correr el seeder, y ejecutar los 8 escenarios con un cliente de API. Cada response del manual tiene que coincidir con el observado; si no coincide, corregir el manual (o el código, si el manual tenía razón).

Quien recorre el manual es una persona, no el agente (regla `manual-qa-execution`). El agente deja el playbook listo; no automatiza el recorrido.

- [ ] **Step 9: Commit (solo el manual)**

```bash
git add docs/superpowers/plans/2026-09-17-alta-exige-estructura-qa-api.md
git commit -m "$(cat <<'EOF'
docs(USRH1789328927556): manual de QA de API del alta que exige estructura

EOF
)"
```

El seeder `_tmp_do_not_commit_qa_seeder.ts` no se agrega (está en `.git/info/exclude`). `git status` debe seguir mostrando solo `pnpm-lock.yaml` y `pnpm-workspace.yaml` como cambios ajenos al plan.

---

## Cierre: verificación antes de abrir el PR

- [ ] Suite de lo tocado:

```bash
node ace test unit --files="employee_structure_create_required" --files="employee_structure_resolution" --files="employee_update_validator"
node ace test functional --files="employee_alta_exige_estructura" --files="employee_verify_info_exist" --files="employee_edicion_sin_estructura" --files="employee_structure_service" --files="employees_write_permission_gate"
npm run typecheck && npm run lint
```

- [ ] `rg verifyStructureExist` no devuelve archivos vivos (solo este plan, si acaso).
- [ ] `rg "Sin departamento" app/controllers/employee_controller.ts` no aparece en `store`.
- [ ] `git log --oneline multitenant..HEAD` muestra los commits de esta HU con prefijo `USRH1789328927556` (feat, feat, docs) además de los de la edición si la rama los trae.
- [ ] `git status` no incluye `pnpm-lock.yaml`, `pnpm-workspace.yaml` ni el seeder temporal en ningún commit.
- [ ] Sin migraciones: no hace falta `migration:fresh`.

---

## Self-review (hecho al escribir el plan)

**Cobertura de la HU → Task:**

| Requisito | Task |
|---|---|
| Regla 1 (obligatorios; mensaje de cuál falta o de los dos) | 1 (función pura), 2 (store + tests HTTP) |
| Regla 2 (nunca rellenar; 0 y vacío = faltante) | 1 (`isMissingStructureId`), 2 (borrar el bloque de relleno) |
| Regla 3 (existe, vigente, de la empresa del empleado) | 2 (`verifyAssignable` + tests ajeno/eliminado/inexistente con `root`) |
| Mismo mensaje no existe / eliminado / ajeno; no revelar la otra empresa | 2 (tests 4–6 comparan `message`) |
| Regla 4 (dato mal formado = mensaje, no pantalla general) | 2 (`E_VALIDATION_ERROR` → 400, test Vine) |
| Regla 5 (persona no queda a medias) | 2 (test de reintento con el mismo correo) |
| Regla 6 (Excel y biométricos sin tocar) | 2 (no se modifican esos caminos); 3 (escenario de import) |
| Pilotos/Sobrecargos sin cambiar el formulario | 2 (el test de `0` + `''` es ese envío) |
| Conservar tipo / persona / empresa / nómina | 2 (`verifyInfoExist` sigue; su test se conserva) |
| Edición sin cambios | 2 (suite `employee_edicion_sin_estructura` en la verificación) |
| Manual de QA | 3 |

**Placeholders:** ninguno; cada step con código lo trae completo.

**Consistencia de nombres entre tasks:** `isMissingStructureId`, `requireEmployeeStructureForCreate`, `EmployeeStructureMissing = 'department' | 'position' | 'both'`, `verifyAssignable` (sin cambios), claves i18n `employee_structure_required_both_{title,message}`, `employee_department_required_{title,message}`, `employee_position_required_{title,message}`, y las ya existentes `employee_<field>_not_in_business_unit_{title,message}` — iguales en Tasks 1, 2 y 3.
