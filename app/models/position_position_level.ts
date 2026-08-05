import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Position from '#models/position'
import PositionLevel from '#models/position_level'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

/**
 * @swagger
 * components:
 *   schemas:
 *      PositionPositionLevel:
 *        type: object
 *        properties:
 *          positionPositionLevelId:
 *            type: number
 *            description: Identificador del nivel configurado en el puesto
 *          positionId:
 *            type: number
 *            description: Puesto dueño de la configuración (FK a positions)
 *          positionLevelId:
 *            type: number
 *            nullable: true
 *            description: Nivel del catálogo activado; NULL cuando el renglón es ad-hoc
 *          positionPositionLevelAdHocName:
 *            type: string
 *            nullable: true
 *            description: Nombre del nivel propio del puesto; NULL cuando viene del catálogo
 *          positionPositionLevelRank:
 *            type: number
 *            description: Orden dentro del puesto en una sola secuencia mezclada
 *          positionPositionLevelIsDefault:
 *            type: boolean
 *            description: Nivel propuesto por omisión (máximo uno vivo por puesto)
 *          positionPositionLevelActive:
 *            type: boolean
 *            description: Si el nivel sigue ofreciéndose dentro del puesto
 *          businessUnitId:
 *            type: number
 *            description: Razón social del puesto (FK a business_units)
 *          positionPositionLevelCreatedAt:
 *            type: string
 *          positionPositionLevelUpdatedAt:
 *            type: string
 *          positionPositionLevelDeletedAt:
 *            type: string
 */
export default class PositionPositionLevel extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'position_position_levels'

  @column({ isPrimary: true })
  declare positionPositionLevelId: number

  @column()
  declare positionId: number

  /** Marca de pertenencia propia (defensa en profundidad, USRH1785273891313). */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde el puesto padre, nunca desde el payload. */
  @beforeCreate()
  static async assignBusinessUnitId(instance: PositionPositionLevel) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => Position.query().where('positionId', instance.positionId).first(),
      'el puesto'
    )
  }

  @column()
  declare positionLevelId: number | null

  @column()
  declare positionPositionLevelAdHocName: string | null

  @column()
  declare positionPositionLevelRank: number

  /** MySQL persiste tinyint(1); `consume` garantiza true/false en el JSON. */
  @column({ consume: (value: unknown) => Boolean(value) })
  declare positionPositionLevelIsDefault: boolean

  /** MySQL persiste tinyint(1); `consume` garantiza true/false en el JSON. */
  @column({ consume: (value: unknown) => Boolean(value) })
  declare positionPositionLevelActive: boolean

  @column.dateTime({ autoCreate: true })
  declare positionPositionLevelCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionPositionLevelUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'position_position_level_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>

  @belongsTo(() => PositionLevel, {
    foreignKey: 'positionLevelId',
  })
  declare positionLevel: BelongsTo<typeof PositionLevel>
}
