import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Position from './position.js'
import PsychometricTestDimension from './psychometric_test_dimension.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     PositionPsychometricProfile:
 *       type: object
 *       properties:
 *         positionPsychometricProfileId:
 *           type: number
 *           description: Identificador único del perfil psicométrico del puesto
 *         positionId:
 *           type: number
 *           description: Identificador del puesto
 *         psychometricTestDimensionId:
 *           type: number
 *           description: Identificador de la dimensión de la prueba
 *         positionPsychometricProfileMinimumValue:
 *           type: number
 *           format: double
 *           description: Valor mínimo esperado
 *         positionPsychometricProfileMaximumValue:
 *           type: number
 *           format: double
 *           description: Valor máximo esperado
 *         positionPsychometricProfileCreatedAt:
 *           type: string
 *         positionPsychometricProfileUpdatedAt:
 *           type: string
 *         positionPsychometricProfileDeletedAt:
 *           type: string
 */
export default class PositionPsychometricProfile extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare positionPsychometricProfileId: number

  @column()
  declare positionId: number

  @column()
  declare psychometricTestDimensionId: number

  @column()
  declare positionPsychometricProfileMinimumValue: number

  @column()
  declare positionPsychometricProfileMaximumValue: number

  @column.dateTime({ autoCreate: true })
  declare positionPsychometricProfileCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionPsychometricProfileUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_psychometric_profile_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>

  @belongsTo(() => PsychometricTestDimension, {
    foreignKey: 'psychometricTestDimensionId',
  })
  declare psychometricTestDimension: BelongsTo<typeof PsychometricTestDimension>
}
