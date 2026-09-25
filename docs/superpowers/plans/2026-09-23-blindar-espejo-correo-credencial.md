# Blindar el espejo entre el correo de la persona y la credencial — Plan de implementación (USRH1789698261612)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la copia automática entre el correo del expediente (`people.person_email` / `employees.employee_business_email`) y el correo de acceso (`users.user_email`) viva en un solo punto, resuelva la cuenta por `person_id`, respete el tipo de correo persistido, valide unicidad y alcance antes de escribir, y guarde las dos mitades en una transacción.

**Architecture:** Un helper único (`app/helpers/person_user_email_mirror.ts`) con tres funciones públicas que exigen `trx` y actor, y cubren los seis puntos de escritura (M1-M6) desde cuatro sitios de llamada. Cada controlador abre `db.transaction`, llama a su servicio con `trx` y después al helper (la credencial se escribe al final), y traduce `EmailMirrorConflictError` / `EmailMirrorRefusedError` al formato `{title, detail, key, code}`. El tipo efectivo del correo se resuelve una sola vez en el controlador y se asigna al modelo antes de persistir.

**Tech Stack:** AdonisJS 6 · Lucid MySQL (BD desechable `sae_pruebas`) · VineJS · i18n (`resources/langs/es.json`, `en.json`) · Japa (`node ace test`)

**Fuentes:** `spec-USRH1789698261612.md` (contrato) y sus anexos A-D. Este plan los traduce a pasos contra el código **validado el 2026-09-23 sobre la rama `feature/USRH1789698261612-blindar-espejo-correo-credencial` @ `473cfadc`**.

## Global Constraints

- API-only. **Cero migraciones, seeders, rutas, middlewares, permisos, módulos de menú y frontend.**
- **Prohibido montar `permissionGate` en `start/routes/person_routes.ts`** (rompe la edición de clientes, ver su comentario).
- Helper: `trx: TransactionClientContract` **obligatorio**; **no** recibe `previousEmail`; el destino lo decide `user_email_type` **persistido**; la unicidad se valida **antes** de escribir; **prohibido `.first()`** para decidir a qué credencial se escribe; **cero `runUnscoped`** en `person_user_email_mirror.ts`; **no** llama a `verifyInfo`.
- Edición de usuario: tipo efectivo = `data.userEmailType ?? currentUser.userEmailType`. **JAMÁS** el default `'institutional'` en la edición.
- Alta de usuario: tipo efectivo = `data.userEmailType ?? USER_EMAIL_TYPE_DEFAULT` (`'institutional'`).
- Correos, `Ws.io.emit`, `assertContactoEmailWriteAllowed` y el recálculo de calendario van **fuera** de la transacción.
- Cuerpos de error: **sin** el correo, **sin** `user_id`/`person_id`/`employee_id`, **sin** nombre de índice, **sin** `verifyInfo.data`, **nunca** `ER_DUP_ENTRY` crudo.
- Status **400** (no 409) para los conflictos de unicidad del espejo.
- `key` = slug fijo en español (no se traduce); `code` = `USR.MAIL.00x`, campo aparte.
- i18n: **es y en, los dos o ninguno.**
- TS estricto, **cero `any`** (los detectores reciben `unknown`). `logger` de Adonis, nunca `console.*`. Sin emojis.
- Código, comentarios y docs en español; identificadores en inglés. Commits Conventional Commits con descripción en español.
- Tests contra `sae_pruebas`: `node ace test` fija `NODE_ENV=test` solo. Nunca dos migraciones a la vez.
- Retiro de archivos: nada se borra; se mueve a `__TO_DELETE__/` (esta HU no retira archivos).
- `node_modules/` intocable.

---

## Estado actual verificado (2026-09-23, `473cfadc`)

Drift respecto a las anclas del spec (fecha 2026-09-18). **Los números de línea de este plan son los vigentes.**

| Ancla del spec | Hoy | Nota |
|---|---|---|
| M1 `person_controller.ts:685` | `:742-752`; `previousEmail` en `:721` | trivial |
| M2/M3 `user_controller.ts:1703/:1712` | `:1726-1742`; `personForEmailSync` `:1713` | trivial |
| M4/M5 `user_controller.ts:2093/:2102` | `:2132-2148`; `personForEmailSync` `:2119` | trivial |
| M6 `employee_controller.ts:1860` | `:1861-1878` | trivial |
| `assertContactoEmailWriteAllowed` `:83-96` | `user_controller.ts:87-100` | trivial |
| `PersonService.update` `:97` | `:103`; calendario `:137-169` | trivial |
| `UserService.update` `:160` | `:160` | igual |
| `EmployeeService.update` `:811` | `:815`; `save` `:877`; `registrarCambio` `:881`; slug `:889` | trivial |
| `registrarCambio` `:31` | `:31`, no acepta `trx`, escribe dos filas | igual |
| `findActiveInBusinessUnitScope` `:188-196` | igual, es **método de instancia** (`new UserService(i18n)`) | el actor lleva `i18n` |
| 609: `businessScope()` en `/api/persons` | **montado** (`person_routes.ts:39`); `ctx.businessUnitScope: number[]` | D17 confirmado. `Person` compone `withBusinessUnitScope()` **fail-closed**: persona de otra empresa ⇒ 404 antes del espejo |
| 611: `respondUserAccessEmailDuplicated` | existe y recibe **solo `ctx`** | **D5 queda sin trabajo**: no hay firma que ampliar, se llama tal cual |
| 610: `personEmailExistsGlobally` | **NO existe**. La consulta vive copiada en `person_service.ts:249-261` y `validators/person.ts:22-33` | **D7 — decidido con el usuario (2026-09-23): se EXTRAE, sin cambiarla, a `app/helpers/person_email_global_uniqueness.ts`** (Task 2) |
| Imagen previa del correo personal | sin destino definido en el spec | **Decidido con el usuario (2026-09-23):** campo opcional `record_previous_person_email` en la entrada existente de Mongo `log_users` |
| `updateEmployeeValidator` sin `employeeBusinessEmail` | confirmado; su único llamador es `employee_controller.ts:1771` y un spec unitario | el spec unitario necesita `{ meta }` (Task 6) |
| `E_VALIDATION_ERROR` en `PUT /api/employees` | se traduce a **400** (`employee_controller.ts:1906-1917`), no 422 | la tabla §6 del spec dice 422: **manda el código vivo**, se deja en 400 y se declara en el reporte de cierre |
| `updateAssistCalendar` → `SyncAssistsService.setDateCalendar` | recálculo profundo del calendario, sin `trx` en toda la cadena | **Decisión de plan:** es dato derivado y recalculable; con `trx` se ejecuta **después del commit** (Task 5). Cumple el DoD "se demuestra que no escribe dentro del alcance" sin tocar el módulo de asistencias |
| Una persona con más de un empleado vivo | `createEmployeeValidator.personId.unique()` lo impide entre vivos | el `.first()` sobre `employees` es correcto por invariante; se declara en TSDoc |

### Decisiones de plan que el spec no fijaba (van al reporte de cierre para Wilvardo)

1. **Negativas nuevas con código propio** (el spec pedía "negativa explícita con título/detalle/key" sin código): `USR.MAIL.005` `cuenta-de-acceso-fuera-de-alcance` (**403**, también para actor ausente, mismo cuerpo) y `USR.MAIL.006` `cuenta-de-acceso-no-determinada` (**400**, varios usuarios vivos; no dice cuántos ni cuáles).
2. **La omisión se declara en la respuesta de éxito** como `data.emailMirror`: `{ status: 'written', target }` o `{ status: 'skipped', reason }`. Sin ids ni correos. Es aditivo: ningún campo existente cambia.
3. **`excludePersonId` se quita de `MirrorUserEmailInput`** (Anexo A): siempre era igual a `personId`.
4. **`updateUserValidator.personId`** se declara con `unique` (ningún otro usuario vivo en esa persona) y `exists` acotado a la empresa, **salvo** que sea la persona que el usuario ya tiene (no rompe usuarios ligados a personas de plataforma).
5. **B7:** los tres controladores pasan a usar el valor **validado** (con `trim`) del correo.

### Censo final

**Nuevos (8):** N1 `app/helpers/person_user_email_mirror.ts` · N2 `app/exceptions/email_mirror_conflict_error.ts` · N2b `app/exceptions/email_mirror_refused_error.ts` *(+1 sobre el spec: decisión 1)* · N3 `app/constants/user_email_type.ts` · N4 `tests/unit/helpers/person_user_email_mirror.spec.ts` · N5 `tests/functional/person_user_email_mirror.spec.ts` · N5b `tests/functional/person_user_email_mirror_support.ts` *(+1: montaje compartido N5/N6)* · N6 `tests/functional/person_user_email_mirror_atomicity.spec.ts` · N8 `app/helpers/person_email_global_uniqueness.ts` *(+1: D7)*. N7 (resolutor de scope) **no se escribe**: el scope llega por `ctx`.

**Editados (18):** E1-E15 del spec, **menos** nada, **más**: `app/validators/person.ts` (D7), `app/interfaces/MongoDB/log_user.ts` (imagen previa), `tests/unit/validators/employee_update_validator.spec.ts` (`meta`).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/constants/user_email_type.ts` | Fuente única del ENUM `institutional`/`personal` y su default |
| `app/helpers/person_email_global_uniqueness.ts` | La consulta global de correo personal de la 610, en un solo lugar (con su `runUnscoped`) |
| `app/exceptions/email_mirror_conflict_error.ts` | Choque de unicidad en el destino (`users`/`people`/`employees`) |
| `app/exceptions/email_mirror_refused_error.ts` | Negativas fail-closed: actor ausente, destino fuera de alcance, varios usuarios vivos |
| `app/helpers/person_user_email_mirror.ts` | El espejo: tres públicas, actor, proyección pública del resultado |
| `app/helpers/user_access_email_api_error.ts` | Traductores de las dos excepciones al cuerpo `{title, detail, key, code}` |
| `tests/functional/person_user_email_mirror_support.ts` | Montaje: empresa, actores con permisos, personas, usuarios, empleados, lecturas en BD, bodies |

---

## Preparación (una sola vez)

- [ ] **P1: BD de pruebas al día** (sin otra migración corriendo en el servidor):

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed
```

Esperado: termina sin error.

---

### Task 0: Línea base (sin código)

**Files:** ninguno. Solo se anota el resultado para el reporte de cierre.

- [ ] **Step 1: Correr el único test vivo del espejo**

```bash
node ace test functional --files="user_access_email_mask_guard"
```

Anotar si los 5 casos están en verde. **Riesgo conocido:** sus personas se crean sin `businessUnitId` (`createPerson`, `:134-142`). Desde la 609, con `businessScope` activo esas personas son invisibles para `Person.query()`, así que hoy el caso 4 **podría** estar en rojo. Si lo está, la corrección es del **montaje** (Task 10, Step 1), **nunca** de la aserción.

- [ ] **Step 2: Correr los 10 specs de `PUT` y dejar la línea base anotada**

```bash
node ace test functional --files="employee_edicion_sin_estructura" --files="employees_biometricos_dispositivos_permission_gate" --files="employees_persona_domicilio_bancos_permission_gate" --files="employees_sensitive_mask_echo_http" --files="employees_sensitive_write_by_category" --files="employees_sensitive_write_guard_http" --files="employees_update_daily_salary_echo" --files="employees_write_permission_gate" --files="user_tenant_isolation" --files="person_identity_company_scope"
```

Anotar los rojos previos: no son de esta HU y no se arreglan aquí.

- [ ] **Step 3: Censo de `userEmailType` y typecheck de partida**

```bash
rg -c "userEmailType" tests | wc -l
rg -n "userEmailType:\s*['\"]" tests | rg -v "'institutional'|'personal'|\"institutional\"|\"personal\""
npm run typecheck
```

Esperado: ~100 archivos; el segundo comando lista los tests que mandan un valor fuera del ENUM (van a recibir 422 después de la Task 1: se revisan uno a uno). `typecheck` en verde; si no, anotar los errores previos.

---

### Task 1: Tipo de correo acotado al ENUM (regla 9) y `personId` declarado en la edición

**Files:**
- Create: `app/constants/user_email_type.ts`
- Create: `tests/functional/person_user_email_mirror_support.ts`
- Create: `tests/functional/person_user_email_mirror.spec.ts`
- Modify: `app/models/user.ts:175`
- Modify: `app/validators/user.ts` (completo)
- Modify: `app/controllers/user_controller.ts:2114` (pasar `meta`)

**Interfaces:**
- Produces: `USER_EMAIL_TYPES`, `UserEmailTypeValue`, `USER_EMAIL_TYPE_DEFAULT` desde `#constants/user_email_type`. `updateUserValidator` exige `{ meta: { userId: number; currentPersonId: number } }`. Del support: `createMirrorWorld`, `cleanupMirrorWorld`, `createPersonIn`, `createUserFor`, `createEmployeeFor`, `readUserRow`, `readPersonEmail`, `readEmployeeRow`, `personBody`, `employeeBody`, `userBody`, `assertNoDisclosure`, `stamp`, tipos `MirrorWorld`, `MirrorRegistry`.

- [ ] **Step 1: Crear el montaje compartido**

`tests/functional/person_user_email_mirror_support.ts`:

```ts
import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
import type { UserEmailTypeValue } from '#constants/user_email_type'
import {
  addRoleModulePermissions,
  cleanupTenantActor,
  createTenantActor,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Montaje compartido de USRH1789698261612 (espejo correo ↔ credencial).
 *
 * Dos actores, cada uno con su empresa:
 *  - `full`: usuarios (create, update) + empleados (tab-trabajo-write,
 *    tab-persona-write, sensitive-contacto-write, sensitive-financiero-write).
 *  - `limited`: solo usuarios (create, update). Sin `sensitive-contacto-write`:
 *    es el actor de los casos de abuso (CA-12, CA-13).
 * Todo lo que crea un caso se anota en el registro y se borra en el teardown.
 */

const TEST_PASSWORD = 'EspejoCorreoCredencial123!'

export const FULL_EMPLOYEES_GRANTS = [
  'tab-trabajo-write',
  'tab-persona-write',
  'sensitive-contacto-write',
  'sensitive-financiero-write',
] as const

export interface MirrorRegistry {
  userIds: number[]
  personIds: number[]
  employeeIds: number[]
  businessUnitIds: number[]
}

export interface MirrorWorld {
  full: TenantActor
  limited: TenantActor
  registry: MirrorRegistry
}

export function stamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

export function businessUnitHeader(businessUnit: BusinessUnit) {
  return { 'X-Business-Unit-Id': businessUnit.businessUnitPublicId }
}

export async function createMirrorWorld(): Promise<MirrorWorld> {
  mail.fake()
  const full = await createTenantActor('espejo-full')
  await addRoleModulePermissions(full.role, 'users', ['create', 'update'])
  await addRoleModulePermissions(full.role, 'employees', [...FULL_EMPLOYEES_GRANTS])
  const limited = await createTenantActor('espejo-limited')
  await addRoleModulePermissions(limited.role, 'users', ['create', 'update'])
  return {
    full,
    limited,
    registry: { userIds: [], personIds: [], employeeIds: [], businessUnitIds: [] },
  }
}

export async function cleanupMirrorWorld(world: MirrorWorld | null): Promise<void> {
  mail.restore()
  if (!world) return
  const { registry } = world
  if (registry.userIds.length > 0) {
    await BusinessUnitUser.query().whereIn('user_id', registry.userIds).delete()
    await User.query().whereIn('user_id', registry.userIds).delete()
  }
  if (registry.employeeIds.length > 0) {
    await db.from('employee_salary_history').whereIn('employee_id', registry.employeeIds).delete()
    await Employee.query().withTrashed().whereIn('employee_id', registry.employeeIds).delete()
  }
  if (registry.personIds.length > 0) {
    await Person.query().withTrashed().whereIn('person_id', registry.personIds).delete()
  }
  await cleanupTenantActor(world.full)
  await cleanupTenantActor(world.limited)
  if (registry.businessUnitIds.length > 0) {
    await BusinessUnit.query().whereIn('business_unit_id', registry.businessUnitIds).delete()
  }
}

/** Empresa extra (para los casos de alcance). */
export async function createForeignBusinessUnit(registry: MirrorRegistry): Promise<BusinessUnit> {
  const s = stamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Espejo ajena ${s}`,
    businessUnitSlug: `espejo-ajena-${s}`,
    businessUnitLegalName: `Espejo ajena legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  registry.businessUnitIds.push(businessUnit.businessUnitId)
  return businessUnit
}

/** Persona marcada con la empresa (609): sin marca sería invisible con `businessScope`. */
export async function createPersonIn(
  registry: MirrorRegistry,
  businessUnit: BusinessUnit,
  personEmail: string | null
): Promise<Person> {
  const person = await Person.create({
    personFirstname: 'Espejo',
    personLastname: 'Correo',
    personSecondLastname: stamp(),
    personEmail,
    businessUnitId: businessUnit.businessUnitId,
  })
  registry.personIds.push(person.personId)
  return person
}

export async function createUserFor(
  registry: MirrorRegistry,
  person: Person,
  role: Role,
  businessUnits: BusinessUnit[],
  options: { userEmail: string; userEmailType: UserEmailTypeValue }
): Promise<User> {
  const user = await User.create({
    userEmail: options.userEmail,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: options.userEmailType,
  })
  registry.userIds.push(user.userId)
  await attachBusinessUnitsWithRole(
    user,
    businessUnits.map((unit) => unit.businessUnitId),
    role.roleId
  )
  return user
}

/** Empleado sin departamento ni puesto: la edición lo permite (USRH1788466831270). */
export async function createEmployeeFor(
  registry: MirrorRegistry,
  person: Person,
  businessUnit: BusinessUnit,
  businessEmail: string
): Promise<Employee> {
  const s = stamp()
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `ESP-${s}`
  employee.employeeFirstName = 'Espejo'
  employee.employeeLastName = 'Correo'
  employee.employeeSecondLastName = s.slice(0, 20)
  employee.employeePayrollNum = `ESP-${s}`
  employee.employeeBusinessEmail = businessEmail
  employee.companyId = businessUnit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeTypeId = 1
  employee.departmentId = null
  employee.positionId = null
  employee.employeeTerminatedDate = null
  await employee.save()
  registry.employeeIds.push(employee.employeeId)
  return employee
}

export async function readUserRow(userId: number) {
  return db
    .from('users')
    .where('user_id', userId)
    .select(['user_email', 'user_email_type', 'person_id'])
    .first()
}

/** Descifrado por el modelo; fuera de `TenantContext` no hay filtro de empresa. */
export async function readPersonEmail(personId: number): Promise<string | null> {
  const person = await Person.query().where('person_id', personId).firstOrFail()
  return person.personEmail
}

export async function readPersonFirstname(personId: number): Promise<string> {
  const person = await Person.query().where('person_id', personId).firstOrFail()
  return person.personFirstname
}

export async function readEmployeeRow(employeeId: number) {
  return db
    .from('employees')
    .where('employee_id', employeeId)
    .select(['employee_business_email', 'employee_first_name'])
    .first()
}

export async function countSalaryHistory(employeeId: number): Promise<number> {
  const row = await db
    .from('employee_salary_history')
    .where('employee_id', employeeId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

export function personBody(person: Person, overrides: Record<string, unknown> = {}) {
  return {
    personFirstname: person.personFirstname,
    personLastname: person.personLastname,
    personSecondLastname: person.personSecondLastname,
    personGender: 'Mujer',
    personBirthday: null,
    personEmail: person.personEmail,
    ...overrides,
  }
}

export function employeeBody(employee: Employee, overrides: Record<string, unknown> = {}) {
  return {
    employeeCode: String(employee.employeeCode),
    employeeFirstName: employee.employeeFirstName ?? '',
    employeeLastName: employee.employeeLastName ?? '',
    employeeSecondLastName: employee.employeeSecondLastName ?? '',
    companyId: employee.companyId,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    employeeTypeId: employee.employeeTypeId,
    businessUnitId: employee.businessUnitId,
    payrollBusinessUnitId: employee.payrollBusinessUnitId,
    employeeBusinessEmail: employee.employeeBusinessEmail,
    employeeWorkSchedule: 'Onsite',
    employeeWorkScheduleHybridConfig: null,
    ...overrides,
  }
}

export function userBody(user: User, overrides: Record<string, unknown> = {}) {
  return {
    userEmail: user.userEmail,
    userActive: true,
    roleId: user.roleId,
    personId: user.personId,
    ...overrides,
  }
}

/** CA-8 / SEC-6: el cuerpo no identifica al dueño del dato en conflicto. */
export function assertNoDisclosure(
  assert: Assert,
  body: unknown,
  forbidden: ReadonlyArray<string | number>
): void {
  const raw = JSON.stringify(body)
  for (const value of forbidden) {
    assert.notInclude(raw, String(value))
  }
  assert.notInclude(raw, 'ER_DUP_ENTRY')
  assert.notInclude(raw, 'users_email_active_unique')
  assert.notInclude(raw, 'userPassword')
}
```

- [ ] **Step 2: Escribir el test de CA-6 (rojo)**

`tests/functional/person_user_email_mirror.spec.ts`:

```ts
import { test } from '@japa/runner'
import User from '#models/user'
import {
  businessUnitHeader,
  cleanupMirrorWorld,
  createMirrorWorld,
  createPersonIn,
  createUserFor,
  readUserRow,
  stamp,
  userBody,
  type MirrorWorld,
} from './person_user_email_mirror_support.js'

/**
 * USRH1789698261612 — espejo entre el correo del expediente y la credencial,
 * sobre los cuatro endpoints, verificado leyendo la BD (no el status).
 */

let world: MirrorWorld | null = null

test.group('Espejo correo ↔ credencial — tipo de correo (CA-6)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  test('CA-6 tipo-fuera-del-enum-se-rechaza-al-capturar en POST', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, `ca6-${stamp()}@correo.com`)
    for (const invalid of ['Personal', '', 'otro']) {
      const response = await client
        .post('/api/users')
        .loginAs(w.full.user)
        .headers(businessUnitHeader(w.full.businessUnit))
        .json({
          userEmail: `ca6-${stamp()}@correo.com`,
          userActive: true,
          roleId: w.full.role.roleId,
          personId: person.personId,
          userEmailType: invalid,
        })
      assert.oneOf(response.status(), [422, 500], `status para "${invalid}"`)
      assert.notEqual(response.status(), 201)
      const created = await User.query().where('person_id', person.personId).whereNull('user_deleted_at').first()
      assert.isNull(created)
    }
  })

  test('CA-6 tipo-fuera-del-enum-se-rechaza-al-capturar en PUT', async ({ client, assert }) => {
    const w = world!
    const email = `ca6-put-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], {
      userEmail: email,
      userEmailType: 'personal',
    })
    const response = await client
      .put(`/api/users/${user.userId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(userBody(user, { userEmail: `nuevo-${email}`, userEmailType: 'Personal' }))
    assert.notEqual(response.status(), 201)
    const row = await readUserRow(user.userId)
    assert.equal(row.user_email, email)
    assert.equal(row.user_email_type, 'personal')
  })
})
```

> Nota: `POST`/`PUT /api/users` traducen hoy `E_VALIDATION_ERROR` a **500** (`user_controller.ts:1767-1775`). El `assert.oneOf` deja pasar el 500 **solo** en este step; en la Task 8 el catch lo traduce a 422 y el test se aprieta a `response.assertStatus(422)`.

- [ ] **Step 3: Correr y ver rojo**

```bash
node ace test functional --files="person_user_email_mirror"
```

Esperado: FAIL — `'Personal'` entra por `allowUnknownProperties()`: el POST responde 201 (o `ER_DATA_TRUNCATED`) y el PUT deja el tipo en un valor fuera del ENUM o cambia el correo.

- [ ] **Step 4: Crear la constante**

`app/constants/user_email_type.ts`:

```ts
/**
 * Tipos de correo de la credencial de acceso (USRH1789698261612). Espejo EXACTO
 * del ENUM de `1771254280625_create_add_user_email_type_to_users_table.ts`:
 * ENUM('institutional','personal') NOT NULL DEFAULT 'institutional'.
 * `institutional` → el espejo escribe `employees.employee_business_email`.
 * `personal`      → el espejo escribe `people.person_email`.
 */
export const USER_EMAIL_TYPES = ['institutional', 'personal'] as const
export type UserEmailTypeValue = (typeof USER_EMAIL_TYPES)[number]
/** Solo para el ALTA. En la edición, sin campo, se conserva el tipo guardado. */
export const USER_EMAIL_TYPE_DEFAULT: UserEmailTypeValue = 'institutional'
```

- [ ] **Step 5: Tipar el modelo**

`app/models/user.ts`: agregar `import type { UserEmailTypeValue } from '#constants/user_email_type'` junto a los imports y cambiar la línea 175:

```ts
  declare userEmailType: UserEmailTypeValue
```

- [ ] **Step 6: Validadores**

`app/validators/user.ts` queda:

```ts
import Person from '#models/person'
import User from '#models/user'
import vine from '@vinejs/vine'
import { USER_EMAIL_TYPES } from '#constants/user_email_type'
import { noMaskCharRule } from './no_mask_char_rule.js'

/**
 * Validadores del módulo de usuarios (tenant).
 *
 * `userPassword` no forma parte del contrato: si un cliente legacy lo envía en
 * POST/PUT, `allowUnknownProperties()` lo deja pasar la validación y el
 * controlador lo ignora (USRH1786736057522 E7).
 *
 * `userEmailType` es opcional en los dos y SIN default aquí (USRH1789698261612):
 * el default correcto no es el mismo en alta ('institutional') y en edición
 * (el tipo guardado). Lo resuelve el controlador.
 */
export const createUserValidator = vine.compile(
  vine
    .object({
      userEmail: vine
        .string()
        .trim()
        .minLength(0)
        .maxLength(200)
        .use(noMaskCharRule())
        .unique(async (_db, value) => {
          const existingEmail = await User.query()
            .whereNull('user_deleted_at')
            .where('user_email', value)
            .first()
          return !existingEmail
        }),
      userActive: vine.boolean(),
      roleId: vine.number().min(1),
      personId: vine
        .number()
        .min(1)
        .unique(async (_db, value) => {
          const existingPersonId = await User.query()
            .where('person_id', value)
            .whereNull('user_deleted_at')
            .first()
          return !existingPersonId
        }),
      userEmailType: vine.enum(USER_EMAIL_TYPES).optional(),
    })
    .allowUnknownProperties()
)

/**
 * `personId` se declara (USRH1789698261612): antes se leía del request sin
 * validar y permitía repuntar la cuenta a cualquier persona. Ningún otro
 * usuario vivo puede tenerla, y una persona nueva debe ser visible en la
 * empresa activa. La persona que la cuenta ya tiene siempre pasa: hay cuentas
 * ligadas a personas de plataforma que el scope no ve.
 */
export const updateUserValidator = vine.compile(
  vine
    .withMetaData<{ userId: number; currentPersonId: number }>()
    .object({
      userEmail: vine.string().trim().minLength(0).maxLength(200).use(noMaskCharRule()),
      userActive: vine.boolean(),
      roleId: vine.number().min(1),
      personId: vine
        .number()
        .min(1)
        .unique(async (_db, value, field) => {
          const clash = await User.query()
            .whereNull('user_deleted_at')
            .where('person_id', value)
            .whereNot('user_id', field.meta.userId)
            .first()
          return !clash
        })
        .exists(async (_db, value, field) => {
          if (value === field.meta.currentPersonId) return true
          const person = await Person.query()
            .whereNull('person_deleted_at')
            .where('person_id', value)
            .first()
          return person !== null
        }),
      userEmailType: vine.enum(USER_EMAIL_TYPES).optional(),
    })
    .allowUnknownProperties()
)
```

**Verificación de 10 minutos (DoD):** abrir `node_modules/@vinejs/vine/build/src/types.d.ts` (solo lectura) y confirmar que el tercer argumento del callback expone `meta` (`FieldContext['meta']`). Si el accesor fuera otro, se corrige aquí y en la Task 6 con el mismo nombre.

- [ ] **Step 7: Pasar `meta` en el único llamador**

`app/controllers/user_controller.ts:2114`:

```ts
      await request.validateUsing(updateUserValidator, {
        meta: { userId, currentPersonId: currentUser.personId },
      })
```

(La Task 9 reescribe este bloque; aquí solo se deja compilando.)

- [ ] **Step 8: Typecheck y triage**

```bash
npm run typecheck
```

Esperado: rojos solo donde se asigne un `string` suelto a `userEmailType`. Estrechar cada sitio con `as const` en el literal o con el tipo `UserEmailTypeValue`; **nunca** con `as any`. En `user_controller.store/update` el rojo del `as User` se resuelve en las Tasks 8-9; si bloquea el typecheck aquí, anotar `userEmailType: userEmailType as UserEmailTypeValue` **temporalmente** y quitarlo en la Task 8. Anotar el resultado final del triage para el reporte de cierre.

- [ ] **Step 9: Correr y ver verde**

```bash
node ace test functional --files="person_user_email_mirror" --files="user_access_email_mask_guard" --files="user_person_required"
```

Esperado: CA-6 en verde; los otros dos, igual que en la línea base.

- [ ] **Step 10: Commit**

```bash
git add app/constants/user_email_type.ts app/models/user.ts app/validators/user.ts app/controllers/user_controller.ts tests/functional/person_user_email_mirror_support.ts tests/functional/person_user_email_mirror.spec.ts
git commit -m "fix: Acotar el tipo de correo de acceso al ENUM y declarar personId en la edición de usuario"
```

---

### Task 2: Extraer la unicidad global del correo personal de la 610 (D7)

**Files:**
- Create: `app/helpers/person_email_global_uniqueness.ts`
- Modify: `app/services/person_service.ts:249-261`
- Modify: `app/validators/person.ts:16-34`

**Interfaces:**
- Produces: `personEmailExistsGlobally(email: string, excludePersonId: number): Promise<boolean>` desde `#helpers/person_email_global_uniqueness`. `excludePersonId = 0` ⇒ no excluye a nadie.

Es un movimiento de código **sin cambio de comportamiento**: misma consulta, mismo motivo de `runUnscoped`. La red son los specs vivos de la 610.

- [ ] **Step 1: Crear el helper**

```ts
import Person from '#models/person'
import { blindIndex } from '#utils/blind_index'
import { TenantContext } from '#utils/tenant_context'

const GLOBAL_PERSON_EMAIL_REASON =
  'person-identity: verificación global de correo personal (regla 5, USRH1789698261610)'

/**
 * ¿Hay OTRA persona viva, en cualquier empresa, con este correo personal?
 *
 * El correo personal es único en todo el sistema (USRH1789698261610, regla 5),
 * por eso la consulta corre sin filtro de empresa. Es el ÚNICO lugar con este
 * `runUnscoped`: alta, edición, verificación y el espejo de USRH1789698261612
 * la llaman; ninguno la copia. Compara por huella (`person_email_hash`), porque
 * el correo está cifrado.
 *
 * @param excludePersonId La propia persona en una edición; 0 en un alta.
 */
export async function personEmailExistsGlobally(
  email: string,
  excludePersonId: number
): Promise<boolean> {
  if (email.trim() === '') return false
  const emailHash = blindIndex(email)
  const existing = await TenantContext.runUnscoped(
    () =>
      Person.query()
        .whereNull('person_deleted_at')
        .where('person_email_hash', emailHash)
        .if(excludePersonId > 0, (query) => query.whereNot('person_id', excludePersonId))
        .first(),
    GLOBAL_PERSON_EMAIL_REASON
  )
  return existing !== null
}
```

- [ ] **Step 2: `PersonService.verifyInfo` la usa**

Reemplazar `person_service.ts:249-261` por:

```ts
    if (person.personEmail && person.personEmail.trim() !== '') {
      if (await personEmailExistsGlobally(person.personEmail, excludePersonId)) {
        return { status: 422, field: 'email' }
      }
    }
```

y agregar `import { personEmailExistsGlobally } from '#helpers/person_email_global_uniqueness'`. Quitar `TenantContext` de los imports **solo si** `rg -n "TenantContext" app/services/person_service.ts` ya no encuentra usos.

- [ ] **Step 3: `createPersonValidator` la usa**

En `app/validators/person.ts`, el `.unique(...)` de `personEmail` queda:

```ts
      .unique(async (_db, value) => !(await personEmailExistsGlobally(value, 0)))
```

Import nuevo: `import { personEmailExistsGlobally } from '#helpers/person_email_global_uniqueness'`. Quitar `import Person from '#models/person'` (queda sin uso). `blindIndex` y `TenantContext` siguen en uso por CURP/RFC/NSS.

- [ ] **Step 4: Regresión de la 610 y lint**

```bash
node ace test --files="person_identity" && npm run typecheck && npx eslint app/helpers/person_email_global_uniqueness.ts app/services/person_service.ts app/validators/person.ts
```

Esperado: los specs `person_identity_*` igual que en la línea base (verdes). `rg -n "runUnscoped" app/validators/person.ts app/services/person_service.ts | rg -i correo` → cero.

- [ ] **Step 5: Commit**

```bash
git add app/helpers/person_email_global_uniqueness.ts app/services/person_service.ts app/validators/person.ts
git commit -m "refactor: Extraer la verificación global del correo personal a un helper único"
```

---

### Task 3: Códigos, excepciones, traductores e i18n (reglas 5, 6 y 8)

**Files:**
- Modify: `app/constants/user_access_email_error_codes.ts` (completo)
- Create: `app/exceptions/email_mirror_conflict_error.ts`
- Create: `app/exceptions/email_mirror_refused_error.ts`
- Modify: `app/helpers/user_access_email_api_error.ts` (agregar al final)
- Modify: `resources/langs/es.json`, `resources/langs/en.json` (después de `user_access_email_duplicated_detail`)
- Create: `tests/unit/helpers/person_user_email_mirror.spec.ts` (grupo "respuestas")

**Interfaces:**
- Consumes: `respondUserAccessEmailDuplicated(ctx)` de la 611 (sin cambios de firma).
- Produces: `EmailMirrorTarget = 'users' | 'people' | 'employees'` (exportado desde `#exceptions/email_mirror_conflict_error` y re-exportado por el helper en la Task 4); `EmailMirrorConflictError(target)`; `EmailMirrorRefusalReason = 'missing-actor' | 'target-out-of-scope' | 'multiple-live-users'`; `EmailMirrorRefusedError(reason)`; `isEmailMirrorConflictError`, `respondEmailMirrorConflict(ctx, error)`, `isEmailMirrorRefusedError`, `respondEmailMirrorRefused(ctx, error)`, todos con retorno `UserAccessEmailErrorBody`.

> El tipo `EmailMirrorTarget` vive en la excepción (no en el helper, como decía el Anexo A) para que el helper importe la excepción sin ciclo.

- [ ] **Step 1: Test de las respuestas (rojo)**

`tests/unit/helpers/person_user_email_mirror.spec.ts`:

```ts
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import i18nManager from '@adonisjs/i18n/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import { EmailMirrorConflictError } from '#exceptions/email_mirror_conflict_error'
import { EmailMirrorRefusedError } from '#exceptions/email_mirror_refused_error'
import {
  respondEmailMirrorConflict,
  respondEmailMirrorRefused,
} from '#helpers/user_access_email_api_error'

async function spanishContext(): Promise<HttpContext> {
  const ctx = await testUtils.createHttpContext()
  ctx.i18n = i18nManager.locale('es')
  return ctx
}

test.group('Espejo correo ↔ credencial — respuestas (USRH1789698261612)', () => {
  test('conflicto en users reutiliza verbatim el cuerpo de la 611', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorConflict(ctx, new EmailMirrorConflictError('users'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.deepEqual(body, {
      title: 'Este correo de acceso ya está en uso',
      detail:
        'Otra cuenta activa usa este correo de acceso; usa uno distinto o da de baja la cuenta que lo tiene. No se guardó ningún cambio.',
      key: 'correo-de-acceso-ya-registrado',
      code: 'USR.MAIL.002',
    })
  })

  test('conflicto en people → USR.MAIL.003', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorConflict(ctx, new EmailMirrorConflictError('people'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.equal(body.key, 'correo-personal-ya-registrado')
    assert.equal(body.code, 'USR.MAIL.003')
    assert.equal(body.title, 'Este correo personal ya está en uso')
  })

  test('conflicto en employees → USR.MAIL.004', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorConflict(ctx, new EmailMirrorConflictError('employees'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.equal(body.key, 'correo-institucional-ya-registrado')
    assert.equal(body.code, 'USR.MAIL.004')
  })

  test('fuera de alcance y actor ausente responden el MISMO cuerpo 403', async ({ assert }) => {
    const ctxA = await spanishContext()
    const ctxB = await spanishContext()
    const outOfScope = respondEmailMirrorRefused(ctxA, new EmailMirrorRefusedError('target-out-of-scope'))
    const missingActor = respondEmailMirrorRefused(ctxB, new EmailMirrorRefusedError('missing-actor'))
    assert.equal(ctxA.response.getStatus(), 403)
    assert.deepEqual(outOfScope, missingActor)
    assert.equal(outOfScope.code, 'USR.MAIL.005')
    assert.equal(outOfScope.key, 'cuenta-de-acceso-fuera-de-alcance')
  })

  test('varios usuarios vivos → 400 USR.MAIL.006 sin decir cuántos', async ({ assert }) => {
    const ctx = await spanishContext()
    const body = respondEmailMirrorRefused(ctx, new EmailMirrorRefusedError('multiple-live-users'))
    assert.equal(ctx.response.getStatus(), 400)
    assert.equal(body.code, 'USR.MAIL.006')
    assert.equal(body.key, 'cuenta-de-acceso-no-determinada')
    assert.notMatch(JSON.stringify(body), /\d+ (cuentas|usuarios)/)
  })

  test('los mensajes del error no llevan datos del conflicto', async ({ assert }) => {
    assert.equal(new EmailMirrorConflictError('people').message, 'Email mirror conflict on people')
    assert.equal(
      new EmailMirrorRefusedError('multiple-live-users').message,
      'Email mirror refused: multiple-live-users'
    )
  })
})
```

- [ ] **Step 2: Correr y ver rojo**

```bash
node ace test unit --files="person_user_email_mirror"
```

Esperado: FAIL — `Cannot find module '#exceptions/email_mirror_conflict_error'`.

- [ ] **Step 3: Códigos**

`app/constants/user_access_email_error_codes.ts` queda:

```ts
/**
 * Códigos estables para rechazo de correo de acceso (USRH1789328027034, USRH1789698261611,
 * USRH1789698261612). Prefijo USR = Users.
 */
export const USER_ACCESS_EMAIL_ERROR_CODES = {
  /** El correo de acceso contiene el carácter de máscara U+2022. */
  MASKED: 'USR.MAIL.001',
  /** El correo de acceso ya lo usa otra cuenta viva. */
  DUPLICATED: 'USR.MAIL.002',
  /** El correo personal que el espejo iba a escribir ya lo usa otra persona viva. */
  MIRROR_PERSON_EMAIL_DUPLICATED: 'USR.MAIL.003',
  /** El correo institucional que el espejo iba a escribir ya lo usa otro empleado vivo. */
  MIRROR_EMPLOYEE_EMAIL_DUPLICATED: 'USR.MAIL.004',
  /** La cuenta de acceso que el espejo iba a tocar no está al alcance del actor. */
  MIRROR_TARGET_OUT_OF_SCOPE: 'USR.MAIL.005',
  /** La persona tiene más de una cuenta viva: no se decide a cuál escribir. */
  MIRROR_AMBIGUOUS_ACCOUNT: 'USR.MAIL.006',
} as const

export type UserAccessEmailErrorCode =
  (typeof USER_ACCESS_EMAIL_ERROR_CODES)[keyof typeof USER_ACCESS_EMAIL_ERROR_CODES]

export type UserAccessEmailErrorDefinition = {
  key: string
  code: UserAccessEmailErrorCode
  status: number
}

export const USER_ACCESS_EMAIL_ERRORS: Record<
  keyof typeof USER_ACCESS_EMAIL_ERROR_CODES,
  UserAccessEmailErrorDefinition
> = {
  MASKED: { key: 'no-fue-posible-guardar-el-correo-de-acceso', code: USER_ACCESS_EMAIL_ERROR_CODES.MASKED, status: 422 },
  DUPLICATED: { key: 'correo-de-acceso-ya-registrado', code: USER_ACCESS_EMAIL_ERROR_CODES.DUPLICATED, status: 400 },
  MIRROR_PERSON_EMAIL_DUPLICATED: {
    key: 'correo-personal-ya-registrado',
    code: USER_ACCESS_EMAIL_ERROR_CODES.MIRROR_PERSON_EMAIL_DUPLICATED,
    status: 400,
  },
  MIRROR_EMPLOYEE_EMAIL_DUPLICATED: {
    key: 'correo-institucional-ya-registrado',
    code: USER_ACCESS_EMAIL_ERROR_CODES.MIRROR_EMPLOYEE_EMAIL_DUPLICATED,
    status: 400,
  },
  MIRROR_TARGET_OUT_OF_SCOPE: {
    key: 'cuenta-de-acceso-fuera-de-alcance',
    code: USER_ACCESS_EMAIL_ERROR_CODES.MIRROR_TARGET_OUT_OF_SCOPE,
    status: 403,
  },
  MIRROR_AMBIGUOUS_ACCOUNT: {
    key: 'cuenta-de-acceso-no-determinada',
    code: USER_ACCESS_EMAIL_ERROR_CODES.MIRROR_AMBIGUOUS_ACCOUNT,
    status: 400,
  },
}
```

- [ ] **Step 4: Excepciones**

`app/exceptions/email_mirror_conflict_error.ts`:

```ts
/** Tabla sobre la que escribe el espejo correo ↔ credencial (USRH1789698261612). */
export type EmailMirrorTarget = 'users' | 'people' | 'employees'

/**
 * Choque de unicidad detectado por el espejo ANTES de escribir. Lleva el
 * destino para que el controlador elija el cuerpo sin adivinar.
 * Prohibido incluir el correo o ids en `message`.
 */
export class EmailMirrorConflictError extends Error {
  readonly httpStatus: number = 400

  constructor(readonly target: EmailMirrorTarget) {
    super(`Email mirror conflict on ${target}`)
    this.name = 'EmailMirrorConflictError'
  }
}
```

`app/exceptions/email_mirror_refused_error.ts`:

```ts
/**
 * Negativas fail-closed del espejo correo ↔ credencial (USRH1789698261612):
 *  - `missing-actor`: no hay usuario autenticado o empresa activa.
 *  - `target-out-of-scope`: la cuenta de acceso no está en las empresas del actor.
 *  - `multiple-live-users`: la persona tiene varias cuentas vivas.
 * Prohibido incluir ids, correos o conteos en `message`.
 */
export type EmailMirrorRefusalReason = 'missing-actor' | 'target-out-of-scope' | 'multiple-live-users'

export class EmailMirrorRefusedError extends Error {
  constructor(readonly reason: EmailMirrorRefusalReason) {
    super(`Email mirror refused: ${reason}`)
    this.name = 'EmailMirrorRefusedError'
  }
}
```

- [ ] **Step 5: Traductores**

Agregar al final de `app/helpers/user_access_email_api_error.ts` (y los dos imports arriba):

```ts
import { EmailMirrorConflictError } from '#exceptions/email_mirror_conflict_error'
import { EmailMirrorRefusedError } from '#exceptions/email_mirror_refused_error'
```

```ts
export function isEmailMirrorConflictError(error: unknown): error is EmailMirrorConflictError {
  return error instanceof EmailMirrorConflictError
}

/** Mismo destino ⇒ mismo cuerpo, venga del camino que venga (regla 5). */
export function respondEmailMirrorConflict(
  ctx: HttpContext,
  error: EmailMirrorConflictError
): UserAccessEmailErrorBody {
  if (error.target === 'users') return respondUserAccessEmailDuplicated(ctx)
  const isPerson = error.target === 'people'
  const definition = isPerson
    ? USER_ACCESS_EMAIL_ERRORS.MIRROR_PERSON_EMAIL_DUPLICATED
    : USER_ACCESS_EMAIL_ERRORS.MIRROR_EMPLOYEE_EMAIL_DUPLICATED
  const i18nPrefix = isPerson ? 'user_mirror_person_email_duplicated' : 'user_mirror_employee_email_duplicated'
  ctx.response.status(definition.status)
  return {
    title: ctx.i18n.t(`${i18nPrefix}_title`),
    detail: ctx.i18n.t(`${i18nPrefix}_detail`),
    key: definition.key,
    code: definition.code,
  }
}

export function isEmailMirrorRefusedError(error: unknown): error is EmailMirrorRefusedError {
  return error instanceof EmailMirrorRefusedError
}

/** Actor ausente y fuera de alcance comparten cuerpo: no se distingue por qué. */
export function respondEmailMirrorRefused(
  ctx: HttpContext,
  error: EmailMirrorRefusedError
): UserAccessEmailErrorBody {
  const isAmbiguous = error.reason === 'multiple-live-users'
  const definition = isAmbiguous
    ? USER_ACCESS_EMAIL_ERRORS.MIRROR_AMBIGUOUS_ACCOUNT
    : USER_ACCESS_EMAIL_ERRORS.MIRROR_TARGET_OUT_OF_SCOPE
  const i18nPrefix = isAmbiguous ? 'user_mirror_ambiguous_account' : 'user_mirror_target_out_of_scope'
  ctx.response.status(definition.status)
  return {
    title: ctx.i18n.t(`${i18nPrefix}_title`),
    detail: ctx.i18n.t(`${i18nPrefix}_detail`),
    key: definition.key,
    code: definition.code,
  }
}
```

- [ ] **Step 6: i18n (los dos idiomas)**

En `resources/langs/es.json`, justo después de `"user_access_email_duplicated_detail": ...,`:

```json
  "user_mirror_person_email_duplicated_title": "Este correo personal ya está en uso",
  "user_mirror_person_email_duplicated_detail": "Otra persona registrada usa este correo personal; usa uno distinto. No se guardó ningún cambio.",
  "user_mirror_employee_email_duplicated_title": "Este correo institucional ya está en uso",
  "user_mirror_employee_email_duplicated_detail": "Otro colaborador activo usa este correo institucional; usa uno distinto. No se guardó ningún cambio.",
  "user_mirror_target_out_of_scope_title": "No puedes cambiar el correo de acceso de esta persona",
  "user_mirror_target_out_of_scope_detail": "La cuenta de acceso de esta persona no pertenece a las empresas que administras. No se guardó ningún cambio.",
  "user_mirror_ambiguous_account_title": "No fue posible actualizar el correo de acceso",
  "user_mirror_ambiguous_account_detail": "No se pudo determinar cuál es la cuenta de acceso de esta persona. Contacta a soporte. No se guardó ningún cambio.",
```

En `resources/langs/en.json`, después de `"user_access_email_duplicated_detail": ...,`:

```json
  "user_mirror_person_email_duplicated_title": "This personal email is already in use",
  "user_mirror_person_email_duplicated_detail": "Another registered person uses this personal email; use a different one. No changes were saved.",
  "user_mirror_employee_email_duplicated_title": "This work email is already in use",
  "user_mirror_employee_email_duplicated_detail": "Another active employee uses this work email; use a different one. No changes were saved.",
  "user_mirror_target_out_of_scope_title": "You cannot change this person's access email",
  "user_mirror_target_out_of_scope_detail": "This person's access account does not belong to the companies you manage. No changes were saved.",
  "user_mirror_ambiguous_account_title": "The access email could not be updated",
  "user_mirror_ambiguous_account_detail": "This person's access account could not be determined. Contact support. No changes were saved.",
```

Verificar que los dos JSON siguen siendo válidos: `node -e "JSON.parse(require('fs').readFileSync('resources/langs/es.json'));JSON.parse(require('fs').readFileSync('resources/langs/en.json'))"`.

- [ ] **Step 7: Correr y ver verde**

```bash
node ace test unit --files="person_user_email_mirror" && npm run typecheck
```

Esperado: PASS (6 casos).

- [ ] **Step 8: Commit**

```bash
git add app/constants/user_access_email_error_codes.ts app/exceptions/email_mirror_conflict_error.ts app/exceptions/email_mirror_refused_error.ts app/helpers/user_access_email_api_error.ts resources/langs/es.json resources/langs/en.json tests/unit/helpers/person_user_email_mirror.spec.ts
git commit -m "feat: Agregar códigos y respuestas de conflicto y negativa del espejo de correo"
```

---

### Task 4: El helper único del espejo (reglas 1, 2, 3, 4, 6, 8, 10)

**Files:**
- Create: `app/helpers/person_user_email_mirror.ts`
- Modify: `tests/unit/helpers/person_user_email_mirror.spec.ts` (grupos M1, M6, credencial → expediente, actor, proyección)

**Interfaces:**
- Consumes: `EmailMirrorConflictError`, `EmailMirrorTarget` (Task 3); `EmailMirrorRefusedError` (Task 3); `personEmailExistsGlobally` (Task 2); `UserEmailTypeValue` (Task 1); `UserService#findActiveInBusinessUnitScope(userId, number[])`.
- Produces (exactos, los usan las Tasks 6-10):

```ts
export type { EmailMirrorTarget }
export type EmailMirrorSkipReason = 'source-email-empty' | 'no-live-counterpart' | 'email-type-mismatch' | 'already-in-sync'
export type EmailMirrorOutcome =
  | { readonly status: 'written'; readonly target: EmailMirrorTarget; readonly targetId: number; readonly previousValue: string | null }
  | { readonly status: 'skipped'; readonly reason: EmailMirrorSkipReason }
export type PublicEmailMirrorOutcome =
  | { readonly status: 'written'; readonly target: EmailMirrorTarget }
  | { readonly status: 'skipped'; readonly reason: EmailMirrorSkipReason }
export type EmailMirrorActor = { readonly userId: number; readonly businessUnitScope: readonly number[]; readonly i18n: I18n }
export function emailMirrorActorFromContext(ctx: HttpContext): EmailMirrorActor
export function mirrorPersonEmailToUserEmail(input: { personId: number; personEmail: string | null | undefined; actor: EmailMirrorActor; trx: TransactionClientContract }): Promise<EmailMirrorOutcome>
export function mirrorEmployeeEmailToUserEmail(input: { personId: number; employeeBusinessEmail: string | null | undefined; actor: EmailMirrorActor; trx: TransactionClientContract }): Promise<EmailMirrorOutcome>
export function mirrorUserEmailToRecord(input: { personId: number; userEmail: string; userEmailType: UserEmailTypeValue; actor: EmailMirrorActor; trx: TransactionClientContract }): Promise<EmailMirrorOutcome>
export function toPublicEmailMirrorOutcome(outcome: EmailMirrorOutcome): PublicEmailMirrorOutcome
```

`previousValue` solo trae algo cuando `target === 'people'` y el correo personal anterior no estaba vacío. **Nunca se serializa**: por eso existe `toPublicEmailMirrorOutcome`.

Orden de decisión en la dirección expediente → credencial (M1, M6), y por qué: `source-email-empty` → resolver usuario (varios vivos ⇒ `multiple-live-users`) → `no-live-counterpart` → `email-type-mismatch` → `already-in-sync` → **alcance del actor** → unicidad → escribir. El alcance va justo antes de escribir para que editar el nombre de una persona cuya cuenta es de otra empresa (sin tocar el correo) no se rechace.

- [ ] **Step 1: Tests del helper (rojo)**

Agregar al final de `tests/unit/helpers/person_user_email_mirror.spec.ts` (y los imports nuevos arriba):

```ts
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import Person from '#models/person'
import User from '#models/user'
import type { UserEmailTypeValue } from '#constants/user_email_type'
import {
  emailMirrorActorFromContext,
  mirrorEmployeeEmailToUserEmail,
  mirrorPersonEmailToUserEmail,
  mirrorUserEmailToRecord,
  toPublicEmailMirrorOutcome,
  type EmailMirrorActor,
} from '#helpers/person_user_email_mirror'
```

```ts
const UNIT_PASSWORD = 'EspejoUnitario123!'
const created = { userIds: [] as number[], personIds: [] as number[], employeeIds: [] as number[], businessUnitIds: [] as number[] }

function uniq(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function newBusinessUnit(): Promise<BusinessUnit> {
  const s = uniq()
  const unit = await BusinessUnit.create({
    businessUnitName: `Espejo unit ${s}`,
    businessUnitSlug: `espejo-unit-${s}`,
    businessUnitLegalName: `Espejo unit legal ${s}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  created.businessUnitIds.push(unit.businessUnitId)
  return unit
}

async function newPerson(personEmail: string | null): Promise<Person> {
  const person = await Person.create({ personFirstname: 'Espejo', personLastname: 'Unit', personSecondLastname: uniq(), personEmail })
  created.personIds.push(person.personId)
  return person
}

async function newUser(
  person: Person,
  userEmail: string,
  userEmailType: UserEmailTypeValue,
  businessUnit: BusinessUnit
): Promise<User> {
  const user = await User.create({ userEmail, userPassword: UNIT_PASSWORD, userActive: 1, roleId: 1, personId: person.personId, userEmailType })
  created.userIds.push(user.userId)
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return user
}

async function newEmployee(person: Person, businessUnit: BusinessUnit, businessEmail: string): Promise<Employee> {
  const s = uniq()
  const employee = new Employee()
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `EU-${s}`
  employee.employeeFirstName = 'Espejo'
  employee.employeeLastName = 'Unit'
  employee.employeeSecondLastName = s.slice(0, 20)
  employee.employeePayrollNum = `EU-${s}`
  employee.employeeBusinessEmail = businessEmail
  employee.companyId = businessUnit.businessUnitId
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.employeeTypeId = 1
  employee.departmentId = null
  employee.positionId = null
  await employee.save()
  created.employeeIds.push(employee.employeeId)
  return employee
}

function actorFor(businessUnit: BusinessUnit): EmailMirrorActor {
  return { userId: 1, businessUnitScope: [businessUnit.businessUnitId], i18n: i18nManager.locale('es') }
}

async function inTrx<T>(fn: (trx: TransactionClientContract) => Promise<T>): Promise<T> {
  return db.transaction(fn)
}

async function userEmailOf(userId: number): Promise<string> {
  const row = await db.from('users').where('user_id', userId).select('user_email').first()
  return row.user_email
}

async function personEmailOf(personId: number): Promise<string | null> {
  return (await Person.findOrFail(personId)).personEmail
}

async function employeeEmailOf(employeeId: number): Promise<string | null> {
  const row = await db.from('employees').where('employee_id', employeeId).select('employee_business_email').first()
  return row.employee_business_email
}

async function cleanupCreated(): Promise<void> {
  if (created.userIds.length > 0) {
    await BusinessUnitUser.query().whereIn('user_id', created.userIds).delete()
    await User.query().whereIn('user_id', created.userIds).delete()
  }
  if (created.employeeIds.length > 0) {
    await Employee.query().withTrashed().whereIn('employee_id', created.employeeIds).delete()
  }
  if (created.personIds.length > 0) {
    await Person.query().withTrashed().whereIn('person_id', created.personIds).delete()
  }
  if (created.businessUnitIds.length > 0) {
    await BusinessUnit.query().whereIn('business_unit_id', created.businessUnitIds).delete()
  }
}

test.group('Espejo — expediente → credencial (M1)', (group) => {
  let unit: BusinessUnit
  group.setup(async () => {
    unit = await newBusinessUnit()
  })
  group.teardown(cleanupCreated)

  test('personal: escribe aunque el correo de acceso no tenga nada que ver con el anterior (regla 1)', async ({ assert }) => {
    const person = await newPerson(null)
    const user = await newUser(person, `acceso-${uniq()}@x.com`, 'personal', unit)
    const nuevo = `nuevo-${uniq()}@correo.com`
    const outcome = await inTrx((trx) => mirrorPersonEmailToUserEmail({ personId: person.personId, personEmail: nuevo, actor: actorFor(unit), trx }))
    assert.deepEqual(toPublicEmailMirrorOutcome(outcome), { status: 'written', target: 'users' })
    assert.equal(await userEmailOf(user.userId), nuevo)
  })

  test('institutional: email-type-mismatch y la credencial no cambia (reglas 2 y 8)', async ({ assert }) => {
    const email = `inst-${uniq()}@empresa.com`
    const person = await newPerson(`p-${uniq()}@correo.com`)
    const user = await newUser(person, email, 'institutional', unit)
    const outcome = await inTrx((trx) => mirrorPersonEmailToUserEmail({ personId: person.personId, personEmail: `otro-${uniq()}@correo.com`, actor: actorFor(unit), trx }))
    assert.deepEqual(outcome, { status: 'skipped', reason: 'email-type-mismatch' })
    assert.equal(await userEmailOf(user.userId), email)
  })

  test('sin usuario vivo: no-live-counterpart (incluye usuario dado de baja)', async ({ assert }) => {
    const person = await newPerson(null)
    const user = await newUser(person, `baja-${uniq()}@x.com`, 'personal', unit)
    await user.delete()
    const outcome = await inTrx((trx) => mirrorPersonEmailToUserEmail({ personId: person.personId, personEmail: `n-${uniq()}@x.com`, actor: actorFor(unit), trx }))
    assert.deepEqual(outcome, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('origen vacío o solo espacios: source-email-empty', async ({ assert }) => {
    const person = await newPerson(null)
    for (const value of ['', '   ', null, undefined]) {
      const outcome = await inTrx((trx) => mirrorPersonEmailToUserEmail({ personId: person.personId, personEmail: value, actor: actorFor(unit), trx }))
      assert.deepEqual(outcome, { status: 'skipped', reason: 'source-email-empty' })
    }
  })

  test('mismo valor: already-in-sync', async ({ assert }) => {
    const email = `sync-${uniq()}@correo.com`
    const person = await newPerson(email)
    await newUser(person, email, 'personal', unit)
    const outcome = await inTrx((trx) => mirrorPersonEmailToUserEmail({ personId: person.personId, personEmail: `  ${email} `, actor: actorFor(unit), trx }))
    assert.deepEqual(outcome, { status: 'skipped', reason: 'already-in-sync' })
  })

  test('correo ocupado por otra cuenta viva: EmailMirrorConflictError(users) sin escribir (regla 6)', async ({ assert }) => {
    const ocupado = `ocupado-${uniq()}@correo.com`
    await newUser(await newPerson(null), ocupado, 'personal', unit)
    const email = `mio-${uniq()}@correo.com`
    const person = await newPerson(email)
    const user = await newUser(person, email, 'personal', unit)
    await assert.rejects(
      () => inTrx((trx) => mirrorPersonEmailToUserEmail({ personId: person.personId, personEmail: ocupado, actor: actorFor(unit), trx })),
      'Email mirror conflict on users'
    )
    assert.equal(await userEmailOf(user.userId), email)
  })

  test('CA-14 dos usuarios vivos: multiple-live-users y ninguno cambia', async ({ assert }) => {
    const person = await newPerson(null)
    const a = await newUser(person, `a-${uniq()}@x.com`, 'personal', unit)
    const b = await newUser(person, `b-${uniq()}@x.com`, 'personal', unit)
    await assert.rejects(
      () => inTrx((trx) => mirrorPersonEmailToUserEmail({ personId: person.personId, personEmail: `n-${uniq()}@x.com`, actor: actorFor(unit), trx })),
      'Email mirror refused: multiple-live-users'
    )
    assert.equal(await userEmailOf(a.userId), a.userEmail)
    assert.equal(await userEmailOf(b.userId), b.userEmail)
  })

  test('cuenta fuera del alcance del actor: target-out-of-scope y no escribe (B8)', async ({ assert }) => {
    const foreign = await newBusinessUnit()
    const email = `fuera-${uniq()}@x.com`
    const person = await newPerson(null)
    const user = await newUser(person, email, 'personal', foreign)
    await assert.rejects(
      () => inTrx((trx) => mirrorPersonEmailToUserEmail({ personId: person.personId, personEmail: `atacante-${uniq()}@x.com`, actor: actorFor(unit), trx })),
      'Email mirror refused: target-out-of-scope'
    )
    assert.equal(await userEmailOf(user.userId), email)
  })
})

test.group('Espejo — empleado → credencial (M6)', (group) => {
  let unit: BusinessUnit
  group.setup(async () => {
    unit = await newBusinessUnit()
  })
  group.teardown(cleanupCreated)

  test('institutional: escribe', async ({ assert }) => {
    const person = await newPerson(null)
    const user = await newUser(person, `viejo-${uniq()}@empresa.com`, 'institutional', unit)
    const nuevo = `nuevo-${uniq()}@empresa.com`
    const outcome = await inTrx((trx) => mirrorEmployeeEmailToUserEmail({ personId: person.personId, employeeBusinessEmail: nuevo, actor: actorFor(unit), trx }))
    assert.equal(outcome.status, 'written')
    assert.equal(await userEmailOf(user.userId), nuevo)
  })

  test('CA-3 personal: email-type-mismatch y la credencial no cambia', async ({ assert }) => {
    const email = `personal-${uniq()}@correo.com`
    const person = await newPerson(email)
    const user = await newUser(person, email, 'personal', unit)
    const outcome = await inTrx((trx) => mirrorEmployeeEmailToUserEmail({ personId: person.personId, employeeBusinessEmail: `x-${uniq()}@empresa.com`, actor: actorFor(unit), trx }))
    assert.deepEqual(outcome, { status: 'skipped', reason: 'email-type-mismatch' })
    assert.equal(await userEmailOf(user.userId), email)
  })

  test('correo ocupado por otra cuenta viva: EmailMirrorConflictError(users)', async ({ assert }) => {
    const ocupado = `ocupado-${uniq()}@empresa.com`
    await newUser(await newPerson(null), ocupado, 'institutional', unit)
    const person = await newPerson(null)
    await newUser(person, `mio-${uniq()}@empresa.com`, 'institutional', unit)
    await assert.rejects(
      () => inTrx((trx) => mirrorEmployeeEmailToUserEmail({ personId: person.personId, employeeBusinessEmail: ocupado, actor: actorFor(unit), trx })),
      'Email mirror conflict on users'
    )
  })
})

test.group('Espejo — credencial → expediente (M2-M5)', (group) => {
  let unit: BusinessUnit
  group.setup(async () => {
    unit = await newBusinessUnit()
  })
  group.teardown(cleanupCreated)

  test('personal: escribe person_email, devuelve la imagen previa y no toca al empleado (regla 3)', async ({ assert }) => {
    const anterior = `anterior-${uniq()}@correo.com`
    const person = await newPerson(anterior)
    const empresa = `empresa-${uniq()}@empresa.com`
    const employee = await newEmployee(person, unit, empresa)
    const nuevo = `nuevo-${uniq()}@correo.com`
    const outcome = await inTrx((trx) => mirrorUserEmailToRecord({ personId: person.personId, userEmail: nuevo, userEmailType: 'personal', actor: actorFor(unit), trx }))
    assert.equal(outcome.status, 'written')
    if (outcome.status === 'written') {
      assert.equal(outcome.target, 'people')
      assert.equal(outcome.previousValue, anterior)
    }
    assert.equal(await personEmailOf(person.personId), nuevo)
    assert.equal(await employeeEmailOf(employee.employeeId), empresa)
  })

  test('personal sin persona viva: no-live-counterpart', async ({ assert }) => {
    const person = await newPerson(null)
    await person.delete()
    const outcome = await inTrx((trx) => mirrorUserEmailToRecord({ personId: person.personId, userEmail: `x-${uniq()}@x.com`, userEmailType: 'personal', actor: actorFor(unit), trx }))
    assert.deepEqual(outcome, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('personal con correo de otra persona (global): EmailMirrorConflictError(people)', async ({ assert }) => {
    const ocupado = `ajeno-${uniq()}@correo.com`
    await newPerson(ocupado)
    const anterior = `mio-${uniq()}@correo.com`
    const person = await newPerson(anterior)
    await assert.rejects(
      () => inTrx((trx) => mirrorUserEmailToRecord({ personId: person.personId, userEmail: ocupado, userEmailType: 'personal', actor: actorFor(unit), trx })),
      'Email mirror conflict on people'
    )
    assert.equal(await personEmailOf(person.personId), anterior)
  })

  test('CA-4 institutional: escribe employee_business_email y person_email queda intacto', async ({ assert }) => {
    const personal = `personal-${uniq()}@correo.com`
    const person = await newPerson(personal)
    const employee = await newEmployee(person, unit, `viejo-${uniq()}@empresa.com`)
    const nuevo = `nuevo-${uniq()}@empresa.com`
    const outcome = await inTrx((trx) => mirrorUserEmailToRecord({ personId: person.personId, userEmail: nuevo, userEmailType: 'institutional', actor: actorFor(unit), trx }))
    assert.deepEqual(toPublicEmailMirrorOutcome(outcome), { status: 'written', target: 'employees' })
    assert.equal(await employeeEmailOf(employee.employeeId), nuevo)
    assert.equal(await personEmailOf(person.personId), personal)
  })

  test('CA-10 institutional sin empleado vivo: no-live-counterpart', async ({ assert }) => {
    const person = await newPerson(null)
    const outcome = await inTrx((trx) => mirrorUserEmailToRecord({ personId: person.personId, userEmail: `x-${uniq()}@empresa.com`, userEmailType: 'institutional', actor: actorFor(unit), trx }))
    assert.deepEqual(outcome, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('institutional con correo de otro empleado vivo: EmailMirrorConflictError(employees)', async ({ assert }) => {
    const ocupado = `ocupado-${uniq()}@empresa.com`
    await newEmployee(await newPerson(null), unit, ocupado)
    const person = await newPerson(null)
    const propio = `propio-${uniq()}@empresa.com`
    const employee = await newEmployee(person, unit, propio)
    await assert.rejects(
      () => inTrx((trx) => mirrorUserEmailToRecord({ personId: person.personId, userEmail: ocupado, userEmailType: 'institutional', actor: actorFor(unit), trx })),
      'Email mirror conflict on employees'
    )
    assert.equal(await employeeEmailOf(employee.employeeId), propio)
  })

  test('mismo valor: already-in-sync', async ({ assert }) => {
    const email = `igual-${uniq()}@empresa.com`
    const person = await newPerson(null)
    await newEmployee(person, unit, email)
    const outcome = await inTrx((trx) => mirrorUserEmailToRecord({ personId: person.personId, userEmail: email, userEmailType: 'institutional', actor: actorFor(unit), trx }))
    assert.deepEqual(outcome, { status: 'skipped', reason: 'already-in-sync' })
  })
})

test.group('Espejo — actor y proyección pública', () => {
  test('sin usuario autenticado: missing-actor (B6)', async ({ assert }) => {
    const ctx = await spanishContext()
    assert.throws(() => emailMirrorActorFromContext(ctx), 'Email mirror refused: missing-actor')
  })

  test('la proyección pública no lleva targetId ni imagen previa', ({ assert }) => {
    const publicOutcome = toPublicEmailMirrorOutcome({ status: 'written', target: 'people', targetId: 99, previousValue: 'secreto@correo.com' })
    assert.deepEqual(publicOutcome, { status: 'written', target: 'people' })
    assert.notInclude(JSON.stringify(publicOutcome), 'secreto')
  })
})
```

> `testUtils.createHttpContext()` no autentica: `ctx.auth` puede no existir. Por eso el helper lee el actor con `ctx.auth?.user?.userId`.

- [ ] **Step 2: Correr y ver rojo**

```bash
node ace test unit --files="person_user_email_mirror"
```

Esperado: FAIL — `Cannot find module '#helpers/person_user_email_mirror'`.

- [ ] **Step 3: Implementar el helper**

`app/helpers/person_user_email_mirror.ts`:

```ts
import type { HttpContext } from '@adonisjs/core/http'
import type { I18n } from '@adonisjs/i18n'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Employee from '#models/employee'
import Person from '#models/person'
import User from '#models/user'
import UserService from '#services/user_service'
import type { UserEmailTypeValue } from '#constants/user_email_type'
import { EmailMirrorConflictError, type EmailMirrorTarget } from '#exceptions/email_mirror_conflict_error'
import { EmailMirrorRefusedError } from '#exceptions/email_mirror_refused_error'
import { personEmailExistsGlobally } from '#helpers/person_email_global_uniqueness'

/**
 * Espejo entre el correo del expediente y el correo de acceso (USRH1789698261612).
 *
 * Punto ÚNICO de los seis caminos que copiaban el correo: M1 (expediente →
 * credencial), M2/M3 (alta de usuario → expediente), M4/M5 (edición de usuario
 * → expediente) y M6 (empleado → credencial). Invariantes por construcción:
 *  - La cuenta se resuelve por `person_id`, nunca por el correo anterior:
 *    ninguna función recibe `previousEmail`.
 *  - El destino lo decide `user_email_type` PERSISTIDO, nunca el request.
 *  - La unicidad del destino se valida ANTES de escribir.
 *  - `trx` es obligatorio: no se puede llamar fuera de una transacción.
 *  - El actor es obligatorio y la credencial solo se toca si está a su alcance.
 * Toda no-escritura devuelve una razón con nombre: no hay omisiones mudas.
 *
 * Se llama SOLO desde controladores. Bajarlo a un servicio haría que la carga
 * masiva reescribiera credenciales en lote sin permiso de usuarios.
 */

export type { EmailMirrorTarget }

export type EmailMirrorSkipReason =
  /** El origen no trae correo (null, undefined, vacío o solo espacios). */
  | 'source-email-empty'
  /** No hay contraparte viva para la persona (sin usuario, sin expediente o sin empleado). */
  | 'no-live-counterpart'
  /** El tipo persistido manda la copia al otro campo: decisión de RH, no accidente. */
  | 'email-type-mismatch'
  /** El destino ya tiene ese valor. */
  | 'already-in-sync'

export type EmailMirrorOutcome =
  | {
      readonly status: 'written'
      readonly target: EmailMirrorTarget
      readonly targetId: number
      /** Correo personal anterior (solo destino `people`). Nunca se serializa. */
      readonly previousValue: string | null
    }
  | { readonly status: 'skipped'; readonly reason: EmailMirrorSkipReason }

export type PublicEmailMirrorOutcome =
  | { readonly status: 'written'; readonly target: EmailMirrorTarget }
  | { readonly status: 'skipped'; readonly reason: EmailMirrorSkipReason }

export type EmailMirrorActor = {
  readonly userId: number
  readonly businessUnitScope: readonly number[]
  readonly i18n: I18n
}

type MirrorBaseInput = {
  readonly personId: number
  readonly actor: EmailMirrorActor
  readonly trx: TransactionClientContract
}

export type MirrorPersonEmailInput = MirrorBaseInput & { readonly personEmail: string | null | undefined }
export type MirrorEmployeeEmailInput = MirrorBaseInput & { readonly employeeBusinessEmail: string | null | undefined }
export type MirrorUserEmailInput = MirrorBaseInput & {
  readonly userEmail: string
  /** SIEMPRE el valor persistido (`created.userEmailType` / `updated.userEmailType`). */
  readonly userEmailType: UserEmailTypeValue
}

/** Sin usuario autenticado o sin empresa activa, el espejo no corre (falla cerrado). */
export function emailMirrorActorFromContext(ctx: HttpContext): EmailMirrorActor {
  const userId = ctx.auth?.user?.userId
  const businessUnitScope = ctx.businessUnitScope ?? []
  if (!userId || businessUnitScope.length === 0) {
    throw new EmailMirrorRefusedError('missing-actor')
  }
  return { userId, businessUnitScope, i18n: ctx.i18n }
}

/** M1 — `people.person_email` → credencial, solo si el tipo persistido es `personal`. */
export function mirrorPersonEmailToUserEmail(input: MirrorPersonEmailInput): Promise<EmailMirrorOutcome> {
  return mirrorRecordEmailToUserEmail(input, input.personEmail, 'personal')
}

/** M6 — `employees.employee_business_email` → credencial, solo si el tipo persistido es `institutional`. */
export function mirrorEmployeeEmailToUserEmail(input: MirrorEmployeeEmailInput): Promise<EmailMirrorOutcome> {
  return mirrorRecordEmailToUserEmail(input, input.employeeBusinessEmail, 'institutional')
}

/**
 * M2+M3 (alta) y M4+M5 (edición) — credencial → expediente. `personal` escribe
 * `people.person_email`; `institutional`, `employees.employee_business_email`.
 * El otro campo no se toca nunca (regla 3). `Person` y `Employee` componen el
 * scope de empresa: un expediente ajeno es invisible y queda `no-live-counterpart`.
 */
export async function mirrorUserEmailToRecord(input: MirrorUserEmailInput): Promise<EmailMirrorOutcome> {
  const email = normalizeMirrorEmail(input.userEmail)
  if (email === null) return skipped('source-email-empty')

  if (input.userEmailType === 'personal') {
    const person = await Person.query({ client: input.trx })
      .where('person_id', input.personId)
      .whereNull('person_deleted_at')
      .first()
    if (!person) return skipped('no-live-counterpart')
    if (person.personEmail === email) return skipped('already-in-sync')
    if (await personEmailExistsGlobally(email, person.personId)) {
      throw new EmailMirrorConflictError('people')
    }
    const previousValue = normalizeMirrorEmail(person.personEmail)
    person.useTransaction(input.trx)
    person.personEmail = email
    await person.save()
    return { status: 'written', target: 'people', targetId: person.personId, previousValue }
  }

  // Una persona tiene a lo más un empleado vivo: lo garantiza
  // `createEmployeeValidator.personId.unique()`.
  const employee = await Employee.query({ client: input.trx })
    .where('person_id', input.personId)
    .whereNull('employee_deleted_at')
    .first()
  if (!employee) return skipped('no-live-counterpart')
  if (employee.employeeBusinessEmail === email) return skipped('already-in-sync')
  await assertEmployeeBusinessEmailAvailable(email, employee.employeeId, input.trx)
  employee.useTransaction(input.trx)
  employee.employeeBusinessEmail = email
  await employee.save()
  return { status: 'written', target: 'employees', targetId: employee.employeeId, previousValue: null }
}

/** Lo único que sale en la respuesta HTTP: sin ids ni correo anterior. */
export function toPublicEmailMirrorOutcome(outcome: EmailMirrorOutcome): PublicEmailMirrorOutcome {
  if (outcome.status === 'written') return { status: 'written', target: outcome.target }
  return { status: 'skipped', reason: outcome.reason }
}

async function mirrorRecordEmailToUserEmail(
  input: MirrorBaseInput,
  source: string | null | undefined,
  requiredType: UserEmailTypeValue
): Promise<EmailMirrorOutcome> {
  const email = normalizeMirrorEmail(source)
  if (email === null) return skipped('source-email-empty')

  const user = await findTheLiveUserOfPerson(input.personId, input.trx)
  if (!user) return skipped('no-live-counterpart')
  if (user.userEmailType !== requiredType) return skipped('email-type-mismatch')
  if (user.userEmail === email) return skipped('already-in-sync')

  await assertActorCanAdministerUser(input.actor, user.userId)
  await assertUserEmailAvailable(email, user.userId, input.trx)

  user.useTransaction(input.trx)
  user.userEmail = email
  await user.save()
  return { status: 'written', target: 'users', targetId: user.userId, previousValue: null }
}

function skipped(reason: EmailMirrorSkipReason): EmailMirrorOutcome {
  return { status: 'skipped', reason }
}

/** `''` y solo-espacios cuentan como "sin correo": `''` es falsy y se colaba. */
function normalizeMirrorEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * La cuenta viva de la persona. Con más de una, falla cerrado: un `.first()`
 * sin criterio elegiría al azar a qué credencial escribir.
 */
async function findTheLiveUserOfPerson(personId: number, trx: TransactionClientContract): Promise<User | null> {
  const users = await User.query({ client: trx })
    .where('person_id', personId)
    .whereNull('user_deleted_at')
    .orderBy('user_id')
    .limit(2)
  if (users.length > 1) throw new EmailMirrorRefusedError('multiple-live-users')
  return users[0] ?? null
}

/** El espejo nunca amplía el acceso del actor (B8). */
async function assertActorCanAdministerUser(actor: EmailMirrorActor, userId: number): Promise<void> {
  const scoped = await new UserService(actor.i18n).findActiveInBusinessUnitScope(userId, [
    ...actor.businessUnitScope,
  ])
  if (!scoped) throw new EmailMirrorRefusedError('target-out-of-scope')
}

async function assertUserEmailAvailable(
  email: string,
  excludeUserId: number,
  trx: TransactionClientContract
): Promise<void> {
  const clash = await User.query({ client: trx })
    .whereNull('user_deleted_at')
    .where('user_email', email)
    .whereNot('user_id', excludeUserId)
    .first()
  if (clash) throw new EmailMirrorConflictError('users')
}

async function assertEmployeeBusinessEmailAvailable(
  email: string,
  excludeEmployeeId: number,
  trx: TransactionClientContract
): Promise<void> {
  const clash = await Employee.query({ client: trx })
    .whereNull('employee_deleted_at')
    .where('employee_business_email', email)
    .whereNot('employee_id', excludeEmployeeId)
    .first()
  if (clash) throw new EmailMirrorConflictError('employees')
}
```

> Si `UserService` importado desde un helper genera un ciclo de imports (`user_service` → … → este helper), romperlo moviendo la consulta de alcance a una función local que calque `findActiveInBusinessUnitScope` **no** es aceptable sin avisar: reportarlo antes.

- [ ] **Step 4: Correr y ver verde**

```bash
node ace test unit --files="person_user_email_mirror" && npm run typecheck && npx eslint app/helpers/person_user_email_mirror.ts
rg -n "runUnscoped|previousEmail|verifyInfo" app/helpers/person_user_email_mirror.ts
```

Esperado: PASS (todos los grupos). El `rg` no encuentra nada.

- [ ] **Step 5: Commit**

```bash
git add app/helpers/person_user_email_mirror.ts tests/unit/helpers/person_user_email_mirror.spec.ts
git commit -m "feat: Crear el punto único del espejo entre correo del expediente y credencial"
```

---

### Task 5: Los servicios aceptan la transacción del llamador (regla 7)

**Files:**
- Modify: `app/services/person_service.ts:103-172` (`update`) + método nuevo `syncBirthdayCalendar`
- Modify: `app/services/user_service.ts:160-174` (`update`)
- Modify: `app/services/employee_service.ts:815-892` (`update`)
- Modify: `app/services/employee_salary_history_service.ts:31-53` (`registrarCambio`)
- Create: `tests/functional/person_user_email_mirror_atomicity.spec.ts` (grupo "servicios")

**Interfaces:**
- Produces:
  - `PersonService#update(currentPerson: Person, person: Person, trx?: TransactionClientContract): Promise<Person>` — con `trx` **no** recalcula el calendario.
  - `PersonService#syncBirthdayCalendar(currentPerson: Person, personBirthdayPast: string | null, personBirthdayInput: string | null): Promise<void>` — requiere `currentPerson.employee` cargado (lo deja cargado `update`).
  - `UserService#update(currentUser: User, user: User, trx?: TransactionClientContract): Promise<User>`
  - `EmployeeService#update(currentEmployee, employee, options?, trx?: TransactionClientContract): Promise<Employee>`
  - `EmployeeSalaryHistoryService#registrarCambio(input: RegistrarCambioInput, trx?: TransactionClientContract): Promise<void>`

Sin `trx`, los cuatro se comportan exactamente como hoy.

- [ ] **Step 1: Test de rollback a nivel servicio (rojo)**

`tests/functional/person_user_email_mirror_atomicity.spec.ts`:

```ts
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import Employee from '#models/employee'
import User from '#models/user'
import EmployeeService from '#services/employee_service'
import EmployeeSalaryHistoryService from '#services/employee_salary_history_service'
import UserService from '#services/user_service'
import {
  cleanupMirrorWorld,
  countSalaryHistory,
  createEmployeeFor,
  createMirrorWorld,
  createPersonIn,
  createUserFor,
  readUserRow,
  stamp,
  type MirrorWorld,
} from './person_user_email_mirror_support.js'

/**
 * USRH1789698261612 — las dos mitades se guardan juntas o ninguna (regla 7).
 * Cada caso verifica leyendo la fila, no el status.
 */

class ForcedRollback extends Error {}

let world: MirrorWorld | null = null

test.group('Atomicidad — servicios con transacción', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  test('registrarCambio dentro de una transacción revertida no deja filas', async ({ assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, `sal-${stamp()}@empresa.com`)
    const before = await countSalaryHistory(employee.employeeId)
    await assert.rejects(() =>
      db.transaction(async (trx) => {
        await new EmployeeSalaryHistoryService().registrarCambio(
          { employeeId: employee.employeeId, salaryDaily: 321.5, changedBy: w.full.user.userId },
          trx
        )
        throw new ForcedRollback('rollback')
      })
    )
    assert.equal(await countSalaryHistory(employee.employeeId), before)
  })

  test('UserService.update dentro de una transacción revertida deja la credencial como estaba', async ({ assert }) => {
    const w = world!
    const email = `svc-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'personal' })
    await assert.rejects(() =>
      db.transaction(async (trx) => {
        const current = await User.findOrFail(user.userId, { client: trx })
        await new UserService(i18nManager.locale('es')).update(
          current,
          { userEmail: `otro-${email}`, userActive: 1, roleId: user.roleId, personId: user.personId, userEmailType: 'personal' } as User,
          trx
        )
        throw new ForcedRollback('rollback')
      })
    )
    assert.equal((await readUserRow(user.userId)).user_email, email)
  })

  test('EmployeeService.update con cambio de salario revertido no deja historial ni correo', async ({ assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const email = `emp-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, email)
    const before = await countSalaryHistory(employee.employeeId)
    await assert.rejects(() =>
      db.transaction(async (trx) => {
        const current = await Employee.findOrFail(employee.employeeId, { client: trx })
        const payload = { ...current.serialize(), employeeBusinessEmail: `nuevo-${email}`, dailySalary: 777.25 } as unknown as Employee
        await new EmployeeService(i18nManager.locale('es')).update(current, payload, { changedBy: w.full.user.userId }, trx)
        throw new ForcedRollback('rollback')
      })
    )
    const row = await db.from('employees').where('employee_id', employee.employeeId).select('employee_business_email').first()
    assert.equal(row.employee_business_email, email)
    assert.equal(await countSalaryHistory(employee.employeeId), before)
  })
})
```

> El payload del tercer caso usa `serialize()` para no depender de todos los campos que `update` copia. Si `serialize()` oculta algún campo que `applyWorkScheduleAndTeleworkPercentage` exige (por ejemplo `employeeWorkSchedule`), agregarlo explícito al objeto con el valor de `current`.

- [ ] **Step 2: Correr y ver rojo**

```bash
node ace test functional --files="person_user_email_mirror_atomicity"
```

Esperado: FAIL — los tres casos dejan la escritura hecha (los servicios ignoran el `trx` que no aceptan) o TS se queja del argumento extra.

- [ ] **Step 3: `EmployeeSalaryHistoryService.registrarCambio`**

```ts
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
```

```ts
  /**
   * Registra un nuevo período en el histórico de salarios del empleado.
   * Si existe una versión vigente (valid_to = null) la cierra con valid_to = hoy
   * y crea una nueva fila a partir de hoy con el nuevo valor.
   * El cifrado lo maneja el modelo transparentemente.
   *
   * @param trx La del llamador: escribe dos filas y un rollback no debe dejar
   * historial huérfano (USRH1789698261612).
   */
  async registrarCambio(input: RegistrarCambioInput, trx?: TransactionClientContract): Promise<void> {
    const hoy = DateTime.now().toLocal().startOf('day')

    const vigente = await EmployeeSalaryHistory.query({ client: trx })
      .where('employee_id', input.employeeId)
      .whereNull('valid_to')
      .whereNull('employee_salary_history_deleted_at')
      .first()

    if (vigente) {
      vigente.validTo = hoy
      await vigente.save()
    }

    const nueva = new EmployeeSalaryHistory()
    nueva.employeeId = input.employeeId
    nueva.salaryDaily = input.salaryDaily
    nueva.validFrom = hoy
    nueva.validTo = null
    nueva.changedBy = input.changedBy
    nueva.reason = input.reason ?? null
    if (trx) nueva.useTransaction(trx)
    await nueva.save()
  }
```

(`vigente` ya viene con el cliente de la consulta, no necesita `useTransaction`.) Confirmar que no hay otros llamadores que rompan: `rg -n "registrarCambio\(" app` — el parámetro es opcional.

- [ ] **Step 4: `EmployeeService.update`**

Firma y tres cambios dentro del cuerpo (el resto no se toca):

```ts
  async update(
    currentEmployee: Employee,
    employee: Employee,
    options?: { changedBy?: number; salaryChangeReason?: string | null },
    trx?: TransactionClientContract
  ) {
```

```ts
    currentEmployee.employeeAuthorizeAnyZones = employee.employeeAuthorizeAnyZones
    if (trx) currentEmployee.useTransaction(trx)
    await currentEmployee.save()

    if (Number(salarioAnterior) !== Number(salarioNuevo) && options?.changedBy) {
      const historialService = new EmployeeSalaryHistoryService()
      await historialService.registrarCambio(
        {
          employeeId: currentEmployee.employeeId,
          salaryDaily: salarioNuevo,
          changedBy: options.changedBy,
          reason: options.salaryChangeReason ?? null,
        },
        trx
      )
    }

    await this.updateEmployeeSlug(currentEmployee, trx)
    await currentEmployee.load('businessUnit')
    return currentEmployee
```

- [ ] **Step 5: `UserService.update`**

```ts
  /**
   * @param trx La del llamador (USRH1789698261612): la credencial y su espejo
   * se guardan juntos. El `emit` de logout no se revierte con un rollback: es
   * molesto, no corrupto (declarado en el spec).
   */
  async update(currentUser: User, user: User, trx?: TransactionClientContract) {
    currentUser.userEmail = user.userEmail
    currentUser.userActive = user.userActive
    currentUser.roleId = user.roleId
    currentUser.personId = user.personId
    currentUser.userEmailType = user.userEmailType
    if (trx) currentUser.useTransaction(trx)
    await currentUser.save()
    if (!user.userActive) {
      await ApiToken.query({ client: trx }).where('tokenable_id', currentUser.userId).delete()
      if (Ws.io) {
        Ws.io.emit(`user-forze-logout:${currentUser.userEmail}`, {})
      }
    }
    return currentUser
  }
```

- [ ] **Step 6: `PersonService.update` y `syncBirthdayCalendar`**

Reemplazar el método `update` (`:103-172`) por:

```ts
  /**
   * @param trx La del llamador (USRH1789698261612). Con `trx`, el recálculo del
   * calendario de asistencia NO corre aquí: es dato derivado y recalculable,
   * `SyncAssistsService` no acepta transacción, y lo dispara el llamador con
   * `syncBirthdayCalendar` después del commit.
   */
  async update(currentPerson: Person, person: Person, trx?: TransactionClientContract) {
    const personBirthdayPast = currentPerson.personBirthday
    currentPerson.personFirstname = person.personFirstname
    currentPerson.personLastname = person.personLastname
    currentPerson.personSecondLastname = person.personSecondLastname || ''
    currentPerson.personBirthday = person.personBirthday
    currentPerson.personGender = person.personGender
    // Campos sensibles: null = "no actualizar" — el BO los envía como null cuando
    // los muestra enmascarados y el usuario no los modificó en esa sesión.
    // Solo se sobreescribe si llega un valor concreto (string no nulo).
    if (person.personPhone !== null && person.personPhone !== undefined) {
      currentPerson.personPhone = person.personPhone
    }
    if (person.personPhoneSecondary !== null && person.personPhoneSecondary !== undefined) {
      currentPerson.personPhoneSecondary = person.personPhoneSecondary
    }
    if (person.personEmail !== null && person.personEmail !== undefined) {
      currentPerson.personEmail = person.personEmail
    }
    if (person.personCurp !== null && person.personCurp !== undefined) {
      currentPerson.personCurp = person.personCurp
    }
    if (person.personRfc !== null && person.personRfc !== undefined) {
      currentPerson.personRfc = person.personRfc
    }
    if (person.personImssNss !== null && person.personImssNss !== undefined) {
      currentPerson.personImssNss = person.personImssNss
    }
    currentPerson.personMaritalStatus = person.personMaritalStatus
    currentPerson.personPlaceOfBirthCountry = person.personPlaceOfBirthCountry
    currentPerson.personPlaceOfBirthState = person.personPlaceOfBirthState
    currentPerson.personPlaceOfBirthCity = person.personPlaceOfBirthCity
    if (trx) currentPerson.useTransaction(trx)
    await currentPerson.save()

    await currentPerson.load('employee')
    if (!trx) {
      await this.syncBirthdayCalendar(currentPerson, personBirthdayPast, person.personBirthday)
    }
    return currentPerson
  }

  /**
   * Recalcula el día de cumpleaños en el calendario de asistencia del empleado
   * de la persona (año en curso y, si cambió, la fecha anterior ya vencida).
   * Requiere `currentPerson.employee` cargado.
   */
  async syncBirthdayCalendar(
    currentPerson: Person,
    personBirthdayPast: string | null,
    personBirthdayInput: string | null
  ) {
    if (!currentPerson.employee) return
    if (currentPerson.personBirthday) {
      const birthdayDate = currentPerson.personBirthday
      const date = typeof birthdayDate === 'string' ? new Date(birthdayDate) : birthdayDate

      const currentYear = new Date().getFullYear()
      const month = date.getMonth()
      const day = date.getDate()

      let updatedBirthday = new Date(currentYear, month, day)
      if (updatedBirthday.getMonth() !== month || updatedBirthday.getDate() !== day) {
        updatedBirthday = new Date(currentYear, 1, 28)
      }
      await this.updateAssistCalendar(currentPerson.employee.employeeId, updatedBirthday)
    }
    if (personBirthdayPast) {
      const newPersonBirthdayPast = new Date(personBirthdayPast)
      const datePast = typeof newPersonBirthdayPast === 'string' ? new Date(newPersonBirthdayPast) : newPersonBirthdayPast
      const fixedBirthdayString = personBirthdayInput!.replace('00:000:00', '00:00:00')

      const birthdayISO = DateTime.fromFormat(fixedBirthdayString, 'yyyy-MM-dd HH:mm:ss').toISO()
      const datePastISO = DateTime.fromJSDate(datePast).toISO()

      if (datePastISO !== birthdayISO) {
        const today = new Date()
        const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        if (datePast <= todayAtMidnight) {
          await this.updateAssistCalendar(currentPerson.employee.employeeId, datePast)
        }
      }
    }
  }
```

Es el mismo cuerpo de antes (`:137-169`) movido, con `person.personBirthday` → `personBirthdayInput`. `updateAssistCalendar` y `create` no se tocan.

- [ ] **Step 7: Correr y ver verde, más la regresión de servicios**

```bash
node ace test functional --files="person_user_email_mirror_atomicity" && node ace test unit --files="employee_store_transactional" && npm run typecheck
```

Esperado: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/services/person_service.ts app/services/user_service.ts app/services/employee_service.ts app/services/employee_salary_history_service.ts tests/functional/person_user_email_mirror_atomicity.spec.ts
git commit -m "refactor: Propagar la transacción del llamador en la edición de persona, usuario y empleado"
```

---

### Task 6: `PUT /api/employees/:employeeId` — M6 y unicidad del correo institucional en edición

**Files:**
- Modify: `app/validators/employee.ts:105-127` (`updateEmployeeValidator`)
- Modify: `tests/unit/validators/employee_update_validator.spec.ts` (pasar `meta` en sus 5 llamadas)
- Modify: `app/controllers/employee_controller.ts` — import `db`; `:1771` `meta`; `:1861-1878` transacción + helper; catch `:1888`; swagger del `PUT`
- Modify: `tests/functional/person_user_email_mirror.spec.ts` (grupo M6)

**Interfaces:**
- Consumes: `mirrorEmployeeEmailToUserEmail`, `emailMirrorActorFromContext`, `toPublicEmailMirrorOutcome` (Task 4); `EmployeeService#update(…, trx)` (Task 5); traductores (Task 3); `isUserAccessEmailDuplicatedIndexError`, `respondUserAccessEmailDuplicated` (611).
- Produces: `updateEmployeeValidator` exige `{ meta: { employeeId: number } }`. Respuesta 201 con `data.emailMirror`.

- [ ] **Step 1: Tests de M6 (rojo)**

Agregar a `tests/functional/person_user_email_mirror.spec.ts` (imports nuevos: `createEmployeeFor`, `employeeBody`, `readEmployeeRow`, `assertNoDisclosure` del support):

```ts
test.group('Espejo — PUT /api/employees/:id (M6)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  function putEmployee(client: ApiClient, employee: Employee, overrides: Record<string, unknown>) {
    const w = world!
    return client
      .put(`/api/employees/${employee.employeeId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(employeeBody(employee, overrides))
  }

  test('CA-3 empleado-actualiza-solo-la-credencial-institucional: personal no cambia', async ({ client, assert }) => {
    const w = world!
    const personal = `ca3-p-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, personal)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, `ca3-e-${stamp()}@empresa.com`)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: personal, userEmailType: 'personal' })
    const nuevo = `ca3-nuevo-${stamp()}@empresa.com`

    const response = await putEmployee(client, employee, { employeeBusinessEmail: nuevo })

    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'skipped', reason: 'email-type-mismatch' })
    assert.equal((await readUserRow(user.userId)).user_email, personal)
    assert.equal((await readEmployeeRow(employee.employeeId)).employee_business_email, nuevo)
  })

  test('CA-3 institucional: la credencial toma el valor PERSISTIDO', async ({ client, assert }) => {
    const w = world!
    const viejo = `ca3i-${stamp()}@empresa.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, viejo)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: viejo, userEmailType: 'institutional' })
    const nuevo = `ca3i-nuevo-${stamp()}@empresa.com`

    const response = await putEmployee(client, employee, { employeeBusinessEmail: `  ${nuevo}  ` })

    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'written', target: 'users' })
    const persisted = (await readEmployeeRow(employee.employeeId)).employee_business_email
    assert.equal((await readUserRow(user.userId)).user_email, persisted.trim())
  })

  test('CA-10 sin cuenta de acceso: la omisión se declara (no-live-counterpart)', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, `ca10-${stamp()}@empresa.com`)
    const response = await putEmployee(client, employee, { employeeBusinessEmail: `ca10-n-${stamp()}@empresa.com` })
    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('E8 correo institucional de otro empleado vivo: rechazo de validación y nada cambia', async ({ client, assert }) => {
    const w = world!
    const ocupado = `e8-ocupado-${stamp()}@empresa.com`
    await createEmployeeFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.businessUnit, ocupado)
    const propio = `e8-propio-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.businessUnit, propio)

    const response = await putEmployee(client, employee, { employeeBusinessEmail: ocupado })

    response.assertStatus(400)
    assert.equal((await readEmployeeRow(employee.employeeId)).employee_business_email, propio)
  })

  test('E8 reenviar el mismo correo propio no choca consigo mismo', async ({ client }) => {
    const w = world!
    const propio = `e8-mismo-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.businessUnit, propio)
    const response = await putEmployee(client, employee, { employeeBusinessEmail: propio })
    response.assertStatus(201)
  })

  test('CA-8 correo de otra cuenta viva: 400 USR.MAIL.002, nada cambia y sin divulgación', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca8-${stamp()}@empresa.com`
    const otraPersona = await createPersonIn(w.registry, w.full.businessUnit, null)
    const otro = await createUserFor(w.registry, otraPersona, w.full.role, [w.full.businessUnit], { userEmail: ocupado, userEmailType: 'institutional' })
    const viejo = `ca8-viejo-${stamp()}@empresa.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, viejo)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: viejo, userEmailType: 'institutional' })

    const response = await putEmployee(client, employee, { employeeBusinessEmail: ocupado, employeeFirstName: 'Cambiado' })

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.002')
    assert.equal(response.body().key, 'correo-de-acceso-ya-registrado')
    assertNoDisclosure(assert, response.body(), [ocupado, otro.userId, user.userId, employee.employeeId])
    const row = await readEmployeeRow(employee.employeeId)
    assert.equal(row.employee_business_email, viejo)
    assert.equal(row.employee_first_name, 'Espejo')
    assert.equal((await readUserRow(user.userId)).user_email, viejo)
  })
})
```

Imports adicionales del spec: `import type { ApiClient } from '@japa/api-client'` e `import type Employee from '#models/employee'`.

- [ ] **Step 2: Correr y ver rojo**

```bash
node ace test functional --files="person_user_email_mirror"
```

Esperado: FAIL — hoy M6 escribe sobre la credencial personal, no hay `data.emailMirror`, el `PUT` acepta el correo de otro empleado y el caso CA-8 guarda el empleado.

- [ ] **Step 3: Regla de unicidad en `updateEmployeeValidator`**

`app/validators/employee.ts`, cambiar la apertura y agregar el campo:

```ts
/**
 * `employeeBusinessEmail` se valida también al editar (USRH1789698261612),
 * excluyendo al propio empleado: sin esto el PUT movía el correo institucional
 * a uno que ya usa otro empleado vivo.
 */
export const updateEmployeeValidator = vine.compile(
  vine.withMetaData<{ employeeId: number }>().object({
    employeeSyncId: vine.string().trim().minLength(0).maxLength(50).optional(),
    // … campos existentes sin cambios …
    employeeWorkScheduleHybridConfig: hybridConfigSchema.nullable(),
    employeeBusinessEmail: vine
      .string()
      .trim()
      .minLength(0)
      .maxLength(200)
      .unique(async (_db, value, field) => {
        if (value === '') return true
        const existingEmail = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('employee_business_email', value)
          .whereNot('employee_id', field.meta.employeeId)
          .first()
        return !existingEmail
      })
      .optional(),
  })
)
```

En `tests/unit/validators/employee_update_validator.spec.ts`, cada `updateEmployeeValidator.validate(x)` pasa a `updateEmployeeValidator.validate(x, { meta: { employeeId: 0 } })` (5 llamadas, `:17`, `:24`, `:35`, `:46`, `:47`).

- [ ] **Step 4: Controlador**

Imports nuevos en `app/controllers/employee_controller.ts`:

```ts
import db from '@adonisjs/lucid/services/db'
import {
  emailMirrorActorFromContext,
  mirrorEmployeeEmailToUserEmail,
  toPublicEmailMirrorOutcome,
} from '#helpers/person_user_email_mirror'
import {
  isEmailMirrorConflictError,
  isEmailMirrorRefusedError,
  isUserAccessEmailDuplicatedIndexError,
  respondEmailMirrorConflict,
  respondEmailMirrorRefused,
  respondUserAccessEmailDuplicated,
} from '#helpers/user_access_email_api_error'
```

`:1771`:

```ts
      const data = await request.validateUsing(updateEmployeeValidator, {
        meta: { employeeId: currentEmployee.employeeId },
      })
```

(Verificar que `currentEmployee` ya está resuelto antes de `:1771`; lo está porque `:1803` lo usa. Si no, usar `Number(employeeId)`.)

Reemplazar `:1861-1887` (desde `const previousEmail` hasta el cierre del `if (updateEmployee)`):

```ts
      const actor = emailMirrorActorFromContext(ctx)
      const { updateEmployee, emailMirror } = await db.transaction(async (trx) => {
        const persisted = await employeeService.update(
          currentEmployee,
          employee,
          { changedBy: actor.userId, salaryChangeReason },
          trx
        )
        // El origen es lo PERSISTIDO, no el payload: una sola fuente.
        const outcome = await mirrorEmployeeEmailToUserEmail({
          personId: currentEmployee.personId,
          employeeBusinessEmail: persisted.employeeBusinessEmail,
          actor,
          trx,
        })
        return { updateEmployee: persisted, emailMirror: outcome }
      })

      response.status(201)
      return {
        type: 'success',
        title: 'Employees',
        message: 'The employee was updated successfully',
        data: { employee: updateEmployee, emailMirror: toPublicEmailMirrorOutcome(emailMirror) },
      }
```

Al inicio del `catch` (antes de `if (error instanceof EmployeePositionLevelError)`):

```ts
      if (isEmailMirrorConflictError(error)) return respondEmailMirrorConflict(ctx, error)
      if (isEmailMirrorRefusedError(error)) return respondEmailMirrorRefused(ctx, error)
      if (isUserAccessEmailDuplicatedIndexError(error)) return respondUserAccessEmailDuplicated(ctx)
```

Si `User` queda sin uso en el controlador, lint lo marca: quitar el import solo si `rg -n "\bUser\b" app/controllers/employee_controller.ts` ya no tiene usos.

- [ ] **Step 5: Swagger del `PUT /api/employees/{employeeId}`**

En el bloque `@swagger` de `update` (termina en `:1604`), agregar antes de `default:`:

```ts
   *       '400':
   *         description: >-
   *           Además de los rechazos existentes, responde 400 cuando el correo institucional ya lo usa
   *           otra cuenta de acceso viva (USR.MAIL.002). Ningún campo se guardó.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title: { type: string }
   *                 detail: { type: string }
   *                 key: { type: string, example: correo-de-acceso-ya-registrado }
   *                 code: { type: string, example: USR.MAIL.002 }
   *       '403':
   *         description: La cuenta de acceso del empleado no pertenece a las empresas del actor (USR.MAIL.005). Nada se guardó.
```

Si el bloque ya declara `'400'`, añadir el texto a esa descripción en lugar de duplicar la clave.

- [ ] **Step 6: Correr y ver verde, más regresión de empleados**

```bash
node ace test functional --files="person_user_email_mirror" && node ace test unit --files="employee_update_validator" && node ace test functional --files="employee_edicion_sin_estructura" --files="employees_update_daily_salary_echo" --files="employees_write_permission_gate" --files="employees_sensitive_write_by_category" --files="employees_sensitive_write_guard_http" --files="employees_sensitive_mask_echo_http" && npm run typecheck
```

Esperado: PASS, y los de regresión igual que en la línea base.

- [ ] **Step 7: Commit**

```bash
git add app/validators/employee.ts app/controllers/employee_controller.ts tests/unit/validators/employee_update_validator.spec.ts tests/functional/person_user_email_mirror.spec.ts
git commit -m "fix: Blindar el espejo del correo institucional al editar el empleado"
```

---

### Task 7: `PUT /api/persons/:personId` — M1 (la puerta del expediente)

**Files:**
- Modify: `app/controllers/person_controller.ts` — import `db` y helpers; `:721` borrar `previousEmail`; `:723` valor validado; `:740-760` transacción + helper; catch `:761`; swagger del `PUT`
- Modify: `tests/functional/person_user_email_mirror.spec.ts` (grupo M1)

**Interfaces:**
- Consumes: `mirrorPersonEmailToUserEmail`, `emailMirrorActorFromContext`, `toPublicEmailMirrorOutcome` (Task 4); `PersonService#update(…, trx)` y `#syncBirthdayCalendar` (Task 5); traductores (Task 3).
- Produces: respuesta 201 con `data: { person, emailMirror }`.

- [ ] **Step 1: Tests de M1 (rojo)**

Agregar a `tests/functional/person_user_email_mirror.spec.ts` (imports nuevos del support: `personBody`, `readPersonEmail`, `readPersonFirstname`, `createForeignBusinessUnit`; y `import type Person from '#models/person'`):

```ts
test.group('Espejo — PUT /api/persons/:id (M1)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  function putPerson(client: ApiClient, person: Person, overrides: Record<string, unknown>) {
    const w = world!
    return client
      .put(`/api/persons/${person.personId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(personBody(person, overrides))
  }

  test('CA-1 expediente-actualiza-la-credencial-personal aunque el correo previo sea NULL', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], {
      userEmail: `sin-relacion-${stamp()}@otro.com`,
      userEmailType: 'personal',
    })
    const nuevo = `ca1-${stamp()}@correo.com`

    const response = await putPerson(client, person, { personEmail: nuevo })

    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'written', target: 'users' })
    assert.equal((await readUserRow(user.userId)).user_email, nuevo)
    assert.equal(await readPersonEmail(person.personId), nuevo)
  })

  test('CA-2 expediente-no-toca-la-credencial-institucional', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, `ca2-${stamp()}@correo.com`)
    const acceso = `ca2-acceso-${stamp()}@empresa.com`
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: acceso, userEmailType: 'institutional' })
    const nuevo = `ca2-nuevo-${stamp()}@correo.com`

    const response = await putPerson(client, person, { personEmail: nuevo })

    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'skipped', reason: 'email-type-mismatch' })
    assert.equal((await readUserRow(user.userId)).user_email, acceso)
    assert.equal(await readPersonEmail(person.personId), nuevo)
  })

  test('CA-10 persona sin cuenta: la omisión se declara (no-live-counterpart)', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, `ca10p-${stamp()}@correo.com`)
    const response = await putPerson(client, person, { personEmail: `ca10p-n-${stamp()}@correo.com` })
    response.assertStatus(201)
    assert.deepEqual(response.body().data.emailMirror, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('CA-8 / CA-9 correo de otra cuenta viva: 400 USR.MAIL.002 y la persona NO queda actualizada', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca9-${stamp()}@correo.com`
    const otro = await createUserFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.role, [w.full.businessUnit], {
      userEmail: ocupado,
      userEmailType: 'institutional',
    })
    const viejo = `ca9-viejo-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, viejo)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: viejo, userEmailType: 'personal' })

    const response = await putPerson(client, person, { personEmail: ocupado, personFirstname: 'Cambiado' })

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.002')
    assertNoDisclosure(assert, response.body(), [ocupado, otro.userId, user.userId, person.personId])
    assert.equal(await readPersonEmail(person.personId), viejo)
    assert.equal(await readPersonFirstname(person.personId), 'Espejo')
    assert.equal((await readUserRow(user.userId)).user_email, viejo)
  })

  test('CA-11 [ABUSO] persona de otra empresa: 404 y nada cambia', async ({ client, assert }) => {
    const w = world!
    const victimaEmail = `victima-${stamp()}@correo.com`
    const victima = await createPersonIn(w.registry, w.limited.businessUnit, victimaEmail)
    const cuenta = await createUserFor(w.registry, victima, w.limited.role, [w.limited.businessUnit], {
      userEmail: victimaEmail,
      userEmailType: 'personal',
    })

    const response = await putPerson(client, victima, { personEmail: `atacante-${stamp()}@correo.com` })

    response.assertStatus(404)
    assert.equal((await readUserRow(cuenta.userId)).user_email, victimaEmail)
    assert.equal(await readPersonEmail(victima.personId), victimaEmail)
  })

  test('CA-11 [ABUSO] cuenta de acceso fuera del alcance del actor: 403 USR.MAIL.005 y nada cambia', async ({ client, assert }) => {
    const w = world!
    const foreign = await createForeignBusinessUnit(w.registry)
    const victimaEmail = `victima2-${stamp()}@correo.com`
    const victima = await createPersonIn(w.registry, w.full.businessUnit, victimaEmail)
    const cuenta = await createUserFor(w.registry, victima, w.full.role, [foreign], { userEmail: victimaEmail, userEmailType: 'personal' })

    const response = await putPerson(client, victima, { personEmail: `atacante2-${stamp()}@correo.com` })

    response.assertStatus(403)
    assert.equal(response.body().code, 'USR.MAIL.005')
    assert.isString(response.body().title)
    assert.isString(response.body().detail)
    assert.equal((await readUserRow(cuenta.userId)).user_email, victimaEmail)
    assert.equal(await readPersonEmail(victima.personId), victimaEmail)
  })

  test('CA-14 mas-de-un-usuario-por-persona-falla-cerrado sin decir cuántos ni cuáles', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, `ca14-${stamp()}@correo.com`)
    const a = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: `ca14a-${stamp()}@x.com`, userEmailType: 'personal' })
    const b = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: `ca14b-${stamp()}@x.com`, userEmailType: 'personal' })

    const response = await putPerson(client, person, { personEmail: `ca14-n-${stamp()}@correo.com` })

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.006')
    assertNoDisclosure(assert, response.body(), [a.userId, b.userId, a.userEmail, b.userEmail])
    assert.equal((await readUserRow(a.userId)).user_email, a.userEmail)
    assert.equal((await readUserRow(b.userId)).user_email, b.userEmail)
  })
})
```

- [ ] **Step 2: Correr y ver rojo**

```bash
node ace test functional --files="person_user_email_mirror"
```

Esperado: FAIL — CA-1 no escribe (filtro `previousEmail`), CA-8 guarda la persona, CA-11 fuera de alcance cambia la credencial, CA-14 no rechaza, falta `emailMirror`.

- [ ] **Step 3: Controlador**

Imports nuevos en `app/controllers/person_controller.ts`:

```ts
import db from '@adonisjs/lucid/services/db'
import {
  emailMirrorActorFromContext,
  mirrorPersonEmailToUserEmail,
  toPublicEmailMirrorOutcome,
} from '#helpers/person_user_email_mirror'
import {
  isEmailMirrorConflictError,
  isEmailMirrorRefusedError,
  isUserAccessEmailDuplicatedIndexError,
  respondEmailMirrorConflict,
  respondEmailMirrorRefused,
  respondUserAccessEmailDuplicated,
} from '#helpers/user_access_email_api_error'
```

Borrar `:721` (`const previousEmail = currentPerson.personEmail`). Justo después de `const data = await request.validateUsing(updatePersonValidator)` (`:723`):

```ts
      // B7: se escribe el valor validado (con trim), no el crudo del request.
      person.personEmail = data.personEmail ?? null
```

Reemplazar `:740-760` (desde `const updatePerson = …` hasta el cierre del `if (updatePerson)`):

```ts
      const actor = emailMirrorActorFromContext(ctx)
      const personBirthdayPast = currentPerson.personBirthday
      const { updatePerson, emailMirror } = await db.transaction(async (trx) => {
        const persisted = await personService.update(currentPerson, person, trx)
        const outcome = await mirrorPersonEmailToUserEmail({
          personId: currentPerson.personId,
          personEmail: person.personEmail,
          actor,
          trx,
        })
        return { updatePerson: persisted, emailMirror: outcome }
      })
      await personService.syncBirthdayCalendar(updatePerson, personBirthdayPast, person.personBirthday)
      response.status(201)
      return {
        type: 'success',
        title: 'Persons',
        message: 'The person was updated successfully',
        data: { person: updatePerson, emailMirror: toPublicEmailMirrorOutcome(emailMirror) },
      }
```

Al inicio del `catch`, después de la línea de `isSensitiveDataWriteError`:

```ts
      if (isEmailMirrorConflictError(error)) return respondEmailMirrorConflict(ctx, error)
      if (isEmailMirrorRefusedError(error)) return respondEmailMirrorRefused(ctx, error)
      if (isUserAccessEmailDuplicatedIndexError(error)) return respondUserAccessEmailDuplicated(ctx)
```

Quitar `import User` si queda sin uso (`rg -n "\bUser\b" app/controllers/person_controller.ts`).

**No tocar `start/routes/person_routes.ts`.**

- [ ] **Step 4: Swagger del `PUT /api/persons/{personId}`**

En el bloque `@swagger` de `update`, en la descripción del `'400'` existente agregar: "También responde 400 con `{title, detail, key, code}` cuando el correo ya lo usa otra cuenta de acceso viva (USR.MAIL.002) o la persona tiene más de una cuenta viva (USR.MAIL.006). Ningún campo se guardó." Y agregar a la descripción del `'403'` existente: "O la cuenta de acceso de la persona no pertenece a las empresas del actor (USR.MAIL.005)." En `'201'`, documentar `data.emailMirror` (`status`: `written` | `skipped`; `target` o `reason`).

- [ ] **Step 5: Correr y ver verde, más la regresión de personas**

```bash
node ace test functional --files="person_user_email_mirror" --files="person_identity_company_scope" --files="employees_persona_domicilio_bancos_permission_gate" && npm run typecheck
rg -n "previousEmail" app/controllers/person_controller.ts app/controllers/employee_controller.ts
```

Esperado: PASS; el `rg` no encuentra nada.

- [ ] **Step 6: Commit**

```bash
git add app/controllers/person_controller.ts tests/functional/person_user_email_mirror.spec.ts
git commit -m "fix: Blindar el espejo del correo personal al editar el expediente de la persona"
```

---

### Task 8: `POST /api/users` — M2/M3, tipo efectivo único e imagen previa

**Files:**
- Modify: `app/interfaces/MongoDB/log_user.ts`
- Modify: `app/controllers/user_controller.ts` — imports; función `previousPersonEmailOf`; `store` `:1661-1777`; swagger del `POST` (`:1589-1615`)
- Modify: `tests/functional/person_user_email_mirror_support.ts` (agregar `captureLogStore`)
- Modify: `tests/functional/person_user_email_mirror.spec.ts` (grupo alta; apretar CA-6 a 422)

**Interfaces:**
- Consumes: `mirrorUserEmailToRecord`, `emailMirrorActorFromContext`, `toPublicEmailMirrorOutcome`, `EmailMirrorOutcome` (Task 4); `USER_EMAIL_TYPE_DEFAULT`, `UserEmailTypeValue` (Task 1); `UserService#create(user, ids, trx)` (ya existe).
- Produces: `LogUser.record_previous_person_email?: string`; `previousPersonEmailOf(outcome: EmailMirrorOutcome): string | null` (privada del controlador, la reutiliza la Task 9). Respuesta 201 con `data: { user, emailMirror }`. `E_VALIDATION_ERROR` → **422** en `store` y `update`.

- [ ] **Step 1: Captura del log en el support**

Agregar a `tests/functional/person_user_email_mirror_support.ts`:

```ts
import { LogStore } from '#models/MongoDB/log_store'

export type CapturedLog = { collection: string; payload: Record<string, unknown> }

/** Reemplaza `LogStore.set` durante el caso (mismo molde que employee_store_transactional). */
export function captureLogStore(cleanup: (fn: () => void) => void): CapturedLog[] {
  const original = LogStore.set
  const captured: CapturedLog[] = []
  LogStore.set = async (collectionName: string, logData: Record<string, unknown>) => {
    captured.push({ collection: collectionName, payload: logData })
  }
  cleanup(() => {
    LogStore.set = original
  })
  return captured
}
```

- [ ] **Step 2: Tests del alta (rojo)**

En el grupo CA-6 de la Task 1, cambiar `assert.oneOf(response.status(), [422, 500], …)` por `response.assertStatus(422)` y borrar la nota. Agregar el grupo (imports nuevos: `captureLogStore`, `readEmployeeRow`, `readPersonEmail`):

```ts
test.group('Espejo — POST /api/users (M2/M3)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  function postUser(client: ApiClient, personId: number, userEmail: string, userEmailType?: string) {
    const w = world!
    return client
      .post('/api/users')
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json({
        userEmail,
        userActive: true,
        roleId: w.full.role.roleId,
        personId,
        ...(userEmailType === undefined ? {} : { userEmailType }),
      })
  }

  test('personal: escribe person_email y guarda la imagen previa solo en log_users', async ({ client, assert, cleanup }) => {
    const w = world!
    const logs = captureLogStore(cleanup)
    const anterior = `alta-anterior-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, anterior)
    const nuevo = `alta-nuevo-${stamp()}@correo.com`

    const response = await postUser(client, person.personId, nuevo, 'personal')

    response.assertStatus(201)
    const createdUser = await User.query().where('person_id', person.personId).whereNull('user_deleted_at').firstOrFail()
    w.registry.userIds.push(createdUser.userId)
    assert.deepEqual(response.body().data.emailMirror, { status: 'written', target: 'people' })
    assert.equal(await readPersonEmail(person.personId), nuevo)
    assert.notInclude(JSON.stringify(response.body()), anterior)
    const entry = logs.find((log) => log.collection === 'log_users')
    assert.equal(entry?.payload.record_previous_person_email, anterior)
  })

  test('CA-4 el-correo-personal-no-se-borra: institucional escribe el correo de empresa', async ({ client, assert }) => {
    const w = world!
    const personal = `ca4-p-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, personal)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, `ca4-e-${stamp()}@empresa.com`)
    const nuevo = `ca4-n-${stamp()}@empresa.com`

    const response = await postUser(client, person.personId, nuevo, 'institutional')

    response.assertStatus(201)
    w.registry.userIds.push(response.body().data.user.userId)
    assert.deepEqual(response.body().data.emailMirror, { status: 'written', target: 'employees' })
    assert.equal((await readEmployeeRow(employee.employeeId)).employee_business_email, nuevo)
    assert.equal(await readPersonEmail(person.personId), personal)
  })

  test('sin userEmailType el alta persiste institutional (default de la columna)', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const response = await postUser(client, person.personId, `default-${stamp()}@empresa.com`)
    response.assertStatus(201)
    const userId = response.body().data.user.userId
    w.registry.userIds.push(userId)
    assert.equal((await readUserRow(userId)).user_email_type, 'institutional')
  })

  test('CA-10 omision-explicita-sin-puesto-vivo en el alta institucional', async ({ client, assert }) => {
    const w = world!
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const response = await postUser(client, person.personId, `ca10u-${stamp()}@empresa.com`, 'institutional')
    response.assertStatus(201)
    w.registry.userIds.push(response.body().data.user.userId)
    assert.deepEqual(response.body().data.emailMirror, { status: 'skipped', reason: 'no-live-counterpart' })
  })

  test('CA-8 personal con correo de otra persona: 400 USR.MAIL.003 y no se crea la cuenta', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca8p-${stamp()}@correo.com`
    const duena = await createPersonIn(w.registry, w.full.businessUnit, ocupado)
    const anterior = `ca8p-mio-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, anterior)

    const response = await postUser(client, person.personId, ocupado, 'personal')

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.003')
    assert.equal(response.body().key, 'correo-personal-ya-registrado')
    assertNoDisclosure(assert, response.body(), [ocupado, duena.personId, person.personId])
    assert.isNull(await User.query().where('person_id', person.personId).whereNull('user_deleted_at').first())
    assert.equal(await readPersonEmail(person.personId), anterior)
  })

  test('CA-8 institucional con correo de otro empleado: 400 USR.MAIL.004 y no se crea la cuenta', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca8e-${stamp()}@empresa.com`
    await createEmployeeFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.businessUnit, ocupado)
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const propio = `ca8e-propio-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, propio)

    const response = await postUser(client, person.personId, ocupado, 'institutional')

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.004')
    assert.isNull(await User.query().where('person_id', person.personId).whereNull('user_deleted_at').first())
    assert.equal((await readEmployeeRow(employee.employeeId)).employee_business_email, propio)
  })
})
```

- [ ] **Step 3: Correr y ver rojo**

```bash
node ace test functional --files="person_user_email_mirror"
```

Esperado: FAIL — CA-6 da 500; las altas con conflicto crean la cuenta y pisan el expediente (o lo dejan mudo); no hay `emailMirror` ni `record_previous_person_email`.

- [ ] **Step 4: Interfaz del log**

`app/interfaces/MongoDB/log_user.ts`, dentro de `LogUser`:

```ts
  /**
   * Correo personal del expediente antes de que el espejo lo sobrescribiera
   * (USRH1789698261612, LFPDPPP art. 11). Nunca va a la respuesta ni al logger.
   */
  record_previous_person_email?: string
```

- [ ] **Step 5: Controlador — imports y función de apoyo**

Imports nuevos en `app/controllers/user_controller.ts`:

```ts
import db from '@adonisjs/lucid/services/db'
import { USER_EMAIL_TYPE_DEFAULT, type UserEmailTypeValue } from '#constants/user_email_type'
import {
  emailMirrorActorFromContext,
  mirrorUserEmailToRecord,
  toPublicEmailMirrorOutcome,
  type EmailMirrorOutcome,
} from '#helpers/person_user_email_mirror'
```

y agregar a la importación existente de `#helpers/user_access_email_api_error`: `isEmailMirrorConflictError`, `isEmailMirrorRefusedError`, `respondEmailMirrorConflict`, `respondEmailMirrorRefused`.

Debajo de `assertContactoEmailWriteAllowed` (`:100`):

```ts
/** Correo personal que el espejo sobrescribió, para el registro de auditoría. */
function previousPersonEmailOf(outcome: EmailMirrorOutcome): string | null {
  if (outcome.status !== 'written' || outcome.target !== 'people') return null
  return outcome.previousValue
}
```

- [ ] **Step 6: `store`**

Reemplazar el cuerpo del `try` de `store` desde `const userEmail = …` (`:1664`) hasta el cierre del `if (newUser)` (`:1762`):

```ts
      const userEmail = request.input('userEmail')
      const userActive = request.input('userActive')
      const roleId = request.input('roleId')
      const personId = request.input('personId')

      assertUserAccessEmailNotMasked(userEmail)

      if (personId === undefined || personId === null) {
        response.status(400)
        return {
          title: i18n.t('user_person_required_title'),
          detail: i18n.t('user_person_required_detail'),
          key: 'persona-requerida',
          code: USER_VALIDATION_ERROR_CODES.PERSON_REQUIRED,
        }
      }

      const businessUnits = await BusinessUnit.query()
        .whereIn('business_unit_id', businessUnitScope)
        .where('business_unit_active', 1)
        .whereNull('business_unit_deleted_at')
        .select('business_unit_id')

      const businessUnitIds = businessUnits.map((unit) => unit.businessUnitId)

      const userService = new UserService(i18n)
      const data = await request.validateUsing(createUserValidator)
      // H1: el tipo se resuelve UNA vez y es lo que se persiste; el guard y el
      // destino del espejo leen este mismo valor.
      const userEmailType: UserEmailTypeValue = data.userEmailType ?? USER_EMAIL_TYPE_DEFAULT
      const user = {
        userEmail: data.userEmail,
        userPassword: generateProvisionalPassword(),
        userActive: userActive,
        roleId: roleId,
        personId: data.personId,
        userEmailType,
        userToken: generateInvitationToken(),
        userTokenExpiresAt: buildInvitationTokenExpiresAt(),
        userPasswordSetAt: null,
      } as User
      const exist = await userService.verifyInfoExist(user)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      if (userEmailType === 'personal') {
        const personForGuard = await Person.query()
          .where('person_id', data.personId)
          .whereNull('person_deleted_at')
          .first()
        // Fuera de la transacción: falla rápido antes de escribir nada.
        if (personForGuard) assertContactoEmailWriteAllowed(personForGuard.personEmail, data.userEmail)
      }

      const actor = emailMirrorActorFromContext(ctx)
      const { newUser, emailMirror } = await db.transaction(async (trx) => {
        const created = await userService.create(user, businessUnitIds, trx)
        const outcome = await mirrorUserEmailToRecord({
          personId: created.personId,
          userEmail: created.userEmail,
          userEmailType: created.userEmailType,
          actor,
          trx,
        })
        return { newUser: created, emailMirror: outcome }
      })

      const rawHeaders = request.request.rawHeaders
      const logUser = await userService.createActionLog(rawHeaders, 'store')
      logUser.user_id = actor.userId
      logUser.record_current = JSON.parse(JSON.stringify(newUser))
      const previousPersonEmail = previousPersonEmailOf(emailMirror)
      if (previousPersonEmail) logUser.record_previous_person_email = previousPersonEmail
      await userService.saveActionOnLog(logUser)

      await dispatchUserInvitationEmail(newUser)

      response.status(201)
      return {
        type: 'success',
        title: 'Users',
        message: 'The user was created successfully',
        data: { user: newUser, emailMirror: toPublicEmailMirrorOutcome(emailMirror) },
      }
```

Si `auth` queda sin uso en la desestructuración de `store`, quitarlo.

Catch de `store` queda:

```ts
    } catch (error) {
      if (isSensitiveDataWriteError(error)) return respondSensitiveDataWriteDenial(ctx, error)
      if (isUserAccessEmailMaskedError(error)) return respondUserAccessEmailMasked(ctx, error)
      if (isUserAccessEmailDuplicatedValidationError(error) || isUserAccessEmailDuplicatedIndexError(error)) return respondUserAccessEmailDuplicated(ctx)
      if (isEmailMirrorConflictError(error)) return respondEmailMirrorConflict(ctx, error)
      if (isEmailMirrorRefusedError(error)) return respondEmailMirrorRefused(ctx, error)
      if (error.code === 'E_VALIDATION_ERROR') {
        response.status(422)
        return {
          type: 'validation_error',
          title: 'Validation error',
          message: 'The provided data is invalid',
          error: error.messages?.[0]?.message ?? 'Validation error',
          errors: error.messages,
        }
      }
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
```

(Mismo cuerpo 422 que `person_controller.update`, `:775-784`.)

- [ ] **Step 7: Swagger del `POST /api/users`**

En la descripción del `'400'` (`:1589`), agregar: "También 400 cuando el correo ya lo usa otra persona (USR.MAIL.003, tipo `personal`) u otro empleado vivo (USR.MAIL.004, tipo `institutional`). Ningún campo se guardó." Agregar `'422'`: "Datos inválidos, incluido `userEmailType` fuera de `institutional` | `personal`." En `'201'`, documentar `data.emailMirror`.

- [ ] **Step 8: Correr y ver verde**

```bash
node ace test functional --files="person_user_email_mirror" --files="user_person_required" --files="user_access_email_mask_guard" && npm run typecheck
```

Esperado: PASS. Si `user_person_required` asertaba un 500 para un error de validación, **reportarlo** antes de tocar su aserción: el cambio a 422 es del spec (CA-6) pero cambia su contrato.

- [ ] **Step 9: Commit**

```bash
git add app/interfaces/MongoDB/log_user.ts app/controllers/user_controller.ts tests/functional/person_user_email_mirror_support.ts tests/functional/person_user_email_mirror.spec.ts
git commit -m "fix: Blindar el espejo del correo al dar de alta la cuenta de acceso"
```

---

### Task 9: `PUT /api/users/:userId` — M4/M5 y el riesgo nº1 (tipo conservado)

**Files:**
- Modify: `app/controllers/user_controller.ts` — `update` `:2080-2180`; swagger del `PUT` (`:2008-2034`)
- Modify: `tests/functional/person_user_email_mirror.spec.ts` (grupo edición)

**Interfaces:**
- Consumes: todo lo de la Task 8 más `UserService#update(…, trx)` (Task 5) y `updateUserValidator` con `meta` (Task 1).
- Produces: respuesta 201 con `data: { user, emailMirror }`.

- [ ] **Step 1: Tests de la edición (rojo)**

```ts
test.group('Espejo — PUT /api/users/:id (M4/M5)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  function putUser(client: ApiClient, actor: TenantActor, user: User, overrides: Record<string, unknown>) {
    return client
      .put(`/api/users/${user.userId}`)
      .loginAs(actor.user)
      .headers(businessUnitHeader(actor.businessUnit))
      .json(userBody(user, overrides))
  }

  test('CA-5 edicion-sin-tipo-conserva-el-tipo-guardado y espeja al expediente', async ({ client, assert, cleanup }) => {
    const w = world!
    const logs = captureLogStore(cleanup)
    const anterior = `ca5-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, anterior)
    const empresa = `ca5-e-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, empresa)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: anterior, userEmailType: 'personal' })
    const nuevo = `ca5-nuevo-${stamp()}@correo.com`

    const response = await putUser(client, w.full, user, { userEmail: nuevo })

    response.assertStatus(201)
    const row = await readUserRow(user.userId)
    assert.equal(row.user_email_type, 'personal')
    assert.equal(row.user_email, nuevo)
    assert.equal(await readPersonEmail(person.personId), nuevo)
    assert.equal((await readEmployeeRow(employee.employeeId)).employee_business_email, empresa)
    assert.deepEqual(response.body().data.emailMirror, { status: 'written', target: 'people' })
    assert.equal(logs.find((log) => log.collection === 'log_users')?.payload.record_previous_person_email, anterior)
    assert.notInclude(JSON.stringify(response.body()), anterior)
  })

  test('CA-4 el-correo-personal-no-se-borra al editar una cuenta institucional', async ({ client, assert }) => {
    const w = world!
    const personal = `ca4u-p-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, personal)
    const viejo = `ca4u-e-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, viejo)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: viejo, userEmailType: 'institutional' })
    const nuevo = `ca4u-n-${stamp()}@empresa.com`

    const response = await putUser(client, w.full, user, { userEmail: nuevo, userEmailType: 'institutional' })

    response.assertStatus(201)
    assert.equal((await readEmployeeRow(employee.employeeId)).employee_business_email, nuevo)
    assert.equal(await readPersonEmail(person.personId), personal)
  })

  test('CA-12 [ABUSO] discriminador envenenado "Personal": 422 y nada cambia', async ({ client, assert }) => {
    const w = world!
    const email = `ca12a-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.limited.businessUnit, email)
    const empresa = `ca12a-e-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.limited.businessUnit, empresa)
    const user = await createUserFor(w.registry, person, w.limited.role, [w.limited.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await putUser(client, w.limited, user, { userEmail: `ca12a-n-${stamp()}@correo.com`, userEmailType: 'Personal' })

    response.assertStatus(422)
    const row = await readUserRow(user.userId)
    assert.equal(row.user_email, email)
    assert.equal(row.user_email_type, 'personal')
    assert.equal((await readEmployeeRow(employee.employeeId)).employee_business_email, empresa)
  })

  test('CA-12 [ABUSO] sin el campo y sin permiso de contacto: 403 y nada cambia', async ({ client, assert }) => {
    const w = world!
    const email = `ca12b-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.limited.businessUnit, email)
    const empresa = `ca12b-e-${stamp()}@empresa.com`
    const employee = await createEmployeeFor(w.registry, person, w.limited.businessUnit, empresa)
    const user = await createUserFor(w.registry, person, w.limited.role, [w.limited.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await putUser(client, w.limited, user, { userEmail: `ca12b-n-${stamp()}@correo.com` })

    response.assertStatus(403)
    const row = await readUserRow(user.userId)
    assert.equal(row.user_email, email)
    assert.equal(row.user_email_type, 'personal')
    assert.equal(await readPersonEmail(person.personId), email)
    assert.equal((await readEmployeeRow(employee.employeeId)).employee_business_email, empresa)
  })

  test('CA-8 personal con correo de otra persona: 400 USR.MAIL.003 y la cuenta no cambia', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca8up-${stamp()}@correo.com`
    await createPersonIn(w.registry, w.full.businessUnit, ocupado)
    const email = `ca8up-mio-${stamp()}@correo.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await putUser(client, w.full, user, { userEmail: ocupado, userEmailType: 'personal' })

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.003')
    assert.equal((await readUserRow(user.userId)).user_email, email)
    assert.equal(await readPersonEmail(person.personId), email)
  })

  test('CA-8 institucional con correo de otro empleado: 400 USR.MAIL.004 y la cuenta no cambia', async ({ client, assert }) => {
    const w = world!
    const ocupado = `ca8ue-${stamp()}@empresa.com`
    await createEmployeeFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.businessUnit, ocupado)
    const viejo = `ca8ue-mio-${stamp()}@empresa.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    await createEmployeeFor(w.registry, person, w.full.businessUnit, viejo)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: viejo, userEmailType: 'institutional' })

    const response = await putUser(client, w.full, user, { userEmail: ocupado, userEmailType: 'institutional' })

    response.assertStatus(400)
    assert.equal(response.body().code, 'USR.MAIL.004')
    assert.equal((await readUserRow(user.userId)).user_email, viejo)
  })

  test('repuntar la cuenta a una persona que ya tiene cuenta viva: 422 y no cambia', async ({ client, assert }) => {
    const w = world!
    const otra = await createPersonIn(w.registry, w.full.businessUnit, null)
    await createUserFor(w.registry, otra, w.full.role, [w.full.businessUnit], { userEmail: `otra-${stamp()}@x.com`, userEmailType: 'institutional' })
    const email = `repunte-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'institutional' })

    const response = await putUser(client, w.full, user, { personId: otra.personId })

    response.assertStatus(422)
    assert.equal((await readUserRow(user.userId)).person_id, person.personId)
  })
})
```

Imports nuevos del spec: `import type { TenantActor } from '#tests/helpers/tenant_actor'`.

- [ ] **Step 2: Correr y ver rojo**

```bash
node ace test functional --files="person_user_email_mirror"
```

Esperado: FAIL — CA-5: el tipo pasa a `undefined`/otro valor y el correo se va al empleado; CA-12: el guard se salta; los CA-8 dejan la cuenta cambiada; el repunte pasa.

- [ ] **Step 3: `update`**

Reemplazar el cuerpo del `try` de `update` (`:2083-2165`) por:

```ts
      const currentUser = scopedUser!
      const userId = currentUser.userId
      const userService = new UserService(i18n)

      const userEmail = request.input('userEmail')
      const userActive = request.input('userActive')
      const roleId = request.input('roleId')
      const personId = request.input('personId')

      assertUserAccessEmailNotMasked(userEmail)

      if (personId === undefined || personId === null) {
        response.status(400)
        return {
          title: i18n.t('user_person_required_title'),
          detail: i18n.t('user_person_required_detail'),
          key: 'persona-requerida',
          code: USER_VALIDATION_ERROR_CODES.PERSON_REQUIRED,
        }
      }

      const data = await request.validateUsing(updateUserValidator, {
        meta: { userId, currentPersonId: currentUser.personId },
      })
      // H1 y riesgo nº1: sin el campo se CONSERVA el tipo guardado. Aplicar aquí
      // el default del alta convertiría en silencio cuentas `personal` en
      // `institutional` y mandaría su correo al expediente de empleado.
      const userEmailType: UserEmailTypeValue = data.userEmailType ?? currentUser.userEmailType
      const user = {
        userId: userId,
        userEmail: data.userEmail,
        userActive: userActive,
        roleId: roleId,
        personId: data.personId,
        userEmailType,
      } as User
      const previousUser = JSON.parse(JSON.stringify(currentUser))
      const verifyInfo = await userService.verifyInfo(user)
      if (verifyInfo.status !== 200) {
        return respondUserAccessEmailDuplicated(ctx)
      }
      if (userEmailType === 'personal') {
        const personForGuard = await Person.query()
          .where('person_id', data.personId)
          .whereNull('person_deleted_at')
          .first()
        // Fuera de la transacción: falla rápido antes de escribir nada.
        if (personForGuard) assertContactoEmailWriteAllowed(personForGuard.personEmail, data.userEmail)
      }

      const actor = emailMirrorActorFromContext(ctx)
      const { updateUser, emailMirror } = await db.transaction(async (trx) => {
        const updated = await userService.update(currentUser, user, trx)
        // La credencial ya está escrita; si el espejo falla o el guard del
        // modelo `Person` niega, el rollback la devuelve a como estaba.
        const outcome = await mirrorUserEmailToRecord({
          personId: updated.personId,
          userEmail: updated.userEmail,
          userEmailType: updated.userEmailType,
          actor,
          trx,
        })
        return { updateUser: updated, emailMirror: outcome }
      })

      const rawHeaders = request.request.rawHeaders
      const logUser = await userService.createActionLog(rawHeaders, 'update')
      logUser.user_id = actor.userId
      logUser.record_current = JSON.parse(JSON.stringify(updateUser))
      logUser.record_previous = previousUser
      const previousPersonEmail = previousPersonEmailOf(emailMirror)
      if (previousPersonEmail) logUser.record_previous_person_email = previousPersonEmail
      await userService.saveActionOnLog(logUser)

      response.status(201)
      return {
        type: 'success',
        title: 'Users',
        message: 'The user was updated successfully',
        data: { user: updateUser, emailMirror: toPublicEmailMirrorOutcome(emailMirror) },
      }
```

> Orden de escritura dentro de la transacción: aquí la credencial va primero porque el origen del espejo es la credencial misma. Lo que el spec exige ("credencial al final") aplica a M1 y M6; en M2-M5 lo que la protege es que cualquier falla posterior dentro de la transacción la revierte (CA-13, Task 10).

El catch de `update` queda idéntico al de `store` (Task 8, Step 6). Quitar `auth` de la desestructuración si queda sin uso.

- [ ] **Step 4: Swagger del `PUT /api/users/{userId}`**

Mismas adiciones que en el `POST` (Task 8, Step 7), más en la descripción: "Sin `userEmailType`, se conserva el tipo guardado. `personId` no puede apuntar a una persona con otra cuenta viva ni a una persona fuera de la empresa activa (422)."

- [ ] **Step 5: Correr y ver verde**

```bash
node ace test functional --files="person_user_email_mirror" --files="user_access_email_mask_guard" --files="user_tenant_isolation" && npm run typecheck
rg -n "personForEmailSync" app/controllers/user_controller.ts
```

Esperado: PASS; el `rg` no encuentra nada. `user_tenant_isolation` igual que en la línea base (los 400 nuevos no se adelantan a los 403/404 de alcance: el middleware `userResourceScope` corre antes).

- [ ] **Step 6: Commit**

```bash
git add app/controllers/user_controller.ts tests/functional/person_user_email_mirror.spec.ts
git commit -m "fix: Conservar el tipo de correo guardado y blindar el espejo al editar la cuenta de acceso"
```

---

### Task 10: Igualdad de trato en los seis caminos, atomicidad HTTP y no regresión (CA-7, CA-9, CA-13, CA-15)

**Files:**
- Modify: `tests/functional/person_user_email_mirror.spec.ts` (grupo CA-7)
- Modify: `tests/functional/person_user_email_mirror_atomicity.spec.ts` (grupos HTTP)
- Modify: `tests/functional/user_access_email_mask_guard.spec.ts` (E14)

**Interfaces:** consume todo lo anterior; no produce código de producción. Si algún caso de esta task sale en rojo, el defecto está en la task de su endpoint: se corrige allí, no aquí.

- [ ] **Step 1: CA-15 — el test vivo del espejo (E14)**

Correr primero, sin tocar nada:

```bash
node ace test functional --files="user_access_email_mask_guard"
```

Si el caso 4 está en rojo **y** la causa es que sus personas nacen sin empresa (invisibles con `businessScope`, ver Task 0), corregir **solo el montaje**: `createPerson` recibe la empresa y la marca.

```ts
async function createPerson(emailPrefix: string, email?: string, businessUnitId?: number): Promise<Person> {
  const stamp = await uniqueStamp()
  return Person.create({
    personFirstname: 'AccessEmail',
    personLastname: 'MaskGuard',
    personSecondLastname: emailPrefix,
    personEmail: email ?? `${emailPrefix}-${stamp}@gsti-tests.local`,
    // USRH1789698261609: sin marca la persona es invisible con `businessScope`.
    businessUnitId: businessUnitId ?? null,
  })
}
```

y en `buildFixtures` pasar `tenantBu.businessUnitId` a las personas de la empresa A (`actor`, `personal`, `institutional`, `prepared`) y `foreignBu.businessUnitId` a la ajena. **La aserción del caso 4 (`:461-464`) no se toca.** Si sigue rojo por otra causa, el refactor está mal: volver a la Task 9.

Extender el caso 3 (`:407-435`) para cubrir la otra mitad de la simetría. Después de `const businessEmailBefore = …`:

```ts
    const personEmailBefore = target.person.personEmail
```

y al final del caso:

```ts
    const reloadedPerson = await Person.findOrFail(target.person.personId)
    assert.equal(reloadedPerson.personEmail, personEmailBefore)
```

- [ ] **Step 2: CA-7 — mismo conflicto, mismo cuerpo, mismo efecto en los seis**

Agregar a `tests/functional/person_user_email_mirror.spec.ts`:

```ts
test.group('Espejo — CA-7 igualdad-de-trato-en-los-seis-caminos', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  function as(client: ApiClient, method: 'put' | 'post', url: string, body: Record<string, unknown>) {
    const w = world!
    return client[method](url).loginAs(w.full.user).headers(businessUnitHeader(w.full.businessUnit)).json(body)
  }

  test('M1 y M6 → mismo cuerpo USR.MAIL.002; M2 y M4 → USR.MAIL.003; M3 y M5 → USR.MAIL.004; nada se guarda', async ({ client, assert }) => {
    const w = world!
    const bu = w.full.businessUnit
    const role = w.full.role

    // Correos ocupados, uno por destino.
    const ocupadoCuenta = `ca7-cuenta-${stamp()}@x.com`
    await createUserFor(w.registry, await createPersonIn(w.registry, bu, null), role, [bu], { userEmail: ocupadoCuenta, userEmailType: 'institutional' })
    const ocupadoPersonal = `ca7-personal-${stamp()}@x.com`
    await createPersonIn(w.registry, bu, ocupadoPersonal)
    const ocupadoEmpresa = `ca7-empresa-${stamp()}@x.com`
    await createEmployeeFor(w.registry, await createPersonIn(w.registry, bu, null), bu, ocupadoEmpresa)

    // M1: expediente de una persona con cuenta personal.
    const m1Email = `ca7-m1-${stamp()}@x.com`
    const m1Person = await createPersonIn(w.registry, bu, m1Email)
    const m1User = await createUserFor(w.registry, m1Person, role, [bu], { userEmail: m1Email, userEmailType: 'personal' })
    const m1 = await as(client, 'put', `/api/persons/${m1Person.personId}`, personBody(m1Person, { personEmail: ocupadoCuenta }))

    // M6: empleado con cuenta institucional.
    const m6Email = `ca7-m6-${stamp()}@x.com`
    const m6Person = await createPersonIn(w.registry, bu, null)
    const m6Employee = await createEmployeeFor(w.registry, m6Person, bu, m6Email)
    const m6User = await createUserFor(w.registry, m6Person, role, [bu], { userEmail: m6Email, userEmailType: 'institutional' })
    const m6 = await as(client, 'put', `/api/employees/${m6Employee.employeeId}`, employeeBody(m6Employee, { employeeBusinessEmail: ocupadoCuenta }))

    // M2: alta personal. M3: alta institucional.
    const m2Person = await createPersonIn(w.registry, bu, `ca7-m2-${stamp()}@x.com`)
    const m2 = await as(client, 'post', '/api/users', { userEmail: ocupadoPersonal, userActive: true, roleId: role.roleId, personId: m2Person.personId, userEmailType: 'personal' })
    const m3Person = await createPersonIn(w.registry, bu, null)
    const m3Employee = await createEmployeeFor(w.registry, m3Person, bu, `ca7-m3-${stamp()}@x.com`)
    const m3 = await as(client, 'post', '/api/users', { userEmail: ocupadoEmpresa, userActive: true, roleId: role.roleId, personId: m3Person.personId, userEmailType: 'institutional' })

    // M4: edición personal. M5: edición institucional.
    const m4Email = `ca7-m4-${stamp()}@x.com`
    const m4Person = await createPersonIn(w.registry, bu, m4Email)
    const m4User = await createUserFor(w.registry, m4Person, role, [bu], { userEmail: m4Email, userEmailType: 'personal' })
    const m4 = await as(client, 'put', `/api/users/${m4User.userId}`, userBody(m4User, { userEmail: ocupadoPersonal }))
    const m5Email = `ca7-m5-${stamp()}@x.com`
    const m5Person = await createPersonIn(w.registry, bu, null)
    const m5Employee = await createEmployeeFor(w.registry, m5Person, bu, m5Email)
    const m5User = await createUserFor(w.registry, m5Person, role, [bu], { userEmail: m5Email, userEmailType: 'institutional' })
    const m5 = await as(client, 'put', `/api/users/${m5User.userId}`, userBody(m5User, { userEmail: ocupadoEmpresa }))

    for (const response of [m1, m2, m3, m4, m5, m6]) response.assertStatus(400)
    assert.deepEqual(m1.body(), m6.body())
    assert.equal(m1.body().code, 'USR.MAIL.002')
    assert.deepEqual(m2.body(), m4.body())
    assert.equal(m2.body().code, 'USR.MAIL.003')
    assert.deepEqual(m3.body(), m5.body())
    assert.equal(m3.body().code, 'USR.MAIL.004')

    // Mismo efecto: nada se guardó en ninguno.
    assert.equal(await readPersonEmail(m1Person.personId), m1Email)
    assert.equal((await readUserRow(m1User.userId)).user_email, m1Email)
    assert.equal((await readEmployeeRow(m6Employee.employeeId)).employee_business_email, m6Email)
    assert.equal((await readUserRow(m6User.userId)).user_email, m6Email)
    assert.isNull(await User.query().where('person_id', m2Person.personId).whereNull('user_deleted_at').first())
    assert.isNull(await User.query().where('person_id', m3Person.personId).whereNull('user_deleted_at').first())
    assert.notEqual((await readEmployeeRow(m3Employee.employeeId)).employee_business_email, ocupadoEmpresa)
    assert.equal((await readUserRow(m4User.userId)).user_email, m4Email)
    assert.equal(await readPersonEmail(m4Person.personId), m4Email)
    assert.equal((await readUserRow(m5User.userId)).user_email, m5Email)
    assert.equal((await readEmployeeRow(m5Employee.employeeId)).employee_business_email, m5Email)
  })
})
```

- [ ] **Step 3: CA-9 y CA-13 por HTTP**

Agregar a `tests/functional/person_user_email_mirror_atomicity.spec.ts` (imports nuevos del support: `businessUnitHeader`, `employeeBody`, `personBody`, `readPersonEmail`, `readPersonFirstname`, `userBody`; más `import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'`, `import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'` —confirmar la ruta con `rg -n "export const SENSITIVE_DATA_WRITE_ERROR_CODES" app`—, `mirrorUserEmailToRecord` y `EmailMirrorActor` del helper):

```ts
test.group('Atomicidad — las cuatro entradas (CA-9)', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  test('PUT /api/persons: el conflicto revierte también el nombre', async ({ client, assert }) => {
    const w = world!
    const ocupado = `at-p-${stamp()}@x.com`
    await createUserFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.role, [w.full.businessUnit], { userEmail: ocupado, userEmailType: 'institutional' })
    const email = `at-p-mio-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(personBody(person, { personEmail: ocupado, personFirstname: 'Revertido' }))

    response.assertStatus(400)
    assert.equal(await readPersonEmail(person.personId), email)
    assert.equal(await readPersonFirstname(person.personId), 'Espejo')
  })

  test('POST /api/users: el conflicto no deja cuenta ni pivote', async ({ client, assert }) => {
    const w = world!
    const ocupado = `at-u-${stamp()}@x.com`
    await createPersonIn(w.registry, w.full.businessUnit, ocupado)
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)

    const response = await client
      .post('/api/users')
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json({ userEmail: ocupado, userActive: true, roleId: w.full.role.roleId, personId: person.personId, userEmailType: 'personal' })

    response.assertStatus(400)
    assert.isNull(await User.query().withTrashed().where('person_id', person.personId).first())
  })

  test('PUT /api/users: el conflicto deja la credencial como estaba', async ({ client, assert }) => {
    const w = world!
    const ocupado = `at-uu-${stamp()}@x.com`
    await createPersonIn(w.registry, w.full.businessUnit, ocupado)
    const email = `at-uu-mio-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await client
      .put(`/api/users/${user.userId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(userBody(user, { userEmail: ocupado }))

    response.assertStatus(400)
    assert.equal((await readUserRow(user.userId)).user_email, email)
  })

  test('PUT /api/employees: el conflicto revierte el salario y su historial', async ({ client, assert }) => {
    const w = world!
    const ocupado = `at-e-${stamp()}@x.com`
    await createUserFor(w.registry, await createPersonIn(w.registry, w.full.businessUnit, null), w.full.role, [w.full.businessUnit], { userEmail: ocupado, userEmailType: 'institutional' })
    const email = `at-e-mio-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, null)
    const employee = await createEmployeeFor(w.registry, person, w.full.businessUnit, email)
    await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'institutional' })
    const salaryBefore = (await Employee.findOrFail(employee.employeeId)).dailySalary
    const historyBefore = await countSalaryHistory(employee.employeeId)

    const response = await client
      .put(`/api/employees/${employee.employeeId}`)
      .loginAs(w.full.user)
      .headers(businessUnitHeader(w.full.businessUnit))
      .json(employeeBody(employee, { employeeBusinessEmail: ocupado, dailySalary: 999.5, salaryChangeReason: 'Prueba de atomicidad' }))

    response.assertStatus(400)
    const after = await Employee.findOrFail(employee.employeeId)
    assert.equal(after.employeeBusinessEmail, email)
    assert.equal(after.dailySalary, salaryBefore)
    assert.equal(await countSalaryHistory(employee.employeeId), historyBefore)
  })
})

test.group('Atomicidad — CA-13 el-403-de-dato-sensible-revierte-la-credencial', (group) => {
  group.setup(async () => {
    world = await createMirrorWorld()
  })
  group.teardown(async () => {
    await cleanupMirrorWorld(world)
    world = null
  })

  test('por HTTP: sin permiso de contacto, 403 y el correo de acceso queda como estaba', async ({ client, assert }) => {
    const w = world!
    const email = `ca13-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.limited.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.limited.role, [w.limited.businessUnit], { userEmail: email, userEmailType: 'personal' })

    const response = await client
      .put(`/api/users/${user.userId}`)
      .loginAs(w.limited.user)
      .headers(businessUnitHeader(w.limited.businessUnit))
      .json(userBody(user, { userEmail: `ca13-n-${stamp()}@x.com`, userEmailType: 'personal' }))

    response.assertStatus(403)
    assert.equal((await readUserRow(user.userId)).user_email, email)
  })

  test('una negativa DESPUÉS de escribir la credencial la revierte', async ({ assert }) => {
    const w = world!
    const email = `ca13b-${stamp()}@x.com`
    const person = await createPersonIn(w.registry, w.full.businessUnit, email)
    const user = await createUserFor(w.registry, person, w.full.role, [w.full.businessUnit], { userEmail: email, userEmailType: 'personal' })
    const actor: EmailMirrorActor = { userId: w.full.user.userId, businessUnitScope: [w.full.businessUnit.businessUnitId], i18n: i18nManager.locale('es') }

    await assert.rejects(() =>
      db.transaction(async (trx) => {
        const current = await User.findOrFail(user.userId, { client: trx })
        const nuevo = `ca13b-n-${stamp()}@x.com`
        const updated = await new UserService(i18nManager.locale('es')).update(
          current,
          { userEmail: nuevo, userActive: 1, roleId: user.roleId, personId: user.personId, userEmailType: 'personal' } as User,
          trx
        )
        await mirrorUserEmailToRecord({ personId: updated.personId, userEmail: updated.userEmail, userEmailType: updated.userEmailType, actor, trx })
        // La negativa del guard de `Person` llega aquí en producción.
        throw new SensitiveDataWriteError(SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN, 'contacto')
      })
    )
    assert.equal((await readUserRow(user.userId)).user_email, email)
    assert.equal(await readPersonEmail(person.personId), email)
  })
})
```

- [ ] **Step 4: Correr los tres archivos**

```bash
node ace test functional --files="person_user_email_mirror" --files="person_user_email_mirror_atomicity" --files="user_access_email_mask_guard"
```

Esperado: PASS. Si el caso de salario responde 403 por categoría, confirmar que `FULL_EMPLOYEES_GRANTS` incluye `sensitive-financiero-write` y que el slug existe (`rg -n "sensitive-financiero-write" app/constants/employees_permission_catalog.ts`).

- [ ] **Step 5: Commit**

```bash
git add tests/functional/person_user_email_mirror.spec.ts tests/functional/person_user_email_mirror_atomicity.spec.ts tests/functional/user_access_email_mask_guard.spec.ts
git commit -m "test: Cubrir igualdad de trato, atomicidad y no regresión del espejo de correo"
```

---

### Task 11: Verificación de cierre y reporte

**Files:** ninguno de producción. **No se abre ningún PR** ni se hace push: todo queda en commits locales de la rama.

- [ ] **Step 1: Typecheck y lint limpios**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 2: Greps del DoD**

```bash
rg -n "runUnscoped" app/helpers/person_user_email_mirror.ts
rg -n "previousEmail" app/controllers/person_controller.ts app/controllers/employee_controller.ts app/helpers/person_user_email_mirror.ts
rg -n "personForEmailSync" app/controllers/user_controller.ts
rg -n "personEmailExistsGlobally" app
rg -n "\.first\(\)" app/helpers/person_user_email_mirror.ts
```

Esperado: los tres primeros, cero. `personEmailExistsGlobally`: definida en `person_email_global_uniqueness.ts` y usada en `person_service.ts`, `validators/person.ts` y el helper. `.first()` en el helper: solo en `Person`, `Employee` y en las consultas de unicidad; **nunca** para elegir la credencial.

- [ ] **Step 3: Los 35 specs de personas, usuarios y empleados, y la suite completa**

```bash
rg -l "/api/(persons|users|employees)" tests | sort
node ace test
```

Esperado: todo verde salvo los rojos anotados en la línea base (Task 0), que se listan en el reporte como previos.

- [ ] **Step 4: Reporte de cierre al usuario**

Entregar en el mensaje final de la sesión (no en un PR):
- Resultado del triage de `tsc --noEmit` (Task 1, Step 8).
- Un cuerpo real de cada 400 (002, 003, 004) y del 403 (005) y del 400 (006), mostrando que no llevan correo, ids ni nombre de índice.
- La tabla de drift y las cinco "decisiones de plan" de este documento, para aprobación de Wilvardo.
- La desviación declarada: el `PUT /api/employees` responde **400** (no 422) a la regla de unicidad del correo institucional, porque así traduce hoy ese controlador cualquier `E_VALIDATION_ERROR`.
- El cambio de contrato de `POST`/`PUT /api/users`: `E_VALIDATION_ERROR` pasa de 500 a 422.
- Residuales, sin tocar: `signup_draft_service.complete()` (comprueba el correo al abrir el borrador y no lo revalida dentro de la transacción: TOCTOU en un endpoint público) · `employee_service.ts:298` (código muerto comentado) · `user_service.ts:599` y `:898` (demo, sin llamadores) · `employee_service.ts:874` (escribe `undefined` si el payload omite `employeeBusinessEmail`) · el `Ws.io.emit` de logout no se revierte con un rollback · el importador masivo no espeja (por diseño) · M1/M6 cambian la credencial sin registrar imagen previa del correo de acceso ni cerrar sesiones: es de *Cerrar las consecuencias del cambio de credencial*.
- `[NO VERIFICADO]` que queda para QA de frontend: si las pantallas de personas y empleados pintan `{title, detail, key, code}` o el formato legacy.

- [ ] **Step 5: Mensaje de commit de cierre propuesto al usuario (en inglés)**

```
fix(users): harden person email and access credential mirror

Route all six email mirror paths through a single transactional helper
that resolves the account by person_id, honors the persisted email type,
checks uniqueness and actor scope before writing, and records the
previous personal email in the audit log.
```

---

### Task 12: Manual de prueba manual de API y su bloque de seeder QA (regla `manual-qa-api`)

**Files:**
- Create: `docs/superpowers/plans/2026-09-23-blindar-espejo-correo-credencial-qa-api.md`
- Modify (no versionado): `database/seeders/_tmp_do_not_commit_qa_seeder.ts` — función `seedEspejoCorreoQa()` y su llamada en `run()` después de `await seedRechazoCargaMasivaQa()`.

**Interfaces:**
- Consumes: los contratos finales de las Tasks 3 y 6-9 (cuerpos `{title, detail, key, code}`, `data.emailMirror`, 422 de `POST`/`PUT /api/users`); ayudantes del seeder existentes (`upsertQaUser`, `ensureAlcanceRole`, `grantAlcanceModulePermissions`, `createAlcanceUser`, `createEdicionEmployee`, `resolveQaOrg`, `BUSINESS_UNIT_ID`, `QA_PASSWORD`).
- Produces: playbook que recorre **una persona** con cliente de API. El agente solo siembra, levanta el API y entrega el manual; no lo camina ni lo automatiza (regla `manual-qa-execution`).

**La regla global `~/.cursor/rules/manual-qa-api.mdc` manda en todo, y se sigue al pie de la letra:**
- **Formato y estructura:** salen de la regla. Antes de redactar se relee completa y el manual se escribe sección por sección contra ella.
- **Constantes:** la regla dice "abre **un manual anterior del mismo API** —o el código, si no hay ninguno— y anota la URL base local, el esquema de auth, la forma del envelope de éxito y de error, dónde vive el seeder de QA, y el dominio y contraseña de los usuarios de prueba". Hay manuales anteriores del mismo API, así que esas constantes se toman de ellos, no del código.

Paso previo obligatorio: abrir los dos manuales fuente y reconfirmar cada valor antes de escribir:
- `docs/superpowers/plans/2026-09-23-rechazo-carga-masiva-empresa-distinta-qa-api.md` (el más reciente del API).
- `docs/superpowers/plans/2026-09-22-restaurar-unicidad-credencial-acceso-qa-api.md` (el anterior que prueba `POST`/`PUT /api/users`).

Si ya existe uno más reciente del mismo API al ejecutar esta task, se usa ése.

| Constante que pide la regla | Valor | Manual fuente |
|---|---|---|
| URL base local | `http://127.0.0.1:3333` | `2026-09-23-rechazo-carga-masiva-empresa-distinta-qa-api.md`, línea 11 |
| Esquema de auth | resuelta por el cliente: `Authorization: Bearer <token>`; más `X-Business-Unit-Id: <business_unit_public_id>` en cada petición | mismo manual, líneas 9 y 33-37 |
| Envelope de éxito | `{ "type": "success", "title": "...", "message": "...", "data": { ... } }` | `2026-09-22-restaurar-unicidad-credencial-acceso-qa-api.md`, Escenarios 3 y 4 (mismos endpoints de usuarios) |
| Envelope de error | `{ "title", "detail", "key", "code" }` | mismo manual, Escenario 1 |
| Seeder QA y comando | `node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts` | `2026-09-23-rechazo-carga-masiva-empresa-distinta-qa-api.md`, líneas 16-19 |
| Dominio y contraseña de prueba | `gsti-tests.local` / `password` | mismo manual, tabla de usuarios (línea 25) |

Lo que la regla **no** lista entre las constantes del manual anterior sale del contrato que implementa esta HU:

| Dato | Fuente |
|---|---|
| `title`/`detail` literales de `USR.MAIL.002` a `006` y del rechazo de datos sensibles | `resources/langs/es.json` ya implementado |
| `data.emailMirror` en los éxitos y el 422 de `POST`/`PUT /api/users` | contrato de las Tasks 6-9 |
| Endpoints de consulta para confirmar lo guardado: `GET /api/persons/:personId`, `GET /api/users/:userId` (permiso `users:read`) y `GET /api/employees/:employeeId` (permiso `tab-trabajo-read`) | rutas vivas del API |

La regla permite SQL **solo de preparación o de consulta de ids**. Por eso lo que quedó guardado después de cada escenario se confirma con un endpoint de consulta y su response, nunca con SQL.

- [ ] **Step 1: Bloque del seeder (mismo archivo, no versionado)**

Confirmar primero que los ayudantes siguen con esos nombres:

```bash
rg -n "async function (upsertQaUser|ensureAlcanceRole|grantAlcanceModulePermissions|createAlcanceUser|createEdicionEmployee|resolveQaOrg)" database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Agregar al final del archivo:

```ts
/**
 * USRH1789698261612 — Blindar el espejo entre el correo de la persona y la credencial.
 * Dos actores (A completo, B solo usuarios), una empresa ajena y un juego de
 * personas, colaboradores y cuentas por escenario. Idempotente: cada corrida
 * devuelve correos y tipos a su valor sembrado y da de baja las cuentas que el
 * recorrido creó sobre las personas libres.
 */
const ESPEJO_DOMAIN = 'gsti-tests.local'
const espejoEmail = (slug: string) => `qa-espejo-${slug}@${ESPEJO_DOMAIN}`

async function seedEspejoCorreoQa(): Promise<void> {
  const org = await resolveQaOrg()
  const usersModule = await SystemModule.query().where('system_module_slug', 'users').whereNull('system_module_deleted_at').firstOrFail()
  const employeesModule = await SystemModule.query().where('system_module_slug', 'employees').whereNull('system_module_deleted_at').firstOrFail()

  const fullRole = await ensureAlcanceRole('qa-espejo-completo', 'QA Espejo Completo', BUSINESS_UNIT_ID)
  // `read` y los `*-read`: A confirma con los endpoints de consulta lo que quedó guardado, sin correo enmascarado.
  await grantAlcanceModulePermissions(fullRole.roleId, usersModule.systemModuleId, ['create', 'update', 'read'])
  await grantAlcanceModulePermissions(fullRole.roleId, employeesModule.systemModuleId, [
    'tab-trabajo-read',
    'tab-trabajo-write',
    'tab-persona-write',
    'sensitive-contacto-read',
    'sensitive-contacto-write',
  ])
  const limitedRole = await ensureAlcanceRole('qa-espejo-limitado', 'QA Espejo Limitado', BUSINESS_UNIT_ID)
  await grantAlcanceModulePermissions(limitedRole.roleId, usersModule.systemModuleId, ['create', 'update'])

  await createAlcanceUser(espejoEmail('admin'), 'EspejoAdmin', fullRole.roleId, BUSINESS_UNIT_ID)
  await createAlcanceUser(espejoEmail('limitado'), 'EspejoLimitado', limitedRole.roleId, BUSINESS_UNIT_ID)

  const foreign = await BusinessUnit.firstOrCreate(
    { businessUnitSlug: 'qa-espejo-ajena' },
    { businessUnitName: 'QA Espejo Empresa Ajena', businessUnitLegalName: 'QA Espejo Empresa Ajena SA de CV', businessUnitActive: 1, businessUnitOrigin: 'platform' }
  )

  /** Persona de la empresa A, buscada por nombre en claro; su correo vuelve al sembrado. */
  async function ensurePerson(lastname: string, email: string | null): Promise<Person> {
    let person = await Person.query().withTrashed().where('person_firstname', 'QAEspejo').where('person_lastname', lastname).first()
    if (!person) {
      person = await Person.create({ personFirstname: 'QAEspejo', personLastname: lastname, personSecondLastname: 'QA', personEmail: email, businessUnitId: BUSINESS_UNIT_ID })
    }
    if (person.trashed) await person.restore()
    person.personEmail = email
    person.businessUnitId = BUSINESS_UNIT_ID
    await person.save()
    return person
  }

  /**
   * Cuenta viva `slot` de la persona con correo y tipo sembrados, atada solo a
   * `businessUnitId`. Se busca por persona y posición, no por correo: el
   * recorrido cambia el correo y la siguiente corrida debe encontrar la misma fila.
   */
  async function ensureAccount(person: Person, email: string, type: 'personal' | 'institutional', businessUnitId = BUSINESS_UNIT_ID, slot = 0): Promise<void> {
    const rows = await User.query().withTrashed().where('person_id', person.personId).orderBy('user_id', 'asc')
    let user = rows[slot] ?? null
    if (!user) {
      user = await User.create({ userEmail: email, userPassword: QA_PASSWORD, userActive: 1, roleId: limitedRole.roleId, personId: person.personId, userEmailType: type, userPasswordSetAt: DateTime.utc() })
    }
    if (user.trashed) await user.restore()
    user.userEmail = email
    user.userEmailType = type
    user.userActive = 1
    await user.save()
    await user.related('businessUnits').sync([businessUnitId])
  }

  /** Colaborador de la persona con correo institucional sembrado. */
  async function ensureEmployee(person: Person, code: string, businessEmail: string): Promise<void> {
    let employee = await Employee.query().where('employee_code', code).first()
    if (!employee) {
      employee = await createEdicionEmployee(code, person.personLastname ?? 'Espejo', BUSINESS_UNIT_ID, org.departmentId, org.positionId)
    }
    employee.personId = person.personId
    employee.employeeBusinessEmail = businessEmail
    await employee.save()
  }

  /** Persona libre para las altas: sin cuentas vivas al terminar la corrida. */
  async function ensureFreePerson(lastname: string): Promise<void> {
    const person = await ensurePerson(lastname, espejoEmail(lastname.toLowerCase()))
    const live = await User.query().where('person_id', person.personId)
    for (const user of live) await user.delete()
  }

  // Escenario 1 — expediente con cuenta personal.
  const p1 = await ensurePerson('Personal01', espejoEmail('personal01'))
  await ensureAccount(p1, espejoEmail('personal01'), 'personal')
  // Escenario 2 — expediente con cuenta institucional.
  const p2 = await ensurePerson('Institucional02', espejoEmail('personal02'))
  await ensureAccount(p2, espejoEmail('empresa02'), 'institutional')
  // Escenario 3 — colaborador con cuenta institucional.
  const p3 = await ensurePerson('Colaborador03', null)
  await ensureEmployee(p3, 'QA-ESPEJO-EMP-03', espejoEmail('empresa03'))
  await ensureAccount(p3, espejoEmail('empresa03'), 'institutional')
  // Escenario 4 — cuenta personal editada desde Usuarios.
  const p4 = await ensurePerson('Personal04', espejoEmail('personal04'))
  await ensureAccount(p4, espejoEmail('personal04'), 'personal')
  // Escenario 5 — cuenta institucional editada sin mandar el tipo.
  const p5 = await ensurePerson('Colaborador05', null)
  await ensureEmployee(p5, 'QA-ESPEJO-EMP-05', espejoEmail('empresa05'))
  await ensureAccount(p5, espejoEmail('empresa05'), 'institutional')
  // Ocupantes de los conflictos (Escenarios 7-9).
  const ocupanteCuenta = await ensurePerson('OcupanteCuenta', null)
  await ensureAccount(ocupanteCuenta, espejoEmail('ocupado-cuenta'), 'institutional')
  await ensurePerson('OcupantePersonal', espejoEmail('ocupado-personal'))
  const ocupanteEmpresa = await ensurePerson('OcupanteEmpresa', null)
  await ensureEmployee(ocupanteEmpresa, 'QA-ESPEJO-EMP-OC', espejoEmail('ocupado-empresa'))
  // Escenario 7 — expediente con cuenta personal que choca.
  const p7 = await ensurePerson('Personal07', espejoEmail('personal07'))
  await ensureAccount(p7, espejoEmail('personal07'), 'personal')
  // Escenario 9 — cuenta institucional que choca con otro colaborador.
  const p9 = await ensurePerson('Colaborador09', null)
  await ensureEmployee(p9, 'QA-ESPEJO-EMP-09', espejoEmail('empresa09'))
  await ensureAccount(p9, espejoEmail('empresa09'), 'institutional')
  // Escenario 10 — persona de A cuya cuenta vive solo en la empresa ajena.
  const p10 = await ensurePerson('Fuera10', espejoEmail('fuera10'))
  await ensureAccount(p10, espejoEmail('fuera10'), 'personal', foreign.businessUnitId)
  // Escenario 11 — persona con dos cuentas vivas.
  const p11 = await ensurePerson('Doble11', espejoEmail('doble11-a'))
  await ensureAccount(p11, espejoEmail('doble11-a'), 'personal')
  await ensureAccount(p11, espejoEmail('doble11-b'), 'personal', BUSINESS_UNIT_ID, 1)
  // Escenario 12 — cuenta personal que edita el actor sin permiso de contacto.
  const p12 = await ensurePerson('Personal12', espejoEmail('personal12'))
  await ensureAccount(p12, espejoEmail('personal12'), 'personal')
  // Personas libres para las altas (Escenarios 6 y 8).
  await ensureFreePerson('Libre06')
  await ensureFreePerson('Libre08')
  // Escenario 13 — persona sin cuenta (no hay a quién copiar).
  await ensureFreePerson('SinCuenta13')
  // Escenario 14 — cuenta personal que ya tiene el mismo correo.
  const p14 = await ensurePerson('Sincronizada14', espejoEmail('sincronizada14'))
  await ensureAccount(p14, espejoEmail('sincronizada14'), 'personal')
  // Escenario 15 — cuenta personal cuyo expediente se guarda sin correo.
  const p15 = await ensurePerson('Vacio15', espejoEmail('vacio15'))
  await ensureAccount(p15, espejoEmail('vacio15'), 'personal')

  console.log('[qa-seeder] espejo-correo: actores, empresa ajena y juego de escenarios listos')
}
```

y en `run()`, después de `await seedRechazoCargaMasivaQa()`, agregar `await seedEspejoCorreoQa()`. Si algún ayudante tiene otro nombre, usar el que revele el `rg` y no inventar uno.

- [ ] **Step 2: Correr el seeder contra la BD de desarrollo migrada**

```bash
node ace migration:run && node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Esperado: sin error y la línea `[qa-seeder] espejo-correo: …`. Verificar:

```sql
SELECT u.user_email, u.user_email_type
FROM users u
WHERE u.user_email LIKE 'qa-espejo-%' AND u.user_deleted_at IS NULL
ORDER BY u.user_email;
```

Esperado: `admin`, `limitado`, `personal01`, `empresa02`, `empresa03`, `personal04`, `empresa05`, `ocupado-cuenta`, `personal07`, `empresa09`, `fuera10`, `doble11-a`, `doble11-b`, `personal12`, `sincronizada14`, `vacio15`; ninguna de `libre06`, `libre08` ni `sincuenta13`. Correrlo dos veces seguidas para confirmar que es idempotente.

- [ ] **Step 3: Escribir el manual**

Crear `docs/superpowers/plans/2026-09-23-blindar-espejo-correo-credencial-qa-api.md` siguiendo **exclusivamente** la "Estructura mínima" de `manual-qa-api.mdc`, en este orden y sin secciones extra:

1. Problema / Solución / Ejemplo
2. Preparar (seeder + tabla de usuarios con la variante de cada uno)
3. Un escenario por variante, cada uno con su endpoint y su response exacto
4. Limpieza — **se omite**: ningún escenario enciende un interruptor global (todo queda acotado a la empresa de prueba y a la empresa ajena sembrada).
5. Checklist (una casilla por escenario)

No lleva glosario (esa sección es de la regla de frontend, no de la de API). Los `title`/`detail` de cada response se copian literales de `resources/langs/es.json` ya implementado: si difieren de este plan, manda el código.

**Sección 1 — Problema / Solución / Ejemplo** (dos párrafos + una línea `Ejemplo:` de 2-4 líneas, sin términos de negocio ni técnicos en el ejemplo):
- **Problema:** el correo de la persona y el correo con el que entra al sistema deberían ser el mismo cuando la cuenta es personal, y el correo de trabajo del colaborador cuando la cuenta es institucional. Hoy se copian entre sí por seis caminos distintos, cada uno con reglas propias: unos no copian, otros copian al registro equivocado, otros guardan un correo que ya usa otra persona, y si algo falla a medias queda guardada una mitad sí y otra no.
- **Solución:** los seis caminos siguen la misma regla. La cuenta personal se copia con el correo personal y la institucional con el de trabajo; antes de guardar se revisa que el correo esté libre y que quien edita administre esa cuenta; y las dos mitades se guardan juntas o ninguna.
- `Ejemplo:` es como la credencial de la biblioteca y la ficha del alumno en la dirección: si cambias el correo en una y no en la otra, los avisos llegan a un buzón viejo. Ahora las dos se cambian juntas, y si el correo nuevo ya es de otro alumno no se cambia ninguna.

**Sección 2 — Preparar:** el único comando del seeder, y la tabla (un usuario por variante, `qa-<feature>-<variante>@<dominio>`):

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-espejo-admin@gsti-tests.local` | `password` | Administra usuarios y el expediente del colaborador, con permiso de cambiar datos de contacto |
| **B** | `qa-espejo-limitado@gsti-tests.local` | `password` | Solo administra usuarios; sin permiso de cambiar datos de contacto |

Ids por consulta, nunca escritos a mano:

```sql
SELECT person_id, person_lastname FROM people WHERE person_firstname = 'QAEspejo' ORDER BY person_lastname;
SELECT user_id, user_email, person_id, role_id FROM users WHERE user_email LIKE 'qa-espejo-%' AND user_deleted_at IS NULL ORDER BY user_email;
SELECT employee_id, employee_code, employee_first_name, employee_last_name, employee_second_last_name, company_id, department_id, position_id, employee_type_id, business_unit_id, payroll_business_unit_id
FROM employees WHERE employee_code LIKE 'QA-ESPEJO-EMP-%';
SELECT role_id FROM roles WHERE role_slug = 'qa-espejo-limitado' AND role_deleted_at IS NULL;
SELECT b.business_unit_public_id
FROM business_units b
JOIN business_unit_users bu ON bu.business_unit_id = b.business_unit_id
JOIN users u ON u.user_id = bu.user_id
WHERE u.user_email = 'qa-espejo-admin@gsti-tests.local' AND u.user_deleted_at IS NULL;
```

Una línea de lo que no se puede provocar en el ambiente sembrado (la regla: "se declara en una línea y no se le inventan pasos"): *No se provocan aquí la negativa de datos sensibles que llega después de haber guardado la cuenta, dos ediciones simultáneas del mismo correo ni el reverso del salario cuando el correo de trabajo choca.*

**Sección 3 — Escenarios.** Uno por variante. Cada escenario lleva, en este orden:
- `Usuario:` A o B.
- **Endpoint** (método + ruta) y body JSON completo y pegable, con `"..."` solo en lo que no importa al caso. Las rutas usan los ids resueltos en Preparar, nunca números escritos a mano.
- **Response exacto**: status y cuerpo literales. Nunca "debería fallar".
- Cuando el caso afirma que algo se guardó o no se guardó, una **consulta de confirmación** con su endpoint (`GET /api/persons/:personId`, `GET /api/users/:userId` o `GET /api/employees/:employeeId`, siempre con el usuario A) y su response exacto, con `"..."` en lo que no importa. Nunca SQL: la regla solo permite SQL de preparación o de consulta de ids.
- La lista **Qué significa cada dato**, con las reglas de redundancia de abajo.

| # | Usuario | Endpoint y lo que cambia en el body | Response exacto | Consulta de confirmación |
|---|---|---|---|---|
| 1 | A | `PUT /api/persons/<Personal01>` — `personEmail: qa-espejo-personal01-nuevo@gsti-tests.local` | `201` con `data.emailMirror: { "status": "written", "target": "users" }` | `GET /api/users/<personal01>` → `userEmail` es el nuevo |
| 2 | A | `PUT /api/persons/<Institucional02>` — `personEmail: qa-espejo-personal02-nuevo@gsti-tests.local` | `201` con `data.emailMirror: { "status": "skipped", "reason": "email-type-mismatch" }` | `GET /api/users/<empresa02>` → `userEmail` sigue en `qa-espejo-empresa02@gsti-tests.local` |
| 3 | A | `PUT /api/employees/<QA-ESPEJO-EMP-03>` — `employeeBusinessEmail: qa-espejo-empresa03-nuevo@gsti-tests.local` | `201` con `data.emailMirror: { "status": "written", "target": "users" }` | `GET /api/users/<empresa03>` → `userEmail` es el nuevo |
| 4 | A | `PUT /api/users/<personal04>` — `userEmail: qa-espejo-personal04-nuevo@gsti-tests.local`, `userEmailType: "personal"` | `201` con `data.emailMirror: { "status": "written", "target": "people" }` | `GET /api/persons/<Personal04>` → `personEmail` es el nuevo |
| 5 | A | `PUT /api/users/<empresa05>` — `userEmail: qa-espejo-empresa05-nuevo@gsti-tests.local`, **sin** `userEmailType` | `201` con `data.emailMirror: { "status": "written", "target": "employees" }` | `GET /api/users/<empresa05>` → `userEmailType: "institutional"`; `GET /api/employees/<QA-ESPEJO-EMP-05>` → `employeeBusinessEmail` es el nuevo |
| 6 | A | `POST /api/users` — persona `Libre06`, `userEmailType: "Personal"` | `422` con `{ "type": "validation_error", "title": "Validation error", "message": "The provided data is invalid", "error": "...", "errors": [...] }` | — |
| 7 | A | `PUT /api/persons/<Personal07>` — `personEmail: qa-espejo-ocupado-cuenta@gsti-tests.local`, `personFirstname: "Cambiado"` | `400` con `key: "correo-de-acceso-ya-registrado"`, `code: "USR.MAIL.002"` | `GET /api/persons/<Personal07>` → nombre y correo sin cambio; `GET /api/users/<personal07>` → `userEmail` sin cambio |
| 8 | A | `POST /api/users` — persona `Libre08`, `userEmail: qa-espejo-ocupado-personal@gsti-tests.local`, `userEmailType: "personal"` | `400` con `key: "correo-personal-ya-registrado"`, `code: "USR.MAIL.003"` | — |
| 9 | A | `PUT /api/users/<empresa09>` — `userEmail: qa-espejo-ocupado-empresa@gsti-tests.local`, `userEmailType: "institutional"` | `400` con `key: "correo-institucional-ya-registrado"`, `code: "USR.MAIL.004"` | `GET /api/users/<empresa09>` y `GET /api/employees/<QA-ESPEJO-EMP-09>` → los dos siguen en `qa-espejo-empresa09@gsti-tests.local` |
| 10 | A | `PUT /api/persons/<Fuera10>` — `personEmail: qa-espejo-fuera10-nuevo@gsti-tests.local` | `403` con `key: "cuenta-de-acceso-fuera-de-alcance"`, `code: "USR.MAIL.005"` | `GET /api/persons/<Fuera10>` → `personEmail` sin cambio |
| 11 | A | `PUT /api/persons/<Doble11>` — `personEmail: qa-espejo-doble11-nuevo@gsti-tests.local` | `400` con `key: "cuenta-de-acceso-no-determinada"`, `code: "USR.MAIL.006"` | `GET /api/persons/<Doble11>` → `personEmail` sin cambio |
| 12 | B | `PUT /api/users/<personal12>` — `userEmail: qa-espejo-personal12-nuevo@gsti-tests.local`, `userEmailType: "personal"` | `403` con el cuerpo literal del rechazo de escritura de datos sensibles, categoría contacto (`title`/`detail`/`key`/`code` copiados del código ya implementado) | con A: `GET /api/users/<personal12>` → `userEmail` sin cambio; `GET /api/persons/<Personal12>` → `personEmail` sin cambio |
| 13 | A | `PUT /api/persons/<SinCuenta13>` — `personEmail: qa-espejo-sincuenta13-nuevo@gsti-tests.local` | `201` con `data.emailMirror: { "status": "skipped", "reason": "no-live-counterpart" }` | — |
| 14 | A | `PUT /api/persons/<Sincronizada14>` — mismo `personEmail` que ya tiene, `personFirstname: "Sincronizada"` | `201` con `data.emailMirror: { "status": "skipped", "reason": "already-in-sync" }` | — |
| 15 | A | `PUT /api/persons/<Vacio15>` — `personEmail: null` | `201` con `data.emailMirror: { "status": "skipped", "reason": "source-email-empty" }` | `GET /api/users/<vacio15>` → `userEmail` sigue en `qa-espejo-vacio15@gsti-tests.local` |

Los 400 y 403 del espejo se escriben completos (`title`, `detail`, `key`, `code`); la tabla muestra solo `key` y `code` para abreviar el plan, no el manual.

Bodies completos que se pegan en cada caso (valores tomados de la consulta de ids de Preparar):
- Persona: `personFirstname`, `personLastname`, `personSecondLastname`, `personGender`, `personBirthday`, `personEmail`.
- Colaborador: `employeeCode`, `employeeFirstName`, `employeeLastName`, `employeeSecondLastName`, `companyId`, `departmentId`, `positionId`, `employeeTypeId`, `businessUnitId`, `payrollBusinessUnitId`, `employeeBusinessEmail`, `employeeWorkSchedule: "Onsite"`, `employeeWorkScheduleHybridConfig: null`.
- Cuenta: `userEmail`, `userActive`, `roleId`, `personId` y `userEmailType`, salvo en el Escenario 5.

**Qué significa cada dato** (regla: una lista después del response de cada escenario, en lenguaje llano, sin términos técnicos):
- Cada dato se explica **una sola vez**, en el primer escenario donde aparece:
  - Escenario 1: `type`, `title`, `message`, `data.emailMirror`.
    - `status` con todos sus valores: `written` (sí, el correo se copió al otro lado) o `skipped` (no se copió nada).
    - `target` con todos sus valores: `users` (la cuenta con la que la persona entra al sistema), `people` (el correo personal del expediente) o `employees` (el correo de trabajo del colaborador).
    - Del GET de confirmación, `userEmail`.
  - Escenario 2: `reason` con todos sus valores, en su primera aparición:
    - `email-type-mismatch`: la cuenta es de otro tipo de correo y no le corresponde este.
    - `no-live-counterpart`: no hay una cuenta ni un colaborador activo a quién copiarle.
    - `already-in-sync`: los dos lados ya tenían el mismo correo.
    - `source-email-empty`: el correo se guardó vacío y no hay nada que copiar.
    - Los cuatro se provocan en este manual (Escenarios 2, 13, 14 y 15), así que no hay línea de "no observable".
  - Escenario 4: `personEmail` del GET de confirmación.
  - Escenario 5: `userEmailType` con todos sus valores: `personal` (el correo particular de la persona) o `institutional` (el correo de trabajo que da la empresa). Del GET, `employeeBusinessEmail`.
  - Escenario 6: `type: "validation_error"`, `error` y `errors`.
  - Escenario 7: `title`, `detail`, `key` y `code` del rechazo.
- Escenarios 8 a 12: solo `Qué significa lo nuevo aquí:` con su `key`/`code` nuevo. En el 12, además, el `title`/`detail` propios de ese rechazo.
- Escenarios 3, 13, 14 y 15: sin lista, con `(Los datos son los ya explicados en el Escenario N.)`.

**Sección 5 — Checklist:** 15 casillas, una por escenario. No se agrega nada después.

- [ ] **Step 4: Revisar el manual contra la regla**

Releer `~/.cursor/rules/manual-qa-api.mdc` completa y marcar cada punto contra el manual escrito. La fuente es la regla, no otro manual del repo:

- **Antes de escribir:** cada constante que la regla enumera (URL base, auth, envelopes de éxito y error, seeder, dominio, contraseña) se tomó de un manual anterior del mismo API. La tabla de esta task cita manual y línea.
- **Formato:**
  - Cada escenario tiene endpoint y response exacto; ningún "debería fallar".
  - Los bodies están completos y se pueden pegar, con `"..."` solo en lo irrelevante.
  - El login no se documenta.
  - Solo aparece lo permitido: métodos, rutas, bodies, status, envelopes, códigos, SQL de preparación o de ids, correos y contraseñas.
- **Qué significa cada dato:**
  - Hay una lista después de cada escenario, o la remisión al escenario donde ya se explicó.
  - Está en lenguaje llano, sin tipos ni nombres de columnas.
  - Cada dato se explica una sola vez; lo nuevo va con `Qué significa lo nuevo aquí:`.
- **Valores fijos:** `status`, `target`, `reason` y `userEmailType` tienen todos sus valores enumerados y traducidos en su primera aparición.
- **Alcance:** solo criterios de la HU. Lo no provocable va en una línea, sin pasos inventados.
- **Setup:**
  - Un solo comando del seeder compartido, sin archivo nuevo.
  - Usuarios `qa-espejo-<variante>@gsti-tests.local` con `password`, uno por variante (con y sin permiso de contacto).
  - Los ids de las URLs salen de una consulta SQL; ninguno está escrito a mano, ni siquiera dentro del SQL.
- **Ejemplo cotidiano:** una línea `Ejemplo:` de 2-4 líneas tras Problema/Solución, sin términos de negocio ni técnicos, que no inventa casos.
- **Interruptores globales:** no hay, así que no hay aviso ni Limpieza.
- **Estructura mínima:** las secciones 1, 2, 3 y 5 en ese orden, sin secciones extra (sin glosario ni "Dónde probar").
- **Prohibido:** rutas de archivos, clases, servicios, validadores, middlewares, el lenguaje del backend y cualquier "revisa el código de X". Comprobar con:

```bash
rg -n -i "app/|\.ts\b|service|validator|controller|middleware|helper|guard|typescript|adonis|lucid|glosario|dónde probar" docs/superpowers/plans/2026-09-23-blindar-espejo-correo-credencial-qa-api.md
```

Esperado: cero coincidencias.

- [ ] **Step 5: Levantar el ambiente y entregar el manual (lo recorre una persona)**

```bash
node ace serve --hmr
```

Esperado: API en `http://127.0.0.1:3333` sobre la BD de desarrollo sembrada en el Step 2. Entregar al usuario la ruta del manual y la tabla de usuarios. Si al recorrerlo un `title`/`detail` difiere, **se corrige el manual**, no el código.

- [ ] **Step 6: Commit (solo el manual; el seeder no se versiona)**

```bash
git add docs/superpowers/plans/2026-09-23-blindar-espejo-correo-credencial-qa-api.md
git commit -m "docs: Agregar manual QA de API del espejo de correo y credencial"
```

---

## Self-review (hecho al escribir el plan)

**Cobertura del spec.**

| Criterio | Dónde |
|---|---|
| CA-1 | Task 7 (N5) |
| CA-2 | Task 7 (N5) + Task 4 (N4) |
| CA-3 | Task 6 (N5) + Task 4 (N4) |
| CA-4 | Task 8 y 9 (N5) + Task 4 (N4); imagen previa en Task 8 y 9 |
| CA-5 | Task 9 (N5) |
| CA-6 | Task 1 (N5), apretado a 422 en Task 8 |
| CA-7 | Task 10 (N5) |
| CA-8 | Tasks 6, 7, 8, 9 (N5) con `assertNoDisclosure` |
| CA-9 | Task 7 (N5) + Task 10 (N6, las cuatro entradas, salario incluido) + Task 5 (servicios) |
| CA-10 | Tasks 6, 7, 8 (N5) + Task 4 (N4) |
| CA-11 | Task 7 (N5, las dos variantes) + Task 4 (N4) |
| CA-12 | Task 9 (N5, las dos variantes) |
| CA-13 | Task 10 (N6, HTTP + negativa forzada después de escribir) |
| CA-14 | Task 7 (N5) + Task 4 (N4) |
| CA-15 | Task 10 (E14) |
| Regla 9 / `vine.enum` + `personId` | Task 1 |
| `updateEmployeeValidator` + `meta` | Task 6 |
| `registrarCambio` / `updateAssistCalendar` | Task 5 |
| i18n es/en | Task 3 |
| Swagger ×4 | Tasks 6, 7, 8, 9 |
| DoD greps, suite, evidencia, residuales | Task 11 |
| Manual QA de API + seeder, formato 100% de la regla global `manual-qa-api` (CA-1 a CA-6, CA-8, CA-9, CA-10, CA-11, CA-12, CA-14 recorribles en 15 escenarios; CA-13 tardío y concurrencia declarados no observables) | Task 12 |

**Placeholders:** ninguno. Los dos puntos que dependen de lo que encuentre el implementador (accesor de `meta` en VineJS y montaje del caso 4) tienen el comando de verificación y la acción exacta para cada resultado.

**Consistencia de tipos:** `EmailMirrorTarget` sale de la excepción y el helper lo re-exporta; `EmailMirrorOutcome.previousValue` lo lee solo `previousPersonEmailOf` (Tasks 8-9); `EmailMirrorActor` lleva `i18n` porque `findActiveInBusinessUnitScope` es de instancia; las firmas de servicio de la Task 5 son las que llaman las Tasks 6-9 y 10.
