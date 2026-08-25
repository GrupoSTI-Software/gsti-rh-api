import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import Department from './department.js'
import Position from './position.js'
import PositionPositionLevel from './position_position_level.js'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import Person from './person.js'
import ShiftException from './shift_exception.js'
import BusinessUnit from './business_unit.js'
import EmployeeType from './employee_type.js'
import EmployeeAddress from './employee_address.js'
import EmployeeTeleworkLocation from './employee_telework_location.js'
import EmployeeSpouse from './employee_spouse.js'
import EmployeeChildren from './employee_children.js'
import EmployeeEmergencyContact from './employee_emergency_contact.js'
import EmployeeShiftChange from './employee_shift_changes.js'
import UserResponsibleEmployee from './user_responsible_employee.js'
import EmployeeShift from './employee_shift.js'
import EmployeeBonus from './employee_bonus.js'
import EmployeeAssessment from './employee_assessment.js'
import EmployeeBranchOffice from './employee_branch_office.js'
import EmployeeTemporaryAssignment from './employee_temporary_assignment.js'
import AsignacionContratoEspecializado from './asignacion_contrato_especializado.js'
import EmployeeSalaryHistory from './employee_salary_history.js'
import EmployeeCertification from './employee_certification.js'
import type {
  EmployeeHybridConfig,
  EmployeeHybridMode,
  EmployeeWorkSchedule,
} from '#constants/employee_work_schedule'
import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'

/**
 * @swagger
 * components:
 *   schemas:
 *      Employee:
 *        type: object
 *        properties:
 *          employeeId:
 *            type: number
 *            description: Employee Id
 *          employeeSyncId:
 *            type: number
 *            description: Imported employee ID
 *          employeeCode:
 *            type: number
 *            description: Employee code
 *          employeeFirstName:
 *            type: string
 *            description: Employee first name
 *          employeeLastName:
 *            type: string
 *            description: Employee last name
 *          employeeSecondLastName:
 *            type: string
 *            description: Employee second last name
 *          employeePayrollNum:
 *            type: string
 *            description: Employee payroll num
 *          employeePayrollCode:
 *            type: string
 *            description: Employee payroll code
 *          employeeSlug:
 *            type: string
 *            description: Employee slug
 *          employeeHireDate:
 *            type: date
 *            description: Employee hire date
 *          companyId:
 *            type: number
 *            description: Company id
 *          departmentId:
 *            type: number
 *            description: Department id
 *          departmentSyncId:
 *            type: number
 *            description: Department sync id
 *          positionId:
 *            type: number
 *            description: Position id
 *          positionSyncId:
 *            type: number
 *            description: Position sync id
 *          personId:
 *            type: number
 *            description: Person id
 *          businessUnitId:
 *            type: number
 *            description: business id from the employee business unit
 *          dailySalary:
 *            type: number
 *            nullable: true
 *            description: Salario diario vigente. Sin permiso de lectura financiera se entrega null, nunca enmascarado por partes.
 *          payrollBusinessUnitId:
 *            type: number
 *            description: payroll business unit id
 *          employeeAssistDiscriminator:
 *            type: number
 *            description: Flag to identify discrimination on assist
 *          employeeLastSynchronizationAt:
 *            type: string
 *            description: Last synchronization date
 *          employeeTypeOfContract:
 *            type: string
 *            description: Employee type of contract
 *          employeeTypeId:
 *            type: number
 *            description: Employee type id
 *          employeeBusinessEmail:
 *            type: string
 *            description: Employee business email
 *          employeeTerminatedDate:
 *            type: string
 *            description: Employee terminated date
 *          employeeTerminationModality:
 *            type: string
 *            description: Modalidad de baja (catálogo)
 *          employeeTerminationType:
 *            type: string
 *            description: Tipo de baja (catálogo, debe ser coherente con la modalidad)
 *          employeeWorkSchedule:
 *            type: string
 *            enum: [Onsite, Remote, Hybrid]
 *            description: Modalidad de trabajo del empleado
 *          employeeWorkScheduleHybridMode:
 *            type: string
 *            enum: [SpecificDays, DaysPerWeek, DaysPerMonth]
 *            nullable: true
 *            description: Modo de configuración híbrida (solo cuando la modalidad es Hybrid)
 *          employeeWorkScheduleHybridConfig:
 *            type: object
 *            nullable: true
 *            description: Configuración híbrida según el modo. Objeto con days number[] o count number.
 *          employeeTeleworkPercentage:
 *            type: number
 *            format: float
 *            description: Porcentaje de teletrabajo derivado (0.00–100.00). Nunca capturado a mano.
 *          employeeIgnoreConsecutiveAbsences:
 *            type: number
 *            description: Employee ignore consecutive absences
 *          employeeAuthorizeAnyZones:
 *            type: number
 *            description: Employee authorize any zones
 *          employeeCreatedAt:
 *            type: string
 *          employeeUpdatedAt:
 *            type: string
 *          employeeDeletedAt:
 *            type: string
 *
 */
export default class Employee extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeId: number

  @column()
  declare employeeSyncId: number

  @column()
  declare employeeCode: number | string

  @column()
  declare employeeFirstName: string

  @column()
  declare employeeLastName: string

  @column()
  declare employeeSecondLastName: string

  @column()
  declare employeePayrollNum: string

  @column()
  declare employeePayrollCode: string | null

  @column()
  declare employeeSlug: string | null

  @column()
  declare employeeWorkSchedule: EmployeeWorkSchedule

  @column()
  declare employeeWorkScheduleHybridMode: EmployeeHybridMode | null

  @column({
    prepare: (value: EmployeeHybridConfig | null) =>
      value ? JSON.stringify(value) : null,
    consume: (value: string | EmployeeHybridConfig | null) => {
      if (value === null || value === undefined) {
        return null
      }
      return typeof value === 'string' ? (JSON.parse(value) as EmployeeHybridConfig) : value
    },
  })
  declare employeeWorkScheduleHybridConfig: EmployeeHybridConfig | null

  @column({
    consume: (value: string | number | null) => {
      if (value === null || value === undefined) {
        return 0
      }
      return typeof value === 'string' ? Number.parseFloat(value) : value
    },
  })
  declare employeeTeleworkPercentage: number

  @column()
  declare employeePhoto: string | null

  /**
   * Código de verificación del gafete (USRH1784686362321). Se genera de
   * forma perezosa al primer gafete solicitado; revocar = poner en NULL.
   */
  @column()
  declare employeeBadgeToken: string | null

  @column.date()
  declare employeeHireDate: DateTime | null

  @column()
  declare companyId: number

  @column()
  declare departmentId: number | null

  @column()
  declare departmentSyncId: number

  @column()
  declare positionId: number | null

  @column()
  declare positionSyncId: number

  /**
   * Nivel del puesto asignado al empleado (USRH1785964117188): FK nullable a
   * `position_position_levels`. NULL es valor legítimo — la asignación es
   * opcional de forma permanente (regla 1).
   */
  @column()
  declare positionLevelConfigId: number | null

  @column()
  declare personId: number

  @column()
  declare businessUnitId: number

  @column({
    serialize: sensitiveSerializeNumeric('Employee', 'dailySalary'),
  })
  declare dailySalary: number

  @column()
  declare payrollBusinessUnitId: number

  @column()
  declare employeeAssistDiscriminator: number

  @column()
  declare employeeLastSynchronizationAt: Date

  @column()
  declare employeeTypeId: number

  @column()
  declare employeeBusinessEmail: string

  @column()
  declare employeeBusinessPhone: string

  @column()
  declare employeeTypeOfContract: string

  @column()
  declare employeeTerminatedDate: Date | string | null

  @column()
  declare employeeTerminationModality: string | null

  @column()
  declare employeeTerminationType: string | null

  @column()
  declare employeeIgnoreConsecutiveAbsences: number

  @column()
  declare employeeAuthorizeAnyZones: number

  @column.dateTime({ autoCreate: true })
  declare employeeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Department, {
    foreignKey: 'departmentId',
    onQuery: (query) => {
      query.withTrashed()
    },
  })
  declare department: BelongsTo<typeof Department>

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
    onQuery: (query) => {
      query.withTrashed()
    },
  })
  declare position: BelongsTo<typeof Position>

  /**
   * `withTrashed()`: un empleado soft-deleted puede quedar apuntando a un
   * renglón soft-deleted y `reactivate` lo revive tal cual. El preload
   * anidado de `positionLevel` resuelve `displayName` sin N+1.
   */
  @belongsTo(() => PositionPositionLevel, {
    foreignKey: 'positionLevelConfigId',
    onQuery: (query) => {
      query.withTrashed().preload('positionLevel')
    },
  })
  declare positionLevelConfig: BelongsTo<typeof PositionPositionLevel>

  @belongsTo(() => Person, {
    foreignKey: 'personId',
    onQuery: (query) => {
      query.preload('user')
    },
  })
  declare person: BelongsTo<typeof Person>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'payrollBusinessUnitId',
  })
  declare payrollBusinessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => EmployeeType, {
    foreignKey: 'employeeTypeId',
  })
  declare employeeType: BelongsTo<typeof EmployeeType>

  @hasMany(() => ShiftException, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('shift_exceptions_deleted_at')
      query.preload('exceptionType')
    },
  })
  declare shift_exceptions: HasMany<typeof ShiftException>

  @hasMany(() => EmployeeAddress, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employee_address_deleted_at')
      query.preload('address')
    },
  })
  declare address: HasMany<typeof EmployeeAddress>

  @hasMany(() => EmployeeTeleworkLocation, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employee_telework_location_deleted_at')
    },
  })
  declare teleworkLocations: HasMany<typeof EmployeeTeleworkLocation>

  @hasOne(() => EmployeeSpouse, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employee_spouse_deleted_at')
    },
  })
  declare spouse: HasOne<typeof EmployeeSpouse>

  @hasMany(() => EmployeeChildren, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employee_children_deleted_at')
    },
  })
  declare children: HasMany<typeof EmployeeChildren>

  @hasOne(() => EmployeeEmergencyContact, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employee_emergency_contact_deleted_at')
    },
  })
  declare emergencyContact: HasOne<typeof EmployeeEmergencyContact>

  /** Contacto de emergencia principal (el que se usa en la plantilla Excel de importación) */
  @hasOne(() => EmployeeEmergencyContact, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employee_emergency_contact_deleted_at')
      query.where('employee_emergency_contact_is_primary', true)
    },
  })
  declare primaryEmergencyContact: HasOne<typeof EmployeeEmergencyContact>

  @hasMany(() => EmployeeEmergencyContact, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employee_emergency_contact_deleted_at')
    },
  })
  declare emergencyContacts: HasMany<typeof EmployeeEmergencyContact>

  @hasMany(() => EmployeeShiftChange, {
    foreignKey: 'employeeIdFrom',
    onQuery: (query) => {
      query.whereNull('employee_shift_change_deleted_at')
      query.preload('shiftTo')
    },
  })
  declare shiftChanges: HasMany<typeof EmployeeShiftChange>

  @hasMany(() => UserResponsibleEmployee, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.withTrashed()
    },
  })
  declare userResponsibleEmployee: HasMany<typeof UserResponsibleEmployee>

  @hasMany(() => EmployeeShift, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employe_shifts_deleted_at')
    },
  })
  declare employeeShifts: HasMany<typeof EmployeeShift>

  @hasMany(() => EmployeeBonus, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employee_bonus_deleted_at')
    },
  })
  declare employeeBonuses: HasMany<typeof EmployeeBonus>

  @hasMany(() => EmployeeAssessment, {
    foreignKey: 'employeeId',
  })
  declare assessments: HasMany<typeof EmployeeAssessment>

  /** Asignación vigente a sucursal (como máximo una fila con employeeBranchOfficeActive = 1) */
  @hasOne(() => EmployeeBranchOffice, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.where('employeeBranchOfficeActive', 1)
    },
  })
  declare activeEmployeeBranchOffice: HasOne<typeof EmployeeBranchOffice>

  /** Historial completo de asignaciones a sucursales (incluye desactivadas) */
  @hasMany(() => EmployeeBranchOffice, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.orderBy('employeeBranchOfficeId', 'desc')
    },
  })
  declare employeeBranchOffices: HasMany<typeof EmployeeBranchOffice>

  /** Historial de préstamos temporales a otras sucursales */
  @hasMany(() => EmployeeTemporaryAssignment, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.orderBy('employee_temporary_assignment_id', 'desc')
    },
  })
  declare temporaryAssignments: HasMany<typeof EmployeeTemporaryAssignment>

  @hasMany(() => AsignacionContratoEspecializado, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('asignacion_contrato_especializado_deleted_at')
    },
  })
  declare asignacionesContratoEspecializado: HasMany<typeof AsignacionContratoEspecializado>

  /** Histórico de salarios diarios del empleado */
  @hasMany(() => EmployeeSalaryHistory, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employee_salary_history_deleted_at').orderBy('valid_from', 'desc')
    },
  })
  declare salaryHistory: HasMany<typeof EmployeeSalaryHistory>

  @hasMany(() => EmployeeCertification, {
    foreignKey: 'employeeId',
    onQuery: (query) => {
      query.whereNull('employee_certification_deleted_at')
    },
  })
  declare certifications: HasMany<typeof EmployeeCertification>
}
