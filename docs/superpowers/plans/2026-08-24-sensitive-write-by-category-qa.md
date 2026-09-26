# Escritura sensible por categoría — Plan de pruebas QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar la matriz QA de USRH1787204602831: unitarios de caracterización del motor ya entregado más una suite Japa HTTP (Functional / Integración) que demuestra CA-1 a CA-8 contra la app real, y aplicar el fix de producto si un test nuevo revela un hueco.

**Architecture:** El producto ya está en `feature/USRH1787204602831-escritura-sensibles-categoria`. Los unitarios existentes caracterizan el motor (códigos, helper 403, mapa de slugs, ALS, `evaluateEnforced`, mixin, cableado de modelos/catch/montajes). Este plan no reescribe esa red: la corre como batería y cierra el hueco HTTP de los 8 CA. Las fixtures reutilizan `tests/functional/employees/sensitive_read_by_category_support.ts` (`createActor`, `createSensitiveFixture`, `createRemainingSensitiveFixture`, `grantOnly`, `createSystemActor`). Si un test nuevo falla, el bug es de producto: se aplica el fix mínimo en el mismo task y se vuelve a correr; no se relaja la aserción.

**Tech Stack:** AdonisJS 6, Lucid, Japa (`@japa/runner` + HTTP client), `PermissionGateService.evaluateEnforced`, AsyncLocalStorage `SensitiveAccessContext`, mixin `withSensitiveWriteGuard`.

## Global Constraints

- Historia: USRH1787204602831 · orden 32 · tercera del tramo API. Spec: `spec-USRH1787204602831.md`. Plan de producto: `docs/superpowers/plans/2026-08-24-sensitive-write-by-category.md`.
- Rebanada **solo API**. Cero líneas de `valanserh-bo`. Sin migraciones. Sin seeders. Sin endpoints nuevos. Sin tocar `SENSITIVE_FIELDS`, `role_presets.ts` ni `employees_permission_catalog.ts` salvo que un gap de producto lo exija y el fix viva en el mismo task.
- Gobierna **20 de 27** columnas del catálogo (las 20 de los 10 modelos de expediente). Fuera de alcance, con dueño Wilvardo: `EmpresaContratante.rfc`, `TenantBillingProfile.rfc`, `EmployeeSalaryHistory.salaryDaily`, `PositionSalaryRange.minSalaryDaily` / `maxSalaryDaily`, `UserConsent.userConsentIp` / `userConsentUserAgent`.
- Eco de máscara e importación Excel **no se neutralizan aquí** (orden 33). El mixin **sí** se dispara en el import HTTP si hay transición real. `EMP.SENS.WRITE.IMPORT_FORBIDDEN` **no se declara**.
- `evaluate` no se toca. La escritura sensible usa `evaluateEnforced`. `module-not-enforced` no otorga escritura. Fail-closed de permiso: `unresolved` → 403 `EMP.SENS.WRITE.UNRESOLVED`. Fail-open de contexto: sin ALS el mixin no exige.
- Bypass `standard`: `root` y `owner` escriben sin los cinco slugs. `super-administrador` sí necesita el permiso.
- Un gate por ruta. Prohibido montar `permissionGate(sensitive-*-write)` en rutas. Prohibido `RoleService.hasAccess`.
- La exigencia se dispara por **transición de valor**, no por presencia de la clave. `null` / `undefined` / `''` son equivalentes (`normalizeToken`).
- Petición mixta: rechazo total. Alta = misma regla. Consulta nunca 403 de escritura (CA-6: `runUnguarded` solo en `updateToken`).
- TDD de caracterización: el producto ya existe. Cada test nuevo **debe pasar**. Si falla, el gap se aplica en producto (mismo task) y se re-corre; no se relaja la aserción.
- Código, comentarios y docs en español; identificadores en inglés. Commits: Conventional Commits, tipo en inglés, descripción en español.
- Tras cada grupo HTTP el interruptor `system_module_permission_enforcement_active` de `employees` queda `false`.

---

## Contratos fijos de la suite

### Interruptor

La escritura sensible **no respeta** el interruptor del módulo. `evaluateEnforced` decide con el módulo ON u OFF. Las pruebas de CA corren con el interruptor **OFF** (estado de entrega) salvo F.11 (CA-7 ON vs OFF, mismo 403). Tras cada grupo: `employees.systemModulePermissionEnforcementActive = false`.

### Oráculo de denegación (nunca valores)

```typescript
export function assertWriteForbidden(response: { status: () => number; body: () => Record<string, unknown> }, assert: Assert, categoryLabelEs: string) {
  assert.equal(response.status(), 403)
  const body = response.body()
  assert.equal(body.code, 'EMP.SENS.WRITE.FORBIDDEN')
  assert.equal(body.key, 'sin-permiso-para-modificar-datos-sensibles')
  assert.equal(body.title, 'Sin permiso para modificar datos sensibles')
  assert.include(String(body.detail), categoryLabelEs)
  assert.include(String(body.detail), 'Ningún dato de la petición se guardó')
  assert.notInclude(JSON.stringify(body), '••••')
}

export function assertWriteUnresolved(response: { status: () => number; body: () => Record<string, unknown> }, assert: Assert) {
  assert.equal(response.status(), 403)
  const body = response.body()
  assert.equal(body.code, 'EMP.SENS.WRITE.UNRESOLVED')
  assert.equal(body.key, 'no-se-pudo-determinar-el-permiso-de-escritura')
  assert.notInclude(String(body.detail).toLowerCase(), 'identificacion')
  assert.notInclude(String(body.detail).toLowerCase(), 'clabe')
}
```

Etiquetas ES: identificación → `datos de identificación`; contacto → `datos de contacto`; financiero → `datos financieros`; salud → `datos de salud`; biométrico → `datos biométricos`.

Prohibido asertar el valor intentado o el guardado dentro de `title`/`detail`/`key`/`code`. Cada test HTTP que deniega vuelve a leer la fila y confirma que el valor original no cambió.

### Rutas HTTP de esta matriz

| Superficie | Método | Body de escritura |
|------------|--------|-------------------|
| Persona | `PUT /api/persons/:personId` | `personRfc`, `personCurp`, `personPhone`, `personSecondLastname`, `personMaritalStatus` |
| Banco | `POST /api/employee-banks` · `PUT /api/employee-banks/:id` | `employeeBankAccountClabe`, `employeeBankAccountCurrencyType` |
| Médica | `PUT /api/employee-medical-conditions/:id` | `employeeMedicalConditionDiagnosis` |
| Cónyuge | `PUT /api/employee-spouses/:id` | `employeeSpousePhone`, `employeeSpouseOcupation` |
| Emergencia | `PUT /api/employee-emergency-contacts/:id` | `employeeEmergencyContactPhone`, `employeeEmergencyContactRelationship` |
| Incapacidad | `PUT /api/work-disability-notes/:id` | `workDisabilityNoteDescription` |
| Trauma | `PUT /api/traumatic-event-reports/:id` | `traumaticEventReportDescription` |
| Lactancia | `PUT /api/employee-lactation-periods/:id` | `employeeLactationPeriodNotes` |
| Biométrico enrolamiento | `PUT /api/employees/:employeeId/biometrics/fingers` | `{ fingers: [1, 2] }` |
| Foto biométrica | `PUT /api/employees/:employeeId/biometric-face-id` | multipart `photo` |
| Consulta foto | `GET /api/employees/:employeeId/biometric-face-id-with-token/:token` | token distinto → `updateToken` |

Todas (salvo landlord, fuera de alcance) llevan `X-Business-Unit-Id` = `actor.businessUnit.businessUnitPublicId` y `.loginAs(actor.user)`.

### Headers y auth

```typescript
.loginAs(actor.user).header('X-Business-Unit-Id', buHeader(actor))
```

`buHeader` ya existe en `sensitive_read_by_category_support.ts` y devuelve el public id (string). No envolverlo en otro objeto.

### Slugs de pestaña necesarios (gate ordinario, no categoría)

Con interruptor OFF el `permissionGate` de ruta no niega. Aun así cada test concede el slug de pestaña **más** el de categoría cuando el escenario lo pide, para no confundir `PERM.DENIED` de pestaña con `EMP.SENS.WRITE.*`.

| Superficie | Slug de pestaña |
|------------|-----------------|
| Persona (colaborador) | `tab-persona-write` |
| Banco | `tab-bancos-write` |
| Médica | `tab-condicion-medica-write` |
| Cónyuge / emergencia | `tab-persona-write` |
| Incapacidad | `manage-work-disabilities` |
| Trauma | módulo `traumatic-event-reports` + `write` vía `grantModuleAction` |
| Lactancia | `tab-periodos-lactancia-write` |
| Dedos | `upload-fingers` |
| Foto PUT | `upload-face-id` |
| Foto GET token | `tab-biometricos-read` |

### Eco de máscara (no 403)

`noMaskCharRule` rechaza `•` (U+2022) **antes** del mixin. CA-1 eco: `400` o `422`, `code` distinto de `EMP.SENS.WRITE.FORBIDDEN`. Nunca 403 de escritura.

### Huecos declarados (no automatizar)

| Tema | Por qué |
|------|---------|
| `/api/platform/users` | Sin ALS. Mixin fail-open. Dueño landlord. |
| Excel / `importFromExcel` | Orden 33. El helper 403 ya está cableado; la matriz HTTP del import no es de esta HU. |
| Sincronización `/api/synchronization/employees` | El grupo ya monta `sensitiveAccess`. Censo unitario lo cubre. No hay fixture de sync en esta rebanada. |
| 7 columnas de Wilvardo | Fuera de los 10 modelos. |
| `REVOKE` / `reassign` de lactancia | Pueden no tocar `employeeLactationPeriodNotes`. La matriz usa `PUT` del periodo. |

---

## Matriz Unit (regresión — no reescribir)

Automatizado. Correr, no duplicar. Si alguno falla, el gap es de producto: fix en el mismo task.

| # | Escenario | Archivo |
|---|-----------|---------|
| U.1 | Códigos FORBIDDEN / UNRESOLVED; sin IMPORT_FORBIDDEN | `tests/unit/constants/sensitive_data_write_error_codes.spec.ts` |
| U.2 | Helper 403 nombra categoría, no valores; UNRESOLVED no nombra categoría | `tests/unit/helpers/sensitive_data_write_api_error.spec.ts` |
| U.3 | Mapa de cinco slugs `-write` | `tests/unit/constants/employees_sensitive_write_permissions.spec.ts` |
| U.4 | ALS `canWrite` / `writeDecision` / `runUnguarded` | `tests/unit/utils/sensitive_access_context.spec.ts` |
| U.5 | `evaluateEnforced` + classify + `canWrite` en `runWithSensitiveReadDecisions` | `tests/unit/helpers/sensitive_read_decisions.spec.ts` |
| U.6 | Mixin: fail-open, no transición, FORBIDDEN, mixto, alta, UNRESOLVED, unguarded, salud | `tests/unit/mixins/with_sensitive_write_guard.spec.ts` |
| U.7 | Cableado textual de 10 modelos | `tests/unit/mixins/sensitive_write_guard_wiring.spec.ts` |
| U.8 | Cableado real `Person.save()` | `tests/functional/employees/sensitive_write_guard_wiring.spec.ts` |
| U.9 | `updateToken` envuelto en `runUnguarded` (1 sola llamada) | `tests/unit/services/employee_biometric_face_id_update_token_unguarded.spec.ts` |
| U.10 | 30 catches HTTP reconocen la excepción | `tests/unit/controllers/sensitive_write_catch_wiring.spec.ts` |
| U.11 | `replacePhoto` re-lanza `SensitiveDataWriteError` | `tests/unit/services/employee_biometric_face_id_replace_photo_sensitive_write.spec.ts` |
| U.12 | Montajes de grupo + sync + hueco landlord | `tests/unit/routes/sensitive_access_context_mounts.spec.ts` |
| U.13 | Soft-rollout POST bancos sin grants → FORBIDDEN | `tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts` |
| U.14 | 403 HTTP bancos + foto (no borra S3) | `tests/functional/employees/employees_sensitive_write_guard_http.spec.ts` |
| U.15 | **Hueco:** `normalizeToken` exportado (null/`''`/`undefined`) | Task 1 — `tests/unit/helpers/employee_termination_record.spec.ts` |

Batería:

```bash
node ace test tests/unit/constants/sensitive_data_write_error_codes.spec.ts tests/unit/helpers/sensitive_data_write_api_error.spec.ts tests/unit/constants/employees_sensitive_write_permissions.spec.ts tests/unit/utils/sensitive_access_context.spec.ts tests/unit/helpers/sensitive_read_decisions.spec.ts tests/unit/mixins/with_sensitive_write_guard.spec.ts tests/unit/mixins/sensitive_write_guard_wiring.spec.ts tests/functional/employees/sensitive_write_guard_wiring.spec.ts tests/unit/services/employee_biometric_face_id_update_token_unguarded.spec.ts tests/unit/controllers/sensitive_write_catch_wiring.spec.ts tests/unit/services/employee_biometric_face_id_replace_photo_sensitive_write.spec.ts tests/unit/routes/sensitive_access_context_mounts.spec.ts tests/unit/helpers/employee_termination_record.spec.ts
```

---

## Matriz Functional / Integración (nuevo)

Japa HTTP real. Interruptor OFF salvo F.11.

| # | CA | Escenario | Criterio de éxito |
|---|----|-----------|-------------------|
| F.1 | CA-1 | `tab-persona-write`, cero `-write` de categoría. PUT persona: `personRfc: null` + cambio de segundo apellido y estado civil | **201**. RFC cifrado intacto. Cero 403. |
| F.2 | CA-1 | Mismo actor. PUT persona con `personRfc: '•••••••••2AB3'` (eco de máscara) | **400 o 422**. `code` ≠ `EMP.SENS.WRITE.FORBIDDEN`. RFC intacto. |
| F.3 | CA-2 | Mismo actor. PUT persona con RFC distinto válido | **403** FORBIDDEN, `datos de identificación`. Body sin RFC nuevo ni viejo. Fila intacta. |
| F.4 | CA-3 | `tab-persona-write` + `sensitive-contacto-write`, sin identificación. PUT: teléfono nuevo + CURP nueva | **403** identificación. Teléfono **tampoco** se guarda. |
| F.5 | CA-4 | `tab-bancos-write` sin financiero. PUT banco CLABE distinta | **403** financieros. CLABE intacta. |
| F.6 | CA-4 | Mismo actor. PUT banco `employeeBankAccountClabe: null` + cambio de moneda | **200**. CLABE intacta. Moneda sí cambia. |
| F.7 | CA-5 | POST banco con CLABE, sin financiero | **403**. Cero filas nuevas. |
| F.8 | CA-5 | POST banco con `sensitive-financiero-write` | **201**. Fila creada. |
| F.9 | CA-6 | GET foto con token distinto, `tab-biometricos-read`, sin `sensitive-biometrico-write` | **200**. Token renovado en BD. Cero 403. |
| F.10 | CA-7 | Interruptor OFF. Rol cliente, cambio de CLABE | **403** FORBIDDEN (igual que U.13). |
| F.11 | CA-7 | Interruptor ON. Mismo PUT de CLABE | **403** FORBIDDEN. Luego OFF. |
| F.12 | CA-7 | `owner` y `root` sin slugs `-write`. PUT CLABE | **200**. CLABE nueva persistida. Restaurar grants de sistema. |
| F.13 | CA-7 | `super-administrador` sin slugs. PUT CLABE | **403** FORBIDDEN. No bypass. |
| F.14 | CA-7 | Usuario sin `roleId` (identity irresoluble). PUT CLABE | **403** `UNRESOLVED`. |
| F.15 | CA-8 | Sin ningún `-write` de categoría. PUT persona: nombre / estado civil / ciudad | **201**. |
| F.16 | CA-8 | PUT médica: diagnóstico nuevo, `tab-condicion-medica-write`, sin salud | **403** salud. Diagnóstico intacto. |
| F.17 | CA-8 | PUT foto biométrica, `upload-face-id`, sin biométrico | **403** biométricos. URL previa intacta. Cubierto por U.14; este task lo reafirma en la suite nueva o lo importa por nombre si ya pasa. |
| F.18 | — | Cónyuge / emergencia / nota / trauma / lactancia / dedos: transición sin categoría | **403** de la categoría correcta. Valor original intacto. |
| F.19 | — | Cada superficie de F.18: campo no sensible cambia, sensible ausente o igual | **200/201**. Campo sensible intacto. |

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `tests/unit/helpers/employee_termination_record.spec.ts` | U.15: grupo `normalizeToken` si aún no cubre null/`''`/`undefined`. |
| `tests/functional/employees/sensitive_write_by_category_support.ts` | Oráculos 403, payloads de persona/banco, helpers de recarga Lucid. Reexporta fixtures del support de lectura. |
| `tests/functional/employees/employees_sensitive_write_by_category.spec.ts` | Suite HTTP F.1–F.19. |

**Producto:** no se toca salvo gap. Si un test nuevo falla, el arreglo vive en el archivo de producto del síntoma (mixin, helper, controller, service) **en el mismo task**, con un commit `fix:` aparte del `test:`.

**No se crea:** suite Excel, suite landlord, suite de las 7 columnas de Wilvardo, montaje extra de `permissionGate(sensitive-*-write)`.

---

### Task 1: Unitario U.15 — `normalizeToken` y batería del motor

**Files:**
- Modify: `tests/unit/helpers/employee_termination_record.spec.ts` (añadir grupo si falta equivalencia)
- Test: el mismo archivo + batería de la matriz Unit

**Interfaces:**
- Consumes: `normalizeToken(value: unknown): string | null` desde `#helpers/employee_termination_record`
- Produces: cobertura U.15. Tasks HTTP asumen `null`/`''`/`undefined` equivalentes.

- [ ] **Step 1: Write the characterization test**

Abrir `tests/unit/helpers/employee_termination_record.spec.ts`. Si ya existe un grupo `normalizeToken` con los tres vacíos y un string, **no reescribirlo**: pasar al Step 2. Si falta, añadir al final:

```typescript
import { normalizeToken } from '#helpers/employee_termination_record'

test.group('normalizeToken', () => {
  test('null, undefined y cadena vacía son el mismo token', ({ assert }) => {
    assert.equal(normalizeToken(null), null)
    assert.equal(normalizeToken(undefined), null)
    assert.equal(normalizeToken(''), null)
    assert.equal(normalizeToken('VARL850602AB3'), 'VARL850602AB3')
    assert.notEqual(normalizeToken('VARL850602AB3'), normalizeToken(null))
  })
})
```

- [ ] **Step 2: Run the new test**

Run: `node ace test tests/unit/helpers/employee_termination_record.spec.ts`

Expected: PASS. Si FAIL porque `normalizeToken` no está exportado, eso es gap de producto: en `app/helpers/employee_termination_record.ts` cambiar `function normalizeToken` por `export function normalizeToken` **sin cambiar el cuerpo**, re-correr, y commitear `fix:` aparte.

- [ ] **Step 3: Run the unit battery**

Run the command from the Unit matrix.

Expected: PASS. Si algún archivo de la lista no existe (nombre drift), corregir **solo** la lista. Si un test del motor falla, parar: es regresión de la HU, no de QA.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/helpers/employee_termination_record.spec.ts
git commit -m "test: Cubrir equivalencia de normalizeToken para escritura sensible"
```

Si hubo fix de export:

```bash
git add app/helpers/employee_termination_record.ts
git commit -m "fix: Exportar normalizeToken para la guarda de escritura sensible"
```

---

### Task 2: Support HTTP y humo CA-1 (campo no sensible)

**Files:**
- Create: `tests/functional/employees/sensitive_write_by_category_support.ts`
- Create: `tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

**Interfaces:**
- Consumes: `createActor`, `cleanupActor`, `createSensitiveFixture`, `cleanupSensitiveFixture`, `createRemainingSensitiveFixture`, `cleanupRemainingSensitiveFixture`, `grantOnly`, `grantModuleAction`, `createSystemActor`, `cleanupSystemActor`, `snapshotAndClearEmployeesGrants`, `restoreEmployeesGrants`, `buHeader`, `CLEAR_FIXED`, `CLEAR_REMAINING`, tipos `TenantActor`, `SensitiveFixture`, `RemainingSensitiveFixture`, `SystemActor` desde `./sensitive_read_by_category_support.js`
- Produces:
  - `RFC_ORIGINAL = 'VACW850312J95'`
  - `RFC_NUEVO = 'VARL850602AB3'`
  - `CURP_NUEVA = 'AAAA800101HDFRRN09'`
  - `TELEFONO_NUEVO = '5511111111'`
  - `CLABE_NUEVA = '012180009999999999'`
  - `MASK_ECHO = '•••••••••2AB3'`
  - `assertWriteForbidden`, `assertWriteUnresolved`
  - `personUpdateBase(person, extras)`
  - `reloadPerson(personId)`, `reloadBank(bankId)`

- [ ] **Step 1: Write the support module**

Crear `tests/functional/employees/sensitive_write_by_category_support.ts`:

```typescript
import type { Assert } from '@japa/assert'
import Person from '#models/person'
import EmployeeBank from '#models/employee_bank'
import { CLEAR_FIXED } from './sensitive_read_by_category_support.js'

export const RFC_ORIGINAL = CLEAR_FIXED.rfc
export const RFC_NUEVO = 'VARL850602AB3'
export const CURP_NUEVA = 'AAAA800101HDFRRN09'
export const TELEFONO_NUEVO = '5511111111'
export const CLABE_NUEVA = '012180009999999999'
export const MASK_ECHO = '•••••••••2AB3'

export function assertWriteForbidden(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert,
  categoryLabelEs: string
) {
  assert.equal(response.status(), 403)
  const body = response.body()
  assert.equal(body.code, 'EMP.SENS.WRITE.FORBIDDEN')
  assert.equal(body.key, 'sin-permiso-para-modificar-datos-sensibles')
  assert.equal(body.title, 'Sin permiso para modificar datos sensibles')
  assert.include(String(body.detail), categoryLabelEs)
  assert.include(String(body.detail), 'Ningún dato de la petición se guardó')
  assert.notInclude(JSON.stringify(body), RFC_NUEVO)
  assert.notInclude(JSON.stringify(body), CLABE_NUEVA)
  assert.notInclude(JSON.stringify(body), '••••')
}

export function assertWriteUnresolved(
  response: { status: () => number; body: () => Record<string, unknown> },
  assert: Assert
) {
  assert.equal(response.status(), 403)
  const body = response.body()
  assert.equal(body.code, 'EMP.SENS.WRITE.UNRESOLVED')
  assert.equal(body.key, 'no-se-pudo-determinar-el-permiso-de-escritura')
  assert.notInclude(String(body.detail).toLowerCase(), 'identificacion')
  assert.notInclude(String(body.detail).toLowerCase(), 'clabe')
}

export function personUpdateBase(
  person: Person,
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    personFirstname: person.personFirstname,
    personLastname: person.personLastname,
    personSecondLastname: person.personSecondLastname ?? '',
    personGender: person.personGender ?? 'M',
    personBirthday: person.personBirthday ?? '1990-01-15',
    personMaritalStatus: person.personMaritalStatus ?? 'single',
    personPlaceOfBirthCountry: person.personPlaceOfBirthCountry ?? 'México',
    personPlaceOfBirthState: person.personPlaceOfBirthState ?? 'CDMX',
    personPlaceOfBirthCity: person.personPlaceOfBirthCity ?? 'CDMX',
    ...extras,
  }
}

export async function reloadPerson(personId: number): Promise<Person> {
  return Person.findOrFail(personId)
}

export async function reloadBank(employeeBankId: number): Promise<EmployeeBank> {
  return EmployeeBank.findOrFail(employeeBankId)
}
```

- [ ] **Step 2: Write the smoke spec**

Crear `tests/functional/employees/employees_sensitive_write_by_category.spec.ts`:

```typescript
import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import {
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  grantOnly,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type TenantActor,
} from './sensitive_read_by_category_support.js'
import {
  personUpdateBase,
  reloadPerson,
  RFC_ORIGINAL,
} from './sensitive_write_by_category_support.js'

test.group('Escritura sensible por categoría — HTTP', (group) => {
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
    actor = await createActor('sens-write-http')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'sens-write')
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

  test('CA-1: PUT persona con RFC null y cambio de apellido no exige categoría', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const person = fixture!.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(
        personUpdateBase(person, {
          personRfc: null,
          personSecondLastname: 'ApellidoQa',
          personMaritalStatus: 'married',
        })
      )

    assert.equal(response.status(), 201)
    assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
    assert.equal(reloaded.personSecondLastname, 'ApellidoQa')
    assert.equal(reloaded.personMaritalStatus, 'married')
  })
})
```

`PersonService.update` trata `null` de `personRfc` como "no actualizar". El mixin no ve transición. Si el status no es 201, inspeccionar `response.body()`: un 422 es validator (completar `personUpdateBase`), un 403 `PERM.DENIED` es el gate de colaborador (falta `tab-persona-write` o interruptor ON). No cambiar producto para "hacer pasar" un 422 de payload incompleto.

- [ ] **Step 3: Run the smoke test**

Run: `node ace test tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

Expected: PASS. Si FAIL 403 FORBIDDEN con `personRfc: null`, gap de producto: `assertSensitiveWriteAllowed` no está usando `normalizeToken` en alta/eco. Fix en `app/mixins/with_sensitive_write_guard.ts`, commit `fix:`, re-correr.

- [ ] **Step 4: Commit**

```bash
git add tests/functional/employees/sensitive_write_by_category_support.ts tests/functional/employees/employees_sensitive_write_by_category.spec.ts
git commit -m "test: Agregar fixtures HTTP de escritura sensible por categoría"
```

---

### Task 3: F.2 / F.3 — CA-1 eco de máscara y CA-2 transición de RFC

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

**Interfaces:**
- Consumes: `assertWriteForbidden`, `MASK_ECHO`, `RFC_NUEVO`, `reloadPerson`, `personUpdateBase`
- Produces: F.2 (CA-1 eco) y F.3 (CA-2). Task 4 asume que un RFC distinto sin identificación es 403.

- [ ] **Step 1: Write the two tests**

Añadir imports: `assertWriteForbidden`, `MASK_ECHO`, `RFC_NUEVO` desde el support de escritura.

```typescript
  test('CA-1: eco de máscara en RFC es 400/422, nunca 403 de escritura', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const person = fixture!.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(personUpdateBase(person, { personRfc: MASK_ECHO }))

    assert.isTrue(response.status() === 400 || response.status() === 422)
    assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
  })

  test('CA-2: RFC distinto sin identificación responde 403 y no guarda', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const person = fixture!.person
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(personUpdateBase(person, { personRfc: RFC_NUEVO }))

    assertWriteForbidden(response, assert, 'datos de identificación')
    assert.notInclude(JSON.stringify(response.body()), RFC_NUEVO)
    assert.notInclude(JSON.stringify(response.body()), RFC_ORIGINAL)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
  })
```

- [ ] **Step 2: Run the spec**

Run: `node ace test tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

Expected: PASS. Si el eco llega a 403, Vine no aplicó `noMaskCharRule` en `personRfc`: gap de validator (`app/validators/person.ts`), no relajar a 403. Si CA-2 responde 201, el mixin no está en `Person` o el catch no traduce: gap de producto (Tasks 7/9 del plan de implementación).

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_write_by_category.spec.ts
git commit -m "test: Cubrir CA-1 de eco de máscara y CA-2 de RFC"
```

---

### Task 4: F.4 — CA-3 petición mixta atómica

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

**Interfaces:**
- Consumes: `grantOnly(['tab-persona-write', 'sensitive-contacto-write'])`, `CURP_NUEVA`, `TELEFONO_NUEVO`, `CLEAR_FIXED`
- Produces: F.4 (CA-3). Task 5 no depende de este grant.

- [ ] **Step 1: Write the mixed-request test**

```typescript
  test('CA-3: teléfono nuevo más CURP nueva sin identificación no guarda el teléfono', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write', 'sensitive-contacto-write'])
    const person = fixture!.person
    const phoneBefore = person.personPhone
    const curpBefore = person.personCurp
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(
        personUpdateBase(person, {
          personPhone: TELEFONO_NUEVO,
          personCurp: CURP_NUEVA,
        })
      )

    assertWriteForbidden(response, assert, 'datos de identificación')
    assert.notInclude(JSON.stringify(response.body()), TELEFONO_NUEVO)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personPhone, phoneBefore)
    assert.equal(reloaded.personCurp, curpBefore)
  })
```

- [ ] **Step 2: Run the spec**

Run: `node ace test tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

Expected: PASS. Si el 403 es de contacto, `SENSITIVE_WRITE_CATEGORY_ORDER` está mal. Fix en `app/mixins/with_sensitive_write_guard.ts` (`identificacion` primero). Si el teléfono sí se guardó, el `save()` no es atómico respecto al throw: gap del mixin (debe lanzar en `before('save')`).

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_write_by_category.spec.ts
git commit -m "test: Cubrir CA-3 de petición mixta atómica"
```

---

### Task 5: F.5 / F.6 / F.7 / F.8 — CA-4 y CA-5 bancos

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

**Interfaces:**
- Consumes: `reloadBank`, `CLABE_NUEVA`, `CLEAR_FIXED.clabe`, `tab-bancos-write`, `sensitive-financiero-write`
- Produces: F.5–F.8 (CA-4, CA-5)

- [ ] **Step 1: Write the four bank tests**

`EmployeeBankService` / controller pueden exigir `employeeBankAccountCurrencyType` y `bankId` en el PUT. Enviar ambos. `CLEAR_FIXED.clabe` es la CLABE del fixture de lectura (`012345678901234567`). Lucid `EmployeeBank.find` descifra `employeeBankAccountClabe` vía `consume`.

```typescript
  test('CA-4: CLABE distinta sin financiero responde 403 y no cambia', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const bank = fixture!.bank
    const response = await client
      .put(`/api/employee-banks/${bank.employeeBankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: CLABE_NUEVA,
        employeeBankAccountCurrencyType: 'USD',
        bankId: bank.bankId,
      })

    assertWriteForbidden(response, assert, 'datos financieros')
    const reloaded = await reloadBank(bank.employeeBankId)
    assert.equal(reloaded.employeeBankAccountClabe, CLEAR_FIXED.clabe)
  })

  test('CA-4: CLABE null más cambio de moneda no exige financiero', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const bank = fixture!.bank
    const currencyBefore = bank.employeeBankAccountCurrencyType
    const newCurrency = currencyBefore === 'MXN' ? 'USD' : 'MXN'
    const response = await client
      .put(`/api/employee-banks/${bank.employeeBankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: null,
        employeeBankAccountCurrencyType: newCurrency,
        bankId: bank.bankId,
      })

    assert.equal(response.status(), 200)
    const reloaded = await reloadBank(bank.employeeBankId)
    assert.equal(reloaded.employeeBankAccountClabe, CLEAR_FIXED.clabe)
    assert.equal(reloaded.employeeBankAccountCurrencyType, newCurrency)
  })

  test('CA-5: POST banco con CLABE sin financiero no crea fila', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const before = await EmployeeBank.query().where('employee_id', fixture!.employee.employeeId)
    const response = await client
      .post('/api/employee-banks')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: CLABE_NUEVA,
        employeeBankAccountCurrencyType: 'MXN',
        employeeId: fixture!.employee.employeeId,
        bankId: 1,
      })

    assertWriteForbidden(response, assert, 'datos financieros')
    const after = await EmployeeBank.query().where('employee_id', fixture!.employee.employeeId)
    assert.equal(after.length, before.length)
  })

  test('CA-5: POST banco con financiero crea la fila', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write', 'sensitive-financiero-write'])
    const response = await client
      .post('/api/employee-banks')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: '012180001234567888',
        employeeBankAccountCurrencyType: 'MXN',
        employeeId: fixture!.employee.employeeId,
        bankId: 1,
      })

    assert.equal(response.status(), 201)
    const createdId = Number(response.body()?.data?.employeeBank?.employeeBankId)
    assert.isAbove(createdId, 0)
    const created = await reloadBank(createdId)
    assert.equal(created.employeeBankAccountClabe, '012180001234567888')
    await created.delete()
  })
```

Añadir import: `import EmployeeBank from '#models/employee_bank'`.

Si el PUT con `clabe: null` responde 422, el validator no admite null (solo omitir). En ese caso **omitir** la clave `employeeBankAccountClabe` del JSON (presencia ≠ transición). Si aun así 403, el controller asigna `''` y el mixin no normaliza: gap de producto en controller o mixin.

- [ ] **Step 2: Run the spec**

Run: `node ace test tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_write_by_category.spec.ts
git commit -m "test: Cubrir CA-4 y CA-5 de escritura financiera"
```

---

### Task 6: F.9 — CA-6 consulta de foto no es 403

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

**Interfaces:**
- Consumes: `extra.faceId`, `CLEAR_REMAINING.faceToken`, `tab-biometricos-read`
- Produces: F.9 (CA-6)

- [ ] **Step 1: Write the photo-token test**

`getPhotoToken` llama `UploadService.getDownloadLink`. Si S3 no tiene el objeto, el controller puede 500 **después** de renovar el token. El oráculo de esta HU es: status ≠ 403 y `employeeBiometricFaceIdToken` en BD === token nuevo. Si 500 por S3, asertar solo BD + `response.body()?.code !== 'EMP.SENS.WRITE.FORBIDDEN'`.

```typescript
  test('CA-6: GET foto con token distinto sin biométrico-write responde 200 y renueva', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-biometricos-read'])
    const tokenNuevo = `face-token-ca6-${Date.now()}`
    const response = await client
      .get(
        `/api/employees/${fixture!.employee.employeeId}/biometric-face-id-with-token/${tokenNuevo}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.code, 'EMP.SENS.WRITE.FORBIDDEN')
    await extra!.faceId.refresh()
    assert.equal(extra!.faceId.employeeBiometricFaceIdToken, tokenNuevo)
  })
```

- [ ] **Step 2: Run the spec**

Run: `node ace test tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

Expected: PASS (token renovado). Si 403 FORBIDDEN biométrico, `updateToken` no está en `runUnguarded`: gap en `app/services/employee_biometric_face_id_service.ts`.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_write_by_category.spec.ts
git commit -m "test: Cubrir CA-6 de renovación de token biométrico"
```

---

### Task 7: F.10–F.14 — CA-7 interruptor, bypass y unresolved

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

**Interfaces:**
- Consumes: `createSystemActor`, `cleanupSystemActor`, `snapshotAndClearEmployeesGrants`, `restoreEmployeesGrants`, `User`
- Produces: F.10–F.14 (CA-7)

- [ ] **Step 1: Write switch / bypass / unresolved tests**

Añadir imports: `User from '#models/user'`, `createSystemActor`, `cleanupSystemActor`, `snapshotAndClearEmployeesGrants`, `restoreEmployeesGrants`.

```typescript
  test('CA-7: con interruptor OFF el cambio de CLABE sin financiero es 403', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const response = await client
      .put(`/api/employee-banks/${fixture!.bank.employeeBankId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: CLABE_NUEVA,
        employeeBankAccountCurrencyType: 'MXN',
        bankId: fixture!.bank.bankId,
      })
    assertWriteForbidden(response, assert, 'datos financieros')
  })

  test('CA-7: con interruptor ON el cambio de CLABE sin financiero sigue 403', async ({
    client,
    assert,
  }) => {
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    try {
      await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
      const response = await client
        .put(`/api/employee-banks/${fixture!.bank.employeeBankId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
        .json({
          employeeBankAccountClabe: CLABE_NUEVA,
          employeeBankAccountCurrencyType: 'MXN',
          bankId: fixture!.bank.bankId,
        })
      assertWriteForbidden(response, assert, 'datos financieros')
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  async function putClabeAs(user: User) {
    return client
      .put(`/api/employee-banks/${fixture!.bank.employeeBankId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeBankAccountClabe: CLABE_NUEVA,
        employeeBankAccountCurrencyType: 'MXN',
        bankId: fixture!.bank.bankId,
      })
  }
```

`client` no existe fuera del test: **no extraer `putClabeAs` al grupo**. Copiar el PUT dentro de cada test o declarar un helper de módulo que reciba `client`.

```typescript
import type { ApiClient } from '@japa/api-client'
import type User from '#models/user'

async function putBankClabe(
  client: ApiClient,
  actor: TenantActor,
  bankId: number,
  bankRowBankId: number,
  user: User,
  clabe: string
) {
  return client
    .put(`/api/employee-banks/${bankId}`)
    .loginAs(user)
    .header('X-Business-Unit-Id', buHeader(actor))
    .json({
      employeeBankAccountClabe: clabe,
      employeeBankAccountCurrencyType: 'MXN',
      bankId: bankRowBankId,
    })
}
```

Pegar `putBankClabe` **arriba** del `test.group` (mismo archivo). Tests de bypass:

```typescript
  test('CA-7: owner sin slugs write cambia la CLABE', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'sens-write-owner', actor!.businessUnit.businessUnitId)
    const snapshot = await snapshotAndClearEmployeesGrants(owner.roleId)
    try {
      const clabeOwner = '012180001234567701'
      const response = await putBankClabe(
        client,
        actor!,
        fixture!.bank.employeeBankId,
        fixture!.bank.bankId,
        owner.user,
        clabeOwner
      )
      assert.equal(response.status(), 200)
      const reloaded = await reloadBank(fixture!.bank.employeeBankId)
      assert.equal(reloaded.employeeBankAccountClabe, clabeOwner)
      reloaded.employeeBankAccountClabe = CLEAR_FIXED.clabe
      await reloaded.save()
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(owner)
    }
  })

  test('CA-7: root sin slugs write cambia la CLABE', async ({ client, assert }) => {
    const root = await createSystemActor('root', 'sens-write-root', actor!.businessUnit.businessUnitId)
    const snapshot = await snapshotAndClearEmployeesGrants(root.roleId)
    try {
      const clabeRoot = '012180001234567702'
      const response = await putBankClabe(
        client,
        actor!,
        fixture!.bank.employeeBankId,
        fixture!.bank.bankId,
        root.user,
        clabeRoot
      )
      assert.equal(response.status(), 200)
      const reloaded = await reloadBank(fixture!.bank.employeeBankId)
      assert.equal(reloaded.employeeBankAccountClabe, clabeRoot)
      reloaded.employeeBankAccountClabe = CLEAR_FIXED.clabe
      await reloaded.save()
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(root)
    }
  })

  test('CA-7: super-administrador sin slugs no tiene bypass', async ({ client, assert }) => {
    const dg = await createSystemActor(
      'super-administrador',
      'sens-write-dg',
      actor!.businessUnit.businessUnitId
    )
    const snapshot = await snapshotAndClearEmployeesGrants(dg.roleId)
    try {
      const response = await putBankClabe(
        client,
        actor!,
        fixture!.bank.employeeBankId,
        fixture!.bank.bankId,
        dg.user,
        CLABE_NUEVA
      )
      assertWriteForbidden(response, assert, 'datos financieros')
    } finally {
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(dg)
    }
  })

  test('CA-7: usuario sin roleId responde UNRESOLVED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-bancos-write'])
    const previousRoleId = actor!.user.roleId
    actor!.user.roleId = null as unknown as number
    await actor!.user.save()
    try {
      const response = await putBankClabe(
        client,
        actor!,
        fixture!.bank.employeeBankId,
        fixture!.bank.bankId,
        actor!.user,
        CLABE_NUEVA
      )
      assertWriteUnresolved(response, assert)
    } finally {
      actor!.user.roleId = previousRoleId
      await actor!.user.save()
    }
  })
```

Si `User.roleId` no admite `null` (columna NOT NULL), el test UNRESOLVED **se recorta** a unitario ya cubierto por U.5 (`classifySensitiveWriteDecision` + `resolveSensitiveWriteDecisions` con reason `unresolved`). En ese caso sustituir el HTTP por:

```typescript
  test('CA-7: write unresolved HTTP se cubre por classify + mixin (sin romper roleId NOT NULL)', ({
    assert,
  }) => {
    assert.equal(SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED, 'EMP.SENS.WRITE.UNRESOLVED')
  })
```

y **no** inventar un usuario auth-less (el middleware `auth()` respondería 401, no 403 UNRESOLVED). Documentar en el commit que UNRESOLVED HTTP queda en U.5 + U.6.

La restauración `reloaded.employeeBankAccountClabe = CLEAR_FIXED.clabe; await reloaded.save()` corre **fuera de petición HTTP** (sin ALS): el mixin es fail-open. No envolver en `runUnguarded`.

- [ ] **Step 2: Run the spec**

Run: `node ace test tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

Expected: PASS. Si owner/root salen 403, `evaluateEnforced` no clasifica `bypass` como `allowed`: gap en `classifySensitiveWriteDecision`. Si DG pasa, CA-2 de bypass está roto.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_write_by_category.spec.ts
git commit -m "test: Cubrir CA-7 de interruptor, bypass y unresolved"
```

---

### Task 8: F.15–F.19 — CA-8 resto de superficies de los 10 modelos

**Files:**
- Modify: `tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

**Interfaces:**
- Consumes: `extra.spouse`, `extra.emergency`, `extra.note`, `extra.trauma`, `extra.lactation`, `extra.biometric`, slugs de pestaña, `grantModuleAction`
- Produces: F.15–F.19 (CA-8 + censo de las 20 columnas vía una transición por modelo)

- [ ] **Step 1: Write persona no-sensible + 6 superficies + grant de éxito**

```typescript
  test('CA-8: editar nombre, estado civil y ciudad sin categoría responde 201', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const person = fixture!.person
    const rfcBefore = person.personRfc
    const response = await client
      .put(`/api/persons/${person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json(
        personUpdateBase(person, {
          personFirstname: 'NombreQa',
          personMaritalStatus: 'divorced',
          personPlaceOfBirthCity: 'Toluca',
        })
      )
    assert.equal(response.status(), 201)
    const reloaded = await reloadPerson(person.personId)
    assert.equal(reloaded.personFirstname, 'NombreQa')
    assert.equal(reloaded.personRfc, rfcBefore)
  })

  test('CA-8: diagnóstico médico sin salud responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-condicion-medica-write'])
    const diagnosisBefore = fixture!.medical.employeeMedicalConditionDiagnosis
    const response = await client
      .put(`/api/employee-medical-conditions/${fixture!.medical.employeeMedicalConditionId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeId: fixture!.employee.employeeId,
        medicalConditionTypeId: fixture!.medical.medicalConditionTypeId,
        employeeMedicalConditionDiagnosis: 'diagnostico qa nuevo',
      })
    assertWriteForbidden(response, assert, 'datos de salud')
    await fixture!.medical.refresh()
    assert.equal(fixture!.medical.employeeMedicalConditionDiagnosis, diagnosisBefore)
  })

  test('CA-8: teléfono de cónyuge sin contacto responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const phoneBefore = extra!.spouse.employeeSpousePhone
    const response = await client
      .put(`/api/employee-spouses/${extra!.spouse.employeeSpouseId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeSpouseFirstname: extra!.spouse.employeeSpouseFirstname,
        employeeSpouseLastname: extra!.spouse.employeeSpouseLastname,
        employeeSpouseSecondLastname: extra!.spouse.employeeSpouseSecondLastname ?? '',
        employeeSpousePhone: TELEFONO_NUEVO,
      })
    assertWriteForbidden(response, assert, 'datos de contacto')
    await extra!.spouse.refresh()
    assert.equal(extra!.spouse.employeeSpousePhone, phoneBefore)
  })

  test('CA-8: ocupación de cónyuge sin contacto responde 200 y no toca el teléfono', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const phoneBefore = extra!.spouse.employeeSpousePhone
    const response = await client
      .put(`/api/employee-spouses/${extra!.spouse.employeeSpouseId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeSpouseFirstname: extra!.spouse.employeeSpouseFirstname,
        employeeSpouseLastname: extra!.spouse.employeeSpouseLastname,
        employeeSpouseSecondLastname: extra!.spouse.employeeSpouseSecondLastname ?? '',
        employeeSpouseOcupation: 'Ingeniera QA',
      })
    assert.equal(response.status(), 200)
    await extra!.spouse.refresh()
    assert.equal(extra!.spouse.employeeSpouseOcupation, 'Ingeniera QA')
    assert.equal(extra!.spouse.employeeSpousePhone, phoneBefore)
  })

  test('CA-8: teléfono de emergencia sin contacto responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-persona-write'])
    const phoneBefore = extra!.emergency.employeeEmergencyContactPhone
    const response = await client
      .put(`/api/employee-emergency-contacts/${extra!.emergency.employeeEmergencyContactId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({
        employeeEmergencyContactFirstname: extra!.emergency.employeeEmergencyContactFirstname,
        employeeEmergencyContactLastname: extra!.emergency.employeeEmergencyContactLastname,
        employeeEmergencyContactPhone: TELEFONO_NUEVO,
      })
    assertWriteForbidden(response, assert, 'datos de contacto')
    await extra!.emergency.refresh()
    assert.equal(extra!.emergency.employeeEmergencyContactPhone, phoneBefore)
  })

  test('CA-8: nota de incapacidad sin salud responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['manage-work-disabilities'])
    const descBefore = extra!.note.workDisabilityNoteDescription
    const response = await client
      .put(`/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ workDisabilityNoteDescription: 'nota clinica nueva qa' })
    assertWriteForbidden(response, assert, 'datos de salud')
    await extra!.note.refresh()
    assert.equal(extra!.note.workDisabilityNoteDescription, descBefore)
  })

  test('CA-8: reporte traumático sin salud responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    await grantModuleAction(actor!.role.roleId, 'traumatic-event-reports', 'write')
    const descBefore = extra!.trauma.traumaticEventReportDescription
    const response = await client
      .put(`/api/traumatic-event-reports/${extra!.trauma.traumaticEventReportId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ traumaticEventReportDescription: 'descripcion trauma nueva qa' })
    assertWriteForbidden(response, assert, 'datos de salud')
    await extra!.trauma.refresh()
    assert.equal(extra!.trauma.traumaticEventReportDescription, descBefore)
  })

  test('CA-8: notas de lactancia sin salud responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-periodos-lactancia-write'])
    const notesBefore = extra!.lactation.employeeLactationPeriodNotes
    const response = await client
      .put(`/api/employee-lactation-periods/${extra!.lactation.employeeLactationPeriodId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ employeeLactationPeriodNotes: 'notas lactancia nuevas qa' })
    assertWriteForbidden(response, assert, 'datos de salud')
    await extra!.lactation.refresh()
    assert.equal(extra!.lactation.employeeLactationPeriodNotes, notesBefore)
  })

  test('CA-8: cambio de dedos sin biométrico responde 403', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['upload-fingers'])
    const dataBefore = extra!.biometric.employeeBiometricData
    const response = await client
      .put(`/api/employees/${fixture!.employee.employeeId}/biometrics/fingers`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .json({ fingers: [1, 2] })
    assertWriteForbidden(response, assert, 'datos biométricos')
    await extra!.biometric.refresh()
    assert.equal(extra!.biometric.employeeBiometricData, dataBefore)
  })
```

`EmployeeBiometricService.update` reescribe `employeeBiometricData` (columna clasificada `biometrico`) aunque el body solo traiga `fingers`. Eso **es** transición. Si el endpoint responde 200 sin slug biométrico, gap: el mixin no está en `EmployeeBiometric`.

F.17 (foto PUT) ya vive en `employees_sensitive_write_guard_http.spec.ts` (U.14). No duplicar el spy de S3 aquí.

- [ ] **Step 2: Run the spec**

Run: `node ace test tests/functional/employees/employees_sensitive_write_by_category.spec.ts`

Expected: PASS. Si trauma 403 `PERM.DENIED` (no `EMP.SENS.WRITE`), el slug del módulo no es `write`: ajustar **solo** `grantModuleAction` al slug real (`ls`/`rg` en `app/constants` de traumatic). Si lactancia 422 por fechas, añadir al JSON las fechas actuales de `extra.lactation` (`employeeLactationPeriodStartDate` / `EndDate` / `Type`) — no cambiar producto.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/employees_sensitive_write_by_category.spec.ts
git commit -m "test: Cubrir CA-8 en las superficies de los diez modelos"
```

---

## E-API manual (no automatizar)

Misma matriz Functional contra el ambiente de prueba. No sustituye CI.

| # | Escenario | Criterio |
|---|-----------|----------|
| E-API.1 | Recaptura CA-1 | PUT ficha Persona como capturista: RFC `null` + apellido. 201. Pegar JSON recortado en el PR. |
| E-API.2 | Recaptura CA-2 | Mismo usuario, RFC distinto. 403 identificación. Fila intacta. |
| E-API.3 | Recaptura CA-6 | GET foto con token distinto, sin biométrico-write. 200 + log `runUnguarded`. |
| E-API.4 | Riesgo de despliegue | Comunicar: nadie tiene los cinco `-write`; aplicar paquetes de rol **antes** de liberar, o `owner`/`root` como salida. El interruptor OFF **no** desactiva esta rebanada. |

---

## Fuera de este plan

| Tema | Por qué |
|------|---------|
| Import Excel / eco de máscara persistido | Orden 33 |
| 7 columnas de Wilvardo | Fuera de los 10 modelos |
| Consola landlord `/api/platform` | Hueco declarado; fail-open sin ALS |
| Encender el interruptor de pestañas para negar `PERM.DENIED` | Historia de expediente, no de categoría |
| Montar `permissionGate(sensitive-*-write)` | Prohibido por spec |
| Suite E2E de BO | Cero líneas de `valanserh-bo` |

---

## Self-review

1. **Spec coverage:** CA-1 → Task 2 (null) + Task 3 (eco). CA-2 → Task 3. CA-3 → Task 4. CA-4 → Task 5 PUT. CA-5 → Task 5 POST. CA-6 → Task 6. CA-7 → Task 7 (OFF, ON, owner, root, DG, UNRESOLVED). CA-8 → Task 8. Motor → Task 1 + matriz U.1–U.14 ya existentes. 20 columnas: Persona (6) cubiertas por F.1–F.4/F.15; banco (3) por F.5–F.8 (CLABE representa la categoría); médica (2) F.16; cónyuge/emergencia F.18; nota/trauma/lactancia F.18; biométrico data F.18; face url U.14. No se pide una petición por cada una de las 20: el mixin es el mismo y U.6 ya cubre una columna de cada categoría.
2. **Placeholder scan:** sin TBD/TODO/`implement later`/`similar to Task N` en código. `putBankClabe` se define una vez en Task 7.
3. **Type consistency:** `personUpdateBase`, `assertWriteForbidden`, `reloadPerson` / `reloadBank`, `RFC_ORIGINAL` / `RFC_NUEVO` / `CLABE_NUEVA` coinciden entre tasks. `buHeader` es el string del support de lectura.

---
