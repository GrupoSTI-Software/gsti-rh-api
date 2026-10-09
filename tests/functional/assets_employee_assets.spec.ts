import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { ASSET_ERROR_KEYS } from '#modules/assets/assets.constants'
import type { EmployeeAssetsDto } from '#modules/assets/dto/assets.dto'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  assertModuleEnforced,
  businessUnitHeaders,
  cleanupTenantActor,
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
  type UnitUser,
} from '#tests/helpers/tenant_actor'

/**
 * Lectura de los activos asignados a un colaborador
 * (`GET /api/employees/:employeeId/assets`): gate de `supplies:read`, perfil del
 * colaborador y las respuestas de error y de éxito-vacío. El contenido de las
 * listas (asignaciones vivas y devueltas) lo completa la tarea siguiente sobre
 * este mismo spec.
 *
 * El actor de la empresa A es un rol sin salvoconducto al que se le concede
 * `supplies:read`; el de la empresa B solo existe para tener un colaborador de
 * otra empresa. Todo lo que la corrida crea se limpia en el teardown del grupo.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

function get(client: ApiClient, actor: TenantActor, url: string) {
  return client.get(url).loginAs(actor.user).headers(businessUnitHeaders(actor))
}

test.group('Activos por colaborador — lectura', (group) => {
  let actorA: TenantActor | null = null
  let actorB: TenantActor | null = null
  let employeeA: EmployeeFixture | null = null
  let employeeB: EmployeeFixture | null = null

  group.setup(async () => {
    await assertModuleEnforced('supplies')
    actorA = await createTenantActor('activos-empleado-a')
    actorB = await createTenantActor('activos-empleado-b')
    // El actor de la empresa A pasa el gate en todos los casos de respuesta 200.
    await grantModulePermissions(actorA, 'supplies', ['read'])
    employeeA = await createEmployeeFixture(actorA.businessUnit.businessUnitId, `empA-${RUN.slice(-6)}`)
    employeeB = await createEmployeeFixture(actorB.businessUnit.businessUnitId, `empB-${RUN.slice(-6)}`)
  })

  group.teardown(async () => {
    await cleanupEmployeeFixture(employeeA)
    await cleanupEmployeeFixture(employeeB)
    await cleanupTenantActor(actorA)
    await cleanupTenantActor(actorB)
  })

  test('CA-10: id de ruta no numérico o no positivo responde 422 entrada-invalida', async ({
    client,
    assert,
  }) => {
    const actor = required(actorA, 'el actor de A')

    for (const id of ['abc', '0', '-1']) {
      const response = await get(client, actor, `/api/employees/${id}/assets`)
      response.assertStatus(422)
      assert.equal(response.body().key, ASSET_ERROR_KEYS.INVALID_INPUT, id)
    }
  })

  test('CA-7: colaborador de otra empresa e inexistente responden el mismo 404', async ({
    client,
    assert,
  }) => {
    const actor = required(actorA, 'el actor de A')
    const foreignEmployeeId = required(employeeB, 'el colaborador de B').employee.employeeId
    const expected = {
      type: 'error',
      title: 'Colaborador no encontrado',
      message: 'El colaborador no existe o no pertenece a la empresa.',
      detail: 'El colaborador no existe o no pertenece a la empresa.',
      key: 'colaborador-no-encontrado',
      data: null,
    }

    for (const id of [foreignEmployeeId, 999999999]) {
      const response = await get(client, actor, `/api/employees/${id}/assets`)
      response.assertStatus(404)
      assert.deepEqual(response.body(), expected)
    }
  })

  test('CA-6: colaborador sin asignaciones responde 200 con listas vacías', async ({
    client,
    assert,
  }) => {
    const actor = required(actorA, 'el actor de A')
    const employee = required(employeeA, 'el colaborador de A').employee

    const response = await get(client, actor, `/api/employees/${employee.employeeId}/assets`)
    response.assertStatus(200)

    const body = response.body()
    assert.equal(body.type, 'success')
    assert.equal(body.data.employeeId, employee.employeeId)
    assert.equal(body.data.employeeSlug, employee.employeeSlug)
    assert.deepEqual(body.data.current, [])
    assert.deepEqual(body.data.history, [])
  })

  test('CA-12: la respuesta no expone archivos ni titulares ajenos', async ({ client, assert }) => {
    const actor = required(actorA, 'el actor de A')
    const employee = required(employeeA, 'el colaborador de A').employee

    const response = await get(client, actor, `/api/employees/${employee.employeeId}/assets`)
    response.assertStatus(200)

    const serialized = JSON.stringify(response.body())
    for (const forbidden of ['contracts', 'photos', 'fileName', 'storedPath', 'businessUnitId']) {
      assert.notInclude(serialized, forbidden, forbidden)
    }
  })
})

type HttpMethod = 'get' | 'post' | 'put' | 'delete'

/** Activo creado por la API para el fixture de contenido, con su asignación. */
interface ContentAsset {
  supplyId: number
  assignmentId: number
  name: string
  fileNumber: string
  serial: string | null
}

/**
 * Contenido de las listas: vigentes y devueltos con su resguardo, sus
 * características capturadas, el orden por fecha de devolución y las reglas de
 * borrado lógico del activo, del tipo y del colaborador.
 *
 * El catálogo (tipos, características, activos y asignaciones) lo arma por la
 * API un actor `owner` de la MISMA empresa del lector; los estados que solo la
 * API de servidor no expone (devolución, borrados lógicos, resguardo borrado)
 * los fija el spec por `db.table`, nunca con modelos Lucid fuera de request.
 * Un caso edita el fixture común y los siguientes lo ven, así que el orden de
 * declaración es parte del contrato (patrón de `assets_module.spec.ts`).
 */
test.group('Activos por colaborador — contenido de las listas', (group) => {
  let actorA: TenantActor | null = null
  let catalogOwner: UnitUser | null = null
  let employee: EmployeeFixture | null = null
  let counter = 0
  const unique = (label: string) => `${label}-${RUN}-c${++counter}`

  let laptopTypeId = 0
  let modeloCharacteristicId = 0

  let laptop: ContentAsset = { supplyId: 0, assignmentId: 0, name: '', fileNumber: '', serial: null }
  let monitor: ContentAsset = { supplyId: 0, assignmentId: 0, name: '', fileNumber: '', serial: null }
  let phone: ContentAsset = { supplyId: 0, assignmentId: 0, name: '', fileNumber: '', serial: null }
  let tablet: ContentAsset = { supplyId: 0, assignmentId: 0, name: '', fileNumber: '', serial: null }

  let catalogReady = false

  const employeeId = () => required(employee, 'el colaborador E1').employee.employeeId
  const buId = () => required(actorA, 'el actor A').businessUnit.businessUnitId

  function ownerCall(
    client: ApiClient,
    method: HttpMethod,
    url: string,
    body?: Record<string, unknown>
  ) {
    const owner = required(catalogOwner, 'el owner del catálogo')
    const actor = required(actorA, 'el actor A')
    const pending = client[method](url).loginAs(owner.user).headers({
      'X-Business-Unit-Id': actor.businessUnit.businessUnitPublicId,
    })
    return body ? pending.json(body) : pending
  }

  async function createType(client: ApiClient, name: string): Promise<number> {
    const response = await ownerCall(client, 'post', '/api/supply-types', { supplyTypeName: name })
    response.assertStatus(201)
    return response.body().data.supplyType.supplyTypeId
  }

  async function createCharacteristic(
    client: ApiClient,
    supplyTypeId: number,
    name: string,
    type: 'text' | 'number' | 'date' | 'boolean'
  ): Promise<number> {
    const response = await ownerCall(client, 'post', '/api/supplie-characteristics', {
      supplyTypeId,
      supplieCaracteristicName: name,
      supplieCaracteristicType: type,
    })
    response.assertStatus(201)
    return response.body().data.supplieCaracteristic.supplieCaracteristicId
  }

  async function createAsset(
    client: ApiClient,
    input: { typeId: number; name: string; serial: string | null }
  ): Promise<ContentAsset> {
    const fileNumber = unique('ACT')
    const body: Record<string, unknown> = {
      supplyFileNumber: fileNumber,
      supplyName: input.name,
      supplyTypeId: input.typeId,
    }
    if (input.serial !== null) body.supplySerialNumber = input.serial
    const response = await ownerCall(client, 'post', '/api/supplies', body)
    response.assertStatus(201)
    return {
      supplyId: response.body().data.supplie.supplyId,
      assignmentId: 0,
      name: input.name,
      fileNumber,
      serial: input.serial,
    }
  }

  async function assign(client: ApiClient, asset: ContentAsset, date: string): Promise<void> {
    const response = await ownerCall(client, 'post', '/api/employee-supplies', {
      employeeId: employeeId(),
      supplyId: asset.supplyId,
      employeeSupplyAssignamentDate: date,
    })
    response.assertStatus(201)
    asset.assignmentId = response.body().data.employeeSupply.employeeSupplyId
  }

  /** Cierra la asignación (devolución) por tabla; sin fecha la deja en `null`. */
  async function retire(
    assignmentId: number,
    options: { date?: string; reason?: string } = {}
  ): Promise<void> {
    await db
      .from('employee_supplies')
      .where('employee_supply_id', assignmentId)
      .update({
        employee_supply_status: 'retired',
        employee_supply_retirement_date: options.date ?? null,
        employee_supply_retirement_reason: options.reason ?? null,
        employee_supply_updated_at: new Date(),
      })
  }

  async function readAssets(client: ApiClient): Promise<EmployeeAssetsDto> {
    const response = await get(
      client,
      required(actorA, 'el actor A'),
      `/api/employees/${employeeId()}/assets`
    )
    response.assertStatus(200)
    return response.body().data
  }

  const currentOf = (data: EmployeeAssetsDto, supplyId: number) =>
    data.current.find((row) => row.asset.supplyId === supplyId)
  const historyOf = (data: EmployeeAssetsDto, supplyId: number) =>
    data.history.find((row) => row.asset.supplyId === supplyId)

  /** Arma el fixture común una sola vez, en la primera petición autenticada. */
  async function ensureCommonFixture(client: ApiClient): Promise<void> {
    if (catalogReady) return
    catalogReady = true

    laptopTypeId = await createType(client, 'Laptop')
    const monitorTypeId = await createType(client, 'Monitor')
    const phoneTypeId = await createType(client, 'Celular')
    const tabletTypeId = await createType(client, 'Tablet')
    modeloCharacteristicId = await createCharacteristic(client, laptopTypeId, 'Modelo', 'text')
    await createCharacteristic(client, laptopTypeId, 'RAM', 'number')

    laptop = await createAsset(client, { typeId: laptopTypeId, name: 'Laptop Dell', serial: unique('SN-L') })
    monitor = await createAsset(client, { typeId: monitorTypeId, name: 'Monitor LG', serial: null })
    phone = await createAsset(client, { typeId: phoneTypeId, name: 'Celular Samsung', serial: unique('SN-C') })
    tablet = await createAsset(client, { typeId: tabletTypeId, name: 'Tablet iPad', serial: unique('SN-T') })

    await assign(client, laptop, '2026-08-01')
    await assign(client, monitor, '2026-08-15')
    await assign(client, phone, '2026-01-10')
    await assign(client, tablet, '2026-05-01')

    // Resguardo vivo de L (patrón de assets_module.spec.ts:807-813).
    await db.table('employee_supplies_response_contracts').insert({
      employee_supply_id: laptop.assignmentId,
      business_unit_id: buId(),
      employee_supply_response_contract_uuid: unique('uuid'),
      employee_supply_response_contract_file: 'resguardo-l.pdf',
      employee_supply_response_contract_created_at: new Date(),
    })

    await retire(phone.assignmentId, { date: '2026-09-01', reason: 'Cambio de equipo' })
    await retire(tablet.assignmentId, { date: '2026-06-01' })
  }

  group.setup(async () => {
    await assertModuleEnforced('supplies')
    actorA = await createTenantActor('activos-contenido')
    await grantModulePermissions(actorA, 'supplies', ['read'])
    catalogOwner = await createBypassUserInBusinessUnit(
      'owner',
      `contenido-owner-${RUN.slice(-6)}`,
      actorA.businessUnit.businessUnitId
    )
    employee = await createEmployeeFixture(actorA.businessUnit.businessUnitId, `empE1-${RUN.slice(-6)}`)
  })

  group.teardown(async () => {
    const businessUnitId = actorA?.businessUnit.businessUnitId
    if (businessUnitId !== undefined) {
      const supplyIds: number[] = await db
        .from('supplies')
        .where('business_unit_id', businessUnitId)
        .select('supply_id')
        .then((rows: Array<{ supply_id: number }>) => rows.map((row) => row.supply_id))
      if (supplyIds.length > 0) {
        const assignmentIds: number[] = await db
          .from('employee_supplies')
          .whereIn('supply_id', supplyIds)
          .select('employee_supply_id')
          .then((rows: Array<{ employee_supply_id: number }>) => rows.map((row) => row.employee_supply_id))
        if (assignmentIds.length > 0) {
          await db
            .from('employee_supplie_assignation_photos')
            .whereIn('employee_supply_id', assignmentIds)
            .delete()
          await db
            .from('employee_supplies_response_contracts')
            .whereIn('employee_supply_id', assignmentIds)
            .delete()
        }
        await db.from('employee_supplies').whereIn('supply_id', supplyIds).delete()
        await db.from('supplie_caracteristic_values').whereIn('supplie_id', supplyIds).delete()
        await db.from('supply_value_histories').whereIn('supply_id', supplyIds).delete()
        await db.from('supplies').whereIn('supply_id', supplyIds).delete()
      }
      const typeIds: number[] = await db
        .from('supply_types')
        .where('business_unit_id', businessUnitId)
        .select('supply_type_id')
        .then((rows: Array<{ supply_type_id: number }>) => rows.map((row) => row.supply_type_id))
      if (typeIds.length > 0) {
        await db.from('supplie_caracteristics').whereIn('supply_type_id', typeIds).delete()
        await db.from('supply_types').whereIn('supply_type_id', typeIds).delete()
      }
    }
    await cleanupEmployeeFixture(employee)
    await cleanupUnitUser(catalogOwner)
    await cleanupTenantActor(actorA)
  })

  test('CA-1: vigentes y devueltos con resguardo firmado o sin firmar', async ({
    client,
    assert,
  }) => {
    await ensureCommonFixture(client)
    const data = await readAssets(client)

    // Vigentes por asignación desc.: M (08-15) antes que L (08-01).
    assert.deepEqual(
      data.current.map((row) => row.asset.supplyId),
      [monitor.supplyId, laptop.supplyId]
    )
    const mLaptop = currentOf(data, laptop.supplyId)
    const mMonitor = currentOf(data, monitor.supplyId)
    assert.equal(mMonitor?.status, 'active')
    assert.equal(mMonitor?.custodyStatus, 'unsigned')
    assert.isNull(mMonitor?.retirementDate)
    assert.equal(mLaptop?.status, 'active')
    assert.equal(mLaptop?.custodyStatus, 'signed')
    assert.isNull(mLaptop?.retirementDate)

    // Campos del renglón: nombre, folio, tipo y serie (null si no hay).
    assert.equal(mLaptop?.asset.name, laptop.name)
    assert.equal(mLaptop?.asset.fileNumber, laptop.fileNumber)
    assert.equal(mLaptop?.asset.supplyType.name, 'Laptop')
    assert.equal(mLaptop?.asset.serialNumber, laptop.serial)
    assert.equal(mMonitor?.asset.name, monitor.name)
    assert.equal(mMonitor?.asset.fileNumber, monitor.fileNumber)
    assert.equal(mMonitor?.asset.supplyType.name, 'Monitor')
    assert.isNull(mMonitor?.asset.serialNumber)

    // L todavía no tiene características capturadas.
    assert.deepEqual(mLaptop?.asset.characteristics, [])

    // Devuelto C con su motivo y fecha.
    const c = historyOf(data, phone.supplyId)
    assert.equal(c?.status, 'retired')
    assert.equal(c?.retirementDate, '2026-09-01')
    assert.equal(c?.retirementReason, 'Cambio de equipo')
    assert.equal(c?.custodyStatus, 'unsigned')
  })

  test('CA-2: los devueltos se ordenan por fecha de devolución, no de asignación', async ({
    client,
    assert,
  }) => {
    await ensureCommonFixture(client)

    // Por devolución: C (09-01) antes que T (06-01); por asignación sería al revés.
    const ordered = await readAssets(client)
    assert.deepEqual(
      ordered.history.map((row) => row.asset.supplyId),
      [phone.supplyId, tablet.supplyId]
    )

    // Un devuelto sin fecha de devolución usa su fecha de asignación; empate por
    // `employeeSupplyId` desc.
    const first = await createAsset(client, { typeId: laptopTypeId, name: 'Devuelto A', serial: null })
    await assign(client, first, '2026-02-01')
    await retire(first.assignmentId)
    const second = await createAsset(client, { typeId: laptopTypeId, name: 'Devuelto B', serial: null })
    await assign(client, second, '2026-02-01')
    await retire(second.assignmentId)

    const data = await readAssets(client)
    assert.deepEqual(
      data.history.map((row) => row.employeeSupplyId),
      [phone.assignmentId, tablet.assignmentId, second.assignmentId, first.assignmentId]
    )
  })

  test('CA-3: una asignación en envío aparece en vigentes con status shipping', async ({
    client,
    assert,
  }) => {
    await ensureCommonFixture(client)
    const shipping = await createAsset(client, { typeId: laptopTypeId, name: 'En envío', serial: null })
    await assign(client, shipping, '2026-09-25')
    await db
      .from('employee_supplies')
      .where('employee_supply_id', shipping.assignmentId)
      .update({ employee_supply_status: 'shipping' })

    const data = await readAssets(client)
    assert.equal(data.current[0]?.asset.supplyId, shipping.supplyId)
    assert.equal(data.current[0]?.status, 'shipping')
  })

  test('CA-4: activo extraviado sigue en vigentes; activo eliminado sigue en devueltos', async ({
    client,
    assert,
  }) => {
    await ensureCommonFixture(client)
    await db.from('supplies').where('supply_id', laptop.supplyId).update({ supply_status: 'lost' })
    await db
      .from('supplies')
      .where('supply_id', phone.supplyId)
      .update({ supply_deleted_at: new Date() })

    const data = await readAssets(client)
    const l = currentOf(data, laptop.supplyId)
    assert.equal(l?.asset.status, 'lost')
    assert.isFalse(l?.asset.isDeleted)

    const c = historyOf(data, phone.supplyId)
    assert.isTrue(c?.asset.isDeleted)
    assert.equal(c?.asset.name, phone.name)
    assert.equal(c?.asset.fileNumber, phone.fileNumber)
    assert.equal(c?.asset.supplyType.name, 'Celular')
  })

  test('CA-5: características capturadas: solo el valor vigente, sin las que no tienen valor', async ({
    client,
    assert,
  }) => {
    await ensureCommonFixture(client)
    const base = {
      supplie_id: laptop.supplyId,
      supplie_caracteristic_id: modeloCharacteristicId,
      business_unit_id: buId(),
      supplie_caracteristic_value_created_at: new Date(),
    }
    await db.table('supplie_caracteristic_values').insert({
      ...base,
      supplie_caracteristic_value_value: 'Latitude 5430',
    })
    await db.table('supplie_caracteristic_values').insert({
      ...base,
      supplie_caracteristic_value_value: 'Latitude 5440',
    })

    const data = await readAssets(client)
    const l = currentOf(data, laptop.supplyId)
    assert.deepEqual(l?.asset.characteristics, [
      {
        characteristicId: modeloCharacteristicId,
        name: 'Modelo',
        type: 'text',
        value: 'Latitude 5440',
      },
    ])
  })

  test('CA-9: un colaborador dado de baja sigue consultable con sus activos', async ({
    client,
    assert,
  }) => {
    await ensureCommonFixture(client)
    await db
      .from('employees')
      .where('employee_id', employeeId())
      .update({ employee_deleted_at: new Date() })

    const data = await readAssets(client)
    assert.isAbove(data.current.length, 0)
    assert.isAbove(data.history.length, 0)
  })

  test('CA-12 (con datos): la respuesta con renglones no expone archivos ni titulares', async ({
    client,
    assert,
  }) => {
    await ensureCommonFixture(client)
    const response = await get(
      client,
      required(actorA, 'el actor de A'),
      `/api/employees/${employeeId()}/assets`
    )
    response.assertStatus(200)
    assert.isAbove(response.body().data.current.length, 0, 'la respuesta trae renglones')

    const serialized = JSON.stringify(response.body())
    for (const forbidden of ['contracts', 'photos', 'fileName', 'storedPath', 'businessUnitId']) {
      assert.notInclude(serialized, forbidden, forbidden)
    }
  })

  test('RF-1: un resguardo borrado lógicamente no cuenta como firmado', async ({
    client,
    assert,
  }) => {
    await ensureCommonFixture(client)
    await db
      .from('employee_supplies_response_contracts')
      .where('employee_supply_id', laptop.assignmentId)
      .update({ employee_supply_response_contract_deleted_at: new Date() })

    const data = await readAssets(client)
    const l = currentOf(data, laptop.supplyId)
    assert.equal(l?.custodyStatus, 'unsigned')
  })

  test('RF-2: asignación sin fecha de asignación usa la fecha de alta', async ({
    client,
    assert,
  }) => {
    await ensureCommonFixture(client)
    const asset = await createAsset(client, { typeId: laptopTypeId, name: 'Alta sin fecha', serial: null })
    const [assignmentId] = await db.table('employee_supplies').insert({
      employee_id: employeeId(),
      supply_id: asset.supplyId,
      business_unit_id: buId(),
      employee_supply_status: 'active',
      employee_supply_created_at: '2026-03-05 10:00:00',
    })

    const data = await readAssets(client)
    const row = data.current.find((item) => item.employeeSupplyId === Number(assignmentId))
    assert.equal(row?.assignedAt, '2026-03-05')

    // El orden de vigentes respeta esa fecha de alta: va después de L (08-01).
    const order = data.current.map((item) => item.asset.supplyId)
    assert.isBelow(order.indexOf(laptop.supplyId), order.indexOf(asset.supplyId))
  })

  test('RF-3: la fecha de vencimiento viaja como YYYY-MM-DD o null', async ({ client, assert }) => {
    await ensureCommonFixture(client)
    await db
      .from('employee_supplies')
      .where('employee_supply_id', monitor.assignmentId)
      .update({ employee_supply_expiration_date: '2027-08-01' })

    const data = await readAssets(client)
    assert.equal(currentOf(data, monitor.supplyId)?.expiresAt, '2027-08-01')
    assert.isNull(currentOf(data, laptop.supplyId)?.expiresAt)
  })

  test('RF-4: un tipo de activo borrado lógicamente conserva su nombre', async ({
    client,
    assert,
  }) => {
    await ensureCommonFixture(client)
    await db
      .from('supply_types')
      .where('supply_type_id', laptopTypeId)
      .update({ supply_type_deleted_at: new Date() })

    const data = await readAssets(client)
    assert.equal(currentOf(data, laptop.supplyId)?.asset.supplyType.name, 'Laptop')
  })
})