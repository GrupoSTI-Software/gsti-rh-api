import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import BranchOffice from './branch_office.js'

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
 */
export default class EmployeeTemporaryAssignment extends BaseModel {
  static table = 'employee_temporary_assignments'

  @column({ isPrimary: true })
  declare employeeTemporaryAssignmentId: number

  @column()
  declare employeeId: number

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
  declare shiftOverrideStart: string | null

  @column()
  declare shiftOverrideEnd: string | null

  @column.dateTime({ autoCreate: true })
  declare employeeTemporaryAssignmentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeTemporaryAssignmentUpdatedAt: DateTime

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
}
