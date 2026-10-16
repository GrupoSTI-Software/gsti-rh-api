import { compose } from '@adonisjs/core/helpers'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CompetencyDescriptor from './competency_descriptor.js'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'

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
 *          businessUnitId:
 *            type: number
 *            nullable: true
 *            description: Unidad de negocio dueña, heredada del descriptor padre (VLRH-H1792026427127)
 */

export default class CompetencyBracket extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare competencyBracketId: number

  @column()
  declare competencyDescriptorId: number

  @column()
  declare competencyBracketDescription: string

  /** Marca de pertenencia propia, heredada del descriptor padre (VLRH-H1792026427127). */
  @column()
  declare businessUnitId: number | null

  /** Resuelve businessUnitId desde el descriptor padre (nunca del payload). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: CompetencyBracket) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(async () => {
      const parent = await CompetencyDescriptor.query()
        .where('competencyDescriptorId', instance.competencyDescriptorId)
        .first()
      return parent?.businessUnitId ? { businessUnitId: parent.businessUnitId } : null
    }, 'el descriptor de la competencia')
  }

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
