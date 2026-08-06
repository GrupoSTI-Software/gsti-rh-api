import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import BusinessUnit from './business_unit.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      PositionLevel:
 *        type: object
 *        properties:
 *          positionLevelId:
 *            type: number
 *            description: Identificador del nivel de puesto
 *          businessUnitId:
 *            type: number
 *            description: Razón social dueña del catálogo (FK a business_units)
 *          positionLevelName:
 *            type: string
 *            description: Nombre del nivel tal como lo usa la empresa
 *          positionLevelRank:
 *            type: number
 *            description: Posición jerárquica ascendente (1 = más bajo)
 *          positionLevelActive:
 *            type: boolean
 *            description: Si el nivel se ofrece para configurar puestos
 *          positionLevelCreatedAt:
 *            type: string
 *          positionLevelUpdatedAt:
 *            type: string
 *          positionLevelDeletedAt:
 *            type: string
 */
export default class PositionLevel extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare positionLevelId: number

  @column()
  declare businessUnitId: number

  @column()
  declare positionLevelName: string

  @column()
  declare positionLevelRank: number

  /** MySQL persiste tinyint(1); `consume` garantiza true/false en el JSON. */
  @column({ consume: (value: unknown) => Boolean(value) })
  declare positionLevelActive: boolean

  @column.dateTime({ autoCreate: true })
  declare positionLevelCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionLevelUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_level_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
