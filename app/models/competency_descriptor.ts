import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Competency from './competency.js'
import BusinessUnitCompetencyLevel from './business_unit_competency_level.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      CompetencyDescriptor:
 *        type: object
 *        properties:
 *          competencyDescriptorId:
 *            type: number
 *            description: Competency descriptor id
 *          competencyId:
 *            type: number
 *            description: Competency id
 *          businessUnitCompetencyLevelId:
 *            type: number
 *            description: Business unit competency level id
 *          competencyDescriptorDescription:
 *            type: string
 *            description: Description text for the given competency and level descriptor
 *          competencyDescriptorCreatedAt:
 *            type: string
 *          competencyDescriptorUpdatedAt:
 *            type: string
 *          competencyDescriptorDeletedAt:
 *            type: string
 */

export default class CompetencyDescriptor extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare competencyDescriptorId: number

  @column()
  declare competencyId: number

  @column()
  declare businessUnitCompetencyLevelId: number

  @column()
  declare competencyDescriptorDescription: string
  
  @column.dateTime({ autoCreate: true })
  declare competencyDescriptorCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare competencyDescriptorUpdatedAt: DateTime

  @column.dateTime({ columnName: 'competency_descriptor_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Competency, {
    foreignKey: 'competencyId',
  })
  declare competency: BelongsTo<typeof Competency>

  @belongsTo(() => BusinessUnitCompetencyLevel, {
    foreignKey: 'businessUnitCompetencyLevelId',
  })
  declare businessUnitCompetencyLevel: BelongsTo<typeof BusinessUnitCompetencyLevel>
}
