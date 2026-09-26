# QA Unit + Functional — permiso alta persona y rangos salariales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cubrir con pruebas unitarias y funcionales la HU USRH1787433076995 (gates de rangos salariales, enmascarado financiero de bitácora, alta/listado de persona) y, si un test revela un gap real en producción, aplicar el fix en la misma rama.

**Architecture:** Las pruebas unitarias son guardas estáticas y de dominio puro (sin HTTP, sin BD). Las funcionales levantan el servidor Japa (`tests/bootstrap.ts` ya arranca `httpServer` en suites `functional`/`e2e`), crean tenant/actor/rol temporales, conmutan `system_module_permission_enforcement_active` y lo apagan siempre en `teardown`. El patrón de fixtures se copia de `tests/functional/employees/employees_persona_domicilio_bancos_permission_gate.spec.ts`. Si un test falla contra el código ya mergeado en esta rama, eso es un gap: se corrige producción en la Task 7, no se relaja el assert.

**Tech Stack:** AdonisJS 6, Japa (`@japa/runner` + `@japa/api-client` + `authApiClient` → `.loginAs(user)`), Lucid, `node ace test --files=<nombre> unit|functional`.

## Global Constraints

- Historia: **USRH1787433076995** · rama `feature/USRH1787433076995-permiso-alta-persona-rangos`.
- **Solo API** (`gsti-rh-api`). No tocar `gsti-rh-bo`.
- **No migraciones, no seeders nuevos, no endpoints nuevos.**
- **No encender de forma permanente** `system_module_permission_enforcement_active` de `employees` ni de `positions`: cada suite que lo encienda lo apaga en `teardown` y falla el suite si queda encendido.
- **No conceder los 4 permisos de `positions` a roles de negocio reales.** Solo `RoleSystemPermission` de roles temporales creados por el test; el `teardown` los borra.
- **No tocar** `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (scratch local, no versionado).
- Negativa de PermissionGate: HTTP 403 + `{ title: 'Sin permiso', detail: 'No tienes permiso para realizar esta operación.', key: 'PERM.DENIED' }`.
- `GET/POST /api/persons` montan `auth` + `sensitiveAccess` + `sensitiveMaskEcho` — **no** piden `X-Business-Unit-Id`.
- Las 7 rutas de `/api/position-salary-ranges` montan `auth` + `businessScope` — **sí** piden `X-Business-Unit-Id` (UUID público).
- Código, comentarios y mensajes de commit en español (tipo Conventional Commit en inglés).
- Cero `any`. Identificadores en inglés.
- Si un test falla por un defecto de producción: **no** cambiar el assert para que pase; documentar el gap y corregirlo en Task 7.

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `tests/unit/constants/person_subject_type.spec.ts` | **Nuevo.** Matriz fail-closed de `resolvePersonSubjectType` y `personSubjectRequiresCollaboratorWritePermission`. |
| `tests/unit/constants/positions_permission_catalog.spec.ts` | **Nuevo.** Integridad del catálogo `positions` (4 slugs, sin `legacyEquivalence`, una sección). |
| `tests/unit/routes/position_salary_range_permission_gate_routes.spec.ts` | **Nuevo.** Guarda estática: las 7 rutas declaran el gate correcto. |
| `tests/unit/models/sensitive_serialize_wiring.spec.ts` | **Modificar.** Añadir las 4 columnas de `PositionSalaryRangeAudit` al grupo numérico. |
| `tests/unit/constants/system_permission_catalog.spec.ts` | **Modificar.** Aserción positiva: `positions` está enumerado (el guard negativo ya existe). |
| `tests/functional/positions/position_salary_range_permission_gate.spec.ts` | **Nuevo.** HTTP: exigencia OFF (inertes) + ON (matriz de 7 rutas). |
| `tests/functional/positions/position_salary_range_audit_sensitive_read.spec.ts` | **Nuevo.** HTTP: bitácora con/sin `sensitive-financiero-read`, independiente del interruptor de `positions`. |
| `tests/functional/employees/person_store_subject_type_permission_gate.spec.ts` | **Nuevo.** HTTP: alta por `personSubjectType` + listado `GET /api/persons`. |
| Código de producción | **Solo Task 7**, y solo si un test de Tasks 1–6 falla por un defecto real. |

---

### Task 1: Unit — resolutor de destino del alta de persona

**Files:**
- Create: `tests/unit/constants/person_subject_type.spec.ts`
- Read (no modificar): `app/constants/person_subject_type.ts`

**Interfaces:**
- Consumes: `PERSON_SUBJECT_TYPES`, `resolvePersonSubjectType(raw: unknown): PersonSubjectType`, `personSubjectRequiresCollaboratorWritePermission(subjectType: PersonSubjectType): boolean`
- Produces: suite unitaria que fija el fail-closed (ausente / vacío / desconocido → `collaborator`) y los 4 destinos que no exigen permiso

- [ ] **Step 1: Escribir el spec**

```typescript
import { test } from '@japa/runner'
import {
  PERSON_SUBJECT_TYPES,
  resolvePersonSubjectType,
  personSubjectRequiresCollaboratorWritePermission,
} from '#constants/person_subject_type'

test.group('resolvePersonSubjectType — fail-closed', () => {
  test('ausente, no-string, vacío o desconocido resuelve a collaborator', ({ assert }) => {
    assert.equal(resolvePersonSubjectType(undefined), 'collaborator')
    assert.equal(resolvePersonSubjectType(null), 'collaborator')
    assert.equal(resolvePersonSubjectType(1), 'collaborator')
    assert.equal(resolvePersonSubjectType(''), 'collaborator')
    assert.equal(resolvePersonSubjectType('   '), 'collaborator')
    assert.equal(resolvePersonSubjectType('valor-invalido'), 'collaborator')
    assert.equal(resolvePersonSubjectType('CUSTOMER'), 'collaborator')
  })

  test('los cinco literales se reconocen tal cual, con trim', ({ assert }) => {
    for (const literal of PERSON_SUBJECT_TYPES) {
      assert.equal(resolvePersonSubjectType(literal), literal)
      assert.equal(resolvePersonSubjectType(`  ${literal}  `), literal)
    }
  })

  test('solo collaborator exige permiso de escritura de persona', ({ assert }) => {
    assert.isTrue(personSubjectRequiresCollaboratorWritePermission('collaborator'))
    assert.isFalse(personSubjectRequiresCollaboratorWritePermission('customer'))
    assert.isFalse(personSubjectRequiresCollaboratorWritePermission('flight-attendant'))
    assert.isFalse(personSubjectRequiresCollaboratorWritePermission('pilot'))
    assert.isFalse(personSubjectRequiresCollaboratorWritePermission('system-user'))
  })
})
```

- [ ] **Step 2: Correr el spec aislado**

Run: `node ace test --files="person_subject_type" unit`

Expected: PASS (el resolutor ya está implementado). Si FAIL: no relajar asserts; anotar el gap y continuar — se corrige en Task 7.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/constants/person_subject_type.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir el resolutor fail-closed del destino de persona

EOF
)"
```

---

### Task 2: Unit — catálogo, declaraciones y gates de rutas de `positions`

**Files:**
- Create: `tests/unit/constants/positions_permission_catalog.spec.ts`
- Create: `tests/unit/routes/position_salary_range_permission_gate_routes.spec.ts`
- Modify: `tests/unit/constants/system_permission_catalog.spec.ts` (añadir aserción positiva de `positions`; no tocar el guard de “el resto no enumerado”)

**Interfaces:**
- Consumes: `POSITIONS_PERMISSION_CATALOG`, `PositionActionSlug`, los 4 mapas de `positions_permission_declarations.ts`, `SYSTEM_PERMISSION_CATALOG`
- Produces: guardas que fallan si se tipa mal un slug, se añade `legacyEquivalence`, o se desconecta una ruta del gate

- [ ] **Step 1: Escribir `positions_permission_catalog.spec.ts`**

```typescript
import { test } from '@japa/runner'
import { POSITIONS_PERMISSION_CATALOG } from '#constants/positions_permission_catalog'
import {
  POSITIONS_READ_PERMISSION_DECLARATIONS,
  POSITIONS_WRITE_PERMISSION_DECLARATIONS,
  POSITIONS_DELETE_PERMISSION_DECLARATIONS,
  POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS,
} from '#constants/positions_permission_declarations'
import { SYSTEM_PERMISSION_CATALOG } from '#constants/system_permission_catalog'

test.group('Catálogo positions — USRH1787433076995', () => {
  test('enumera exactamente 4 acciones, todas en salary-ranges, sin legacyEquivalence', ({
    assert,
  }) => {
    assert.lengthOf(POSITIONS_PERMISSION_CATALOG, 4)
    const slugs = POSITIONS_PERMISSION_CATALOG.map((action) => action.slug)
    assert.deepEqual(slugs, [
      'salary-ranges-read',
      'salary-ranges-write',
      'salary-ranges-delete',
      'salary-ranges-audit-read',
    ])
    for (const action of POSITIONS_PERMISSION_CATALOG) {
      assert.equal(action.section, 'salary-ranges')
      assert.equal(action.exceptionProfile, 'standard')
      assert.isUndefined(action.legacyEquivalence)
    }
  })

  test('el índice maestro registra positions como enumerado con esas 4 acciones', ({ assert }) => {
    const moduleEntry = SYSTEM_PERMISSION_CATALOG.modules.find(
      (entry) => entry.slug === 'positions'
    )
    assert.exists(moduleEntry)
    assert.isTrue(moduleEntry!.actionsEnumerated)
    assert.deepEqual(
      SYSTEM_PERMISSION_CATALOG.actionsByModule.positions.map((action) => action.slug),
      POSITIONS_PERMISSION_CATALOG.map((action) => action.slug)
    )
  })

  test('las 7 declaraciones apuntan a positions + bypass standard + el slug correcto', ({
    assert,
  }) => {
    const expected = [
      [POSITIONS_READ_PERMISSION_DECLARATIONS.indexSalaryRanges, 'salary-ranges-read'],
      [POSITIONS_READ_PERMISSION_DECLARATIONS.currentSalaryRange, 'salary-ranges-read'],
      [POSITIONS_READ_PERMISSION_DECLARATIONS.historySalaryRanges, 'salary-ranges-read'],
      [POSITIONS_WRITE_PERMISSION_DECLARATIONS.storeSalaryRange, 'salary-ranges-write'],
      [POSITIONS_WRITE_PERMISSION_DECLARATIONS.updateSalaryRange, 'salary-ranges-write'],
      [POSITIONS_DELETE_PERMISSION_DECLARATIONS.closeSalaryRange, 'salary-ranges-delete'],
      [POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS.auditSalaryRange, 'salary-ranges-audit-read'],
    ] as const

    for (const [declaration, action] of expected) {
      assert.equal(declaration.module, 'positions')
      assert.equal(declaration.action, action)
      assert.equal(declaration.bypass, 'standard')
    }
  })
})
```

- [ ] **Step 2: Escribir `position_salary_range_permission_gate_routes.spec.ts`**

```typescript
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

function compact(source: string): string {
  return source.replace(/\s+/g, '')
}

test.group('position_salary_range_routes — PermissionGate', () => {
  test('las 7 rutas declaran el gate de la acción correcta', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/position_salary_range_routes.ts'),
      'utf8'
    )
    const compacted = compact(content)

    assert.include(
      compacted,
      "post('/','#controllers/position_salary_range_controller.store').use(middleware.permissionGate(POSITIONS_WRITE_PERMISSION_DECLARATIONS.storeSalaryRange))"
    )
    assert.include(
      compacted,
      "get('/','#controllers/position_salary_range_controller.index').use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.indexSalaryRanges))"
    )
    assert.include(
      compacted,
      "get('/current','#controllers/position_salary_range_controller.current').use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.currentSalaryRange))"
    )
    assert.include(
      compacted,
      "get('/history','#controllers/position_salary_range_controller.history').use(middleware.permissionGate(POSITIONS_READ_PERMISSION_DECLARATIONS.historySalaryRanges))"
    )
    assert.include(
      compacted,
      "patch('/:positionSalaryRangeId','#controllers/position_salary_range_controller.update').use(middleware.permissionGate(POSITIONS_WRITE_PERMISSION_DECLARATIONS.updateSalaryRange))"
    )
    assert.include(
      compacted,
      "get('/:positionSalaryRangeId/audit','#controllers/position_salary_range_controller.audit').use(middleware.permissionGate(POSITIONS_AUDIT_READ_PERMISSION_DECLARATIONS.auditSalaryRange))"
    )
    assert.include(
      compacted,
      "delete('/:positionSalaryRangeId','#controllers/position_salary_range_controller.close').use(middleware.permissionGate(POSITIONS_DELETE_PERMISSION_DECLARATIONS.closeSalaryRange))"
    )

    const gates = compacted.match(/permissionGate\([\w.]+\)/g) ?? []
    assert.equal(gates.length, 7, 'exactamente 7 gates, uno por ruta')
  })
})
```

- [ ] **Step 3: Añadir aserción positiva de `positions` en el catálogo maestro**

En `tests/unit/constants/system_permission_catalog.spec.ts`, **después** del test `'el módulo "employees" está reconocido y marcado como enumerado'` (línea 34), insertar:

```typescript
  test('el módulo "positions" está reconocido y marcado como enumerado', ({ assert }) => {
    const positionsModule = SYSTEM_PERMISSION_CATALOG.modules.find(
      (moduleEntry) => moduleEntry.slug === 'positions'
    )
    assert.exists(positionsModule, 'debe existir la entrada del módulo "positions"')
    assert.isTrue(positionsModule!.actionsEnumerated)
  })
```

No modificar el test `'el resto de los módulos queda reconocido...'` — ya permite `employees` y `positions`.

- [ ] **Step 4: Correr los tres specs**

Run: `node ace test --files="positions_permission_catalog" --files="position_salary_range_permission_gate_routes" --files="system_permission_catalog" unit`

Expected: PASS. Si FAIL por un desalineamiento de slugs/rutas: gap de producción → Task 7.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/constants/positions_permission_catalog.spec.ts \
  tests/unit/routes/position_salary_range_permission_gate_routes.spec.ts \
  tests/unit/constants/system_permission_catalog.spec.ts
git commit -m "$(cat <<'EOF'
test: Guardar el cableado de permisos y rutas de rangos salariales

EOF
)"
```

---

### Task 3: Unit — wiring `sensitiveSerializeNumeric` en la bitácora

**Files:**
- Modify: `tests/unit/models/sensitive_serialize_wiring.spec.ts:125-137`

**Interfaces:**
- Consumes: el grupo existente `'Wiring sensitiveSerializeNumeric en los 3 importes'`
- Produces: el mismo grupo cubre también las 4 columnas de `PositionSalaryRangeAudit` (7 importes en total)

- [ ] **Step 1: Ampliar el grupo numérico**

Reemplazar el grupo que empieza en la línea 125 (`'Wiring sensitiveSerializeNumeric en los 3 importes'`) por:

```typescript
test.group('Wiring sensitiveSerializeNumeric en los 7 importes', () => {
  test('histórico, rango vigente y bitácora usan la rama numérica, no maskLastFour', ({ assert }) => {
    const history = readFileSync(join(process.cwd(), 'app/models/employee_salary_history.ts'), 'utf-8')
    const range = readFileSync(join(process.cwd(), 'app/models/position_salary_range.ts'), 'utf-8')
    const audit = readFileSync(
      join(process.cwd(), 'app/models/position_salary_range_audit.ts'),
      'utf-8'
    )

    assert.include(history, "import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'")
    assert.include(range, "import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'")
    assert.include(audit, "import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'")

    assert.include(history, "sensitiveSerializeNumeric('EmployeeSalaryHistory', 'salaryDaily')")
    assert.include(range, "sensitiveSerializeNumeric('PositionSalaryRange', 'minSalaryDaily')")
    assert.include(range, "sensitiveSerializeNumeric('PositionSalaryRange', 'maxSalaryDaily')")
    assert.include(
      audit,
      "sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'oldMinSalaryDaily')"
    )
    assert.include(
      audit,
      "sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'oldMaxSalaryDaily')"
    )
    assert.include(
      audit,
      "sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'newMinSalaryDaily')"
    )
    assert.include(
      audit,
      "sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'newMaxSalaryDaily')"
    )

    assert.notInclude(history, 'sensitiveSerialize(')
    assert.notInclude(range, 'sensitiveSerialize(')
    assert.notInclude(audit, 'sensitiveSerialize(')
    assert.notInclude(audit, 'maskLastFour')
  })
})
```

- [ ] **Step 2: Correr el spec**

Run: `node ace test --files="sensitive_serialize_wiring" unit`

Expected: PASS. Si FAIL porque falta un `serialize:`: gap de producción → Task 7.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/models/sensitive_serialize_wiring.spec.ts
git commit -m "$(cat <<'EOF'
test: Exigir serialize numérico en los cuatro importes de bitácora salarial

EOF
)"
```

---

### Task 4: Functional — gates HTTP de las 7 rutas de rangos salariales

**Files:**
- Create: `tests/functional/positions/position_salary_range_permission_gate.spec.ts`

**Interfaces:**
- Consumes: `POST/GET/PATCH/DELETE /api/position-salary-ranges*`, `PermissionGateService.evaluate` (inerte si `positions` no está exigido), `PERMISSION_GATE_ERROR_CODES.DENIED`
- Produces: dos grupos Japa — exigencia OFF (ninguna 403 `PERM.DENIED`) y exigencia ON con solo `salary-ranges-read` (3 lecturas pasan el gate; write/delete/audit-read dan 403)

El interruptor se apaga en `teardown`. Los grants van solo al rol temporal. `businessScope` exige header `X-Business-Unit-Id` = `businessUnitPublicId`.

- [ ] **Step 1: Escribir el spec funcional**

```typescript
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

const TEST_PASSWORD = 'PositionsSalaryRangeGate123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

async function permissionId(moduleSlug: string, permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', moduleSlug)
    )
    .first()

  if (!permission) {
    throw new Error(`Se requiere el permiso "${moduleSlug}:${permissionSlug}" en BD para este test.`)
  }

  return permission.systemPermissionId
}

async function grantModuleOnly(
  roleId: number,
  moduleSlug: string,
  permissionSlugs: string[]
) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await permissionId(moduleSlug, slug),
    })
  }
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Rangos Gate ${stamp}`,
    businessUnitSlug: `rangos-gate-${stamp}`,
    businessUnitLegalName: `Rangos Gate Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Rangos Gate ${stamp}`,
    roleSlug: `rangos-gate-${stamp}`,
    roleDescription: 'Rol temporal de QA rangos salariales',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'Rangos',
    personLastname: 'Gate',
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
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

async function createPosition(businessUnitId: number, prefix: string): Promise<number> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const insert = await db.table('positions').insert({
    position_sync_id: stamp,
    position_code: `POS-${stamp}`,
    position_name: `Puesto ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: new Date(),
  })
  return Number(insert[0])
}

function todayIso(): string {
  return DateTime.now().setZone('America/Mexico_City').toISODate() as string
}

function createPayload(businessUnitId: number, positionId: number) {
  return {
    businessUnitId,
    positionId,
    minSalaryDaily: 320.5,
    maxSalaryDaily: 480.75,
    validFrom: todayIso(),
    reason: 'qa-gate',
  }
}

function expectDenied(response: { status: () => number; body: () => { key?: string } }, assert: {
  equal: (a: unknown, b: unknown) => void
}) {
  assert.equal(response.status(), 403)
  assert.equal(response.body()?.key, 'PERM.DENIED')
}

function expectNotDenied(response: { status: () => number; body: () => { key?: string } }, assert: {
  notEqual: (a: unknown, b: unknown) => void
}) {
  assert.notEqual(response.status(), 403)
  assert.notEqual(response.body()?.key, 'PERM.DENIED')
  assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
}

test.group('Rangos salariales — PermissionGate soft-rollout', (group) => {
  let positionsModule: SystemModule
  let actor: TenantActor | null = null
  let positionId: number | null = null
  const createdRangeIds: number[] = []

  group.setup(async () => {
    positionsModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'positions')
      .firstOrFail()
    positionsModule.systemModulePermissionEnforcementActive = false
    await positionsModule.save()
    actor = await createActor('positions-ranges-off')
    await grantModuleOnly(actor.role.roleId, 'positions', [])
    positionId = await createPosition(actor.businessUnit.businessUnitId, 'off')
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (createdRangeIds.length > 0) {
        await db.from('position_salary_range_audit').whereIn('range_id', createdRangeIds).delete()
        await db.from('position_salary_ranges').whereIn('position_salary_range_id', createdRangeIds).delete()
      }
      if (positionId) {
        await db.from('positions').where('position_id', positionId).delete()
      }
      await cleanupActor(actor)
    } finally {
      positionsModule.systemModulePermissionEnforcementActive = false
      await positionsModule.save()
      const after = await SystemModule.findOrFail(positionsModule.systemModuleId)
      enforcementLeftDisabled = after.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de positions debe quedar apagada tras el suite.')
    }
  })

  test('con exigencia apagada, las 7 rutas no responden PERM.DENIED', async ({ client, assert }) => {
    const header = actor!.businessUnit.businessUnitPublicId
    const buId = actor!.businessUnit.businessUnitId

    const store = await client
      .post('/api/position-salary-ranges')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .header('X-User-Timezone', 'America/Mexico_City')
      .json(createPayload(buId, positionId!))
    expectNotDenied(store, assert)
    const rangeId = store.body()?.data?.positionSalaryRange?.positionSalaryRangeId as number | undefined
    if (rangeId) createdRangeIds.push(rangeId)

    const index = await client
      .get('/api/position-salary-ranges')
      .qs({ razon_social_id: buId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(index, assert)

    const current = await client
      .get('/api/position-salary-ranges/current')
      .qs({ razon_social_id: buId, position_id: positionId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(current, assert)

    const history = await client
      .get('/api/position-salary-ranges/history')
      .qs({ razon_social_id: buId, position_id: positionId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(history, assert)

    if (!rangeId) return

    const audit = await client
      .get(`/api/position-salary-ranges/${rangeId}/audit`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(audit, assert)

    const update = await client
      .patch(`/api/position-salary-ranges/${rangeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .header('X-User-Timezone', 'America/Mexico_City')
      .json({ minSalaryDaily: 330, maxSalaryDaily: 490, reason: 'qa-update' })
    expectNotDenied(update, assert)
    const newRangeId = update.body()?.data?.positionSalaryRange?.positionSalaryRangeId as
      | number
      | undefined
    if (newRangeId) createdRangeIds.push(newRangeId)

    const closeTarget = newRangeId ?? rangeId
    const close = await client
      .delete(`/api/position-salary-ranges/${closeTarget}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .json({ reason: 'qa-close' })
    expectNotDenied(close, assert)
  })
})

test.group('Rangos salariales — PermissionGate exigencia ON', (group) => {
  let positionsModule: SystemModule
  let actor: TenantActor | null = null
  let positionId: number | null = null
  let seededRangeId: number | null = null

  group.setup(async () => {
    positionsModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'positions')
      .firstOrFail()
    actor = await createActor('positions-ranges-on')
    positionId = await createPosition(actor.businessUnit.businessUnitId, 'on')

    // Sembrar un rango con exigencia apagada (el rol no tiene write).
    positionsModule.systemModulePermissionEnforcementActive = false
    await positionsModule.save()
    const seed = await new (await import('#services/position_salary_range_service')).default().create({
      businessUnitId: actor.businessUnit.businessUnitId,
      positionId,
      minSalaryDaily: 300,
      maxSalaryDaily: 450,
      validFrom: DateTime.now().setZone('America/Mexico_City').startOf('day'),
      timeZone: 'America/Mexico_City',
      reason: 'seed-on',
      createdBy: actor.user.userId,
    })
    if (seed.status !== 201) {
      throw new Error(`No se pudo sembrar el rango de prueba: ${JSON.stringify(seed)}`)
    }
    seededRangeId = seed.range.positionSalaryRangeId

    positionsModule.systemModulePermissionEnforcementActive = true
    await positionsModule.save()
    await grantModuleOnly(actor.role.roleId, 'positions', ['salary-ranges-read'])
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (seededRangeId) {
        await db.from('position_salary_range_audit').where('range_id', seededRangeId).delete()
        await db.from('position_salary_ranges').where('position_salary_range_id', seededRangeId).delete()
      }
      if (positionId) {
        await db.from('positions').where('position_id', positionId).delete()
      }
      await cleanupActor(actor)
    } finally {
      positionsModule.systemModulePermissionEnforcementActive = false
      await positionsModule.save()
      const after = await SystemModule.findOrFail(positionsModule.systemModuleId)
      enforcementLeftDisabled = after.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de positions debe quedar apagada tras el suite.')
    }
  })

  test('solo salary-ranges-read: lecturas 200-ish, write/delete/audit 403 PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const header = actor!.businessUnit.businessUnitPublicId
    const buId = actor!.businessUnit.businessUnitId

    const index = await client
      .get('/api/position-salary-ranges')
      .qs({ razon_social_id: buId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(index, assert)

    const current = await client
      .get('/api/position-salary-ranges/current')
      .qs({ razon_social_id: buId, position_id: positionId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(current, assert)

    const history = await client
      .get('/api/position-salary-ranges/history')
      .qs({ razon_social_id: buId, position_id: positionId })
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectNotDenied(history, assert)

    const store = await client
      .post('/api/position-salary-ranges')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .header('X-User-Timezone', 'America/Mexico_City')
      .json(createPayload(buId, positionId!))
    expectDenied(store, assert)

    const update = await client
      .patch(`/api/position-salary-ranges/${seededRangeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .header('X-User-Timezone', 'America/Mexico_City')
      .json({ minSalaryDaily: 310, maxSalaryDaily: 460, reason: 'denied' })
    expectDenied(update, assert)

    const close = await client
      .delete(`/api/position-salary-ranges/${seededRangeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
      .json({ reason: 'denied' })
    expectDenied(close, assert)

    const audit = await client
      .get(`/api/position-salary-ranges/${seededRangeId}/audit`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', header)
    expectDenied(audit, assert)

    const stillOpen = await db
      .from('position_salary_ranges')
      .where('position_salary_range_id', seededRangeId)
      .whereNull('valid_to')
      .first()
    assert.isNotNull(stillOpen)
  })
})
```

Nota de implementación: el `import()` dinámico del service en `setup` es deliberado para no cargar el servicio en el scope del módulo si el linter de imports lo prefiere estático — si `eslint` lo rechaza, usar `import PositionSalaryRangeService from '#services/position_salary_range_service'` arriba del archivo (preferido). El plan lo deja estático en la versión que se commitea: cambia el `setup` a `const service = new PositionSalaryRangeService()` con el import de arriba.

- [ ] **Step 2: Correr el spec**

Run: `node ace test --files="position_salary_range_permission_gate" functional`

Expected: PASS. Precondiciones: la BD de tests ya tiene el módulo `positions` y las 4 filas de `system_permissions` (Task 8 de la HU ya corrió `db:seed`). Si el spec falla porque falta la fila del módulo, no inventar seeder: documentar y correr `node ace db:seed` una vez (idempotente, solo crea filas de catálogo).

Si FAIL por 403 inesperado con exigencia OFF, o 200 inesperado con exigencia ON: gap → Task 7.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/positions/position_salary_range_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir los gates HTTP de las siete rutas de rangos salariales

EOF
)"
```

---

### Task 5: Functional — bitácora oculta importes sin permiso financiero

**Files:**
- Create: `tests/functional/positions/position_salary_range_audit_sensitive_read.spec.ts`

**Interfaces:**
- Consumes: `GET /api/position-salary-ranges/:id/audit`, `sensitiveSerializeNumeric` + `SensitiveAccessContext.canRead('financiero')` (vía `businessScope` → `runWithSensitiveReadDecisions` → `evaluateEnforced`, **independiente** del interruptor de `positions`)
- Produces: un grupo con exigencia de `positions` **apagada** (para no mezclar el gate de ruta) y dos actores: sin `sensitive-financiero-read` (4 importes `null`, `action`/`actorId`/`reason` intactos) y con el permiso (importes numéricos)

Este es el único caso que la revisión final de rama señaló como no demostrable solo leyendo código (reentrada ALS en `finish`).

- [ ] **Step 1: Escribir el spec**

Reutilizar los helpers `createActor`, `cleanupActor`, `createPosition`, `permissionId` de Task 4 **copiados** en este archivo (no extraer módulo compartido: YAGNI; el precedente del repo duplica helpers por spec). Sembrar el rango + su auditoría con `PositionSalaryRangeService.create` (exigencia OFF).

```typescript
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import PositionSalaryRangeService from '#services/position_salary_range_service'
import SystemModule from '#models/system_module'
// ... copiar TenantActor, createActor, cleanupActor, createPosition, grantModuleOnly ...

interface AuditRow {
  action?: string
  actorId?: number
  reason?: string | null
  oldMinSalaryDaily?: number | null
  oldMaxSalaryDaily?: number | null
  newMinSalaryDaily?: number | null
  newMaxSalaryDaily?: number | null
}

test.group('Bitácora de rango — lectura financiera (interruptor OFF)', (group) => {
  let positionsModule: SystemModule
  let actor: TenantActor | null = null
  let positionId: number | null = null
  let rangeId: number | null = null

  group.setup(async () => {
    positionsModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'positions')
      .firstOrFail()
    positionsModule.systemModulePermissionEnforcementActive = false
    await positionsModule.save()

    actor = await createActor('positions-audit-mask')
    positionId = await createPosition(actor.businessUnit.businessUnitId, 'audit')
    const created = await new PositionSalaryRangeService().create({
      businessUnitId: actor.businessUnit.businessUnitId,
      positionId,
      minSalaryDaily: 275.25,
      maxSalaryDaily: 410.5,
      validFrom: DateTime.now().setZone('America/Mexico_City').startOf('day'),
      timeZone: 'America/Mexico_City',
      reason: 'motivo-visible',
      createdBy: actor.user.userId,
    })
    if (created.status !== 201) {
      throw new Error(`No se pudo sembrar el rango de bitácora: ${JSON.stringify(created)}`)
    }
    rangeId = created.range.positionSalaryRangeId
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      if (rangeId) {
        await db.from('position_salary_range_audit').where('range_id', rangeId).delete()
        await db.from('position_salary_ranges').where('position_salary_range_id', rangeId).delete()
      }
      if (positionId) {
        await db.from('positions').where('position_id', positionId).delete()
      }
      await cleanupActor(actor)
    } finally {
      positionsModule.systemModulePermissionEnforcementActive = false
      await positionsModule.save()
      const after = await SystemModule.findOrFail(positionsModule.systemModuleId)
      enforcementLeftDisabled = after.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de positions debe quedar apagada tras el suite.')
    }
  })

  test('sin sensitive-financiero-read los 4 importes salen null y el resto intacto', async ({
    client,
    assert,
  }) => {
    await grantModuleOnly(actor!.role.roleId, 'employees', [])
    const response = await client
      .get(`/api/position-salary-ranges/${rangeId}/audit`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

    assert.notEqual(response.status(), 403)
    const rows = (response.body()?.data ?? []) as AuditRow[]
    assert.isAtLeast(rows.length, 1)
    const createRow = rows.find((row) => row.action === 'create')
    assert.exists(createRow)
    assert.equal(createRow!.actorId, actor!.user.userId)
    assert.equal(createRow!.reason, 'motivo-visible')
    assert.isNull(createRow!.oldMinSalaryDaily)
    assert.isNull(createRow!.oldMaxSalaryDaily)
    assert.isNull(createRow!.newMinSalaryDaily)
    assert.isNull(createRow!.newMaxSalaryDaily)
  })

  test('con sensitive-financiero-read los importes nuevos de create son numéricos', async ({
    client,
    assert,
  }) => {
    await grantModuleOnly(actor!.role.roleId, 'employees', ['sensitive-financiero-read'])
    const response = await client
      .get(`/api/position-salary-ranges/${rangeId}/audit`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', actor!.businessUnit.businessUnitPublicId)

    assert.notEqual(response.status(), 403)
    const rows = (response.body()?.data ?? []) as AuditRow[]
    const createRow = rows.find((row) => row.action === 'create')
    assert.exists(createRow)
    assert.equal(createRow!.newMinSalaryDaily, 275.25)
    assert.equal(createRow!.newMaxSalaryDaily, 410.5)
    assert.isNull(createRow!.oldMinSalaryDaily)
    assert.isNull(createRow!.oldMaxSalaryDaily)
    assert.equal(createRow!.reason, 'motivo-visible')
  })
})
```

Los helpers omitidos con `// ...` **deben copiarse enteros** de Task 4 (mismas firmas). No dejes el comentario `// ...` en el archivo commiteado.

- [ ] **Step 2: Correr el spec**

Run: `node ace test --files="position_salary_range_audit_sensitive_read" functional`

Expected: PASS. Si los importes salen en claro sin permiso, o `null` con permiso (ALS no reentra): gap de producción → Task 7. No “arreglarlo” cambiando el assert a `notEqual(null)`.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/positions/position_salary_range_audit_sensitive_read.spec.ts
git commit -m "$(cat <<'EOF'
test: Verificar que la bitácora salarial oculta importes sin permiso financiero

EOF
)"
```

---

### Task 6: Functional — alta y listado de persona

**Files:**
- Create: `tests/functional/employees/person_store_subject_type_permission_gate.spec.ts`

**Interfaces:**
- Consumes: `resolvePersonSubjectType` + `ensureSecondaryPermission` en `person_controller.store` (antes de `validateUsing`); gate declarativo de `GET /api/persons`; `EMPLOYEES_PERSON_COLLABORATOR_WRITE_PERMISSION` / `READ`
- Produces: grupo exigencia OFF (alta sin `personSubjectType` no da `PERM.DENIED`) y grupo exigencia ON (matriz de destinos + listado)

Estas rutas **no** envían `X-Business-Unit-Id`. El cleanup de personas creadas usa el email único `@gsti-tests.local`.

Comportamiento esperado ya adjudicado (no es gap):

| Cuerpo | Rol | Exigencia employees | Resultado |
|--------|-----|---------------------|-----------|
| sin `personSubjectType` | sin `tab-persona-write` | OFF | no 403 `PERM.DENIED` |
| sin `personSubjectType` | sin `tab-persona-write` | ON | 403 `PERM.DENIED`, 0 filas nuevas |
| `collaborator` | sin write | ON | 403 `PERM.DENIED` |
| `valor-invalido` | sin write | ON | 403 `PERM.DENIED` (fail-closed antes del validador) |
| `valor-invalido` | con write | ON | 422 (enum) |
| `customer` / `flight-attendant` / `pilot` / `system-user` | sin write | ON | no 403 `PERM.DENIED` (201 si el body es válido) |
| `GET /api/persons` | sin `tab-persona-read` | ON | 403 `PERM.DENIED` |
| `GET /api/persons` | con `tab-persona-read` | ON | no 403 `PERM.DENIED` |

- [ ] **Step 1: Escribir el spec**

```typescript
import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

const TEST_PASSWORD = 'PersonSubjectTypeGate123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

async function permissionId(moduleSlug: string, permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', moduleSlug)
    )
    .first()
  if (!permission) {
    throw new Error(`Se requiere el permiso "${moduleSlug}:${permissionSlug}" en BD para este test.`)
  }
  return permission.systemPermissionId
}

async function grantEmployeesOnly(roleId: number, permissionSlugs: string[]) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await permissionId('employees', slug),
    })
  }
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Persona Subject ${stamp}`,
    businessUnitSlug: `persona-subject-${stamp}`,
    businessUnitLegalName: `Persona Subject Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Persona Subject ${stamp}`,
    roleSlug: `persona-subject-${stamp}`,
    roleDescription: 'Rol temporal QA alta persona',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'Actor',
    personLastname: 'Subject',
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
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

function personPayload(suffix: string, subjectType?: string) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  return {
    ...(subjectType !== undefined ? { personSubjectType: subjectType } : {}),
    personFirstname: 'Alta',
    personLastname: 'QA',
    personSecondLastname: suffix,
    personEmail: `alta-${suffix}-${stamp}@gsti-tests.local`,
  }
}

async function countByEmail(email: string): Promise<number> {
  const row = await Person.query().where('personEmail', email).first()
  return row ? 1 : 0
}

test.group('Alta/listado persona — exigencia OFF', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  const createdEmails: string[] = []

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('person-subject-off')
    await grantEmployeesOnly(actor.role.roleId, [])
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      for (const email of createdEmails) {
        await Person.query().where('personEmail', email).delete()
      }
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      const after = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled = after.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de employees debe quedar apagada tras el suite.')
    }
  })

  test('sin personSubjectType y sin permiso no responde PERM.DENIED', async ({ client, assert }) => {
    const payload = personPayload('off-ausente')
    createdEmails.push(payload.personEmail)
    const response = await client.post('/api/persons').loginAs(actor!.user).json(payload)
    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })

  test('GET /api/persons sin tab-persona-read no responde PERM.DENIED', async ({ client, assert }) => {
    const response = await client.get('/api/persons').qs({ page: 1, limit: 10 }).loginAs(actor!.user)
    assert.notEqual(response.status(), 403)
    assert.notEqual(response.body()?.key, 'PERM.DENIED')
  })
})

test.group('Alta/listado persona — exigencia ON', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  const createdEmails: string[] = []

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('person-subject-on')
  })

  group.teardown(async () => {
    let enforcementLeftDisabled = false
    try {
      for (const email of createdEmails) {
        await Person.query().where('personEmail', email).delete()
      }
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
      const after = await SystemModule.findOrFail(employeesModule.systemModuleId)
      enforcementLeftDisabled = after.systemModulePermissionEnforcementActive === false
    }
    if (!enforcementLeftDisabled) {
      throw new Error('La exigencia de employees debe quedar apagada tras el suite.')
    }
  })

  test('ausente, collaborator y valor-invalido sin write dan 403 y no crean fila', async ({
    client,
    assert,
  }) => {
    await grantEmployeesOnly(actor!.role.roleId, [])
    for (const subject of [undefined, 'collaborator', 'valor-invalido'] as const) {
      const payload = personPayload(`on-${String(subject)}`, subject)
      const before = await countByEmail(payload.personEmail)
      const response = await client.post('/api/persons').loginAs(actor!.user).json(payload)
      assert.equal(response.status(), 403)
      assert.equal(response.body()?.key, 'PERM.DENIED')
      assert.equal(await countByEmail(payload.personEmail), before)
    }
  })

  test('valor-invalido con write llega al validador y responde 422', async ({ client, assert }) => {
    await grantEmployeesOnly(actor!.role.roleId, ['tab-persona-write'])
    const payload = personPayload('on-invalid-with-write', 'valor-invalido')
    const response = await client.post('/api/persons').loginAs(actor!.user).json(payload)
    assert.equal(response.status(), 422)
    assert.equal(await countByEmail(payload.personEmail), 0)
  })

  test('destinos no colaborador no exigen tab-persona-write', async ({ client, assert }) => {
    await grantEmployeesOnly(actor!.role.roleId, [])
    for (const subject of ['customer', 'flight-attendant', 'pilot', 'system-user'] as const) {
      const payload = personPayload(`on-${subject}`, subject)
      createdEmails.push(payload.personEmail)
      const response = await client.post('/api/persons').loginAs(actor!.user).json(payload)
      assert.notEqual(response.status(), 403)
      assert.notEqual(response.body()?.key, 'PERM.DENIED')
    }
  })

  test('GET /api/persons sin tab-persona-read da 403; con el permiso no', async ({
    client,
    assert,
  }) => {
    await grantEmployeesOnly(actor!.role.roleId, [])
    const denied = await client.get('/api/persons').qs({ page: 1, limit: 10 }).loginAs(actor!.user)
    assert.equal(denied.status(), 403)
    assert.equal(denied.body()?.key, 'PERM.DENIED')

    await grantEmployeesOnly(actor!.role.roleId, ['tab-persona-read'])
    const allowed = await client.get('/api/persons').qs({ page: 1, limit: 10 }).loginAs(actor!.user)
    assert.notEqual(allowed.status(), 403)
    assert.notEqual(allowed.body()?.key, 'PERM.DENIED')
  })
})
```

Nota: `countByEmail` lee `personEmail` (columna cifrada con `consume`). Si Lucid no resuelve el where sobre texto plano, cambiar a búsqueda por `person_email_hash` con `blindIndex(email)` de `#utils/blind_index` — ese es el índice real. Preferir hash desde el primer commit si el where por email falla en el Step 2.

- [ ] **Step 2: Correr el spec**

Run: `node ace test --files="person_store_subject_type_permission_gate" functional`

Expected: PASS. Si `customer` da 403 con exigencia ON: gap (el resolutor o el `if` del controller está mal) → Task 7. Si `valor-invalido` sin write da 422: **no** es el comportamiento adjudicado; el spec de producto espera 403. No “corregir” el test.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/employees/person_store_subject_type_permission_gate.spec.ts
git commit -m "$(cat <<'EOF'
test: Cubrir el gate condicional del alta y el listado de personas

EOF
)"
```

---

### Task 7: Cerrar gaps de producción (solo si un test falló)

**Files:**
- Modify: únicamente los archivos de producción citados por el stack/assert que falló. Candidatos previsibles (no tocarlos “por si acaso”):
  - `app/controllers/person_controller.ts` (`store`, orden permiso → validación)
  - `app/constants/person_subject_type.ts`
  - `start/routes/position_salary_range_routes.ts` / `start/routes/person_routes.ts`
  - `app/models/position_salary_range_audit.ts` (`serialize`)
  - `app/helpers/sensitive_read_decisions.ts` (reentrada ALS) — solo si Task 5 demuestra importes en claro / siempre `null`

**Interfaces:**
- Consumes: el reporte de FAIL de Tasks 1–6 (archivo, línea, mensaje)
- Produces: el mínimo cambio de producción que hace pasar **ese** assert, más re-run de la suite afectada

- [ ] **Step 1: Decidir si esta task aplica**

Si Tasks 1–6 pasaron todas: escribir en el commit N/A no aplica — **no crear commit vacío**. Marcar los steps siguientes como no ejecutados y terminar.

Si hubo FAIL: copiar el mensaje completo al reporte mental y clasificar:

1. Defecto de producción (comportamiento ≠ plan/HU) → seguir Step 2.
2. Fixture / BD (falta fila de `positions` en `system_permissions`) → `node ace db:seed` una vez y re-correr; no es fix de código.
3. Assert mal escrito (el test no refleja el plan) → corregir el test, no producción. Eso no es “gap de HU”.

- [ ] **Step 2: Fix mínimo (solo si Step 1 = defecto de producción)**

Aplicar el cambio más pequeño que restaure el comportamiento documentado en `docs/superpowers/plans/2026-08-26-permiso-alta-persona-rangos-salariales.md`. Prohibido: relajar 403 a 200, quitar `serialize`, conceder permisos en seeders, encender exigencia de fábrica.

- [ ] **Step 3: Re-correr la suite que falló + typecheck/lint**

```bash
node ace test --files="<spec-que-fallo>" unit   # o functional
npm run typecheck
npx eslint <archivos-tocados>
```

Expected: PASS, typecheck limpio, lint limpio en archivos tocados.

- [ ] **Step 4: Commit (solo si hubo fix de producción)**

```bash
git add <archivos-de-produccion>
git commit -m "$(cat <<'EOF'
fix: <descripción en español del gap que el test expuso>

EOF
)"
```

- [ ] **Step 5: Suite de cierre de esta HU**

```bash
node ace test --files="person_subject_type" --files="positions_permission_catalog" --files="position_salary_range_permission_gate_routes" --files="system_permission_catalog" --files="sensitive_serialize_wiring" unit
node ace test --files="position_salary_range_permission_gate" --files="position_salary_range_audit_sensitive_read" --files="person_store_subject_type_permission_gate" functional
```

Expected: todos PASS. La exigencia de `employees` y `positions` queda `false` en BD (cada teardown lo garantiza; si un suite abortó a mitad, re-apagar a mano con una query de solo esa columna antes de terminar).

---

## Self-Review

**1. Spec coverage (HU USRH1787433076995):**

| Requisito de la HU | Task de QA |
|---|---|
| 4 acciones de `positions`, sin `legacyEquivalence`, una sección | Task 2 |
| `positions.actionsEnumerated === true` en el índice | Task 2 |
| 7 rutas ↔ 4 slugs (read/write/delete/audit-read) | Task 2 + Task 4 |
| Gates inertes con exigencia OFF | Task 4 + Task 6 |
| Exigencia ON + solo `salary-ranges-read` | Task 4 |
| Cuerpo 403 `PERM.DENIED` | Task 4 + Task 6 |
| 4 importes de bitácora clasificados + `serialize` numérico | Task 3 + Task 5 |
| Enmascarado independiente del interruptor de `positions` | Task 5 |
| Fail-closed `personSubjectType` | Task 1 + Task 6 |
| Destinos customer / flight-attendant / pilot / system-user sin write | Task 1 + Task 6 |
| `valor-invalido` sin write → 403; con write → 422 | Task 6 |
| `GET /api/persons` exige `tab-persona-read` | Task 6 |
| Gap de producción se corrige, no se silencia | Task 7 |

Fuera de alcance (igual que la HU): BO, e2e de `gsti-rh-bo`, encender exigencia de fábrica, conceder los 4 permisos a roles reales, bypass `owner`/`root` (ya cubierto por suites hermanas de employees).

**2. Placeholder scan:** no hay TBD / “similar to Task N” sin código. Los helpers de Task 5 se copian enteros de Task 4 (el archivo commiteado no puede dejar `// ...`).

**3. Type consistency:** `PersonSubjectType` literales = `PERSON_SUBJECT_TYPES`. Slugs de gates = `POSITIONS_PERMISSION_CATALOG`. `grantModuleOnly(roleId, 'positions' | 'employees', slugs)`. Header de tenant = `businessUnitPublicId`.

---

Plan complete and saved to `docs/superpowers/plans/2026-08-26-qa-permiso-alta-persona-rangos-salariales.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
