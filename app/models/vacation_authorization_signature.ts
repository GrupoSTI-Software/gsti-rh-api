import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import ExceptionRequest from './exception_request.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ShiftException from './shift_exception.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     VacationAuthorizationSignature:
 *       type: object
 *       properties:
 *         vacationAuthorizationSignatureId:
 *           type: number
 *           description: Vacation authorization signature ID
 *         exceptionRequestId:
 *           type: number
 *           description: Exception request ID
 *         shiftExceptionId:
 *           type: number
 *           description: Shift exception ID
 *         vacationAuthorizationSignatureFile:
 *           type: string
 *           description: Vacation authorization signature file
 *         vacationAuthorizationSignatureCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Vacation authorization signature created at
 *         vacationAuthorizationSignatureUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Vacation authorization signature updated at
 *         vacationAuthorizationSignatureDeletedAt:
 *           type: string
 *           format: date-time
 *           description: Vacation authorization signature deleted at
 */

export default class VacationAuthorizationSignature extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare vacationAuthorizationSignatureId: number

  @column()
  declare exceptionRequestId: number | null

  @column()
  declare shiftExceptionId: number

  @column()
  declare vacationAuthorizationSignatureFile: string

  @column.dateTime({ autoCreate: true })
  declare vacationAuthorizationSignatureCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare vacationAuthorizationSignatureUpdatedAt: DateTime

  @column.dateTime({ columnName: 'vacation_authorization_signature_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => ExceptionRequest, {
    foreignKey: 'exceptionRequestId',
  })
  declare exceptionRequest: BelongsTo<typeof ExceptionRequest>

  @belongsTo(() => ShiftException, {
    foreignKey: 'shiftExceptionId',
  })
  declare shiftException: BelongsTo<typeof ShiftException>
}
