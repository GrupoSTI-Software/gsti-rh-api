import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import EmployeeMedicalCondition from '#models/employee_medical_condition'
import MedicalConditionType from '#models/medical_condition_type'
import MedicalConditionTypeProperty from '#models/medical_condition_type_property'
import MedicalConditionTypePropertyValue from '#models/medical_condition_type_property_value'
import { TenantContext } from '#utils/tenant_context'
import {
  assertPassesGate,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  setModuleEnforcement,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'

/**
 * Catálogo de condición médica con la exigencia de Empleados encendida.
 *
 * Tipos, propiedades y valores no verificaban permiso: cualquier sesión del
 * tenant leía el catálogo y borraba tipos (y con ellos el tipo de todas las
 * condiciones de la empresa). Solo los consume la pestaña Condición médica del
 * expediente, así que exigen sus casillas: lecturas con `-read`, altas y
 * ediciones con `-write`, bajas con `-delete`.
 *
 * El actor tiene empresa propia y un colaborador de esa empresa; cada caso
 * parte de un tipo, una propiedad, una condición y un valor recién creados.
 */

const MODULE = 'employees'
const READ = 'tab-condicion-medica-read'
const WRITE = 'tab-condicion-medica-write'
const DELETE = 'tab-condicion-medica-delete'

type HttpVerb = 'get' | 'post' | 'put' | 'delete'

interface ApiCall {
  label: string
  method: HttpVerb
  url: string
  body?: Record<string, string | number>
}

interface CatalogFixture {
  typeId: number
  propertyId: number
  employeeMedicalConditionId: number
  valueId: number
}

/** Tipo, propiedad, condición del colaborador y valor, todos en la empresa del actor. */
async function createCatalogFixture(actor: TenantActor, fixture: EmployeeFixture): Promise<CatalogFixture> {
  return TenantContext.run([actor.businessUnit.businessUnitId], async () => {
    const type = new MedicalConditionType()
    type.medicalConditionTypeName = uniqueTestName('Tipo gate').slice(0, 100)
    type.medicalConditionTypeDescription = 'fixture de gate'
    type.medicalConditionTypeActive = 1
    await type.save()

    const property = new MedicalConditionTypeProperty()
    property.medicalConditionTypePropertyName = 'Grupo sanguíneo'
    property.medicalConditionTypePropertyDescription = 'fixture de gate'
    property.medicalConditionTypePropertyDataType = 'text'
    property.medicalConditionTypePropertyRequired = 0
    property.medicalConditionTypeId = type.medicalConditionTypeId
    property.medicalConditionTypePropertyActive = 1
    await property.save()

    const condition = new EmployeeMedicalCondition()
    condition.employeeId = fixture.employee.employeeId
    condition.medicalConditionTypeId = type.medicalConditionTypeId
    condition.employeeMedicalConditionDiagnosis = 'Diagnóstico de fixture'
    condition.employeeMedicalConditionNotes = 'Notas de fixture'
    condition.employeeMedicalConditionActive = 1
    await condition.save()

    const value = new MedicalConditionTypePropertyValue()
    value.medicalConditionTypePropertyId = property.medicalConditionTypePropertyId
    value.employeeMedicalConditionId = condition.employeeMedicalConditionId
    value.medicalConditionTypePropertyValue = 'O+'
    value.medicalConditionTypePropertyValueActive = 1
    await value.save()

    return {
      typeId: type.medicalConditionTypeId,
      propertyId: property.medicalConditionTypePropertyId,
      employeeMedicalConditionId: condition.employeeMedicalConditionId,
      valueId: value.medicalConditionTypePropertyValueId,
    }
  })
}

/** Borrado físico de todo lo médico de esas empresas, hijos antes que padres. */
async function purgeMedicalCatalog(businessUnitIds: number[]): Promise<void> {
  await db.from('medical_condition_type_property_values').whereIn('business_unit_id', businessUnitIds).delete()
  await db.from('employee_medical_conditions').whereIn('business_unit_id', businessUnitIds).delete()
  await db.from('medical_condition_type_properties').whereIn('business_unit_id', businessUnitIds).delete()
  await db.from('medical_condition_types').whereIn('business_unit_id', businessUnitIds).delete()
}

const readCalls = (fixture: CatalogFixture): ApiCall[] => [
  { label: 'lista de tipos', method: 'get', url: '/api/medical-condition-types' },
  { label: 'detalle de tipo', method: 'get', url: `/api/medical-condition-types/${fixture.typeId}` },
  { label: 'lista de propiedades', method: 'get', url: '/api/medical-condition-type-properties' },
  {
    label: 'propiedades por tipo',
    method: 'get',
    url: `/api/medical-condition-type-properties/type/${fixture.typeId}`,
  },
  {
    label: 'detalle de propiedad',
    method: 'get',
    url: `/api/medical-condition-type-properties/${fixture.propertyId}`,
  },
]

const writeCalls = (fixture: CatalogFixture): ApiCall[] => [
  {
    label: 'alta de tipo',
    method: 'post',
    url: '/api/medical-condition-types',
    body: {
      medicalConditionTypeName: uniqueTestName('Tipo por API').slice(0, 100),
      medicalConditionTypeDescription: 'alta por gate',
      medicalConditionTypeActive: 1,
    },
  },
  {
    label: 'edición de tipo',
    method: 'put',
    url: `/api/medical-condition-types/${fixture.typeId}`,
    body: { medicalConditionTypeName: uniqueTestName('Tipo editado').slice(0, 100) },
  },
  {
    label: 'alta de propiedad',
    method: 'post',
    url: '/api/medical-condition-type-properties',
    body: {
      medicalConditionTypePropertyName: 'Alergias',
      medicalConditionTypePropertyDataType: 'text',
      medicalConditionTypeId: fixture.typeId,
    },
  },
  {
    label: 'edición de propiedad',
    method: 'put',
    url: `/api/medical-condition-type-properties/${fixture.propertyId}`,
    body: { medicalConditionTypePropertyName: 'Alergias conocidas' },
  },
  {
    label: 'alta de valor',
    method: 'post',
    url: '/api/medical-condition-type-property-values',
    body: {
      medicalConditionTypePropertyId: fixture.propertyId,
      employeeMedicalConditionId: fixture.employeeMedicalConditionId,
      medicalConditionTypePropertyValue: 'A+',
    },
  },
  {
    label: 'edición de valor',
    method: 'put',
    url: `/api/medical-condition-type-property-values/${fixture.valueId}`,
    body: { medicalConditionTypePropertyValue: 'B+' },
  },
]

/** Hijos antes que padres: así cada baja encuentra su fila viva. */
const deleteCalls = (fixture: CatalogFixture): ApiCall[] => [
  {
    label: 'baja de valor',
    method: 'delete',
    url: `/api/medical-condition-type-property-values/${fixture.valueId}`,
  },
  {
    label: 'baja de propiedad',
    method: 'delete',
    url: `/api/medical-condition-type-properties/${fixture.propertyId}`,
  },
  { label: 'baja de tipo', method: 'delete', url: `/api/medical-condition-types/${fixture.typeId}` },
]

function send(client: ApiClient, actor: TenantActor, call: ApiCall) {
  const request = client[call.method](call.url).loginAs(actor.user).headers(businessUnitHeaders(actor))
  return call.body ? request.json(call.body) : request
}

function assertDenied(assert: Assert, response: ApiResponse, label: string): void {
  assert.equal(response.status(), 403, `${label}: ${JSON.stringify(response.body())}`)
  assertPermissionDenied(assert, response)
}

async function assertDeniedAll(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  calls: readonly ApiCall[]
): Promise<void> {
  for (const call of calls) {
    assertDenied(assert, await send(client, actor, call), call.label)
  }
}

async function assertSucceedsAll(
  assert: Assert,
  client: ApiClient,
  actor: TenantActor,
  calls: readonly ApiCall[]
): Promise<void> {
  for (const call of calls) {
    const response = await send(client, actor, call)
    assert.oneOf(response.status(), [200, 201], `${call.label}: ${JSON.stringify(response.body())}`)
  }
}

test.group('Condición médica — catálogo de tipos, propiedades y valores con permissionGate', (group) => {
  let previousEnforcement = true
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  let employee: EmployeeFixture | null = null
  let catalog: CatalogFixture | null = null

  group.setup(async () => {
    // Otros specs de Empleados apagan la exigencia y no la restauran.
    previousEnforcement = await setModuleEnforcement(MODULE, true)
    actor = await createTenantActor('condicion-medica-catalogo')
    owner = await createBypassActor('owner', 'condicion-medica-catalogo-owner')
    employee = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'condicion-medica')
  })

  group.teardown(async () => {
    const businessUnitIds = [actor, owner]
      .filter((account): account is TenantActor => account !== null)
      .map((account) => account.businessUnit.businessUnitId)
    await purgeMedicalCatalog(businessUnitIds)
    await cleanupEmployeeFixture(employee)
    await cleanupTenantActor(actor)
    await cleanupTenantActor(owner)
    await setModuleEnforcement(MODULE, previousEnforcement)
  })

  group.each.setup(async () => {
    catalog = await createCatalogFixture(required(actor, 'el actor'), required(employee, 'el colaborador'))
  })

  group.each.teardown(async () => {
    await purgeMedicalCatalog([required(actor, 'el actor').businessUnit.businessUnitId])
    catalog = null
  })

  test('sin concesiones: lecturas, altas, ediciones y bajas responden PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const fixture = required(catalog, 'el catálogo')
    await grantModulePermissions(tenant, MODULE, [])

    await assertDeniedAll(assert, client, tenant, [
      ...readCalls(fixture),
      ...writeCalls(fixture),
      ...deleteCalls(fixture),
    ])
  })

  test('-read abre las cinco lecturas y ninguna alta, edición ni baja', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const fixture = required(catalog, 'el catálogo')
    await grantModulePermissions(tenant, MODULE, [READ])

    await assertSucceedsAll(assert, client, tenant, readCalls(fixture))

    const list = await send(client, tenant, readCalls(fixture)[0])
    const ids = (list.body().data as { medicalConditionTypeId: number }[]).map(
      (row) => row.medicalConditionTypeId
    )
    assert.include(ids, fixture.typeId)

    await assertDeniedAll(assert, client, tenant, [...writeCalls(fixture), ...deleteCalls(fixture)])
  })

  test('-write abre altas y ediciones de tipos, propiedades y valores; no lecturas ni bajas', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const fixture = required(catalog, 'el catálogo')
    await grantModulePermissions(tenant, MODULE, [WRITE])

    await assertSucceedsAll(assert, client, tenant, writeCalls(fixture))
    await assertDeniedAll(assert, client, tenant, [...readCalls(fixture), ...deleteCalls(fixture)])
  })

  test('-delete abre las bajas de valor, propiedad y tipo; no altas ni ediciones', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const fixture = required(catalog, 'el catálogo')
    await grantModulePermissions(tenant, MODULE, [DELETE])

    await assertDeniedAll(assert, client, tenant, writeCalls(fixture))
    await assertSucceedsAll(assert, client, tenant, deleteCalls(fixture))

    const deletedType = await db
      .from('medical_condition_types')
      .where('medical_condition_type_id', fixture.typeId)
      .first()
    assert.isNotNull(deletedType?.medical_condition_type_deleted_at, 'el tipo debe quedar dado de baja')
  })

  test('-write no alcanza para borrar: la baja de tipo sigue pidiendo -delete', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const fixture = required(catalog, 'el catálogo')
    await grantModulePermissions(tenant, MODULE, [READ, WRITE])

    await assertDeniedAll(assert, client, tenant, deleteCalls(fixture))
  })

  test('owner pasa el gate sin concesiones (bypass standard)', async ({ client, assert }) => {
    const account = required(owner, 'el owner')

    const list = await send(client, account, {
      label: 'lista de tipos',
      method: 'get',
      url: '/api/medical-condition-types',
    })
    assertPassesGate(assert, list)
    list.assertStatus(200)

    const created = await send(client, account, {
      label: 'alta de tipo',
      method: 'post',
      url: '/api/medical-condition-types',
      body: { medicalConditionTypeName: uniqueTestName('Tipo owner').slice(0, 100) },
    })
    assertPassesGate(assert, created)
    created.assertStatus(201)
  })
})
