import { DateTime } from 'luxon'
import env from '#start/env'
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

import { PersonFactory, resetDemoPeopleIndex } from '#database/factories/person_factory'
import { EmployeeFactory, DEMO_POSITION_ASSIGNMENTS } from '#database/factories/employee_factory'
import { AssistFactory, buildWorkDays, distributeWorkDays, buildPunchTime } from '#database/factories/assist_factory'
import { DepartmentFactory, DEMO_DEPARTMENTS } from '#database/factories/department_factory'
import { PositionFactory, DEMO_POSITIONS } from '#database/factories/position_factory'
import { ShiftFactory, DEMO_SHIFTS, DEMO_DEFAULT_SHIFT_NAME } from '#database/factories/shift_factory'
import { UserFactory, DEMO_ROOT_USERS, DEMO_DEFAULT_PASSWORD, DEMO_ROLE_RULES } from '#database/factories/user_factory'
import { AddressFactory } from '#database/factories/address_factory'
import { EmployeeAddressFactory } from '#database/factories/employee_address_factory'
import { EmployeeEmergencyContactFactory } from '#database/factories/employee_emergency_contact_factory'
import { EmployeeRecordFactory } from '#database/factories/employee_record_factory'
import { BranchOfficeFactory, DEMO_BRANCH_OFFICE_SLUG } from '#database/factories/branch_office_factory'
import { EmployeeBranchOfficeFactory } from '#database/factories/employee_branch_office_factory'
import { ShiftExceptionFactory } from '#database/factories/shift_exception_factory'
import { EmployeeVacationArchiveFactory } from '#database/factories/employee_vacation_archive_factory'
import { EmployeeVacationArchiveContentFactory } from '#database/factories/employee_vacation_archive_content_factory'
import { ExceptionRequestFactory } from '#database/factories/exception_request_factory'

// ---------------------------------------------------------------------------
// Resultado estructurado por paso
// ---------------------------------------------------------------------------

export interface DemoFactoryResult {
  departments:     { created: number; total: number }
  positions:       { created: number; total: number }
  shifts:          { created: number; total: number }
  employees:       { created: number; total: number }
  users:           { created: number; total: number }
  employeeExtras:  {
    addresses: number
    emergencyContacts: number
    records: number
    branchOfficeAssignments: number
    vacations: number
    permits: number
    vacationArchives: number
    exceptionRequests: number
  }
  assists:         { employees: number; pairs: number }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

async function resolveToleranceMinutes(type: 'delay' | 'fault'): Promise<number> {
  const systemSetting = await SystemSetting.query()
    .where('system_setting_active', 1)
    .first()

  if (!systemSetting) return 10

  const name = type === 'delay' ? 'Delay' : 'TardinessTolerance'
  const row  = await Tolerance.query()
    .where('system_setting_id', systemSetting.systemSettingId)
    .where('tolerance_name', name)
    .whereNull('tolerance_deleted_at')
    .first()

  return row?.toleranceMinutes ?? 10
}

// ---------------------------------------------------------------------------
// Servicio principal
// ---------------------------------------------------------------------------

/**
 * DemoFactoryService
 *
 * Contiene toda la lógica de generación de datos DEMO usando factories de
 * AdonisJS Lucid. Es el único lugar donde vive esa lógica; tanto el seeder
 * (`DemoSeeder`) como el endpoint HTTP (`EstructureDemoController.generateFactoryDemo`)
 * delegan en este servicio.
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
 *  8. Asistencias (distribución 90/5/3/2)
 */
export default class DemoFactoryService {
  // -------------------------------------------------------------------------
  // Punto de entrada público
  // -------------------------------------------------------------------------

  async run(): Promise<DemoFactoryResult> {
    const result: DemoFactoryResult = {
      departments:    { created: 0, total: 0 },
      positions:      { created: 0, total: 0 },
      shifts:         { created: 0, total: 0 },
      employees:      { created: 0, total: 0 },
      users:          { created: 0, total: 0 },
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

    // 0. Contexto base
    const businessConf   = `${env.get('SYSTEM_BUSINESS')}`
    const businessList   = businessConf.split(',').map((u: string) => u.trim()).filter(Boolean)
    const systemBusiness = businessConf

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_active', 1)
      .whereIn('business_unit_slug', businessList)
      .first()
    const businessUnitId = businessUnit?.businessUnitId ?? 0

    const employeeType = await EmployeeType.query()
      .where('employee_type_slug', 'employee')
      .whereNull('employee_type_deleted_at')
      .first()
    const employeeTypeId = employeeType?.employeeTypeId ?? 1

    // 1–7
    await this.seedOrganizationAndPeople(
      businessUnitId, employeeTypeId, systemBusiness, result
    )

    // 8. Asistencias
    await this.seedAssists(businessList, result)

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
            departmentCode:     deptData.code,
            departmentName:     deptData.name,
            departmentAlias:    deptData.alias,
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
          departmentCode:     deptData.code,
          departmentName:     deptData.name,
          departmentAlias:    deptData.alias,
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
            positionCode:     posData.code,
            positionName:     posData.name,
            positionAlias:    posData.alias,
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
          dp.positionId   = pos.positionId
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
          positionCode:     posData.code,
          positionName:     posData.name,
          positionAlias:    posData.alias,
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
          dp.positionId   = pos.positionId
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
          shiftName:             shiftData.shiftName,
          shiftTimeStart:        shiftData.shiftTimeStart,
          shiftActiveHours:      shiftData.shiftActiveHours,
          shiftRestDays:         shiftData.shiftRestDays,
          shiftAccumulatedFault: shiftData.shiftAccumulatedFault,
          shiftCalculateFlag:    shiftData.shiftCalculateFlag,
          shiftDayStart:         shiftData.shiftDayStart,
          shiftTemp:             shiftData.shiftTemp,
          shiftColor:            shiftData.shiftColor,
          shiftBusinessUnits:    systemBusiness,
        }).create()
        result.shifts.created++
      }

      shiftsMap[shiftData.shiftName] = shift
      result.shifts.total++
    }

    const defaultShift = shiftsMap[DEMO_DEFAULT_SHIFT_NAME]

    // --- 4. Empleados + Personas --------------------------------------------
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

      const existingEmp = await Employee.query()
        .whereHas('person', (pq) => { pq.where('person_email', personData.personEmail) })
        .whereNull('employee_deleted_at')
        .first()

      if (existingEmp) {
        createdEmployees.push(existingEmp)
        codeCounter++
        continue
      }

      const code = String(codeCounter).padStart(4, '0')

      const employee = await EmployeeFactory.merge({
        employeeCode:          code,
        employeeFirstName:     personData.personFirstname,
        employeeLastName:      personData.personLastname,
        employeeSecondLastName: personData.personSecondLastname ?? '.',
        employeePayrollNum:    code,
        employeePayrollCode:   code,
        personId:              personData.personId,
        positionId:            assignment.positionId,
        departmentId:          assignment.departmentId,
        businessUnitId,
        payrollBusinessUnitId: businessUnitId,
        employeeTypeId,
        dailySalary:           1000,
      }).create()

      createdEmployees.push(employee)
      result.employees.created++
      codeCounter++
    }

    result.employees.total = createdEmployees.length

    // --- 5. Asignar turno por defecto a empleados ---------------------------
    if (defaultShift) {
      for (const employee of createdEmployees) {
        const existsShift = await EmployeeShift.query()
          .where('employee_id', employee.employeeId)
          .whereNull('employe_shifts_deleted_at')
          .first()

        if (!existsShift) {
          const empShift = new EmployeeShift()
          empShift.employeeId              = employee.employeeId
          empShift.shiftId                 = defaultShift.shiftId
          empShift.employeShiftsApplySince = DateTime.now().toFormat('yyyy-MM-dd')
          await empShift.save()
        }
      }
    }

    // --- 6a. Usuarios para empleados demo -----------------------------------
    const directorPos  = positionsMap[DEMO_ROLE_RULES.directorPositionAlias] ?? null
    const hrDept       = departmentsMap[DEMO_ROLE_RULES.hrDepartmentAlias]   ?? null
    const roleDirector = await Role.query().where('role_slug', DEMO_ROLE_RULES.roles.director).first()
    const roleHr       = await Role.query().where('role_slug', DEMO_ROLE_RULES.roles.hr).first()
    const roleEmployee = await Role.query().where('role_slug', DEMO_ROLE_RULES.roles.employee).first()

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

      await UserFactory.merge({
        userEmail:          emp.person.personEmail,
        roleId,
        personId:           emp.person.personId,
        userBusinessAccess: systemBusiness,
      }).create()

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
      rootPerson.personFirstname           = rootData.firstname
      rootPerson.personLastname            = rootData.lastname
      rootPerson.personSecondLastname      = 'gsti'
      rootPerson.personGender              = ''
      rootPerson.personBirthday            = null
      rootPerson.personPhone               = ''
      rootPerson.personEmail               = rootData.email
      rootPerson.personPhoneSecondary      = ''
      rootPerson.personCurp                = ''
      rootPerson.personRfc                 = ''
      rootPerson.personImssNss             = ''
      rootPerson.personMaritalStatus       = ''
      rootPerson.personPlaceOfBirthCountry = ''
      rootPerson.personPlaceOfBirthState   = ''
      rootPerson.personPlaceOfBirthCity    = ''
      await rootPerson.save()

      await UserFactory.merge({
        userEmail:          rootData.email,
        userPassword:       DEMO_DEFAULT_PASSWORD,
        roleId:             rootRole?.roleId ?? 1,
        personId:           rootPerson.personId,
        userBusinessAccess: systemBusiness,
      }).create()

      result.users.created++

      const fallbackShift = defaultShift ?? await Shift.query().whereNull('shift_deleted_at').first()
      if (fallbackShift) {
        const prefix      = `DEMO-ROOT-${Date.now()}-${index + 1}`
        const empCode     = `ROOT-${prefix}`

        const rootEmployee = await EmployeeFactory.merge({
          employeeCode:          empCode,
          employeeFirstName:     rootData.firstname,
          employeeLastName:      rootData.lastname,
          employeeSecondLastName:'gsti',
          employeePayrollNum:    empCode,
          employeePayrollCode:   empCode,
          personId:              rootPerson.personId,
          positionId:            999,
          departmentId:          999,
          businessUnitId,
          payrollBusinessUnitId: businessUnitId,
          employeeTypeId,
          dailySalary:           0,
        }).create()

        const rootEmpShift = new EmployeeShift()
        rootEmpShift.employeeId              = rootEmployee.employeeId
        rootEmpShift.shiftId                 = fallbackShift.shiftId
        rootEmpShift.employeShiftsApplySince = DateTime.now().toFormat('yyyy-MM-dd')
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
        branchOfficeName:                  'Sede central DEMO',
        branchOfficeSlug:                  DEMO_BRANCH_OFFICE_SLUG,
        branchOfficeIdealTemplateCount:    20,
        branchOfficeMinActiveEmployeesPerShift: 2,
        branchOfficeLocationAddress:       null,
      }).create()
    }

    // Calcular fechas de referencia fuera del bucle
    let sundayRef = DateTime.now().minus({ days: 7 })
    while (sundayRef.weekday !== 7) sundayRef = sundayRef.minus({ days: 1 })
    const vacationExceptionDateStr = sundayRef.toFormat('yyyy-MM-dd')

    let permitDay = DateTime.now().minus({ weeks: 1 })
    while (permitDay.weekday === 6 || permitDay.weekday === 7) permitDay = permitDay.minus({ days: 1 })
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
          const address = await AddressFactory.merge({ addressTypeId: addressType.addressTypeId }).create()
          await EmployeeAddressFactory.merge({
            employeeId: employee.employeeId,
            addressId:  address.addressId,
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
            employeeId:              employee.employeeId,
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
          employeeId:    employee.employeeId,
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
            employeeId:              employee.employeeId,
            exceptionTypeId:         exceptionTypeVacation.exceptionTypeId,
            shiftExceptionsDate:     vacationExceptionDateStr,
            shiftExceptionsDescription: 'Vacaciones demo (día inhábil / histórico)',
            vacationSettingId:       vacationSettingFirst.vacationSettingId,
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
            employeeId:              employee.employeeId,
            exceptionTypeId:         exceptionTypeHours.exceptionTypeId,
            shiftExceptionsDate:     permitDateStr,
            shiftExceptionsDescription: 'Permiso por horas (demo)',
            shiftExceptionTimeByTime: 2,
            vacationSettingId:       null,
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
            employeeId:        employee.employeeId,
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
              employeeId:                  employee.employeeId,
              exceptionTypeId:             exceptionTypeVacation.exceptionTypeId,
              userId:                      demoUser.userId,
              requestedDate:               permitDateStr,
              exceptionRequestDescription: 'Solicitud demo (aceptada)',
            }).create()
            result.employeeExtras.exceptionRequests++
          }
        }
      }
    }

  }

  // -------------------------------------------------------------------------
  // Paso 8: asistencias
  // -------------------------------------------------------------------------

  private async seedAssists(
    businessList: string[],
    result: DemoFactoryResult
  ): Promise<void> {
    const delayToleranceMinutes = await resolveToleranceMinutes('delay')
    const faultToleranceMinutes = await resolveToleranceMinutes('fault')

    const holidays = await Holiday.query()
      .whereNull('holiday_deleted_at')
      .whereBetween('holiday_date', [
        DateTime.now().minus({ months: 1 }).startOf('month').toFormat('yyyy-MM-dd'),
        DateTime.now().toFormat('yyyy-MM-dd'),
      ])
      .andWhere((q) => {
        q.andWhere((sub) => {
          businessList.forEach((b) => {
            sub.orWhereRaw('FIND_IN_SET(?, holiday_business_units)', [b])
          })
        })
      })

    const holidayDates = holidays.map((h) => {
      const hd = h.holidayDate as any
      if (hd instanceof Date) return DateTime.fromJSDate(hd).toFormat('yyyy-MM-dd')
      if (typeof hd === 'string') return hd.split('T')[0]
      return DateTime.fromISO(String(hd)).toFormat('yyyy-MM-dd')
    })

    const allEmployees = await Employee.query()
      .preload('employeeShifts', (q) => q.preload('shift'))
      .whereNull('employee_deleted_at')

    for (const employee of allEmployees) {
      const empShift = employee.employeeShifts?.[0]
      if (!empShift?.shift) continue

      const shift            = empShift.shift
      const shiftTimeStart   = shift.shiftTimeStart
      const shiftActiveHours = shift.shiftActiveHours
      const restDays         = shift.shiftRestDays.split(',').map(Number)

      const existingAssist = await Assist.query()
        .where('assist_emp_id', employee.employeeId)
        .whereNull('assist_deleted_at')
        .whereBetween('assist_punch_time', [
          DateTime.now().minus({ months: 1 }).startOf('month').toFormat('yyyy-MM-dd HH:mm:ss'),
          DateTime.now().endOf('day').toFormat('yyyy-MM-dd HH:mm:ss'),
        ])
        .first()

      if (existingAssist) continue

      const workDays = buildWorkDays(restDays, holidayDates, 1)
      const { onTimeDays, toleranceDays, delayDays } = distributeWorkDays(workDays)

      const savePair = async (workDate: Date, type: 'on_time' | 'tolerance' | 'delay') => {
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
          assistEmpId:           employee.employeeId,
          assistEmpCode:         String(employee.employeeCode),
          assistPunchTime:       punchIn,
          assistPunchTimeUtc:    punchIn,
          assistPunchTimeOrigin: punchIn,
          assistUploadTime:      punchIn,
          assistSyncId:          0,
        }).create()

        const punchOut = punchIn.plus({ hours: shiftActiveHours })
        await AssistFactory.merge({
          assistEmpId:           employee.employeeId,
          assistEmpCode:         String(employee.employeeCode),
          assistPunchTime:       punchOut,
          assistPunchTimeUtc:    punchOut,
          assistPunchTimeOrigin: punchOut,
          assistUploadTime:      punchOut,
          assistSyncId:          0,
        }).create()

        result.assists.pairs++
      }

      for (const d of onTimeDays)    await savePair(d, 'on_time')
      for (const d of toleranceDays) await savePair(d, 'tolerance')
      for (const d of delayDays)     await savePair(d, 'delay')

      result.assists.employees++
    }
  }
}
