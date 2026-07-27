import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Position from '#models/position'
import Certification from '#models/certification'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * Dato por-posición del cliente (defensa en profundidad, USRH1784259058555).
 * El catálogo compartido `Certification` NO se aísla — solo esta tabla
 * puente por-posición compone el candado.
 */
export default class PositionCertificationRequirement extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'position_certification_requirements'

  @column({ isPrimary: true })
  declare positionCertificationRequirementId: number

  @column()
  declare positionId: number

  /** Marca de pertenencia propia (defensa en profundidad, USRH1784259058555). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el puesto padre, nunca desde el payload. */
  @beforeCreate()
  static async assignBusinessUnitId(instance: PositionCertificationRequirement) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Position.query().where('positionId', instance.positionId).first(),
      'el puesto'
    )
  }

  @column()
  declare certificationId: number

  @column.dateTime({ autoCreate: true })
  declare positionCertificationRequirementCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionCertificationRequirementUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'position_certification_requirement_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>

  @belongsTo(() => Certification, {
    foreignKey: 'certificationId',
  })
  declare certification: BelongsTo<typeof Certification>
}
