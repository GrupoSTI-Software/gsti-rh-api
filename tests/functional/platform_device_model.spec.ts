import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import PlatformDeviceModel from '#models/platform_device_model'

const TEST_PASSWORD = 'DeviceModelTest123!'
const BASE_URL = '/api/platform/device-models'

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'DeviceModel',
    personLastname: 'Test',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Device Model BU ${stamp}`,
    businessUnitSlug: `device-model-bu-${stamp}`,
    businessUnitLegalName: `Device Model Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })

  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

async function cleanupActor(actor: TestActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query()
    .where('business_unit_id', actor.businessUnit.businessUnitId)
    .delete()
}

/** Crea un modelo de prueba único para evitar colisiones de slug entre corridas. */
async function createTestModel(stamp: number): Promise<PlatformDeviceModel> {
  return PlatformDeviceModel.create({
    platformDeviceModelBrand: `TestBrand ${stamp}`,
    platformDeviceModelName: `TestModel ${stamp}`,
    platformDeviceModelSlug: `testbrand-testmodel-${stamp}`,
    platformDeviceModelStatus: 'en_validacion',
    platformDeviceModelActive: 1,
  })
}

test.group('GET /api/platform/device-models — listar modelos', (group) => {
  let admin: TestActor | null = null
  let tenant: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('dev-list-admin', true)
    tenant = await createActor('dev-list-tenant', false)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
    await cleanupActor(tenant)
  })

  test('DM-1: platformAdmin recibe la lista con los modelos sembrados', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    response.assertStatus(200)

    const { deviceModels } = response.body().data
    assert.isArray(deviceModels)
    assert.isTrue(deviceModels.length >= 2, 'Deben existir al menos los 2 modelos sembrados')

    const slugs = deviceModels.map((m: { slug: string }) => m.slug)
    assert.include(slugs, 'zkteco-speedface-v5l')
    assert.include(slugs, 'zkteco-senseface-2a')
  })

  test('DM-2: cada modelo incluye photoUrl resuelta', async ({ client, assert }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    response.assertStatus(200)

    const first = response.body().data.deviceModels[0]
    assert.exists(first.photoUrl, 'photoUrl debe existir')
    assert.match(first.photoUrl, /^\/devices\/.+\.svg$/)
  })

  test('DM-3: usuario tenant (no platformAdmin) recibe 403', async ({ client }) => {
    const response = await client.get(BASE_URL).loginAs(tenant!.user)
    response.assertStatus(403)
  })

  test('DM-4: sin token recibe 401', async ({ client }) => {
    const response = await client.get(BASE_URL)
    response.assertStatus(401)
  })
})

test.group('POST /api/platform/device-models — crear modelo', (group) => {
  let admin: TestActor | null = null
  const slugsCreados: string[] = []

  group.setup(async () => {
    admin = await createActor('dev-create-admin', true)
  })

  group.teardown(async () => {
    for (const slug of slugsCreados) {
      await PlatformDeviceModel.query()
        .where('platform_device_model_slug', slug)
        .delete()
    }
    await cleanupActor(admin)
  })

  test('DM-5: crea un modelo y devuelve 201 con slug auto-generado', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const response = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({ brand: `Suprema ${stamp}`, name: 'BioStation 3' })

    response.assertStatus(201)
    const { deviceModel } = response.body().data
    assert.equal(deviceModel.brand, `Suprema ${stamp}`)
    assert.equal(deviceModel.name, 'BioStation 3')
    assert.equal(deviceModel.status, 'en_validacion')
    assert.match(deviceModel.slug, /^suprema-\d+-biostation-3$/)
    assert.match(deviceModel.photoUrl, /^\/devices\/.+\.svg$/)

    slugsCreados.push(deviceModel.slug)
  })

  test('DM-6: crea un modelo con slug manual y estado inicial vigente', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const slug = `custom-slug-${stamp}`
    const response = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({ brand: 'Hanvon', name: 'FaceID X710', slug, status: 'vigente' })

    response.assertStatus(201)
    const { deviceModel } = response.body().data
    assert.equal(deviceModel.slug, slug)
    assert.equal(deviceModel.status, 'vigente')

    slugsCreados.push(slug)
  })

  test('DM-7: rechaza slug duplicado con PLT.DEV.MODEL_SLUG_TAKEN', async ({
    client,
    assert,
  }) => {
    const stamp = Date.now()
    const slug = `dup-slug-${stamp}`

    const first = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({ brand: 'Hikvision', name: 'DS-K1T671MF', slug })
    first.assertStatus(201)
    slugsCreados.push(slug)

    const second = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({ brand: 'Hikvision', name: 'DS-K1T671MF Copy', slug })
    second.assertStatus(422)
    assert.equal(second.body().code, 'PLT.DEV.MODEL_SLUG_TAKEN')
  })

  test('DM-8: body sin brand devuelve PLT.DEV.VAL_INPUT', async ({ client, assert }) => {
    const response = await client
      .post(BASE_URL)
      .loginAs(admin!.user)
      .json({ name: 'Sin marca' })

    response.assertStatus(422)
    assert.equal(response.body().code, 'PLT.DEV.VAL_INPUT')
  })
})

test.group('PATCH /api/platform/device-models/:id — editar modelo', (group) => {
  let admin: TestActor | null = null
  let model: PlatformDeviceModel | null = null

  group.setup(async () => {
    admin = await createActor('dev-update-admin', true)
    model = await createTestModel(Date.now())
  })

  group.teardown(async () => {
    if (model) {
      await PlatformDeviceModel.query()
        .where('platform_device_model_id', model.platformDeviceModelId)
        .delete()
    }
    await cleanupActor(admin)
  })

  test('DM-9: actualiza brand y name; el slug permanece inmutable', async ({
    client,
    assert,
  }) => {
    const slugOriginal = model!.platformDeviceModelSlug

    const response = await client
      .patch(`${BASE_URL}/${model!.platformDeviceModelId}`)
      .loginAs(admin!.user)
      .json({ brand: 'ZKTeco Updated', name: 'SpeedFace X' })

    response.assertStatus(200)
    const { deviceModel } = response.body().data
    assert.equal(deviceModel.brand, 'ZKTeco Updated')
    assert.equal(deviceModel.name, 'SpeedFace X')
    assert.equal(deviceModel.slug, slugOriginal, 'El slug no debe cambiar')
  })

  test('DM-10: modelo inexistente devuelve 404 PLT.DEV.MODEL_NOT_FOUND', async ({
    client,
    assert,
  }) => {
    const response = await client
      .patch(`${BASE_URL}/999999999`)
      .loginAs(admin!.user)
      .json({ brand: 'No existe' })

    response.assertStatus(404)
    assert.equal(response.body().code, 'PLT.DEV.MODEL_NOT_FOUND')
  })
})

test.group('PUT /api/platform/device-models/:id/status — cambiar estado', (group) => {
  let admin: TestActor | null = null
  let model: PlatformDeviceModel | null = null

  group.setup(async () => {
    admin = await createActor('dev-status-admin', true)
    model = await createTestModel(Date.now())
  })

  group.teardown(async () => {
    if (model) {
      await PlatformDeviceModel.query()
        .where('platform_device_model_id', model.platformDeviceModelId)
        .delete()
    }
    await cleanupActor(admin)
  })

  test('DM-11: cambia estado de en_validacion a vigente', async ({ client, assert }) => {
    const response = await client
      .put(`${BASE_URL}/${model!.platformDeviceModelId}/status`)
      .loginAs(admin!.user)
      .json({ status: 'vigente' })

    response.assertStatus(200)
    assert.equal(response.body().data.deviceModel.status, 'vigente')
  })

  test('DM-12: cambia estado a descontinuado', async ({ client, assert }) => {
    const response = await client
      .put(`${BASE_URL}/${model!.platformDeviceModelId}/status`)
      .loginAs(admin!.user)
      .json({ status: 'descontinuado' })

    response.assertStatus(200)
    assert.equal(response.body().data.deviceModel.status, 'descontinuado')
  })

  test('DM-13: valor de status inválido devuelve PLT.DEV.VAL_INPUT', async ({
    client,
    assert,
  }) => {
    const response = await client
      .put(`${BASE_URL}/${model!.platformDeviceModelId}/status`)
      .loginAs(admin!.user)
      .json({ status: 'invalido' })

    response.assertStatus(422)
    assert.equal(response.body().code, 'PLT.DEV.VAL_INPUT')
  })
})

test.group(
  'DELETE /api/platform/device-models/:id — baja lógica',
  (group) => {
    let admin: TestActor | null = null
    let model: PlatformDeviceModel | null = null

    group.setup(async () => {
      admin = await createActor('dev-delete-admin', true)
      model = await createTestModel(Date.now())
    })

    group.teardown(async () => {
      if (model) {
        await PlatformDeviceModel.query()
          .withTrashed()
          .where('platform_device_model_id', model.platformDeviceModelId)
          .delete()
      }
      await cleanupActor(admin)
    })

    test('DM-14: baja lógica devuelve 204 y el modelo desaparece del listado', async ({
      client,
      assert,
    }) => {
      const deleteRes = await client
        .delete(`${BASE_URL}/${model!.platformDeviceModelId}`)
        .loginAs(admin!.user)

      deleteRes.assertStatus(204)

      const listRes = await client.get(BASE_URL).loginAs(admin!.user)
      listRes.assertStatus(200)
      const ids = listRes
        .body()
        .data.deviceModels.map((m: { id: number }) => m.id)
      assert.notInclude(ids, model!.platformDeviceModelId, 'El modelo dado de baja no debe aparecer')
    })

    test('DM-15: dar de baja un modelo ya eliminado devuelve 404', async ({
      client,
      assert,
    }) => {
      const response = await client
        .delete(`${BASE_URL}/${model!.platformDeviceModelId}`)
        .loginAs(admin!.user)

      response.assertStatus(404)
      assert.equal(response.body().code, 'PLT.DEV.MODEL_NOT_FOUND')
    })
  }
)
