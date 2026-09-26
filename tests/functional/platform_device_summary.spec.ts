import { test } from '@japa/runner'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceModel from '#models/platform_device_model'

const TEST_PASSWORD = 'DeviceSummaryTest123!'
const BASE_URL = '/api/platform/devices/units/summary'

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

/** Fila del desglose por modelo tal como la publica el endpoint. */
interface ModelSummaryBody {
  modelId: number
  modelName: string
  modelSlug: string
  total: number
  disponibles: number
  asignadas: number
  retiradas: number
  delCliente: number
  costoAdquisicionCents: number
  unidadesPropiasSinCosto: number
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'DeviceSummary',
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
    businessUnitName: `Device Summary BU ${stamp}`,
    businessUnitSlug: `device-summary-bu-${stamp}`,
    businessUnitLegalName: `Device Summary Legal ${stamp}`,
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
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

/** Modelo de catálogo exclusivo del grupo de tests, para aislar sus conteos. */
async function createTestModel(tag: string): Promise<PlatformDeviceModel> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  return PlatformDeviceModel.create({
    platformDeviceModelBrand: `SummaryBrand ${tag}`,
    platformDeviceModelName: `SummaryModel ${tag} ${stamp}`,
    platformDeviceModelSlug: `summary-${tag}-${stamp}`,
    platformDeviceModelStatus: 'vigente',
    platformDeviceModelActive: 1,
  })
}

/** Registra una unidad directamente, sin pasar por las validaciones del servicio. */
async function createUnit(
  modelId: number,
  origin: 'propia' | 'del_cliente',
  costCents: number | null,
  status: 'disponible' | 'asignada' | 'retirada' = 'disponible'
): Promise<PlatformDevice> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return PlatformDevice.create({
    platformDeviceModelId: modelId,
    platformDeviceSerialNumber: `SUM-${stamp}`,
    platformDeviceOrigin: origin,
    platformDeviceStockStatus: status,
    platformDeviceAcquisitionCostCents: costCents,
    platformDeviceAcquisitionDate: null,
    platformDeviceActive: 1,
  })
}

/** Borra en duro las unidades del modelo y el modelo mismo. */
async function cleanupModel(model: PlatformDeviceModel | null) {
  if (!model) return
  await PlatformDevice.query().where('platform_device_model_id', model.platformDeviceModelId).delete()
  await PlatformDeviceModel.query()
    .where('platform_device_model_id', model.platformDeviceModelId)
    .delete()
}

/** Ubica la fila del modelo dado dentro del desglose de la respuesta. */
function findModelRow(body: { data: { porModelo: ModelSummaryBody[] } }, modelId: number) {
  return body.data.porModelo.find((row) => row.modelId === modelId)
}

test.group('GET /api/platform/devices/units/summary — costo de adquisición', (group) => {
  let admin: TestActor | null = null
  let tenant: TestActor | null = null
  let model: PlatformDeviceModel | null = null

  group.setup(async () => {
    admin = await createActor('dev-summary-admin', true)
    tenant = await createActor('dev-summary-tenant', false)
    model = await createTestModel('cost')

    // Cuatro propias con costo (120000 + 120000 + 95000 + 80000 = 415000) …
    await createUnit(model.platformDeviceModelId, 'propia', 120000)
    await createUnit(model.platformDeviceModelId, 'propia', 120000)
    await createUnit(model.platformDeviceModelId, 'propia', 95000)
    await createUnit(model.platformDeviceModelId, 'propia', 80000)
    // … y dos del cliente, que por regla del inventario no llevan costo.
    await createUnit(model.platformDeviceModelId, 'del_cliente', null)
    await createUnit(model.platformDeviceModelId, 'del_cliente', null)
  })

  group.teardown(async () => {
    await cleanupModel(model)
    await cleanupActor(admin)
    await cleanupActor(tenant)
  })

  test('IS-1: suma solo las unidades propias; las del cliente no aportan al costo', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    response.assertStatus(200)

    const row = findModelRow(response.body(), model!.platformDeviceModelId)
    assert.exists(row, 'el modelo de prueba debe aparecer en porModelo')
    assert.equal(row!.costoAdquisicionCents, 415000)
    assert.equal(row!.delCliente, 2)
    assert.equal(row!.total, 6)
  })

  test('IS-2: unidadesPropiasSinCosto es 0 cuando todas las propias tienen costo', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    response.assertStatus(200)

    const row = findModelRow(response.body(), model!.platformDeviceModelId)
    assert.equal(row!.unidadesPropiasSinCosto, 0)
  })

  test('IS-3: el costo de la raíz cuadra con la suma de los costos por modelo', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    response.assertStatus(200)

    const { data } = response.body()
    const sumaCosto = data.porModelo.reduce(
      (acc: number, row: ModelSummaryBody) => acc + row.costoAdquisicionCents,
      0
    )
    const sumaSinCosto = data.porModelo.reduce(
      (acc: number, row: ModelSummaryBody) => acc + row.unidadesPropiasSinCosto,
      0
    )

    assert.equal(data.costoAdquisicionCents, sumaCosto)
    assert.equal(data.unidadesPropiasSinCosto, sumaSinCosto)
  })

  test('IS-4: usuario sin is_platform_admin recibe 403', async ({ client }) => {
    const response = await client.get(BASE_URL).loginAs(tenant!.user)
    response.assertStatus(403)
  })
})

test.group('GET /api/platform/devices/units/summary — honestidad y exclusiones', (group) => {
  let admin: TestActor | null = null
  let model: PlatformDeviceModel | null = null
  let emptyModel: PlatformDeviceModel | null = null

  group.setup(async () => {
    admin = await createActor('dev-summary-gaps', true)
    model = await createTestModel('gaps')
    emptyModel = await createTestModel('empty')

    // Dos propias con costo (120000 + 95000 = 215000) y dos propias sin costo.
    await createUnit(model.platformDeviceModelId, 'propia', 120000)
    await createUnit(model.platformDeviceModelId, 'propia', 95000)
    await createUnit(model.platformDeviceModelId, 'propia', null)
    await createUnit(model.platformDeviceModelId, 'propia', null)

    // Una propia con costo alto, dada de baja lógica: fuera de todo.
    const deleted = await createUnit(model.platformDeviceModelId, 'propia', 999999)
    await deleted.delete()
  })

  group.teardown(async () => {
    await cleanupModel(model)
    await cleanupModel(emptyModel)
    await cleanupActor(admin)
  })

  test('IS-5: cuenta las propias sin costo y no las trata como cero silencioso', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    response.assertStatus(200)

    const row = findModelRow(response.body(), model!.platformDeviceModelId)
    assert.equal(row!.unidadesPropiasSinCosto, 2)
    assert.equal(row!.costoAdquisicionCents, 215000)
  })

  test('IS-6: la unidad con baja lógica queda fuera de los conteos y de las sumas', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    response.assertStatus(200)

    const row = findModelRow(response.body(), model!.platformDeviceModelId)
    // Cuatro vivas, no cinco; y su costo de 999999 no entró en la suma.
    assert.equal(row!.total, 4)
    assert.equal(row!.costoAdquisicionCents, 215000)
  })

  test('IS-7: el modelo sin unidades reporta 0 en ambos campos, nunca null ni ausente', async ({
    client,
    assert,
  }) => {
    const response = await client.get(BASE_URL).loginAs(admin!.user)
    response.assertStatus(200)

    const row = findModelRow(response.body(), emptyModel!.platformDeviceModelId)
    assert.exists(row, 'el modelo sin unidades debe seguir apareciendo en porModelo')
    assert.strictEqual(row!.costoAdquisicionCents, 0)
    assert.strictEqual(row!.unidadesPropiasSinCosto, 0)
  })

  test('IS-8: las unidades retiradas sí suman al costo del parque', async ({ client, assert }) => {
    const retired = await createUnit(model!.platformDeviceModelId, 'propia', 50000, 'retirada')

    const response = await client.get(BASE_URL).loginAs(admin!.user)
    response.assertStatus(200)

    const row = findModelRow(response.body(), model!.platformDeviceModelId)
    // 215000 + 50000: la unidad salió de operación pero se compró igual.
    assert.equal(row!.costoAdquisicionCents, 265000)
    assert.equal(row!.retiradas, 1)

    await PlatformDevice.query().where('platform_device_id', retired.platformDeviceId).delete()
  })
})
