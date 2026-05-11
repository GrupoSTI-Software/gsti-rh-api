import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import AssessmentTemplate from '#models/assessment_template'

/**
 * Tests funcionales — AssessmentTemplateController
 * Rutas: /api/assessment-templates
 *
 * Validaciones documentadas:
 *
 * POST / (store)
 *   - assessmentTemplateName: requerido, string, min 1 char, max 200 chars
 *   - assessmentTemplateDescription: opcional, string, max 2000 chars
 *   - dimensions[].assessmentTemplateDimensionName: requerido, string, min 1, max 200
 *   - dimensions[].assessmentTemplateDimensionAcronym: requerido, string, min 1, max 20
 *
 * PUT /:assessmentTemplateId (update)
 *   - assessmentTemplateId: requerido, número positivo (path param)
 *   - assessmentTemplateName: requerido, string, min 1 char, max 200 chars
 *   - assessmentTemplateDescription: opcional, string, max 2000 chars
 *   - dimensions[].assessmentTemplateDimensionId: opcional, número positivo (para actualizar existente)
 *   - dimensions[].assessmentTemplateDimensionName: requerido, string, min 1, max 200
 *   - dimensions[].assessmentTemplateDimensionAcronym: requerido, string, min 1, max 20
 *
 * DELETE /:assessmentTemplateId (delete)
 *   - assessmentTemplateId: requerido, número positivo (path param)
 *   - Realiza soft delete sobre la plantilla y sus dimensiones activas
 *
 * GET /:assessmentTemplateId (show)
 *   - assessmentTemplateId: requerido, número positivo (path param)
 *
 * GET / (index)
 *   - search: opcional, string para filtrar por nombre
 *   - page: requerido, entero >= 1 (default 1)
 *   - limit: requerido, entero >= 1 (default 100)
 */

test.group('AssessmentTemplate - index GET /', (group) => {
  let user: User

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
  })

  test('devuelve lista paginada de plantillas', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates')
      .loginAs(user)
      .qs({ page: 1, limit: 10 })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('filtra por término de búsqueda', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates')
      .loginAs(user)
      .qs({ search: 'psicometrica', page: 1, limit: 10 })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('devuelve 401 si no hay token de autenticación', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates')
      .qs({ page: 1, limit: 10 })

    response.assertStatus(401)
  })

  test('usa valores por defecto si page/limit son inválidos', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates')
      .loginAs(user)
      .qs({ page: -1, limit: 0 })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })
})

test.group('AssessmentTemplate - store POST /', (group) => {
  let user: User
  const createdIds: number[] = []

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
  })

  group.teardown(async () => {
    if (createdIds.length > 0) {
      await db.from('assessment_template_dimensions')
        .whereIn(
          'assessment_template_id',
          db.from('assessment_templates')
            .whereIn('assessment_template_id', createdIds)
            .select('assessment_template_id')
        )
        .delete()
      await db.from('assessment_templates')
        .whereIn('assessment_template_id', createdIds)
        .delete()
    }
  })

  test('crea una plantilla sin dimensiones', async ({ client, assert }) => {
    const response = await client
      .post('/api/assessment-templates')
      .loginAs(user)
      .json({
        assessmentTemplateName: 'Plantilla Test Sin Dimensiones',
        assessmentTemplateDescription: 'Descripción de prueba',
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    const templateId = body.data?.assessmentTemplate?.assessmentTemplateId
    assert.exists(templateId)
    createdIds.push(templateId)
  })

  test('crea una plantilla con dimensiones', async ({ client, assert }) => {
    const response = await client
      .post('/api/assessment-templates')
      .loginAs(user)
      .json({
        assessmentTemplateName: 'Plantilla Test Con Dimensiones',
        dimensions: [
          {
            assessmentTemplateDimensionName: 'Dimensión Cognitiva',
            assessmentTemplateDimensionAcronym: 'COG',
          },
          {
            assessmentTemplateDimensionName: 'Dimensión Emocional',
            assessmentTemplateDimensionAcronym: 'EMO',
          },
        ],
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    const template = body.data?.assessmentTemplate
    assert.exists(template?.assessmentTemplateId)
    assert.equal(template?.dimensions?.length, 2)
    createdIds.push(template.assessmentTemplateId)
  })

  test('falla con error de validación si falta el nombre', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/assessment-templates')
        .loginAs(user)
        .json({
          assessmentTemplateDescription: 'Sin nombre',
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('falla si el nombre supera 200 caracteres', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/assessment-templates')
        .loginAs(user)
        .json({
          assessmentTemplateName: 'A'.repeat(201),
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('falla si el acrónimo de dimensión supera 20 caracteres', async ({
    client,
    assert,
  }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/assessment-templates')
        .loginAs(user)
        .json({
          assessmentTemplateName: 'Plantilla Test Acrónim',
          dimensions: [
            {
              assessmentTemplateDimensionName: 'Dimensión Larga',
              assessmentTemplateDimensionAcronym: 'A'.repeat(21),
            },
          ],
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })
})

test.group('AssessmentTemplate - show GET /:id', (group) => {
  let user: User
  let template: AssessmentTemplate

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Test Show',
      assessmentTemplateDescription: null,
    })
  })

  group.teardown(async () => {
    await db
      .from('assessment_templates')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
  })

  test('devuelve la plantilla por ID', async ({ client, assert }) => {
    const response = await client
      .get(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.assessmentTemplate?.assessmentTemplateId,
      template.assessmentTemplateId
    )
  })

  test('devuelve 404 si la plantilla no existe', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido (NaN)', async ({ client }) => {
    const response = await client
      .get('/api/assessment-templates/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})

test.group('AssessmentTemplate - update PUT /:id', (group) => {
  let user: User
  let template: AssessmentTemplate

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Test Update Original',
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

  test('actualiza el nombre de una plantilla', async ({ client, assert }) => {
    const response = await client
      .put(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)
      .json({
        assessmentTemplateName: 'Plantilla Test Update Modificada',
        assessmentTemplateDescription: 'Descripción actualizada',
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.assessmentTemplate?.assessmentTemplateName,
      'Plantilla Test Update Modificada'
    )
  })

  test('sincroniza dimensiones al actualizar: agrega nuevas', async ({ client, assert }) => {
    const response = await client
      .put(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)
      .json({
        assessmentTemplateName: 'Plantilla Test Update Con Dims',
        dimensions: [
          {
            assessmentTemplateDimensionName: 'Nueva Dimensión',
            assessmentTemplateDimensionAcronym: 'ND',
          },
        ],
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.isAtLeast(body.data?.assessmentTemplate?.dimensions?.length, 1)
  })

  test('devuelve 404 si la plantilla no existe', async ({ client }) => {
    const response = await client
      .put('/api/assessment-templates/999999999')
      .loginAs(user)
      .json({ assessmentTemplateName: 'No existe' })

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .put('/api/assessment-templates/abc')
      .loginAs(user)
      .json({ assessmentTemplateName: 'Test' })

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })

  test('falla si el nombre es vacío', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .put(`/api/assessment-templates/${template.assessmentTemplateId}`)
        .loginAs(user)
        .json({ assessmentTemplateName: '' })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })
})

test.group('AssessmentTemplate - delete DELETE /:id', (group) => {
  let user: User

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
  })

  test('elimina (soft delete) una plantilla y sus dimensiones', async ({ client }) => {
    const template = await AssessmentTemplate.create({
      assessmentTemplateName: 'Plantilla Test Delete',
      assessmentTemplateDescription: null,
    })

    const response = await client
      .delete(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    // Verificar que ya no es visible por la API (soft deleted)
    const showResponse = await client
      .get(`/api/assessment-templates/${template.assessmentTemplateId}`)
      .loginAs(user)

    showResponse.assertStatus(404)

    // Limpieza: eliminar el registro soft-deleted
    await db
      .from('assessment_templates')
      .where('assessment_template_id', template.assessmentTemplateId)
      .delete()
  })

  test('devuelve 404 si la plantilla no existe', async ({ client }) => {
    const response = await client
      .delete('/api/assessment-templates/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .delete('/api/assessment-templates/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})
