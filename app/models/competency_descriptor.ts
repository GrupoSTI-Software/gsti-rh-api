import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Competency from './competency.js'
import BusinessUnitCompetencyLevel from './business_unit_competency_level.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

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
 *          businessUnitId:
 *            type: number
 *            nullable: true
 *            description: Unidad de negocio dueña, heredada de la competencia padre (VLRH-H1792026427127)
 */

export default class CompetencyDescriptor extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare competencyDescriptorId: number

  @column()
  declare competencyId: number

  @column()
  declare businessUnitCompetencyLevelId: number

  @column()
  declare competencyDescriptorDescription: string

  /** Marca de pertenencia propia, heredada de la competencia padre (VLRH-H1792026427127). */
  @column()
  declare businessUnitId: number | null

  /** Resuelve businessUnitId desde la competencia padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: CompetencyDescriptor) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(async () => {
      const parent = await Competency.query()
        .where('competencyId', instance.competencyId)
        .first()
      return parent?.businessUnitId ? { businessUnitId: parent.businessUnitId } : null
    }, 'la competencia')
  }

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
