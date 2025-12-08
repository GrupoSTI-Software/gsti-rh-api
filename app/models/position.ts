import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Employee from './employee.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      Position:
 *        type: object
 *        properties:
 *          positionId:
 *            type: number
 *            description: Position id
 *          positionSyncId:
 *            type: number
 *            description: Imported position id
 *          positionCode:
 *            type: string
 *            description: Position code
 *          positionName:
 *            type: string
 *            description: Position name
 *          positionAlias:
 *            type: string
 *            description: Position alias
 *          positionIsDefault:
 *            type: boolean
 *            description: If the position is the default
 *          positionActive:
 *            type: number
 *            description: Estatus
 *          parentPositionId:
 *            type: number
 *            description: Related position id
 *          parentPositionSyncId:
 *            type: number
 *            description: Imported related position id
 *          companyId:
 *            type: number
 *            description: Company id
 *          businessUnitId:
 *            type: number
 *            description: Id from the business unit, default SAE
 *          positionLastSynchronizationAt:
 *            type: string
 *            description: Last synchronization date
 *          positionCreatedAt:
 *            type: string
 *          positionUpdatedAt:
 *            type: string
 *          positionDeletedAt:
 *            type: string
 *
 */
export default class Position extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare positionId: number

  @column()
  declare positionSyncId: number

  @column()
  declare positionCode: string

  @column()
  declare positionName: string

  @column()
  declare positionAlias: string

  @column()
  declare positionIsDefault: boolean

  @column()
  declare positionActive: number

  @column()
  declare parentPositionId: number | null

  @column()
  declare parentPositionSyncId: number

  @column()
  declare companyId: number

  @column()
  declare businessUnitId: number

  @column()
  declare positionLastSynchronizationAt: Date

  @column.dateTime({ autoCreate: true })
  declare positionCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'parentPositionId',
  })
  declare parentPosition: BelongsTo<typeof Position>

  @hasMany(() => Position, {
    foreignKey: 'parentPositionId',
  })
  declare subPositions: HasMany<typeof Position>

  @belongsTo(() => Position, {
    foreignKey: 'parentPositionSyncId',
  })
  declare parentSyncPosition: BelongsTo<typeof Position>

  @hasMany(() => Position, {
    foreignKey: 'parentPositionSyncId',
  })
  declare subSyncPositions: HasMany<typeof Position>

  @hasMany(() => Employee, {
    foreignKey: 'positionId',
  })
  declare employees: HasMany<typeof Employee>

  @hasMany(() => Position, {
    foreignKey: 'parentPositionId',
  })
  declare positions: HasMany<typeof Position>
}
