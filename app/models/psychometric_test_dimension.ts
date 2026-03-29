import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import PsychometricTest from './psychometric_test.js'
import PositionPsychometricProfile from './position_psychometric_profile.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     PsychometricTestDimension:
 *       type: object
 *       properties:
 *         psychometricTestDimensionId:
 *           type: number
 *           description: Identificador único de la dimensión
 *         psychometricTestId:
 *           type: number
 *           description: Identificador de la prueba psicométrica
 *         psychometricTestDimensionName:
 *           type: string
 *           description: Nombre de la dimensión
 *         psychometricTestDimensionAcronym:
 *           type: string
 *           description: Sigla de la dimensión
 *         psychometricTestDimensionCreatedAt:
 *           type: string
 *         psychometricTestDimensionUpdatedAt:
 *           type: string
 *         psychometricTestDimensionDeletedAt:
 *           type: string
 */
export default class PsychometricTestDimension extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare psychometricTestDimensionId: number

  @column()
  declare psychometricTestId: number

  @column()
  declare psychometricTestDimensionName: string

  @column()
  declare psychometricTestDimensionAcronym: string

  @column.dateTime({ autoCreate: true })
  declare psychometricTestDimensionCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare psychometricTestDimensionUpdatedAt: DateTime

  @column.dateTime({ columnName: 'psychometric_test_dimension_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => PsychometricTest, {
    foreignKey: 'psychometricTestId',
  })
  declare psychometricTest: BelongsTo<typeof PsychometricTest>

  @hasMany(() => PositionPsychometricProfile, {
    foreignKey: 'psychometricTestDimensionId',
  })
  declare positionProfiles: HasMany<typeof PositionPsychometricProfile>
}
