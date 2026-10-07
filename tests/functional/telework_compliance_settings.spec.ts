import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import SystemModule from '#models/system_module'
import RoleSystemPermission from '#models/role_system_permission'
import {
  grantModuleAction,
  type ModuleActionGrant,
} from './employees/sensitive_read_by_category_support.js'
import { ensureRole, type TestRoleSlug } from '#tests/helpers/ensure_role'

/**
 * Tests funcionales — superficie HTTP de los ajustes de teletrabajo por empresa
 * (VLRH-H1791306074375), `GET`/`PUT /api/nom037/telework-settings`.
 *
 * Cubre: 401 sin sesión (2); permisos del módulo `telework-settings` con el
 * helper compartido (CA-9, Review Focus 1 y 2); y el contrato de lectura y
 * escritura con un `root` que omite el guard (CA-1 a CA-8). El servicio de
 * dominio ya está probado en `tests/unit/services/telework_compliance_setting_service.spec.ts`;
 * aquí se verifica la capa HTTP: envoltura de respuesta, `data.field` del 422,
 * el 403 sin `detail` del helper y el aislamiento por empresa.
 *
 * Convenciones (moldes `telework_policy.spec.ts` / `position_level.spec.ts`):
 * usuarios con email único por timestamp, sin transacciones, cleanup explícito
 * en `group.teardown` (los ajustes se borran antes que los usuarios por la FK
 * `RESTRICT` de `created_by`/`updated_by`). El header `X-Business-Unit-Id` lleva
 * el código público UUID de la empresa, nunca el id interno.
 */

const TEST_PASSWORD = 'TeleworkSettingsTest123!'
const ROOT_ROLE = 'root'
const NO_PERMISSION_ROLE = 'empleado' // no tiene el permiso 'telework-settings'
const MODULE_SLUG = 'telework-settings'

/** Payload válido de referencia (CA-2): 6 meses, 15 días, 350/500/250 MXN. */
const VALID_PAYLOAD: Record<string, unknown> = {
  revalidationPeriodMonths: 6,
  expirationNoticeDays: 15,
  electricityAllowanceDefault: 350,
  internetAllowanceDefault: 500,
  ownEquipmentFeeDefault: 250,
}

interface TestActor {
  user: User
  person: Person
  roleId: number
}

async function createTestActor(roleSlug: TestRoleSlug, emailPrefix: string): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'TeleworkSettings'
  person.personLastname = 'Test'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const role = await ensureRole(roleSlug)

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person, roleId: role.roleId }
}

async function cleanupTestActor(actor: TestActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

/** Retira la concesión solo si este spec la creó (rol compartido). */
async function revokeGrant(grant: ModuleActionGrant | null) {
  if (grant?.created) {
    await RoleSystemPermission.query()
      .where('role_system_permission_id', grant.grant.roleSystemPermissionId)
      .delete()
  }
}

async function getPrimaryBusinessUnit(): Promise<BusinessUnit> {
  return BusinessUnit.query().where('business_unit_active', 1).firstOrFail()
}

async function countSettings(businessUnitId: number): Promise<number> {
  const row = await db
    .from('telework_compliance_settings')
    .where('business_unit_id', businessUnitId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

async function deleteSettings(businessUnitId: number) {
  await db.from('telework_compliance_settings').where('business_unit_id', businessUnitId).delete()
}

/**
 * Materializa el permiso `gestion` del módulo que el helper RBAC consulta.
 *
 * El catálogo de la HU (spec §8 / Task 1) declara `read` y `update` para
 * `telework-settings`, así que no existe una fila `gestion` que conceder. El
 * bypass `gestion` es una convención del helper (`assertComplianceRepsePermission`
 * resuelve `hasAction || hasGestion`); para ejercitarlo de verdad —Review Focus 2—
 * el spec crea el permiso que el helper busca y lo retira al terminar.
 */
async function createGestionPermission(): Promise<number> {
  const systemModule = await SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', MODULE_SLUG)
    .firstOrFail()
  const insert = await db.table('system_permissions').insert({
    system_permission_name: 'Gestión completa de ajustes de teletrabajo',
    system_permission_slug: 'gestion',
    system_module_id: systemModule.systemModuleId,
    system_permission_created_at: new Date(),
  })
  return Number(insert[0])
}

async function deleteGestionPermission(systemPermissionId: number) {
  await db.from('role_system_permissions').where('system_permission_id', systemPermissionId).delete()
  await db.from('system_permissions').where('system_permission_id', systemPermissionId).delete()
}

function getSettings(client: ApiClient, user: User, businessUnit: BusinessUnit) {
  return client
    .get('/api/nom037/telework-settings')
    .loginAs(user)
    .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
}

function putSettings(
  client: ApiClient,
  user: User,
  businessUnit: BusinessUnit,
  body: Record<string, unknown>
) {
  return client
    .put('/api/nom037/telework-settings')
    .loginAs(user)
    .header('X-Business-Unit-Id', businessUnit.businessUnitPublicId)
    .json(body)
}

test.group('telework-settings — autenticación (401)', () => {
  test('Objetivo: GET /api/nom037/telework-settings sin sesión responde 401', async ({
    client,
  }) => {
    const response = await client.get('/api/nom037/telework-settings')
    response.assertStatus(401)
  })

  test('Objetivo: PUT /api/nom037/telework-settings sin sesión responde 401', async ({
    client,
  }) => {
    const response = await client.put('/api/nom037/telework-settings').json(VALID_PAYLOAD)
    response.assertStatus(401)
  })
})

test.group('telework-settings — permisos (CA-9, Review Focus 1 y 2)', (group) => {
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    businessUnit = await getPrimaryBusinessUnit()
  })

  test('Objetivo: CA-9 — sin permiso de lectura responde 403 con el errorCode del helper', async ({
    client,
    assert,
  }) => {
    const actor = await createTestActor(NO_PERMISSION_ROLE, 'sin-permiso')
    try {
      await actor.user.related('businessUnits').attach([businessUnit!.businessUnitId])
      const response = await getSettings(client, actor.user, businessUnit!)

      response.assertStatus(403)
      const body = response.body()
      assert.equal(body.type, 'error')
      assert.equal(body.key, 'sin-permiso')
      assert.equal(body.errorCode, 'TWS.AUTH.001')
      assert.isNull(body.data)
      // El helper responde con su forma propia: sin `detail`.
      assert.notProperty(body, 'detail')
    } finally {
      await cleanupTestActor(actor)
    }
  })

  test('Objetivo: CA-9 — con read sin update, GET responde 200 y PUT 403 sin escribir', async ({
    client,
    assert,
  }) => {
    const actor = await createTestActor(NO_PERMISSION_ROLE, 'solo-read')
    let grant: ModuleActionGrant | null = null
    try {
      await actor.user.related('businessUnits').attach([businessUnit!.businessUnitId])
      grant = await grantModuleAction(actor.roleId, MODULE_SLUG, 'read')

      const read = await getSettings(client, actor.user, businessUnit!)
      read.assertStatus(200)
      assert.isTrue(read.body().data.isDefault)

      const write = await putSettings(client, actor.user, businessUnit!, VALID_PAYLOAD)
      write.assertStatus(403)
      assert.equal(write.body().key, 'sin-permiso')
      assert.equal(write.body().errorCode, 'TWS.AUTH.001')

      assert.equal(await countSettings(businessUnit!.businessUnitId), 0)
    } finally {
      await deleteSettings(businessUnit!.businessUnitId)
      await revokeGrant(grant)
      await cleanupTestActor(actor)
    }
  })

  test('Objetivo: Review Focus 2 — un rol con solo gestion puede leer y guardar', async ({
    client,
    assert,
  }) => {
    const actor = await createTestActor(NO_PERMISSION_ROLE, 'solo-gestion')
    let grant: ModuleActionGrant | null = null
    let gestionPermissionId: number | null = null
    try {
      await actor.user.related('businessUnits').attach([businessUnit!.businessUnitId])
      gestionPermissionId = await createGestionPermission()
      grant = await grantModuleAction(actor.roleId, MODULE_SLUG, 'gestion')

      const read = await getSettings(client, actor.user, businessUnit!)
      read.assertStatus(200)

      const write = await putSettings(client, actor.user, businessUnit!, VALID_PAYLOAD)
      write.assertStatus(200)
      assert.isFalse(write.body().data.isDefault)
    } finally {
      await deleteSettings(businessUnit!.businessUnitId)
      await revokeGrant(grant)
      if (gestionPermissionId) {
        await deleteGestionPermission(gestionPermissionId)
      }
      await cleanupTestActor(actor)
    }
  })

  test('Objetivo: Review Focus 1 — sin header de empresa responde el error del middleware businessScope', async ({
    client,
    assert,
  }) => {
    const actor = await createTestActor(NO_PERMISSION_ROLE, 'sin-header')
    try {
      await actor.user.related('businessUnits').attach([businessUnit!.businessUnitId])
      // Sin header: el middleware responde su error antes de que el controlador lea.
      const response = await client.get('/api/nom037/telework-settings').loginAs(actor.user)

      response.assertStatus(400)
      assert.notEqual(response.status(), 200)
      assert.equal(response.body().key, 'BU.VAL.000')
      assert.equal(await countSettings(businessUnit!.businessUnitId), 0)
    } finally {
      await cleanupTestActor(actor)
    }
  })
})

test.group('telework-settings — contrato de lectura y escritura (CA-1 a CA-8)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let businessUnitB: BusinessUnit | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE, 'root')
    businessUnit = await getPrimaryBusinessUnit()
    await root.user.related('businessUnits').attach([businessUnit.businessUnitId])
    // Determinismo: la empresa arranca sin ajustes (incluidas filas huérfanas).
    await deleteSettings(businessUnit.businessUnitId)
  })

  group.teardown(async () => {
    // Los ajustes referencian usuarios con FK RESTRICT: se borran antes que las
    // cuentas. La empresa B debe soltarse del actor antes de borrarla (FK
    // `business_unit_users_business_unit_id_foreign`).
    if (businessUnit) {
      await deleteSettings(businessUnit.businessUnitId)
    }
    if (businessUnitB) {
      await deleteSettings(businessUnitB.businessUnitId)
    }
    if (root) {
      await root.user.related('businessUnits').detach()
    }
    if (businessUnitB) {
      await BusinessUnit.query().where('business_unit_id', businessUnitB.businessUnitId).delete()
    }
    await cleanupTestActor(root)
  })

  test('Objetivo: CA-1 — GET sin fila devuelve el default virtual y no crea nada', async ({
    client,
    assert,
  }) => {
    const response = await getSettings(client, root!.user, businessUnit!)

    response.assertStatus(200)
    assert.equal(response.body().type, 'success')
    assert.deepEqual(response.body().data, {
      isDefault: true,
      teleworkComplianceSettingId: null,
      revalidationPeriodMonths: 12,
      expirationNoticeDays: 30,
      electricityAllowanceDefault: null,
      internetAllowanceDefault: null,
      ownEquipmentFeeDefault: null,
      updatedAt: null,
      updatedByName: null,
    })
    assert.equal(await countSettings(businessUnit!.businessUnitId), 0)
  })

  test('Objetivo: CA-2 — PUT válido crea, y el segundo PUT edita la misma fila', async ({
    client,
    assert,
  }) => {
    const first = await putSettings(client, root!.user, businessUnit!, VALID_PAYLOAD)
    first.assertStatus(200)

    const created = first.body().data
    assert.isFalse(created.isDefault)
    assert.isNumber(created.teleworkComplianceSettingId)
    assert.equal(created.revalidationPeriodMonths, 6)
    assert.equal(created.expirationNoticeDays, 15)
    assert.equal(created.electricityAllowanceDefault, 350)
    assert.equal(created.internetAllowanceDefault, 500)
    assert.equal(created.ownEquipmentFeeDefault, 250)
    assert.match(created.updatedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.isString(created.updatedByName)
    assert.notEqual(created.updatedByName, '')
    assert.equal(await countSettings(businessUnit!.businessUnitId), 1)

    const rawAfterCreate = await db
      .from('telework_compliance_settings')
      .where('business_unit_id', businessUnit!.businessUnitId)
      .first()
    const createdBy = Number(rawAfterCreate!.telework_compliance_setting_created_by_user_id)

    const second = await putSettings(client, root!.user, businessUnit!, {
      ...VALID_PAYLOAD,
      internetAllowanceDefault: null,
    })
    second.assertStatus(200)
    assert.isNull(second.body().data.internetAllowanceDefault)
    assert.equal(await countSettings(businessUnit!.businessUnitId), 1)

    const rawAfterUpdate = await db
      .from('telework_compliance_settings')
      .where('business_unit_id', businessUnit!.businessUnitId)
      .first()
    assert.equal(
      Number(rawAfterUpdate!.telework_compliance_setting_created_by_user_id),
      createdBy
    )
    assert.equal(
      Number(rawAfterUpdate!.telework_compliance_setting_updated_by_user_id),
      root!.user.userId
    )
  })

  test('Objetivo: CA-3 — 0.29 redondea limpio en el round-trip', async ({ client, assert }) => {
    const put = await putSettings(client, root!.user, businessUnit!, {
      revalidationPeriodMonths: 6,
      expirationNoticeDays: 15,
      electricityAllowanceDefault: 0.29,
      internetAllowanceDefault: null,
      ownEquipmentFeeDefault: 250,
    })
    put.assertStatus(200)

    const get = await getSettings(client, root!.user, businessUnit!)
    get.assertStatus(200)
    assert.isNumber(get.body().data.electricityAllowanceDefault)
    assert.equal(get.body().data.electricityAllowanceDefault, 0.29)
  })

  test('Objetivo: CA-4 — el aislamiento entre empresas se respeta', async ({ client, assert }) => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
    businessUnitB = new BusinessUnit()
    businessUnitB.businessUnitPublicId = randomUUID()
    businessUnitB.businessUnitName = `TeleworkSettings Aislamiento ${stamp}`
    businessUnitB.businessUnitSlug = `telework-settings-aislamiento-${stamp}`
    businessUnitB.businessUnitLegalName = `TeleworkSettings Aislamiento Legal ${stamp}`
    businessUnitB.businessUnitActive = 1
    businessUnitB.businessUnitOrigin = 'platform'
    businessUnitB.businessUnitTimezone = 'America/Mexico_City'
    await businessUnitB.save()
    await root!.user.related('businessUnits').attach([businessUnitB.businessUnitId])

    // GET con header de B → default virtual de B.
    const readB = await getSettings(client, root!.user, businessUnitB)
    readB.assertStatus(200)
    assert.isTrue(readB.body().data.isDefault)
    assert.equal(readB.body().data.revalidationPeriodMonths, 12)
    assert.equal(readB.body().data.expirationNoticeDays, 30)

    // PUT desde B con `businessUnitId` de A en el body → el campo se ignora.
    const writeB = await putSettings(client, root!.user, businessUnitB, {
      businessUnitId: businessUnit!.businessUnitId,
      revalidationPeriodMonths: 3,
      expirationNoticeDays: 20,
      electricityAllowanceDefault: 100,
      internetAllowanceDefault: 200,
      ownEquipmentFeeDefault: 300,
    })
    writeB.assertStatus(200)
    assert.isFalse(writeB.body().data.isDefault)

    assert.equal(await countSettings(businessUnitB.businessUnitId), 1)
    assert.equal(await countSettings(businessUnit!.businessUnitId), 1)

    // La fila de A queda intacta.
    const readA = await getSettings(client, root!.user, businessUnit!)
    readA.assertStatus(200)
    assert.equal(readA.body().data.revalidationPeriodMonths, 6)
    assert.equal(readA.body().data.electricityAllowanceDefault, 0.29)
  })

  test('Objetivo: CA-5 — periodicidad inválida no cambia lo guardado', async ({
    client,
    assert,
  }) => {
    for (const value of [0, 13, 6.5]) {
      const response = await putSettings(client, root!.user, businessUnit!, {
        ...VALID_PAYLOAD,
        revalidationPeriodMonths: value,
      })
      response.assertStatus(422)
      const body = response.body()
      assert.equal(body.title, 'Periodicidad de revalidación inválida')
      assert.equal(body.key, 'periodicidad-de-revalidacion-invalida')
      assert.equal(body.code, 'TWS.VAL.002')
      assert.deepEqual(body.data, { field: 'revalidationPeriodMonths' })
    }

    const get = await getSettings(client, root!.user, businessUnit!)
    get.assertStatus(200)
    assert.equal(get.body().data.revalidationPeriodMonths, 6)
    assert.equal(get.body().data.electricityAllowanceDefault, 0.29)
  })

  test('Objetivo: CA-6 — ventana de aviso inválida por campo', async ({ client, assert }) => {
    const invalidCases = [
      { months: 6, notice: 200 },
      { months: 6, notice: 180 },
      { months: 6, notice: 0 },
      { months: 1, notice: 30 },
    ]
    for (const { months, notice } of invalidCases) {
      const response = await putSettings(client, root!.user, businessUnit!, {
        ...VALID_PAYLOAD,
        revalidationPeriodMonths: months,
        expirationNoticeDays: notice,
      })
      response.assertStatus(422)
      const body = response.body()
      assert.equal(body.key, 'ventana-de-aviso-invalida')
      assert.equal(body.code, 'TWS.VAL.003')
      assert.deepEqual(body.data, { field: 'expirationNoticeDays' })
    }

    const validCases = [
      { months: 6, notice: 179 },
      { months: 1, notice: 29 },
    ]
    for (const { months, notice } of validCases) {
      const response = await putSettings(client, root!.user, businessUnit!, {
        ...VALID_PAYLOAD,
        revalidationPeriodMonths: months,
        expirationNoticeDays: notice,
      })
      response.assertStatus(200)
    }
  })

  test('Objetivo: CA-7 — monto inválido por campo, y el tope guarda', async ({
    client,
    assert,
  }) => {
    for (const value of [-1, 350.555, 100000000]) {
      const response = await putSettings(client, root!.user, businessUnit!, {
        ...VALID_PAYLOAD,
        internetAllowanceDefault: value,
      })
      response.assertStatus(422)
      const body = response.body()
      assert.equal(body.key, 'monto-invalido')
      assert.equal(body.code, 'TWS.VAL.004')
      assert.deepEqual(body.data, { field: 'internetAllowanceDefault' })
      assert.include(String(body.detail), 'internetAllowanceDefault')
    }

    const atCap = await putSettings(client, root!.user, businessUnit!, {
      ...VALID_PAYLOAD,
      internetAllowanceDefault: 99999999.99,
    })
    atCap.assertStatus(200)
    assert.equal(atCap.body().data.internetAllowanceDefault, 99999999.99)
  })

  test('Objetivo: CA-8 — entrada mal formada responde entrada-invalida', async ({
    client,
    assert,
  }) => {
    // Llave obligatoria faltante.
    const missingKey = await putSettings(client, root!.user, businessUnit!, {
      revalidationPeriodMonths: 6,
      expirationNoticeDays: 15,
      electricityAllowanceDefault: 350,
      internetAllowanceDefault: 500,
    })
    missingKey.assertStatus(422)
    assert.equal(missingKey.body().key, 'entrada-invalida')
    assert.equal(missingKey.body().code, 'TWS.VAL.001')

    // Tipo inválido (Vine).
    const wrongType = await putSettings(client, root!.user, businessUnit!, {
      ...VALID_PAYLOAD,
      revalidationPeriodMonths: 'seis',
    })
    wrongType.assertStatus(422)
    assert.equal(wrongType.body().key, 'entrada-invalida')
    assert.equal(wrongType.body().code, 'TWS.VAL.001')

    // Dos campos de dominio inválidos: gana el primero del orden (periodicidad).
    const twoBad = await putSettings(client, root!.user, businessUnit!, {
      ...VALID_PAYLOAD,
      revalidationPeriodMonths: 0,
      expirationNoticeDays: 200,
    })
    twoBad.assertStatus(422)
    assert.equal(twoBad.body().key, 'periodicidad-de-revalidacion-invalida')
    assert.equal(twoBad.body().code, 'TWS.VAL.002')
  })
})
