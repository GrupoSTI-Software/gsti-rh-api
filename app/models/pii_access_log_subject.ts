import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import PiiAccessLog from './pii_access_log.js'
import Employee from './employee.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     PiiAccessLogSubject:
 *       type: object
 *       properties:
 *         piiAccessLogSubjectId:
 *           type: number
 *           description: Pii access log subject id
 *         piiAccessLogId:
 *           type: number
 *           description: Parent grouped export audit row id
 *         employeeId:
 *           type: number
 *           description: Employee id included in the export scope
 *         piiAccessLogSubjectCreatedAt:
 *           type: string
 *           format: date-time
 *         piiAccessLogSubjectUpdatedAt:
 *           type: string
 *           format: date-time
 *         piiAccessLogSubjectDeletedAt:
 *           type: string
 *           format: date-time
 */
export default class PiiAccessLogSubject extends BaseModel {
  static table = 'pii_access_log_subjects'

  @column({ isPrimary: true })
  declare piiAccessLogSubjectId: number

  @column()
  declare piiAccessLogId: number

  @column()
  declare employeeId: number

  @column.dateTime({ autoCreate: true })
  declare piiAccessLogSubjectCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare piiAccessLogSubjectUpdatedAt: DateTime

  @column.dateTime({ columnName: 'pii_access_log_subject_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => PiiAccessLog, { foreignKey: 'piiAccessLogId' })
  declare piiAccessLog: BelongsTo<typeof PiiAccessLog>

  @belongsTo(() => Employee, { foreignKey: 'employeeId' })
  declare employee: BelongsTo<typeof Employee>
}
