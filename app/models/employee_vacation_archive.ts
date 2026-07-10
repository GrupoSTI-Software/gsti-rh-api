import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import VacationSetting from './vacation_setting.js'
import EmployeeVacationArchiveContent from './employee_vacation_archive_content.js'

export default class EmployeeVacationArchive extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeVacationArchiveId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  @column()
  declare vacationSettingId: number

  /** Resuelve businessUnitId desde el empleado padre (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeVacationArchive) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column.dateTime({ autoCreate: true })
  declare employeeVacationArchiveCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeVacationArchiveUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_vacation_archive_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => VacationSetting, {
    foreignKey: 'vacationSettingId',
  })
  declare vacationSetting: BelongsTo<typeof VacationSetting>

  @hasMany(() => EmployeeVacationArchiveContent, {
    foreignKey: 'employeeVacationArchiveId',
  })
  declare contents: HasMany<typeof EmployeeVacationArchiveContent>

  static softDeletes = true
}
