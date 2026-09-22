import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import Position from '#models/position'
import Shift from '#models/shift'
import Person from '#models/person'
import Employee from '#models/employee'
import EmployeeShift from '#models/employee_shift'
import User from '#models/user'
import EmployeeBiometric from '#models/employee_biometric'
import Assist from '#models/assist'
import ProceedingFileType from '#models/proceeding_file_type'
import ProceedingFile from '#models/proceeding_file'
import EmployeeProceedingFile from '#models/employee_proceeding_file'
import Role from '#models/role'
import PlatformTenantMilestoneService, {
  type TenantMilestone,
} from '#services/platform_tenant_milestone_service'
import PlatformTrialService from '#services/platform_trial_service'
import PlatformTrialController from '#controllers/platform_trial_controller'

/**
 * USRH1789079078170 — `PlatformTenantMilestoneService.resolveMilestones` y su
 * composición en `GET /api/platform/metrics/tenants/:publicId/trial`.
 *
 * **Fixture de DOS tenants, obligatorio (§13 del spec).** Con uno solo, el
 * cálculo equivocado (sin `GROUP BY business_unit_id`, sin anti-join con
 * `business_unit_id`, hito 4 arrancando de `users`) da el mismo resultado que
 * el correcto — es exactamente el defecto que este spec existe para atrapar.
 * Cada test que compara hitos entre tenants existe para eso, no por estilo.
 */

const STAMP = () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`

// ─── Constructores de la unidad completa (dos tenants por test) ─────────────

async function createBu(tag: string): Promise<BusinessUnit> {
  const stamp = STAMP()
  const bu = new BusinessUnit()
  bu.businessUnitName = `Hitos ${tag} ${stamp}`
  bu.businessUnitSlug = `hitos-${tag}-${stamp}`.slice(0, 100)
  bu.businessUnitLegalName = `Hitos Legal ${tag} ${stamp}`
  bu.businessUnitActive = 1
  await bu.save()
  return bu
}

/** Usuario + `onboarding_user_states` desechables, solo para colgar la constancia de siembra demo. */
async function createOnboardingActor(): Promise<{ onboardingUserStateId: number; userId: number }> {
  const stamp = STAMP()
  const person = await Person.create({
    personFirstname: 'Demo',
    personLastname: 'Seeder',
    personSecondLastname: stamp,
  })
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
  const user = await User.create({
    userEmail: `onboarding-actor-${stamp}@gsti-tests.local`,
    userPassword: 'DemoSeederTest123!',
    userActive: 1,
    isPlatformAdmin: false,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const state = await db
    .table('onboarding_user_states')
    .insert({
      user_id: user.userId,
      onboarding_user_state_status: 'in_progress',
      onboarding_user_state_created_at: DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss'),
    })
  return { onboardingUserStateId: state[0], userId: user.userId }
}

async function markSeeded(
  businessUnitId: number,
  onboardingUserStateId: number,
  entityType: string,
  entityId: number
): Promise<void> {
  await db.table('onboarding_seeded_records').insert({
    onboarding_user_state_id: onboardingUserStateId,
    business_unit_id: businessUnitId,
    onboarding_seeded_record_entity_type: entityType,
    onboarding_seeded_record_entity_id: entityId,
    onboarding_seeded_record_created_at: DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss'),
  })
}

async function createDepartment(businessUnitId: number, tag: string): Promise<Department> {
  return Department.create({
    departmentSyncId: Date.now() + Math.floor(Math.random() * 1000),
    departmentCode: `DEP-${STAMP()}`.slice(0, 50),
    departmentName: `Depto ${tag}`.slice(0, 100),
    departmentAlias: '',
    departmentIsDefault: false,
    departmentActive: 1,
    businessUnitId,
    companyId: 1,
  })
}

async function createPosition(businessUnitId: number, tag: string): Promise<Position> {
  const position = new Position()
  position.positionSyncId = 0
  position.positionCode = `PUE-${STAMP()}`.slice(0, 50)
  position.positionName = `Puesto ${tag}`.slice(0, 100)
  position.positionActive = 1
  position.businessUnitId = businessUnitId
  await position.save()
  return position
}

async function createShift(businessUnitId: number, tag: string): Promise<Shift> {
  return Shift.create({
    shiftName: `Turno ${tag} ${STAMP()}`.slice(0, 100),
    shiftCalculateFlag: '',
    shiftDayStart: 1,
    shiftTimeStart: '08:00',
    shiftActiveHours: 8,
    shiftRestDays: '0',
    shiftAccumulatedFault: 1,
    businessUnitId,
    shiftTemp: 0,
  })
}

async function createEmployee(
  businessUnitId: number,
  departmentId: number,
  positionId: number,
  tag: string
): Promise<Employee> {
  const stamp = STAMP()
  const person = await Person.create({
    personFirstname: 'Hito',
    personLastname: tag,
    personSecondLastname: stamp,
  })
  const employee = new Employee()
  employee.personId = person.personId
  employee.businessUnitId = businessUnitId
  employee.companyId = 1
  employee.departmentId = departmentId
  employee.positionId = positionId
  employee.employeeSyncId = Date.now() + Math.floor(Math.random() * 1000)
  employee.employeeCode = `EMP-${stamp}`
  employee.employeeFirstName = 'Hito'
  employee.employeeLastName = tag
  await employee.save()
  return employee
}

async function createEmployeeShift(
  employeeId: number,
  shiftId: number,
  businessUnitId: number
): Promise<EmployeeShift> {
  const es = new EmployeeShift()
  es.employeeId = employeeId
  es.shiftId = shiftId
  es.businessUnitId = businessUnitId
  es.employeShiftsApplySince = '2020-01-01'
  await es.save()
  return es
}

/** Usuario ligado a la persona del empleado (RN-16: "acceso a la app"). */
async function createAppUserForEmployee(employee: Employee): Promise<User> {
  const stamp = STAMP()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
  return User.create({
    userEmail: `hito-acceso-${stamp}@gsti-tests.local`,
    userPassword: 'HitoAccesoTest123!',
    userActive: 1,
    isPlatformAdmin: false,
    roleId: role.roleId,
    personId: employee.personId,
    userEmailType: 'institutional',
  })
}

async function createBiometric(
  employeeId: number,
  businessUnitId: number,
  status: 'pending' | 'enrolling' | 'failed' | 'completed_fingers' | 'completed_face' | 'completed_both'
): Promise<EmployeeBiometric> {
  const row = new EmployeeBiometric()
  row.employeeId = employeeId
  row.businessUnitId = businessUnitId
  row.employeeBiometricData = 'Finger:1'
  row.employeeBiometricStatus = status
  await row.save()
  return row
}

async function createAssistRow(
  businessUnitId: number,
  employee: Employee,
  punchTime: DateTime,
  origin: string | null
): Promise<Assist> {
  const assist = new Assist()
  assist.assistEmpCode = String(employee.employeeCode)
  assist.assistTerminalSn = 'TEST-HITOS'
  assist.assistTerminalAlias = 'TEST'
  assist.assistAreaAlias = 'TEST'
  assist.assistLongitude = 0
  assist.assistLatitude = 0
  assist.assistPrecision = 0
  assist.assistUploadTime = punchTime
  assist.assistEmpId = employee.employeeId
  assist.businessUnitId = businessUnitId
  assist.assistTerminalId = null
  assist.assistSyncId = Math.floor(Date.now() % 1_000_000) + Math.floor(Math.random() * 1000)
  assist.assistActive = 1
  assist.assistType = 'check'
  assist.assistPunchTime = punchTime
  assist.assistPunchTimeUtc = punchTime
  assist.assistPunchTimeOrigin = punchTime
  // @ts-expect-error — `assist_origin`, no forma parte del set de columnas tipadas arriba
  assist.assistOrigin = origin
  await assist.save()
  return assist
}

async function createProceedingFileForEmployee(
  employee: Employee,
  businessUnitId: number
): Promise<EmployeeProceedingFile> {
  const stamp = STAMP()
  const type = await ProceedingFileType.create({
    proceedingFileTypeName: `Tipo ${stamp}`,
    proceedingFileTypeSlug: `tipo-${stamp}`,
    proceedingFileTypeAreaToUse: 'employee',
    proceedingFileTypeActive: 1,
    proceedingFileTypeBusinessUnits: String(businessUnitId),
    proceedingFileTypeIsExclusive: false,
  })
  const file = await ProceedingFile.create({
    proceedingFileName: `Doc ${stamp}`,
    proceedingFilePath: `/tmp/doc-${stamp}.pdf`,
    proceedingFileTypeId: type.proceedingFileTypeId,
    proceedingFileActive: 1,
    proceedingFileUuid: stamp,
  })
  return EmployeeProceedingFile.create({
    employeeId: employee.employeeId,
    businessUnitId,
    proceedingFileId: file.proceedingFileId,
  })
}

/** Borra en físico, sin dejar rastro, todo lo colgado de un tenant de esta suite. */
async function cleanupBu(businessUnitId: number): Promise<void> {
  const employeeIds: Array<{ employee_id: number }> = await db
    .from('employees')
    .where('business_unit_id', businessUnitId)
    .select('employee_id')
  const ids = employeeIds.map((r) => r.employee_id)

  if (ids.length > 0) {
    const proceedingFileIds: Array<{ proceeding_file_id: number }> = await db
      .from('employee_proceeding_files')
      .whereIn('employee_id', ids)
      .select('proceeding_file_id')
    await db.from('employee_proceeding_files').whereIn('employee_id', ids).delete()
    for (const row of proceedingFileIds) {
      const type = await db
        .from('proceeding_files')
        .where('proceeding_file_id', row.proceeding_file_id)
        .select('proceeding_file_type_id')
        .first()
      await db.from('proceeding_files').where('proceeding_file_id', row.proceeding_file_id).delete()
      if (type) {
        await db
          .from('proceeding_file_types')
          .where('proceeding_file_type_id', type.proceeding_file_type_id)
          .delete()
      }
    }
    await db.from('employee_biometrics').whereIn('employee_id', ids).delete()
    await db.from('employee_shifts').whereIn('employee_id', ids).delete()
    await db.from('assists').whereIn('assist_emp_id', ids).delete()
  }

  await db.from('onboarding_seeded_records').where('business_unit_id', businessUnitId).delete()
  await db.from('shifts').where('business_unit_id', businessUnitId).delete()

  const personIds: Array<{ person_id: number }> = await db
    .from('employees')
    .where('business_unit_id', businessUnitId)
    .select('person_id')
  await db.from('employees').where('business_unit_id', businessUnitId).delete()
  await db.from('positions').where('business_unit_id', businessUnitId).delete()
  await db.from('departments').where('business_unit_id', businessUnitId).delete()

  for (const row of personIds) {
    await db.from('users').where('person_id', row.person_id).delete()
    await db.from('people').where('person_id', row.person_id).delete()
  }

  await db.from('business_units').where('business_unit_id', businessUnitId).delete()
}

async function cleanupOnboardingActor(userId: number): Promise<void> {
  const state = await db.from('onboarding_user_states').where('user_id', userId).first()
  if (state) {
    await db.from('onboarding_user_states').where('onboarding_user_state_id', state.onboarding_user_state_id).delete()
  }
  const user = await db.from('users').where('user_id', userId).first()
  await db.from('users').where('user_id', userId).delete()
  if (user) {
    await db.from('people').where('person_id', user.person_id).delete()
  }
}

function milestone(hitos: TenantMilestone[], clave: TenantMilestone['clave']): TenantMilestone {
  return hitos.find((h) => h.clave === clave)!
}

/** Cuenta las consultas SQL reales ejecutadas durante `work()` (CA-11, mismo patrón que `alliance_attribution_accrual_progress.spec.ts:40-52`). */
async function withSqlLog<T>(work: () => Promise<T>): Promise<{ result: T; sqls: string[] }> {
  const sqls: string[] = []
  const knex = db.connection().getWriteClient()
  const onQuery = (query: { sql?: string }) => {
    if (query.sql) sqls.push(query.sql)
  }
  knex.on('query', onQuery)
  try {
    const result = await work()
    return { result, sqls }
  } finally {
    knex.off('query', onQuery)
  }
}

// ─── Nivel servicio ──────────────────────────────────────────────────────────

test.group('PlatformTenantMilestoneService.resolveMilestones (USRH1789079078170)', () => {
  test('CA-01 · los siete hitos, cumplidos y con fecha, para un tenant con todo capturado', async ({
    assert,
  }) => {
    const bu = await createBu('ca01')
    try {
      const dept = await createDepartment(bu.businessUnitId, 'ca01')
      const pos = await createPosition(bu.businessUnitId, 'ca01')
      const shift = await createShift(bu.businessUnitId, 'ca01')
      const employee = await createEmployee(bu.businessUnitId, dept.departmentId, pos.positionId, 'ca01')
      await createEmployeeShift(employee.employeeId, shift.shiftId, bu.businessUnitId)
      await createAppUserForEmployee(employee)
      await createBiometric(employee.employeeId, bu.businessUnitId, 'completed_face')
      await createAssistRow(bu.businessUnitId, employee, DateTime.utc(), 'manual')
      await createProceedingFileForEmployee(employee, bu.businessUnitId)

      const service = new PlatformTenantMilestoneService()
      const map = await service.resolveMilestones([bu.businessUnitId])
      const hitos = map.get(bu.businessUnitId)!

      assert.lengthOf(hitos, 7)
      assert.deepEqual(
        hitos.map((h) => h.numero),
        [1, 2, 3, 4, 5, 6, 8]
      )
      for (const hito of hitos) {
        assert.isTrue(hito.cumplido, `hito ${hito.clave} debía estar cumplido`)
        assert.isNotNull(hito.fecha, `hito ${hito.clave} debía tener fecha`)
      }
    } finally {
      await cleanupBu(bu.businessUnitId)
    }
  })

  test('CA-02 · tenant recién registrado sin capturar nada: siete pendientes, sin fecha, sin error', async ({
    assert,
  }) => {
    const bu = await createBu('ca02')
    try {
      const service = new PlatformTenantMilestoneService()
      const map = await service.resolveMilestones([bu.businessUnitId])
      const hitos = map.get(bu.businessUnitId)!

      assert.lengthOf(hitos, 7)
      for (const hito of hitos) {
        assert.isFalse(hito.cumplido)
        assert.isNull(hito.fecha)
      }
    } finally {
      await cleanupBu(bu.businessUnitId)
    }
  })

  test('CA-03 · los datos de la demostración no cumplen ningún hito (1-4), pero el propio sí', async ({
    assert,
  }) => {
    const bu = await createBu('ca03')
    const actor = await createOnboardingActor()
    try {
      // Todo lo capturado por este tenant es SOLO lo de la demostración.
      const deptDemo = await createDepartment(bu.businessUnitId, 'ca03-demo')
      await markSeeded(bu.businessUnitId, actor.onboardingUserStateId, 'department', deptDemo.departmentId)
      const posDemo = await createPosition(bu.businessUnitId, 'ca03-demo')
      await markSeeded(bu.businessUnitId, actor.onboardingUserStateId, 'position', posDemo.positionId)
      const shiftDemo = await createShift(bu.businessUnitId, 'ca03-demo')
      await markSeeded(bu.businessUnitId, actor.onboardingUserStateId, 'shift', shiftDemo.shiftId)
      const employeeDemo = await createEmployee(
        bu.businessUnitId,
        deptDemo.departmentId,
        posDemo.positionId,
        'ca03-demo'
      )
      const employeeShiftDemo = await createEmployeeShift(
        employeeDemo.employeeId,
        shiftDemo.shiftId,
        bu.businessUnitId
      )
      await markSeeded(
        bu.businessUnitId,
        actor.onboardingUserStateId,
        'employee_shift',
        employeeShiftDemo.employeeShiftId
      )
      const userDemo = await createAppUserForEmployee(employeeDemo)
      await markSeeded(bu.businessUnitId, actor.onboardingUserStateId, 'user', userDemo.userId)

      const service = new PlatformTenantMilestoneService()
      const soloDemoMap = await service.resolveMilestones([bu.businessUnitId])
      const soloDemo = soloDemoMap.get(bu.businessUnitId)!

      for (const clave of ['estructura', 'turnos', 'empleado-con-turno', 'acceso-app'] as const) {
        const hito = milestone(soloDemo, clave)
        assert.isFalse(hito.cumplido, `${clave} no debe cumplirse solo con la demostración`)
        assert.isNull(hito.fecha, `${clave} no debe tener fecha de la demostración`)
      }

      // El tenant captura DESPUÉS su propio departamento y puesto (no demo).
      await createDepartment(bu.businessUnitId, 'ca03-propio')
      await createPosition(bu.businessUnitId, 'ca03-propio')

      const conPropioMap = await service.resolveMilestones([bu.businessUnitId])
      const conPropio = conPropioMap.get(bu.businessUnitId)!
      const estructura = milestone(conPropio, 'estructura')
      assert.isTrue(estructura.cumplido)
      assert.isNotNull(estructura.fecha)
    } finally {
      await cleanupBu(bu.businessUnitId)
      await cleanupOnboardingActor(actor.userId)
    }
  })

  test('CA-04 · un hito cumplido no se descumple: turno borrado conserva su fecha', async ({
    assert,
  }) => {
    const bu = await createBu('ca04')
    try {
      const shift = await createShift(bu.businessUnitId, 'ca04')
      await db
        .from('shifts')
        .where('shift_id', shift.shiftId)
        .update({ shift_created_at: '2026-09-02 10:00:00' })

      const service = new PlatformTenantMilestoneService()
      const antesMap = await service.resolveMilestones([bu.businessUnitId])
      const antes = antesMap.get(bu.businessUnitId)!
      const turnosAntes = milestone(antes, 'turnos')
      assert.isTrue(turnosAntes.cumplido)
      assert.equal(turnosAntes.fecha, '2026-09-02')

      await db.from('shifts').where('shift_id', shift.shiftId).update({ shift_deleted_at: DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss') })

      const despuesMap = await service.resolveMilestones([bu.businessUnitId])
      const despues = despuesMap.get(bu.businessUnitId)!
      const turnosDespues = milestone(despues, 'turnos')
      assert.isFalse(turnosDespues.cumplido)
      assert.equal(turnosDespues.fecha, '2026-09-02')
    } finally {
      await cleanupBu(bu.businessUnitId)
    }
  })

  test('CA-05 · dos tenants, cero cruce: cada uno recibe su propia fecha de estructura', async ({
    assert,
  }) => {
    const buA = await createBu('ca05-a')
    const buB = await createBu('ca05-b')
    try {
      const deptA = await createDepartment(buA.businessUnitId, 'ca05-a')
      const posA = await createPosition(buA.businessUnitId, 'ca05-a')
      await db
        .from('departments')
        .where('department_id', deptA.departmentId)
        .update({ department_created_at: '2026-09-01 09:00:00' })
      await db
        .from('positions')
        .where('position_id', posA.positionId)
        .update({ position_created_at: '2026-09-01 09:00:00' })

      const deptB = await createDepartment(buB.businessUnitId, 'ca05-b')
      const posB = await createPosition(buB.businessUnitId, 'ca05-b')
      await db
        .from('departments')
        .where('department_id', deptB.departmentId)
        .update({ department_created_at: '2026-09-08 09:00:00' })
      await db
        .from('positions')
        .where('position_id', posB.positionId)
        .update({ position_created_at: '2026-09-08 09:00:00' })

      const service = new PlatformTenantMilestoneService()
      const map = await service.resolveMilestones([buA.businessUnitId, buB.businessUnitId])

      const estructuraA = milestone(map.get(buA.businessUnitId)!, 'estructura')
      const estructuraB = milestone(map.get(buB.businessUnitId)!, 'estructura')

      assert.equal(estructuraA.fecha, '2026-09-01')
      assert.equal(estructuraB.fecha, '2026-09-08')
      assert.notEqual(estructuraA.fecha, estructuraB.fecha)

      // Consultado individualmente por B, ningún registro de A participa.
      const soloB = await service.resolveMilestones([buB.businessUnitId])
      assert.equal(milestone(soloB.get(buB.businessUnitId)!, 'estructura').fecha, '2026-09-08')
    } finally {
      await cleanupBu(buA.businessUnitId)
      await cleanupBu(buB.businessUnitId)
    }
  })

  test('CA-06 · el administrador de GSTI sin empleado no cumple el hito de acceso a la app de un tenant ajeno', async ({
    assert,
  }) => {
    const buAdmin = await createBu('ca06-admin-home')
    const buTenant = await createBu('ca06-tenant')
    try {
      // Administrador de plataforma, sin ser empleado de NINGUNA empresa.
      const stamp = STAMP()
      const adminPerson = await Person.create({
        personFirstname: 'Admin',
        personLastname: 'Plataforma',
        personSecondLastname: stamp,
      })
      const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()
      const adminUser = await User.create({
        userEmail: `ca06-admin-${stamp}@gsti-tests.local`,
        userPassword: 'Ca06AdminTest123!',
        userActive: 1,
        isPlatformAdmin: true,
        roleId: role.roleId,
        personId: adminPerson.personId,
        userEmailType: 'institutional',
      })

      const service = new PlatformTenantMilestoneService()
      const map = await service.resolveMilestones([buTenant.businessUnitId])
      const acceso = milestone(map.get(buTenant.businessUnitId)!, 'acceso-app')

      assert.isFalse(acceso.cumplido)
      assert.isNull(acceso.fecha)

      await db.from('users').where('user_id', adminUser.userId).delete()
      await db.from('people').where('person_id', adminPerson.personId).delete()
    } finally {
      await cleanupBu(buAdmin.businessUnitId)
      await cleanupBu(buTenant.businessUnitId)
    }
  })

  test('CA-07 · biométrico pendiente no cumple; al completarse cumple con la fecha de actualización', async ({
    assert,
  }) => {
    const bu = await createBu('ca07')
    try {
      const dept = await createDepartment(bu.businessUnitId, 'ca07')
      const pos = await createPosition(bu.businessUnitId, 'ca07')
      const employee = await createEmployee(bu.businessUnitId, dept.departmentId, pos.positionId, 'ca07')
      const biometric = await createBiometric(employee.employeeId, bu.businessUnitId, 'pending')

      const service = new PlatformTenantMilestoneService()
      const antesMap = await service.resolveMilestones([bu.businessUnitId])
      const antes = antesMap.get(bu.businessUnitId)!
      const bioAntes = milestone(antes, 'biometrico')
      assert.isFalse(bioAntes.cumplido)
      assert.isNull(bioAntes.fecha)

      await db
        .from('employee_biometrics')
        .where('employee_biometric_id', biometric.employeeBiometricId)
        .update({
          employee_biometric_status: 'completed_fingers',
          employee_biometric_updated_at: '2026-09-05 15:00:00',
        })

      const despuesMap = await service.resolveMilestones([bu.businessUnitId])
      const despues = despuesMap.get(bu.businessUnitId)!
      const bioDespues = milestone(despues, 'biometrico')
      assert.isTrue(bioDespues.cumplido)
      assert.equal(bioDespues.fecha, '2026-09-05')
    } finally {
      await cleanupBu(bu.businessUnitId)
    }
  })

  test('CA-08 · checada sin canal no cumple; con canal cumple con la fecha de la checada', async ({
    assert,
  }) => {
    const bu = await createBu('ca08')
    try {
      const dept = await createDepartment(bu.businessUnitId, 'ca08')
      const pos = await createPosition(bu.businessUnitId, 'ca08')
      const employee = await createEmployee(bu.businessUnitId, dept.departmentId, pos.positionId, 'ca08')
      await createAssistRow(bu.businessUnitId, employee, DateTime.utc(), null)

      const service = new PlatformTenantMilestoneService()
      const antesMap = await service.resolveMilestones([bu.businessUnitId])
      const antes = antesMap.get(bu.businessUnitId)!
      const checadaAntes = milestone(antes, 'primera-checada-real')
      assert.isFalse(checadaAntes.cumplido)
      assert.isNull(checadaAntes.fecha)

      const conCanal = DateTime.fromISO('2026-09-04T18:00:00', { zone: 'utc' })
      await createAssistRow(bu.businessUnitId, employee, conCanal, 'manual')

      const despuesMap = await service.resolveMilestones([bu.businessUnitId])
      const despues = despuesMap.get(bu.businessUnitId)!
      const checadaDespues = milestone(despues, 'primera-checada-real')
      assert.isTrue(checadaDespues.cumplido)
      assert.equal(checadaDespues.fecha, '2026-09-04')
    } finally {
      await cleanupBu(bu.businessUnitId)
    }
  })

  test('CA-11 · el número de consultas SQL es fijo (ocho) y NO crece con el tamaño del lote', async ({
    assert,
  }) => {
    const service = new PlatformTenantMilestoneService()
    const uno = [await createBu('ca11-uno')]
    const cinco = [
      await createBu('ca11-a'),
      await createBu('ca11-b'),
      await createBu('ca11-c'),
      await createBu('ca11-d'),
      await createBu('ca11-e'),
    ]
    try {
      const { result: mapUno, sqls: sqlsUno } = await withSqlLog(() =>
        service.resolveMilestones(uno.map((b) => b.businessUnitId))
      )
      const { result: mapCinco, sqls: sqlsCinco } = await withSqlLog(() =>
        service.resolveMilestones(cinco.map((b) => b.businessUnitId))
      )

      // Las ocho consultas fijas del servicio (una por hito, salvo el 1 que
      // lleva dos). Ninguna se repite por tenant ni por hito adicional.
      assert.equal(sqlsUno.length, 8, `con 1 tenant: ${sqlsUno.length} consultas`)
      assert.equal(sqlsCinco.length, 8, `con 5 tenants: ${sqlsCinco.length} consultas`)
      assert.equal(mapUno.size, 1)
      assert.equal(mapCinco.size, 5)
      for (const bu of cinco) {
        assert.lengthOf(mapCinco.get(bu.businessUnitId)!, 7)
      }
    } finally {
      for (const bu of [...uno, ...cinco]) await cleanupBu(bu.businessUnitId)
    }
  })

  test('RN-15 · hito 1: la fecha es la MÁS TARDÍA entre departamento y puesto (departamento antes, puesto después)', async ({
    assert,
  }) => {
    const bu = await createBu('rn15-dept-antes')
    try {
      const dept = await createDepartment(bu.businessUnitId, 'rn15')
      await db
        .from('departments')
        .where('department_id', dept.departmentId)
        .update({ department_created_at: '2026-09-01 09:00:00' })
      const pos = await createPosition(bu.businessUnitId, 'rn15')
      await db
        .from('positions')
        .where('position_id', pos.positionId)
        .update({ position_created_at: '2026-09-04 09:00:00' })

      const service = new PlatformTenantMilestoneService()
      const map = await service.resolveMilestones([bu.businessUnitId])
      const estructura = milestone(map.get(bu.businessUnitId)!, 'estructura')

      assert.isTrue(estructura.cumplido)
      // Puesto (jueves 4) es la más tardía, NUNCA departamento (lunes 1).
      assert.equal(estructura.fecha, '2026-09-04')
      assert.notEqual(estructura.fecha, '2026-09-01')
    } finally {
      await cleanupBu(bu.businessUnitId)
    }
  })

  test('RN-15 · hito 1: la fecha es la MÁS TARDÍA entre departamento y puesto (puesto antes, departamento después)', async ({
    assert,
  }) => {
    const bu = await createBu('rn15-pos-antes')
    try {
      const pos = await createPosition(bu.businessUnitId, 'rn15b')
      await db
        .from('positions')
        .where('position_id', pos.positionId)
        .update({ position_created_at: '2026-09-01 09:00:00' })
      const dept = await createDepartment(bu.businessUnitId, 'rn15b')
      await db
        .from('departments')
        .where('department_id', dept.departmentId)
        .update({ department_created_at: '2026-09-04 09:00:00' })

      const service = new PlatformTenantMilestoneService()
      const map = await service.resolveMilestones([bu.businessUnitId])
      const estructura = milestone(map.get(bu.businessUnitId)!, 'estructura')

      // Ahora el departamento (jueves 4) es la más tardía, no el puesto (lunes 1).
      assert.equal(estructura.fecha, '2026-09-04')
    } finally {
      await cleanupBu(bu.businessUnitId)
    }
  })

  test('RN-16 · hito 4: la fecha del PAR es la más tardía entre usuario y empleado; entre pares, el MÍNIMO', async ({
    assert,
  }) => {
    const bu = await createBu('rn16')
    try {
      const dept = await createDepartment(bu.businessUnitId, 'rn16')
      const pos = await createPosition(bu.businessUnitId, 'rn16')

      // Par 1: empleado nace primero (1 sep), usuario se liga después (5 sep)
      // → la fecha del par es la del USUARIO (más tardía), NUNCA la del
      // empleado.
      const empleado1 = await createEmployee(bu.businessUnitId, dept.departmentId, pos.positionId, 'rn16-1')
      await db
        .from('employees')
        .where('employee_id', empleado1.employeeId)
        .update({ employee_created_at: '2026-09-01 09:00:00' })
      const usuario1 = await createAppUserForEmployee(empleado1)
      await db.from('users').where('user_id', usuario1.userId).update({ user_created_at: '2026-09-05 09:00:00' })

      // Par 2: el administrador se da de alta con usuario primero (2 sep, el
      // caso citado por RN-16) y se registra como empleado después (10 sep)
      // → la fecha del par es la del EMPLEADO (más tardía), NUNCA la del
      // usuario.
      const empleado2 = await createEmployee(bu.businessUnitId, dept.departmentId, pos.positionId, 'rn16-2')
      await db
        .from('employees')
        .where('employee_id', empleado2.employeeId)
        .update({ employee_created_at: '2026-09-10 09:00:00' })
      const usuario2 = await createAppUserForEmployee(empleado2)
      await db.from('users').where('user_id', usuario2.userId).update({ user_created_at: '2026-09-02 09:00:00' })

      const service = new PlatformTenantMilestoneService()
      const map = await service.resolveMilestones([bu.businessUnitId])
      const acceso = milestone(map.get(bu.businessUnitId)!, 'acceso-app')

      assert.isTrue(acceso.cumplido)
      // Par 1 → 2026-09-05 (más tardía del par). Par 2 → 2026-09-10 (más
      // tardía del par). El MÍNIMO entre ambos pares es 2026-09-05.
      assert.equal(acceso.fecha, '2026-09-05')
    } finally {
      await cleanupBu(bu.businessUnitId)
    }
  })

  test('§13 · dos tenants con TODO capturado en uno y NADA en el otro: cero cruce en los SIETE hitos, no solo en estructura', async ({
    assert,
  }) => {
    const buLleno = await createBu('s13-lleno')
    const buVacio = await createBu('s13-vacio')
    try {
      const dept = await createDepartment(buLleno.businessUnitId, 's13')
      const pos = await createPosition(buLleno.businessUnitId, 's13')
      const shift = await createShift(buLleno.businessUnitId, 's13')
      const employee = await createEmployee(buLleno.businessUnitId, dept.departmentId, pos.positionId, 's13')
      await createEmployeeShift(employee.employeeId, shift.shiftId, buLleno.businessUnitId)
      await createAppUserForEmployee(employee)
      await createBiometric(employee.employeeId, buLleno.businessUnitId, 'completed_both')
      await createAssistRow(buLleno.businessUnitId, employee, DateTime.utc(), 'manual')
      await createProceedingFileForEmployee(employee, buLleno.businessUnitId)

      const service = new PlatformTenantMilestoneService()
      // Lote: los dos tenants juntos, en la misma llamada — es donde el
      // `GROUP BY`/anti-join/corte por `employees` mal puesto se filtraría.
      const map = await service.resolveMilestones([buLleno.businessUnitId, buVacio.businessUnitId])
      const hitosLleno = map.get(buLleno.businessUnitId)!
      const hitosVacio = map.get(buVacio.businessUnitId)!

      for (const hito of hitosLleno) {
        assert.isTrue(hito.cumplido, `lleno: ${hito.clave} debía estar cumplido`)
        assert.isNotNull(hito.fecha, `lleno: ${hito.clave} debía tener fecha`)
      }
      // Ninguno de los SIETE hitos del tenant vacío se contagia del lleno,
      // aunque se hayan resuelto en la MISMA llamada de lote.
      for (const hito of hitosVacio) {
        assert.isFalse(hito.cumplido, `vacío: ${hito.clave} no debía estar cumplido`)
        assert.isNull(hito.fecha, `vacío: ${hito.clave} no debía tener fecha`)
      }
    } finally {
      await cleanupBu(buLleno.businessUnitId)
      await cleanupBu(buVacio.businessUnitId)
    }
  })

  test('`businessUnitIds` vacío → `Map` vacío', async ({ assert }) => {
    const service = new PlatformTenantMilestoneService()
    const map = await service.resolveMilestones([])
    assert.equal(map.size, 0)
  })
})

// ─── Nivel de composición: bloque `hitos` dentro de `getTenantTrial` ────────

test.group('PlatformTrialService.getTenantTrial — bloque `hitos` (USRH1789079078170)', () => {
  test('CA-09 · un tenant sin prueba recibe los siete hitos calculados igual', async ({ assert }) => {
    const bu = await createBu('ca09')
    try {
      const dept = await createDepartment(bu.businessUnitId, 'ca09')
      const pos = await createPosition(bu.businessUnitId, 'ca09')
      await db
        .from('departments')
        .where('department_id', dept.departmentId)
        .update({ department_created_at: '2026-09-01 09:00:00' })
      await db
        .from('positions')
        .where('position_id', pos.positionId)
        .update({ position_created_at: '2026-09-02 09:00:00' })

      const service = new PlatformTrialService()
      const { prueba, hitos } = await service.getTenantTrial(bu.businessUnitPublicId)

      assert.isNull(prueba)
      assert.lengthOf(hitos, 7)
      const estructura = milestone(hitos, 'estructura')
      assert.isTrue(estructura.cumplido)
      assert.equal(estructura.fecha, '2026-09-02')
    } finally {
      await cleanupBu(bu.businessUnitId)
    }
  })

  test('CA-13 · la respuesta de hitos no contiene identidad de personas ni identificadores internos', async ({
    assert,
  }) => {
    const bu = await createBu('ca13')
    try {
      const dept = await createDepartment(bu.businessUnitId, 'ca13')
      const pos = await createPosition(bu.businessUnitId, 'ca13')
      const employee = await createEmployee(bu.businessUnitId, dept.departmentId, pos.positionId, 'ca13')
      await createAppUserForEmployee(employee)

      const service = new PlatformTrialService()
      const { hitos } = await service.getTenantTrial(bu.businessUnitPublicId)
      const raw = JSON.stringify(hitos)

      assert.notInclude(raw, 'employeeId')
      assert.notInclude(raw, 'userId')
      assert.notInclude(raw, 'businessUnitId')
      assert.notInclude(raw, 'Hito')
      for (const hito of hitos) {
        assert.deepEqual(Object.keys(hito).sort(), ['clave', 'cumplido', 'fecha', 'numero'])
      }
    } finally {
      await cleanupBu(bu.businessUnitId)
    }
  })

  test('CA-10 · si el cálculo de hitos falla, la ruta responde 500 PLT.MET.SYS_UNHANDLED — NUNCA un 200 con siete pendientes', async ({
    assert,
  }) => {
    const bu = await createBu('ca10')
    // Se rompe el cálculo de hitos a propósito (simula "la consulta lanza",
    // §6/CA-10 del spec) sin tocar código de producción de forma permanente:
    // se restaura el método real en el `finally`, exista o no fallo.
    const original = PlatformTenantMilestoneService.prototype.resolveMilestones
    PlatformTenantMilestoneService.prototype.resolveMilestones = async () => {
      throw new Error('fallo simulado del cálculo de hitos (CA-10)')
    }

    try {
      const controller = new PlatformTrialController()
      const jsonBody: { status?: number; payload?: unknown } = {}
      const fakeResponse = {
        status(code: number) {
          jsonBody.status = code
          return this
        },
        json(payload: unknown) {
          jsonBody.payload = payload
          return payload
        },
      }

      await controller.show({
        params: { publicId: bu.businessUnitPublicId },
        response: fakeResponse,
      } as unknown as Parameters<PlatformTrialController['show']>[0])

      assert.equal(jsonBody.status, 500)
      const body = jsonBody.payload as { code?: string; key?: string; data?: unknown }
      assert.equal(body.code, 'PLT.MET.SYS_UNHANDLED')
      assert.equal(body.key, 'error-inesperado-al-obtener-la-prueba-del-tenant')
      // Nunca un 200 disfrazado ni un bloque `hitos` con los siete en falso.
      assert.isUndefined(body.data)
    } finally {
      PlatformTenantMilestoneService.prototype.resolveMilestones = original
      await cleanupBu(bu.businessUnitId)
    }
  })
})
