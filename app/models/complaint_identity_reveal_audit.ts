import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Complaint from './complaint.js'
import User from './user.js'

/**
 * @swagger
 * components:
 *   schemas:
 *     ComplaintIdentityRevealAudit:
 *       type: object
 *       description: Asiento inmutable de una revelación de identidad del denunciante
 *       properties:
 *         complaintIdentityRevealAuditId:
 *           type: integer
 *           description: Identificador único del registro de auditoría
 *         complaintId:
 *           type: integer
 *           description: Queja cuya identidad fue revelada (FK)
 *         revealedByUserId:
 *           type: integer
 *           description: Usuario autorizado que realizó la revelación (FK)
 *         complaintIdentityRevealAuditJustification:
 *           type: string
 *           description: Motivo obligatorio documentado para la revelación
 *         complaintIdentityRevealAuditCreatedAt:
 *           type: string
 *           format: date-time
 *           description: Fecha y hora del registro
 *         complaintIdentityRevealAuditUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Fecha y hora de última actualización
 *         complaintIdentityRevealAuditDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Fecha y hora de eliminación lógica
 */
export default class ComplaintIdentityRevealAudit extends compose(BaseModel, SoftDeletes) {
  static table = 'complaint_identity_reveal_audits'

  @column({ isPrimary: true })
  declare complaintIdentityRevealAuditId: number

  @column()
  declare complaintId: number

  @column()
  declare revealedByUserId: number

  @column()
  declare complaintIdentityRevealAuditJustification: string

  @column.dateTime({
    autoCreate: true,
    columnName: 'complaint_identity_reveal_audit_created_at',
  })
  declare complaintIdentityRevealAuditCreatedAt: DateTime

  @column.dateTime({
    autoCreate: true,
    autoUpdate: true,
    columnName: 'complaint_identity_reveal_audit_updated_at',
  })
  declare complaintIdentityRevealAuditUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'complaint_identity_reveal_audit_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => Complaint, { foreignKey: 'complaintId' })
  declare complaint: BelongsTo<typeof Complaint>

  @belongsTo(() => User, { foreignKey: 'revealedByUserId' })
  declare revealedByUser: BelongsTo<typeof User>
}
