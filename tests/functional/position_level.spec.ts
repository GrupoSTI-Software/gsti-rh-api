import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import User from '#models/user'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import PositionLevel from '#models/position_level'
import PositionLevelService from '#services/position_level_service'
import PositionLevelServiceError from '#exceptions/position_level_service_error'

/**
 * Tests funcionales — catálogo de niveles de puesto por empresa
 * (USRH1785273891312). Cubren los criterios CA-1..CA-7 del spec y la tabla
 * de verificación técnica §6 (`{ title, detail, key, code }`).
 *
 * Convenciones (siguiendo `repse_providers.spec.ts`):
 *  - Fixtures con timestamp único, sin transacciones, cleanup en `group.teardown`.
 *  - `root` (bypass RBAC + scope total) para el flujo feliz y aislamiento
 *    cross-tenant; un actor `empleado` (sin permiso) para los casos 403.
 *  - El middleware de scope resuelve la request a UNA sola unidad de negocio
 *    (la del header `X-Business-Unit-Id`), incluso para `root`.
 */

const TEST_PASSWORD = 'PositionLevelTest123!'
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
  person.personFirstname = 'PositionLevel'
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
  businessUnit.businessUnitName = `PositionLevel ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `position-level-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `PositionLevel ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function deleteBusinessUnit(businessUnit: BusinessUnit | null) {
  if (!businessUnit) return
  await db
    .from('position_levels')
    .where('business_unit_id', businessUnit.businessUnitId)
    .delete()
  await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
}

test.group('PositionLevels - auth (401 sin autenticación)', () => {
  test('GET /api/position-levels responde 401', async ({ client }) => {
    const response = await client.get('/api/position-levels')
    response.assertStatus(401)
  })

  test('GET /api/position-levels/:id responde 401', async ({ client }) => {
    const response = await client.get('/api/position-levels/1')
    response.assertStatus(401)
  })

  test('POST /api/position-levels responde 401', async ({ client }) => {
    const response = await client.post('/api/position-levels').json({})
    response.assertStatus(401)
  })

  test('PUT /api/position-levels/:id responde 401', async ({ client }) => {
    const response = await client.put('/api/position-levels/1').json({})
    response.assertStatus(401)
  })

  test('PATCH /api/position-levels/:id/active responde 401', async ({ client }) => {
    const response = await client.patch('/api/position-levels/1/active').json({})
    response.assertStatus(401)
  })

  test('PATCH /api/position-levels/reorder responde 401', async ({ client }) => {
    const response = await client.patch('/api/position-levels/reorder').json({})
    response.assertStatus(401)
  })

  test('DELETE /api/position-levels/:id responde 401', async ({ client }) => {
    const response = await client.delete('/api/position-levels/1')
    response.assertStatus(401)
  })
})

test.group('PositionLevels - sin permiso (403, regla 9)', (group) => {
  let actor: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    actor = await createTestActor(NO_PERMISSION_ROLE_ID, 'no-permiso')
    businessUnit = await createTestBusinessUnit('no-permiso')
    await actor.user.related('businessUnits').attach([businessUnit.businessUnitId])
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
      .get('/api/position-levels')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    const body = response.body()
    assert.isString(body.title)
    assert.isString(body.detail)
    assert.equal(body.key, 'sin-permiso')
    assert.equal(body.code, 'ORG.POSLEVEL.FORBIDDEN')
  })

  test('POST responde 403 sin el permiso update', async ({ client, assert }) => {
    const response = await client
      .post('/api/position-levels')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: 'Junior' })

    response.assertStatus(403)
    assert.equal(response.body().code, 'ORG.POSLEVEL.FORBIDDEN')
  })

  test('PATCH reorder responde 403 sin el permiso update', async ({ client, assert }) => {
    const response = await client
      .patch('/api/position-levels/reorder')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ orderedPositionLevelIds: [1] })

    response.assertStatus(403)
    assert.equal(response.body().key, 'sin-permiso')
  })

  test('DELETE responde 403 sin el permiso update', async ({ client, assert }) => {
    const response = await client
      .delete('/api/position-levels/1')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(403)
    assert.equal(response.body().key, 'sin-permiso')
  })
})

test.group('PositionLevels - flujo feliz (root) CA-1/2/4/5/7', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null
  let juniorId: number | null = null
  let seniorId: number | null = null
  let semiSeniorId: number | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-happy')
    businessUnit = await createTestBusinessUnit('happy')
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('CA-1: el catálogo arranca vacío, sin niveles precargados (regla 7)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    assert.isArray(response.body().data.positionLevels)
    assert.lengthOf(response.body().data.positionLevels, 0)
  })

  test('CA-1: POST crea "Junior" con rango 1, activo y ligado a la empresa', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: 'Junior', positionLevelRank: 1 })

    response.assertStatus(201)
    const level = response.body().data.positionLevel
    assert.isNumber(level.positionLevelId)
    assert.equal(level.positionLevelName, 'Junior')
    assert.equal(level.positionLevelRank, 1)
    assert.isTrue(level.positionLevelActive)
    assert.equal(level.businessUnitId, businessUnit!.businessUnitId)
    juniorId = level.positionLevelId
  })

  test('POST sin rango asigna max(rank)+1 (spec §10)', async ({ client, assert }) => {
    const response = await client
      .post('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: 'Senior' })

    response.assertStatus(201)
    const level = response.body().data.positionLevel
    assert.equal(level.positionLevelRank, 2)
    seniorId = level.positionLevelId
  })

  test('CA-2: nombre duplicado responde 409 con el body exacto y no crea el registro', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: 'Senior' })

    response.assertStatus(409)
    const body = response.body()
    assert.equal(body.title, 'Nombre de nivel duplicado')
    assert.equal(body.detail, 'Ya existe un nivel con ese nombre en esta empresa')
    assert.equal(body.key, 'nivel-nombre-duplicado')
    assert.equal(body.code, 'ORG.POSLEVEL.NAME_TAKEN')

    const listResponse = await client
      .get('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    assert.lengthOf(listResponse.body().data.positionLevels, 2)
  })

  test('CA-2: la unicidad normaliza acentos y mayúsculas ("  sénior " duplica "Senior")', async ({
    client,
    assert,
  }) => {
    const response = await client
      .post('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: '  sénior ' })

    response.assertStatus(409)
    assert.equal(response.body().key, 'nivel-nombre-duplicado')
  })

  test('regla 8: POST sin nombre responde 400 datos-invalidos', async ({ client, assert }) => {
    const response = await client
      .post('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelRank: 5 })

    response.assertStatus(400)
    assert.equal(response.body().key, 'datos-invalidos')
    assert.equal(response.body().code, 'ORG.POSLEVEL.VAL_INPUT')
  })

  test('regla 8: PUT sin rango responde 400 datos-invalidos', async ({ client, assert }) => {
    const response = await client
      .put(`/api/position-levels/${juniorId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: 'Junior' })

    response.assertStatus(400)
    assert.equal(response.body().key, 'datos-invalidos')
  })

  test('GET /:id devuelve el nivel; inexistente responde 404 nivel-no-encontrado', async ({
    client,
    assert,
  }) => {
    const showResponse = await client
      .get(`/api/position-levels/${juniorId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    showResponse.assertStatus(200)
    assert.equal(showResponse.body().data.positionLevel.positionLevelId, juniorId)

    const notFoundResponse = await client
      .get('/api/position-levels/999999999')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    notFoundResponse.assertStatus(404)
    assert.equal(notFoundResponse.body().key, 'nivel-no-encontrado')
    assert.equal(notFoundResponse.body().code, 'ORG.POSLEVEL.NOT_FOUND')
  })

  test('PUT edita nombre y rango; con nombre de otro nivel responde 409', async ({
    client,
    assert,
  }) => {
    const okResponse = await client
      .put(`/api/position-levels/${seniorId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: 'Senior II', positionLevelRank: 2 })
    okResponse.assertStatus(200)
    assert.equal(okResponse.body().data.positionLevel.positionLevelName, 'Senior II')

    const dupResponse = await client
      .put(`/api/position-levels/${seniorId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: 'Junior', positionLevelRank: 2 })
    dupResponse.assertStatus(409)
    assert.equal(dupResponse.body().key, 'nivel-nombre-duplicado')
  })

  test('CA-4: desactivar conserva el nivel en el catálogo y lo excluye de ?active=true', async ({
    client,
    assert,
  }) => {
    const createResponse = await client
      .post('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: 'Semi Senior', positionLevelRank: 3 })
    createResponse.assertStatus(201)
    semiSeniorId = createResponse.body().data.positionLevel.positionLevelId

    const deactivateResponse = await client
      .patch(`/api/position-levels/${semiSeniorId}/active`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelActive: false })
    deactivateResponse.assertStatus(200)
    assert.isFalse(deactivateResponse.body().data.positionLevel.positionLevelActive)

    const fullList = await client
      .get('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const fullRows = fullList.body().data.positionLevels as Array<{ positionLevelId: number }>
    assert.isTrue(fullRows.some((row) => row.positionLevelId === semiSeniorId))

    const activeList = await client
      .get('/api/position-levels')
      .qs({ active: true })
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const activeRows = activeList.body().data.positionLevels as Array<{ positionLevelId: number }>
    assert.isFalse(activeRows.some((row) => row.positionLevelId === semiSeniorId))

    const reactivateResponse = await client
      .patch(`/api/position-levels/${semiSeniorId}/active`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelActive: true })
    reactivateResponse.assertStatus(200)
    assert.isTrue(reactivateResponse.body().data.positionLevel.positionLevelActive)
  })

  test('CA-5: reorder renumera la secuencia completa 1..n en el orden recibido', async ({
    client,
    assert,
  }) => {
    const response = await client
      .patch('/api/position-levels/reorder')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ orderedPositionLevelIds: [seniorId, juniorId, semiSeniorId] })

    response.assertStatus(200)
    const reordered = response.body().data.positionLevels as Array<{
      positionLevelId: number
      positionLevelRank: number
    }>
    assert.deepEqual(
      reordered.map((row) => [row.positionLevelId, row.positionLevelRank]),
      [
        [seniorId, 1],
        [juniorId, 2],
        [semiSeniorId, 3],
      ]
    )

    const listResponse = await client
      .get('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    const listed = listResponse.body().data.positionLevels as Array<{ positionLevelId: number }>
    assert.deepEqual(
      listed.map((row) => row.positionLevelId),
      [seniorId, juniorId, semiSeniorId]
    )
  })

  test('reorder con lista incompleta responde 422 orden-invalido', async ({ client, assert }) => {
    const response = await client
      .patch('/api/position-levels/reorder')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ orderedPositionLevelIds: [juniorId, seniorId] })

    response.assertStatus(422)
    assert.equal(response.body().key, 'orden-invalido')
    assert.equal(response.body().code, 'ORG.POSLEVEL.REORDER_INVALID')
  })

  test('reorder con un id desconocido responde 422 orden-invalido', async ({ client, assert }) => {
    const response = await client
      .patch('/api/position-levels/reorder')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ orderedPositionLevelIds: [juniorId, seniorId, 999999999] })

    response.assertStatus(422)
    assert.equal(response.body().key, 'orden-invalido')
  })

  test('reorder con ids duplicados responde 422 orden-invalido', async ({ client, assert }) => {
    const response = await client
      .patch('/api/position-levels/reorder')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ orderedPositionLevelIds: [juniorId, juniorId, semiSeniorId] })

    response.assertStatus(422)
    assert.equal(response.body().key, 'orden-invalido')
  })

  test('el filtro search ignora acentos y mayúsculas', async ({ client, assert }) => {
    const response = await client
      .get('/api/position-levels')
      .qs({ search: 'JÚN' })
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)

    response.assertStatus(200)
    const rows = response.body().data.positionLevels as Array<{ positionLevelId: number }>
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].positionLevelId, juniorId)
  })
})

test.group('PositionLevels - eliminar (CA-6, reglas 5 y 6)', (group) => {
  let root: TestActor | null = null
  let businessUnit: BusinessUnit | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-delete')
    businessUnit = await createTestBusinessUnit('delete')
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnit)
  })

  test('DELETE de un nivel sin uso es baja lógica y libera el nombre (regla 2)', async ({
    client,
    assert,
  }) => {
    const createResponse = await client
      .post('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: 'Aprendiz' })
    createResponse.assertStatus(201)
    const levelId = createResponse.body().data.positionLevel.positionLevelId

    const deleteResponse = await client
      .delete(`/api/position-levels/${levelId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    deleteResponse.assertStatus(200)

    const row = await db
      .from('position_levels')
      .where('position_level_id', levelId)
      .first()
    assert.isNotNull(row.position_level_deleted_at)

    const showResponse = await client
      .get(`/api/position-levels/${levelId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
    showResponse.assertStatus(404)

    const recreateResponse = await client
      .post('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnit!.businessUnitPublicId)
      .json({ positionLevelName: 'Aprendiz' })
    recreateResponse.assertStatus(201)
  })

  test('con isInUse=true el servicio rechaza el borrado con 409 nivel-en-uso (stub R-1)', async ({
    assert,
  }) => {
    const level = new PositionLevel()
    level.businessUnitId = businessUnit!.businessUnitId
    level.positionLevelName = `EnUso-${uniqueStamp()}`
    level.positionLevelRank = 99
    level.positionLevelActive = true
    await level.save()

    class InUsePositionLevelService extends PositionLevelService {
      async isInUse(_positionLevelId: number): Promise<boolean> {
        return true
      }
    }

    const service = new InUsePositionLevelService(
      i18nManager.locale(i18nManager.defaultLocale)
    )

    try {
      await service.delete(level.positionLevelId, [businessUnit!.businessUnitId])
      assert.fail('delete() debió rechazar el nivel en uso')
    } catch (error) {
      assert.instanceOf(error, PositionLevelServiceError)
      const serviceError = error as PositionLevelServiceError
      assert.equal(serviceError.key, 'nivel-en-uso')
      assert.equal(serviceError.errorCode, 'ORG.POSLEVEL.IN_USE')
      assert.equal(serviceError.httpStatus, 409)
    }

    const row = await db
      .from('position_levels')
      .where('position_level_id', level.positionLevelId)
      .first()
    assert.isNull(row.position_level_deleted_at)
  })
})

test.group('PositionLevels - aislamiento multi-tenant (CA-3, regla 1)', (group) => {
  let root: TestActor | null = null
  let businessUnitA: BusinessUnit | null = null
  let businessUnitB: BusinessUnit | null = null
  let levelIdB: number | null = null

  group.setup(async () => {
    root = await createTestActor(ROOT_ROLE_ID, 'root-tenant')
    businessUnitA = await createTestBusinessUnit('tenant-a')
    businessUnitB = await createTestBusinessUnit('tenant-b')

    const level = new PositionLevel()
    level.businessUnitId = businessUnitB.businessUnitId
    level.positionLevelName = 'Nivel BU-B'
    level.positionLevelRank = 1
    level.positionLevelActive = true
    await level.save()
    levelIdB = level.positionLevelId
  })

  group.teardown(async () => {
    await cleanupTestActor(root)
    await deleteBusinessUnit(businessUnitA)
    await deleteBusinessUnit(businessUnitB)
  })

  test('con BU-A seleccionada el listado no incluye niveles de BU-B', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get('/api/position-levels')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)

    response.assertStatus(200)
    const rows = response.body().data.positionLevels as Array<{ positionLevelId: number }>
    assert.isFalse(rows.some((row) => row.positionLevelId === levelIdB))
  })

  test('GET/PUT/PATCH/DELETE de un nivel de BU-B con BU-A seleccionada responden 404, nunca 403', async ({
    client,
    assert,
  }) => {
    const showResponse = await client
      .get(`/api/position-levels/${levelIdB}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)
    showResponse.assertStatus(404)
    assert.equal(showResponse.body().key, 'nivel-no-encontrado')

    const updateResponse = await client
      .put(`/api/position-levels/${levelIdB}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)
      .json({ positionLevelName: 'Intruso', positionLevelRank: 1 })
    updateResponse.assertStatus(404)
    assert.equal(updateResponse.body().key, 'nivel-no-encontrado')

    const activeResponse = await client
      .patch(`/api/position-levels/${levelIdB}/active`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)
      .json({ positionLevelActive: false })
    activeResponse.assertStatus(404)
    assert.equal(activeResponse.body().key, 'nivel-no-encontrado')

    const deleteResponse = await client
      .delete(`/api/position-levels/${levelIdB}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)
    deleteResponse.assertStatus(404)
    assert.equal(deleteResponse.body().key, 'nivel-no-encontrado')
  })

  test('reorder con header BU-A y businessUnitId de BU-B responde 422 referencia-invalida', async ({
    client,
    assert,
  }) => {
    const response = await client
      .patch('/api/position-levels/reorder')
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', businessUnitA!.businessUnitPublicId)
      .json({
        businessUnitId: businessUnitB!.businessUnitId,
        orderedPositionLevelIds: [levelIdB],
      })

    response.assertStatus(422)
    assert.equal(response.body().key, 'referencia-invalida')
    assert.equal(response.body().code, 'ORG.POSLEVEL.REF_INVALID')
  })
})
