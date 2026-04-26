import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import Position from './position.js'
import BusinessUnit from './business_unit.js'
/**
 * @swagger
 * components:
 *   schemas:
 *     CareerPathTemplate:
 *       type: object
 *       properties:
 *         careerPathTemplateId:
 *           type: number
 *           description: Career path template ID
 *         companyId:
 *           type: number
 *           description: Company ID
 *         originPositionId:
 *           type: number
 *           description: Origin position ID
 *         targetPositionId:
 *           type: number
 *           description: Target position ID
 *         createdBy:
 *           type: number
 *           description: Created by user ID
 *         updatedBy:
 *           type: number
 *           description: Updated by user ID
 *         careerPathTemplateCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the career path template was created
 *         careerPathTemplateUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the career path template was last updated
 *         careerPathTemplateDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the career path template was soft-deleted
 *       example:
 *         careerPathTemplateId: 1
 *         companyId: 1
 *         originPositionId: 1
 *         targetPositionId: 2
 *         createdBy: 1
 *         updatedBy: 1
 *         careerPathTemplateCreatedAt: '2025-02-06T12:00:00Z'
 *         careerPathTemplateUpdatedAt: '2025-02-06T13:00:00Z'
 *         careerPathTemplateDeletedAt: null
 */
export default class CareerPathTemplate extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare careerPathTemplateId: number

  @column()
  declare companyId: number

  @column()
  declare originPositionId: number

  @column()
  declare targetPositionId: number

  @column()
  declare createdBy: number

  @column()
  declare updatedBy: number

  @column.dateTime({ autoCreate: true })
  declare careerPathTemplateCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare careerPathTemplateUpdatedAt: DateTime

  @column.dateTime({ columnName: 'career_path_template_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'companyId',
  })
  declare company: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => Position, {
    foreignKey: 'originPositionId',
  })
  declare originPosition: BelongsTo<typeof Position>

  @belongsTo(() => Position, {
    foreignKey: 'targetPositionId',
  })
  declare targetPosition: BelongsTo<typeof Position>
}
