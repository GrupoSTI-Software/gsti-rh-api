import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import { ASSET_ERROR_KEYS } from '#modules/assets/assets.constants'
import type {
  AssetAssignmentDto,
  AssetCharacteristicValueDto,
  AssetDetailDto,
  AssetListItemDto,
  AssetListResponseDto,
  AssetsSummaryDto,
  AssetTypeDto,
  AssetValueHistoryDto,
} from '#modules/assets/dto/assets.dto'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Módulo Activos (`/api/assets`, `/api/asset-types`) y las reglas de servidor
 * que el rediseño del BO necesita en las rutas existentes (`/supplies`,
 * `/supply-types`, `/employee-supplies`).
 *
 * Los actores son owner (bypass de `supplies` y de
 * `employees:manage-employee-supplies`) con empresa propia; todo lo que crea
 * la corrida cuelga de esas empresas y se limpia por `business_unit_id`.
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
let counter = 0
const unique = (label: string) => `${label}-${RUN}-${++counter}`

type HttpMethod = 'get' | 'post' | 'put' | 'delete'

/** PNG válido de 1x1: el bodyparser lo reconoce como imagen por su firma. */
const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function call(
  client: ApiClient,
  actor: TenantActor,
  method: HttpMethod,
  url: string,
  body?: Record<string, unknown>
) {
  const pending = client[method](url).loginAs(actor.user).headers(businessUnitHeaders(actor))
  return body ? pending.json(body) : pending
}

/** `data` de una respuesta exitosa, sin leer miembros de un `await`. */
async function dataOf<T>(pending: ReturnType<typeof call>): Promise<T> {
  const response = await pending
  return response.body().data
}

async function statusOf(pending: ReturnType<typeof call>): Promise<number> {
  const response = await pending
  return response.status()
}

/** Ids de una columna, para la limpieza. */
async function columnValues(query: ReturnType<typeof db.from>, column: string): Promise<number[]> {
  const rows: Array<Record<string, number>> = await query.select(column)
  return rows.map((row) => row[column])
}

async function createType(client: ApiClient, actor: TenantActor, name: string): Promise<number> {
  const response = await call(client, actor, 'post', '/api/supply-types', { supplyTypeName: name })
  response.assertStatus(201)
  return response.body().data.supplyType.supplyTypeId
}

async function createAsset(
  client: ApiClient,
  actor: TenantActor,
  body: Record<string, unknown>
): Promise<number> {
  const response = await call(client, actor, 'post', '/api/supplies', body)
  response.assertStatus(201)
  return response.body().data.supplie.supplyId
}

async function assign(
  client: ApiClient,
  actor: TenantActor,
  employeeId: number,
  supplyId: number
): Promise<number> {
  const response = await call(client, actor, 'post', '/api/employee-supplies', {
    employeeId,
    supplyId,
    employeeSupplyAssignamentDate: '2026-09-01',
    employeeSupplyAdditions: 'Incluye cargador',
  })
  response.assertStatus(201)
  return response.body().data.employeeSupply.employeeSupplyId
}

/** Borra en orden de FK todo lo que la corrida colgó de la empresa. */
async function cleanupCompanyAssets(businessUnitId: number): Promise<void> {
  const supplyIds = await columnValues(
    db.from('supplies').where('business_unit_id', businessUnitId),
    'supply_id'
  )
  const assignmentIds = await columnValues(
    db.from('employee_supplies').whereIn('supply_id', supplyIds),
    'employee_supply_id'
  )

  await db
    .from('employee_supplie_assignation_photos')
    .whereIn('employee_supply_id', assignmentIds)
    .delete()
  await db
    .from('employee_supplies_response_contracts')
    .whereIn('employee_supply_id', assignmentIds)
    .delete()
  await db.from('employee_supplies').whereIn('employee_supply_id', assignmentIds).delete()
  await db.from('supplie_caracteristic_values').whereIn('supplie_id', supplyIds).delete()
  await db.from('supply_value_histories').whereIn('supply_id', supplyIds).delete()
  await db.from('supplies').whereIn('supply_id', supplyIds).delete()
  const typeIds = await columnValues(
    db.from('supply_types').where('business_unit_id', businessUnitId),
    'supply_type_id'
  )
  await db.from('supplie_caracteristics').whereIn('supply_type_id', typeIds).delete()
  await db.from('supply_types').whereIn('supply_type_id', typeIds).delete()
}

test.group('Activos — módulo de lectura y reglas de servidor', (group) => {
  let owner: TenantActor | null = null
  let otherOwner: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let otherFixture: EmployeeFixture | null = null

  /** Tipo "Laptop" con características, dos activos asignado/libre y uno dado de baja. */
  let laptopTypeId = 0
  let ramCharacteristicId = 0
  let purchaseCharacteristicId = 0
  let assignedAssetId = 0
  let assignedEmployeeSupplyId = 0
  let freeAssetId = 0
  let retiredAssetId = 0
  let otherTypeCharacteristicId = 0
  const assignedName = uniqueTestName('Laptop asignada')
  const serial = unique('SERIE')

  group.setup(async () => {
    owner = await createBypassActor('owner', 'activos-modulo')
    otherOwner = await createBypassActor('owner', 'activos-modulo-otra')
    fixture = await createEmployeeFixture(owner.businessUnit.businessUnitId, 'activos')
    otherFixture = await createEmployeeFixture(
      otherOwner.businessUnit.businessUnitId,
      'activos-otra'
    )
  })

  group.teardown(async () => {
    for (const actor of [owner, otherOwner]) {
      if (actor) await cleanupCompanyAssets(actor.businessUnit.businessUnitId)
    }
    await cleanupEmployeeFixture(fixture)
    await cleanupEmployeeFixture(otherFixture)
    await cleanupTenantActor(owner)
    await cleanupTenantActor(otherOwner)
  })

  test('alta de tipo sin slug lo deriva del nombre, único en la empresa', async ({
    client,
    assert,
  }) => {
    const actor = required(owner, 'owner')
    const name = uniqueTestName('Laptop Ñandú')
    laptopTypeId = await createType(client, actor, name)
    const repeated = await call(client, actor, 'post', '/api/supply-types', {
      supplyTypeName: name,
    })
    repeated.assertStatus(201)

    const slugs = await db
      .from('supply_types')
      .whereIn('supply_type_id', [laptopTypeId, repeated.body().data.supplyType.supplyTypeId])
      .orderBy('supply_type_id')
      .select('supply_type_slug')
    assert.match(slugs[0].supply_type_slug, /^laptop-nandu-/)
    assert.equal(slugs[1].supply_type_slug, `${slugs[0].supply_type_slug}-2`)

    for (const [characteristicName, type] of [
      ['RAM (GB)', 'number'],
      ['Compra', 'date'],
    ] as const) {
      const response = await call(client, actor, 'post', '/api/supplie-characteristics', {
        supplyTypeId: laptopTypeId,
        supplieCaracteristicName: characteristicName,
        supplieCaracteristicType: type,
      })
      response.assertStatus(201)
    }
    const characteristics = await db
      .from('supplie_caracteristics')
      .where('supply_type_id', laptopTypeId)
      .orderBy('supplie_caracteristic_id')
      .select('supplie_caracteristic_id')
    ramCharacteristicId = characteristics[0].supplie_caracteristic_id
    purchaseCharacteristicId = characteristics[1].supplie_caracteristic_id

    const otherType = await createType(client, actor, uniqueTestName('Celular'))
    const otherCharacteristic = await call(client, actor, 'post', '/api/supplie-characteristics', {
      supplyTypeId: otherType,
      supplieCaracteristicName: 'IMEI',
      supplieCaracteristicType: 'text',
    })
    otherCharacteristic.assertStatus(201)
    otherTypeCharacteristicId =
      otherCharacteristic.body().data.supplieCaracteristic.supplieCaracteristicId
  })

  test('el validador de características rechaza radio y file', async ({ client }) => {
    const actor = required(owner, 'owner')
    const response = await call(client, actor, 'post', '/api/supplie-characteristics', {
      supplyTypeId: laptopTypeId,
      supplieCaracteristicName: 'Adjunto',
      supplieCaracteristicType: 'file',
    })
    response.assertStatus(400)
  })

  test('alta con valor de adquisición crea el primer registro del historial y respeta 0', async ({
    client,
    assert,
  }) => {
    const actor = required(owner, 'owner')
    assignedAssetId = await createAsset(client, actor, {
      supplyFileNumber: unique('LAP'),
      supplyName: assignedName,
      supplySerialNumber: serial,
      supplyTypeId: laptopTypeId,
      supplyAcquisitionValue: 18500,
      supplyAcquisitionDate: '2026-01-15',
    })
    freeAssetId = await createAsset(client, actor, {
      supplyFileNumber: unique('LAP'),
      supplyName: uniqueTestName('Laptop libre'),
      supplyTypeId: laptopTypeId,
      supplyAcquisitionValue: 0,
    })
    retiredAssetId = await createAsset(client, actor, {
      supplyFileNumber: unique('LAP'),
      supplyName: uniqueTestName('Laptop baja'),
      supplyTypeId: laptopTypeId,
    })

    const history = await call(client, actor, 'get', `/api/assets/${assignedAssetId}/value-history`)
    history.assertStatus(200)
    const data: AssetValueHistoryDto = history.body().data
    assert.deepEqual(data.acquisition, { value: 18500, date: '2026-01-15' })
    assert.lengthOf(data.entries, 1)
    assert.equal(data.entries[0].amount, 18500)
    assert.equal(data.entries[0].notes, 'Valor de adquisición')

    const zero: AssetValueHistoryDto = await dataOf(
      call(client, actor, 'get', `/api/assets/${freeAssetId}/value-history`)
    )
    assert.equal(zero.entries[0]?.amount, 0, 'el 0 también abre historial')

    const recorded = await call(client, actor, 'post', '/api/supply-value-histories', {
      supplyId: assignedAssetId,
      supplyValueHistoryCost: 15200,
      supplyValueHistoryCurrentValue: 15200,
      supplyValueHistoryNotes: 'Depreciación',
    })
    recorded.assertStatus(201)
  })

  test('folio duplicado en la empresa responde 409 y se repite sin problema en otra empresa', async ({
    client,
    assert,
  }) => {
    const actor = required(owner, 'owner')
    const other = required(otherOwner, 'otra empresa')
    const folio = unique('INV')
    await createAsset(client, actor, {
      supplyFileNumber: folio,
      supplyName: uniqueTestName('Monitor'),
      supplyTypeId: laptopTypeId,
    })

    const duplicated = await call(client, actor, 'post', '/api/supplies', {
      supplyFileNumber: folio,
      supplyName: uniqueTestName('Monitor repetido'),
      supplyTypeId: laptopTypeId,
    })
    duplicated.assertStatus(409)
    assert.equal(duplicated.body().key, ASSET_ERROR_KEYS.FILE_NUMBER_TAKEN)
    assert.exists(duplicated.body().title)
    assert.exists(duplicated.body().detail)

    const otherType = await createType(client, other, uniqueTestName('Monitor'))
    await createAsset(client, other, {
      supplyFileNumber: folio,
      supplyName: uniqueTestName('Monitor otra empresa'),
      supplyTypeId: otherType,
    })

    // Editar hacia un folio ocupado también choca.
    const edited = await call(client, actor, 'put', `/api/supplies/${freeAssetId}`, {
      supplyFileNumber: folio,
    })
    edited.assertStatus(409)
    assert.equal(edited.body().key, ASSET_ERROR_KEYS.FILE_NUMBER_TAKEN)
  })

  test('un segundo resguardo activo del mismo activo responde 409 (alta y edición)', async ({
    client,
    assert,
  }) => {
    const actor = required(owner, 'owner')
    const employeeId = required(fixture, 'empleado').employee.employeeId
    assignedEmployeeSupplyId = await assign(client, actor, employeeId, assignedAssetId)

    const second = await call(client, actor, 'post', '/api/employee-supplies', {
      employeeId,
      supplyId: assignedAssetId,
      employeeSupplyAssignamentDate: '2026-09-02',
    })
    second.assertStatus(409)
    assert.equal(second.body().key, ASSET_ERROR_KEYS.ACTIVE_ASSIGNMENT_EXISTS)

    // Un resguardo cerrado del activo libre no se puede reabrir sobre el asignado.
    const otherAssignment = await assign(client, actor, employeeId, freeAssetId)
    const retire = await call(
      client,
      actor,
      'post',
      `/api/employee-supplies/${otherAssignment}/retire`,
      {
        employeeSupplyRetirementReason: 'Devolución de prueba',
        employeeSupplyRetirementDate: '2026-09-10',
      }
    )
    retire.assertStatus(200)
    assert.equal(retire.body().data.employeeSupply.employeeSupplyStatus, 'retired')
    assert.equal(
      retire.body().data.employeeSupply.employeeSupplyRetirementReason,
      'Devolución de prueba'
    )

    const moved = await call(client, actor, 'put', `/api/employee-supplies/${otherAssignment}`, {
      supplyId: assignedAssetId,
      employeeSupplyStatus: 'active',
    })
    moved.assertStatus(409)
    assert.equal(moved.body().key, ASSET_ERROR_KEYS.ACTIVE_ASSIGNMENT_EXISTS)
  })

  test('listado: resguardo activo embebido, búsqueda y filtro de estado', async ({
    client,
    assert,
  }) => {
    const actor = required(owner, 'owner')
    const employee = required(fixture, 'empleado').employee

    const deactivated = await call(
      client,
      actor,
      'post',
      `/api/supplies/${retiredAssetId}/deactivate`,
      {
        supplyStatus: 'damaged',
        supplyDeactivationReason: 'Pantalla rota',
        supplyDeactivationDate: '2026-09-05',
      }
    )
    deactivated.assertStatus(200)

    const list = async (qs: string): Promise<AssetListResponseDto> => {
      const response = await call(client, actor, 'get', `/api/assets?${qs}`)
      response.assertStatus(200)
      return response.body().data
    }

    const all = await list(`supplyTypeId=${laptopTypeId}&limit=500`)
    const assigned = all.data.find((item) => item.supplyId === assignedAssetId) as AssetListItemDto
    assert.exists(assigned)
    assert.equal(assigned.serialNumber, serial)
    assert.equal(assigned.supplyType.supplyTypeId, laptopTypeId)
    assert.equal(assigned.currentValue, 15200, 'último registro del historial')
    assert.equal(assigned.acquisitionValue, 18500)
    assert.equal(assigned.activeAssignment?.employeeSupplyId, assignedEmployeeSupplyId)
    assert.equal(assigned.activeAssignment?.assignedAt, '2026-09-01')
    assert.equal(assigned.activeAssignment?.notes, 'Incluye cargador')
    assert.equal(assigned.activeAssignment?.employee.employeeId, employee.employeeId)
    assert.equal(assigned.activeAssignment?.employee.employeeSlug, employee.employeeSlug)
    assert.equal(assigned.activeAssignment?.employee.name, 'Empleado Fixture activos')
    assert.isString(assigned.activeAssignment?.employee.positionName)
    assert.isString(assigned.activeAssignment?.employee.departmentName)
    const free = all.data.find((item) => item.supplyId === freeAssetId)
    assert.isNull(free?.activeAssignment)
    assert.equal(free?.currentValue, 0)
    assert.equal(all.meta.total, 4)

    const names = all.data.map((item) => item.name)
    assert.deepEqual(
      names,
      [...names].sort((a, b) => a.localeCompare(b)),
      'orden por nombre'
    )

    const ids = (page: AssetListResponseDto) => page.data.map((item) => item.supplyId)
    assert.deepEqual(ids(await list(`supplyTypeId=${laptopTypeId}&state=assigned`)), [
      assignedAssetId,
    ])
    assert.notInclude(
      ids(await list(`supplyTypeId=${laptopTypeId}&state=available`)),
      assignedAssetId
    )
    assert.include(ids(await list(`supplyTypeId=${laptopTypeId}&state=available`)), freeAssetId)
    assert.deepEqual(ids(await list(`supplyTypeId=${laptopTypeId}&state=retired`)), [
      retiredAssetId,
    ])

    // Búsqueda: nombre del colaborador, serie (sin distinguir mayúsculas) y folio.
    assert.include(
      ids(await list(`search=${encodeURIComponent('fixture ACTIVOS')}`)),
      assignedAssetId
    )
    assert.deepEqual(ids(await list(`search=${encodeURIComponent(serial.toLowerCase())}`)), [
      assignedAssetId,
    ])
    assert.deepEqual(ids(await list('search=%25%25%25')), [], 'los comodines se buscan literal')

    const paged = await list(`supplyTypeId=${laptopTypeId}&limit=1&page=2`)
    assert.equal(paged.meta.total, 4)
    assert.equal(paged.meta.lastPage, 4)
    assert.lengthOf(paged.data, 1)

    const tooLarge = await call(client, actor, 'get', '/api/assets?limit=501')
    tooLarge.assertStatus(422)
    assert.equal(tooLarge.body().key, ASSET_ERROR_KEYS.INVALID_INPUT)
  })

  test('otra empresa no ve los activos ni su ficha', async ({ client, assert }) => {
    const other = required(otherOwner, 'otra empresa')
    const list: AssetListResponseDto = await dataOf(
      call(client, other, 'get', `/api/assets?supplyTypeId=${laptopTypeId}`)
    )
    assert.lengthOf(list.data, 0)

    const detail = await call(client, other, 'get', `/api/assets/${assignedAssetId}`)
    detail.assertStatus(404)
    assert.equal(detail.body().key, ASSET_ERROR_KEYS.ASSET_NOT_FOUND)
  })

  test('summary: en operación, asignados y valores sobre activos active', async ({
    client,
    assert,
  }) => {
    const actor = required(owner, 'owner')
    const response = await call(
      client,
      actor,
      'get',
      `/api/assets/summary?supplyTypeId=${laptopTypeId}`
    )
    response.assertStatus(200)
    const summary: AssetsSummaryDto = response.body().data
    // Activos active del tipo: asignado (15200), libre (0) y el del folio (sin valor).
    assert.deepEqual(summary, {
      inOperation: 3,
      assigned: 1,
      totalValue: 15200,
      unassignedValue: 0,
    })
  })

  test('detalle con características y upsert en lote validando formato y tipo', async ({
    client,
    assert,
  }) => {
    const actor = required(owner, 'owner')
    const url = `/api/assets/${assignedAssetId}/characteristic-values`

    const detail: AssetDetailDto = await dataOf(
      call(client, actor, 'get', `/api/assets/${assignedAssetId}`)
    )
    assert.equal(detail.supplyId, assignedAssetId)
    assert.deepEqual(
      detail.characteristicValues.map((item) => [item.characteristicId, item.type, item.value]),
      [
        [ramCharacteristicId, 'number', null],
        [purchaseCharacteristicId, 'date', null],
      ]
    )

    const saved = await call(client, actor, 'put', url, {
      values: [
        { characteristicId: ramCharacteristicId, value: 16 },
        { characteristicId: purchaseCharacteristicId, value: '2026-01-15' },
      ],
    })
    saved.assertStatus(200)
    const values: AssetCharacteristicValueDto[] = saved.body().data
    assert.deepEqual(
      values.map((item) => item.value),
      ['16', '2026-01-15']
    )

    // Actualiza el existente y quita el que llega vacío: un solo valor vivo por característica.
    const updated = await call(client, actor, 'put', url, {
      values: [
        { characteristicId: ramCharacteristicId, value: '32' },
        { characteristicId: purchaseCharacteristicId, value: null },
      ],
    })
    updated.assertStatus(200)
    assert.deepEqual(
      (updated.body().data as AssetCharacteristicValueDto[]).map((item) => item.value),
      ['32', null]
    )
    const live = await db
      .from('supplie_caracteristic_values')
      .where('supplie_id', assignedAssetId)
      .whereNull('supplie_caracteristic_value_deleted_at')
      .select('supplie_caracteristic_value_value')
    assert.deepEqual(
      live.map(
        (row: { supplie_caracteristic_value_value: string }) =>
          row.supplie_caracteristic_value_value
      ),
      ['32']
    )

    const badNumber = await call(client, actor, 'put', url, {
      values: [{ characteristicId: ramCharacteristicId, value: 'dieciséis' }],
    })
    badNumber.assertStatus(422)
    assert.equal(badNumber.body().key, ASSET_ERROR_KEYS.CHARACTERISTIC_VALUE_INVALID)

    const badDate = await call(client, actor, 'put', url, {
      values: [{ characteristicId: purchaseCharacteristicId, value: '2026-02-30' }],
    })
    badDate.assertStatus(422)
    assert.equal(badDate.body().key, ASSET_ERROR_KEYS.CHARACTERISTIC_VALUE_INVALID)

    const foreign = await call(client, actor, 'put', url, {
      values: [{ characteristicId: otherTypeCharacteristicId, value: '123' }],
    })
    foreign.assertStatus(422)
    assert.equal(foreign.body().key, ASSET_ERROR_KEYS.CHARACTERISTIC_NOT_IN_TYPE)
  })

  test('asset-types: conteo de activos y características', async ({ client, assert }) => {
    const actor = required(owner, 'owner')
    const response = await call(client, actor, 'get', '/api/asset-types')
    response.assertStatus(200)
    const laptop = (response.body().data as AssetTypeDto[]).find(
      (type) => type.supplyTypeId === laptopTypeId
    )
    assert.equal(laptop?.suppliesCount, 4)
    assert.deepEqual(
      laptop?.characteristics.map((item) => item.characteristicId),
      [ramCharacteristicId, purchaseCharacteristicId]
    )
  })

  test('borrar un tipo con activos y un activo asignado responde 409', async ({
    client,
    assert,
  }) => {
    const actor = required(owner, 'owner')
    const deleteType = await call(client, actor, 'delete', `/api/supply-types/${laptopTypeId}`)
    deleteType.assertStatus(409)
    assert.equal(deleteType.body().key, ASSET_ERROR_KEYS.TYPE_HAS_ASSETS)

    const deleteAsset = await call(client, actor, 'delete', `/api/supplies/${assignedAssetId}`)
    deleteAsset.assertStatus(409)
    assert.equal(deleteAsset.body().key, ASSET_ERROR_KEYS.ASSET_HAS_ACTIVE_ASSIGNMENT)
  })

  test('historial de resguardos y descargas: 404 sin archivo, inexistente o de otra empresa', async ({
    client,
    assert,
  }) => {
    const actor = required(owner, 'owner')
    const [contractId] = await db.table('employee_supplies_response_contracts').insert({
      employee_supply_id: assignedEmployeeSupplyId,
      business_unit_id: actor.businessUnit.businessUnitId,
      employee_supply_response_contract_uuid: unique('uuid'),
      employee_supply_response_contract_file: 'file_not_found',
      employee_supply_response_contract_created_at: new Date(),
    })
    const [photoId] = await db.table('employee_supplie_assignation_photos').insert({
      employee_supply_id: assignedEmployeeSupplyId,
      employee_supplie_assignation_photo_type: 'assignation',
      employee_supplie_assignation_photo_file: 'file_not_found',
      employee_supplie_assignation_photo_created_at: new Date(),
      employee_supplie_assignation_photo_updated_at: new Date(),
    })

    const history = await call(client, actor, 'get', `/api/assets/${assignedAssetId}/assignments`)
    history.assertStatus(200)
    const assignments: AssetAssignmentDto[] = history.body().data
    assert.lengthOf(assignments, 1)
    assert.equal(assignments[0].status, 'active')
    assert.equal(assignments[0].employee.name, 'Empleado Fixture activos')
    assert.deepEqual(assignments[0].contracts, [{ id: Number(contractId), fileName: null }])
    assert.deepEqual(assignments[0].photos, [{ photoId: Number(photoId), kind: 'assignation' }])

    for (const url of [
      `/api/employee-supplies-response-contracts/${contractId}/file`,
      '/api/employee-supplies-response-contracts/999999999/file',
      `/api/employee-supply-assignation-photos/photo/${photoId}/file`,
      '/api/employee-supply-assignation-photos/photo/999999999/file',
    ]) {
      const response = await call(client, actor, 'get', url)
      assert.equal(response.status(), 404, url)
      assert.equal(response.body().key, ASSET_ERROR_KEYS.FILE_NOT_FOUND, url)
    }

    const foreign = await call(
      client,
      required(otherOwner, 'otra empresa'),
      'get',
      `/api/employee-supplies-response-contracts/${contractId}/file`
    )
    foreign.assertStatus(404)
  })

  test('tope de 6 fotos de asignación por resguardo', async ({ client, assert }) => {
    const actor = required(owner, 'owner')
    await db.table('employee_supplie_assignation_photos').multiInsert(
      Array.from({ length: 5 }, () => ({
        employee_supply_id: assignedEmployeeSupplyId,
        employee_supplie_assignation_photo_type: 'assignation',
        employee_supplie_assignation_photo_file: 'pruebas/foto.jpg',
        employee_supplie_assignation_photo_created_at: new Date(),
        employee_supplie_assignation_photo_updated_at: new Date(),
      }))
    )
    // Ya hay 6 (la del caso anterior más estas 5): una más excede el tope.
    const response = await client
      .post(`/api/employee-supply-assignation-photos/${assignedEmployeeSupplyId}/assignation`)
      .loginAs(actor.user)
      .headers(businessUnitHeaders(actor))
      .file('photos', Buffer.from(ONE_PIXEL_PNG, 'base64'), {
        filename: 'foto.png',
        contentType: 'image/png',
      })
    response.assertStatus(422)
    assert.equal(response.body().key, ASSET_ERROR_KEYS.PHOTO_LIMIT_EXCEEDED)
  })

  test('la baja cierra el resguardo activo con el motivo y la fecha; reactivar limpia la baja', async ({
    client,
    assert,
  }) => {
    const actor = required(owner, 'owner')
    const response = await call(
      client,
      actor,
      'post',
      `/api/supplies/${assignedAssetId}/deactivate`,
      {
        supplyStatus: 'lost',
        supplyDeactivationReason: 'Extraviada en viaje',
        supplyDeactivationDate: '2026-09-20',
      }
    )
    response.assertStatus(200)
    const body = response.body().data.supplie
    assert.equal(body.supplyStatus, 'lost')
    assert.lengthOf(body.closedAssignments, 1)
    assert.equal(body.closedAssignments[0].employeeSupplyId, assignedEmployeeSupplyId)

    const assignment = await db
      .from('employee_supplies')
      .where('employee_supply_id', assignedEmployeeSupplyId)
      .select(
        'employee_supply_status',
        'employee_supply_retirement_reason',
        db.raw("DATE_FORMAT(employee_supply_retirement_date, '%Y-%m-%d') as retired_on")
      )
      .firstOrFail()
    assert.equal(assignment.employee_supply_status, 'retired')
    assert.equal(assignment.employee_supply_retirement_reason, 'Extraviada en viaje')
    assert.equal(assignment.retired_on, '2026-09-20')

    const detail: AssetDetailDto = await dataOf(
      call(client, actor, 'get', `/api/assets/${assignedAssetId}`)
    )
    assert.equal(detail.status, 'lost')
    assert.equal(detail.deactivationReason, 'Extraviada en viaje')
    assert.equal(detail.deactivationDate, '2026-09-20')
    assert.isNull(detail.activeAssignment)

    const reactivated = await call(client, actor, 'put', `/api/supplies/${assignedAssetId}`, {
      supplyStatus: 'active',
    })
    reactivated.assertStatus(200)
    const after: AssetDetailDto = await dataOf(
      call(client, actor, 'get', `/api/assets/${assignedAssetId}`)
    )
    assert.equal(after.status, 'active')
    assert.isNull(after.deactivationReason)
    assert.isNull(after.deactivationDate)

    // Sin resguardo activo, ya se puede borrar.
    const deleted = await call(client, actor, 'delete', `/api/supplies/${freeAssetId}`)
    deleted.assertStatus(200)
  })
})

test.group('Activos — permisos de las rutas nuevas', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    actor = await createTenantActor('activos-permisos')
  })

  group.teardown(async () => {
    await cleanupTenantActor(actor)
  })

  test('sin concesiones responden 403; con read se abren las lecturas y no el upsert', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'actor')
    const reads = [
      '/api/assets',
      '/api/assets/summary',
      '/api/asset-types',
      '/api/assets/999999999',
      '/api/assets/999999999/assignments',
      '/api/assets/999999999/value-history',
      '/api/employee-supplies-response-contracts/999999999/file',
      '/api/employee-supply-assignation-photos/photo/999999999/file',
    ]
    const upsert = { values: [{ characteristicId: 1, value: 'x' }] }

    await grantModulePermissions(tenant, 'supplies', [])
    for (const url of reads) {
      assert.equal(await statusOf(call(client, tenant, 'get', url)), 403, url)
    }
    assert.equal(
      await statusOf(
        call(client, tenant, 'put', '/api/assets/999999999/characteristic-values', upsert)
      ),
      403
    )

    await grantModulePermissions(tenant, 'supplies', ['read'])
    for (const url of reads) {
      assert.notEqual(await statusOf(call(client, tenant, 'get', url)), 403, url)
    }
    assert.equal(
      await statusOf(
        call(client, tenant, 'put', '/api/assets/999999999/characteristic-values', upsert)
      ),
      403
    )

    await grantModulePermissions(tenant, 'supplies', ['update'])
    const notFound = await call(
      client,
      tenant,
      'put',
      '/api/assets/999999999/characteristic-values',
      upsert
    )
    notFound.assertStatus(404)
    assert.equal(notFound.body().key, ASSET_ERROR_KEYS.ASSET_NOT_FOUND)
  })
})
