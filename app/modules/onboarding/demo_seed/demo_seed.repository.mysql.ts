import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { I18n } from '@adonisjs/i18n'
import Department from '#models/department'
import DepartmentPosition from '#models/department_position'
import Employee from '#models/employee'
import EmployeeShift from '#models/employee_shift'
import EmployeeType from '#models/employee_type'
import ExceptionType from '#models/exception_type'
import OnboardingSeededRecord from '#models/onboarding_seeded_record'
import OnboardingUserState from '#models/onboarding_user_state'
import Person from '#models/person'
import Position from '#models/position'
import Shift from '#models/shift'
import ShiftException from '#models/shift_exception'
import User from '#models/user'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import VacationSetting from '#models/vacation_setting'
import EmployeeService from '#services/employee_service'
import PersonService from '#services/person_service'
import RoleService from '#services/role_service'
import UserService from '#services/user_service'
import SimulateAttendanceService from '#modules/onboarding/simulate_attendance/simulate_attendance.service'
import type { OnboardingSeededEntityType } from '#modules/onboarding/onboarding.constants'
import { generateDemoEmailSuffix } from './helpers/demo_password.js'
import type {
  CreateSeededPackageInput,
  DemoSeedRepository,
  SeededPackageEntities,
} from './demo_seed.repository.js'

/**
 * Defaults del paquete demo, espejados del wizard viejo del BO
 * (use-setup-structure / use-first-employee / use-create-shift). El empleado
 * de práctica no lleva RFC/CURP/NSS (regla 8: cero PII sintética) y nace con
 * dos años de antigüedad para que vacaciones muestre saldo conforme a la LFT
 * con la política global ya sembrada (0021, catálogo que NO se toca).
 */
const DEMO_DEPARTMENT_NAME = 'Recursos Humanos (Demo)'
const DEMO_POSITION_NAME = 'Auxiliar Administrativo (Demo)'
const DEMO_SHIFT_NAME = 'Turno Principal (Demo)'
const DEMO_SHIFT_TIME_START = '09:00:00'
const DEMO_SHIFT_ACTIVE_HOURS = 8
const DEMO_SHIFT_REST_DAYS = '0,6'
const DEMO_EMPLOYEE_FIRST_NAME = 'Valentina'
const DEMO_EMPLOYEE_LAST_NAME = 'Demo'
const DEMO_EMPLOYEE_SECOND_LAST_NAME = 'Anserh'
const DEMO_VACATION_YEARS_OF_SERVICE = 2

export default class DemoSeedRepositoryMysql implements DemoSeedRepository {
  private readonly i18n: I18n

  constructor(i18n: I18n) {
    this.i18n = i18n
  }

  async lockUserState(
    userId: number,
    trx: TransactionClientContract
  ): Promise<OnboardingUserState> {
    await OnboardingUserState.firstOrCreate(
      { userId },
      {
        onboardingFlowId: null,
        onboardingUserStateIntentSlug: null,
        onboardingUserStateStatus: 'pending',
        startedAt: null,
        completedAt: null,
      },
      { client: trx }
    )

    return OnboardingUserState.query({ client: trx })
      .where('user_id', userId)
      .forUpdate()
      .firstOrFail()
  }

  async listSeededRecords(
    onboardingUserStateId: number,
    trx?: TransactionClientContract
  ): Promise<OnboardingSeededRecord[]> {
    return OnboardingSeededRecord.query({ client: trx })
      .where('onboarding_user_state_id', onboardingUserStateId)
      .orderBy('onboarding_seeded_record_id')
  }

  async buildUniqueDemoEmail(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<string> {
    // TLD .invalid (RFC 2606): jamás ruteable. La unicidad de user_email es de
    // aplicación entre no borrados (la BD ya no tiene unique) — se repite aquí
    // el check del validador de users.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `demo+bu${businessUnitId}-${generateDemoEmailSuffix()}@onboarding.valanserh.invalid`
      const taken = await User.query({ client: trx })
        .whereNull('user_deleted_at')
        .where('user_email', candidate)
        .first()
      if (!taken) {
        return candidate
      }
    }
    throw new Error('No fue posible generar un correo demo único tras varios intentos')
  }

  async createSeededPackage(
    input: CreateSeededPackageInput,
    trx: TransactionClientContract
  ): Promise<SeededPackageEntities> {
    const now = DateTime.now()
    const codeStamp = `DEMO-${Date.now()}`
    const tracked: Array<{ type: OnboardingSeededEntityType; id: number }> = []

    // 1. Departamento y puesto (con su vínculo), dentro de la empresa activa.
    const department = new Department()
    department.departmentCode = codeStamp
    department.departmentName = DEMO_DEPARTMENT_NAME
    department.departmentAlias = DEMO_DEPARTMENT_NAME
    department.departmentIsDefault = false
    department.departmentActive = 1
    department.parentDepartmentId = null
    department.companyId = input.businessUnitId
    department.businessUnitId = input.businessUnitId
    department.useTransaction(trx)
    await department.save()
    tracked.push({ type: 'department', id: department.departmentId })

    const position = new Position()
    position.positionCode = codeStamp
    position.positionName = DEMO_POSITION_NAME
    position.positionAlias = DEMO_POSITION_NAME
    position.positionIsDefault = false
    position.positionActive = 1
    position.parentPositionId = null
    position.companyId = input.businessUnitId
    position.businessUnitId = input.businessUnitId
    position.useTransaction(trx)
    await position.save()
    tracked.push({ type: 'position', id: position.positionId })

    const departmentPosition = new DepartmentPosition()
    departmentPosition.departmentId = department.departmentId
    departmentPosition.positionId = position.positionId
    departmentPosition.businessUnitId = input.businessUnitId
    departmentPosition.useTransaction(trx)
    await departmentPosition.save()
    tracked.push({ type: 'department_position', id: departmentPosition.departmentPositionId })

    // 2. Persona del empleado de práctica: sin RFC/CURP/NSS (regla 8).
    const personService = new PersonService(this.i18n)
    const personData = new Person()
    personData.personFirstname = DEMO_EMPLOYEE_FIRST_NAME
    personData.personLastname = DEMO_EMPLOYEE_LAST_NAME
    personData.personSecondLastname = DEMO_EMPLOYEE_SECOND_LAST_NAME
    const person = await personService.create(personData, trx)
    tracked.push({ type: 'person', id: person.personId })

    // 3. Empleado de práctica con dos años de antigüedad.
    const employeeType = await EmployeeType.query({ client: trx })
      .where('employee_type_slug', 'employee')
      .whereNull('employee_type_deleted_at')
      .firstOrFail()

    const employee = new Employee()
    employee.employeeFirstName = DEMO_EMPLOYEE_FIRST_NAME
    employee.employeeLastName = DEMO_EMPLOYEE_LAST_NAME
    employee.employeeSecondLastName = DEMO_EMPLOYEE_SECOND_LAST_NAME
    employee.employeeCode = `DEMO-${input.businessUnitId}-${Date.now().toString(36)}`
    employee.employeeHireDate = now.minus({ years: 2 })
    employee.companyId = input.businessUnitId
    employee.departmentId = department.departmentId
    employee.positionId = position.positionId
    employee.personId = person.personId
    employee.businessUnitId = input.businessUnitId
    employee.payrollBusinessUnitId = input.businessUnitId
    employee.dailySalary = 0
    employee.employeeWorkSchedule = 'Onsite'
    employee.employeeTypeId = employeeType.employeeTypeId
    employee.employeeAssistDiscriminator = 0
    employee.employeeIgnoreConsecutiveAbsences = 0
    employee.employeeAuthorizeAnyZones = 0
    employee.useTransaction(trx)
    await employee.save()
    const employeeService = new EmployeeService(this.i18n)
    await employeeService.updateEmployeeSlug(employee, trx)
    tracked.push({ type: 'employee', id: employee.employeeId })

    // El admin que siembra queda como responsable del empleado demo: sin este
    // vínculo, los usuarios no-root (el owner) no lo ven en el módulo de
    // empleados ni en el monitor (EmployeeService.getById filtra por
    // user_responsible_employee) y el tour muere en 404.
    const responsible = new UserResponsibleEmployee()
    responsible.userId = input.adminUserId
    responsible.employeeId = employee.employeeId
    // BU estampada aquí: el hook beforeCreate la resolvería consultando al
    // empleado FUERA de la transacción y no vería la fila recién creada.
    responsible.businessUnitId = input.businessUnitId
    responsible.useTransaction(trx)
    await responsible.save()
    tracked.push({
      type: 'user_responsible_employee',
      id: responsible.userResponsibleEmployeeId,
    })

    // 4. Usuario demo para la app del empleado (rol de sistema `empleado`,
    //    JAMÁS root; UserService.create hace el attach de business_unit_users
    //    sin side effect de correo — POST /api/users está prohibido aquí).
    const employeeRole = await new RoleService().findRoleBySlug('empleado')
    if (!employeeRole) {
      throw new Error('El rol de sistema "empleado" no existe en el catálogo de roles')
    }
    const userService = new UserService(this.i18n)
    const userData = new User()
    userData.userEmail = input.demoEmail
    userData.userPassword = input.demoPassword
    userData.userActive = 1
    userData.roleId = employeeRole.roleId
    userData.personId = person.personId
    userData.userEmailType = 'institutional'
    const user = await userService.create(userData, [input.businessUnitId], trx)
    tracked.push({ type: 'user', id: user.userId })

    // 5. Turno y asignación (apply_since cubre las checadas de días previos).
    const shift = new Shift()
    shift.shiftName = DEMO_SHIFT_NAME
    shift.shiftTimeStart = DEMO_SHIFT_TIME_START
    shift.shiftActiveHours = DEMO_SHIFT_ACTIVE_HOURS
    shift.shiftRestDays = DEMO_SHIFT_REST_DAYS
    shift.shiftBusinessUnits = input.businessUnitSlug
    shift.businessUnitId = input.businessUnitId
    shift.useTransaction(trx)
    await shift.save()
    tracked.push({ type: 'shift', id: shift.shiftId })

    const employeeShift = new EmployeeShift()
    employeeShift.employeeId = employee.employeeId
    employeeShift.shiftId = shift.shiftId
    employeeShift.businessUnitId = input.businessUnitId
    employeeShift.employeShiftsApplySince = `${now.minus({ days: 7 }).toFormat('yyyy-LL-dd')} 00:00:00`
    employeeShift.useTransaction(trx)
    await employeeShift.save()
    tracked.push({ type: 'employee_shift', id: employeeShift.employeeShiftId })

    // 6. Checadas de ejemplo: días hábiles de los últimos 7 días naturales.
    const simulateService = new SimulateAttendanceService()
    const attendanceDates: string[] = []
    let attendanceCheckIn = ''
    let attendanceCheckOut = ''
    for (let daysAgo = 7; daysAgo >= 1; daysAgo--) {
      const day = now.minus({ days: daysAgo })
      if (day.weekday === 6 || day.weekday === 7) {
        continue
      }
      const dateIso = day.toFormat('yyyy-LL-dd')
      const simulated = await simulateService.simulate(
        { employeeId: employee.employeeId, shiftId: shift.shiftId, date: dateIso },
        trx
      )
      attendanceDates.push(dateIso)
      attendanceCheckIn = simulated.checkIn
      attendanceCheckOut = simulated.checkOut
      for (const assistId of simulated.assistIds) {
        tracked.push({ type: 'assist', id: assistId })
      }
    }

    // 7. Dos vacaciones de ejemplo en los próximos días hábiles (desde hoy+7),
    //    con la política LFT del tramo de 2 años (catálogo global intocable).
    const vacationExceptionType = await ExceptionType.query({ client: trx })
      .where('exception_type_slug', 'vacation')
      .whereNull('exception_type_deleted_at')
      .firstOrFail()
    const vacationSetting = await VacationSetting.query({ client: trx })
      .where('vacation_setting_years_of_service', DEMO_VACATION_YEARS_OF_SERVICE)
      .whereNull('vacation_setting_deleted_at')
      .orderBy('vacation_setting_apply_since', 'desc')
      .first()

    const vacationDates: string[] = []
    let cursor = now.plus({ days: 7 })
    while (vacationDates.length < 2) {
      if (cursor.weekday !== 6 && cursor.weekday !== 7) {
        vacationDates.push(cursor.toFormat('yyyy-LL-dd'))
      }
      cursor = cursor.plus({ days: 1 })
    }

    for (const vacationDate of vacationDates) {
      const shiftException = new ShiftException()
      shiftException.employeeId = employee.employeeId
      shiftException.businessUnitId = input.businessUnitId
      shiftException.exceptionTypeId = vacationExceptionType.exceptionTypeId
      shiftException.shiftExceptionsDate = vacationDate
      shiftException.shiftExceptionsDescription = 'Vacaciones de ejemplo del recorrido guiado'
      shiftException.shiftExceptionEnjoymentOfSalary = 1
      shiftException.vacationSettingId = vacationSetting?.vacationSettingId ?? null
      shiftException.useTransaction(trx)
      await shiftException.save()
      tracked.push({ type: 'shift_exception', id: shiftException.shiftExceptionId })
    }

    // 8. Tracking pieza por pieza con snapshot de BU (el borrado posterior
    //    borra EXACTAMENTE esto; jamás heurísticas).
    await OnboardingSeededRecord.createMany(
      tracked.map((entry) => ({
        onboardingUserStateId: input.onboardingUserStateId,
        businessUnitId: input.businessUnitId,
        onboardingSeededRecordEntityType: entry.type,
        onboardingSeededRecordEntityId: entry.id,
      })),
      { client: trx }
    )

    return {
      department,
      position,
      employee,
      shift,
      user,
      attendanceDates,
      attendanceCheckIn,
      attendanceCheckOut,
      vacationDates,
    }
  }

  async loadSeededPackage(
    records: OnboardingSeededRecord[],
    trx?: TransactionClientContract
  ): Promise<SeededPackageEntities> {
    const idsByType = this.groupIdsByType(records)

    const [department, position, employee, shift, user] = await Promise.all([
      Department.query({ client: trx })
        .whereIn('department_id', idsByType.get('department') ?? [0])
        .firstOrFail(),
      Position.query({ client: trx })
        .whereIn('position_id', idsByType.get('position') ?? [0])
        .firstOrFail(),
      Employee.query({ client: trx })
        .whereIn('employee_id', idsByType.get('employee') ?? [0])
        .firstOrFail(),
      Shift.query({ client: trx })
        .whereIn('shift_id', idsByType.get('shift') ?? [0])
        .firstOrFail(),
      User.query({ client: trx })
        .whereIn('user_id', idsByType.get('user') ?? [0])
        .firstOrFail(),
    ])

    const assistIds = idsByType.get('assist') ?? []
    const attendanceDates =
      assistIds.length > 0
        ? await this.resolveAssistDates(assistIds, trx)
        : []

    const exceptionIds = idsByType.get('shift_exception') ?? []
    let vacationDates: string[] = []
    if (exceptionIds.length > 0) {
      const exceptions = await ShiftException.query({ client: trx }).whereIn(
        'shift_exception_id',
        exceptionIds
      )
      vacationDates = exceptions.map((exception) => this.formatDate(exception.shiftExceptionsDate))
    }

    const checkIn = shift.shiftTimeStart.slice(0, 5)
    const checkOutHour =
      DateTime.fromFormat(shift.shiftTimeStart, 'HH:mm:ss').plus({
        hours: shift.shiftActiveHours,
      })

    return {
      department,
      position,
      employee,
      shift,
      user,
      attendanceDates,
      attendanceCheckIn: checkIn,
      attendanceCheckOut: checkOutHour.isValid ? checkOutHour.toFormat('HH:mm') : '',
      vacationDates,
    }
  }

  async findSeededUser(
    records: OnboardingSeededRecord[],
    trx?: TransactionClientContract
  ): Promise<User | null> {
    const idsByType = this.groupIdsByType(records)
    const userIds = idsByType.get('user') ?? []
    if (userIds.length === 0) {
      return null
    }
    return User.query({ client: trx })
      .whereIn('user_id', userIds)
      .whereNull('user_deleted_at')
      .first()
  }

  private groupIdsByType(
    records: OnboardingSeededRecord[]
  ): Map<OnboardingSeededEntityType, number[]> {
    const map = new Map<OnboardingSeededEntityType, number[]>()
    for (const record of records) {
      const list = map.get(record.onboardingSeededRecordEntityType) ?? []
      list.push(record.onboardingSeededRecordEntityId)
      map.set(record.onboardingSeededRecordEntityType, list)
    }
    return map
  }

  private async resolveAssistDates(
    assistIds: number[],
    trx?: TransactionClientContract
  ): Promise<string[]> {
    const { default: Assist } = await import('#models/assist')
    const assists = await Assist.query({ client: trx }).whereIn('assist_id', assistIds)
    const dates = new Set<string>()
    for (const assist of assists) {
      dates.add(this.formatDate(assist.assistPunchTime))
    }
    return [...dates].sort()
  }

  private formatDate(value: unknown): string {
    if (value instanceof DateTime) {
      return value.toFormat('yyyy-LL-dd')
    }
    if (value instanceof Date) {
      return DateTime.fromJSDate(value).toFormat('yyyy-LL-dd')
    }
    return String(value).slice(0, 10)
  }
}
