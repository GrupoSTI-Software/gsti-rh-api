# Permiso de revelado y bitácora — Plan de pruebas QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar la matriz QA de USRH1787433076989 (`docs/superpowers/plans/2026-08-27-permiso-revelado-sensibles.md`, ya implementada y con revisión final limpia en 4 commits `43b5de7b..1764a11a`): unitarios de regresión ya entregados más una suite Japa HTTP (Functional/Integración) que demuestra CA-1 a CA-7 contra la app real — sustituyendo la matriz manual de "Task 4, pasos 4-5" del plan de producto por pruebas ejecutables. A diferencia del precedente (`2026-08-20-sensitive-read-by-category-qa.md`), que reservaba cualquier arreglo de producto al plan de implementación, aquí un gap real que un test nuevo descubra **se corrige en esta misma rama**, con su propio commit `fix`.

**Architecture:** El producto ya está en la rama. Los unitarios existentes (`pii_reveal_eligibility.spec.ts`, `ensure_pii_access_log_read.spec.ts`, `pii_access_log_forbidden.spec.ts`, `sensitive_access_context_mounts.spec.ts`) son la red de caracterización del gate: orden 422→403→servicio, decisiones `evaluateEnforced`, montaje de middleware. Esta suite añade la capa HTTP real que faltaba: dos endpoints (`GET /api/v1/pii/reveal/:model/:column/:recordId`, `GET /api/v1/pii/access-logs`) montados con `auth()` + `businessScopeOptional()`, nunca `permissionGate`. Reutiliza las fixtures ya probadas de `tests/functional/employees/sensitive_read_by_category_support.ts` (persona/banco/médica con `Model.create()` para que el cifrado `prepare` corra) y les agrega solo lo que esa suite no tenía: conceder permisos de **dos módulos distintos** en el mismo rol (`employees` para las categorías legales, `sensitive-data-access-log` para la bitácora) y contar filas de `pii_access_logs` antes/después de un intento denegado.

**Tech Stack:** AdonisJS 6, Lucid, Japa (`@japa/runner` + HTTP client), `SensitiveAccessContext.canRead`, `PermissionGateService.evaluateEnforced`, `PiiAccessLogService`.

## Global Constraints

- Historia bajo prueba: **USRH1787433076989** · plan de producto `docs/superpowers/plans/2026-08-27-permiso-revelado-sensibles.md` · rama `feature/USRH1787433076989-permiso-revelado-sensibles` · target `multitenant`.
- Rebanada **solo API**. Cero líneas de `valanserh-bo`. Sin migraciones. Sin endpoints nuevos. CA-8 (recorrido BO) queda fuera de esta suite — no es automatizable en este repo; ya cubierto por "cero diff en `valanserh-bo`" de la implementación.
- `evaluateEnforced` no cambia. El interruptor `system_module_permission_enforcement_active` del módulo `employees` permanece `false` (estado de entrega); no se enciende en ningún test.
- Bypass `standard` en ambos gates: `root` y `owner` pasan sin el permiso de categoría ni sin `sensitive-data-access-log:read`. `super-administrador` **no** tiene bypass en ninguno de los dos — necesita el permiso concedido, igual que un cliente.
- El 403 del revelado nunca escribe en `pii_access_logs`: cada escenario denegado cuenta filas antes y después con el mismo filtro (`model`, `column`, `recordId`) y exige igualdad exacta.
- El 403 de la bitácora nunca llega al validador de query: probarlo con un `dateFrom > dateTo` (que hoy dispara 422 `SEC.AUD.VAL.DATE.001` cuando el permiso sí está) y exigir 403 cuando el permiso falta.
- El `detail` del 403 de revelado nombra solo la familia (`datos de salud`, `datos financieros`, ...). Ningún test debe leer `body.data.<columna>` en un escenario denegado: si el valor cifrado se filtrara por accidente, esa lectura lo escondería en vez de fallar. Las aserciones sobre el 403 se limitan a `title`/`detail`/`key`/`code` y a que `data` no exista en ese envelope.
- Reusar sin reescribir: `createActor`, `cleanupActor`, `createSensitiveFixture`, `cleanupSensitiveFixture`, `buHeader`, `CLEAR_FIXED`, `createSystemActor`, `cleanupSystemActor` de `tests/functional/employees/sensitive_read_by_category_support.ts` (import relativo `../employees/sensitive_read_by_category_support.js`, no vía `#`). No hay import map de tests bajo `#`; el proyecto ya importa entre subcarpetas de `tests/functional` así (ver `tests/functional/helpers/contrato_import_excel_fixture.ts`).
- Bancos y médica se crean con `Model.create()` (cifrado `prepare`). Prohibido `db.table('employee_banks').insert` de claro.
- Cada test limpia sus propios actores/fixtures (los `cleanup*` existentes ya cubren `Person`/`Employee`/`Role`/`BusinessUnit`; la bitácora no necesita cleanup de filas propias porque son inserts inmutables de auditoría dentro del `businessUnitId` de la fixture, que sí se borra).
- Código, comentarios y docs en español; identificadores en inglés. Commits: Conventional Commits, tipo en inglés, descripción en español.
- **Si un test nuevo descubre un bug real de producto:** el fix va en un commit `fix:` separado, en esta misma rama, con su propia justificación en el mensaje. No se relaja la aserción para maquillar el hallazgo — si el comportamiento esperado por el plan de producto no se cumple, el código cede, no el test.

---

## Contratos fijos de la suite

### Rutas HTTP y envelopes

| Endpoint | Método | Middleware | 200 | 403 |
|----------|--------|-----------|-----|-----|
| `/api/v1/pii/reveal/:model/:column/:recordId` | GET | `auth()` + `businessScopeOptional()` | legado `{type,title,message,data}` | nuevo `{title,detail,key,code}` — `code: 'EMP.SENS.READ.FORBIDDEN'`, `key: 'sin-permiso-para-revelar-datos-sensibles'` |
| `/api/v1/pii/access-logs` | GET | `auth()` + `businessScopeOptional()` | legado `{type,title,message,data}` | legado `{type,title,message,key,detail,code,data:null}` — `code: 'SEC.AUD.FORB.001'`, `key: 'consulta-bitacora-denegada'` |

### Headers y auth

```typescript
.loginAs(actor.user).header('X-Business-Unit-Id', actor.businessUnit.businessUnitPublicId)
```

### Las once columnas revelables (Anexo A del plan de producto)

| Modelo | Columna | Permiso de categoría | Claro de fixture (`CLEAR_FIXED`) |
|--------|---------|----------------------|-----------------------------------|
| `Person` | `personCurp` | `sensitive-identificacion-read` | `curp` |
| `Person` | `personRfc` | `sensitive-identificacion-read` | `rfc` |
| `Person` | `personImssNss` | `sensitive-identificacion-read` | `nss` |
| `Person` | `personEmail` | `sensitive-contacto-read` | `email` (generado por fixture, no fijo) |
| `Person` | `personPhone` | `sensitive-contacto-read` | `phone` |
| `Person` | `personPhoneSecondary` | `sensitive-contacto-read` | `phoneSecondary` |
| `EmployeeBank` | `employeeBankAccountClabe` | `sensitive-financiero-read` | `clabe` |
| `EmployeeBank` | `employeeBankAccountNumber` | `sensitive-financiero-read` | `account` |
| `EmployeeBank` | `employeeBankAccountCardNumber` | `sensitive-financiero-read` | `card` |
| `EmployeeMedicalCondition` | `employeeMedicalConditionDiagnosis` | `sensitive-salud-read` | `diagnosis` |
| `EmployeeMedicalCondition` | `employeeMedicalConditionNotes` | `sensitive-salud-read` | `notes` |

El `recordId` de cada fila es `fixture.person.personId` para las tres de `Person`, `fixture.bank.employeeBankId` para las tres de `EmployeeBank`, `fixture.medical.employeeMedicalConditionId` para las dos de `EmployeeMedicalCondition`.

### Nunca 403 antes de los 422 de catálogo

`GET /api/v1/pii/reveal/Person/personFirstname/:id` (columna no clasificada) responde 422 `EMP.SENS.READ.NOT_CLASSIFIED` **sin importar los permisos del actor** — si un test con cero permisos de categoría recibiera 403 en vez de 422 ahí, el orden real se rompió.

### Conteo de auditoría

```typescript
async function countRevealLogs(model: string, column: string, recordId: number) {
  return db
    .from('pii_access_logs')
    .where('pii_access_log_model', model)
    .where('pii_access_log_model_column', column)
    .where('pii_access_log_record_id', recordId)
    .count('* as total')
}
```

---

## Matriz Unit (regresión — ya entregada, solo se corre)

Ninguno de estos se reescribe. Si alguno falla en este checkout, es una regresión: detenerse y reportar antes de seguir a la matriz Functional.

| # | Archivo | Qué caracteriza |
|---|---------|------------------|
| U.1 | `tests/unit/controllers/pii_reveal_eligibility.spec.ts` | `FORBIDDEN` en la familia; orden 422→403→servicio anclado a código ejecutable; comportamiento real del gate (deniega/permite) |
| U.2 | `tests/unit/helpers/ensure_pii_access_log_read.spec.ts` | `granted`/`bypass` pasan; `module-not-enforced`/`denied`/`unresolved` lanzan 403; reusa `ctx.permissionGate` |
| U.3 | `tests/unit/controllers/pii_access_log_forbidden.spec.ts` | `index` llama al helper antes de validar; traductor ya mapea `FORBIDDEN` |
| U.4 | `tests/unit/routes/sensitive_access_context_mounts.spec.ts` | revelado y bitácora montan `businessScopeOptional()` en su propio grupo |

Correr batería:

```bash
node ace test --files="pii_reveal_eligibility" --files="ensure_pii_access_log_read" --files="pii_access_log_forbidden" --files="sensitive_access_context_mounts" unit
```

Expected: 16/16 PASS (evidencia ya registrada en la revisión final del plan de producto).

---

## Matriz Functional / Integración (nueva)

Japa HTTP real. Interruptor OFF. Esta es la capa que reemplaza la verificación manual.

| # | CA | Escenario | Criterio de éxito |
|---|----|-----------|--------------------|
| F.1 | CA-1 | Cliente con `sensitive-identificacion-read`, revela `Person.personCurp` | 200, envelope legado, `data.personCurp === clear.curp`, una fila nueva en `pii_access_logs` para ese trío |
| F.2 | CA-1 | Mismo actor, las once columnas del Anexo A con su categoría concedida una por una | Cada una 200 + exactamente una fila nueva de auditoría. Si una falla, el test reporta cuál (no aborta las demás silenciosamente) |
| F.3 | CA-2 | Cliente sin `sensitive-salud-read`, revela `EmployeeMedicalCondition.employeeMedicalConditionDiagnosis` | 403 con el envelope exacto (`detail` incluye `datos de salud`, nunca el diagnóstico); conteo de `pii_access_logs` para ese trío idéntico antes/después |
| F.4 | CA-3 | Mismo cliente sin `sensitive-financiero-read`: revela `EmployeeBank.employeeBankAccountClabe` (403) y en la misma sesión pide `GET /api/employee-banks/:id` (200, CLABE tapada) | No puede coexistir CLABE tapada y revelada para el mismo actor/registro |
| F.5 | CA-4 | Cliente con `sensitive-identificacion-read` revela `Person.personCurp` de una fixture de **otra** empresa | 404 sobre el envelope legado. Nunca 403: el permiso no expande el alcance de empresa |
| F.6 | — | Cualquier actor revela `Person.personFirstname` (no clasificada) | 422 `EMP.SENS.READ.NOT_CLASSIFIED`, incluso con cero permisos de categoría — prueba que el 422 de catálogo nunca lo adelanta el 403 |
| F.7 | CA-7 | `root` y `owner` sin ningún slug de categoría, interruptor `employees` en `0` | 200 en las tres categorías probadas (identificación, financiero, salud) — bypass `standard` |
| F.8 | CA-5 | Cliente sin `sensitive-data-access-log:read` pide `GET /api/v1/pii/access-logs` | 403 con el envelope exacto (`key: 'consulta-bitacora-denegada'`, `code: 'SEC.AUD.FORB.001'`), sin `data` ni `meta` |
| F.9 | CA-5 | Mismo cliente sin el permiso, con `?dateFrom=2026-12-01&dateTo=2026-01-01` (rango invertido) | 403, **no** 422 — el gate corre antes del validador de fechas |
| F.10 | — | Mismo query de fechas invertidas, con el permiso concedido | 422 `SEC.AUD.VAL.DATE.001` — confirma que el validador sigue vivo cuando el gate deja pasar |
| F.11 | CA-6 | Cliente con el permiso, con filas de auditoría en su empresa y en otra | 200, solo las filas de su `businessUnitId` en `data` |
| F.12 | CA-7 | `root`/`owner` sin `sensitive-data-access-log:read` piden la bitácora | 200 — bypass `standard` |

---

## File Structure

| Archivo | Responsabilidad |
|---------|------------------|
| `tests/functional/pii/pii_permission_gate_support.ts` | Reexporta fixtures de `sensitive_read_by_category_support.ts`; agrega `grantAcrossModules`, `countRevealLogs`, `seedAccessLogRow` |
| `tests/functional/pii/pii_reveal_permission_gate.spec.ts` | F.1–F.7 |
| `tests/functional/pii/pii_access_log_permission_gate.spec.ts` | F.8–F.12 |

**No se modifica producto** salvo que un test nuevo falle mostrando un bug real — en ese caso el fix vive en el archivo de producto correspondiente, con su propio commit `fix:`, documentado en el reporte de la task.

**No se crea:** suite con el interruptor de `employees` en `1`, prueba de las 15 columnas de la HU anterior (orden 31), recorrido de backoffice (CA-8, fuera de este repo).

---

### Task 1: Soporte compartido y matriz HTTP del revelado (F.1–F.7)

**Files:**
- Create: `tests/functional/pii/pii_permission_gate_support.ts`
- Create: `tests/functional/pii/pii_reveal_permission_gate.spec.ts`

**Interfaces:**
- Consumes: `createActor`, `cleanupActor`, `createSensitiveFixture`, `cleanupSensitiveFixture`, `buHeader`, `CLEAR_FIXED`, `createSystemActor`, `cleanupSystemActor`, tipos `TenantActor`/`SensitiveFixture` de `tests/functional/employees/sensitive_read_by_category_support.ts` (import relativo `../employees/sensitive_read_by_category_support.js`) · `SystemPermission`, `RoleSystemPermission` models · `db` de `@adonisjs/lucid/services/db`
- Produces: `grantAcrossModules(roleId, grants: { module: string; slugs: string[] }[])`, `countRevealLogs(model, column, recordId)`, la suite F.1–F.7

- [ ] **Step 1: Write the failing test — soporte**

Crear `tests/functional/pii/pii_permission_gate_support.ts`:

```typescript
import db from '@adonisjs/lucid/services/db'
import RoleSystemPermission from '#models/role_system_permission'
import SystemPermission from '#models/system_permission'

export {
  createActor,
  cleanupActor,
  createSensitiveFixture,
  cleanupSensitiveFixture,
  buHeader,
  CLEAR_FIXED,
  createSystemActor,
  cleanupSystemActor,
} from '../employees/sensitive_read_by_category_support.js'
export type {
  TenantActor,
  SystemActor,
  SensitiveFixture,
  ClearPii,
} from '../employees/sensitive_read_by_category_support.js'

/**
 * Concede permisos de varios módulos al mismo rol en una sola operación,
 * reemplazando por completo sus permisos previos. A diferencia de `grantOnly`
 * (un solo módulo, `employees` fijo), esta HU exige conceder categorías
 * legales (`employees`) y bitácora (`sensitive-data-access-log`) al mismo
 * actor sin perder ninguna de las dos.
 */
export async function grantAcrossModules(
  roleId: number,
  grants: { module: string; slugs: string[] }[]
) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const { module, slugs } of grants) {
    for (const slug of slugs) {
      const permission = await SystemPermission.query()
        .whereNull('system_permission_deleted_at')
        .where('system_permission_slug', slug)
        .whereHas('systemModule', (query) =>
          query.whereNull('system_module_deleted_at').where('system_module_slug', module)
        )
        .first()
      if (!permission) {
        throw new Error(`Se requiere el permiso "${module}:${slug}" en BD para este test.`)
      }
      await RoleSystemPermission.create({
        roleId,
        systemPermissionId: permission.systemPermissionId,
      })
    }
  }
}

/**
 * Cuenta filas de auditoría de un trío modelo/columna/recordId — oráculo
 * de "el 403 no escribe asiento" (CA-2).
 */
export async function countRevealLogs(
  model: string,
  column: string,
  recordId: number
): Promise<number> {
  const row = await db
    .from('pii_access_logs')
    .where('pii_access_log_model', model)
    .where('pii_access_log_model_column', column)
    .where('pii_access_log_record_id', recordId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}
```

- [ ] **Step 2: Write the failing test — suite del revelado**

Crear `tests/functional/pii/pii_reveal_permission_gate.spec.ts`:

```typescript
import { test } from '@japa/runner'
import {
  createActor,
  cleanupActor,
  createSensitiveFixture,
  cleanupSensitiveFixture,
  buHeader,
  createSystemActor,
  cleanupSystemActor,
  grantAcrossModules,
  countRevealLogs,
  type TenantActor,
  type SensitiveFixture,
} from './pii_permission_gate_support.js'

const REVEALABLE_COLUMNS = [
  { model: 'Person', column: 'personCurp', permission: 'sensitive-identificacion-read', clearKey: 'curp' as const },
  { model: 'Person', column: 'personRfc', permission: 'sensitive-identificacion-read', clearKey: 'rfc' as const },
  { model: 'Person', column: 'personImssNss', permission: 'sensitive-identificacion-read', clearKey: 'nss' as const },
  { model: 'Person', column: 'personEmail', permission: 'sensitive-contacto-read', clearKey: 'email' as const },
  { model: 'Person', column: 'personPhone', permission: 'sensitive-contacto-read', clearKey: 'phone' as const },
  { model: 'Person', column: 'personPhoneSecondary', permission: 'sensitive-contacto-read', clearKey: 'phoneSecondary' as const },
  { model: 'EmployeeBank', column: 'employeeBankAccountClabe', permission: 'sensitive-financiero-read', clearKey: 'clabe' as const },
  { model: 'EmployeeBank', column: 'employeeBankAccountNumber', permission: 'sensitive-financiero-read', clearKey: 'account' as const },
  { model: 'EmployeeBank', column: 'employeeBankAccountCardNumber', permission: 'sensitive-financiero-read', clearKey: 'card' as const },
  { model: 'EmployeeMedicalCondition', column: 'employeeMedicalConditionDiagnosis', permission: 'sensitive-salud-read', clearKey: 'diagnosis' as const },
  { model: 'EmployeeMedicalCondition', column: 'employeeMedicalConditionNotes', permission: 'sensitive-salud-read', clearKey: 'notes' as const },
] as const

function recordIdFor(model: string, fixture: SensitiveFixture): number {
  if (model === 'Person') return fixture.person.personId
  if (model === 'EmployeeBank') return fixture.bank.employeeBankId
  if (model === 'EmployeeMedicalCondition') return fixture.medical.employeeMedicalConditionId
  throw new Error(`Modelo sin recordId mapeado en esta suite: ${model}`)
}

test.group('Permiso de categoría en el revelado individual (USRH1787433076989)', (group) => {
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null

  group.each.setup(async () => {
    actor = await createActor('pii-reveal-gate')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'pii-reveal-gate')
  })

  group.each.teardown(async () => {
    await cleanupSensitiveFixture(fixture)
    await cleanupActor(actor)
    fixture = null
    actor = null
  })

  test('F.1 — revela CURP con el permiso de identificación y escribe un asiento', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-identificacion-read'] },
    ])
    const recordId = fixture!.person.personId
    const before = await countRevealLogs('Person', 'personCurp', recordId)

    const response = await client
      .get(`/api/v1/pii/reveal/Person/personCurp/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    response.assertStatus(200)
    assert.equal(response.body().data.personCurp, fixture!.clear.curp)
    const after = await countRevealLogs('Person', 'personCurp', recordId)
    assert.equal(after, before + 1)
  })

  test('F.2 — las once columnas revelables devuelven 200 con su categoría y registran un asiento cada una', async ({ client, assert }) => {
    for (const { model, column, permission, clearKey } of REVEALABLE_COLUMNS) {
      await grantAcrossModules(actor!.role.roleId, [
        { module: 'employees', slugs: [permission] },
      ])
      const recordId = recordIdFor(model, fixture!)
      const before = await countRevealLogs(model, column, recordId)

      const response = await client
        .get(`/api/v1/pii/reveal/${model}/${column}/${recordId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))

      assert.equal(response.status(), 200, `${model}.${column} debió responder 200`)
      assert.equal(
        response.body().data[column],
        fixture!.clear[clearKey],
        `${model}.${column} no devolvió el claro esperado`
      )
      const after = await countRevealLogs(model, column, recordId)
      assert.equal(after, before + 1, `${model}.${column} no registró exactamente un asiento nuevo`)
    }
  })

  test('F.3 — sin sensitive-salud-read, el diagnóstico responde 403 sin escribir asiento', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-identificacion-read'] },
    ])
    const recordId = fixture!.medical.employeeMedicalConditionId
    const before = await countRevealLogs(
      'EmployeeMedicalCondition',
      'employeeMedicalConditionDiagnosis',
      recordId
    )

    const response = await client
      .get(`/api/v1/pii/reveal/EmployeeMedicalCondition/employeeMedicalConditionDiagnosis/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))

    response.assertStatus(403)
    const body = response.body()
    assert.equal(body.code, 'EMP.SENS.READ.FORBIDDEN')
    assert.equal(body.key, 'sin-permiso-para-revelar-datos-sensibles')
    assert.include(body.detail, 'datos de salud')
    assert.notInclude(JSON.stringify(body), fixture!.clear.diagnosis)
    const after = await countRevealLogs(
      'EmployeeMedicalCondition',
      'employeeMedicalConditionDiagnosis',
      recordId
    )
    assert.equal(after, before)
  })

  test('F.4 — sin sensitive-financiero-read, la CLABE revelada da 403 y la CLABE de ficha sigue tapada', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-identificacion-read'] },
    ])
    const recordId = fixture!.bank.employeeBankId

    const revealResponse = await client
      .get(`/api/v1/pii/reveal/EmployeeBank/employeeBankAccountClabe/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    revealResponse.assertStatus(403)
    assert.equal(revealResponse.body().code, 'EMP.SENS.READ.FORBIDDEN')

    const bankResponse = await client
      .get(`/api/employee-banks/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    bankResponse.assertStatus(200)
    const clabe = bankResponse.body().data.employeeBank.employeeBankAccountClabe
    assert.notEqual(clabe, fixture!.clear.clabe)
  })

  test('F.5 — el permiso de categoría no expande el alcance de empresa: 404, nunca 403', async ({ client, assert }) => {
    const otherActor = await createActor('pii-reveal-gate-other-bu')
    const otherFixture = await createSensitiveFixture(
      otherActor.businessUnit.businessUnitId,
      'pii-reveal-gate-other-bu'
    )
    try {
      await grantAcrossModules(actor!.role.roleId, [
        { module: 'employees', slugs: ['sensitive-identificacion-read'] },
      ])
      const response = await client
        .get(`/api/v1/pii/reveal/Person/personCurp/${otherFixture.person.personId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      response.assertStatus(404)
    } finally {
      await cleanupSensitiveFixture(otherFixture)
      await cleanupActor(otherActor)
    }
  })

  test('F.6 — una columna no clasificada da 422 sin importar los permisos del actor', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [])
    const response = await client
      .get(`/api/v1/pii/reveal/Person/personFirstname/${fixture!.person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    response.assertStatus(422)
    assert.equal(response.body().code, 'EMP.SENS.READ.NOT_CLASSIFIED')
  })

  test('F.7 — root y owner leen en claro sin ningún slug de categoría (bypass standard)', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'pii-reveal-gate-owner', actor!.businessUnit.businessUnitId)
    try {
      const response = await client
        .get(`/api/v1/pii/reveal/EmployeeMedicalCondition/employeeMedicalConditionDiagnosis/${fixture!.medical.employeeMedicalConditionId}`)
        .loginAs(owner.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      response.assertStatus(200)
      assert.equal(
        response.body().data.employeeMedicalConditionDiagnosis,
        fixture!.clear.diagnosis
      )
    } finally {
      await cleanupSystemActor(owner)
    }
  })
})
```

- [ ] **Step 3: Run to verify failures/passes and characterize**

```bash
node ace test --files="pii_reveal_permission_gate" functional
```

Expected: los siete tests pasan contra el producto ya entregado (esta es una suite de caracterización, no de TDD del producto). Si alguno falla:

1. Releer el hallazgo contra `docs/superpowers/plans/2026-08-27-permiso-revelado-sensibles.md` — ¿el plan de producto prometía este comportamiento?
2. Si sí: el bug está en `app/controllers/pii_reveal_controller.ts` o en el servicio que llama. Corregirlo con un commit `fix:` separado, documentando en el mensaje qué escenario lo descubrió.
3. Si el propio test tiene un dato mal construido (fixture, header, aserción), corregir el test, no el producto.

- [ ] **Step 4: Commit**

```bash
git add tests/functional/pii/pii_permission_gate_support.ts tests/functional/pii/pii_reveal_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir con HTTP real el permiso de categoría en el revelado individual

Sustituye la matriz manual de la Task 4 del plan de producto por una
suite Japa que revela las once columnas del Anexo A, prueba el 403 sin
asiento y sin filtrar el valor, y confirma que el permiso no expande
el alcance de empresa.
EOF
)"
```

Si el Step 3 encontró un bug de producto, ese fix va en un commit `fix:` separado ANTES de este, no mezclado en el mismo commit que los tests.

---

### Task 2: Matriz HTTP de la bitácora (F.8–F.12)

**Files:**
- Create: `tests/functional/pii/pii_access_log_permission_gate.spec.ts`

**Interfaces:**
- Consumes: mismas fixtures de Task 1 (`createActor`, `cleanupActor`, `buHeader`, `createSystemActor`, `cleanupSystemActor`, `grantAcrossModules` de `pii_permission_gate_support.ts`) · `PiiAccessLogService.record` para sembrar filas de auditoría de otra empresa (CA-6)
- Produces: la suite F.8–F.12

- [ ] **Step 1: Write the failing test**

Crear `tests/functional/pii/pii_access_log_permission_gate.spec.ts`:

```typescript
import { test } from '@japa/runner'
import PiiAccessLogService from '#services/pii_access_log_service'
import {
  createActor,
  cleanupActor,
  buHeader,
  createSystemActor,
  cleanupSystemActor,
  grantAcrossModules,
  type TenantActor,
} from './pii_permission_gate_support.js'

test.group('Permiso de la bitácora de accesos a datos sensibles (USRH1787433076989)', (group) => {
  let actor: TenantActor | null = null

  group.each.setup(async () => {
    actor = await createActor('pii-audit-gate')
  })

  group.each.teardown(async () => {
    await cleanupActor(actor)
    actor = null
  })

  test('F.8 — sin sensitive-data-access-log:read, la bitácora responde 403 sin data ni meta', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [])
    const response = await client
      .get('/api/v1/pii/access-logs')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    response.assertStatus(403)
    const body = response.body()
    assert.equal(body.code, 'SEC.AUD.FORB.001')
    assert.equal(body.key, 'consulta-bitacora-denegada')
    assert.isNull(body.data)
  })

  test('F.9 — sin el permiso, un rango de fechas invertido también da 403, no 422', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [])
    const response = await client
      .get('/api/v1/pii/access-logs?dateFrom=2026-12-01&dateTo=2026-01-01')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    response.assertStatus(403)
    assert.equal(response.body().code, 'SEC.AUD.FORB.001')
  })

  test('F.10 — con el permiso, el mismo rango invertido sigue dando 422 del validador', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'sensitive-data-access-log', slugs: ['read'] },
    ])
    const response = await client
      .get('/api/v1/pii/access-logs?dateFrom=2026-12-01&dateTo=2026-01-01')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    response.assertStatus(422)
    assert.equal(response.body().code, 'SEC.AUD.VAL.DATE.001')
  })

  test('F.11 — con el permiso, la bitácora solo muestra filas de la propia empresa', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'sensitive-data-access-log', slugs: ['read'] },
    ])
    const otherActor = await createActor('pii-audit-gate-other-bu')
    try {
      const service = new PiiAccessLogService()
      await service.record({
        businessUnitId: actor!.businessUnit.businessUnitId,
        accessorUserId: actor!.user.userId,
        model: 'Person',
        modelColumn: 'personCurp',
        recordId: actor!.person.personId,
        accessorIp: '127.0.0.1',
      })
      await service.record({
        businessUnitId: otherActor.businessUnit.businessUnitId,
        accessorUserId: otherActor.user.userId,
        model: 'Person',
        modelColumn: 'personCurp',
        recordId: otherActor.person.personId,
        accessorIp: '127.0.0.1',
      })

      const response = await client
        .get('/api/v1/pii/access-logs')
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      response.assertStatus(200)
      const rows = response.body().data.data ?? response.body().data
      assert.isArray(rows)
      for (const row of rows) {
        assert.notEqual(row.businessUnitId, otherActor.businessUnit.businessUnitId)
      }
    } finally {
      await cleanupActor(otherActor)
    }
  })

  test('F.12 — root y owner leen la bitácora sin el permiso concedido (bypass standard)', async ({ client, assert }) => {
    const owner = await createSystemActor('owner', 'pii-audit-gate-owner', actor!.businessUnit.businessUnitId)
    try {
      const response = await client
        .get('/api/v1/pii/access-logs')
        .loginAs(owner.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      response.assertStatus(200)
    } finally {
      await cleanupSystemActor(owner)
    }
  })
})
```

Nota sobre `F.11`: verificar primero la forma real de `data` en la respuesta (`PiiAccessLogListResultInterface` — puede ser `{ data: [...], meta }` paginado o un arreglo plano). Ajustar `rows = response.body().data.data ?? response.body().data` si la forma real difiere; no adivinar sin correr el test contra el producto real.

- [ ] **Step 2: Run to verify and characterize**

```bash
node ace test --files="pii_access_log_permission_gate" functional
```

Expected: los cinco tests pasan. Mismo protocolo que Task 1 Step 3 si algo falla: distinguir bug de producto (fix aparte) de dato mal construido en el test (corregir el test).

- [ ] **Step 3: Commit**

```bash
git add tests/functional/pii/pii_access_log_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir con HTTP real el permiso de lectura de la bitácora de accesos

El gate ya se probaba a nivel unitario; esta suite confirma que el 403
llega antes del validador de fechas, que el alcance de empresa se
respeta, y que root/owner tienen bypass sin el permiso explícito.
EOF
)"
```

---

### Task 3: Regresión completa y cierre

**Files:**
- Ninguno de producto salvo que Task 1/2 hayan dejado un fix pendiente de verificar en conjunto.

**Interfaces:**
- Consumes: las dos suites nuevas, la matriz Unit existente
- Produces: evidencia final para el PR de esta QA

- [ ] **Step 1: Correr toda la evidencia nueva y la de regresión juntas**

```bash
node ace test --files="pii_reveal_eligibility" --files="ensure_pii_access_log_read" --files="pii_access_log_forbidden" --files="sensitive_access_context_mounts" unit
node ace test --files="pii_reveal_permission_gate" --files="pii_access_log_permission_gate" functional
```

Expected: 16 unitarios + 12 funcionales, todos PASS.

- [ ] **Step 2: Lint**

```bash
npx eslint tests/functional/pii/pii_permission_gate_support.ts tests/functional/pii/pii_reveal_permission_gate.spec.ts tests/functional/pii/pii_access_log_permission_gate.spec.ts
```

Expected: exit 0.

- [ ] **Step 3: Nota operativa (no bloquea este plan)**

La verificación de la colisión del `system_modules.id = 46` y de que el seeder `0058` corrió en cada base de tenant (Task 4, paso 3 del plan de producto) sigue siendo manual — requiere acceso a bases reales y queda fuera del alcance de una suite automatizada de este repo. Si esta QA se ejecuta antes de confirmarlo, dejarlo anotado en el PR como pendiente operativo, no como hallazgo de esta suite.

---

## Self-Review

**1. Spec coverage**

| Requisito (CA del plan de producto) | Cubierto por |
|---------------------------------------|--------------|
| CA-1 revelado feliz + asiento | F.1, F.2 |
| CA-2 403 sin asiento, sin filtrar el valor | F.3 |
| CA-3 misma decisión que el tapado | F.4 |
| CA-4 permiso no amplía empresa (404) | F.5 |
| CA-5 bitácora 403 antes del validador | F.8, F.9, F.10 |
| CA-6 bitácora acotada por empresa | F.11 |
| CA-7 interruptor apagado no otorga; root/owner sí | F.7, F.12 |
| CA-8 cero cambios BO | Global Constraints (fuera de alcance de este repo) |
| Orden 422 nunca lo adelanta el 403 | F.6 |
| Colisión id 46 / seeder 0058 | Task 3 Step 3 (operativo, no automatizable) |

**2. Placeholder scan:** sin TBD, sin "similar a Task N". Cada test trae su código completo; la única ambigüedad señalada explícitamente (forma de `data` en F.11) tiene su propia instrucción de verificación, no un valor adivinado.

**3. Riesgo conocido:** los fixtures de Task 1/2 crean `BusinessUnit`/`Role`/`Person`/`Employee` reales en cada test — igual que la suite ya existente que este plan reutiliza. Si la base de datos de test no tiene el banco semilla (`Bank.query().firstOrFail()`) o el rol `owner`/`root` seedeado, las suites fallan en el `setup`, no en la aserción — señal clara de un problema de entorno, no de producto.
