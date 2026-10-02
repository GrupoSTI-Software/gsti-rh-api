import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import EmployeeMedicalCondition from '#models/employee_medical_condition'
import MedicalConditionType from '#models/medical_condition_type'
import MedicalConditionTypeProperty from '#models/medical_condition_type_property'
import MedicalConditionTypePropertyValue from '#models/medical_condition_type_property_value'
import { SENSITIVE_MASK } from '#helpers/sensitive_mask'
import { TenantContext } from '#utils/tenant_context'
import {
  businessUnitHeaders,
  cleanupTenantActor,
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
import { cleanupRevealLogs } from '../pii/pii_permission_gate_support.js'

/**
 * El valor capturado por propiedad de una condición médica (grupo sanguíneo,
 * alergeno, dosis) es dato de salud: se cifra, sale enmascarado, se revela con
 * bitácora y la edición de la condición lo actualiza por propiedad sin
 * pisarlo con la máscara que el BO recibió.
 */

const MODULE = 'employees'
const TAB_PERMISSIONS = ['tab-condicion-medica-read', 'tab-condicion-medica-write']
const HEALTH_READ = 'sensitive-salud-read'
const HEALTH_WRITE = 'sensitive-salud-write'
const BLOOD_GROUP = 'O+'
const ALLERGEN = 'Penicilina'

interface ConditionFixture {
  conditionId: number
  bloodPropertyId: number
  allergenPropertyId: number
  bloodValueId: number
}

async function createConditionFixture(
  actor: TenantActor,
  employee: EmployeeFixture
): Promise<ConditionFixture> {
  return TenantContext.run([actor.businessUnit.businessUnitId], async () => {
    const type = new MedicalConditionType()
    type.medicalConditionTypeName = uniqueTestName('Tipo sensible').slice(0, 100)
    type.medicalConditionTypeDescription = 'fixture valor sensible'
    type.medicalConditionTypeActive = 1
    await type.save()

    const newProperty = async (name: string) => {
      const property = new MedicalConditionTypeProperty()
      property.medicalConditionTypePropertyName = name
      property.medicalConditionTypePropertyDescription = 'fixture valor sensible'
      property.medicalConditionTypePropertyDataType = 'TEXT'
      property.medicalConditionTypePropertyRequired = 0
      property.medicalConditionTypeId = type.medicalConditionTypeId
      property.medicalConditionTypePropertyActive = 1
      await property.save()
      return property
    }
    const blood = await newProperty('Grupo')
    const allergen = await newProperty('Agente')

    const condition = new EmployeeMedicalCondition()
    condition.employeeId = employee.employee.employeeId
    condition.medicalConditionTypeId = type.medicalConditionTypeId
    condition.employeeMedicalConditionDiagnosis = 'Diagnóstico de fixture'
    condition.employeeMedicalConditionNotes = 'Notas de fixture'
    condition.employeeMedicalConditionActive = 1
    await condition.save()

    const value = new MedicalConditionTypePropertyValue()
    value.medicalConditionTypePropertyId = blood.medicalConditionTypePropertyId
    value.employeeMedicalConditionId = condition.employeeMedicalConditionId
    value.medicalConditionTypePropertyValue = BLOOD_GROUP
    value.medicalConditionTypePropertyValueActive = 1
    await value.save()

    return {
      conditionId: condition.employeeMedicalConditionId,
      bloodPropertyId: blood.medicalConditionTypePropertyId,
      allergenPropertyId: allergen.medicalConditionTypePropertyId,
      bloodValueId: value.medicalConditionTypePropertyValueId,
    }
  })
}

async function purgeMedical(businessUnitId: number): Promise<void> {
  await db.from('medical_condition_type_property_values').where('business_unit_id', businessUnitId).delete()
  await db.from('employee_medical_conditions').where('business_unit_id', businessUnitId).delete()
  await db.from('medical_condition_type_properties').where('business_unit_id', businessUnitId).delete()
  await db.from('medical_condition_types').where('business_unit_id', businessUnitId).delete()
}

/** Valores vivos de la condición, leídos por el modelo (descifrados). */
async function liveValues(conditionId: number): Promise<MedicalConditionTypePropertyValue[]> {
  return MedicalConditionTypePropertyValue.query()
    .where('employeeMedicalConditionId', conditionId)
    .orderBy('medicalConditionTypePropertyValueId')
}

function updateCondition(
  client: ApiClient,
  actor: TenantActor,
  conditionId: number,
  propertyValues: Array<Record<string, string | number | null>>
) {
  return client
    .put(`/api/employee-medical-conditions/${conditionId}`)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
    .json({ propertyValues })
}

test.group('Condición médica — valor de propiedad como dato de salud', (group) => {
  let previousEnforcement = true
  let actor: TenantActor | null = null
  let employee: EmployeeFixture | null = null
  let fixture: ConditionFixture | null = null

  group.setup(async () => {
    previousEnforcement = await setModuleEnforcement(MODULE, true)
    actor = await createTenantActor('condicion-medica-valor-sensible')
    employee = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'valor-sensible')
  })

  group.teardown(async () => {
    if (actor) {
      // El revelado deja bitácora con llave al colaborador: va antes de borrarlo.
      await cleanupRevealLogs({ businessUnitId: actor.businessUnit.businessUnitId })
      await purgeMedical(actor.businessUnit.businessUnitId)
    }
    await cleanupEmployeeFixture(employee)
    await cleanupTenantActor(actor)
    await setModuleEnforcement(MODULE, previousEnforcement)
  })

  group.each.setup(async () => {
    fixture = await createConditionFixture(required(actor, 'el actor'), required(employee, 'el colaborador'))
  })

  group.each.teardown(async () => {
    if (actor) await purgeMedical(actor.businessUnit.businessUnitId)
  })

  test('se guarda cifrado y la lista por colaborador lo devuelve enmascarado', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const condition = required(fixture, 'la condición')
    await grantModulePermissions(tenant, MODULE, [...TAB_PERMISSIONS, HEALTH_READ])

    const raw = await db
      .from('medical_condition_type_property_values')
      .where('medical_condition_type_property_value_id', condition.bloodValueId)
      .first()
    assert.notEqual(raw.medical_condition_type_property_value, BLOOD_GROUP)

    const response = await client
      .get(`/api/employee-medical-conditions/employee/${required(employee, 'el colaborador').employee.employeeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    response.assertStatus(200)
    const [listed] = response.body().data.employeeMedicalConditions
    assert.equal(listed.propertyValues[0].medicalConditionTypePropertyValue, SENSITIVE_MASK)
  })

  test('se revela en claro con salud-read y sin él responde 403', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const condition = required(fixture, 'la condición')
    const url = `/api/v1/pii/reveal/MedicalConditionTypePropertyValue/medicalConditionTypePropertyValue/${condition.bloodValueId}`

    await grantModulePermissions(tenant, MODULE, TAB_PERMISSIONS)
    const denied = await client.get(url).loginAs(tenant.user).headers(businessUnitHeaders(tenant))
    denied.assertStatus(403)

    await grantModulePermissions(tenant, MODULE, [...TAB_PERMISSIONS, HEALTH_READ])
    const revealed = await client.get(url).loginAs(tenant.user).headers(businessUnitHeaders(tenant))
    revealed.assertStatus(200)
    assert.equal(revealed.body().data.medicalConditionTypePropertyValue, BLOOD_GROUP)
  })

  test('null y el eco de la máscara conservan el valor y su id', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const condition = required(fixture, 'la condición')
    await grantModulePermissions(tenant, MODULE, [...TAB_PERMISSIONS, HEALTH_WRITE])

    for (const echoed of [null, SENSITIVE_MASK]) {
      const response = await updateCondition(client, tenant, condition.conditionId, [
        { medicalConditionTypePropertyId: condition.bloodPropertyId, medicalConditionTypePropertyValue: echoed },
      ])
      assert.equal(response.status(), 200, JSON.stringify(response.body()))
    }

    const values = await liveValues(condition.conditionId)
    assert.lengthOf(values, 1)
    assert.equal(values[0].medicalConditionTypePropertyValueId, condition.bloodValueId)
    assert.equal(values[0].medicalConditionTypePropertyValue, BLOOD_GROUP)
  })

  test('actualiza por propiedad, agrega la nueva y Active 0 borra', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const condition = required(fixture, 'la condición')
    await grantModulePermissions(tenant, MODULE, [...TAB_PERMISSIONS, HEALTH_WRITE])

    const upsert = await updateCondition(client, tenant, condition.conditionId, [
      { medicalConditionTypePropertyId: condition.bloodPropertyId, medicalConditionTypePropertyValue: 'A-' },
      { medicalConditionTypePropertyId: condition.allergenPropertyId, medicalConditionTypePropertyValue: ALLERGEN },
    ])
    assert.equal(upsert.status(), 200, JSON.stringify(upsert.body()))

    const afterUpsert = await liveValues(condition.conditionId)
    assert.deepEqual(
      afterUpsert.map((row) => [row.medicalConditionTypePropertyId, row.medicalConditionTypePropertyValue]),
      [
        [condition.bloodPropertyId, 'A-'],
        [condition.allergenPropertyId, ALLERGEN],
      ]
    )
    assert.equal(afterUpsert[0].medicalConditionTypePropertyValueId, condition.bloodValueId)

    const clear = await updateCondition(client, tenant, condition.conditionId, [
      {
        medicalConditionTypePropertyId: condition.bloodPropertyId,
        medicalConditionTypePropertyValue: null,
        medicalConditionTypePropertyValueActive: 0,
      },
    ])
    assert.equal(clear.status(), 200, JSON.stringify(clear.body()))

    const afterClear = await liveValues(condition.conditionId)
    assert.deepEqual(
      afterClear.map((row) => row.medicalConditionTypePropertyId),
      [condition.allergenPropertyId]
    )
  })

  test('sin salud-write la edición de un valor responde 403 y no guarda nada', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const condition = required(fixture, 'la condición')
    await grantModulePermissions(tenant, MODULE, TAB_PERMISSIONS)

    const response = await updateCondition(client, tenant, condition.conditionId, [
      { medicalConditionTypePropertyId: condition.bloodPropertyId, medicalConditionTypePropertyValue: 'B+' },
    ])
    assert.equal(response.status(), 403, JSON.stringify(response.body()))
    assert.equal(response.body().code, 'EMP.SENS.WRITE.FORBIDDEN')

    const values = await liveValues(condition.conditionId)
    assert.equal(values[0].medicalConditionTypePropertyValue, BLOOD_GROUP)
  })
})
