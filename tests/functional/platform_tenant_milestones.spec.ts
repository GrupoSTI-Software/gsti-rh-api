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

  test('CA-11 · lote de N tenants: el número de tenants no cambia la forma del cálculo', async ({
    assert,
  }) => {
    const bus = [await createBu('ca11-1'), await createBu('ca11-2'), await createBu('ca11-3')]
    try {
      const service = new PlatformTenantMilestoneService()
      const map = await service.resolveMilestones(bus.map((b) => b.businessUnitId))
      assert.equal(map.size, 3)
      for (const bu of bus) {
        assert.lengthOf(map.get(bu.businessUnitId)!, 7)
      }
    } finally {
      for (const bu of bus) await cleanupBu(bu.businessUnitId)
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
})
