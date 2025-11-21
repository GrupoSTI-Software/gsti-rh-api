import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import Department from './department.js'
import Position from './position.js'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import Person from './person.js'
import ShiftException from './shift_exception.js'
import BusinessUnit from './business_unit.js'
import EmployeeType from './employee_type.js'
import EmployeeAddress from './employee_address.js'
import EmployeeSpouse from './employee_spouse.js'
import EmployeeChildren from './employee_children.js'
import EmployeeEmergencyContact from './employee_emergency_contact.js'
import EmployeeShiftChange from './employee_shift_changes.js'
import UserResponsibleEmployee from './user_responsible_employee.js'
import EmployeeShift from './employee_shift.js'

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
 *            description: Daily salary
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
 *          employeeIgnoreConsecutiveAbsences:
 *            type: number
 *            description: Employee ignore consecutive absences
 *          employeeCreatedAt:
 *            type: string
 *          employeeUpdatedAt:
 *            type: string
 *          employeeDeletedAt:
 *            type: string
 *
 */
export default class Employee extends compose(BaseModel, SoftDeletes) {
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
  declare employeeWorkSchedule: string

  @column()
  declare employeePhoto: string

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

  @column()
  declare personId: number

  @column()
  declare businessUnitId: number

  @column()
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
  declare employeeTypeOfContract: string

  @column()
  declare employeeTerminatedDate: Date | string | null

  @column()
  declare employeeIgnoreConsecutiveAbsences: number

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

  @belongsTo(() => Person, {
    foreignKey: 'personId',
  })
  declare person: BelongsTo<typeof Person>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

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
}
