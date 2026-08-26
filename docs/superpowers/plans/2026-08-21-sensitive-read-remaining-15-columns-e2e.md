# Lectura sensible — 15 columnas restantes — Plan de pruebas E2E Japa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar recorridos e2e API con Japa de USRH1787204602828 (orden 31): un usuario real entra con `POST /api/auth/login` + Bearer y recorre las superficies del Anexo A como en un día de trabajo (expediente, nómina, familia, catálogo REPSE, biométricos, guardado de formularios, revelado), sin clonar la matriz functional F.1–F.16 ni el e2e de las 11 columnas de la orden 30.

**Architecture:** No Playwright ni `@japa/browser-client`. En este repo e2e Japa = HTTP contra el servidor que ya arranca `testUtils.httpServer()` (suite `e2e` ya registrada en `adonisrc.ts`). Fixtures y oráculos se reutilizan de `tests/functional/employees/sensitive_read_by_category_support.ts`. Cada test es un **recorrido de varios GETs/PUTs en una sola sesión Bearer**, no un caso aislado por columna. El functional `employees_sensitive_read_remaining_15.spec.ts` y el e2e `tests/e2e/sensitive_read_by_category.spec.ts` **no se reescriben**.

**Tech Stack:** AdonisJS 6, Japa (`@japa/runner` + `@japa/api-client`), `POST /api/auth/login`, Bearer, `maskSensitiveValue` / `MASK_CHAR`.

## Global Constraints

- Historia: USRH1787204602828 · orden 31. Spec: `spec-USRH1787204602828.md`. Functional: `tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts`. E2E orden 30: `tests/e2e/sensitive_read_by_category.spec.ts`.
- Rebanada **solo API**. Cero Playwright, cero `gsti-rh-bo`, cero `@japa/browser-client` como dependencia directa.
- Alcanza **únicamente las 15 columnas del Anexo A**. No reasertar las 11 de la orden 30 (CURP, email, CLABE, etc.) salvo como prueba de no-fuga en cuerpos 401/404.
- Catálogo real: 27 entradas. **No** HTTP de `TenantBillingProfile.rfc`. **No** confundir `EmpresaContratante.rfc` con `ProveedorRepse.rfc`.
- **No se enciende** `system_module_permission_enforcement_active` de `employees`. Tras cada grupo queda `false`.
- Fail-closed. Nunca 403/`PERM.DENIED` por faltar una **categoría** en rutas con `permissionGate` + `evaluate`. Lactancia, ATS y empresas tienen RBAC propio: concederlo con `grantModuleAction` / `employees:read` **después** de cada `grantOnly` (`grantOnly` borra **todas** las filas de `role_system_permissions` del rol, incluidas las de otros módulos).
- Los tres importes van `null` sin `sensitive-financiero-read`, nunca `'•••0.75'`.
- No tocar `maskSensitiveValue`, `MASK_CHAR`, `SENSITIVE_FIELDS`, `evidence.service.ts`, `start/socket.ts`.
- Cifrado: fixtures ya existen vía `Model.create()` en `createRemainingSensitiveFixture`. No insertar claro con `db.table`.
- Login real: emails `@gsti-tests.local` (limiter). `activateUser` + `deviceOrigin: 'web'`. Token en `body.data.token`.
- **No usar `grantOnly` sobre roles de sistema** (`owner` / `root` / `super-administrador`). Usar `grantAdditionally` / `revokeSlugs`.
- Oráculo: `maskSensitiveValue` / `MASK_CHAR.repeat(5)` / `expectAmountNull`. Cero literales `•` sueltos salvo el contraejemplo `'•••0.75'` ya encapsulado en `expectAmountNull`.
- Auth de los recorridos: **Bearer del login**, no `.loginAs`, salvo el actor de sistema (owner/root/DG) donde el e2e de orden 30 ya usa `.loginAs` porque no pasa por el limiter de login — aquí owner/root/DG también usan `.loginAs` + `X-Business-Unit-Id` (el recorrido Bearer ya lo demostró el actor de tenant en Tasks 1–4 y 6–7).
- TDD de caracterización: el producto existe. El test nuevo **debe pasar**. Si falla, bug de producto; no se relaja. Hoy `serializeReport` / `serializeLactationPeriod` aún leen crudo: si F.2 del functional sigue rojo, **parar** y volver al arreglo de DTO (`maskSensitiveDtoValue` en esos dos servicios) antes de continuar este plan.
- Cero `GET /api/employees/:id/biometric-face-id` (S3). Cero `getEnrollmentStatus` / `FaceId.serialize()` / `UserConsent.serialize()` (eso es F.8, F.9, F.15). Cero interruptor ON.
- Código/docs en español; identificadores en inglés. Commits: Conventional Commits, tipo inglés, **descripción en inglés**.

## Ya cubierto (no duplicar)

| Capa | Archivo | Qué NO repetir |
|------|---------|----------------|
| Unit | specs de fábrica / wiring / 422 / `categoryOf` | U.1–U.12 |
| Functional 11 | `employees_sensitive_read_by_category.spec.ts` | CA de las 11, tenant de ficha, CA-8 lookups |
| E2E 11 | `tests/e2e/sensitive_read_by_category.spec.ts` | E.1 login Person, E.2 ficha Bearer de las 11, E.3–E.6 categorías de las 11, E.7 persons, E.8–E.10 customer/pilot/FA, E.11 banks anidados, E.12 401 de **ficha** |
| Functional 15 | `employees_sensitive_read_remaining_15.spec.ts` | Casos **aislados** F.1–F.16 con `.loginAs`: show de ATS, show de empresa, `getEnrollmentStatus`, `FaceId.serialize`, `UserConsent.serialize`, PUT omit/echo sueltos, reveal suelto |

## Huecos que este plan cierra (recorridos reales)

| # | Recorrido (persona / día) | Por qué e2e y no un clon de F.n |
|---|---------------------------|--------------------------------|
| R.1 | RH entra con login+Bearer y abre el expediente Anexo A **sin** lecturas sensibles | Functional usa `.loginAs` y parte las superficies. Aquí una sesión, todas las pestañas, GET de cónyuge/emergencia (el functional 15 **no** hace esos GET). |
| R.2 | Enfermería ocupacional: solo `sensitive-salud-read` | Un Bearer: 6 de salud en claro **y** teléfonos tapados **y** importes `null` **y** RFC tapado **y** biométricos solo conteo. F.1 no aserta esa combinación ni los GET de teléfono. |
| R.3 | Nómina: solo `sensitive-financiero-read` | Histórico + rango en number **y** notas de salud tapadas **y** RFC tapado en **index** de empresas (F.5 es **show**). |
| R.4 | RH familiar: solo `sensitive-contacto-read` | GET cónyuge + GET emergencia + listado `GET /api/employee-emergency-contacts/employee/:id`. Functional 15 no tiene estos GET. |
| R.5 | Cumplimiento REPSE: catálogo | `GET /api/empresas-contratantes` (index). El spec CA-2 y la prueba manual 4 piden el **catálogo**, no el show. |
| R.6 | Dueño / DG | Bypass `root` en todas las pestañas; DG **con** los cinco slugs (no `grantOnly` al rol de sistema). Functional 15 no cubre roles de sistema. |
| R.7 | Guardado como el BO | GET tapado → PUT sin la clave (CA-5) → PUT reenviando `MASK_CHAR` en las 5 superficies (CA-6) en **un** flujo. No son los F.10–F.11 sueltos. |
| R.8 | Mesa de biométricos + revelado | GET conteo → click revelar `employeeBiometricData` (CA-7) → revelar `personFirstname` (CA-8), Bearer, sin bitácora. |
| R.9 | Sin sesión y otro tenant | 401 de nota/salario/cónyuge sin plaintext del Anexo A. 404 de otra BU en nota/ATS/histórico. E.12 solo cubría la **ficha** y el tenant 15 no existe. |

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `adonisrc.ts` | Ya tiene suite `e2e`. **No tocar.** |
| `tests/bootstrap.ts` | Ya arranca HTTP si `suite.name === 'e2e'`. **No tocar.** |
| `tests/functional/employees/sensitive_read_by_category_support.ts` | Añadir `prepareSensitiveJourney`, `bearerGet`, `bearerPut`, extractores de index/listado, `expectNoClearRemaining`. |
| `tests/e2e/sensitive_read_remaining_15.spec.ts` | Recorridos R.1–R.9. Un `test.group`, interruptor OFF. |
| `tests/e2e/sensitive_read_by_category.spec.ts` | **No reescribir.** |
| `tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts` | **No reescribir.** |

**No se modifica producto** en este plan. Si un recorrido falla, el arreglo vive en el plan de implementación (DTO ATS/lactancia u otro bug), no aquí.

---

### Task 1: Suite e2e, helpers de sesión y humo Bearer

**Files:**
- Modify: `tests/functional/employees/sensitive_read_by_category_support.ts` (tras `expectAmountNull`)
- Create: `tests/e2e/sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: `activateUser`, `loginWeb`, `bearerFromLogin`, `createActor`, `createSensitiveFixture`, `createRemainingSensitiveFixture`, `grantOnly`, `grantModuleAction`, `buHeader`, `expectNeverDenied`, `expectMaskedHealth`, `workDisabilityNoteBody`, `TEST_PASSWORD`
- Produces:
  - `prepareSensitiveJourney(roleId, employeeSlugs, extraModules?): Promise<void>`
  - `bearerGet(client, path, token, actor, qs?): ReturnType<ApiClient['get']>`
  - `bearerPut(client, path, token, actor): ReturnType<ApiClient['put']>`
  - `expectNoClearRemaining(body, assert): void`
  - `lactationNotesFromIndex(body, lactationPeriodId): unknown`
  - `traumaFromShow(body): Record<string, unknown>`
  - `traumaFromIndex(body, reportId): Record<string, unknown>`
  - `empresaRfcFromIndex(body, empresaContratanteId): unknown`
  - `emergencyPhonesFromEmployeeList(body, contactId): unknown`
  - grupo e2e con interruptor OFF y humo 200

- [ ] **Step 1: Add journey helpers to support**

Al final de `tests/functional/employees/sensitive_read_by_category_support.ts`, después de `expectAmountNull`:

```typescript
export async function prepareSensitiveJourney(
  roleId: number,
  employeeSlugs: string[],
  extraModules: Array<[string, string]> = [
    ['repse-registrations', 'read'],
    ['traumatic-event-reports', 'read'],
  ]
) {
  await grantOnly(roleId, employeeSlugs)
  for (const [moduleSlug, actionSlug] of extraModules) {
    await grantModuleAction(roleId, moduleSlug, actionSlug)
  }
}

export function bearerGet(
  client: ApiClient,
  path: string,
  token: string,
  actor: TenantActor,
  qs?: Record<string, string | number>
) {
  const request = client
    .get(path)
    .header('Authorization', `Bearer ${token}`)
    .header('X-Business-Unit-Id', buHeader(actor))
  return qs ? request.qs(qs) : request
}

export function bearerPut(
  client: ApiClient,
  path: string,
  token: string,
  actor: TenantActor
) {
  return client
    .put(path)
    .header('Authorization', `Bearer ${token}`)
    .header('X-Business-Unit-Id', buHeader(actor))
}

export function expectNoClearRemaining(body: unknown, assert: Assert) {
  const dumped = JSON.stringify(body ?? {})
  assert.notInclude(dumped, CLEAR_REMAINING.disabilityDescription)
  assert.notInclude(dumped, CLEAR_REMAINING.traumaPeople)
  assert.notInclude(dumped, CLEAR_REMAINING.traumaDescription)
  assert.notInclude(dumped, CLEAR_REMAINING.lactationNotes)
  assert.notInclude(dumped, CLEAR_REMAINING.biometricData)
  assert.notInclude(dumped, CLEAR_REMAINING.faceToken)
  assert.notInclude(dumped, CLEAR_FIXED.phone)
  assert.notInclude(dumped, CLEAR_FIXED.phoneSecondary)
  assert.notInclude(dumped, String(CLEAR_REMAINING.salaryDaily))
  assert.notInclude(dumped, CLEAR_REMAINING.empresaRfc)
}

export function lactationNotesFromIndex(
  body: Record<string, unknown>,
  lactationPeriodId: number
): unknown {
  const rows =
    (asRecord(asRecord(body.data).employeeLactationPeriods).data as unknown[]) ?? []
  const match = rows.find(
    (row) => Number(asRecord(row).employeeLactationPeriodId) === lactationPeriodId
  )
  return match ? asRecord(match).employeeLactationPeriodNotes : undefined
}

export function traumaFromShow(body: Record<string, unknown>) {
  const data = asRecord(body.data)
  if (data.traumaticEventReport && typeof data.traumaticEventReport === 'object') {
    return asRecord(data.traumaticEventReport)
  }
  return data
}

export function traumaFromIndex(body: Record<string, unknown>, reportId: number) {
  const bundle = asRecord(asRecord(body.data).traumaticEventReports)
  const rows = Array.isArray(bundle.data) ? (bundle.data as unknown[]) : []
  const match = rows.find(
    (row) => Number(asRecord(row).traumaticEventReportId) === reportId
  )
  return match ? asRecord(match) : {}
}

export function empresaRfcFromIndex(
  body: Record<string, unknown>,
  empresaContratanteId: number
): unknown {
  const bundle = asRecord(asRecord(body.data).empresasContratantes)
  const rows = Array.isArray(bundle.data) ? (bundle.data as unknown[]) : []
  const match = rows.find((row) => Number(asRecord(row).id) === empresaContratanteId)
  return match ? asRecord(match).rfc : undefined
}

export function emergencyPhonesFromEmployeeList(
  body: Record<string, unknown>,
  contactId: number
): unknown {
  const rows = asRecord(body.data).employeeEmergencyContacts
  const list = Array.isArray(rows) ? rows : []
  const match = list.find(
    (row) => Number(asRecord(row).employeeEmergencyContactId) === contactId
  )
  return match ? asRecord(match).employeeEmergencyContactPhone : undefined
}
```

`ApiClient` y `Assert` ya están importados en el support. No redefinir `asRecord`.

- [ ] **Step 2: Write the smoke e2e spec**

Crear `tests/e2e/sensitive_read_remaining_15.spec.ts`:

```typescript
import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import SystemModule from '#models/system_module'
import { maskSensitiveValue, MASK_CHAR } from '#helpers/sensitive_mask'
import {
  TEST_PASSWORD,
  activateUser,
  bearerFromLogin,
  bearerGet,
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  CLEAR_FIXED,
  CLEAR_REMAINING,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  emergencyBody,
  empresaRfcFromIndex,
  expectAmountNull,
  expectMaskedHealth,
  expectNeverDenied,
  expectNoClearRemaining,
  firstSalaryDaily,
  lactationNotesFromIndex,
  loginWeb,
  medicalConditionBody,
  prepareSensitiveJourney,
  rangeAmounts,
  spouseBody,
  traumaFromIndex,
  traumaFromShow,
  workDisabilityNoteBody,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type TenantActor,
} from '../functional/employees/sensitive_read_by_category_support.js'

const FIVE_READS = [
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read',
] as const

async function sessionToken(
  client: ApiClient,
  actor: TenantActor,
  assert: Assert
) {
  const login = await loginWeb(client, actor.user.userEmail, TEST_PASSWORD)
  expectNeverDenied(login, assert)
  return bearerFromLogin(login.body())
}

test.group('Lectura sensible — 15 columnas restantes — E2E Japa', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null
  let extra: RemainingSensitiveFixture | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('sens15-e2e')
    await activateUser(actor.user)
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'e2e15')
    extra = await createRemainingSensitiveFixture(actor, fixture)
  })

  group.teardown(async () => {
    try {
      await cleanupRemainingSensitiveFixture(extra)
      await cleanupSensitiveFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('humo: login web y GET nota de incapacidad con Bearer responde 200', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(actor!.role.roleId, ['read'])
    const token = await sessionToken(client, actor!, assert)
    const response = await bearerGet(
      client,
      `/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`,
      token,
      actor!
    )
    expectNeverDenied(response, assert)
    expectMaskedHealth(
      workDisabilityNoteBody(response.body()).workDisabilityNoteDescription,
      assert
    )
  })
})
```

`grantOnly` se usa en el `group.setup` sobre el **rol temporal** de `createActor`, no sobre un rol de sistema.

Si TypeScript se queja porque `grantOnly` no está en el import del spec, añadir `grantOnly` al import (el setup lo llama). El spec de humo de arriba llama `grantOnly` en setup: incluirlo en el import.

- [ ] **Step 3: Run the smoke**

Run: `node ace test --files tests/e2e/sensitive_read_remaining_15.spec.ts`

Expected: PASS (1 test). Si login no es 200, el actor no tiene `userPasswordSetAt` — `activateUser` debe haberse llamado. Si la nota es 401, el Bearer no se está enviando. Si es 403 `PERM.DENIED`, el interruptor de `employees` no quedó en `false`.

- [ ] **Step 4: Commit**

```bash
git add tests/functional/employees/sensitive_read_by_category_support.ts tests/e2e/sensitive_read_remaining_15.spec.ts
git commit -m "$(cat <<'EOF'
test: add remaining-15 e2e suite and bearer smoke

EOF
)"
```

---

### Task 2: Recorrido R.1 — RH sin categorías abre todo el expediente

**Files:**
- Modify: `tests/e2e/sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: `prepareSensitiveJourney`, `sessionToken`, `bearerGet`, extractores del Task 1, `expectNoClearRemaining`
- Produces: helper de spec `openAnexoASurfaces` y el test R.1

- [ ] **Step 1: Add openAnexoASurfaces and R.1**

Dentro del spec, **antes** del `test.group` (junto a `sessionToken`):

```typescript
async function openAnexoASurfaces(
  client: ApiClient,
  token: string,
  actor: TenantActor,
  fixture: SensitiveFixture,
  extra: RemainingSensitiveFixture
) {
  const headerActor = actor
  const noteRes = await bearerGet(
    client,
    `/api/work-disability-notes/${extra.note.workDisabilityNoteId}`,
    token,
    headerActor
  )
  const spouseRes = await bearerGet(
    client,
    `/api/employee-spouses/${extra.spouse.employeeSpouseId}`,
    token,
    headerActor
  )
  const emergencyRes = await bearerGet(
    client,
    `/api/employee-emergency-contacts/${extra.emergency.employeeEmergencyContactId}`,
    token,
    headerActor
  )
  const emergencyListRes = await bearerGet(
    client,
    `/api/employee-emergency-contacts/employee/${fixture.employee.employeeId}`,
    token,
    headerActor
  )
  const lactationRes = await bearerGet(
    client,
    '/api/employee-lactation-periods',
    token,
    headerActor,
    { employeeId: fixture.employee.employeeId, page: 1, limit: 10 }
  )
  const traumaShowRes = await bearerGet(
    client,
    `/api/traumatic-event-reports/${extra.trauma.traumaticEventReportId}`,
    token,
    headerActor
  )
  const traumaIndexRes = await bearerGet(
    client,
    '/api/traumatic-event-reports',
    token,
    headerActor,
    { page: 1, limit: 10, employeeId: fixture.employee.employeeId }
  )
  const salaryRes = await bearerGet(
    client,
    `/api/employees/${fixture.employee.employeeId}/salary-history`,
    token,
    headerActor
  )
  const rangeRes = await bearerGet(
    client,
    '/api/position-salary-ranges',
    token,
    headerActor,
    {
      razon_social_id: actor.businessUnit.businessUnitId,
      position_id: fixture.positionId,
    }
  )
  const biometricRes = await bearerGet(
    client,
    `/api/employees/${fixture.employee.employeeId}/biometrics`,
    token,
    headerActor
  )
  const empresaIndexRes = await bearerGet(
    client,
    '/api/empresas-contratantes',
    token,
    headerActor,
    { page: 1, perPage: 20 }
  )
  const medicalRes = await bearerGet(
    client,
    `/api/employee-medical-conditions/${fixture.medical.employeeMedicalConditionId}`,
    token,
    headerActor
  )
  return {
    noteRes,
    spouseRes,
    emergencyRes,
    emergencyListRes,
    lactationRes,
    traumaShowRes,
    traumaIndexRes,
    salaryRes,
    rangeRes,
    biometricRes,
    empresaIndexRes,
    medicalRes,
  }
}
```

Añadir el test **dentro** del group, después del humo:

```typescript
  test('R.1: RH sin lecturas sensibles recorre el expediente y todo va tapado o null', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(actor!.role.roleId, ['read'])
    const token = await sessionToken(client, actor!, assert)
    const surfaces = await openAnexoASurfaces(client, token, actor!, fixture!, extra!)
    for (const response of Object.values(surfaces)) {
      expectNeverDenied(response, assert)
    }

    expectMaskedHealth(
      workDisabilityNoteBody(surfaces.noteRes.body()).workDisabilityNoteDescription,
      assert
    )
    expectMaskedHealth(
      medicalConditionBody(surfaces.medicalRes.body()).employeeMedicalConditionDiagnosis,
      assert
    )
    expectMaskedHealth(
      lactationNotesFromIndex(
        surfaces.lactationRes.body(),
        extra!.lactation.employeeLactationPeriodId
      ),
      assert
    )
    expectMaskedHealth(
      traumaFromShow(surfaces.traumaShowRes.body()).traumaticEventReportInvolvedPeople,
      assert
    )
    expectMaskedHealth(
      traumaFromIndex(
        surfaces.traumaIndexRes.body(),
        extra!.trauma.traumaticEventReportId
      ).traumaticEventReportDescription,
      assert
    )

    assert.equal(
      spouseBody(surfaces.spouseRes.body()).employeeSpousePhone,
      maskSensitiveValue(CLEAR_FIXED.phoneSecondary, 'contacto')
    )
    assert.equal(
      emergencyBody(surfaces.emergencyRes.body()).employeeEmergencyContactPhone,
      maskSensitiveValue(CLEAR_FIXED.phone, 'contacto')
    )
    assert.equal(
      emergencyPhonesFromEmployeeList(
        surfaces.emergencyListRes.body(),
        extra!.emergency.employeeEmergencyContactId
      ),
      maskSensitiveValue(CLEAR_FIXED.phone, 'contacto')
    )

    expectAmountNull(firstSalaryDaily(surfaces.salaryRes.body()), assert)
    const amounts = rangeAmounts(surfaces.rangeRes.body())
    expectAmountNull(amounts.min, assert)
    expectAmountNull(amounts.max, assert)

    assert.equal(
      empresaRfcFromIndex(
        surfaces.empresaIndexRes.body(),
        extra!.empresa.empresaContratanteId
      ),
      maskSensitiveValue(CLEAR_REMAINING.empresaRfc, 'identificacion')
    )

    const biometric = surfaces.biometricRes.body()?.data?.employeeBiometric as Record<
      string,
      unknown
    >
    assert.include(biometric.fingers as number[], 1)
    assert.include(biometric.fingers as number[], 4)
    assert.isTrue(Boolean(biometric.face))
    assert.isUndefined(biometric.employeeBiometricData)
    assert.notInclude(JSON.stringify(surfaces.biometricRes.body()), CLEAR_REMAINING.biometricData)
  })
```

Añadir `emergencyPhonesFromEmployeeList` al import del spec.

- [ ] **Step 2: Run the file**

Run: `node ace test --files tests/e2e/sensitive_read_remaining_15.spec.ts`

Expected: PASS. Si lactancia o ATS son 403, `prepareSensitiveJourney` no reaplicó `read` / `traumatic-event-reports:read` después de `grantOnly`. Si el index de empresas no encuentra el RFC, ajustar `empresaRfcFromIndex` al shape real **sin** cambiar el oráculo `maskSensitiveValue(..., 'identificacion')`. Si ATS/lactancia llegan en claro, **parar** (bug de DTO de producto).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sensitive_read_remaining_15.spec.ts tests/functional/employees/sensitive_read_by_category_support.ts
git commit -m "$(cat <<'EOF'
test: walk remaining sensitive surfaces without category grants

EOF
)"
```

---

### Task 3: Recorrido R.2 — enfermería ocupacional (solo salud)

**Files:**
- Modify: `tests/e2e/sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: `openAnexoASurfaces`, `sessionToken`, `prepareSensitiveJourney(['read', 'sensitive-salud-read'])`
- Produces: test R.2

- [ ] **Step 1: Add the occupational-health journey**

```typescript
  test('R.2: enfermeria con solo salud ve notas en claro y el resto cerrado', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(actor!.role.roleId, ['read', 'sensitive-salud-read'])
    const token = await sessionToken(client, actor!, assert)
    const surfaces = await openAnexoASurfaces(client, token, actor!, fixture!, extra!)
    for (const response of Object.values(surfaces)) {
      expectNeverDenied(response, assert)
    }

    const medical = medicalConditionBody(surfaces.medicalRes.body())
    assert.equal(medical.employeeMedicalConditionDiagnosis, CLEAR_FIXED.diagnosis)
    assert.equal(medical.employeeMedicalConditionNotes, CLEAR_FIXED.notes)
    assert.equal(
      workDisabilityNoteBody(surfaces.noteRes.body()).workDisabilityNoteDescription,
      CLEAR_REMAINING.disabilityDescription
    )
    assert.equal(
      lactationNotesFromIndex(
        surfaces.lactationRes.body(),
        extra!.lactation.employeeLactationPeriodId
      ),
      CLEAR_REMAINING.lactationNotes
    )
    const trauma = traumaFromShow(surfaces.traumaShowRes.body())
    assert.equal(trauma.traumaticEventReportInvolvedPeople, CLEAR_REMAINING.traumaPeople)
    assert.equal(trauma.traumaticEventReportDescription, CLEAR_REMAINING.traumaDescription)
    assert.equal(
      traumaFromIndex(
        surfaces.traumaIndexRes.body(),
        extra!.trauma.traumaticEventReportId
      ).traumaticEventReportInvolvedPeople,
      CLEAR_REMAINING.traumaPeople
    )

    assert.equal(
      spouseBody(surfaces.spouseRes.body()).employeeSpousePhone,
      maskSensitiveValue(CLEAR_FIXED.phoneSecondary, 'contacto')
    )
    expectAmountNull(firstSalaryDaily(surfaces.salaryRes.body()), assert)
    assert.equal(
      empresaRfcFromIndex(
        surfaces.empresaIndexRes.body(),
        extra!.empresa.empresaContratanteId
      ),
      maskSensitiveValue(CLEAR_REMAINING.empresaRfc, 'identificacion')
    )
    assert.notInclude(
      JSON.stringify(surfaces.biometricRes.body()),
      CLEAR_REMAINING.biometricData
    )
  })
```

- [ ] **Step 2: Run the file**

Run: `node ace test --files tests/e2e/sensitive_read_remaining_15.spec.ts`

Expected: PASS. Si salud está tapada con el slug concedido, ALS no montó en esa ruta (producto). Si el teléfono o el RFC salen en claro, el grant de salud está filtrando mal (producto). No relajar.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sensitive_read_remaining_15.spec.ts
git commit -m "$(cat <<'EOF'
test: cover occupational-health journey with health-only grants

EOF
)"
```

---

### Task 4: Recorridos R.3–R.5 — nómina, familia y catálogo REPSE

**Files:**
- Modify: `tests/e2e/sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: `openAnexoASurfaces` (R.3), `bearerGet` (R.4/R.5), `empresaRfcFromIndex`, `spouseBody`, `emergencyBody`, `emergencyPhonesFromEmployeeList`
- Produces: tests R.3, R.4, R.5

- [ ] **Step 1: Add payroll, family, and REPSE catalog journeys**

```typescript
  test('R.3: nomina con solo financiero ve importes number y salud/RFC cerrados', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(actor!.role.roleId, ['read', 'sensitive-financiero-read'])
    const token = await sessionToken(client, actor!, assert)
    const surfaces = await openAnexoASurfaces(client, token, actor!, fixture!, extra!)
    expectNeverDenied(surfaces.salaryRes, assert)
    expectNeverDenied(surfaces.rangeRes, assert)
    assert.equal(firstSalaryDaily(surfaces.salaryRes.body()), CLEAR_REMAINING.salaryDaily)
    const amounts = rangeAmounts(surfaces.rangeRes.body())
    assert.equal(amounts.min, CLEAR_REMAINING.minSalaryDaily)
    assert.equal(amounts.max, CLEAR_REMAINING.maxSalaryDaily)
    expectMaskedHealth(
      workDisabilityNoteBody(surfaces.noteRes.body()).workDisabilityNoteDescription,
      assert
    )
    assert.equal(
      empresaRfcFromIndex(
        surfaces.empresaIndexRes.body(),
        extra!.empresa.empresaContratanteId
      ),
      maskSensitiveValue(CLEAR_REMAINING.empresaRfc, 'identificacion')
    )
    assert.notEqual(firstSalaryDaily(surfaces.salaryRes.body()), '•••0.75')
  })

  test('R.4: RH familiar con solo contacto ve telefonos en claro y salud tapada', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(actor!.role.roleId, ['read', 'sensitive-contacto-read'])
    const token = await sessionToken(client, actor!, assert)
    const spouseRes = await bearerGet(
      client,
      `/api/employee-spouses/${extra!.spouse.employeeSpouseId}`,
      token,
      actor!
    )
    const emergencyRes = await bearerGet(
      client,
      `/api/employee-emergency-contacts/${extra!.emergency.employeeEmergencyContactId}`,
      token,
      actor!
    )
    const emergencyListRes = await bearerGet(
      client,
      `/api/employee-emergency-contacts/employee/${fixture!.employee.employeeId}`,
      token,
      actor!
    )
    const noteRes = await bearerGet(
      client,
      `/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`,
      token,
      actor!
    )
    expectNeverDenied(spouseRes, assert)
    expectNeverDenied(emergencyRes, assert)
    expectNeverDenied(emergencyListRes, assert)
    assert.equal(spouseBody(spouseRes.body()).employeeSpousePhone, CLEAR_FIXED.phoneSecondary)
    assert.equal(
      emergencyBody(emergencyRes.body()).employeeEmergencyContactPhone,
      CLEAR_FIXED.phone
    )
    assert.equal(
      emergencyPhonesFromEmployeeList(
        emergencyListRes.body(),
        extra!.emergency.employeeEmergencyContactId
      ),
      CLEAR_FIXED.phone
    )
    expectMaskedHealth(
      workDisabilityNoteBody(noteRes.body()).workDisabilityNoteDescription,
      assert
    )
  })

  test('R.5: cumplimiento abre el catalogo REPSE y el RFC respeta identificacion', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(actor!.role.roleId, ['read'])
    const token = await sessionToken(client, actor!, assert)
    const masked = await bearerGet(
      client,
      '/api/empresas-contratantes',
      token,
      actor!,
      { page: 1, perPage: 20 }
    )
    expectNeverDenied(masked, assert)
    assert.equal(
      empresaRfcFromIndex(masked.body(), extra!.empresa.empresaContratanteId),
      maskSensitiveValue(CLEAR_REMAINING.empresaRfc, 'identificacion')
    )

    await prepareSensitiveJourney(actor!.role.roleId, [
      'read',
      'sensitive-identificacion-read',
    ])
    const tokenClear = await sessionToken(client, actor!, assert)
    const clear = await bearerGet(
      client,
      '/api/empresas-contratantes',
      tokenClear,
      actor!,
      { page: 1, perPage: 20 }
    )
    expectNeverDenied(clear, assert)
    assert.equal(
      empresaRfcFromIndex(clear.body(), extra!.empresa.empresaContratanteId),
      CLEAR_REMAINING.empresaRfc
    )
  })
```

R.5 pega el **index**, no `/api/empresas-contratantes/:id` (eso es F.5/F.6). No asertar `ProveedorRepse`.

- [ ] **Step 2: Run the file**

Run: `node ace test --files tests/e2e/sensitive_read_remaining_15.spec.ts`

Expected: PASS. Si el index de empresas es 403, falta `repse-registrations:read` después de `grantOnly`. Si `rangeAmounts` no encuentra filas, el query `razon_social_id` / `position_id` no coincide con el fixture — ajustar qs al contrato real **sin** relajar `null` vs number.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sensitive_read_remaining_15.spec.ts
git commit -m "$(cat <<'EOF'
test: cover payroll family and contracting-company catalog journeys

EOF
)"
```

---

### Task 5: Recorrido R.6 — root bypass y DG con los cinco slugs

**Files:**
- Modify: `tests/e2e/sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: `createSystemActor`, `cleanupSystemActor`, `grantAdditionally`, `revokeSlugs`, `permissionId`, `RoleSystemPermission`, `openAnexoASurfaces` (vía `.loginAs` + mismo actor.businessUnit)
- Produces: tests R.6a root y R.6b DG

Añadir imports:

```typescript
import RoleSystemPermission from '#models/role_system_permission'
import {
  cleanupSystemActor,
  createSystemActor,
  grantAdditionally,
  permissionId,
  revokeSlugs,
} from '../functional/employees/sensitive_read_by_category_support.js'
```

(fusionar con el import existente; no duplicar el bloque).

- [ ] **Step 1: Add a loginAs opener for system actors**

En el spec, junto a `openAnexoASurfaces`:

```typescript
async function openAnexoAAsUser(
  client: ApiClient,
  user: TenantActor['user'],
  actor: TenantActor,
  fixture: SensitiveFixture,
  extra: RemainingSensitiveFixture
) {
  const header = buHeader(actor)
  const get = (path: string, qs?: Record<string, string | number>) => {
    const request = client
      .get(path)
      .loginAs(user)
      .header('X-Business-Unit-Id', header)
    return qs ? request.qs(qs) : request
  }
  return {
    noteRes: await get(`/api/work-disability-notes/${extra.note.workDisabilityNoteId}`),
    spouseRes: await get(`/api/employee-spouses/${extra.spouse.employeeSpouseId}`),
    lactationRes: await get('/api/employee-lactation-periods', {
      employeeId: fixture.employee.employeeId,
      page: 1,
      limit: 10,
    }),
    traumaShowRes: await get(
      `/api/traumatic-event-reports/${extra.trauma.traumaticEventReportId}`
    ),
    salaryRes: await get(`/api/employees/${fixture.employee.employeeId}/salary-history`),
    empresaIndexRes: await get('/api/empresas-contratantes', { page: 1, perPage: 20 }),
    biometricRes: await get(`/api/employees/${fixture.employee.employeeId}/biometrics`),
  }
}
```

- [ ] **Step 2: Add root and DG tests**

```typescript
  test('R.6a: root ve las 15 en claro sin slugs de categoria', async ({ client, assert }) => {
    const root = await createSystemActor(
      'root',
      'sens15-e2e-root',
      actor!.businessUnit.businessUnitId
    )
    try {
      const surfaces = await openAnexoAAsUser(client, root.user, actor!, fixture!, extra!)
      for (const response of Object.values(surfaces)) {
        expectNeverDenied(response, assert)
      }
      assert.equal(
        workDisabilityNoteBody(surfaces.noteRes.body()).workDisabilityNoteDescription,
        CLEAR_REMAINING.disabilityDescription
      )
      assert.equal(
        spouseBody(surfaces.spouseRes.body()).employeeSpousePhone,
        CLEAR_FIXED.phoneSecondary
      )
      assert.equal(
        lactationNotesFromIndex(
          surfaces.lactationRes.body(),
          extra!.lactation.employeeLactationPeriodId
        ),
        CLEAR_REMAINING.lactationNotes
      )
      assert.equal(
        traumaFromShow(surfaces.traumaShowRes.body()).traumaticEventReportInvolvedPeople,
        CLEAR_REMAINING.traumaPeople
      )
      assert.equal(firstSalaryDaily(surfaces.salaryRes.body()), CLEAR_REMAINING.salaryDaily)
      assert.equal(
        empresaRfcFromIndex(
          surfaces.empresaIndexRes.body(),
          extra!.empresa.empresaContratanteId
        ),
        CLEAR_REMAINING.empresaRfc
      )
      assert.notInclude(
        JSON.stringify(surfaces.biometricRes.body()),
        CLEAR_REMAINING.biometricData
      )
    } finally {
      await cleanupSystemActor(root)
    }
  })

  test('R.6b: super-administrador con las cinco lecturas ve salud telefonos importes y RFC en claro', async ({
    client,
    assert,
  }) => {
    const dg = await createSystemActor(
      'super-administrador',
      'sens15-e2e-dg',
      actor!.businessUnit.businessUnitId
    )
    const alreadyGranted = new Set<string>()
    for (const slug of FIVE_READS) {
      const existing = await RoleSystemPermission.query()
        .where('role_id', dg.roleId)
        .where('system_permission_id', await permissionId(slug))
        .first()
      if (existing) alreadyGranted.add(slug)
    }
    await grantAdditionally(dg.roleId, [...FIVE_READS, 'read'])
    await grantModuleAction(dg.roleId, 'repse-registrations', 'read')
    await grantModuleAction(dg.roleId, 'traumatic-event-reports', 'read')
    const addedSlugs = [...FIVE_READS, 'read'].filter((slug) => !alreadyGranted.has(slug))
    try {
      const surfaces = await openAnexoAAsUser(client, dg.user, actor!, fixture!, extra!)
      expectNeverDenied(surfaces.noteRes, assert)
      assert.equal(
        workDisabilityNoteBody(surfaces.noteRes.body()).workDisabilityNoteDescription,
        CLEAR_REMAINING.disabilityDescription
      )
      assert.equal(
        spouseBody(surfaces.spouseRes.body()).employeeSpousePhone,
        CLEAR_FIXED.phoneSecondary
      )
      assert.equal(firstSalaryDaily(surfaces.salaryRes.body()), CLEAR_REMAINING.salaryDaily)
      assert.equal(
        empresaRfcFromIndex(
          surfaces.empresaIndexRes.body(),
          extra!.empresa.empresaContratanteId
        ),
        CLEAR_REMAINING.empresaRfc
      )
    } finally {
      if (addedSlugs.length > 0) {
        await revokeSlugs(dg.roleId, addedSlugs)
      }
      await cleanupSystemActor(dg)
    }
  })
```

Añadir `grantModuleAction` al import. **Prohibido** `grantOnly(dg.roleId, ...)`.

GET `/biometrics` **nunca** incluye `employeeBiometricData` (CA-1 HTTP). Root/DG tampoco lo ven en ese JSON; no asertar el string `Finger:1` en claro por esa ruta.

- [ ] **Step 3: Run the file**

Run: `node ace test --files tests/e2e/sensitive_read_remaining_15.spec.ts`

Expected: PASS. Si root recibe 403 en lactancia/ATS, el bypass `isRoot` del controlador no corrió (producto o `role_slug` distinto). Si DG ve tapado con los cinco slugs, el rol de sistema no está en ALS — mismo patrón que E.6 de orden 30.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/sensitive_read_remaining_15.spec.ts
git commit -m "$(cat <<'EOF'
test: cover root bypass and director-general granted remaining columns

EOF
)"
```

---

### Task 6: Recorrido R.7 — guardado como el backoffice (CA-5 y CA-6)

**Files:**
- Modify: `tests/e2e/sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: `bearerGet`, `bearerPut`, `MASK_CHAR`, modelos Lucid para recargar sin serialize
- Produces: un solo test que GET → omit PUT → echo PUT en las 5 superficies

Añadir imports de modelos (fusionar):

```typescript
import WorkDisabilityNote from '#models/work_disability_note'
import EmployeeSpouse from '#models/employee_spouse'
import EmployeeEmergencyContact from '#models/employee_emergency_contact'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import TraumaticEventReport from '#models/traumatic_event_report'
```

- [ ] **Step 1: Add the form-save journey**

```typescript
  test('R.7: el usuario ve tapado, guarda el resto del formulario y no puede reenviar la mascara', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(
      actor!.role.roleId,
      ['read', 'update-information'],
      [
        ['repse-registrations', 'read'],
        ['traumatic-event-reports', 'read'],
        ['traumatic-event-reports', 'update'],
      ]
    )
    const token = await sessionToken(client, actor!, assert)

    const noteGet = await bearerGet(
      client,
      `/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`,
      token,
      actor!
    )
    expectNeverDenied(noteGet, assert)
    expectMaskedHealth(
      workDisabilityNoteBody(noteGet.body()).workDisabilityNoteDescription,
      assert
    )

    const omitNote = await bearerPut(
      client,
      `/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`,
      token,
      actor!
    ).json({})
    assert.equal(omitNote.status(), 200)
    const noteStored = await WorkDisabilityNote.findOrFail(extra!.note.workDisabilityNoteId)
    assert.equal(noteStored.workDisabilityNoteDescription, CLEAR_REMAINING.disabilityDescription)

    const echoNote = await bearerPut(
      client,
      `/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`,
      token,
      actor!
    ).json({ workDisabilityNoteDescription: MASK_CHAR.repeat(5) })
    assert.include([400, 422], echoNote.status())
    assert.include(JSON.stringify(echoNote.body()), 'carácter de máscara')

    const echoSpouse = await bearerPut(
      client,
      `/api/employee-spouses/${extra!.spouse.employeeSpouseId}`,
      token,
      actor!
    ).json({
      employeeSpouseFirstname: CLEAR_REMAINING.spouseFirstname,
      employeeSpouseLastname: CLEAR_REMAINING.spouseLastname,
      employeeSpouseSecondLastname: 'Qa',
      employeeSpousePhone: MASK_CHAR.repeat(5),
    })
    assert.include([400, 422], echoSpouse.status())

    const omitSpouse = await bearerPut(
      client,
      `/api/employee-spouses/${extra!.spouse.employeeSpouseId}`,
      token,
      actor!
    ).json({
      employeeSpouseFirstname: CLEAR_REMAINING.spouseFirstname,
      employeeSpouseLastname: CLEAR_REMAINING.spouseLastname,
      employeeSpouseSecondLastname: 'Qa',
    })
    assert.equal(omitSpouse.status(), 200)
    const spouseStored = await EmployeeSpouse.findOrFail(extra!.spouse.employeeSpouseId)
    assert.equal(spouseStored.employeeSpousePhone, CLEAR_FIXED.phoneSecondary)

    const echoEmergency = await bearerPut(
      client,
      `/api/employee-emergency-contacts/${extra!.emergency.employeeEmergencyContactId}`,
      token,
      actor!
    ).json({ employeeEmergencyContactPhone: MASK_CHAR.repeat(5) })
    assert.include([400, 422], echoEmergency.status())
    const emergencyStored = await EmployeeEmergencyContact.findOrFail(
      extra!.emergency.employeeEmergencyContactId
    )
    assert.equal(emergencyStored.employeeEmergencyContactPhone, CLEAR_FIXED.phone)

    const echoLactation = await bearerPut(
      client,
      `/api/employee-lactation-periods/${extra!.lactation.employeeLactationPeriodId}`,
      token,
      actor!
    ).json({ employeeLactationPeriodNotes: MASK_CHAR.repeat(5) })
    assert.include([400, 422], echoLactation.status())
    const lactationStored = await EmployeeLactationPeriod.findOrFail(
      extra!.lactation.employeeLactationPeriodId
    )
    assert.equal(lactationStored.employeeLactationPeriodNotes, CLEAR_REMAINING.lactationNotes)

    const echoTrauma = await bearerPut(
      client,
      `/api/traumatic-event-reports/${extra!.trauma.traumaticEventReportId}`,
      token,
      actor!
    ).json({
      traumaticEventReportInvolvedPeople: MASK_CHAR.repeat(5),
      traumaticEventReportDescription: MASK_CHAR.repeat(5),
    })
    assert.include([400, 422], echoTrauma.status())
    const traumaStored = await TraumaticEventReport.findOrFail(
      extra!.trauma.traumaticEventReportId
    )
    assert.equal(traumaStored.traumaticEventReportInvolvedPeople, CLEAR_REMAINING.traumaPeople)
    assert.equal(traumaStored.traumaticEventReportDescription, CLEAR_REMAINING.traumaDescription)

    const noteAfter = await WorkDisabilityNote.findOrFail(extra!.note.workDisabilityNoteId)
    assert.equal(noteAfter.workDisabilityNoteDescription, CLEAR_REMAINING.disabilityDescription)
  })
```

Recargar con `findOrFail` (consume de cifrado), **no** con `.serialize()`. Si un PUT responde **200 y persiste `•••••`**, **parar**: es corrupción, no relajar a 200.

- [ ] **Step 2: Run the file**

Run: `node ace test --files tests/e2e/sensitive_read_remaining_15.spec.ts`

Expected: PASS. 400 o 422 del `noMaskChar` ambos valen. El mensaje debe contener `carácter de máscara` (texto de `no_mask_char_rule.ts`). Si lactancia PUT es 403, falta `update-information` en `prepareSensitiveJourney`. Si ATS PUT es 403, falta `traumatic-event-reports:update`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sensitive_read_remaining_15.spec.ts
git commit -m "$(cat <<'EOF'
test: reject echoed masks after reading remaining sensitive forms

EOF
)"
```

---

### Task 7: Recorridos R.8–R.9 — biométricos + revelado, 401 y otro tenant

**Files:**
- Modify: `tests/e2e/sensitive_read_remaining_15.spec.ts`

**Interfaces:**
- Consumes: `SENSITIVE_DATA_READ_ERROR_CODES`, `PiiAccessLog`, `expectNoClearRemaining`, `createActor` (segundo tenant)
- Produces: tests R.8, R.9a, R.9b

Añadir imports (fusionar):

```typescript
import PiiAccessLog from '#models/pii_access_log'
import { SENSITIVE_DATA_READ_ERROR_CODES } from '#constants/sensitive_data_read_error_codes'
```

- [ ] **Step 1: Add biometrics desk, unauthenticated, and cross-tenant journeys**

```typescript
  test('R.8: mesa de biometricos ve conteo y el revelado de biometricData y firstname es 422', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(actor!.role.roleId, ['read'])
    const token = await sessionToken(client, actor!, assert)
    const biometricRes = await bearerGet(
      client,
      `/api/employees/${fixture!.employee.employeeId}/biometrics`,
      token,
      actor!
    )
    expectNeverDenied(biometricRes, assert)
    const biometric = biometricRes.body()?.data?.employeeBiometric as Record<string, unknown>
    assert.include(biometric.fingers as number[], 1)
    assert.isTrue(Boolean(biometric.face))
    assert.notInclude(JSON.stringify(biometricRes.body()), CLEAR_REMAINING.biometricData)

    const before = await PiiAccessLog.query()
      .where('accessor_user_id', actor!.user.userId)
      .count('* as total')
    const revealBiometric = await bearerGet(
      client,
      `/api/v1/pii/reveal/EmployeeBiometric/employeeBiometricData/${extra!.biometric.employeeBiometricId}`,
      token,
      actor!
    )
    assert.equal(revealBiometric.status(), 422)
    const biometricBody = revealBiometric.body()
    assert.equal(biometricBody.title, 'El dato no se puede revelar por esta vía')
    assert.equal(
      biometricBody.detail,
      'Este dato sensible se consulta con el permiso de su categoría; no está disponible en el revelado individual.'
    )
    assert.equal(biometricBody.key, 'el-dato-no-se-puede-revelar-por-esta-via')
    assert.equal(biometricBody.code, SENSITIVE_DATA_READ_ERROR_CODES.NOT_REVEALABLE)

    const revealFirstname = await bearerGet(
      client,
      `/api/v1/pii/reveal/Person/personFirstname/${fixture!.person.personId}`,
      token,
      actor!
    )
    assert.equal(revealFirstname.status(), 422)
    assert.equal(revealFirstname.body().title, 'El campo solicitado no es un dato sensible')
    assert.equal(revealFirstname.body().key, 'el-campo-solicitado-no-es-un-dato-sensible')
    assert.equal(revealFirstname.body().code, SENSITIVE_DATA_READ_ERROR_CODES.NOT_CLASSIFIED)

    const after = await PiiAccessLog.query()
      .where('accessor_user_id', actor!.user.userId)
      .count('* as total')
    const beforeTotal = Number(
      (before[0] as { $extras?: { total?: string | number } }).$extras?.total ??
        (before[0] as { total?: string | number }).total ??
        0
    )
    const afterTotal = Number(
      (after[0] as { $extras?: { total?: string | number } }).$extras?.total ??
        (after[0] as { total?: string | number }).total ??
        0
    )
    assert.equal(afterTotal, beforeTotal)
  })

  test('R.9a: sin Authorization las pestañas del Anexo A son 401 y no filtran claro', async ({
    client,
    assert,
  }) => {
    const header = buHeader(actor!)
    const noteRes = await client
      .get(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .header('X-Business-Unit-Id', header)
    const salaryRes = await client
      .get(`/api/employees/${fixture!.employee.employeeId}/salary-history`)
      .header('X-Business-Unit-Id', header)
    const spouseRes = await client
      .get(`/api/employee-spouses/${extra!.spouse.employeeSpouseId}`)
      .header('X-Business-Unit-Id', header)
    assert.equal(noteRes.status(), 401)
    assert.equal(salaryRes.status(), 401)
    assert.equal(spouseRes.status(), 401)
    expectNoClearRemaining(noteRes.body(), assert)
    expectNoClearRemaining(salaryRes.body(), assert)
    expectNoClearRemaining(spouseRes.body(), assert)
    assert.notEqual(noteRes.body()?.key, 'PERM.DENIED')
  })

  test('R.9b: otra unidad de negocio es 404 y el JSON no trae notas ni importes claros', async ({
    client,
    assert,
  }) => {
    const other = await createActor('sens15-e2e-other')
    const foreignBase = await createSensitiveFixture(
      other.businessUnit.businessUnitId,
      'e2e15-foreign'
    )
    const foreignExtra = await createRemainingSensitiveFixture(other, foreignBase)
    try {
      await prepareSensitiveJourney(actor!.role.roleId, [...FIVE_READS, 'read'])
      const token = await sessionToken(client, actor!, assert)
      const noteRes = await bearerGet(
        client,
        `/api/work-disability-notes/${foreignExtra.note.workDisabilityNoteId}`,
        token,
        actor!
      )
      const salaryRes = await bearerGet(
        client,
        `/api/employees/${foreignBase.employee.employeeId}/salary-history`,
        token,
        actor!
      )
      const traumaRes = await bearerGet(
        client,
        `/api/traumatic-event-reports/${foreignExtra.trauma.traumaticEventReportId}`,
        token,
        actor!
      )
      assert.equal(noteRes.status(), 404)
      assert.equal(salaryRes.status(), 404)
      assert.include([403, 404], traumaRes.status())
      const dumped = `${JSON.stringify(noteRes.body() ?? {})}${JSON.stringify(salaryRes.body() ?? {})}${JSON.stringify(traumaRes.body() ?? {})}`
      assert.notInclude(dumped, CLEAR_REMAINING.disabilityDescription)
      assert.notInclude(dumped, CLEAR_REMAINING.traumaPeople)
      assert.notInclude(dumped, String(CLEAR_REMAINING.salaryDaily))
    } finally {
      await cleanupRemainingSensitiveFixture(foreignExtra)
      await cleanupSensitiveFixture(foreignBase)
      await cleanupActor(other)
    }
  })
```

No llamar `GET .../biometric-face-id`. El envelope 422 es `{title,detail,key,code}`, no el 404 `{type,title,message,data}`. ATS de otra BU puede ser 403 de scope del módulo o 404: ambos impiden la fuga; lo que **no** vale es 200 con `Ana y Luis`.

- [ ] **Step 2: Run e2e remaining-15 + regressions**

Run:

```bash
node ace test --files tests/e2e/sensitive_read_remaining_15.spec.ts,tests/e2e/sensitive_read_by_category.spec.ts,tests/functional/employees/employees_sensitive_read_remaining_15.spec.ts
```

Expected: PASS las tres suites. No debe haberse modificado el spec de las 11 ni el functional 15.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sensitive_read_remaining_15.spec.ts
git commit -m "$(cat <<'EOF'
test: cover remaining-column reveal unauth and cross-tenant journeys

EOF
)"
```

---

## Spec coverage (auto-revisión)

| Requisito | Task |
|-----------|------|
| CA-1 conteo biométrico en claro, string Finger ausente | 2 (R.1), 7 (R.8) |
| CA-2 RFC en DTO de **catálogo** (index) | 4 (R.5). Show queda en F.5/F.6. Enrolamiento HTTP/S3/socket fuera (F.8). |
| CA-3 importes `null` vs number, nunca `•••0.75` | 2 (null), 4 R.3 (number) |
| CA-4 seis de salud + aislamiento de otras categorías | 3 (R.2) |
| CA-5 PUT incapacidad sin descripción | 6 (R.7, después de GET tapado) |
| CA-6 echo `noMaskChar` en 5 superficies | 6 (R.7, un flujo) |
| CA-7 / CA-8 revelado 422 + cero bitácora | 7 (R.8, después de ver conteo) |
| CA-9 API omit teléfono cónyuge | 6 (R.7). CA-9 BO = Vitest, fuera de este plan. |
| GET cónyuge / emergencia / listado por empleado | 2 y 4 (hueco vs functional) |
| ATS **index** además del show | 2 y 3 |
| Bearer real | 1–4, 6–7 |
| root / DG | 5 |
| 401 Anexo A + tenant 404 | 7 (E.12 solo cubría ficha) |
| 11 columnas / customer / pilot / FA / banks | Fuera (e2e orden 30) |
| `TenantBillingProfile.rfc` / `ProveedorRepse.rfc` | Fuera |
| Face S3 / socket / consent serialize | Fuera (F.8/F.9/F.15) |

**Huecos conscientes:** Playwright de las 5 pantallas BO; interruptor ON; `Employee.dailySalary`; HTTP del proxy `employeeBiometricFaceIdPhotoUrlProxy`.
