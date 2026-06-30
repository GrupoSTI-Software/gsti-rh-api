import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Employee from '#models/employee'
import EmployeeEvaluation from '#models/employee_evaluation'

async function ensureTestBusinessUnitId(): Promise<number> {
  const existing = await db
    .from('business_units')
    .whereNull('business_unit_deleted_at')
    .select('business_unit_id')
    .first()

  if (existing?.business_unit_id) {
    return Number(existing.business_unit_id)
  }

  const inserted = await db.table('business_units').insert({
    business_unit_name: 'BU Test EmployeeEvaluation',
    business_unit_slug: `bu-test-employee-evaluation-${Date.now()}`,
    business_unit_legal_name: 'BU Test EmployeeEvaluation',
    business_unit_active: 1,
    business_unit_created_at: new Date(),
  })

  return Number(Array.isArray(inserted) ? inserted[0] : inserted)
}

async function ensureTestEmployee(): Promise<Employee> {
  const existing = await Employee.query().whereNull('employee_deleted_at').first()
  if (existing) return existing

  const businessUnitId = await ensureTestBusinessUnitId()
  const syncSeed = Date.now()
  const now = new Date()

  const personInsert = await db.table('people').insert({
    person_firstname: 'Empleado',
    person_lastname: 'Prueba',
    person_second_lastname: 'Evaluacion',
    person_created_at: now,
  })
  const personId = Number(Array.isArray(personInsert) ? personInsert[0] : personInsert)

  const departmentInsert = await db.table('departments').insert({
    department_sync_id: syncSeed,
    department_code: `DEP-${syncSeed}`,
    department_name: 'Departamento Test Evaluacion',
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    department_created_at: now,
  })
  const departmentId = Number(Array.isArray(departmentInsert) ? departmentInsert[0] : departmentInsert)

  const positionInsert = await db.table('positions').insert({
    position_sync_id: syncSeed,
    position_code: `POS-${syncSeed}`,
    position_name: 'Puesto Test Evaluacion',
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: now,
  })
  const positionId = Number(Array.isArray(positionInsert) ? positionInsert[0] : positionInsert)

  const employeeInsert = await db.table('employees').insert({
    employee_sync_id: `EMP-${syncSeed}`,
    employee_code: `EMP-${syncSeed}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: personId,
    employee_created_at: now,
  })
  const employeeId = Number(Array.isArray(employeeInsert) ? employeeInsert[0] : employeeInsert)

  return (await Employee.findOrFail(employeeId)) as Employee
}

/**
 * Tests funcionales — EmployeeEvaluationController
 * Rutas: /api/employee-evaluations
 *
 * Validaciones documentadas:
 *
 * POST / (store)
 *   - employeeId: requerido, número entero positivo (>= 1)
 *   - employeeEvaluationDate: requerido, string (se convierte a Date en el controlador)
 *   - employeeEvaluationType: requerido, string, mínimo 1 carácter
 *   - employeeEvaluationScore: opcional, número >= 0
 *   - El controlador verifica que NO exista otra evaluación activa con la misma
 *     combinación de employeeId + employeeEvaluationDate + employeeEvaluationType.
 *
 * PUT /:employeeEvaluationId (update)
 *   - employeeEvaluationId: requerido, número positivo (path param)
 *   - employeeEvaluationDate: requerido, string, mínimo 1 carácter
 *   - employeeEvaluationType: requerido, string, mínimo 1 carácter
 *   - employeeEvaluationScore: opcional, número >= 0
 *
 * DELETE /:employeeEvaluationId (destroy)
 *   - employeeEvaluationId: requerido, número positivo (path param)
 *   - Realiza soft delete sobre la evaluación.
 *
 * GET /:employeeEvaluationId (show)
 *   - employeeEvaluationId: requerido, número positivo (path param)
 *
 * GET /by-employee/:employeeId (getByEmployee)
 *   - employeeId: requerido, número positivo (path param)
 *
 * PUT /update-potential/:employeeEvaluationId (updatePotential)
 *   - employeeEvaluationId: requerido, número positivo (path param)
 *   - employeeEvaluationPotential: requerido, número >= 0
 */

test.group('EmployeeEvaluation - store POST /', (group) => {
  let user: User
  let testEmployee: Employee
  const createdIds: number[] = []

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await ensureTestEmployee()
  })

  group.teardown(async () => {
    if (createdIds.length > 0) {
      await db.from('employee_evaluations').whereIn('employee_evaluation_id', createdIds).delete()
    }
  })

  test('crea una nueva evaluación de empleado', async ({ client, assert }) => {
    const response = await client
      .post('/api/employee-evaluations')
      .loginAs(user)
      .json({
        employeeId: testEmployee.employeeId,
        employeeEvaluationDate: '2025-03-01',
        employeeEvaluationType: 'evaluation_test_store_1',
        employeeEvaluationScore: 80,
      })

    response.assertStatus(201)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    const evaluationId = body.data?.employeeEvaluation?.employeeEvaluationId
    assert.exists(evaluationId)
    if (evaluationId) createdIds.push(evaluationId)
  })

  test('rechaza evaluación duplicada (mismo empleado + fecha + tipo)', async ({
    client,
    assert,
  }) => {
    const dupePayload = {
      employeeId: testEmployee.employeeId,
      employeeEvaluationDate: '2025-04-01',
      employeeEvaluationType: 'evaluation_test_store_dupe',
      employeeEvaluationScore: 75,
    }

    const firstResponse = await client
      .post('/api/employee-evaluations')
      .loginAs(user)
      .json(dupePayload)

    firstResponse.assertStatus(201)
    const firstId = firstResponse.body().data?.employeeEvaluation?.employeeEvaluationId
    assert.exists(firstId)
    if (firstId) createdIds.push(firstId)

    const dupeResponse = await client
      .post('/api/employee-evaluations')
      .loginAs(user)
      .json(dupePayload)

    dupeResponse.assertStatus(400)
    dupeResponse.assertBodyContains({ type: 'warning' })
  })

  test('falla con error de validación si falta el employeeId', async ({
    client,
    assert,
  }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/employee-evaluations')
        .loginAs(user)
        .json({
          employeeEvaluationDate: '2025-05-01',
          employeeEvaluationType: 'evaluation_test_no_employee',
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('falla con error de validación si falta el tipo de evaluación', async ({
    client,
    assert,
  }) => {
    let caught: unknown = null
    try {
      await client
        .post('/api/employee-evaluations')
        .loginAs(user)
        .json({
          employeeId: testEmployee.employeeId,
          employeeEvaluationDate: '2025-06-01',
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })

  test('devuelve 401 sin autenticación', async ({ client }) => {
    const response = await client.post('/api/employee-evaluations').json({
      employeeId: testEmployee.employeeId,
      employeeEvaluationDate: '2025-07-01',
      employeeEvaluationType: 'evaluation_test_unauth',
    })

    response.assertStatus(401)
  })
})

test.group('EmployeeEvaluation - show GET /:id', (group) => {
  let user: User
  let testEmployee: Employee
  let evaluation: EmployeeEvaluation

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await ensureTestEmployee()
    evaluation = await EmployeeEvaluation.create({
      employeeId: testEmployee.employeeId,
      employeeEvaluationDate: new Date('2025-08-01'),
      employeeEvaluationType: 'evaluation_test_show',
      employeeEvaluationScore: 70,
    })
  })

  group.teardown(async () => {
    await db
      .from('employee_evaluations')
      .where('employee_evaluation_id', evaluation.employeeEvaluationId)
      .delete()
  })

  test('devuelve la evaluación por ID', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employee-evaluations/${evaluation.employeeEvaluationId}`)
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(
      body.data?.employeeEvaluation?.employeeEvaluationId,
      evaluation.employeeEvaluationId
    )
  })

  test('devuelve 404 si la evaluación no existe', async ({ client }) => {
    const response = await client
      .get('/api/employee-evaluations/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })
})

test.group('EmployeeEvaluation - update PUT /:id', (group) => {
  let user: User
  let testEmployee: Employee
  let evaluation: EmployeeEvaluation

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await ensureTestEmployee()
    evaluation = await EmployeeEvaluation.create({
      employeeId: testEmployee.employeeId,
      employeeEvaluationDate: new Date('2025-09-01'),
      employeeEvaluationType: 'evaluation_test_update',
      employeeEvaluationScore: 60,
    })
  })

  group.teardown(async () => {
    await db
      .from('employee_evaluations')
      .where('employee_evaluation_id', evaluation.employeeEvaluationId)
      .delete()
  })

  test('actualiza la fecha y el score de la evaluación', async ({ client, assert }) => {
    const response = await client
      .put(`/api/employee-evaluations/${evaluation.employeeEvaluationId}`)
      .loginAs(user)
      .json({
        employeeEvaluationDate: '2025-09-15',
        employeeEvaluationType: 'evaluation_test_update',
        employeeEvaluationScore: 90,
      })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(body.data?.employeeEvaluation?.employeeEvaluationScore, 90)
  })

  test('devuelve 404 si la evaluación no existe', async ({ client }) => {
    const response = await client
      .put('/api/employee-evaluations/999999999')
      .loginAs(user)
      .json({
        employeeEvaluationDate: '2025-09-20',
        employeeEvaluationType: 'evaluation_test_no_existe',
      })

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })

  test('falla con error de validación si la fecha es vacía', async ({ client, assert }) => {
    let caught: unknown = null
    try {
      await client
        .put(`/api/employee-evaluations/${evaluation.employeeEvaluationId}`)
        .loginAs(user)
        .json({
          employeeEvaluationDate: '',
          employeeEvaluationType: 'evaluation_test_update',
        })
    } catch (err) {
      caught = err
    }
    assert.exists(caught)
  })
})

test.group('EmployeeEvaluation - destroy DELETE /:id', (group) => {
  let user: User
  let testEmployee: Employee

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await ensureTestEmployee()
  })

  test('elimina (soft delete) una evaluación existente', async ({ client }) => {
    const evaluation = await EmployeeEvaluation.create({
      employeeId: testEmployee.employeeId,
      employeeEvaluationDate: new Date('2025-10-01'),
      employeeEvaluationType: 'evaluation_test_destroy',
      employeeEvaluationScore: 50,
    })

    const response = await client
      .delete(`/api/employee-evaluations/${evaluation.employeeEvaluationId}`)
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const showResponse = await client
      .get(`/api/employee-evaluations/${evaluation.employeeEvaluationId}`)
      .loginAs(user)

    showResponse.assertStatus(404)

    await db
      .from('employee_evaluations')
      .where('employee_evaluation_id', evaluation.employeeEvaluationId)
      .delete()
  })

  test('devuelve 404 si la evaluación no existe', async ({ client }) => {
    const response = await client
      .delete('/api/employee-evaluations/999999999')
      .loginAs(user)

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })
})

test.group('EmployeeEvaluation - getByEmployee GET /by-employee/:employeeId', (group) => {
  let user: User
  let testEmployee: Employee

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await ensureTestEmployee()
  })

  test('devuelve hasta 3 evaluaciones más recientes del empleado', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/employee-evaluations/by-employee/${testEmployee.employeeId}`)
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.exists(body.data?.employeeEvaluations)
    assert.isAtMost((body.data?.employeeEvaluations ?? []).length, 3)
  })
})

test.group('EmployeeEvaluation - updatePotential PUT /update-potential/:id', (group) => {
  let user: User
  let testEmployee: Employee
  let evaluation: EmployeeEvaluation

  group.setup(async () => {
    user = await User.query().whereNull('user_deleted_at').firstOrFail()
    testEmployee = await ensureTestEmployee()
    evaluation = await EmployeeEvaluation.create({
      employeeId: testEmployee.employeeId,
      employeeEvaluationDate: new Date('2025-11-01'),
      employeeEvaluationType: 'evaluation_test_potential',
      employeeEvaluationScore: 60,
    })
  })

  group.teardown(async () => {
    await db
      .from('employee_evaluations')
      .where('employee_evaluation_id', evaluation.employeeEvaluationId)
      .delete()
  })

  test('actualiza el potencial de la evaluación', async ({ client, assert }) => {
    const response = await client
      .put(`/api/employee-evaluations/update-potential/${evaluation.employeeEvaluationId}`)
      .loginAs(user)
      .json({
        employeeEvaluationDate: '2025-11-01',
        employeeEvaluationType: 'evaluation_test_potential',
        employeeEvaluationPotential: 5,
      })

    response.assertStatus(200)
    response.assertBodyContains({ type: 'success' })

    const body = response.body()
    assert.equal(body.data?.employeeEvaluation?.employeeEvaluationPotential, 5)
  })

  test('devuelve 404 si la evaluación no existe', async ({ client }) => {
    const response = await client
      .put('/api/employee-evaluations/update-potential/999999999')
      .loginAs(user)
      .json({
        employeeEvaluationDate: '2025-11-01',
        employeeEvaluationType: 'evaluation_test_no_exist',
        employeeEvaluationPotential: 3,
      })

    response.assertStatus(404)
    response.assertBodyContains({ type: 'warning' })
  })
})
