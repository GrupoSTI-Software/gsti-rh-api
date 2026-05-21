import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CompetencyDescriptor from './competency_descriptor.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      CompetencyBracket:
 *        type: object
 *        properties:
 *          competencyBracketId:
 *            type: number
 *            description: Competency bracket id
 *          competencyDescriptorId:
 *            type: number
 *            description: Competency descriptor id
 *          competencyBracketDescription:
 *            type: string
 *            description: Description text for the given competency bracket
 *          competencyBracketRangeMin:
 *            type: number
 *            description: Minimum range for the given competency bracket
 *          competencyBracketRangeMax:
 *            type: number
 *            description: Maximum range for the given competency bracket
 *          competencyBracketPosition:
 *            type: number
 *            description: Position of the given competency bracket
 *          competencyBracketCreatedAt:
 *            type: string
 *          competencyBracketUpdatedAt:
 *            type: string
 *          competencyBracketDeletedAt:
 *            type: string
 */

export default class CompetencyBracket extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare competencyBracketId: number

  @column()
  declare competencyDescriptorId: number

  @column()
  declare competencyBracketDescription: string

  @column()
  declare competencyBracketRangeMin: number

  @column()
  declare competencyBracketRangeMax: number

  @column()
  declare competencyBracketPosition: number

  @column.dateTime({ autoCreate: true })
  declare competencyBracketCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare competencyBracketUpdatedAt: DateTime

  @column.dateTime({ columnName: 'competency_bracket_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => CompetencyDescriptor, {
    foreignKey: 'competencyDescriptorId',
  })
  declare competencyDescriptor: BelongsTo<typeof CompetencyDescriptor>
}
