import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, beforeCreate } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import ProceedingFileType from './proceeding_file_type.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * Expediente por tipo, dato por-empleado (defensa en profundidad,
 * USRH1784259058533). Su catálogo (`ProceedingFileType`) es otra tabla y
 * no se scopea aquí; solo esta tabla por-empleado.
 */
export default class EmployeeProceedingFileType extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'employee_proceeding_files_types'

  @column({ isPrimary: true })
  declare employeeProceedingFileTypeId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, USRH1784259058533). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre, nunca desde el payload. */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeProceedingFileType) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare proceedingFileTypeId: number

  @column.dateTime({ autoCreate: true })
  declare employeeProceedingFileTypeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeProceedingFileTypeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_proceeding_file_type_deleted_at' })
  declare deletedAt: DateTime | null

  static softDeletes = true

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => ProceedingFileType, {
    foreignKey: 'proceedingFileTypeId',
  })
  declare proceedingFileType: BelongsTo<typeof ProceedingFileType>
}
