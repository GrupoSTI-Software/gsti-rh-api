import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import Employee from './employee.js'
import BranchOffice from './branch_office.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * Historial de asignaciones empleado ↔ sucursal (solo una fila activa por empleado a la vez).
 */
export default class EmployeeBranchOffice extends compose(BaseModel, withBusinessUnitScope()) {
  static table = 'employee_branch_offices'

  @column({ isPrimary: true })
  declare employeeBranchOfficeId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, USRH1784259058533). */
  @column()
  declare businessUnitId: number

  @column()
  declare branchOfficeId: number

  /** Resuelve businessUnitId desde el empleado padre, nunca desde el payload. */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeBranchOffice) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

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
