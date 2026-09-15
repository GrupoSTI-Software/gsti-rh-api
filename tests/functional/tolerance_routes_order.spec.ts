import { test } from '@japa/runner'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Orden de registro de las lecturas de `/api/tolerances`.
 *
 * Un parámetro de ruta acepta cualquier segmento: mientras `/:systemSettingId`
 * se registró antes que `/get-tardiness-tolerance`, la petición del Monitor de
 * asistencia la atendía `index` con `systemSettingId = "get-tardiness-tolerance"`
 * y respondía el listado vacío de una empresa que no existe. El Monitor no lo
 * notaba porque su repositorio cae a 3 minutos cuando no encuentra la tolerancia,
 * así que el defecto solo se ve en la FORMA de la respuesta.
 *
 * Por eso los casos afirman la forma y no el valor: `index` responde
 * `data` como arreglo y `getTardinessTolerance` como objeto con
 * `tardinessTolerance`. Es lo que distingue qué handler atendió la ruta, sin
 * depender de que la empresa de pruebas tenga tolerancias sembradas.
 */
const MISSING_SYSTEM_SETTING_ID = 2_147_483_637

test.group('tolerancias — la ruta literal gana a la paramétrica', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    actor = await createTenantActor('tolerance-routes-order')
  })

  group.teardown(async () => {
    await cleanupTenantActor(actor)
  })

  test('GET /get-tardiness-tolerance lo atiende getTardinessTolerance, no el listado', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')

    const response = await client
      .get('/api/tolerances/get-tardiness-tolerance')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(200)
    const body = response.body()
    assert.property(
      body.data,
      'tardinessTolerance',
      `debe responder getTardinessTolerance: ${JSON.stringify(body)}`
    )
    assert.notProperty(body, 'errors')
  })

  test('GET /:systemSettingId sigue atendido por el listado', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')

    const response = await client
      .get(`/api/tolerances/${MISSING_SYSTEM_SETTING_ID}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data, `debe responder el listado: ${JSON.stringify(body)}`)
  })
})
