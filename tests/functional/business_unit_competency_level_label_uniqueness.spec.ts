import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Regla de etiqueta única por empresa en los niveles de competencia.
 *
 * `BusinessUnitCompetencyLevelService.verifyInfo` compara la etiqueta sin
 * distinguir mayúsculas. Lo hacía con `COLLATE utf8_general_ci`, que es alias de
 * `utf8mb3_general_ci`: sobre una columna utf8mb4 MySQL rechaza la consulta
 * entera con `ER_COLLATION_CHARSET_MISMATCH`, así que el alta y la edición de
 * niveles respondían 500 con cualquier permiso. Hoy no lleva COLLATE: la
 * columna es `utf8mb4_0900_ai_ci` y ya compara sin distinguir mayúsculas.
 * Estos casos fijan las dos mitades de la corrección: que la consulta CORRA
 * (201, no 500) y que siga comparando sin distinguir mayúsculas (400 ante el
 * duplicado, y por el duplicado y no por otra regla).
 *
 * El actor es `owner`: con bypass standard cruza el gate de `competencies` sin
 * concesiones y el caso queda hablando solo de la regla, no de permisos.
 */
const LEVELS_URL = '/api/business-unit-competency-levels'

test.group('niveles de competencia — etiqueta única por empresa', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    actor = await createBypassActor('owner', 'bucl-label-uniqueness')
  })

  group.teardown(async () => {
    if (actor) {
      await db
        .from('business_unit_competency_levels')
        .where('business_unit_id', actor.businessUnit.businessUnitId)
        .delete()
    }
    await cleanupTenantActor(actor)
  })

  test('el alta responde 201 y no 500: la comparación de etiqueta ya corre en utf8mb4', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')

    const response = await client
      .post(LEVELS_URL)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({
        businessUnitId: tenant.businessUnit.businessUnitId,
        businessUnitCompetencyLevelLabel: 'Inicial',
        businessUnitCompetencyLevelPosition: 1,
      })

    assert.equal(response.status(), 201, JSON.stringify(response.body()))
  })

  test('una etiqueta que solo cambia en mayúsculas se rechaza con 400, no con 500', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')

    const created = await client
      .post(LEVELS_URL)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({
        businessUnitId: tenant.businessUnit.businessUnitId,
        businessUnitCompetencyLevelLabel: 'Intermedio',
        businessUnitCompetencyLevelPosition: 2,
      })
    assert.equal(created.status(), 201, JSON.stringify(created.body()))

    const duplicated = await client
      .post(LEVELS_URL)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({
        businessUnitId: tenant.businessUnit.businessUnitId,
        businessUnitCompetencyLevelLabel: 'INTERMEDIO',
        businessUnitCompetencyLevelPosition: 3,
      })

    assert.equal(duplicated.status(), 400, JSON.stringify(duplicated.body()))
    assert.equal(duplicated.body()?.type, 'warning')
    // Las tres reglas 400 del flujo (empresa inexistente, etiqueta repetida y
    // tope de cinco niveles) responden el mismo par status/type: sin afirmar la
    // etiqueta en el título, el caso podría pasar por la razón equivocada.
    // El título repite la etiqueta ENVIADA, así que se compara en minúsculas.
    // Ni el tope de cinco niveles ni la empresa inexistente nombran la etiqueta:
    // basta con que aparezca para saber cuál de las tres reglas respondió.
    assert.include(
      (duplicated.body()?.title ?? '').toLowerCase(),
      'intermedio',
      `el 400 debe ser el del duplicado: ${JSON.stringify(duplicated.body())}`
    )

    const rows = await db
      .from('business_unit_competency_levels')
      .where('business_unit_id', tenant.businessUnit.businessUnitId)
      .whereNull('business_unit_competency_level_deleted_at')
      // Sin COLLATE, igual que el servicio: la columna ya es `utf8mb4_0900_ai_ci`.
      .where('business_unit_competency_level_label', 'intermedio')
      .count('* as total')
    assert.equal(Number(rows[0].total), 1, 'el duplicado no debe quedar guardado')
  })
})
