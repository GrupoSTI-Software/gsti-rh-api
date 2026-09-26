import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import BranchOffice from './branch_office.js'
import Shift from './shift.js'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeTemporaryAssignment:
 *       type: object
 *       properties:
 *         employeeTemporaryAssignmentId:
 *           type: number
 *           description: ID del préstamo temporal
 *         employeeId:
 *           type: number
 *           description: ID del empleado prestado
 *         sourceBranchId:
 *           type: number
 *           description: ID de la sucursal de origen
 *         targetBranchId:
 *           type: number
 *           description: ID de la sucursal destino
 *         startDate:
 *           type: string
 *           format: date
 *           description: Fecha de inicio del préstamo (YYYY-MM-DD)
 *         endDate:
 *           type: string
 *           format: date
 *           description: Fecha de fin del préstamo (YYYY-MM-DD), calculada al crear
 *         days:
 *           type: number
 *           description: Duración en días (mínimo 1)
 *         reason:
 *           type: string
 *           nullable: true
 *           enum: [cobertura]
 *           description: Motivo del préstamo temporal
 *         destinationShiftId:
 *           type: number
 *           nullable: true
 *           description: Turno destino configurado para toda la vigencia
 *         cancelledAt:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Fecha de cancelación anticipada del préstamo
 *         shiftOverrideStart:
 *           type: string
 *           nullable: true
 *           description: Hora de entrada ajustada para el día 1 (HH:mm)
 *         shiftOverrideEnd:
 *           type: string
 *           nullable: true
 *           description: Hora de salida ajustada para el día 1 (HH:mm)
 *         employeeTemporaryAssignmentCreatedAt:
 *           type: string
 *           format: date-time
 *         employeeTemporaryAssignmentUpdatedAt:
 *           type: string
 *           format: date-time
 *         employeeTemporaryAssignmentDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class EmployeeTemporaryAssignment extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'employee_temporary_assignments'

  @column({ isPrimary: true })
  declare employeeTemporaryAssignmentId: number

  @column()
  declare employeeId: number

  /**
   * Marca de pertenencia propia (defensa en profundidad, USRH1784259058533).
   * Se ancla en el empleado prestado, nunca en las sucursales de origen/destino.
   */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre, nunca desde el payload ni las sucursales. */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeTemporaryAssignment) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare sourceBranchId: number

  @column()
  declare targetBranchId: number

  @column.date()
  declare startDate: DateTime

  @column.date()
  declare endDate: DateTime

  @column()
  declare days: number

  @column()
  declare reason: string | null

  @column()
  declare destinationShiftId: number | null

  @column.date()
  declare cancelledAt: DateTime | null

  @column()
  declare shiftOverrideStart: string | null

  @column()
  declare shiftOverrideEnd: string | null

  @column.dateTime({ autoCreate: true })
  declare employeeTemporaryAssignmentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeTemporaryAssignmentUpdatedAt: DateTime

  static softDeleteColumn = 'employee_temporary_assignment_deleted_at'

  @column.dateTime({ columnName: 'employee_temporary_assignment_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BranchOffice, {
    foreignKey: 'sourceBranchId',
    onQuery: (query) => {
      query.withTrashed()
    },
  })
  declare sourceBranch: BelongsTo<typeof BranchOffice>

  @belongsTo(() => BranchOffice, {
    foreignKey: 'targetBranchId',
    onQuery: (query) => {
      query.withTrashed()
    },
  })
  declare targetBranch: BelongsTo<typeof BranchOffice>

  @belongsTo(() => Shift, {
    foreignKey: 'destinationShiftId',
    onQuery: (query) => {
      query.whereNull('shift_deleted_at')
    },
  })
  declare destinationShift: BelongsTo<typeof Shift>
}
