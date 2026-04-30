import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Position from '#models/position'
import AssessmentTemplate from '#models/assessment_template'
import AssessmentTemplateDimension from '#models/assessment_template_dimension'
import PositionAssessmentProfile from '#models/position_assessment_profile'

/**
 * Tests funcionales — PositionAssessmentProfileController
 * Rutas: /api/position-assessment-profiles
 *
 * Validaciones documentadas:
 *
 * GET / (index)
 *   - positionId: opcional, número entero positivo (query param)
 *   - assessmentTemplateDimensionId: opcional, número entero positivo (query param)
 *   - assessmentTemplateId: opcional, número entero positivo (query param)
 *     filtra a través de la relación dimension → template
 *   - page: requerido, entero >= 1 (default 1)
 *   - limit: requerido, entero >= 1 (default 100)
 *
 * POST / (store)
 *   - positionId: requerido, número entero positivo
 *   - assessmentTemplateDimensionId: requerido, número entero positivo
 *   - positionAssessmentProfileMinimumValue: requerido, número >= 0
 *   - positionAssessmentProfileMaximumValue: requerido, número >= 0
 *
 * PUT /:positionAssessmentProfileId (update)
 *   - positionAssessmentProfileId: requerido, número positivo (path param)
 *   - positionAssessmentProfileMinimumValue: requerido, número >= 0
 *   - positionAssessmentProfileMaximumValue: requerido, número >= 0
 *
 * DELETE /:positionAssessmentProfileId (delete)
 *   - positionAssessmentProfileId: requerido, número positivo (path param)
 *   - Realiza soft delete sobre el perfil.
 *
 * GET /:positionAssessmentProfileId (show)
 *   - positionAssessmentProfileId: requerido, número positivo (path param)
 */

/**
 * Crea un set completo de prueba: una plantilla con una dimensión.
 * El puesto se obtiene de la base existente (firstOrFail) para evitar
 * tener que crear toda la jerarquía dependiente de business_unit.
 */
async function createTestFixture(suffix: string) {
  const template = await AssessmentTemplate.create({
    assessmentTemplateName: `PAP Plantilla ${suffix}`,
    assessmentTemplateDescription: null,
  })
  const dimension = await AssessmentTemplateDimension.create({
    assessmentTemplateId: template.assessmentTemplateId,
    assessmentTemplateDimensionName: `PAP Dim ${suffix}`,
    assessmentTemplateDimensionAcronym: suffix.slice(0, 5).toUpperCase(),
  })
  return { template, dimension }
}

async function cleanupTestFixture(templateId: number) {
  const dims = await db
    .from('assessment_template_dimensions')
    .where('assessment_template_id', templateId)
    .select('assessment_template_dimension_id')

  const dimIds = dims.map(
    (d: { assessment_template_dimension_id: number }) => d.assessment_template_dimension_id
  )

  if (dimIds.length > 0) {
    await db
      .from('position_assessment_profiles')
      .whereIn('assessment_template_dimension_id', dimIds)
      .delete()
  }

  await db
    .from('assessment_template_dimensions')
    .where('assessment_template_id', templateId)
    .delete()
  await db.from('assessment_templates').where('assessment_template_id', templateId).delete()
}

test.group('PositionAssessmentProfile - index GET /', (group) => {
  let user: User

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
  })

  test('devuelve lista paginada de perfiles', async ({ client }) => {
    const response = await client
      .get('/api/position-assessment-profiles')
      .loginAs(user)
      .qs({ page: 1, limit: 10 })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('devuelve 401 sin autenticación', async ({ client }) => {
    const response = await client
      .get('/api/position-assessment-profiles')
      .qs({ page: 1, limit: 10 })

    response.assertStatus(401)
  })

  test('filtra por positionId', async ({ client }) => {
    const position = await Position.query().whereNull('position_deleted_at').firstOrFail()
    const response = await client
      .get('/api/position-assessment-profiles')
      .loginAs(user)
      .qs({ positionId: position.positionId, page: 1, limit: 10 })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('filtra por assessmentTemplateId (a través de dimension)', async ({ client }) => {
    const template = await AssessmentTemplate.query()
      .whereNull('assessment_template_deleted_at')
      .first()

    if (!template) {
      // No hay plantillas en la BD: la prueba se considera trivial
      const response = await client
        .get('/api/position-assessment-profiles')
        .loginAs(user)
        .qs({ assessmentTemplateId: 1, page: 1, limit: 10 })
      response.assertStatus(200)
      return
    }

    const response = await client
      .get('/api/position-assessment-profiles')
      .loginAs(user)
      .qs({
        assessmentTemplateId: template.assessmentTemplateId,
        page: 1,
        limit: 10,
      })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })
})

test.group('PositionAssessmentProfile - store POST /', (group) => {
  let user: User
  let position: Position
  let template: AssessmentTemplate
  let dimension: AssessmentTemplateDimension
  const createdIds: number[] = []

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    position = await Position.query().whereNull('position_deleted_at').firstOrFail()
    const fixture = await createTestFixture('Store')
    template = fixture.template
    dimension = fixture.dimension
  })

  group.teardown(async () => {
    if (createdIds.length > 0) {
      await db
        .from('position_assessment_profiles')
        .whereIn('position_assessment_profile_id', createdIds)
        .delete()
    }
    await cleanupTestFixture(template.assessmentTemplateId)
  })

  test('crea un nuevo perfil de evaluación de puesto', async ({ client, assert }) => {
    const response = await client
      .post('/api/position-assessment-profiles')
      .loginAs(user)
      .json({
        positionId: position.positionId,
        assessmentTemplateDimensionId: dimension.assessmentTemplateDimensionId,
        positionAssessmentProfileMinimumValue: 50,
        positionAssessmentProfileMaximumValue: 90,
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    const newId = body.data?.positionAssessmentProfile?.positionAssessmentProfileId
    assert.exists(newId)
    if (newId) createdIds.push(newId)
  })

  test('falla con error de validación si falta positionId', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/position-assessment-profiles')
        .loginAs(user)
        .json({
          assessmentTemplateDimensionId: dimension.assessmentTemplateDimensionId,
          positionAssessmentProfileMinimumValue: 10,
          positionAssessmentProfileMaximumValue: 80,
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('falla con error de validación si los valores son negativos', async ({
    client,
    assert,
  }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/position-assessment-profiles')
        .loginAs(user)
        .json({
          positionId: position.positionId,
          assessmentTemplateDimensionId: dimension.assessmentTemplateDimensionId,
          positionAssessmentProfileMinimumValue: -10,
          positionAssessmentProfileMaximumValue: 80,
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('devuelve 401 sin autenticación', async ({ client }) => {
    const response = await client.post('/api/position-assessment-profiles').json({
      positionId: position.positionId,
      assessmentTemplateDimensionId: dimension.assessmentTemplateDimensionId,
      positionAssessmentProfileMinimumValue: 20,
      positionAssessmentProfileMaximumValue: 70,
    })

    response.assertStatus(401)
  })
})

test.group('PositionAssessmentProfile - show GET /:id', (group) => {
  let user: User
  let position: Position
  let template: AssessmentTemplate
  let profile: PositionAssessmentProfile

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    position = await Position.query().whereNull('position_deleted_at').firstOrFail()
    const fixture = await createTestFixture('Show')
    template = fixture.template

    profile = await PositionAssessmentProfile.create({
      positionId: position.positionId,
      assessmentTemplateDimensionId: fixture.dimension.assessmentTemplateDimensionId,
      positionAssessmentProfileMinimumValue: 30,
      positionAssessmentProfileMaximumValue: 70,
    })
  })

  group.teardown(async () => {
    await db
      .from('position_assessment_profiles')
      .where('position_assessment_profile_id', profile.positionAssessmentProfileId)
      .delete()
    await cleanupTestFixture(template.assessmentTemplateId)
  })

  test('devuelve el perfil por ID', async ({ client, assert }) => {
    const response = await client
      .get(`/api/position-assessment-profiles/${profile.positionAssessmentProfileId}`)
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.positionAssessmentProfile?.positionAssessmentProfileId,
      profile.positionAssessmentProfileId
    )
  })

  test('devuelve 404 si el perfil no existe', async ({ client }) => {
    const response = await client
      .get('/api/position-assessment-profiles/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido (NaN)', async ({ client }) => {
    const response = await client
      .get('/api/position-assessment-profiles/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})

test.group('PositionAssessmentProfile - update PUT /:id', (group) => {
  let user: User
  let position: Position
  let template: AssessmentTemplate
  let profile: PositionAssessmentProfile

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    position = await Position.query().whereNull('position_deleted_at').firstOrFail()
    const fixture = await createTestFixture('Update')
    template = fixture.template

    profile = await PositionAssessmentProfile.create({
      positionId: position.positionId,
      assessmentTemplateDimensionId: fixture.dimension.assessmentTemplateDimensionId,
      positionAssessmentProfileMinimumValue: 10,
      positionAssessmentProfileMaximumValue: 50,
    })
  })

  group.teardown(async () => {
    await db
      .from('position_assessment_profiles')
      .where('position_assessment_profile_id', profile.positionAssessmentProfileId)
      .delete()
    await cleanupTestFixture(template.assessmentTemplateId)
  })

  test('actualiza los rangos mínimo y máximo del perfil', async ({ client, assert }) => {
    const response = await client
      .put(`/api/position-assessment-profiles/${profile.positionAssessmentProfileId}`)
      .loginAs(user)
      .json({
        positionAssessmentProfileMinimumValue: 25,
        positionAssessmentProfileMaximumValue: 75,
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.positionAssessmentProfile?.positionAssessmentProfileMinimumValue,
      25
    )
    assert.equal(
      body.data?.positionAssessmentProfile?.positionAssessmentProfileMaximumValue,
      75
    )
  })

  test('devuelve 404 si el perfil no existe', async ({ client }) => {
    const response = await client
      .put('/api/position-assessment-profiles/999999999')
      .loginAs(user)
      .json({
        positionAssessmentProfileMinimumValue: 10,
        positionAssessmentProfileMaximumValue: 90,
      })

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .put('/api/position-assessment-profiles/abc')
      .loginAs(user)
      .json({
        positionAssessmentProfileMinimumValue: 10,
        positionAssessmentProfileMaximumValue: 90,
      })

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })

  test('falla con error de validación si los valores son negativos', async ({
    client,
    assert,
  }) => {
    let caught: unknown = null
    try {
      await client
        .put(`/api/position-assessment-profiles/${profile.positionAssessmentProfileId}`)
        .loginAs(user)
        .json({
          positionAssessmentProfileMinimumValue: -5,
          positionAssessmentProfileMaximumValue: 50,
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })
})

test.group('PositionAssessmentProfile - delete DELETE /:id', (group) => {
  let user: User
  let position: Position
  let template: AssessmentTemplate

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    position = await Position.query().whereNull('position_deleted_at').firstOrFail()
    const fixture = await createTestFixture('Delete')
    template = fixture.template
  })

  group.teardown(async () => {
    await cleanupTestFixture(template.assessmentTemplateId)
  })

  test('elimina (soft delete) un perfil de evaluación', async ({ client }) => {
    const dimension = await AssessmentTemplateDimension.query()
      .where('assessment_template_id', template.assessmentTemplateId)
      .firstOrFail()

    const profile = await PositionAssessmentProfile.create({
      positionId: position.positionId,
      assessmentTemplateDimensionId: dimension.assessmentTemplateDimensionId,
      positionAssessmentProfileMinimumValue: 10,
      positionAssessmentProfileMaximumValue: 90,
    })

    const response = await client
      .delete(`/api/position-assessment-profiles/${profile.positionAssessmentProfileId}`)
      .loginAs(user)

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const showResponse = await client
      .get(`/api/position-assessment-profiles/${profile.positionAssessmentProfileId}`)
      .loginAs(user)

    showResponse.assertStatus(404)

    await db
      .from('position_assessment_profiles')
      .where('position_assessment_profile_id', profile.positionAssessmentProfileId)
      .delete()
  })

  test('devuelve 404 si el perfil no existe', async ({ client }) => {
    const response = await client
      .delete('/api/position-assessment-profiles/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .delete('/api/position-assessment-profiles/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})
