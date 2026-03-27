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
 *          positionDescription:
 *            type: string
 *            description: Position description
 *          positionGeneralObjective:
 *            type: string
 *            description: Position general objective
 *          positionSpecificRequirement:
 *            type: string
 *            description: Position specific requirement
 *          positionEvaluationFrequency:
 *            type: string
 *            description: Position evaluation frequency
 *          positionEvaluationDurationDays:
 *            type: number
 *            description: Position evaluation duration days
 *          positionEvaluationStartDay:
 *            type: integer
 *            description: Position evaluation start day
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
 *          positionProfileExpirationDate:
 *            type: string
 *            description: Profile expiration date
 *          positionMinStaff:
 *            type: integer
 *            description: Personal mínimo en el puesto (opcional, mayor que cero)
 *          positionIdealStaff:
 *            type: integer
 *            description: Personal ideal en el puesto (opcional, mayor que cero)
 *          positionMaxStaff:
 *            type: integer
 *            description: Personal máximo en el puesto (opcional, mayor que cero)
 *          positionMinActiveStaffPerShift:
 *            type: integer
 *            description: Personal mínimo activo por turno en el puesto (opcional, mayor que cero)
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
  declare positionDescription: string

  @column()
  declare positionGeneralObjective: string

  @column()
  declare positionSpecificRequirement: string

  @column()
  declare positionEvaluationFrequency: string

  @column()
  declare positionEvaluationDurationDays: number

  @column()
  declare positionEvaluationStartDay: number

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

  @column()
  declare positionProfileExpirationDate: Date

  @column()
  declare positionMinStaff: number | null

  @column()
  declare positionIdealStaff: number | null

  @column()
  declare positionMaxStaff: number | null

  @column()
  declare positionMinActiveStaffPerShift: number | null

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
