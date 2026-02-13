import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'
import * as relations from '@adonisjs/lucid/types/relations'
import Employee from './employee.js'
import ExceptionType from './exception_type.js'
import User from './user.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     ExceptionRequest:
 *       type: object
 *       properties:
 *         exceptionRequestId:
 *           type: number
 *           description: Exception request ID
 *         employeeId:
 *           type: number
 *           nullable: false
 *           description: ID of the employee associated with the exception request
 *         exceptionTypeId:
 *           type: number
 *           nullable: false
 *           description: ID of the exception type associated with the exception request
 *         requestedDate:
 *           type: string
 *           format: date
 *           description: Date of the exception request
 *         exceptionRequestDescription:
 *           type: string
 *           description: Description of the exception request
 *         exceptionRequestCheckInTime:
 *           type: string
 *           format: time
 *           description: Time check in
 *           nullable: true
 *         exceptionRequestCheckOutTime:
 *           type: string
 *           format: time
 *           description: Time check out
 *           nullable: true
 *         exceptionRequestRhRead:
 *           type: number
 *           description: Read by RH
 *         exceptionRequestGerencialRead:
 *           type: number
 *           description: Read by Gerencial
 *         userId:
 *           type: number
 *           nullable: false
 *           description: User Id who creates it
 *         exceptionRequestCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the exception reques was created
 *         exceptionRequestUpdatedAt:
 *           type: string
 *           format: date-time
 *           description: Date and time when the exception requeswas last updated
 *         exceptionRequestDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date and time when the exception reques was soft-deleted
 *       example:
 *         exceptionRequestId: 1
 *         employeeId: 1
 *         exceptionTypeId: 1
 *         requestedDate: '2024-12-06'
 *         exceptionRequestDescription: "Employee was absent from work"
 *         exceptionRequestCheckInTime: '07:00:00'
 *         exceptionRequestCheckOutTime: '21:00:00'
 *         userId: 1
 *         exceptionRequestCreatedAt: '2024-06-20T12:00:00Z'
 *         exceptionRequestUpdatedAt: '2024-06-20T13:00:00Z'
 *         exceptionRequestDeletedAt: null
 */

export default class ExceptionRequest extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  exceptionRequestId!: number

  @column()
  employeeId!: number

  @column()
  exceptionTypeId!: number

  @column()
  exceptionRequestStatus!: 'requested' | 'pending' | 'accepted' | 'refused'

  @column()
  exceptionRequestDescription?: string

  @column()
  exceptionRequestCheckInTime!: string | null

  @column()
  exceptionRequestCheckOutTime!: string | null

  @column()
  exceptionRequestPeriodInHours!: number | null

  @column()
  declare requestedDate: DateTime<true> | DateTime<false> | string | Date

  @column()
  exceptionRequestRhRead!: number // 0: No leído, 1: Leído

  @column()
  exceptionRequestGerencialRead!: number // 0: No leído, 1: Leído

  @column()
  userId!: number

  @column.dateTime({ autoCreate: true })
  exceptionRequestCreatedAt!: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare exceptionRequestUpdatedAt: DateTime

  @column.dateTime({ columnName: 'exception_request_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Employee, {
    foreignKey: 'employeeId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('person')
      }
    }
  })
  employee!: relations.BelongsTo<typeof Employee>

  @belongsTo(() => ExceptionType, {
    foreignKey: 'exceptionTypeId',
  })
  exceptionType!: relations.BelongsTo<typeof ExceptionType>

  @belongsTo(() => User, {
    foreignKey: 'userId',
    onQuery(query) {
      if (!query.isRelatedSubQuery) {
        query.preload('person')
      }
    },
  })
  user!: relations.BelongsTo<typeof User>
}
