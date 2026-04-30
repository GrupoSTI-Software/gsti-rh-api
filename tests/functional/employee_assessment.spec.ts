import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Employee from '#models/employee'
import AssessmentTemplate from '#models/assessment_template'
import AssessmentTemplateDimension from '#models/assessment_template_dimension'
import EmployeeAssessment from '#models/employee_assessment'

/**
 * Tests funcionales — EmployeeAssessmentController
 * Rutas: /api/employee-assessments
 *
 * Validaciones documentadas:
 *
 * POST / (store)
 *   - employeeId: requerido, número positivo
 *   - assessmentTemplateId: requerido, número positivo
 *   - employeeAssessmentDate: requerido, string ISO (YYYY-MM-DD), no fecha futura
 *   - Verifica que el empleado exista y no esté eliminado (404 si no existe)
 *   - Verifica que no exista una evaluación duplicada (mismo empleado + plantilla + fecha)
 *   - results[].assessmentTemplateDimensionId: requerido, número positivo
 *   - results[].employeeAssessmentResultValue: opcional, string, max 255 chars, nullable
 *
 * PUT /:employeeAssessmentId (update)
 *   - employeeAssessmentId: requerido, número positivo (path param)
 *   - employeeAssessmentDate: opcional, string ISO, no fecha futura
 *   - Verifica duplicado si se cambia la fecha
 *   - results[].assessmentTemplateDimensionId: requerido, número positivo
 *   - results[].employeeAssessmentResultValue: opcional, string, max 255 chars, nullable
 *
 * DELETE /:employeeAssessmentId (delete)
 *   - employeeAssessmentId: requerido, número positivo (path param)
 *   - Realiza soft delete sobre la evaluación y sus resultados
 *
 * GET /:employeeAssessmentId (show)
 *   - employeeAssessmentId: requerido, número positivo (path param)
 *
 * GET /employee/:employeeId (getByEmployee)
 *   - employeeId: requerido, número positivo (path param)
 *
 * GET /tests-by-position/:positionId (getTemplatesByPosition)
 *   - positionId: requerido, número positivo (path param)
 *
 * GET / (index)
 *   - employeeId, assessmentTemplateId, status: opcionales para filtrar
 *   - page: requerido, entero >= 1 (default 1)
 *   - limit: requerido, entero >= 1 (default 100)
 *
 * Estados de evaluación calculados automáticamente:
 *   - 'pending': faltan resultados o no hay perfiles de puesto configurados
 *   - 'approved': todos los resultados >= mínimo del perfil (sin insuficientes)
 *   - 'failed': al menos un resultado < mínimo del perfil del puesto
 */

/**
 * Crea una plantilla de evaluación de prueba con su dimensión asociada.
 * Devuelve un objeto con la plantilla y la dimensión ya guardadas en DB.
 */
async function createTestTemplate(suffix: string) {
  const template = await AssessmentTemplate.create({
    assessmentTemplateName: `Plantilla EA Test ${suffix}`,
    assessmentTemplateDescription: null,
  })
  const dimension = await AssessmentTemplateDimension.create({
    assessmentTemplateId: template.assessmentTemplateId,
    assessmentTemplateDimensionName: `Dim ${suffix}`,
    assessmentTemplateDimensionAcronym: suffix.slice(0, 5).toUpperCase(),
  })
  return { template, dimension }
}

/**
 * Borra una plantilla de prueba y todos sus registros relacionados
 * (resultados, evaluaciones y dimensiones) de la base de datos.
 */
async function cleanupTestTemplate(templateId: number) {
  const assessments = await db
    .from('employee_assessments')
    .where('assessment_template_id', templateId)
    .select('employee_assessment_id')

  const assessmentIds = assessments.map((a: { employee_assessment_id: number }) => a.employee_assessment_id)

  if (assessmentIds.length > 0) {
    await db
      .from('employee_assessment_results')
      .whereIn('employee_assessment_id', assessmentIds)
      .delete()
    await db
      .from('employee_assessments')
      .whereIn('employee_assessment_id', assessmentIds)
      .delete()
  }

  await db
    .from('assessment_template_dimensions')
    .where('assessment_template_id', templateId)
    .delete()
  await db.from('assessment_templates').where('assessment_template_id', templateId).delete()
}

test.group('EmployeeAssessment - index GET /', (group) => {
  let user: User
  let testEmployee: Employee
  let testTemplate: AssessmentTemplate

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
    const created = await createTestTemplate('Index')
    testTemplate = created.template
  })

  group.teardown(async () => {
    await cleanupTestTemplate(testTemplate.assessmentTemplateId)
  })

  test('devuelve lista paginada de evaluaciones', async ({ client }) => {
    const response = await client
      .get('/api/employee-assessments')
      .loginAs(user)
      .qs({ page: 1, limit: 10 })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('filtra por employeeId', async ({ client }) => {
    const response = await client
      .get('/api/employee-assessments')
      .loginAs(user)
      .qs({
        employeeId: testEmployee.employeeId,
        page: 1,
        limit: 10,
      })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('filtra por status pending', async ({ client }) => {
    const response = await client
      .get('/api/employee-assessments')
      .loginAs(user)
      .qs({ status: 'pending', page: 1, limit: 10 })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('filtra por assessmentTemplateId', async ({ client }) => {
    const response = await client
      .get('/api/employee-assessments')
      .loginAs(user)
      .qs({
        assessmentTemplateId: testTemplate.assessmentTemplateId,
        page: 1,
        limit: 10,
      })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('devuelve 401 sin autenticación', async ({ client }) => {
    const response = await client
      .get('/api/employee-assessments')
      .qs({ page: 1, limit: 10 })

    response.assertStatus(401)
  })
})

test.group('EmployeeAssessment - store POST /', (group) => {
  let user: User
  let testEmployee: Employee
  let testTemplate: AssessmentTemplate
  let testDimension: AssessmentTemplateDimension

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
    const created = await createTestTemplate('Store')
    testTemplate = created.template
    testDimension = created.dimension
  })

  group.teardown(async () => {
    await cleanupTestTemplate(testTemplate.assessmentTemplateId)
  })

  test('crea una evaluación sin resultados', async ({ client, assert }) => {
    const response = await client
      .post('/api/employee-assessments')
      .loginAs(user)
      .json({
        employeeId: testEmployee.employeeId,
        assessmentTemplateId: testTemplate.assessmentTemplateId,
        employeeAssessmentDate: '2025-01-15',
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.exists(body.data?.employeeAssessment?.employeeAssessmentId)
  })

  test('crea una evaluación con resultados de dimensiones', async ({ client, assert }) => {
    const response = await client
      .post('/api/employee-assessments')
      .loginAs(user)
      .json({
        employeeId: testEmployee.employeeId,
        assessmentTemplateId: testTemplate.assessmentTemplateId,
        employeeAssessmentDate: '2025-02-10',
        results: [
          {
            assessmentTemplateDimensionId: testDimension.assessmentTemplateDimensionId,
            employeeAssessmentResultValue: '85',
          },
        ],
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.exists(body.data?.employeeAssessment?.employeeAssessmentId)
  })

  test('rechaza fecha futura', async ({ client }) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const futureDate = tomorrow.toISOString().split('T')[0]

    const response = await client
      .post('/api/employee-assessments')
      .loginAs(user)
      .json({
        employeeId: testEmployee.employeeId,
        assessmentTemplateId: testTemplate.assessmentTemplateId,
        employeeAssessmentDate: futureDate,
      })

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })

  test('rechaza empleado inexistente (404)', async ({ client }) => {
    const response = await client
      .post('/api/employee-assessments')
      .loginAs(user)
      .json({
        employeeId: 999999999,
        assessmentTemplateId: testTemplate.assessmentTemplateId,
        employeeAssessmentDate: '2025-03-01',
      })

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('rechaza evaluación duplicada (mismo empleado + plantilla + fecha)', async ({
    client,
    assert,
  }) => {
    const dupeDate = '2025-04-01'

    // Primera evaluación (debe crearse correctamente)
    const firstResponse = await client
      .post('/api/employee-assessments')
      .loginAs(user)
      .json({
        employeeId: testEmployee.employeeId,
        assessmentTemplateId: testTemplate.assessmentTemplateId,
        employeeAssessmentDate: dupeDate,
      })

    firstResponse.assertStatus(201)
    assert.exists(firstResponse.body().data?.employeeAssessment?.employeeAssessmentId)

    // Segunda evaluación con los mismos datos (debe rechazarse)
    const dupeResponse = await client
      .post('/api/employee-assessments')
      .loginAs(user)
      .json({
        employeeId: testEmployee.employeeId,
        assessmentTemplateId: testTemplate.assessmentTemplateId,
        employeeAssessmentDate: dupeDate,
      })

    dupeResponse.assertStatus(400)
    dupeResponse.assertBodyContains({ type: 'warning' })
  })

  test('falla si falta el employeeId', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/employee-assessments')
        .loginAs(user)
        .json({
          assessmentTemplateId: testTemplate.assessmentTemplateId,
          employeeAssessmentDate: '2025-05-01',
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('falla si falta la fecha de evaluación', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/employee-assessments')
        .loginAs(user)
        .json({
          employeeId: testEmployee.employeeId,
          assessmentTemplateId: testTemplate.assessmentTemplateId,
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })
})

test.group('EmployeeAssessment - show GET /:id', (group) => {
  let user: User
  let testEmployee: Employee
  let testTemplate: AssessmentTemplate
  let assessment: EmployeeAssessment

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
    const created = await createTestTemplate('Show')
    testTemplate = created.template

    assessment = await EmployeeAssessment.create({
      employeeId: testEmployee.employeeId,
      assessmentTemplateId: testTemplate.assessmentTemplateId,
      employeeAssessmentDate: '2025-06-01' as unknown as import('luxon').DateTime,
      employeeAssessmentStatus: 'pending',
    })
  })

  group.teardown(async () => {
    await cleanupTestTemplate(testTemplate.assessmentTemplateId)
  })

  test('devuelve la evaluación por ID', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employee-assessments/${assessment.employeeAssessmentId}`)
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.employeeAssessment?.employeeAssessmentId,
      assessment.employeeAssessmentId
    )
  })

  test('devuelve 404 si la evaluación no existe', async ({ client }) => {
    const response = await client
      .get('/api/employee-assessments/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .get('/api/employee-assessments/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})

test.group('EmployeeAssessment - update PUT /:id', (group) => {
  let user: User
  let testEmployee: Employee
  let testTemplate: AssessmentTemplate
  let testDimension: AssessmentTemplateDimension
  let assessment: EmployeeAssessment

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
    const created = await createTestTemplate('Update')
    testTemplate = created.template
    testDimension = created.dimension

    assessment = await EmployeeAssessment.create({
      employeeId: testEmployee.employeeId,
      assessmentTemplateId: testTemplate.assessmentTemplateId,
      employeeAssessmentDate: '2025-07-01' as unknown as import('luxon').DateTime,
      employeeAssessmentStatus: 'pending',
    })
  })

  group.teardown(async () => {
    await cleanupTestTemplate(testTemplate.assessmentTemplateId)
  })

  test('actualiza la fecha de la evaluación', async ({ client }) => {
    const response = await client
      .put(`/api/employee-assessments/${assessment.employeeAssessmentId}`)
      .loginAs(user)
      .json({
        employeeAssessmentDate: '2025-07-15',
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })
  })

  test('actualiza resultados de la evaluación', async ({ client }) => {
    const response = await client
      .put(`/api/employee-assessments/${assessment.employeeAssessmentId}`)
      .loginAs(user)
      .json({
        results: [
          {
            assessmentTemplateDimensionId: testDimension.assessmentTemplateDimensionId,
            employeeAssessmentResultValue: '90',
          },
        ],
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })
  })

  test('rechaza fecha futura al actualizar', async ({ client }) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const futureDate = tomorrow.toISOString().split('T')[0]

    const response = await client
      .put(`/api/employee-assessments/${assessment.employeeAssessmentId}`)
      .loginAs(user)
      .json({
        employeeAssessmentDate: futureDate,
      })

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 404 si la evaluación no existe', async ({ client }) => {
    const response = await client
      .put('/api/employee-assessments/999999999')
      .loginAs(user)
      .json({ employeeAssessmentDate: '2025-07-20' })

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .put('/api/employee-assessments/abc')
      .loginAs(user)
      .json({ employeeAssessmentDate: '2025-07-20' })

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})

test.group('EmployeeAssessment - delete DELETE /:id', (group) => {
  let user: User
  let testEmployee: Employee
  let testTemplate: AssessmentTemplate

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
    const created = await createTestTemplate('Delete')
    testTemplate = created.template
  })

  group.teardown(async () => {
    await cleanupTestTemplate(testTemplate.assessmentTemplateId)
  })

  test('elimina (soft delete) una evaluación y sus resultados', async ({ client }) => {
    const assessment = await EmployeeAssessment.create({
      employeeId: testEmployee.employeeId,
      assessmentTemplateId: testTemplate.assessmentTemplateId,
      employeeAssessmentDate: '2025-08-01' as unknown as import('luxon').DateTime,
      employeeAssessmentStatus: 'pending',
    })

    const response = await client
      .delete(`/api/employee-assessments/${assessment.employeeAssessmentId}`)
      .loginAs(user)

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    // Verificar que ya no es accesible por la API
    const showResponse = await client
      .get(`/api/employee-assessments/${assessment.employeeAssessmentId}`)
      .loginAs(user)

    showResponse.assertStatus(404)
  })

  test('devuelve 404 si la evaluación no existe', async ({ client }) => {
    const response = await client
      .delete('/api/employee-assessments/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('devuelve 400 si el ID es inválido', async ({ client }) => {
    const response = await client
      .delete('/api/employee-assessments/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})

test.group('EmployeeAssessment - getByEmployee GET /employee/:employeeId', (group) => {
  let user: User
  let testEmployee: Employee

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await Employee.query().whereNull('employee_deleted_at').firstOrFail()
  })

  test('devuelve todas las evaluaciones de un empleado', async ({ client }) => {
    const response = await client
      .get(`/api/employee-assessments/employee/${testEmployee.employeeId}`)
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })
  })

  test('devuelve 400 si el employeeId es inválido', async ({ client }) => {
    const response = await client
      .get('/api/employee-assessments/employee/abc')
      .loginAs(user)

    response.assertStatus(400)
    response.assertBodyContains({ type: 'warning' })
  })
})

test.group(
  'EmployeeAssessment - getTemplatesByPosition GET /tests-by-position/:positionId',
  (group) => {
    let user: User

    group.setup(async () => {
      user = await User.query().whereNull('user_deleted_at').firstOrFail()
    })

    test('devuelve plantillas asignadas a un puesto (puede ser lista vacía)', async ({
      client,
    }) => {
      const response = await client
        .get('/api/employee-assessments/tests-by-position/1')
        .loginAs(user)

      response.assertStatus(200)
      response.assertBodyContains({ type: 'success' })
    })

    test('devuelve 400 si el positionId es inválido', async ({ client }) => {
      const response = await client
        .get('/api/employee-assessments/tests-by-position/abc')
        .loginAs(user)

      response.assertStatus(400)
      response.assertBodyContains({ type: 'warning' })
    })
  }
)
