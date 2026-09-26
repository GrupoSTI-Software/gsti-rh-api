import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type {
  ComplaintNotificationChannel,
  ComplaintNotificationStatus,
} from '#constants/complaint_notification'
import Complaint from './complaint.js'
import User from './user.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     ComplaintNotificationLog:
 *       type: object
 *       description: Registro append-only de un aviso enviado a un administrador designado al crear una queja
 *       properties:
 *         complaintNotificationLogId:
 *           type: integer
 *           description: Identificador único del registro de notificación
 *         complaintId:
 *           type: integer
 *           description: Queja que originó el aviso (FK)
 *         recipientUserId:
 *           type: integer
 *           description: Usuario administrador destinatario (FK)
 *         complaintNotificationLogChannel:
 *           type: string
 *           enum: [email]
 *           description: Canal utilizado para el aviso
 *         complaintNotificationLogStatus:
 *           type: string
 *           enum: [sent, failed]
 *           description: Resultado del intento de envío
 *         complaintNotificationLogCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora del registro (inmutable)
 */
export default class ComplaintNotificationLog extends BaseModel {
  static table = 'complaint_notification_logs'

  @column({ isPrimary: true })
  declare complaintNotificationLogId: number

  @column()
  declare complaintId: number

  @column()
  declare recipientUserId: number

  @column()
  declare complaintNotificationLogChannel: ComplaintNotificationChannel

  @column()
  declare complaintNotificationLogStatus: ComplaintNotificationStatus

  @column.dateTime({
    autoCreate: true,
    columnName: 'complaint_notification_log_created_at',
  })
  declare complaintNotificationLogCreatedAt: DateTime

  @belongsTo(() => Complaint, { foreignKey: 'complaintId' })
  declare complaint: BelongsTo<typeof Complaint>

  @belongsTo(() => User, { foreignKey: 'recipientUserId' })
  declare recipientUser: BelongsTo<typeof User>
}
