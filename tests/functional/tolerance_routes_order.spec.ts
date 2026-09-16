import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import SystemSetting from '#models/system_setting'
import Tolerance from '#models/tolerance'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Orden de registro de las lecturas de `/api/tolerances` y empresa de la que
 * sale la tolerancia de retardo.
 *
 * Un parámetro de ruta acepta cualquier segmento: mientras `/:systemSettingId`
 * se registró antes que `/get-tardiness-tolerance`, la petición del Monitor de
 * asistencia la atendía `index` con `systemSettingId = "get-tardiness-tolerance"`
 * y respondía el listado vacío de una empresa que no existe.
 *
 * Los casos afirman el VALOR y no solo la forma: la rama de "sin ficha
 * resuelta" devuelve exactamente el mismo `{ tardinessTolerance: null }` que la
 * rama buena, así que una aserción sobre la llave pasaba igual si el endpoint
 * no resolvía la empresa —o si resolvía la equivocada, que es justo el defecto
 * que tenía: `getActive()` sin scope devuelve la ficha BASE y el Monitor de
 * cualquier empresa veía la tolerancia de otra—.
 */
const MISSING_SYSTEM_SETTING_ID = 2_147_483_637

/** Minutos distintos de los 3 que siembra la ficha base (0020_tolerance_seeder). */
const TENANT_TARDINESS_MINUTES = 17

test.group('tolerancias — la ruta literal gana a la paramétrica', (group) => {
  let actor: TenantActor | null = null
  let setting: SystemSetting | null = null

  group.setup(async () => {
    actor = await createTenantActor('tolerance-routes-order')
    // Ficha propia de la empresa del actor, con su propia tolerancia de retardo:
    // sin ella el caso no distinguiría la ficha del tenant de la base.
    setting = await SystemSetting.create({
      businessUnitId: actor.businessUnit.businessUnitId,
      systemSettingTradeName: uniqueTestName('tolerance-routes-order'),
      systemSettingSidebarColor: '#111111',
      systemSettingActive: 1,
      systemSettingBusinessUnits: actor.businessUnit.businessUnitSlug,
      systemSettingMonthlyConversionFactor: 30.4,
    })
    await Tolerance.create({
      toleranceName: 'TardinessTolerance',
      toleranceMinutes: TENANT_TARDINESS_MINUTES,
      systemSettingId: setting.systemSettingId,
    })
  })

  group.teardown(async () => {
    if (setting) {
      await db.from('tolerances').where('system_setting_id', setting.systemSettingId).delete()
      await db.from('system_settings').where('system_setting_id', setting.systemSettingId).delete()
      setting = null
    }
    await cleanupTenantActor(actor)
  })

  test('GET /get-tardiness-tolerance entrega la tolerancia de la empresa que pide', async ({
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
    assert.isNotNull(
      body.data.tardinessTolerance,
      `debe resolver la ficha de la empresa del encabezado: ${JSON.stringify(body)}`
    )
    assert.equal(
      body.data.tardinessTolerance.toleranceMinutes,
      TENANT_TARDINESS_MINUTES,
      'debe ser la tolerancia de la empresa que pide, no la de la ficha base'
    )
    // El catch del controller responde con la clave `error`, no `errors`.
    assert.notProperty(body, 'error')
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
