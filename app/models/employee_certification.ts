import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from '#models/employee'
import Certification from '#models/certification'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

export default class EmployeeCertification extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'employee_certifications'

  @column({ isPrimary: true })
  declare employeeCertificationId: number

  @column()
  declare employeeId: number

  /** Marca de pertenencia propia (defensa en profundidad, USRH1783821206584). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el empleado padre (USRH1783821206584). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: EmployeeCertification) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Employee.query().where('employeeId', instance.employeeId).first(),
      'el empleado'
    )
  }

  @column()
  declare certificationId: number

  @column.date()
  declare employeeCertificationCompliedAt: DateTime

  @column.date()
  declare employeeCertificationExpiresAt: DateTime | null

  /** Se llena en la historia de upload; no expuesto en esta historia. */
  @column()
  declare employeeCertificationDocumentUrl: string | null

  @column.dateTime({ autoCreate: true })
  declare employeeCertificationCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare employeeCertificationUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'employee_certification_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
  })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => Certification, {
    foreignKey: 'certificationId',
  })
  declare certification: BelongsTo<typeof Certification>
}
