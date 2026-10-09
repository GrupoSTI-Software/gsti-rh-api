import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import { ASSET_ERROR_KEYS } from '#modules/assets/assets.constants'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  assertModuleEnforced,
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
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
