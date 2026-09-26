# Lectura sensible por categoría — Plan de pruebas E2E Japa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar el e2e API con Japa de USRH1787204602825: el recorrido real de autenticación (`POST /api/auth/login` + Bearer), las categorías que el functional no cruzó, y las cuatro superficies que montan `sensitiveAccess` sin `businessScope`.

**Architecture:** No Playwright ni `@japa/browser-client`. En este repo e2e Japa = HTTP contra el servidor que ya arranca `testUtils.httpServer()` (el bootstrap ya contempla el nombre de suite `e2e`). Se añade la suite `tests/e2e/` en `adonisrc.ts`. Los fixtures se reutilizan de `tests/functional/employees/sensitive_read_by_category_support.ts` (token ≤25, `payroll_business_unit_id`, `Model.create()`). El functional existente **no se reescribe**: cubre CA-1–CA-4, CA-6 con `loginAs`, CA-8 y tenant. Este plan cubre lo que ese archivo no pega.

**Tech Stack:** AdonisJS 6, Japa (`@japa/runner` + `@japa/api-client`), `POST /api/auth/login`, Bearer, `maskSensitiveValue`.

## Global Constraints

- Historia: USRH1787204602825 · orden 30. Spec: `spec-USRH1787204602825.md`. Functional ya verde: `tests/functional/employees/employees_sensitive_read_by_category.spec.ts`.
- Rebanada **solo API**. Cero Playwright, cero `valanserh-bo`, cero `@japa/browser-client` como dependencia directa.
- Las 11 columnas `maskedInApi: true`. Las 15 de orden 31 fuera. `sensitive-biometrico-read` no destapa ninguna de las 11.
- **No se enciende** `system_module_permission_enforcement_active` de `employees`. Tras cada grupo queda `false`.
- Fail-closed. Nunca 403/`PERM.DENIED` por faltar una categoría. Bypass `standard`: `root`/`owner` claros; `super-administrador` necesita el slug.
- No tocar `pii_reveal_routes.ts` ni escribir bitácora de revelado.
- Fixtures ya aprendidos (no repetir el plan QA original):
  - `employee_second_last_name` es VARCHAR(25): `searchToken.slice(0, 25)`.
  - El index exige `payroll_business_unit_id` (el middleware lo inyecta).
  - Bancos y médica con `Model.create()` para el `prepare` de cifrado.
- Login real: limiter 5/15 min por correo → emails únicos (`@gsti-tests.local`). Activar con `userPasswordSetAt = DateTime.utc()`. `deviceOrigin: 'web'`. Token en `body.data.token` (string).
- **No usar `grantOnly` sobre roles de sistema** (`owner`/`root`/`super-administrador`): borra todas las concesiones de Empleados. Usar `grantAdditionally` / `revokeSlugs`.
- Oráculo: `maskSensitiveValue`, no literales `•`.
- TDD de caracterización: el producto existe. El test nuevo debe pasar. Si falla, bug de producto; no se relaja.
- Código/docs en español; identificadores en inglés. Commits: tipo inglés, descripción en español.

## Ya cubierto (no duplicar)

`tests/functional/employees/employees_sensitive_read_by_category.spec.ts` (12 tests, endurecidos):

| Escenario | Estado |
|-----------|--------|
| CA-4 once tapadas + never 403 en ficha/banco/médica | Functional |
| Biométrico no destapa las 11 + never 403 en las 3 superficies | Functional (hueco never-denied cerrado) |
| CA-1 solo contacto | Functional |
| CA-2 owner / root claros; DG sin slugs tapado | Functional |
| CA-3 salud + bitácora + never 403 en las 3 | Functional (hueco never-denied cerrado) |
| CA-6 sesión con `loginAs` + restore de la persona del actor | Functional (restore aplicado) |
| Persons **con** contacto | Functional |
| CA-8 lookups constantes + email del listado en claro / CURP tapado | Functional (aserción de contenido aplicada) |
| Tenant 404 y el JSON no contiene email/CURP claros | Functional (inspección de body aplicada) |
| CA-5 seeder 0058 dos veces | Unit `0058_sensitive_read_grants_backfill_seeder.spec.ts` |

## Huecos que este plan cierra

| # | Escenario | Por qué e2e |
|---|-----------|-------------|
| E.1 | `POST /api/auth/login` tapa Person aunque haya `sensitive-contacto-read` | `login_routes` no monta ALS; `loginAs` no serializa ese cuerpo |
| E.2 | Sesión y ficha con Bearer del login, no `loginAs` | Recorrido real |
| E.3 | Solo `sensitive-identificacion-read` | Inverso de CA-1 |
| E.4 | Solo `sensitive-financiero-read` | Bancos claros; persona/salud tapados |
| E.5 | Las cinco lecturas → 11 claros | Grant completo |
| E.6 | DG **con** los cinco slugs → 11 claros (`granted`, no bypass) | Complemento de CA-2 |
| E.7 | `GET /api/persons/:id` **sin** grant → tapado | Functional solo prueba el caso con grant |
| E.8 | `GET /api/customers/:id` (ALS dedicado) | Montaje sin `businessScope` |
| E.9 | `GET /api/pilots/:id` → `pilot.employee.person` | Idem |
| E.10 | `GET /api/flight-attendants/:id` → `flightAttendant.employee.person` | Idem |
| E.11 | `GET /api/employees/:id/banks` | Lista anidada, no el show por PK |
| E.12 | GET ficha sin Authorization → 401, sin PII en claro | CA-7 aproximado (unresolved/no sesión) |

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `adonisrc.ts` | Suite `e2e` → `tests/e2e/**/*.spec.ts`, timeout 30000. |
| `tests/functional/employees/sensitive_read_by_category_support.ts` | Añadir `activateUser`, `loginWeb`, `bearerFromLogin`, `grantAdditionally`, `revokeSlugs`, extractores customer/pilot/FA. |
| `tests/e2e/sensitive_read_by_category.spec.ts` | Recorridos E.1–E.12. Un grupo, interruptor OFF. |
| `tests/functional/employees/employees_sensitive_read_by_category.spec.ts` | No reescribir. Los endurecimientos de never-denied / restore / listado / tenant ya están aplicados en working tree. |

---

### Task 1: Suite e2e y helpers de login real

**Files:**
- Modify: `adonisrc.ts` (bloque `tests.suites`, tras `functional`)
- Modify: `tests/functional/employees/sensitive_read_by_category_support.ts` (tras `TEST_PASSWORD` y tras `grantOnly`)
- Test: `tests/e2e/sensitive_read_by_category.spec.ts` (humo login 200)

**Interfaces:**
- Consumes: `createActor`, `TEST_PASSWORD`, `cleanupActor`, `grantOnly`
- Produces:
  - `activateUser(user: User): Promise<void>`
  - `loginWeb(client: ApiClient, email: string, password: string)`
  - `bearerFromLogin(body: Record<string, unknown>): string`
  - `grantAdditionally(roleId: number, slugs: string[]): Promise<void>`
  - `revokeSlugs(roleId: number, slugs: string[]): Promise<void>`

- [ ] **Step 1: Register the e2e suite**

En `adonisrc.ts`, dentro de `tests.suites`, después del bloque `functional`:

```typescript
      {
        files: ['tests/e2e/**/*.spec(.ts|.js)'],
        name: 'e2e',
        timeout: 30000,
      },
```

`tests/bootstrap.ts` ya hace `if (['browser', 'functional', 'e2e'].includes(suite.name))` → arranca HTTP. No tocarlo.

- [ ] **Step 2: Add helpers to support**

Imports extra al support:

```typescript
import { DateTime } from 'luxon'
import type { ApiClient } from '@japa/api-client'
```

Tras `TEST_PASSWORD`:

```typescript
export async function activateUser(user: User) {
  user.userPasswordSetAt = DateTime.utc()
  await user.save()
}

export async function loginWeb(
  client: ApiClient,
  email: string,
  password: string = TEST_PASSWORD
) {
  return client.post('/api/auth/login').json({
    userEmail: email,
    userPassword: password,
    deviceOrigin: 'web',
  })
}

export function bearerFromLogin(body: Record<string, unknown>): string {
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const token = data.token
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Login e2e: data.token no es un string.')
  }
  return token
}
```

Tras `grantOnly`:

```typescript
export async function grantAdditionally(roleId: number, permissionSlugs: string[]) {
  for (const slug of permissionSlugs) {
    const systemPermissionId = await permissionId(slug)
    await RoleSystemPermission.firstOrCreate(
      { roleId, systemPermissionId },
      { roleId, systemPermissionId }
    )
  }
}

export async function revokeSlugs(roleId: number, permissionSlugs: string[]) {
  const ids = await Promise.all(permissionSlugs.map((slug) => permissionId(slug)))
  await RoleSystemPermission.query()
    .where('role_id', roleId)
    .whereIn('system_permission_id', ids)
    .delete()
}
```

Extractores (junto a `personShowBody`):

```typescript
export function loginUserPerson(body: Record<string, unknown>) {
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const user =
    data.user && typeof data.user === 'object'
      ? (data.user as Record<string, unknown>)
      : {}
  return user.person && typeof user.person === 'object'
    ? (user.person as Record<string, unknown>)
    : {}
}

export function customerPerson(body: Record<string, unknown>) {
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const customer =
    data.customer && typeof data.customer === 'object'
      ? (data.customer as Record<string, unknown>)
      : {}
  return customer.person && typeof customer.person === 'object'
    ? (customer.person as Record<string, unknown>)
    : {}
}

export function nestedEmployeePerson(
  body: Record<string, unknown>,
  rootKey: 'pilot' | 'flightAttendant'
) {
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const root =
    data[rootKey] && typeof data[rootKey] === 'object'
      ? (data[rootKey] as Record<string, unknown>)
      : {}
  const employee =
    root.employee && typeof root.employee === 'object'
      ? (root.employee as Record<string, unknown>)
      : {}
  return employee.person && typeof employee.person === 'object'
    ? (employee.person as Record<string, unknown>)
    : {}
}

export function nestedBanks(body: Record<string, unknown>): Record<string, unknown>[] {
  const data =
    body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>)
      : {}
  const rows = data.data
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}
```

- [ ] **Step 3: Write the smoke e2e spec**

Crear `tests/e2e/sensitive_read_by_category.spec.ts`:

```typescript
import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import {
  TEST_PASSWORD,
  activateUser,
  bearerFromLogin,
  buHeader,
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  grantOnly,
  loginWeb,
  type SensitiveFixture,
  type TenantActor,
} from '../functional/employees/sensitive_read_by_category_support.js'

test.group('Lectura sensible por categoría — E2E Japa', (group) => {
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
    actor = await createActor('sens-e2e')
    await activateUser(actor.user)
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'e2e')
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

  test('humo: POST /api/auth/login con cuenta activada responde 200 y token string', async ({
    client,
    assert,
  }) => {
    const response = await loginWeb(client, actor!.user.userEmail, TEST_PASSWORD)
    assert.equal(response.status(), 200)
    const token = bearerFromLogin(response.body())
    assert.isAbove(token.length, 10)
  })
})
```

- [ ] **Step 4: Run smoke**

Run: `node ace test --files tests/e2e/sensitive_read_by_category.spec.ts`

Expected: PASS. Si status 4xx de activación pendiente, `activateUser` no persistió `userPasswordSetAt`. Si 429, el email no es único. Si `data.token` es objeto, ajustar `bearerFromLogin` **solo** para leer el string real (`token.value` no aplica: `issueTokenPair` ya hace `.release()`).

- [ ] **Step 5: Commit**

```bash
git add adonisrc.ts tests/functional/employees/sensitive_read_by_category_support.ts tests/e2e/sensitive_read_by_category.spec.ts
git commit -m "test: Registrar suite e2e Japa de lectura sensible"
```

---

### Task 2: E.1 / E.2 — Login real tapa PII; Bearer abre ficha

**Files:**
- Modify: `tests/e2e/sensitive_read_by_category.spec.ts`

**Interfaces:**
- Consumes: `loginWeb`, `bearerFromLogin`, `loginUserPerson`, `grantOnly`, `employeePerson`, `expectNeverDenied`, `maskSensitiveValue`
- Produces: E.1 y E.2

- [ ] **Step 1: Write login + bearer tests**

```typescript
import { maskSensitiveValue } from '#helpers/sensitive_mask'
import {
  expectNeverDenied,
  employeePerson,
  loginUserPerson,
} from '../functional/employees/sensitive_read_by_category_support.js'

  test('E.1 CA-6: POST /api/auth/login tapa el correo del actor aunque tenga contacto', async ({
    client,
    assert,
  }) => {
    const actorEmail = `e2e-login-${Date.now()}@empresa.com`
    actor!.person.personEmail = actorEmail
    actor!.person.personPhone = fixture!.clear.phone
    await actor!.person.save()
    actor!.user.userEmail = actorEmail
    await actor!.user.save()
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
    const response = await loginWeb(client, actorEmail, TEST_PASSWORD)
    expectNeverDenied(response, assert)
    const person = loginUserPerson(response.body())
    assert.equal(person.personEmail, maskSensitiveValue(actorEmail, 'contacto'))
    assert.equal(person.personPhone, maskSensitiveValue(fixture!.clear.phone, 'contacto'))
    assert.notEqual(person.personEmail, actorEmail)
  })

  test('E.2: ficha con Bearer del login y contacto destapa email del colaborador', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
    const login = await loginWeb(client, actor!.user.userEmail, TEST_PASSWORD)
    expectNeverDenied(login, assert)
    const token = bearerFromLogin(login.body())
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .header('Authorization', `Bearer ${token}`)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    const person = employeePerson(response.body())
    assert.equal(person.personEmail, fixture!.clear.email)
    assert.equal(
      person.personCurp,
      maskSensitiveValue(fixture!.clear.curp, 'identificacion')
    )
  })
```

E.1 cambia `userEmail` del actor: los tests siguientes deben usar `actor!.user.userEmail` recargado. Orden: E.2 **antes** de E.1, o E.1 restaura email en `finally`:

```typescript
    const originalPersonEmail = actor!.person.personEmail
    const originalUserEmail = actor!.user.userEmail
    // ... mutate, login, assert ...
    finally {
      actor!.person.personEmail = originalPersonEmail
      await actor!.person.save()
      actor!.user.userEmail = originalUserEmail
      await actor!.user.save()
    }
```

Poner E.1 con ese `finally`. E.2 no muta el email de login.

- [ ] **Step 2: Run**

Run: `node ace test --files tests/e2e/sensitive_read_by_category.spec.ts`

Expected: PASS. Si el login serializa el correo en claro, `login_routes` no debe ganar `sensitiveAccess` en esta HU (fail-closed declarado). Parar y reportar BLOCKED de producto solo si el spec de la HU cambió; el contrato actual es tapado.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sensitive_read_by_category.spec.ts
git commit -m "test: Cubrir login real fail-closed y ficha con Bearer"
```

---

### Task 3: E.3 / E.4 / E.5 / E.6 — Categorías restantes y DG con slugs

**Files:**
- Modify: `tests/e2e/sensitive_read_by_category.spec.ts`

**Interfaces:**
- Consumes: `getThreeSurfaces` no existe en e2e; duplicar helper local con `loginAs` (el Bearer de E.2 ya demostró el recorrido; aquí basta `.loginAs` + grants). `createSystemActor`, `grantAdditionally`, `revokeSlugs`, `expectPersonIdentificacionClear`, `expectPersonContactoMasked`, `expectBankClear`, `expectElevenClear`
- Produces: E.3–E.6

- [ ] **Step 1: Add local getThreeSurfaces (loginAs)**

Al inicio del spec e2e, el mismo helper que el functional (client + actor + fixture → ficha/banco/médica). Copiar el cuerpo de `getThreeSurfaces` de `employees_sensitive_read_by_category.spec.ts` (líneas del helper, no “similar”).

```typescript
import type { ApiClient } from '@japa/api-client'
import {
  employeeBankBody,
  employeePerson,
  expectBankClear,
  expectBankMasked,
  expectElevenClear,
  expectMedicalMasked,
  expectNeverDenied,
  expectPersonContactoMasked,
  expectPersonIdentificacionClear,
  expectPersonIdentificacionMasked,
  medicalConditionBody,
  createSystemActor,
  cleanupSystemActor,
  grantAdditionally,
  revokeSlugs,
} from '../functional/employees/sensitive_read_by_category_support.js'

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

const FIVE_READS = [
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read',
] as const
```

Tests:

```typescript
  test('E.3: solo sensitive-identificacion-read destapa CURP/RFC/NSS; contacto y bancos tapados', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-identificacion-read'])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(employeeRes, assert)
    expectNeverDenied(bankRes, assert)
    expectNeverDenied(medicalRes, assert)
    const person = employeePerson(employeeRes.body())
    expectPersonIdentificacionClear(person, fixture!.clear, assert)
    expectPersonContactoMasked(person, fixture!.clear, assert)
    expectBankMasked(employeeBankBody(bankRes.body()), fixture!.clear, assert)
    expectMedicalMasked(medicalConditionBody(medicalRes.body()), fixture!.clear, assert)
  })

  test('E.4: solo sensitive-financiero-read destapa CLABE/cuenta/tarjeta; persona tapada', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-financiero-read'])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
      fixture!
    )
    expectNeverDenied(bankRes, assert)
    expectBankClear(employeeBankBody(bankRes.body()), fixture!.clear, assert)
    expectPersonContactoMasked(employeePerson(employeeRes.body()), fixture!.clear, assert)
    expectPersonIdentificacionMasked(
      employeePerson(employeeRes.body()),
      fixture!.clear,
      assert
    )
    expectMedicalMasked(medicalConditionBody(medicalRes.body()), fixture!.clear, assert)
  })

  test('E.5: las cinco lecturas entregan las 11 en claro', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [...FIVE_READS])
    const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
      client,
      actor!,
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
  })

  test('E.6: super-administrador con las cinco lecturas recibe las 11 en claro', async ({
    client,
    assert,
  }) => {
    const dg = await createSystemActor(
      'super-administrador',
      'sens-e2e-dg',
      actor!.businessUnit.businessUnitId
    )
    await grantAdditionally(dg.roleId, [...FIVE_READS])
    try {
      const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
        client,
        { ...actor!, user: dg.user },
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
      await revokeSlugs(dg.roleId, [...FIVE_READS])
      await cleanupSystemActor(dg)
    }
  })
```

- [ ] **Step 2: Run**

Run: `node ace test --files tests/e2e/sensitive_read_by_category.spec.ts`

Expected: PASS. Si E.6 tapa, `grantAdditionally` no persistió o DG no está attached a la BU.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sensitive_read_by_category.spec.ts tests/functional/employees/sensitive_read_by_category_support.ts
git commit -m "test: Cubrir lecturas por categoría restante y DG con slugs"
```

---

### Task 4: E.7–E.11 — Persons sin grant, customers, pilots, FA, bancos anidados

**Files:**
- Modify: `tests/e2e/sensitive_read_by_category.spec.ts`
- Modify: `tests/functional/employees/sensitive_read_by_category_support.ts` (cleanup de customer/pilot/FA si se crean en el test: borrar en `finally` del propio test)

**Interfaces:**
- Consumes: `Customer`, `Pilot`, `FlightAttendant`, `personShowBody`, `customerPerson`, `nestedEmployeePerson`, `nestedBanks`, `randomUUID`
- Produces: E.7–E.11

- [ ] **Step 1: Write surface tests**

```typescript
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import Customer from '#models/customer'
import Pilot from '#models/pilot'
import FlightAttendant from '#models/flight_attendant'
import {
  customerPerson,
  nestedBanks,
  nestedEmployeePerson,
  personShowBody,
  expectContactoClearIdentificacionMasked,
} from '../functional/employees/sensitive_read_by_category_support.js'

  test('E.7: GET /api/persons/:id sin lecturas sensibles tapa correo y CURP', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, [])
    const response = await client
      .get(`/api/persons/${fixture!.person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    const person = personShowBody(response.body())
    assert.equal(person.personEmail, maskSensitiveValue(fixture!.clear.email, 'contacto'))
    assert.equal(
      person.personCurp,
      maskSensitiveValue(fixture!.clear.curp, 'identificacion')
    )
  })

  test('E.8: GET /api/customers/:id con contacto destapa email; sin identificación', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
    const customer = await Customer.create({
      customerUuid: randomUUID(),
      personId: fixture!.person.personId,
    })
    try {
      const response = await client
        .get(`/api/customers/${customer.customerId}`)
        .loginAs(actor!.user)
      expectNeverDenied(response, assert)
      expectContactoClearIdentificacionMasked(
        customerPerson(response.body()),
        fixture!.clear,
        assert
      )
    } finally {
      await Customer.query().where('customer_id', customer.customerId).delete()
    }
  })

  test('E.9: GET /api/pilots/:id serializa person anidado con las mismas reglas', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
    const pilot = await Pilot.create({
      employeeId: fixture!.employee.employeeId,
      pilotHireDate: DateTime.utc(),
    })
    try {
      const response = await client
        .get(`/api/pilots/${pilot.pilotId}`)
        .loginAs(actor!.user)
      expectNeverDenied(response, assert)
      expectContactoClearIdentificacionMasked(
        nestedEmployeePerson(response.body(), 'pilot'),
        fixture!.clear,
        assert
      )
    } finally {
      await Pilot.query().where('pilot_id', pilot.pilotId).delete()
    }
  })

  test('E.10: GET /api/flight-attendants/:id serializa person anidado con las mismas reglas', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-contacto-read'])
    const attendant = await FlightAttendant.create({
      employeeId: fixture!.employee.employeeId,
      flightAttendantHireDate: DateTime.utc(),
    })
    try {
      const response = await client
        .get(`/api/flight-attendants/${attendant.flightAttendantId}`)
        .loginAs(actor!.user)
      expectNeverDenied(response, assert)
      expectContactoClearIdentificacionMasked(
        nestedEmployeePerson(response.body(), 'flightAttendant'),
        fixture!.clear,
        assert
      )
    } finally {
      await FlightAttendant.query()
        .where('flight_attendant_id', attendant.flightAttendantId)
        .delete()
    }
  })

  test('E.11: GET /api/employees/:id/banks con financiero destapa CLABE', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['sensitive-financiero-read'])
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/banks`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    expectNeverDenied(response, assert)
    const banks = nestedBanks(response.body())
    assert.isAbove(banks.length, 0)
    const match = banks.find(
      (row) => Number(row.employeeBankId) === fixture!.bank.employeeBankId
    )
    assert.exists(match)
    expectBankClear(match as Record<string, unknown>, fixture!.clear, assert)
  })
```

Si `Pilot.create` exige `pilotPhoto`, pasar `pilotPhoto: ''`. Si `Customer.create` exige más columnas, leer el modelo y añadir solo las not-null. No usar `db.table.insert` de PII.

Customers/pilots/FA **no** llevan `X-Business-Unit-Id` en las rutas (solo `auth` + `sensitiveAccess`). No inventar el header ahí.

- [ ] **Step 2: Run**

Run: `node ace test --files tests/e2e/sensitive_read_by_category.spec.ts`

Expected: PASS. Si E.8/E.9/E.10 tapán el email con contacto concedido, el wrap de `finish` no reentra en `sensitiveAccess` (mismo bug que CA-2). No saltar el test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sensitive_read_by_category.spec.ts
git commit -m "test: Cubrir persons sin grant y superficies sensitiveAccess"
```

---

### Task 5: E.12 — Sin sesión no filtra PII en claro

**Files:**
- Modify: `tests/e2e/sensitive_read_by_category.spec.ts`

**Interfaces:**
- Consumes: `fixture.clear`
- Produces: E.12

- [ ] **Step 1: Write unauthenticated test**

```typescript
  test('E.12: GET ficha sin Authorization es 401 y el cuerpo no trae CURP ni email claros', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employees/${fixture!.employee.employeeId}`)
      .header('X-Business-Unit-Id', buHeader(actor!))
    assert.equal(response.status(), 401)
    const dumped = JSON.stringify(response.body() ?? {})
    assert.notInclude(dumped, fixture!.clear.email)
    assert.notInclude(dumped, fixture!.clear.curp)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })
```

- [ ] **Step 2: Run full e2e + functional regression**

Run:

```bash
node ace test --files tests/e2e/sensitive_read_by_category.spec.ts,tests/functional/employees/employees_sensitive_read_by_category.spec.ts
```

Expected: PASS ambos archivos.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sensitive_read_by_category.spec.ts
git commit -m "test: Cubrir ficha sin sesión sin filtrar PII"
```

---

## Fuera

| Tema | Por qué |
|------|---------|
| Playwright / browser-client | UI es `valanserh-bo`; esta HU es API |
| Interruptor ON | Entrega apagada |
| 15 columnas orden 31 | Otra HU |
| `pii_reveal` | Fuera de alcance |
| Reescribir los 12 functional | Ya cubren CA-1–CA-4, CA-6 `loginAs`, CA-8, tenant |
| `grantOnly` en `owner`/`root`/`super-administrador` | Borra grants reales del ambiente de test |

---

## Self-review

1. **Spec coverage:** CA-1–CA-4, CA-6 `loginAs`, CA-8, tenant → functional. CA-5 → unit seeder. CA-6 login real → E.1. CA-2 compañero DG+slugs → E.6. Categorías identificación/financiero/cinco → E.3–E.5. Superficies `sensitiveAccess` → E.7–E.10. Bancos anidados → E.11. Unauthenticated → E.12. Nunca 403 → `expectNeverDenied` en E.2–E.11.
2. **Placeholder scan:** sin TBD; `getThreeSurfaces` copiado entero en Task 3; extractores definidos en Task 1.
3. **Type consistency:** `activateUser`, `loginWeb`, `bearerFromLogin`, `grantAdditionally`, `revokeSlugs`, `loginUserPerson`, `customerPerson`, `nestedEmployeePerson`, `nestedBanks`, `FIVE_READS` coinciden entre tasks.
4. **Gap fixes already applied** (working tree, functional): never-denied en F.2 y CA-3; restore de persona en CA-6; listado CA-8 aserta email claro y CURP tapado; tenant 404 no incluye email/CURP en el JSON.
