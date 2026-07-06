import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import BusinessUnit from './business_unit.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     PiiAccessLog:
 *       type: object
 *       properties:
 *         piiAccessLogId:
 *           type: number
 *           description: Pii access log id
 *         businessUnitId:
 *           type: number
 *           description: Business unit id
 *         accessorUserId:
 *           type: number
 *           description: Id of the user who revealed the data
 *         piiAccessLogModel:
 *           type: string
 *           description: Lucid model class name (e.g. "Person")
 *         piiAccessLogModelColumn:
 *           type: string
 *           description: camelCase model property that was revealed (e.g. "personCurp")
 *         piiAccessLogRecordId:
 *           type: number
 *           description: Primary key of the record whose field was revealed
 *         piiAccessLogAccessorIp:
 *           type: string
 *           description: Client IP address (IPv4 or compressed IPv6)
 *         piiAccessLogAccessorUserAgent:
 *           type: string
 *           description: Client User-Agent header
 *         piiAccessLogRequestId:
 *           type: string
 *           description: HTTP request correlation UUID (X-Request-Id)
 *         piiAccessLogCreatedAt:
 *           type: string
 *           format: date-time
 *         piiAccessLogUpdatedAt:
 *           type: string
 *           format: date-time
 *         piiAccessLogDeletedAt:
 *           type: string
 *           format: date-time
 */
export default class PiiAccessLog extends BaseModel {
  static table = 'pii_access_logs'

  @column({ isPrimary: true })
  declare piiAccessLogId: number

  @column()
  declare businessUnitId: number

  @column({ columnName: 'user_id' })
  declare accessorUserId: number

  @column()
  declare piiAccessLogModel: string

  @column()
  declare piiAccessLogModelColumn: string

  @column()
  declare piiAccessLogRecordId: number

  @column()
  declare piiAccessLogAccessorIp: string

  @column()
  declare piiAccessLogAccessorUserAgent: string | null

  @column()
  declare piiAccessLogRequestId: string | null

  @column.dateTime({ autoCreate: true })
  declare piiAccessLogCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare piiAccessLogUpdatedAt: DateTime

  @column.dateTime({ columnName: 'pii_access_log_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => User, { foreignKey: 'accessorUserId', localKey: 'userId' })
  declare accessorUser: BelongsTo<typeof User>

  @belongsTo(() => BusinessUnit, { foreignKey: 'businessUnitId' })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
