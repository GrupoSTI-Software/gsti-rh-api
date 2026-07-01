import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import BusinessAccessScopeService from '#services/business_access_scope_service'
import {
  ATTENTION_PROGRAM_REGULATION_CODE,
  ATTENTION_PROGRAM_REGULATION_VERSION,
} from '#constants/attention_program'

type ScopedContext = {
  user: User
  businessUnitId: number
}

type ProgramSeed = {
  attentionProgramId: number
  regulationId: number
}

async function getScopedUser(): Promise<ScopedContext> {
  const user = await User.query()
    .whereNull('user_deleted_at')
    .whereHas('role', (roleQuery) => {
      roleQuery.where('role_slug', 'root')
    })
    .preload('role')
    .firstOrFail()

  const scopeIds = await new BusinessAccessScopeService().getAccessibleIds(user)
  if (scopeIds.length === 0) {
    throw new Error(
      'Se requiere al menos una business unit accesible para ejecutar attention_program_actions.spec'
    )
  }

  return { user, businessUnitId: scopeIds[0] }
}

async function getNom035RegulationId(): Promise<number> {
  const row = await db
    .from('regulations')
    .where('regulation_code', ATTENTION_PROGRAM_REGULATION_CODE)
    .where('regulation_version', ATTENTION_PROGRAM_REGULATION_VERSION)
    .whereNull('deleted_at')
    .select('regulation_id')
    .first()

  if (!row?.regulation_id) {
    throw new Error('No se encontró la regulación NOM-035 para los tests de acciones')
  }

  return Number(row.regulation_id)
}

async function createProgram(businessUnitId: number, status: 'borrador' | 'cerrado'): Promise<ProgramSeed> {
  const regulationId = await getNom035RegulationId()
  const now = DateTime.utc().toSQL({ includeOffset: false })!

  const [attentionProgramId] = await db.table('attention_programs').insert({
    business_unit_id: businessUnitId,
    regulation_id: regulationId,
    questionnaire_application_id: null,
    attention_program_year: 2032,
    attention_program_period: 'Periodo test acciones',
    attention_program_status: status,
    attention_program_created_at: now,
    attention_program_updated_at: now,
    attention_program_deleted_at: null,
  })

  return {
    attentionProgramId: Number(attentionProgramId),
    regulationId,
  }
}

async function getCatalogIds(regulationId: number): Promise<{
  psychosocialDimensionId: number
  attentionActionLevelId: number
}> {
  const dimension = await db
    .from('psychosocial_dimensions')
    .where('regulation_id', regulationId)
    .whereNull('psychosocial_dimension_deleted_at')
    .orderBy('psychosocial_dimension_ord', 'asc')
    .select('psychosocial_dimension_id')
    .first()

  const level = await db
    .from('attention_action_levels')
    .where('regulation_id', regulationId)
    .whereNull('attention_action_level_deleted_at')
    .orderBy('attention_action_level_order', 'asc')
    .select('attention_action_level_id')
    .first()

  if (!dimension?.psychosocial_dimension_id || !level?.attention_action_level_id) {
    throw new Error('No se encontraron catálogos NOM-035 para pruebas de acciones')
  }

  return {
    psychosocialDimensionId: Number(dimension.psychosocial_dimension_id),
    attentionActionLevelId: Number(level.attention_action_level_id),
  }
}

test.group('NOM035 Attention Program Actions', () => {
  test('responde 401 sin autenticación', async ({ client }) => {
    const response = await client.get('/api/nom035/attention-programs/1/actions')
    response.assertStatus(401)
  })

  test('responde 422 cuando la acción está incompleta', async ({ client }) => {
    const ctx = await getScopedUser()
    const program = await createProgram(ctx.businessUnitId, 'borrador')

    const response = await client
      .post(`/api/nom035/attention-programs/${program.attentionProgramId}/actions`)
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))
      .json({})

    response.assertStatus(422)
    response.assertBodyContains({
      type: 'error',
      key: 'accion-incompleta',
      code: 'NOM035.PRG.ACTION_INCOMPLETE',
    })
  })

  test('responde 422 cuando la dimensión está fuera de catálogo', async ({ client }) => {
    const ctx = await getScopedUser()
    const program = await createProgram(ctx.businessUnitId, 'borrador')
    const catalog = await getCatalogIds(program.regulationId)

    const response = await client
      .post(`/api/nom035/attention-programs/${program.attentionProgramId}/actions`)
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))
      .json({
        psychosocialDimensionId: 999999999,
        attentionActionLevelId: catalog.attentionActionLevelId,
        target: 'Personal administrativo',
        description: 'Implementar pausas activas semanales',
        startDate: '2032-01-10',
        endDate: '2032-02-10',
        progress: 'Seguimiento quincenal en comité',
        evaluation: 'Encuesta de percepción al cierre',
        responsible: 'Coordinación de RH',
      })

    response.assertStatus(422)
    response.assertBodyContains({
      type: 'error',
      key: 'dimension-invalida',
      code: 'NOM035.PRG.INVALID_DIMENSION',
    })
  })

  test('responde 409 cuando el programa está cerrado', async ({ client }) => {
    const ctx = await getScopedUser()
    const program = await createProgram(ctx.businessUnitId, 'cerrado')
    const catalog = await getCatalogIds(program.regulationId)

    const response = await client
      .post(`/api/nom035/attention-programs/${program.attentionProgramId}/actions`)
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))
      .json({
        psychosocialDimensionId: catalog.psychosocialDimensionId,
        attentionActionLevelId: catalog.attentionActionLevelId,
        target: 'Personal operativo',
        description: 'Taller de manejo de carga mental',
        startDate: '2032-03-01',
        endDate: '2032-03-30',
        progress: 'Sesiones semanales con evidencia',
        evaluation: 'Medición pre y post taller',
        responsible: 'Área de Cumplimiento',
      })

    response.assertStatus(409)
    response.assertBodyContains({
      type: 'error',
      key: 'programa-cerrado',
      code: 'NOM035.PRG.PROGRAM_CLOSED',
    })
  })

  test('permite crear, actualizar, listar y eliminar una acción', async ({ client, assert }) => {
    const ctx = await getScopedUser()
    const program = await createProgram(ctx.businessUnitId, 'borrador')
    const catalog = await getCatalogIds(program.regulationId)

    const createResponse = await client
      .post(`/api/nom035/attention-programs/${program.attentionProgramId}/actions`)
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))
      .json({
        psychosocialDimensionId: catalog.psychosocialDimensionId,
        attentionActionLevelId: catalog.attentionActionLevelId,
        target: 'Supervisión y mandos medios',
        description: 'Sesiones de sensibilización sobre liderazgo',
        startDate: '2032-04-01',
        endDate: '2032-04-20',
        progress: 'Bitácora de asistencia y acuerdos',
        evaluation: 'Encuesta de clima posterior',
        responsible: 'Gerencia de RH',
      })

    createResponse.assertStatus(201)
    const created = createResponse.body().data.attentionProgramAction
    assert.exists(created.attentionProgramActionId)
    assert.equal(created.status, 'pendiente')

    const patchResponse = await client
      .patch(
        `/api/nom035/attention-programs/${program.attentionProgramId}/actions/${created.attentionProgramActionId}`
      )
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))
      .json({
        status: 'en-curso',
        progress: 'Ejecución de sesiones en semana 2',
      })

    patchResponse.assertStatus(200)
    patchResponse.assertBodyContains({
      data: {
        attentionProgramAction: {
          status: 'en-curso',
        },
      },
    })

    const listResponse = await client
      .get(`/api/nom035/attention-programs/${program.attentionProgramId}/actions`)
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    listResponse.assertStatus(200)
    assert.isArray(listResponse.body().data.attentionProgramActions)
    assert.isAtLeast(listResponse.body().data.attentionProgramActions.length, 1)

    const deleteResponse = await client
      .delete(
        `/api/nom035/attention-programs/${program.attentionProgramId}/actions/${created.attentionProgramActionId}`
      )
      .loginAs(ctx.user)
      .header('X-Business-Unit-Id', String(ctx.businessUnitId))

    deleteResponse.assertStatus(200)
    deleteResponse.assertBodyContains({
      data: {
        attentionProgramAction: {
          deleted: true,
        },
      },
    })
  })
})
