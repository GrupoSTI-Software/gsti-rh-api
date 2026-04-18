import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import BranchOffice from './branch_office.js'

/**
 * Historial de asignaciones empleado ↔ sucursal (solo una fila activa por empleado a la vez).
 */
export default class EmployeeBranchOffice extends BaseModel {
  static table = 'employee_branch_offices'

  @column({ isPrimary: true })
  declare employeeBranchOfficeId: number

  @column()
  declare employeeId: number

  @column()
  declare branchOfficeId: number

  @column()
  declare employeeBranchOfficeActive: number

  @column.dateTime()
  declare employeeBranchOfficeDeactivatedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare employeeBranchOfficeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeBranchOfficeUpdatedAt: DateTime

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BranchOffice, {
    foreignKey: 'branchOfficeId',
    onQuery: (query) => {
      query.whereNull('branch_office_deleted_at')
    },
  })
  declare branchOffice: BelongsTo<typeof BranchOffice>
}
