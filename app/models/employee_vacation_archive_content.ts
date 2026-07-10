import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column, manyToMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import EmployeeVacationArchive from './employee_vacation_archive.js'
import ShiftException from './shift_exception.js'

export default class EmployeeVacationArchiveContent extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare employeeVacationArchiveContentId: number

  @column()
  declare employeeVacationArchiveId: number

  /** Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde employee_vacation_archives (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeVacationArchiveContent) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => EmployeeVacationArchive.query().where('employeeVacationArchiveId', instance.employeeVacationArchiveId).first(),
      'el archivo de vacaciones'
    )
  }

  @column()
  declare employeeVacationArchiveContentDescription: string

  @column()
  declare employeeVacationArchiveContentFile: string

  @column()
  declare employeeVacationArchiveContentActive: boolean

  @column.dateTime({ autoCreate: true })
  declare employeeVacationArchiveContentCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeVacationArchiveContentUpdatedAt: DateTime

  @column.dateTime({ columnName: 'employee_vacation_archive_content_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => EmployeeVacationArchive, {
    foreignKey: 'employeeVacationArchiveId',
  })
  declare employeeVacationArchive: BelongsTo<typeof EmployeeVacationArchive>

  @manyToMany(() => ShiftException, {
    pivotTable: 'employee_vacation_archive_content_shift_exceptions',
    pivotForeignKey: 'employee_vacation_archive_content_id',
    pivotRelatedForeignKey: 'shift_exception_id',
    relatedKey: 'shiftExceptionId',
    localKey: 'employeeVacationArchiveContentId',
  })
  declare shiftExceptions: ManyToMany<typeof ShiftException>

  static softDeletes = true
}
