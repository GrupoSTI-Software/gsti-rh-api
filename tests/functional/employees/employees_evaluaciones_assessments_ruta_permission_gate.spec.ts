import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import BusinessUnitUser from '#models/business_unit_user'
import Employee from '#models/employee'
import EmployeeEvaluation from '#models/employee_evaluation'
import CareerPathCandidate from '#models/career_path_candidate'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'

const TEST_PASSWORD = 'EvalAssessRutaPermissionGate123!'

interface TenantActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  role: Role
}

interface SystemActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
  roleId: number
}

interface EmployeeFixture {
  employee: Employee
  person: Person
  departmentId: number
  positionId: number
  supportFixtures: {
    competencyId: number
    templateId: number
  }[]
}

async function uniqueStamp() {
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function permissionId(permissionSlug: string): Promise<number> {
  const permission = await SystemPermission.query()
    .whereNull('system_permission_deleted_at')
    .where('system_permission_slug', permissionSlug)
    .whereHas('systemModule', (query) =>
      query.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
    )
    .first()

  if (!permission) {
    throw new Error(`Se requiere el permiso "employees:${permissionSlug}" en BD para este test.`)
  }
  return permission.systemPermissionId
}

async function grantOnly(roleId: number, permissionSlugs: string[]) {
  await RoleSystemPermission.query().where('role_id', roleId).delete()
  for (const slug of permissionSlugs) {
    await RoleSystemPermission.create({
      roleId,
      systemPermissionId: await permissionId(slug),
    })
  }
}

async function activeEmployeesGrants(roleId: number) {
  return RoleSystemPermission.query()
    .where('role_id', roleId)
    .whereNull('role_system_permission_deleted_at')
    .whereHas('systemPermissions', (permissionQuery) =>
      permissionQuery
        .whereNull('system_permission_deleted_at')
        .whereHas('systemModule', (moduleQuery) =>
          moduleQuery.whereNull('system_module_deleted_at').where('system_module_slug', 'employees')
        )
    )
}

async function snapshotAndClearEmployeesGrants(roleId: number) {
  const grants = await activeEmployeesGrants(roleId)
  for (const grant of grants) await grant.delete()
  return grants
}

async function restoreEmployeesGrants(grants: RoleSystemPermission[]) {
  for (const grant of grants) await grant.restore()
}

async function createActor(emailPrefix: string): Promise<TenantActor> {
  const stamp = await uniqueStamp()
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Evaluaciones pruebas ${stamp}`,
    businessUnitSlug: `evaluaciones-pruebas-${stamp}`,
    businessUnitLegalName: `Evaluaciones pruebas legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const role = await Role.create({
    roleName: `Evaluaciones pruebas ${stamp}`,
    roleSlug: `evaluaciones-pruebas-${stamp}`,
    roleDescription: 'Rol temporal para la matriz de permisos de evaluaciones',
    roleActive: 1,
    roleBusinessAccess: businessUnit.businessUnitSlug,
    roleManagementDays: 10,
  })
  const person = await Person.create({
    personFirstname: 'EvalPermissionGate',
    personLastname: 'Test',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit, role }
}

async function createSystemActor(roleSlug: string, emailPrefix: string): Promise<SystemActor> {
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', roleSlug).firstOrFail()
  const stamp = await uniqueStamp()
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `Evaluaciones sistema ${stamp}`,
    businessUnitSlug: `evaluaciones-sistema-${stamp}`,
    businessUnitLegalName: `Evaluaciones sistema legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'EvalSystem',
    personLastname: 'Test',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit, roleId: role.roleId }
}

async function cleanupActor(actor: TenantActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await RoleSystemPermission.query().where('role_id', actor.role.roleId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await Role.query().where('role_id', actor.role.roleId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function cleanupSystemActor(actor: SystemActor | null) {
  if (!actor) return
  await BusinessUnitUser.query().where('user_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

async function createEmployeeFixture(businessUnitId: number, prefix: string): Promise<EmployeeFixture> {
  const stamp = await uniqueStamp()
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Empleado',
    personLastname: 'EvalGate',
    personSecondLastname: prefix,
    personEmail: `employee-${prefix}-${stamp}@gsti-tests.local`,
  })
  const departmentInsert = await db.table('departments').insert({
    department_sync_id: stamp,
    department_code: `DEP-${stamp}`,
    department_name: `Departamento ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    department_created_at: now,
  })
  const departmentId = Number(departmentInsert[0])
  const positionInsert = await db.table('positions').insert({
    position_sync_id: stamp,
    position_code: `POS-${stamp}`,
    position_name: `Puesto ${prefix}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    position_active: 1,
    position_created_at: now,
  })
  const positionId = Number(positionInsert[0])
  const employeeInsert = await db.table('employees').insert({
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: 'Empleado',
    employee_last_name: 'EvalGate',
    employee_second_last_name: prefix,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_id: departmentId,
    position_id: positionId,
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `employee-work-${prefix}-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })
  return {
    employee: await Employee.findOrFail(Number(employeeInsert[0])),
    person,
    departmentId,
    positionId,
    supportFixtures: [],
  }
}

async function cleanupEmployeeFixture(fixture: EmployeeFixture | null) {
  if (!fixture) return
  const employeeId = fixture.employee.employeeId
  const candidateIds = await db
    .from('career_path_candidates')
    .where('employee_id', employeeId)
    .select('career_path_candidate_id')
  if (candidateIds.length) {
    await db
      .from('career_path_candidate_status_histories')
      .whereIn(
        'career_path_candidate_id',
        candidateIds.map((candidate) => candidate.career_path_candidate_id)
      )
      .delete()
  }
  await db.from('career_path_candidates').where('employee_id', employeeId).delete()
  const assessmentIds = await db
    .from('employee_assessments')
    .where('employee_id', employeeId)
    .select('employee_assessment_id')
  if (assessmentIds.length) {
    await db
      .from('employee_assessment_results')
      .whereIn('employee_assessment_id', assessmentIds.map((assessment) => assessment.employee_assessment_id))
      .delete()
  }
  await db.from('employee_assessments').where('employee_id', employeeId).delete()
  await db
    .from('assessment_templates')
    .whereIn(
      'assessment_template_id',
      fixture.supportFixtures.map((support) => support.templateId)
    )
    .delete()
  const evaluationIds = await db
    .from('employee_evaluations')
    .where('employee_id', employeeId)
    .select('employee_evaluation_id')
  if (evaluationIds.length) {
    const ids = evaluationIds.map((evaluation) => evaluation.employee_evaluation_id)
    await db.from('employee_competency_evaluations').whereIn('employee_evaluation_id', ids).delete()
    await db.from('employee_kpi_evaluations').whereIn('employee_evaluation_id', ids).delete()
  }
  await db.from('employee_evaluations').where('employee_id', employeeId).delete()
  await db
    .from('position_business_unit_competency_levels')
    .where('position_id', fixture.positionId)
    .delete()
  await db.from('position_kpis').where('position_id', fixture.positionId).delete()
  await db
    .from('business_unit_competency_levels')
    .where('business_unit_id', fixture.employee.businessUnitId)
    .delete()
  await db
    .from('competencies')
    .whereIn(
      'competency_id',
      fixture.supportFixtures.map((support) => support.competencyId)
    )
    .delete()
  await Employee.query().where('employee_id', employeeId).delete()
  await db.from('positions').where('position_id', fixture.positionId).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
}

async function createEvaluationFixture(employeeId: number, businessUnitId: number, suffix: string) {
  return EmployeeEvaluation.create({
    employeeId,
    businessUnitId,
    employeeEvaluationDate: '2025-06-01',
    employeeEvaluationType: `gate-${suffix}`,
    employeeEvaluationScore: 70,
    employeeEvaluationPotential: 0,
  })
}

async function createCareerPathCandidateFixture(params: {
  businessUnitId: number
  employeeId: number
  originPositionId: number
  targetPositionId: number
  proposedBy: number
  status?: string
}) {
  return CareerPathCandidate.create({
    businessUnitId: params.businessUnitId,
    employeeId: params.employeeId,
    originPositionId: params.originPositionId,
    targetPositionId: params.targetPositionId,
    careerPathCandidateIsOverride: false,
    careerPathOverrideReasonId: null,
    careerPathCandidateJustification: 'Fixture gate',
    careerPathCandidateStatus: params.status ?? 'propuesto',
    proposedBy: params.proposedBy,
    reviewedBy: null,
    careerPathCandidateRejectionReason: '',
  })
}

function assertNotPermissionDenied(assert: any, response: any) {
  assert.notEqual(response.body()?.key, 'PERM.DENIED')
  assert.notEqual(response.body()?.key, 'PERM.UNRESOLVED')
}

function assertPermissionDenied(assert: any, response: any) {
  assert.equal(response.status(), 403)
  assert.equal(response.body()?.key, 'PERM.DENIED')
  assert.equal(response.body()?.title, 'Sin permiso')
}

function buHeader(actor: TenantActor | SystemActor) {
  return { 'X-Business-Unit-Id': actor.businessUnit.businessUnitPublicId }
}

function employeeEvaluationPayload(employeeId?: number) {
  return {
    ...(employeeId ? { employeeId } : {}),
    employeeEvaluationDate: '2025-07-01',
    employeeEvaluationType: 'gate-update',
    employeeEvaluationScore: 80,
  }
}

async function createWriteSupport(fixture: EmployeeFixture, businessUnitId: number) {
  const now = new Date()
  const competencyInsert = await db.table('competencies').insert({
    competency_name: 'Competencia gate', competency_type: 'technical', competency_created_at: now,
  })
  const competencyId = Number(competencyInsert[0])
  const levelInsert = await db.table('business_unit_competency_levels').insert({
    business_unit_id: businessUnitId, business_unit_competency_level_label: 'Gate', business_unit_competency_level_position: 1, business_unit_competency_level_created_at: now,
  })
  const levelId = Number(levelInsert[0])
  const positionLevelInsert = await db.table('position_business_unit_competency_levels').insert({
    position_id: fixture.positionId, business_unit_id: businessUnitId, competency_id: competencyId, business_unit_competency_level_id: levelId, position_business_unit_competency_level_created_at: now,
  })
  const positionLevelId = Number(positionLevelInsert[0])
  const kpiInsert = await db.table('position_kpis').insert({
    position_id: fixture.positionId, business_unit_id: businessUnitId, position_kpi_name: 'KPI gate', position_kpi_ideal: '1', position_kpi_scale: 'mayor-es-mejor', position_kpi_type: 'numerico', position_kpi_frequency: 'mensual', position_kpi_created_at: now,
  })
  const kpiId = Number(kpiInsert[0])
  const templateInsert = await db.table('assessment_templates').insert({
    assessment_template_name: 'Plantilla gate', assessment_template_description: 'Fixture gate', assessment_template_created_at: now,
  })
  const templateId = Number(templateInsert[0])
  fixture.supportFixtures.push({ competencyId, templateId })
  return { competencyId, levelId, positionLevelId, kpiId, templateId }
}

async function disableEnforcementAndVerify(employeesModule: SystemModule) {
  employeesModule.systemModulePermissionEnforcementActive = false
  await employeesModule.save()
  const reloaded = await SystemModule.findOrFail(employeesModule.systemModuleId)
  if (reloaded.systemModulePermissionEnforcementActive !== false) {
    throw new Error('La exigencia de permisos de empleados debe quedar apagada tras el suite.')
  }
}

test.group('Evaluaciones/Assessments/Ruta - soft-rollout (exigencia OFF)', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('eval-soft')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'soft')
  })
  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('sin grants: las dieciséis escrituras no responden PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const headers = buHeader(actor!)
    const evaluation = await createEvaluationFixture(
      fixture!.employee.employeeId,
      actor!.businessUnit.businessUnitId,
      'soft'
    )
    const candidate = await createCareerPathCandidateFixture({
      businessUnitId: actor!.businessUnit.businessUnitId,
      employeeId: fixture!.employee.employeeId,
      originPositionId: fixture!.positionId,
      targetPositionId: fixture!.positionId,
      proposedBy: actor!.user.userId,
    })
    const support = await createWriteSupport(fixture!, actor!.businessUnit.businessUnitId)
    const requests = [
      client.post('/api/employee-evaluations').loginAs(actor!.user).headers(headers).json(employeeEvaluationPayload(fixture!.employee.employeeId)),
      client.put(`/api/employee-evaluations/${evaluation.employeeEvaluationId}`).loginAs(actor!.user).headers(headers).json(employeeEvaluationPayload()),
      client.put(`/api/employee-evaluations/update-potential/${evaluation.employeeEvaluationId}`).loginAs(actor!.user).headers(headers).json({ ...employeeEvaluationPayload(), employeeEvaluationPotential: 1 }),
      client.post('/api/employee-competency-evaluations').loginAs(actor!.user).headers(headers).json({ employeeEvaluationId: evaluation.employeeEvaluationId, positionBusinessUnitCompetencyLevelId: support.positionLevelId, businessUnitCompetencyLevelId: support.levelId, employeeCompetencyEvaluationScore: 5 }),
      client.put('/api/employee-competency-evaluations/999999').loginAs(actor!.user).headers(headers).json({ businessUnitCompetencyLevelId: support.levelId, employeeCompetencyEvaluationScore: 5 }),
      client.delete('/api/employee-competency-evaluations/1').loginAs(actor!.user).headers(headers),
      client.post('/api/employee-kpi-evaluations').loginAs(actor!.user).headers(headers).json({ employeeEvaluationId: evaluation.employeeEvaluationId, positionKpiId: support.kpiId, employeeKpiEvaluationScore: 80 }),
      client.put('/api/employee-kpi-evaluations/999999').loginAs(actor!.user).headers(headers).json({ employeeKpiEvaluationScore: 80 }),
      client.delete('/api/employee-kpi-evaluations/1').loginAs(actor!.user).headers(headers),
      client.post('/api/employee-assessments').loginAs(actor!.user).headers(headers).json({ employeeId: fixture!.employee.employeeId, assessmentTemplateId: support.templateId, employeeAssessmentDate: '2025-01-15' }),
      client.put('/api/employee-assessments/1').loginAs(actor!.user).headers(headers).json({}),
      client.delete('/api/employee-assessments/1').loginAs(actor!.user).headers(headers),
      client.post('/api/career-path-candidates').loginAs(actor!.user).headers(headers).json({ businessUnitId: actor!.businessUnit.businessUnitId, employeeId: fixture!.employee.employeeId, originPositionId: fixture!.positionId, targetPositionId: fixture!.positionId, careerPathCandidateIsOverride: false, careerPathOverrideReasonId: 0, careerPathCandidateStatus: 'propuesto', proposedBy: actor!.user.userId, reviewedBy: 0 }),
      client.put(`/api/career-path-candidates/${candidate.careerPathCandidateId}`).loginAs(actor!.user).headers(headers).json({ careerPathCandidateStatus: 'activo' }),
      client.delete(`/api/career-path-candidates/${candidate.careerPathCandidateId}`).loginAs(actor!.user).headers(headers),
      client.delete(`/api/employee-evaluations/${evaluation.employeeEvaluationId}`).loginAs(actor!.user).headers(headers),
    ]
    for (const request of requests) assertNotPermissionDenied(assert, await request)
  })
})

test.group('Evaluaciones/Assessments/Ruta - matriz con exigencia ON', (group) => {
  let actor: TenantActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    actor = await createActor('eval-enforced')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'enforced')
  })
  group.teardown(async () => {
    try {
      await cleanupEmployeeFixture(fixture)
      await cleanupActor(actor)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('tab-evaluaciones-write permite evaluaciones, potencial, competencias e indicadores; no assessments ni ruta', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-evaluaciones-write'])
    const headers = buHeader(actor!)
    const employeeId = fixture!.employee.employeeId
    const support = await createWriteSupport(fixture!, actor!.businessUnit.businessUnitId)
    assertNotPermissionDenied(assert, await client.post('/api/employee-evaluations').loginAs(actor!.user).headers(headers).json(employeeEvaluationPayload(employeeId)))
    const evaluation = await createEvaluationFixture(employeeId, actor!.businessUnit.businessUnitId, 'on-write')
    assertNotPermissionDenied(assert, await client.put(`/api/employee-evaluations/update-potential/${evaluation.employeeEvaluationId}`).loginAs(actor!.user).headers(headers).json({ ...employeeEvaluationPayload(), employeeEvaluationPotential: 3 }))
    assertNotPermissionDenied(assert, await client.post('/api/employee-competency-evaluations').loginAs(actor!.user).headers(headers).json({
      employeeEvaluationId: evaluation.employeeEvaluationId, positionBusinessUnitCompetencyLevelId: support.positionLevelId, businessUnitCompetencyLevelId: support.levelId, employeeCompetencyEvaluationScore: 5,
    }))
    assertNotPermissionDenied(assert, await client.post('/api/employee-kpi-evaluations').loginAs(actor!.user).headers(headers).json({
      employeeEvaluationId: evaluation.employeeEvaluationId, positionKpiId: support.kpiId, employeeKpiEvaluationScore: 90,
    }))
    assertPermissionDenied(assert, await client.post('/api/employee-assessments').loginAs(actor!.user).headers(headers).json({ employeeId, assessmentTemplateId: 1, employeeAssessmentDate: '2025-01-15' }))
    assertPermissionDenied(assert, await client.post('/api/career-path-candidates').loginAs(actor!.user).headers(headers).json({}))
    assertPermissionDenied(assert, await client.delete(`/api/employee-evaluations/${evaluation.employeeEvaluationId}`).loginAs(actor!.user).headers(headers))
  })

  test('tab-ruta-carrera-write permite proponer y cambiar estatus; delete aparte; sin side-effects al denegar', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-ruta-carrera-write'])
    const headers = buHeader(actor!)
    assertNotPermissionDenied(assert, await client.post('/api/career-path-candidates').loginAs(actor!.user).headers(headers).json({
      businessUnitId: actor!.businessUnit.businessUnitId, employeeId: fixture!.employee.employeeId, originPositionId: fixture!.positionId, targetPositionId: fixture!.positionId, careerPathCandidateIsOverride: false, careerPathOverrideReasonId: 0, careerPathCandidateStatus: 'propuesto', proposedBy: actor!.user.userId, reviewedBy: 0,
    }))
    const candidate = await createCareerPathCandidateFixture({
      businessUnitId: actor!.businessUnit.businessUnitId, employeeId: fixture!.employee.employeeId, originPositionId: fixture!.positionId, targetPositionId: fixture!.positionId, proposedBy: actor!.user.userId,
    })
    assertNotPermissionDenied(assert, await client.put(`/api/career-path-candidates/${candidate.careerPathCandidateId}`).loginAs(actor!.user).headers(headers).json({ careerPathCandidateStatus: 'activo', reviewedBy: actor!.user.userId }))
    const blocked = await createCareerPathCandidateFixture({
      businessUnitId: actor!.businessUnit.businessUnitId, employeeId: fixture!.employee.employeeId, originPositionId: fixture!.positionId, targetPositionId: fixture!.positionId, proposedBy: actor!.user.userId,
    })
    const historyBefore = await db.from('career_path_candidate_status_histories').where('career_path_candidate_id', blocked.careerPathCandidateId).count('* as total')
    const countBefore = Number(historyBefore[0].total ?? historyBefore[0]['count(*)'] ?? 0)
    await grantOnly(actor!.role.roleId, [])
    assertPermissionDenied(assert, await client.put(`/api/career-path-candidates/${blocked.careerPathCandidateId}`).loginAs(actor!.user).headers(headers).json({ careerPathCandidateStatus: 'rechazado', careerPathCandidateRejectionReason: 'x' }))
    const reloaded = await CareerPathCandidate.findOrFail(blocked.careerPathCandidateId)
    assert.equal(reloaded.careerPathCandidateStatus, 'propuesto')
    const historyAfter = await db.from('career_path_candidate_status_histories').where('career_path_candidate_id', blocked.careerPathCandidateId).count('* as total')
    assert.equal(Number(historyAfter[0].total ?? historyAfter[0]['count(*)'] ?? 0), countBefore)
    await grantOnly(actor!.role.roleId, ['tab-ruta-carrera-write'])
    assertPermissionDenied(assert, await client.delete(`/api/career-path-candidates/${blocked.careerPathCandidateId}`).loginAs(actor!.user).headers(headers))
  })

  test('tab-assessments-write permite aplicar y editar; delete exige permiso propio; no otorga evaluaciones', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, ['tab-assessments-write'])
    const headers = buHeader(actor!)
    const support = await createWriteSupport(fixture!, actor!.businessUnit.businessUnitId)
    assertNotPermissionDenied(assert, await client.post('/api/employee-assessments').loginAs(actor!.user).headers(headers).json({
      employeeId: fixture!.employee.employeeId, assessmentTemplateId: support.templateId, employeeAssessmentDate: '2025-01-15',
    }))
    assertNotPermissionDenied(assert, await client.put('/api/employee-assessments/1').loginAs(actor!.user).headers(headers).json({}))
    assertPermissionDenied(assert, await client.delete('/api/employee-assessments/1').loginAs(actor!.user).headers(headers))
    assertPermissionDenied(assert, await client.post('/api/employee-evaluations').loginAs(actor!.user).headers(headers).json({}))
  })

  test('sin permisos: las dieciséis escrituras responden PERM.DENIED', async ({ client, assert }) => {
    await grantOnly(actor!.role.roleId, [])
    const headers = buHeader(actor!)
    const evaluation = await createEvaluationFixture(fixture!.employee.employeeId, actor!.businessUnit.businessUnitId, 'deny-all')
    const candidate = await createCareerPathCandidateFixture({
      businessUnitId: actor!.businessUnit.businessUnitId, employeeId: fixture!.employee.employeeId, originPositionId: fixture!.positionId, targetPositionId: fixture!.positionId, proposedBy: actor!.user.userId,
    })
    const requests = [
      client.post('/api/employee-evaluations').loginAs(actor!.user).headers(headers).json({}),
      client.put(`/api/employee-evaluations/${evaluation.employeeEvaluationId}`).loginAs(actor!.user).headers(headers).json({}),
      client.put(`/api/employee-evaluations/update-potential/${evaluation.employeeEvaluationId}`).loginAs(actor!.user).headers(headers).json({}),
      client.delete(`/api/employee-evaluations/${evaluation.employeeEvaluationId}`).loginAs(actor!.user).headers(headers),
      client.post('/api/employee-competency-evaluations').loginAs(actor!.user).headers(headers).json({}),
      client.put('/api/employee-competency-evaluations/1').loginAs(actor!.user).headers(headers).json({}),
      client.delete('/api/employee-competency-evaluations/1').loginAs(actor!.user).headers(headers),
      client.post('/api/employee-kpi-evaluations').loginAs(actor!.user).headers(headers).json({}),
      client.put('/api/employee-kpi-evaluations/1').loginAs(actor!.user).headers(headers).json({}),
      client.delete('/api/employee-kpi-evaluations/1').loginAs(actor!.user).headers(headers),
      client.post('/api/employee-assessments').loginAs(actor!.user).headers(headers).json({}),
      client.put('/api/employee-assessments/1').loginAs(actor!.user).headers(headers).json({}),
      client.delete('/api/employee-assessments/1').loginAs(actor!.user).headers(headers),
      client.post('/api/career-path-candidates').loginAs(actor!.user).headers(headers).json({}),
      client.put(`/api/career-path-candidates/${candidate.careerPathCandidateId}`).loginAs(actor!.user).headers(headers).json({ careerPathCandidateStatus: 'activo' }),
      client.delete(`/api/career-path-candidates/${candidate.careerPathCandidateId}`).loginAs(actor!.user).headers(headers),
    ]
    for (const request of requests) assertPermissionDenied(assert, await request)
  })
})

test.group('Evaluaciones/Assessments/Ruta - bypass standard (owner)', (group) => {
  let ownerActor: SystemActor | null = null
  let fixture: EmployeeFixture | null = null
  let employeesModule: SystemModule
  let ownerGrants: RoleSystemPermission[] = []

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = true
    await employeesModule.save()
    ownerActor = await createSystemActor('owner', 'eval-owner')
    fixture = await createEmployeeFixture(ownerActor.businessUnit.businessUnitId, 'owner')
  })
  group.teardown(async () => {
    try {
      await restoreEmployeesGrants(ownerGrants)
      await cleanupEmployeeFixture(fixture)
      await cleanupSystemActor(ownerActor)
    } finally {
      await disableEnforcementAndVerify(employeesModule)
    }
  })

  test('owner sin grants no recibe PERM.DENIED en updatePotential', async ({ client, assert }) => {
    ownerGrants = await snapshotAndClearEmployeesGrants(ownerActor!.roleId)
    const evaluation = await createEvaluationFixture(
      fixture!.employee.employeeId,
      ownerActor!.businessUnit.businessUnitId,
      'owner'
    )
    const response = await client
      .put(`/api/employee-evaluations/update-potential/${evaluation.employeeEvaluationId}`)
      .loginAs(ownerActor!.user)
      .headers(buHeader(ownerActor!))
      .json({ ...employeeEvaluationPayload(), employeeEvaluationPotential: 2 })
    assertNotPermissionDenied(assert, response)
  })
})
