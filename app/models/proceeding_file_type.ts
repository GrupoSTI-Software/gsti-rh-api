import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import ProceedingFileTypeEmail from './proceeding_file_type_email.js'
/**
 * @swagger
 * components:
 *   schemas:
 *     ProceedingFileType:
 *       type: object
 *       properties:
 *         proceedingFileTypeId:
 *           type: number
 *           description: Proceeding file type ID
 *         proceedingFileTypeName:
 *           type: string
 *           description: Proceeding file type name
 *         proceedingFileTypeSlug:
 *           type: string
 *           description: Proceeding file type SLUG
 *         proceedingFileTypeAreaToUse:
 *           type: string
 *           description: Proceeding file type area to use
 *         proceedingFileTypeActive:
 *           type: number
 *           description: Proceeding file type status
 *         parentId:
 *           type: number
 *           description: Recursive id, dependence by other proceeding file type (Same area to use)
 *         proceedingFileTypeBusinessUnits:
 *           type: string
 *           description: Business units
 *         proceedingFileTypeCreatedAt:
 *           type: string
 *           format: date-time
 *         proceedingFileTypeUpdatedAt:
 *           type: string
 *           format: date-time
 *         proceedingFileTypeDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class ProceedingFileType extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare proceedingFileTypeId: number

  @column()
  declare proceedingFileTypeName: string

  @column()
  declare proceedingFileTypeSlug: string

  @column()
  declare proceedingFileTypeAreaToUse: string

  @column()
  declare proceedingFileTypeActive: number

  @column()
  declare proceedingFileTypeBusinessUnits: string

  @column()
  declare parentId: number | null

  @column.dateTime({ autoCreate: true })
  declare proceedingFileTypeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare proceedingFileTypeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'proceeding_file_type_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => ProceedingFileType, {
    foreignKey: 'parentId',
  })
  declare parent: BelongsTo<typeof ProceedingFileType>

  @hasMany(() => ProceedingFileType, {
    foreignKey: 'parentId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('children')
      }
    },
  })
  declare children: HasMany<typeof ProceedingFileType>

  @hasMany(() => ProceedingFileTypeEmail, {
    foreignKey: 'proceedingFileTypeId',
  })
  declare emails: HasMany<typeof ProceedingFileTypeEmail>
}
