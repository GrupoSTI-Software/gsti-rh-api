/* eslint-disable no-console -- trazas temporales modo demo */
import { DateTime } from 'luxon'
import BusinessUnit from '#models/business_unit'
import Department from '#models/department'
import DepartmentPosition from '#models/department_position'
import Employee from '#models/employee'
import EmployeeShift from '#models/employee_shift'
import EmployeeType from '#models/employee_type'
import Holiday from '#models/holiday'
import Person from '#models/person'
import Position from '#models/position'
import Role from '#models/role'
import Shift from '#models/shift'
import User from '#models/user'
import AddressType from '#models/address_type'
import ExceptionType from '#models/exception_type'
import VacationSetting from '#models/vacation_setting'
import EmployeeRecordProperty from '#models/employee_record_property'
import ShiftException from '#models/shift_exception'
import EmployeeAddress from '#models/employee_address'
import EmployeeEmergencyContact from '#models/employee_emergency_contact'
import EmployeeRecord from '#models/employee_record'
import BranchOffice from '#models/branch_office'
import EmployeeBranchOffice from '#models/employee_branch_office'
import EmployeeVacationArchive from '#models/employee_vacation_archive'
import EmployeeVacationArchiveContent from '#models/employee_vacation_archive_content'
import ExceptionRequest from '#models/exception_request'
import SystemSetting from '#models/system_setting'
import Tolerance from '#models/tolerance'
import Assist from '#models/assist'

import db from '@adonisjs/lucid/services/db'
import {
  purgeDemoOperationalData,
  type DemoPurgePreserveRequestingUser,
} from './demo_operational_purge.js'
import { PersonFactory, resetDemoPeopleIndex } from '../factories/person_factory.js'
import { EmployeeFactory, DEMO_POSITION_ASSIGNMENTS } from '../factories/employee_factory.js'
import {
  AssistFactory,
  buildWorkDays,
  distributeWorkDays,
  buildPunchTime,
  demoAssistNow,
  DEMO_ASSIST_CALENDAR_ZONE,
} from '../factories/assist_factory.js'
import { DepartmentFactory, DEMO_DEPARTMENTS } from '../factories/department_factory.js'
import { PositionFactory, DEMO_POSITIONS } from '../factories/position_factory.js'
import { ShiftFactory, DEMO_SHIFTS, DEMO_DEFAULT_SHIFT_NAME } from '../factories/shift_factory.js'
import {
  UserFactory,
  DEMO_ROOT_USERS,
  DEMO_DEFAULT_PASSWORD,
  DEMO_ROLE_RULES,
} from '../factories/user_factory.js'
import { AddressFactory } from '../factories/address_factory.js'
import { EmployeeAddressFactory } from '../factories/employee_address_factory.js'
import { EmployeeEmergencyContactFactory } from '../factories/employee_emergency_contact_factory.js'
import { EmployeeRecordFactory } from '../factories/employee_record_factory.js'
import { BranchOfficeFactory, DEMO_BRANCH_OFFICE_SLUG } from '../factories/branch_office_factory.js'
import { EmployeeBranchOfficeFactory } from '../factories/employee_branch_office_factory.js'
import { ShiftExceptionFactory } from '../factories/shift_exception_factory.js'
import { EmployeeVacationArchiveFactory } from '../factories/employee_vacation_archive_factory.js'
import { EmployeeVacationArchiveContentFactory } from '../factories/employee_vacation_archive_content_factory.js'
import { ExceptionRequestFactory } from '../factories/exception_request_factory.js'

async function demoDbCounts(tag: string, label: string): Promise<void> {
  const q = async (table: string): Promise<number> => {
    try {
      const rows = await db.rawQuery(`SELECT COUNT(*) as total FROM \`${table}\``)
      const r = rows as [{ total: number | string }][]
      const v = r?.[0]?.[0]?.total
      return typeof v === 'number' ? v : Number(v ?? 0)
    } catch (e) {
      console.log(tag, `conteo omitido (${table})`, e instanceof Error ? e.message : e)
      return -1
    }
  }
  const employees = await q('employees')
  const people = await q('people')
  const users = await q('users')
  const assists = await q('assists')
  console.log(tag, `snapshot: ${label}`, { employees, people, users, assists })
}

// ---------------------------------------------------------------------------
// Resultado estructurado por paso
// ---------------------------------------------------------------------------

export interface DemoFactoryResult {
  departments: { created: number; total: number }
  positions: { created: number; total: number }
  shifts: { created: number; total: number }
  employees: { created: number; total: number }
  users: { created: number; total: number }
  employeeExtras: {
    addresses: number
    emergencyContacts: number
    records: number
    branchOfficeAssignments: number
    vacations: number
    permits: number
    vacationArchives: number
    exceptionRequests: number
  }
  assists: { employees: number; pairs: number }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Cantidad de meses hacia atrás desde **hoy** (misma hora de reloj, inicio de día)
 * para generar checadas demo; la ventana es [hoy − N meses, hoy].
 */
const DEMO_ASSIST_HISTORY_MONTHS = 6

async function resolveToleranceMinutes(type: 'delay' | 'fault'): Promise<number> {
  const systemSetting = await SystemSetting.query().where('system_setting_active', 1).first()

  if (!systemSetting) return 10

  const name = type === 'delay' ? 'Delay' : 'TardinessTolerance'
  const row = await Tolerance.query()
    .where('system_setting_id', systemSetting.systemSettingId)
    .where('tolerance_name', name)
    .whereNull('tolerance_deleted_at')
    .first()

  return row?.toleranceMinutes ?? 10
}

/**
 * Mismo límite inferior que `intialSyncDate` en SyncAssistsService al llamar
 * ShiftForEmployeeService.getEmployeeShifts (whereBetween sobre applySince).
 * Si `employeShiftsApplySince` es la fecha de ejecución del demo, un calendario
 * con `dateEnd` anterior a “hoy” no encuentra el turno → no_employee_shifts.
 */
const SYNC_ASSIST_EMPLOYEE_SHIFT_DATE_START = '2024-01-01'

function demoEmployeShiftsApplySince(employee: Employee): string {
  const raw = employee.employeeHireDate
  if (!raw) return SYNC_ASSIST_EMPLOYEE_SHIFT_DATE_START
  const hireStr =
    raw instanceof DateTime
      ? raw.toFormat('yyyy-MM-dd')
      : DateTime.fromJSDate(raw as unknown as Date).toFormat('yyyy-MM-dd')
  return hireStr >= SYNC_ASSIST_EMPLOYEE_SHIFT_DATE_START
    ? hireStr
    : SYNC_ASSIST_EMPLOYEE_SHIFT_DATE_START
}

// ---------------------------------------------------------------------------
// Servicio principal
// ---------------------------------------------------------------------------

/**
 * DemoFactoryService
 *
 * Contiene toda la lógica de generación de datos DEMO usando factories de
 * AdonisJS Lucid. Es el único lugar donde vive esa lógica; el endpoint HTTP
 * (`EstructureDemoController.generateFactoryDemo`) delega en este servicio.
 *
 * Orden de generación:
 *  1. Departamentos
 *  2. Posiciones + relación DepartmentPosition
 *  3. Turnos
 *  4. Empleados + Personas
 *  5. Asignación de turno por empleado
 *  6a. Usuarios para empleados demo
 *  6b. Usuarios root extra + empleados root
 *  7. Datos adicionales por empleado (domicilio, contacto, expediente,
 *     sucursal, excepciones de vacaciones/permiso, archivo de vacaciones,
 *     solicitudes de excepción)
 *  8. Asistencias (6 meses atrás desde hoy; ~83 % a tiempo, ~10 % retraso,
 *     ~5 % tolerancia, ~2 % faltas por mes calendario)
 */
export default class DemoFactoryService {
  // -------------------------------------------------------------------------
  // Limpieza previa (orden inverso a FK)
  // -------------------------------------------------------------------------

  private async purgeDemo(preserve?: DemoPurgePreserveRequestingUser): Promise<void> {
    const tag = `[DEMO-RUN ${new Date().toISOString()}]`
    console.log(tag, 'purgeDemo(): llamando purgeDemoOperationalData()', { preserve: !!preserve })
    await purgeDemoOperationalData(undefined, preserve)
    console.log(tag, 'purgeDemo(): purgeDemoOperationalData() terminó')
  }

  // -------------------------------------------------------------------------
  // Punto de entrada público
  // -------------------------------------------------------------------------

  async run(options?: { requestingUserId?: number }): Promise<DemoFactoryResult> {
    const tag = `[DEMO-RUN ${new Date().toISOString()}]`
    console.log(tag, 'run(): inicio', {
      requestingUserId: options?.requestingUserId ?? null,
    })
    await demoDbCounts(tag, 'al inicio (antes de contexto)')

    const result: DemoFactoryResult = {
      departments: { created: 0, total: 0 },
      positions: { created: 0, total: 0 },
      shifts: { created: 0, total: 0 },
      employees: { created: 0, total: 0 },
      users: { created: 0, total: 0 },
      employeeExtras: {
        addresses: 0,
        emergencyContacts: 0,
        records: 0,
        branchOfficeAssignments: 0,
        vacations: 0,
        permits: 0,
        vacationArchives: 0,
        exceptionRequests: 0,
      },
      assists: { employees: 0, pairs: 0 },
    }

    // 0. Contexto base — se usan todas las BUs activas de la BD
    const activeBusinessUnitsCtx = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereNull('business_unit_deleted_at')
      .orderBy('business_unit_id', 'asc')

    const businessList = activeBusinessUnitsCtx.map((bu) => bu.businessUnitSlug)
    const systemBusiness = businessList.join(',')

    console.log(tag, 'contexto de BUs activas', { businessList })

    const businessUnit = activeBusinessUnitsCtx[0] ?? null
    const businessUnitId = businessUnit?.businessUnitId ?? 0

    console.log(tag, 'BusinessUnit resuelto', {
      found: !!businessUnit,
      businessUnitId,
      slug: businessUnit?.businessUnitSlug,
    })

    const employeeType = await EmployeeType.query()
      .where('employee_type_slug', 'employee')
      .whereNull('employee_type_deleted_at')
      .first()
    const employeeTypeId = employeeType?.employeeTypeId ?? 1

    console.log(tag, 'EmployeeType resuelto', { found: !!employeeType, employeeTypeId })

    await demoDbCounts(tag, 'antes de purgeDemo()')

    let preserve: DemoPurgePreserveRequestingUser | undefined
    if (options?.requestingUserId) {
      const reqUser = await User.query()
        .where('user_id', options.requestingUserId)
        .whereNull('user_deleted_at')
        .first()
      if (reqUser?.personId) {
        preserve = { userId: reqUser.userId, personId: reqUser.personId }
        console.log(tag, 'purge: se preserva usuario solicitante', preserve)
      }
    }

    // 0.5 Vaciar todas las tablas operacionales antes de repoblar
    await this.purgeDemo(preserve)

    await demoDbCounts(tag, 'después de purgeDemo()')

    // 1–7
    console.log(tag, 'iniciando seedOrganizationAndPeople()')
    await this.seedOrganizationAndPeople(businessUnitId, employeeTypeId, systemBusiness, result)
    console.log(tag, 'seedOrganizationAndPeople() terminó', {
      departments: result.departments,
      positions: result.positions,
      shifts: result.shifts,
      employees: result.employees,
      users: result.users,
    })

    await demoDbCounts(tag, 'después de seedOrganizationAndPeople()')

    // 8. Asistencias
    console.log(tag, 'iniciando seedAssists()')
    await this.seedAssists(businessList, result)
    console.log(tag, 'seedAssists() terminó', { assists: result.assists })

    await demoDbCounts(tag, 'después de seedAssists() (run fin)')

    console.log(tag, 'run(): fin OK')
    return result
  }

  // -------------------------------------------------------------------------
  // Pasos internos
  // -------------------------------------------------------------------------

  private async seedOrganizationAndPeople(
    businessUnitId: number,
    employeeTypeId: number,
    systemBusiness: string,
    result: DemoFactoryResult
  ) {
    console.log(`[DEMO-SEED-ORG ${new Date().toISOString()}]`, 'inicio', {
      businessUnitId,
      employeeTypeId,
      systemBusiness,
    })
    // --- 1. Departamentos ---------------------------------------------------
    const departmentsMap: Record<string, Department> = {}

    for (const deptData of DEMO_DEPARTMENTS) {
      if (deptData.departmentId === 999) {
        let dept = await Department.query()
          .where('department_id', 999)
          .whereNull('department_deleted_at')
          .first()

        if (!dept) {
          dept = await DepartmentFactory.merge({
            departmentId: deptData.departmentId,
            departmentCode: deptData.code,
            departmentName: deptData.name,
            departmentAlias: deptData.alias,
            businessUnitId,
            parentDepartmentId: null,
          }).create()
          result.departments.created++
        }

        departmentsMap[deptData.key] = dept
        result.departments.total++
        continue
      }

      let dept = await Department.query()
        .where('department_alias', deptData.alias)
        .whereNull('department_deleted_at')
        .first()

      if (!dept) {
        const parentId = deptData.parentKey
          ? departmentsMap[deptData.parentKey]?.departmentId ?? null
          : null

        dept = await DepartmentFactory.merge({
          departmentCode: deptData.code,
          departmentName: deptData.name,
          departmentAlias: deptData.alias,
          businessUnitId,
          parentDepartmentId: parentId,
        }).create()
        result.departments.created++
      }

      departmentsMap[deptData.key] = dept
      result.departments.total++
    }

    // --- 2. Posiciones + DepartmentPosition ---------------------------------
    const positionsMap: Record<string, Position> = {}

    for (const posData of DEMO_POSITIONS) {
      if (posData.positionId === 999) {
        let pos = await Position.query()
          .where('position_id', 999)
          .whereNull('position_deleted_at')
          .first()

        if (!pos) {
          pos = await PositionFactory.merge({
            positionId: posData.positionId,
            positionCode: posData.code,
            positionName: posData.name,
            positionAlias: posData.alias,
            businessUnitId,
            parentPositionId: null,
          }).create()
          result.positions.created++
        }

        positionsMap[posData.key] = pos
        result.positions.total++

        const existsRel = await DepartmentPosition.query()
          .where('position_id', pos.positionId)
          .where('department_id', 999)
          .whereNull('department_position_deleted_at')
          .first()

        if (!existsRel) {
          const dp = new DepartmentPosition()
          dp.positionId = pos.positionId
          dp.departmentId = 999
          dp.departmentPositionLastSynchronizationAt = new Date()
          await dp.save()
        }
        continue
      }

      let pos = await Position.query()
        .where('position_alias', posData.alias)
        .whereNull('position_deleted_at')
        .first()

      if (!pos) {
        const parentId = posData.parentKey
          ? positionsMap[posData.parentKey]?.positionId ?? null
          : null

        pos = await PositionFactory.merge({
          positionCode: posData.code,
          positionName: posData.name,
          positionAlias: posData.alias,
          businessUnitId,
          parentPositionId: parentId,
        }).create()
        result.positions.created++
      }

      positionsMap[posData.key] = pos
      result.positions.total++

      const dept = departmentsMap[posData.departmentKey]
      if (dept) {
        const existsRel = await DepartmentPosition.query()
          .where('position_id', pos.positionId)
          .where('department_id', dept.departmentId)
          .whereNull('department_position_deleted_at')
          .first()

        if (!existsRel) {
          const dp = new DepartmentPosition()
          dp.positionId = pos.positionId
          dp.departmentId = dept.departmentId
          dp.departmentPositionLastSynchronizationAt = new Date()
          await dp.save()
        }
      }
    }

    // --- 3. Turnos ----------------------------------------------------------
    const shiftsMap: Record<string, Shift> = {}

    for (const shiftData of DEMO_SHIFTS) {
      let shift = await Shift.query()
        .where('shift_name', shiftData.shiftName)
        .whereNull('shift_deleted_at')
        .first()

      if (!shift) {
        shift = await ShiftFactory.merge({
          shiftName: shiftData.shiftName,
          shiftTimeStart: shiftData.shiftTimeStart,
          shiftActiveHours: shiftData.shiftActiveHours,
          shiftRestDays: shiftData.shiftRestDays,
          shiftAccumulatedFault: shiftData.shiftAccumulatedFault,
          shiftCalculateFlag: shiftData.shiftCalculateFlag,
          shiftDayStart: shiftData.shiftDayStart,
          shiftTemp: shiftData.shiftTemp,
          shiftColor: shiftData.shiftColor,
          shiftBusinessUnits: systemBusiness,
          // Unidad dueña (USRH1783821206521): NOT NULL tras la migración de aislamiento.
          businessUnitId,
        }).create()
        result.shifts.created++
      }

      shiftsMap[shiftData.shiftName] = shift
      result.shifts.total++
    }

    const defaultFromMap = shiftsMap[DEMO_DEFAULT_SHIFT_NAME]
    let shiftForDemo =
      defaultFromMap ??
      (await Shift.query().whereNull('shift_deleted_at').orderBy('shift_id', 'asc').first())

    console.log(`[DEMO-SEED-ORG ${new Date().toISOString()}]`, 'turno demo para asignación', {
      fromMap: !!defaultFromMap,
      shiftId: shiftForDemo?.shiftId ?? null,
      shiftName: shiftForDemo?.shiftName ?? null,
    })
    resetDemoPeopleIndex()

    const employeeAssignments: Array<{
      positionId: number | null
      departmentId: number | null
    }> = []

    for (const assignment of DEMO_POSITION_ASSIGNMENTS) {
      const pos = positionsMap[assignment.positionAlias] ?? null

      let deptId: number | null = null
      if (pos) {
        const deptPos = await DepartmentPosition.query()
          .where('position_id', pos.positionId)
          .whereNull('department_position_deleted_at')
          .first()
        deptId = deptPos?.departmentId ?? null
      }

      for (let i = 0; i < assignment.count; i++) {
        employeeAssignments.push({ positionId: pos?.positionId ?? null, departmentId: deptId })
      }
    }

    const createdEmployees: Employee[] = []
    let codeCounter = 1001

    for (const assignment of employeeAssignments) {
      const personData = await PersonFactory.create()

      // Dedup por person_id — person_email está cifrado y no se puede comparar por igualdad
      const existingEmp = await Employee.query()
        .where('person_id', personData.personId)
        .whereNull('employee_deleted_at')
        .first()

      if (existingEmp) {
        createdEmployees.push(existingEmp)
        codeCounter++
        continue
      }

      const code = String(codeCounter).padStart(4, '0')

      const employee = await EmployeeFactory.merge({
        employeeCode: code,
        employeeFirstName: personData.personFirstname,
        employeeLastName: personData.personLastname,
        employeeSecondLastName: personData.personSecondLastname ?? '.',
        employeePayrollNum: code,
        employeePayrollCode: code,
        personId: personData.personId,
        positionId: assignment.positionId,
        departmentId: assignment.departmentId,
        businessUnitId,
        payrollBusinessUnitId: businessUnitId,
        employeeTypeId,
        dailySalary: 1000,
      }).create()

      createdEmployees.push(employee)
      result.employees.created++
      codeCounter++
    }

    result.employees.total = createdEmployees.length

    // --- 5. Asignar turno por defecto a empleados ---------------------------
    if (shiftForDemo) {
      for (const employee of createdEmployees) {
        const existsShift = await EmployeeShift.query()
          .where('employee_id', employee.employeeId)
          .whereNull('employe_shifts_deleted_at')
          .first()

        if (!existsShift) {
          const empShift = new EmployeeShift()
          empShift.employeeId = employee.employeeId
          empShift.shiftId = shiftForDemo.shiftId
          empShift.employeShiftsApplySince = demoEmployeShiftsApplySince(employee)
          await empShift.save()
        }
      }
    }

    // --- 6a. Usuarios para empleados demo -----------------------------------
    const directorPos = positionsMap[DEMO_ROLE_RULES.directorPositionAlias] ?? null
    const hrDept = departmentsMap[DEMO_ROLE_RULES.hrDepartmentAlias] ?? null
    const roleDirector = await Role.query()
      .where('role_slug', DEMO_ROLE_RULES.roles.director)
      .first()
    const roleHr = await Role.query().where('role_slug', DEMO_ROLE_RULES.roles.hr).first()
    const roleEmployee = await Role.query()
      .where('role_slug', DEMO_ROLE_RULES.roles.employee)
      .first()

    // Pre-cargar IDs de unidades de negocio activas para asociar a cada usuario
    // demo vía la pivote `business_unit_users` (nueva fuente de verdad multi-tenant).
    const activeBusinessUnits = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereNull('business_unit_deleted_at')
      .select('business_unit_id')
    const activeBusinessUnitIds = activeBusinessUnits.map((unit) => unit.businessUnitId)

    for (const employee of createdEmployees) {
      const emp = await Employee.query()
        .where('employee_id', employee.employeeId)
        .preload('person')
        .first()

      if (!emp?.person?.personEmail) continue

      const existingUser = await User.query()
        .where('user_email', emp.person.personEmail)
        .whereNull('user_deleted_at')
        .first()
      if (existingUser) continue

      let roleId: number = roleEmployee?.roleId ?? 3

      if (directorPos && emp.positionId === directorPos.positionId) {
        roleId = roleDirector?.roleId ?? roleId
      } else if (hrDept && emp.departmentId === hrDept.departmentId) {
        roleId = roleHr?.roleId ?? roleId
      }

      const demoUser = await UserFactory.merge({
        userEmail: emp.person.personEmail,
        roleId,
        personId: emp.person.personId,
      }).create()

      if (activeBusinessUnitIds.length > 0) {
        await demoUser.related('businessUnits').attach(activeBusinessUnitIds)
      }

      result.users.created++
    }

    // --- 6b. Usuarios root extra + empleados root ---------------------------
    const rootRole = await Role.query().where('role_slug', DEMO_ROLE_RULES.roles.root).first()

    for (const [index, rootData] of DEMO_ROOT_USERS.entries()) {
      const existingUser = await User.query()
        .where('user_email', rootData.email)
        .whereNull('user_deleted_at')
        .first()
      if (existingUser) continue

      const rootPerson = new Person()
      rootPerson.personFirstname = rootData.firstname
      rootPerson.personLastname = rootData.lastname
      rootPerson.personSecondLastname = 'gsti'
      rootPerson.personGender = ''
      rootPerson.personBirthday = null
      rootPerson.personPhone = ''
      rootPerson.personEmail = rootData.email
      rootPerson.personPhoneSecondary = ''
      rootPerson.personCurp = ''
      rootPerson.personRfc = ''
      rootPerson.personImssNss = ''
      rootPerson.personMaritalStatus = ''
      rootPerson.personPlaceOfBirthCountry = ''
      rootPerson.personPlaceOfBirthState = ''
      rootPerson.personPlaceOfBirthCity = ''
      await rootPerson.save()

      const rootDemoUser = await UserFactory.merge({
        userEmail: rootData.email,
        userPassword: DEMO_DEFAULT_PASSWORD,
        roleId: rootRole?.roleId ?? 1,
        personId: rootPerson.personId,
      }).create()

      if (activeBusinessUnitIds.length > 0) {
        await rootDemoUser.related('businessUnits').attach(activeBusinessUnitIds)
      }

      result.users.created++

      const fallbackShift =
        shiftForDemo ??
        (await Shift.query().whereNull('shift_deleted_at').orderBy('shift_id', 'asc').first())
      if (fallbackShift) {
        const prefix = `DEMO-ROOT-${Date.now()}-${index + 1}`
        const empCode = `ROOT-${prefix}`

        const rootEmployee = await EmployeeFactory.merge({
          employeeCode: empCode,
          employeeFirstName: rootData.firstname,
          employeeLastName: rootData.lastname,
          employeeSecondLastName: 'gsti',
          employeePayrollNum: empCode,
          employeePayrollCode: empCode,
          personId: rootPerson.personId,
          positionId: 999,
          departmentId: 999,
          businessUnitId,
          payrollBusinessUnitId: businessUnitId,
          employeeTypeId,
          dailySalary: 0,
        }).create()

        const rootEmpShift = new EmployeeShift()
        rootEmpShift.employeeId = rootEmployee.employeeId
        rootEmpShift.shiftId = fallbackShift.shiftId
        rootEmpShift.employeShiftsApplySince = demoEmployeShiftsApplySince(rootEmployee)
        await rootEmpShift.save()
      }
    }

    result.users.total = result.users.created

    // --- 7. Extras por empleado (domicilio, contacto, expediente, etc.) -----
    const addressType = await AddressType.query().where('address_type_id', 1).first()

    const vacationSettingFirst = await VacationSetting.query()
      .orderBy('vacation_setting_years_of_service', 'asc')
      .first()

    const exceptionTypeVacation = await ExceptionType.query()
      .where('exception_type_slug', 'vacation')
      .whereNull('exception_type_deleted_at')
      .first()

    const exceptionTypeHours = await ExceptionType.query()
      .where('exception_type_slug', 'leaving-during-work-hours')
      .whereNull('exception_type_deleted_at')
      .first()

    const recordProperty = await EmployeeRecordProperty.query()
      .where('employee_record_property_id', 1)
      .first()

    let demoBranch = await BranchOffice.query()
      .where('branch_office_slug', DEMO_BRANCH_OFFICE_SLUG)
      .whereNull('branch_office_deleted_at')
      .first()

    if (!demoBranch) {
      demoBranch = await BranchOfficeFactory.merge({
        businessUnitId,
        branchOfficeName: 'Sede central DEMO',
        branchOfficeSlug: DEMO_BRANCH_OFFICE_SLUG,
        branchOfficeIdealTemplateCount: 20,
        branchOfficeMinActiveEmployeesPerShift: 2,
        branchOfficeLocationAddress: null,
      }).create()
    }

    // Calcular fechas de referencia fuera del bucle
    let sundayRef = DateTime.now().minus({ days: 7 })
    while (sundayRef.weekday !== 7) sundayRef = sundayRef.minus({ days: 1 })
    const vacationExceptionDateStr = sundayRef.toFormat('yyyy-MM-dd')

    let permitDay = DateTime.now().minus({ weeks: 1 })
    while (permitDay.weekday === 6 || permitDay.weekday === 7)
      permitDay = permitDay.minus({ days: 1 })
    const permitDateStr = permitDay.toFormat('yyyy-MM-dd')

    let idx = 0
    for (const employee of createdEmployees) {
      idx++

      // Domicilio
      if (addressType) {
        const hasEa = await EmployeeAddress.query()
          .where('employee_id', employee.employeeId)
          .whereNull('employee_address_deleted_at')
          .first()
        if (!hasEa) {
          const address = await AddressFactory.merge({
            addressTypeId: addressType.addressTypeId,
          }).create()
          await EmployeeAddressFactory.merge({
            employeeId: employee.employeeId,
            addressId: address.addressId,
          }).create()
          result.employeeExtras.addresses++
        }
      }

      // Contacto de emergencia
      const hasEc = await EmployeeEmergencyContact.query()
        .where('employee_id', employee.employeeId)
        .whereNull('employee_emergency_contact_deleted_at')
        .first()
      if (!hasEc) {
        await EmployeeEmergencyContactFactory.merge({ employeeId: employee.employeeId }).create()
        result.employeeExtras.emergencyContacts++
      }

      // Expediente
      if (recordProperty) {
        const hasEr = await EmployeeRecord.query()
          .where('employee_id', employee.employeeId)
          .where('employee_record_property_id', recordProperty.employeeRecordPropertyId)
          .whereNull('employee_record_deleted_at')
          .first()
        if (!hasEr) {
          await EmployeeRecordFactory.merge({
            employeeId: employee.employeeId,
            employeeRecordPropertyId: recordProperty.employeeRecordPropertyId,
          }).create()
          result.employeeExtras.records++
        }
      }

      // Sucursal
      const hasBo = await EmployeeBranchOffice.query()
        .where('employee_id', employee.employeeId)
        .where('employee_branch_office_active', 1)
        .first()
      if (!hasBo) {
        await EmployeeBranchOfficeFactory.merge({
          employeeId: employee.employeeId,
          branchOfficeId: demoBranch.branchOfficeId,
        }).create()
        result.employeeExtras.branchOfficeAssignments++
      }

      // Excepción de vacaciones (~50 % de empleados)
      if (vacationSettingFirst && exceptionTypeVacation && idx % 2 === 0) {
        const hasVac = await ShiftException.query()
          .where('employee_id', employee.employeeId)
          .where('exception_type_id', exceptionTypeVacation.exceptionTypeId)
          .whereNull('shift_exceptions_deleted_at')
          .first()
        if (!hasVac) {
          await ShiftExceptionFactory.merge({
            employeeId: employee.employeeId,
            exceptionTypeId: exceptionTypeVacation.exceptionTypeId,
            shiftExceptionsDate: vacationExceptionDateStr,
            shiftExceptionsDescription: 'Vacaciones demo (día inhábil / histórico)',
            vacationSettingId: vacationSettingFirst.vacationSettingId,
          }).create()
          result.employeeExtras.vacations++
        }
      }

      // Permiso por horas (~33 % de empleados)
      if (exceptionTypeHours && idx % 3 === 0) {
        const hasPerm = await ShiftException.query()
          .where('employee_id', employee.employeeId)
          .where('exception_type_id', exceptionTypeHours.exceptionTypeId)
          .whereNull('shift_exceptions_deleted_at')
          .first()
        if (!hasPerm) {
          await ShiftExceptionFactory.merge({
            employeeId: employee.employeeId,
            exceptionTypeId: exceptionTypeHours.exceptionTypeId,
            shiftExceptionsDate: permitDateStr,
            shiftExceptionsDescription: 'Permiso por horas (demo)',
            shiftExceptionTimeByTime: 2,
            vacationSettingId: null,
          }).create()
          result.employeeExtras.permits++
        }
      }

      // Archivo de vacaciones (~25 % de empleados)
      if (vacationSettingFirst && idx % 4 === 0) {
        const hasArch = await EmployeeVacationArchive.query()
          .where('employee_id', employee.employeeId)
          .where('vacation_setting_id', vacationSettingFirst.vacationSettingId)
          .whereNull('employee_vacation_archive_deleted_at')
          .first()
        if (!hasArch) {
          const archive = await EmployeeVacationArchiveFactory.merge({
            employeeId: employee.employeeId,
            vacationSettingId: vacationSettingFirst.vacationSettingId,
          }).create()

          const hasContent = await EmployeeVacationArchiveContent.query()
            .where('employee_vacation_archive_id', archive.employeeVacationArchiveId)
            .whereNull('employee_vacation_archive_content_deleted_at')
            .first()
          if (!hasContent) {
            await EmployeeVacationArchiveContentFactory.merge({
              employeeVacationArchiveId: archive.employeeVacationArchiveId,
            }).create()
          }

          result.employeeExtras.vacationArchives++
        }
      }

      // Solicitud de excepción (~16 % de empleados, solo si tiene usuario)
      if (exceptionTypeVacation && idx % 6 === 0 && employee.personId > 0) {
        const demoUser = await User.query()
          .where('person_id', employee.personId)
          .whereNull('user_deleted_at')
          .first()

        if (demoUser) {
          const hasReq = await ExceptionRequest.query()
            .where('employee_id', employee.employeeId)
            .whereNull('exception_request_deleted_at')
            .first()
          if (!hasReq) {
            await ExceptionRequestFactory.merge({
              employeeId: employee.employeeId,
              exceptionTypeId: exceptionTypeVacation.exceptionTypeId,
              userId: demoUser.userId,
              requestedDate: permitDateStr,
              exceptionRequestDescription: 'Solicitud demo (aceptada)',
            }).create()
            result.employeeExtras.exceptionRequests++
          }
        }
      }
    }

    console.log(`[DEMO-SEED-ORG ${new Date().toISOString()}]`, 'fin', {
      departments: result.departments,
      positions: result.positions,
      shifts: result.shifts,
      employees: result.employees,
      users: result.users,
      employeeExtras: result.employeeExtras,
    })
  }

  // -------------------------------------------------------------------------
  // Paso 8: asistencias
  // -------------------------------------------------------------------------

  private async seedAssists(businessList: string[], result: DemoFactoryResult): Promise<void> {
    const t0 = `[DEMO-SEED-ASSISTS ${new Date().toISOString()}]`
    console.log(t0, 'inicio seedAssists', { businessList })
    const delayToleranceMinutes = await resolveToleranceMinutes('delay')
    const faultToleranceMinutes = await resolveToleranceMinutes('fault')

    const assistWindowEnd = demoAssistNow().endOf('day')
    const assistWindowStart = demoAssistNow()
      .startOf('day')
      .minus({ months: DEMO_ASSIST_HISTORY_MONTHS })

    const holidayRangeStart = assistWindowStart.toFormat('yyyy-MM-dd')
    const holidayRangeEnd = demoAssistNow().toFormat('yyyy-MM-dd')

    const holidaysQuery = Holiday.query()
      .whereNull('holiday_deleted_at')
      .whereBetween('holiday_date', [holidayRangeStart, holidayRangeEnd])

    if (businessList.length > 0) {
      holidaysQuery.andWhere((q) => {
        q.andWhere((sub) => {
          for (const b of businessList) {
            sub.orWhereRaw('FIND_IN_SET(?, holiday_business_units)', [b])
          }
        })
      })
    }

    const holidays = await holidaysQuery

    const holidayDates = holidays.map((h) => {
      const hd = h.holidayDate as any
      if (hd instanceof Date) return DateTime.fromJSDate(hd).toFormat('yyyy-MM-dd')
      if (typeof hd === 'string') return hd.split('T')[0]
      return DateTime.fromISO(String(hd)).toFormat('yyyy-MM-dd')
    })

    console.log(t0, 'ventana demo asistencias', {
      zonaCalendario: DEMO_ASSIST_CALENDAR_ZONE,
      hoyNegocio: demoAssistNow().toFormat('yyyy-MM-dd'),
      monthsRolling: DEMO_ASSIST_HISTORY_MONTHS,
      assistWindowStart: assistWindowStart.toFormat('yyyy-MM-dd'),
      assistWindowEnd: assistWindowEnd.toFormat('yyyy-MM-dd'),
      holidayRangeStart,
      holidayRangeEnd,
    })

    const allEmployees = await Employee.query()
      .preload('employeeShifts', (q) => q.preload('shift'))
      .whereNull('employee_deleted_at')

    console.log(t0, 'empleados candidatos a asistencias', {
      count: allEmployees.length,
      holidayCount: holidays.length,
      tolDelay: delayToleranceMinutes,
      tolFault: faultToleranceMinutes,
    })

    for (const employee of allEmployees) {
      let shiftModel: Shift | undefined = employee.employeeShifts?.[0]?.shift

      if (!shiftModel) {
        const link = await EmployeeShift.query()
          .where('employee_id', employee.employeeId)
          .whereNull('employe_shifts_deleted_at')
          .preload('shift')
          .first()
        shiftModel = link?.shift
      }

      if (!shiftModel) {
        console.log(t0, 'empleado sin turno, omitiendo asistencias', {
          employeeId: employee.employeeId,
        })
        continue
      }

      const shiftTimeStart = shiftModel.shiftTimeStart
      const shiftActiveHours = shiftModel.shiftActiveHours
      const restRaw = shiftModel.shiftRestDays ?? ''
      const restDays = restRaw
        .split(',')
        .map((s) => Number(String(s).trim()))
        .filter((n) => Number.isFinite(n))

      const existingAssist = await Assist.query()
        .where('assist_emp_id', employee.employeeId)
        .whereNull('assist_deleted_at')
        .whereBetween('assist_punch_time', [
          assistWindowStart.toFormat('yyyy-MM-dd HH:mm:ss'),
          assistWindowEnd.toFormat('yyyy-MM-dd HH:mm:ss'),
        ])
        .first()

      if (existingAssist) continue

      const workDays = buildWorkDays(
        restDays,
        holidayDates,
        DEMO_ASSIST_HISTORY_MONTHS,
        'rollingFromToday'
      )
      const { onTimeDays, toleranceDays, delayDays, faultDays } = distributeWorkDays(workDays)

      let pairsThisEmployee = 0

      const savePair = async (workDate: string, type: 'on_time' | 'tolerance' | 'delay') => {
        const punchIn = buildPunchTime({
          workDate,
          shiftTimeStart,
          shiftActiveHours,
          delayToleranceMinutes,
          faultToleranceMinutes,
          type,
        })
        if (!punchIn) return

        await AssistFactory.merge({
          businessUnitId: employee.businessUnitId,
          assistEmpId: employee.employeeId,
          assistEmpCode: String(employee.employeeCode),
          assistPunchTime: punchIn,
          assistPunchTimeUtc: punchIn,
          assistPunchTimeOrigin: punchIn,
          assistUploadTime: punchIn,
          assistSyncId: 0,
        }).create()

        const punchOut = punchIn.plus({ hours: shiftActiveHours })
        await AssistFactory.merge({
          businessUnitId: employee.businessUnitId,
          assistEmpId: employee.employeeId,
          assistEmpCode: String(employee.employeeCode),
          assistPunchTime: punchOut,
          assistPunchTimeUtc: punchOut,
          assistPunchTimeOrigin: punchOut,
          assistUploadTime: punchOut,
          assistSyncId: 0,
        }).create()

        pairsThisEmployee++
        result.assists.pairs++
      }

      for (const d of onTimeDays) await savePair(d, 'on_time')
      for (const d of toleranceDays) await savePair(d, 'tolerance')
      for (const d of delayDays) await savePair(d, 'delay')

      if (pairsThisEmployee > 0) result.assists.employees++

      console.log(t0, 'asistencias empleado', {
        employeeId: employee.employeeId,
        workDays: workDays.length,
        onTime: onTimeDays.length,
        tolerance: toleranceDays.length,
        delay: delayDays.length,
        fault: faultDays.length,
        pairs: pairsThisEmployee,
      })
    }

    console.log(t0, 'fin seedAssists', result.assists)
  }
}
