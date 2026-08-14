import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Position from '#models/position'
import PositionLevel from '#models/position_level'
import PositionPositionLevel from '#models/position_position_level'
import PositionPositionLevelService from '#services/position_position_level_service'
import PositionPositionLevelServiceError from '#exceptions/position_position_level_service_error'

/**
 * Tests funcionales — configuración de niveles por puesto (USRH1785273891313).
 * Cubren los criterios CA-1..CA-11 del spec y la tabla de verificación
 * técnica §6 (`{ title, detail, key, code }`).
 *
 * Convenciones (siguiendo `position_level.spec.ts`):
 *  - Fixtures con timestamp único, sin transacciones, cleanup en `group.teardown`.
 *  - `root` (bypass RBAC + scope total) para el flujo feliz y aislamiento
 *    cross-tenant; un actor `empleado` (sin permiso) para los casos 403.
 *  - El middleware de scope resuelve la request a UNA sola unidad de negocio
 *    (la del header `X-Business-Unit-Id`), incluso para `root`.
 */

const TEST_PASSWORD = 'PositionPositionLevelTest123!'
const ROOT_ROLE_ID = 3
const NO_PERMISSION_ROLE_ID = 4 // empleado: sin permiso del módulo organization-chart

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

interface TestActor {
  user: User
  person: Person
}

async function createTestActor(roleId: number, emailPrefix: string): Promise<TestActor> {
  const stamp = uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'PositionPositionLevel'
  person.personLastname = 'Test'
  person.personSecondLastname = emailPrefix
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  user.roleId = roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

async function cleanupTestActor(actor: TestActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function createTestBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `PositionPositionLevel ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `position-position-level-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `PositionPositionLevel ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function deleteBusinessUnit(businessUnit: BusinessUnit | null) {
  if (!businessUnit) return
  await db
    .from('position_position_levels')
    .where('business_unit_id', businessUnit.businessUnitId)
    .delete()
  await db.from('positions').where('business_unit_id', businessUnit.businessUnitId).delete()
  await db.from('position_levels').where('business_unit_id', businessUnit.businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
}

async function createTestPosition(businessUnitId: number, prefix: string): Promise<Position> {
  const stamp = uniqueStamp()
  const position = new Position()
  position.positionSyncId = 0
  position.positionCode = `PPL-${prefix}-${stamp}`.slice(0, 50)
  position.positionName = `Puesto ${prefix} ${stamp}`.slice(0, 100)
  position.positionActive = 1
  position.businessUnitId = businessUnitId
  await position.save()
  return position
}

async function createCatalogLevel(
  businessUnitId: number,
  name: string,
  rank: number,
  active: boolean = true
): Promise<PositionLevel> {
  const level = new PositionLevel()
  level.businessUnitId = businessUnitId
  level.positionLevelName = name
  level.positionLevelRank = rank
  level.positionLevelActive = active
  await level.save()
  return level
}

function serviceInstance(): PositionPositionLevelService {
  return new PositionPositionLevelService(i18nManager.locale(i18nManager.defaultLocale))
}

test.group('PositionPositionLevels - auth (401 sin autenticación)', () => {
  test('GET /api/positions/:positionId/levels responde 401', async ({ client }) => {
    const response = await client.get('/api/positions/1/levels')
    response.assertStatus(401)
  })

  test('PUT /api/positions/:positionId/levels responde 401', async ({ client }) => {
    const response = await client.put('/api/positions/1/levels').json({ levels: [] })
    response.assertStatus(401)
  })

  test('DELETE /api/positions/:positionId/levels/:id responde 401', async ({ client }) => {
    const response = await client.delete('/api/positions/1/levels/1')
    response.assertStatus(401)
  })
})

test.group('PositionPositionLevels - sin permiso (403, regla 14)', (group) => {
  let actor: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let position: Position | null = null

  group.setup(async () => {
    actor = await createTestActor(NO_PERMISSION_ROLE_ID, 'ppl-no-permiso')
    businessUnit = await createTestBusinessUnit('no-permiso')
    await actor.user.related('businessUnits').attach([businessUnit.businessUnitId])
    position = await createTestPosition(businessUnit.businessUnitId, 'no-permiso')
  })

  group.teardown(async () => {
    await cleanupTestActor(actor)
    await deleteBusinessUnit(businessUnit)
  })

  test('GET responde 403 con el contrato {title, detail, key, code}', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/positions/${position!.positionId}/levels`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    const body = response.body()
    assert.isString(body.title)
    assert.isString(body.detail)
    assert.equal(body.key, 'sin-permiso')
    assert.equal(body.code, 'ORG.POSLEVELCFG.FORBIDDEN')
  })

  test('PUT responde 403 sin el permiso update', async ({ client, assert }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ levels: [] })

    response.assertStatus(403)
    assert.equal(response.body().code, 'ORG.POSLEVELCFG.FORBIDDEN')
  })

  test('DELETE responde 403 sin el permiso update', async ({ client, assert }) => {
    const response = await client
      .delete(`/api/positions/${position!.positionId}/levels/1`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    assert.equal(response.body().key, 'sin-permiso')
  })
})

test.group('PositionPositionLevels - flujo feliz (root) CA-1/2/3/9/10/11', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let position: Position | null = null
  let junior: PositionLevel | null = null
  let semiSenior: PositionLevel | null = null
  let senior: PositionLevel | null = null
  let juniorRowId: number | null = null
  let semiSeniorRowId: number | null = null
  let adHocRowId: number | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'ppl-root-happy')
    businessUnit = await createTestBusinessUnit('happy')
    position = await createTestPosition(businessUnit.businessUnitId, 'happy')
    junior = await createCatalogLevel(businessUnit.businessUnitId, 'Junior', 1)
    semiSenior = await createCatalogLevel(businessUnit.businessUnitId, 'Semi Senior', 2)
    senior = await createCatalogLevel(businessUnit.businessUnitId, 'Senior', 3)
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('CA-3: un puesto recién creado no tiene niveles y GET responde 200 vacío', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.isArray(response.body().data.positionLevels)
    assert.lengthOf(response.body().data.positionLevels, 0)
  })

  test('CA-1/CA-2: PUT guarda catálogo + ad-hoc con default único y ranks 1..n', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: junior!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
          {
            positionLevelId: semiSenior!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 2,
            positionPositionLevelIsDefault: true,
            positionPositionLevelActive: true,
          },
          {
            positionLevelId: null,
            positionPositionLevelAdHocName: 'Local',
            positionPositionLevelRank: 3,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(200)
    const rows = response.body().data.positionLevels
    assert.lengthOf(rows, 3)

    assert.equal(rows[0].positionLevelId, junior!.positionLevelId)
    assert.equal(rows[0].displayName, 'Junior')
    assert.equal(rows[0].source, 'catalog')
    assert.equal(rows[0].positionPositionLevelRank, 1)
    assert.isNull(rows[0].positionPositionLevelAdHocName)

    assert.equal(rows[1].displayName, 'Semi Senior')
    assert.isTrue(rows[1].positionPositionLevelIsDefault)

    assert.isNull(rows[2].positionLevelId)
    assert.equal(rows[2].positionPositionLevelAdHocName, 'Local')
    assert.equal(rows[2].displayName, 'Local')
    assert.equal(rows[2].source, 'adHoc')

    assert.lengthOf(
      rows.filter((row: { positionPositionLevelIsDefault: boolean }) => {
        return row.positionPositionLevelIsDefault
      }),
      1
    )

    juniorRowId = rows[0].positionPositionLevelId
    semiSeniorRowId = rows[1].positionPositionLevelId
    adHocRowId = rows[2].positionPositionLevelId

    // Regla 13: business_unit_id derivado del puesto, no del payload
    const persisted = await db
      .from('position_position_levels')
      .where('position_id', position!.positionId)
      .whereNull('position_position_level_deleted_at')
    assert.lengthOf(persisted, 3)
    for (const row of persisted) {
      assert.equal(row.business_unit_id, businessUnit!.businessUnitId)
    }

    // CA-2: el catálogo de la empresa no se toca (el ad-hoc no crea filas)
    const catalogCount = await db
      .from('position_levels')
      .where('business_unit_id', businessUnit!.businessUnitId)
      .whereNull('position_level_deleted_at')
      .count('* as total')
    assert.equal(Number(catalogCount[0].total), 3)
  })

  test('CA-10: GET devuelve la lista ordenada por rank con el contrato completo', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const rows = response.body().data.positionLevels
    assert.lengthOf(rows, 3)
    assert.deepEqual(
      rows.map((row: { positionPositionLevelRank: number }) => row.positionPositionLevelRank),
      [1, 2, 3]
    )
    for (const row of rows) {
      assert.isNumber(row.positionPositionLevelId)
      assert.isString(row.displayName)
      assert.oneOf(row.source, ['catalog', 'adHoc'])
      assert.isBoolean(row.positionPositionLevelIsDefault)
      assert.isBoolean(row.positionPositionLevelActive)
    }
  })

  test('el diffing preserva identidad: update por id, alta nueva y baja de la omitida', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionPositionLevelId: semiSeniorRowId,
            positionLevelId: semiSenior!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: true,
            positionPositionLevelActive: true,
          },
          {
            positionPositionLevelId: adHocRowId,
            positionLevelId: null,
            positionPositionLevelAdHocName: 'Local',
            positionPositionLevelRank: 2,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: false,
          },
          {
            positionLevelId: null,
            positionPositionLevelAdHocName: 'Foráneo',
            positionPositionLevelRank: 3,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(200)
    const rows = response.body().data.positionLevels
    assert.lengthOf(rows, 3)

    // La fila del catálogo conservó su id (identidad estable entre guardados)
    assert.equal(rows[0].positionPositionLevelId, semiSeniorRowId)
    assert.equal(rows[1].positionPositionLevelId, adHocRowId)
    assert.isFalse(rows[1].positionPositionLevelActive)

    // La fila omitida (Junior) quedó con baja lógica
    const juniorRow = await db
      .from('position_position_levels')
      .where('position_position_level_id', juniorRowId!)
      .first()
    assert.isNotNull(juniorRow.position_position_level_deleted_at)

    adHocRowId = rows[1].positionPositionLevelId
  })

  test('GET ?active=true excluye los renglones desactivados', async ({ client, assert }) => {
    const response = await client
      .get(`/api/positions/${position!.positionId}/levels`)
      .qs({ active: true })
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const rows = response.body().data.positionLevels
    assert.lengthOf(rows, 2)
    for (const row of rows) {
      assert.isTrue(row.positionPositionLevelActive)
    }
  })

  test('CA-9: quitar la marca de default deja al puesto sin default, sin promoción', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionPositionLevelId: semiSeniorRowId,
            positionLevelId: semiSenior!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(200)
    const rows = response.body().data.positionLevels
    assert.lengthOf(rows, 1)
    assert.isFalse(rows[0].positionPositionLevelIsDefault)
  })

  test('regla 1: PUT con lista vacía deja el puesto sin niveles', async ({ client, assert }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ levels: [] })

    response.assertStatus(200)
    assert.lengthOf(response.body().data.positionLevels, 0)

    const alive = await db
      .from('position_position_levels')
      .where('position_id', position!.positionId)
      .whereNull('position_position_level_deleted_at')
    assert.lengthOf(alive, 0)

    // `senior` nunca se activó en el puesto y el catálogo sigue intacto
    const seniorRow = await db
      .from('position_levels')
      .where('position_level_id', senior!.positionLevelId)
      .first()
    assert.isNull(seniorRow.position_level_deleted_at)
  })
})

test.group('PositionPositionLevels - validaciones del bloque (CA-4/5/6/7)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let otherBusinessUnit: BusinessUnit | null = null
  let position: Position | null = null
  let seniorLevel: PositionLevel | null = null
  let inactiveLevel: PositionLevel | null = null
  let deletedLevel: PositionLevel | null = null
  let foreignLevel: PositionLevel | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'ppl-root-valid')
    businessUnit = await createTestBusinessUnit('valid')
    otherBusinessUnit = await createTestBusinessUnit('valid-other')
    position = await createTestPosition(businessUnit.businessUnitId, 'valid')
    seniorLevel = await createCatalogLevel(businessUnit.businessUnitId, 'Senior', 1)
    inactiveLevel = await createCatalogLevel(businessUnit.businessUnitId, 'Inactivo', 2, false)
    deletedLevel = await createCatalogLevel(businessUnit.businessUnitId, 'Eliminado', 3)
    await deletedLevel.delete()
    foreignLevel = await createCatalogLevel(otherBusinessUnit.businessUnitId, 'Ajeno', 1)
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
    await deleteBusinessUnit(otherBusinessUnit)
  })

  test('regla 5: renglón con ambas fuentes responde 422 nivel-origen-ambiguo', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: seniorLevel!.positionLevelId,
            positionPositionLevelAdHocName: 'Ambiguo',
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'nivel-origen-ambiguo')
    assert.equal(body.code, 'ORG.POSLEVELCFG.LEVEL_SOURCE_AMBIGUOUS')
  })

  test('CA-4: renglón sin ninguna fuente responde 422 nivel-propio-sin-nombre', async ({
    client,
    assert,
  }) => {
    // `convertEmptyStringsToNull` hace indistinguible "sin fuente" de
    // "ad-hoc con nombre vacío"; CA-4 fija la respuesta de ambos casos.
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: null,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(422)
    assert.equal(response.body().key, 'nivel-propio-sin-nombre')
  })

  test('CA-4: ad-hoc con nombre vacío o en blanco responde 422 nivel-propio-sin-nombre', async ({
    client,
    assert,
  }) => {
    for (const emptyName of ['', '   ']) {
      const response = await client
        .put(`/api/positions/${position!.positionId}/levels`)
        .loginAs(root!.user)
        .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
        .json({
          levels: [
            {
              positionLevelId: null,
              positionPositionLevelAdHocName: emptyName,
              positionPositionLevelRank: 1,
              positionPositionLevelIsDefault: false,
              positionPositionLevelActive: true,
            },
          ],
        })

      response.assertStatus(422)
      const body = response.body()
      assert.equal(body.key, 'nivel-propio-sin-nombre')
      assert.equal(body.code, 'ORG.POSLEVELCFG.AD_HOC_NAME_REQUIRED')
    }
  })

  test('CA-6: el mismo nivel del catálogo dos veces responde 409 nivel-duplicado-en-puesto', async ({
    client,
    assert,
  }) => {
    const row = {
      positionLevelId: seniorLevel!.positionLevelId,
      positionPositionLevelAdHocName: null,
      positionPositionLevelIsDefault: false,
      positionPositionLevelActive: true,
    }
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          { ...row, positionPositionLevelRank: 1 },
          { ...row, positionPositionLevelRank: 2 },
        ],
      })

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.key, 'nivel-duplicado-en-puesto')
    assert.equal(body.code, 'ORG.POSLEVELCFG.DUPLICATE_LEVEL')
  })

  test('CA-6: dos ad-hoc con el mismo nombre normalizado responden 409', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: null,
            positionPositionLevelAdHocName: 'Fórum',
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
          {
            positionLevelId: null,
            positionPositionLevelAdHocName: 'forum',
            positionPositionLevelRank: 2,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(409)
    assert.equal(response.body().key, 'nivel-duplicado-en-puesto')
  })

  test('CA-6: un ad-hoc con el nombre de un nivel del catálogo activado responde 409', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: seniorLevel!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
          {
            positionLevelId: null,
            positionPositionLevelAdHocName: 'Sénior',
            positionPositionLevelRank: 2,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(409)
    assert.equal(response.body().key, 'nivel-duplicado-en-puesto')
  })

  test('CA-5: dos niveles marcados por omisión responden 409 mas-de-un-nivel-default', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: seniorLevel!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: true,
            positionPositionLevelActive: true,
          },
          {
            positionLevelId: null,
            positionPositionLevelAdHocName: 'Local',
            positionPositionLevelRank: 2,
            positionPositionLevelIsDefault: true,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.key, 'mas-de-un-nivel-default')
    assert.equal(body.code, 'ORG.POSLEVELCFG.MULTIPLE_DEFAULT')
  })

  test('regla 8: default sobre un renglón inactivo responde 422 default-en-nivel-inactivo', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: null,
            positionPositionLevelAdHocName: 'Local',
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: true,
            positionPositionLevelActive: false,
          },
        ],
      })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'default-en-nivel-inactivo')
    assert.equal(body.code, 'ORG.POSLEVELCFG.DEFAULT_ON_INACTIVE')
  })

  test('CA-7: un nivel de otra empresa responde 422 nivel-fuera-de-catalogo', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: foreignLevel!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.key, 'nivel-fuera-de-catalogo')
    assert.equal(body.code, 'ORG.POSLEVELCFG.LEVEL_NOT_IN_CATALOG')
  })

  test('CA-7: un nivel inactivo del catálogo no se puede activar (422)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: inactiveLevel!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(422)
    assert.equal(response.body().key, 'nivel-fuera-de-catalogo')
  })

  test('CA-7: un nivel eliminado del catálogo responde 422', async ({ client, assert }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: deletedLevel!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(422)
    assert.equal(response.body().key, 'nivel-fuera-de-catalogo')
  })

  test('un positionPositionLevelId caduco responde 400 datos-invalidos', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionPositionLevelId: 999999999,
            positionLevelId: seniorLevel!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(400)
    const body = response.body()
    assert.equal(body.key, 'datos-invalidos')
    assert.equal(body.code, 'ORG.POSLEVELCFG.VAL_INPUT')
  })

  test('400 de Vine: rank no entero responde datos-invalidos', async ({ client, assert }) => {
    const response = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: seniorLevel!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1.5,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })

    response.assertStatus(400)
    assert.equal(response.body().key, 'datos-invalidos')
  })

  test('ningún bloque inválido persistió nada (atomicidad, spec §12)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.lengthOf(response.body().data.positionLevels, 0)
  })
})

test.group('PositionPositionLevels - aislamiento multi-tenant (regla 13)', (group) => {
  let root: TestActor | null = null
  let businessUnitA: BusinessUnit | null = null
  let businessUnitB: BusinessUnit | null = null
  let positionB: Position | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'ppl-root-tenant')
    businessUnitA = await createTestBusinessUnit('tenant-a')
    businessUnitB = await createTestBusinessUnit('tenant-b')
    positionB = await createTestPosition(businessUnitB.businessUnitId, 'tenant-b')
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnitA)
    await deleteBusinessUnit(businessUnitB)
  })

  test('GET de un puesto de otra empresa responde 404 puesto-no-encontrado, no 403', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/positions/${positionB!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.key, 'puesto-no-encontrado')
    assert.equal(body.code, 'ORG.POSLEVELCFG.POSITION_NOT_FOUND')
  })

  test('PUT de un puesto de otra empresa responde 404', async ({ client, assert }) => {
    const response = await client
      .put(`/api/positions/${positionB!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)
      .json({ levels: [] })

    response.assertStatus(404)
    assert.equal(response.body().key, 'puesto-no-encontrado')
  })

  test('DELETE de un puesto de otra empresa responde 404', async ({ client, assert }) => {
    const response = await client
      .delete(`/api/positions/${positionB!.positionId}/levels/1`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'puesto-no-encontrado')
  })
})

test.group('PositionPositionLevels - DELETE individual (CA-8/CA-11)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let position: Position | null = null
  let otherPosition: Position | null = null
  let rowIds: number[] = []

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'ppl-root-delete')
    businessUnit = await createTestBusinessUnit('delete')
    position = await createTestPosition(businessUnit.businessUnitId, 'delete')
    otherPosition = await createTestPosition(businessUnit.businessUnitId, 'delete-other')

    const service = serviceInstance()
    const views = await service.replace(
      position.positionId,
      [
        {
          positionLevelId: null,
          positionPositionLevelAdHocName: 'Primero',
          positionPositionLevelRank: 1,
          positionPositionLevelIsDefault: false,
          positionPositionLevelActive: true,
        },
        {
          positionLevelId: null,
          positionPositionLevelAdHocName: 'Segundo',
          positionPositionLevelRank: 2,
          positionPositionLevelIsDefault: false,
          positionPositionLevelActive: true,
        },
        {
          positionLevelId: null,
          positionPositionLevelAdHocName: 'Tercero',
          positionPositionLevelRank: 3,
          positionPositionLevelIsDefault: false,
          positionPositionLevelActive: true,
        },
      ],
      [businessUnit.businessUnitId]
    )
    rowIds = views.map((view) => view.positionPositionLevelId)
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('DELETE quita el renglón con baja lógica y renumera la secuencia 1..n', async ({
    client,
    assert,
  }) => {
    const response = await client
      .delete(`/api/positions/${position!.positionId}/levels/${rowIds[1]}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)

    const deleted = await db
      .from('position_position_levels')
      .where('position_position_level_id', rowIds[1])
      .first()
    assert.isNotNull(deleted.position_position_level_deleted_at)

    const alive = await db
      .from('position_position_levels')
      .where('position_id', position!.positionId)
      .whereNull('position_position_level_deleted_at')
      .orderBy('position_position_level_rank', 'asc')
    assert.lengthOf(alive, 2)
    assert.deepEqual(
      alive.map((row) => row.position_position_level_rank),
      [1, 2]
    )
  })

  test('DELETE de un renglón inexistente responde 404 puesto-no-encontrado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .delete(`/api/positions/${position!.positionId}/levels/999999999`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'puesto-no-encontrado')
  })

  test('DELETE de un renglón de otro puesto responde 404', async ({ client, assert }) => {
    const response = await client
      .delete(`/api/positions/${otherPosition!.positionId}/levels/${rowIds[0]}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(404)
    assert.equal(response.body().key, 'puesto-no-encontrado')
  })
})

test.group('PositionPositionLevels - personal asignado (CA-8, stub R-2)', (group) => {
  let businessUnit: BusinessUnit | null = null
  let position: Position | null = null
  let level: PositionLevel | null = null
  let rowId: number | null = null

  group.setup(async () => {
    businessUnit = await createTestBusinessUnit('employees')
    position = await createTestPosition(businessUnit.businessUnitId, 'employees')
    level = await createCatalogLevel(businessUnit.businessUnitId, 'Con Gente', 1)

    const row = new PositionPositionLevel()
    row.positionId = position.positionId
    row.businessUnitId = businessUnit.businessUnitId
    row.positionLevelId = level.positionLevelId
    row.positionPositionLevelAdHocName = null
    row.positionPositionLevelRank = 1
    row.positionPositionLevelIsDefault = false
    row.positionPositionLevelActive = true
    await row.save()
    rowId = row.positionPositionLevelId
  })

  group.teardown(async () => {
    await deleteBusinessUnit(businessUnit)
  })

  test('con hasAssignedEmployees=true deleteOne rechaza con 409 nivel-con-personal-asignado', async ({
    assert,
  }) => {
    class WithEmployeesService extends PositionPositionLevelService {
      async hasAssignedEmployees(_positionPositionLevelId: number): Promise<boolean> {
        return true
      }
    }

    const service = new WithEmployeesService(i18nManager.locale(i18nManager.defaultLocale))

    try {
      await service.deleteOne(position!.positionId, rowId!, [businessUnit!.businessUnitId])
      assert.fail('deleteOne() debió rechazar el nivel con personal asignado')
    } catch (error) {
      assert.instanceOf(error, PositionPositionLevelServiceError)
      const serviceError = error as PositionPositionLevelServiceError
      assert.equal(serviceError.key, 'nivel-con-personal-asignado')
      assert.equal(serviceError.errorCode, 'ORG.POSLEVELCFG.LEVEL_HAS_EMPLOYEES')
      assert.equal(serviceError.httpStatus, 409)
    }

    const row = await db
      .from('position_position_levels')
      .where('position_position_level_id', rowId!)
      .first()
    assert.isNull(row.position_position_level_deleted_at)
  })

  test('con hasAssignedEmployees=true replace que omite la fila revierte todo (regla 10)', async ({
    assert,
  }) => {
    class WithEmployeesService extends PositionPositionLevelService {
      async hasAssignedEmployees(_positionPositionLevelId: number): Promise<boolean> {
        return true
      }
    }

    const service = new WithEmployeesService(i18nManager.locale(i18nManager.defaultLocale))

    try {
      await service.replace(position!.positionId, [], [businessUnit!.businessUnitId])
      assert.fail('replace() debió rechazar la baja de un nivel con personal asignado')
    } catch (error) {
      assert.instanceOf(error, PositionPositionLevelServiceError)
      const serviceError = error as PositionPositionLevelServiceError
      assert.equal(serviceError.key, 'nivel-con-personal-asignado')
      assert.equal(serviceError.httpStatus, 409)
    }

    const row = await db
      .from('position_position_levels')
      .where('position_position_level_id', rowId!)
      .first()
    assert.isNull(row.position_position_level_deleted_at)
  })

  test('el stub real devuelve false: sin consumidor, la baja procede', async ({ assert }) => {
    const service = serviceInstance()
    const result = await service.hasAssignedEmployees(rowId!)
    assert.isFalse(result)
  })
})

test.group('PositionPositionLevels - isInUse real del catálogo (CA-6 de HU 01)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let position: Position | null = null
  let level: PositionLevel | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'ppl-root-inuse')
    businessUnit = await createTestBusinessUnit('inuse')
    position = await createTestPosition(businessUnit.businessUnitId, 'inuse')
    level = await createCatalogLevel(businessUnit.businessUnitId, 'Usado', 1)
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('un nivel configurado en un puesto no se puede eliminar del catálogo (409 nivel-en-uso)', async ({
    client,
    assert,
  }) => {
    const putResponse = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({
        levels: [
          {
            positionLevelId: level!.positionLevelId,
            positionPositionLevelAdHocName: null,
            positionPositionLevelRank: 1,
            positionPositionLevelIsDefault: false,
            positionPositionLevelActive: true,
          },
        ],
      })
    putResponse.assertStatus(200)

    const deleteResponse = await client
      .delete(`/api/position-levels/${level!.positionLevelId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    deleteResponse.assertStatus(409)
    const body = deleteResponse.body()
    assert.equal(body.key, 'nivel-en-uso')
    assert.equal(body.code, 'ORG.POSLEVEL.IN_USE')
  })

  test('al quitar la configuración del puesto, el nivel del catálogo ya puede eliminarse', async ({
    client,
  }) => {
    const clearResponse = await client
      .put(`/api/positions/${position!.positionId}/levels`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ levels: [] })
    clearResponse.assertStatus(200)

    const deleteResponse = await client
      .delete(`/api/position-levels/${level!.positionLevelId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    deleteResponse.assertStatus(200)
  })
})
