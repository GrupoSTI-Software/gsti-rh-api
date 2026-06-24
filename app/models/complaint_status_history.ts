import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { ComplaintStatus } from '#constants/complaint'
import Complaint from './complaint.js'
import User from './user.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     ComplaintStatusHistory:
 *       type: object
 *       description: Entrada inmutable de la bitácora de transiciones de estatus de una queja
 *       properties:
 *         complaintStatusHistoryId:
 *           type: integer
 *           description: Identificador único del registro de bitácora
 *         complaintId:
 *           type: integer
 *           description: Queja a la que pertenece el movimiento (FK)
 *         complaintStatusHistoryFromStatus:
 *           type: string
 *           nullable: true
 *           enum: [nuevo, en-revision, resuelto, cerrado]
 *           description: Estatus anterior (null en el alta inicial del caso)
 *         complaintStatusHistoryToStatus:
 *           type: string
 *           enum: [nuevo, en-revision, resuelto, cerrado]
 *           description: Estatus destino de la transición
 *         complaintStatusHistoryNote:
 *           type: string
 *           description: Nota obligatoria del administrador sobre la acción realizada
 *         actorUserId:
 *           type: integer
 *           description: Usuario administrador que registró la transición (FK)
 *         complaintStatusHistoryCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora del registro (inmutable)
 */
export default class ComplaintStatusHistory extends BaseModel {
  static table = 'complaint_status_histories'

  @column({ isPrimary: true })
  declare complaintStatusHistoryId: number

  @column()
  declare complaintId: number

  @column()
  declare complaintStatusHistoryFromStatus: ComplaintStatus | null

  @column()
  declare complaintStatusHistoryToStatus: ComplaintStatus

  @column()
  declare complaintStatusHistoryNote: string

  @column({ columnName: 'actor_user_id' })
  declare actorUserId: number

  @column.dateTime({
    autoCreate: true,
    columnName: 'complaint_status_history_created_at',
  })
  declare complaintStatusHistoryCreatedAt: DateTime

  @belongsTo(() => Complaint, { foreignKey: 'complaintId' })
  declare complaint: BelongsTo<typeof Complaint>

  @belongsTo(() => User, { foreignKey: 'actorUserId' })
  declare actorUser: BelongsTo<typeof User>
}
