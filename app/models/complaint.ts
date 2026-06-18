import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import BusinessUnit from './business_unit.js'
import type { ComplaintCategory, ComplaintStatus } from '#constants/complaint'

/**
 * @swagger
 * components:
 *   schemas:
 *     Complaint:
 *       type: object
 *       properties:
 *         complaintId:
 *           type: number
 *           description: Complaint id
 *         complaintFolio:
 *           type: string
 *           description: Complaint folio
 *         complaintCategory:
 *           type: string
 *           enum: [violencia-laboral, entorno, otro]
 *           description: Complaint category (NOM-035 reporting type)
 *         complaintDescription:
 *           type: string
 *           description: description of the complaint
 *         complaintStatus:
 *           type: string
 *           enum: [nuevo, en-revision, resuelto, cerrado]
 *           description: Complaint workflow status
 *         complaintCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Complaint created at
 *         complaintUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Complaint updated at
 *         complaintDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Complaint deleted at
 */
export default class Complaint extends compose(BaseModel, SoftDeletes) {
  static table = 'complaints'

  @column({ isPrimary: true })
  declare complaintId: number

  /** FK confidencial: no se expone en serializers por defecto. */
  @column({ serializeAs: null })
  declare employeeId: number

  @column()
  declare businessUnitId: number

  @column()
  declare complaintFolio: string

  @column({ serializeAs: null })
  declare complaintPassphraseHash: string

  @column()
  declare complaintCategory: ComplaintCategory

  @column()
  declare complaintDescription: string

  @column()
  declare complaintStatus: ComplaintStatus

  @column.dateTime({ autoCreate: true })
  declare complaintCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare complaintUpdatedAt: DateTime

  @column.dateTime({ columnName: 'complaint_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
