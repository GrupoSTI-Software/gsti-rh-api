import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/**
 * @swagger
 * components:
 *   schemas:
 *     BusinessUnitCompetencyLevel:
 *       type: object
 *       properties:
 *         businessUnitCompetencyLevelId:
 *           type: number
 *           description: Business unit competency level id
 *         businessUnitId:
 *           type: number
 *           description: Business unit id
 *         businessUnitCompetencyLevelLabel:
 *           type: string
 *           description: Business unit competency level label
 *         businessUnitCompetencyLevelPosition:
 *           type: number
 *           description: Business unit competency level position
 *         businessUnitCompetencyLevelCreatedAt:
 *           type: string
 *           description: Business unit competency level created at
 *         businessUnitCompetencyLevelUpdatedAt:
 *           type: string
 *           description: Business unit competency level updated at
 *         businessUnitCompetencyLevelDeletedAt:
 *           type: string
 *           description: Business unit competency level deleted at
 */
/**
 * Compone `withBusinessUnitScope()` (USRH1784259058567, defensa en
 * profundidad). `businessUnitId` era NULLABLE: se corrió un pre-check de
 * NULLs antes de componer (0 filas con NULL en el momento de implementar) y
 * una migración impuso NOT NULL — ver
 * `database/migrations/*_add_not_null_to_business_unit_competency_levels.ts`.
 * Si en algún entorno futuro apareciera una fila NULL, no hay padre del cual
 * derivar la pertenencia: escalar a Wilvardo, no inventar.
 */
export default class BusinessUnitCompetencyLevel extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare businessUnitCompetencyLevelId: number

  @column()
  declare businessUnitId: number

  @column()
  declare businessUnitCompetencyLevelLabel: string

  @column()
  declare businessUnitCompetencyLevelPosition: number

  @column.dateTime({ autoCreate: true })
  declare businessUnitCompetencyLevelCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare businessUnitCompetencyLevelUpdatedAt: DateTime

  @column.dateTime({ columnName: 'business_unit_competency_level_deleted_at' })
  declare deletedAt: DateTime | null
}


