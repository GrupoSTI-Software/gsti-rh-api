import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import AssessmentTemplate from '#models/assessment_template'
import AssessmentTemplateDimension from '#models/assessment_template_dimension'

/**
 * Tests funcionales — AssessmentTemplateDimensionController
 * Rutas: /api/assessment-template-dimensions
 *
 * Validaciones documentadas:
 *
 * GET / (index)
 *   - assessmentTemplateId: requerido, número positivo (query param)
 *   - search: opcional, string para filtrar por nombre
 *   - page: requerido, entero >= 1 (default 1)
 *   - limit: requerido, entero >= 1 (default 100)
 *
 * POST / (store)
 *   - assessmentTemplateId: requerido, número positivo
 *   - assessmentTemplateDimensionName: requerido, string, min 1 char, max 200 chars
 *   - assessmentTemplateDimensionAcronym: requerido, string, min 1 char, max 20 chars
 *
 * PUT /:assessmentTemplateDimensionId (update)
 *   - assessmentTemplateDimensionId: requerido, número positivo (path param)
 *   - assessmentTemplateDimensionName: requerido, string, min 1 char, max 200 chars
 *   - assessmentTemplateDimensionAcronym: requerido, string, min 1 char, max 20 chars
 *
 * DELETE /:assessmentTemplateDimensionId (delete)
 *   - assessmentTemplateDimensionId: requerido, número positivo (path param)
 *   - Realiza soft delete sobre la dimensión
 *
 * GET /:assessmentTemplateDimensionId (show)
 *   - assessmentTemplateDimensionId: requerido, número positivo (path param)
 */

let sharedTemplate: AssessmentTemplate

test.group('AssessmentTemplateDimension - Setup global', (group) => {
  group.setup(async () => {
    sharedTemplate = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Dimensiones Shared',
      assessmentTemplateDescription: null,
    })
  })

  group.teardown(async () => {
    await db
      .from('assessment_template_dimensions')
      .where('assessment_template_id', sharedTemplate.assessmentTemplateId)
      .delete()
    await db
      .from('assessment_templates')
      .where('assessment_template_id', sharedTemplate.assessmentTemplateId)
      .delete()
  })

  test('plantilla compartida fue creada correctamente', async ({ assert }) => {
    assert.exists(sharedTemplate.assessmentTemplateId)
  })
})

test.group('AssessmentTemplateDimension - index GET /', (group) => {
  let user: User
  let template: AssessmentTemplate

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Index Dims Test',
      assessmentTemplateDescription: null,
    })
  })

  group.teardown(async () => {
    await db
      .from('assessment_template_dimensions')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
    await db
      .from('assessment_templates')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
  })

  test('devuelve lista paginada de dimensiones por plantilla', async ({ client }) => {
    const response = await client
      .get('/api/assessment-template-dimensions')
      .loginAs(user)
      .qs({
        assessmentTemplateId: template.assessmentTemplateId,
        page: 1,
        limit: 10,
      })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('devuelve 400 si falta el assessmentTemplateId', async ({ client }) => {
    const response = await client
      .get('/api/assessment-template-dimensions')
      .loginAs(user)
      .qs({ page: 1, limit: 10 })

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 401 sin autenticación', async ({ client }) => {
    const response = await client
      .get('/api/assessment-template-dimensions')
      .qs({ assessmentTemplateId: template.assessmentTemplateId, page: 1, limit: 10 })

    response.assertStatus(401)
  })

  test('filtra por término de búsqueda', async ({ client }) => {
    const response = await client
      .get('/api/assessment-template-dimensions')
      .loginAs(user)
      .qs({
        assessmentTemplateId: template.assessmentTemplateId,
        search: 'cognitiva',
        page: 1,
        limit: 10,
      })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })
})

test.group('AssessmentTemplateDimension - store POST /', (group) => {
  let user: User
  let template: AssessmentTemplate
  const createdDimIds: number[] = []

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Store Dim Test',
      assessmentTemplateDescription: null,
    })
  })

  group.teardown(async () => {
    if (createdDimIds.length > 0) {
      await db
        .from('assessment_template_dimensions')
        .whereIn('assessment_template_dimension_id', createdDimIds)
        .delete()
    }
    await db
      .from('assessment_template_dimensions')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
    await db
      .from('assessment_templates')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
  })

  test('crea una nueva dimensión', async ({ client, assert }) => {
    const response = await client
      .post('/api/assessment-template-dimensions')
      .loginAs(user)
      .json({
        assessmentTemplateId: template.assessmentTemplateId,
        assessmentTemplateDimensionName: 'Dimensión Test Cognitiva',
        assessmentTemplateDimensionAcronym: 'DTC',
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    const dimId = body.data?.assessmentTemplateDimension?.assessmentTemplateDimensionId
    assert.exists(dimId)
    createdDimIds.push(dimId)
  })

  test('falla si falta el nombre de la dimensión', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/assessment-template-dimensions')
        .loginAs(user)
        .json({
          assessmentTemplateId: template.assessmentTemplateId,
          assessmentTemplateDimensionAcronym: 'DTC',
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('falla si falta el acrónimo', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/assessment-template-dimensions')
        .loginAs(user)
        .json({
          assessmentTemplateId: template.assessmentTemplateId,
          assessmentTemplateDimensionName: 'Dimensión Sin Acrónimo',
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('falla si falta el assessmentTemplateId', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/assessment-template-dimensions')
        .loginAs(user)
        .json({
          assessmentTemplateDimensionName: 'Dimensión Sin Plantilla',
          assessmentTemplateDimensionAcronym: 'DSP',
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('falla si el acrónimo supera 20 caracteres', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/assessment-template-dimensions')
        .loginAs(user)
        .json({
          assessmentTemplateId: template.assessmentTemplateId,
          assessmentTemplateDimensionName: 'Dimensión Acrónimo Largo',
          assessmentTemplateDimensionAcronym: 'A'.repeat(21),
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })
})

test.group('AssessmentTemplateDimension - show GET /:id', (group) => {
  let user: User
  let template: AssessmentTemplate
  let dimension: AssessmentTemplateDimension

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Show Dim Test',
      assessmentTemplateDescription: null,
    })
    dimension = await AssessmentTemplateDimension.create({
      assessmentTemplateId: template.assessmentTemplateId,
      assessmentTemplateDimensionName: 'Dimensión Show Test',
      assessmentTemplateDimensionAcronym: 'DST',
    })
  })

  group.teardown(async () => {
    await db
      .from('assessment_template_dimensions')
      .where('assessment_template_dimension_id', dimension.assessmentTemplateDimensionId)
      .delete()
    await db
      .from('assessment_templates')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
  })

  test('devuelve la dimensión por ID', async ({ client, assert }) => {
    const response = await client
      .get(
        `/api/assessment-template-dimensions/${dimension.assessmentTemplateDimensionId}`
      )
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.assessmentTemplateDimension?.assessmentTemplateDimensionId,
      dimension.assessmentTemplateDimensionId
    )
  })

  test('devuelve 404 si la dimensión no existe', async ({ client }) => {
    const response = await client
      .get('/api/assessment-template-dimensions/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .get('/api/assessment-template-dimensions/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})

test.group('AssessmentTemplateDimension - update PUT /:id', (group) => {
  let user: User
  let template: AssessmentTemplate
  let dimension: AssessmentTemplateDimension

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Update Dim Test',
      assessmentTemplateDescription: null,
    })
    dimension = await AssessmentTemplateDimension.create({
      assessmentTemplateId: template.assessmentTemplateId,
      assessmentTemplateDimensionName: 'Dimensión Update Original',
      assessmentTemplateDimensionAcronym: 'DUO',
    })
  })

  group.teardown(async () => {
    await db
      .from('assessment_template_dimensions')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
    await db
      .from('assessment_templates')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
  })

  test('actualiza nombre y acrónimo de una dimensión', async ({ client, assert }) => {
    const response = await client
      .put(
        `/api/assessment-template-dimensions/${dimension.assessmentTemplateDimensionId}`
      )
      .loginAs(user)
      .json({
        assessmentTemplateDimensionName: 'Dimensión Update Modificada',
        assessmentTemplateDimensionAcronym: 'DUM',
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.assessmentTemplateDimension?.assessmentTemplateDimensionName,
      'Dimensión Update Modificada'
    )
    assert.equal(
      body.data?.assessmentTemplateDimension?.assessmentTemplateDimensionAcronym,
      'DUM'
    )
  })

  test('devuelve 404 si la dimensión no existe', async ({ client }) => {
    const response = await client
      .put('/api/assessment-template-dimensions/999999999')
      .loginAs(user)
      .json({
        assessmentTemplateDimensionName: 'No existe',
        assessmentTemplateDimensionAcronym: 'NE',
      })

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .put('/api/assessment-template-dimensions/abc')
      .loginAs(user)
      .json({
        assessmentTemplateDimensionName: 'Test',
        assessmentTemplateDimensionAcronym: 'T',
      })

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })

  test('falla si el nombre de la dimensión está vacío', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .put(
          `/api/assessment-template-dimensions/${dimension.assessmentTemplateDimensionId}`
        )
        .loginAs(user)
        .json({
          assessmentTemplateDimensionName: '',
          assessmentTemplateDimensionAcronym: 'DT',
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })
})

test.group('AssessmentTemplateDimension - delete DELETE /:id', (group) => {
  let user: User
  let template: AssessmentTemplate

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Delete Dim Test',
      assessmentTemplateDescription: null,
    })
  })

  group.teardown(async () => {
    await db
      .from('assessment_template_dimensions')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
    await db
      .from('assessment_templates')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
  })

  test('elimina (soft delete) una dimensión', async ({ client }) => {
    const dimension = await AssessmentTemplateDimension.create({
      assessmentTemplateId: template.assessmentTemplateId,
      assessmentTemplateDimensionName: 'Dimensión a Eliminar',
      assessmentTemplateDimensionAcronym: 'DAE',
    })

    const response = await client
      .delete(
        `/api/assessment-template-dimensions/${dimension.assessmentTemplateDimensionId}`
      )
      .loginAs(user)

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    // Verificar que ya no es accesible
    const showResponse = await client
      .get(
        `/api/assessment-template-dimensions/${dimension.assessmentTemplateDimensionId}`
      )
      .loginAs(user)

    showResponse.assertStatus(404)
  })

  test('devuelve 404 si la dimensión no existe', async ({ client }) => {
    const response = await client
      .delete('/api/assessment-template-dimensions/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .delete('/api/assessment-template-dimensions/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})
