import logger from '@adonisjs/core/services/logger'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import Complaint from '#models/complaint'
import ComplaintNotificationLog from '#models/complaint_notification_log'
import SystemSetting from '#models/system_setting'
import SystemPermission from '#models/system_permission'
import RoleSystemPermission from '#models/role_system_permission'
import User from '#models/user'
import BusinessUnit from '#models/business_unit'
import {
  COMPLAINT_BOARD_MODULE_PATH,
  COMPLAINT_MANAGE_PERMISSION,
  COMPLAINT_MODULE_SLUG,
  COMPLAINT_NOTIFICATION_CHANNEL,
  COMPLAINT_NOTIFICATION_STATUS,
} from '#constants/complaint_notification'
import { COMPLAINT_INITIAL_STATUS } from '#constants/complaint'
import ComplaintNewAdminMail from '#mails/complaint_new_admin_mail'
// Lista de desarrollo para pruebas - solo estos emails recibirán notificaciones en desarrollo
const DEVELOPMENT_EMAIL_LIST = [
  'jsoto@siler-mx.com',
  'wramirez@siler-mx.com',
  'wilvardo@gmail.com'
]
const DEFAULT_BACKOFFICE_URL = 'http://127.0.0.1:3000'
const DEFAULT_MAIL_LOGO =
  'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png'

export interface ComplaintManageRecipient {
  userId: number
  email: string
}

/**
 * Notificaciones del buzón de quejas a administradores designados (NOM-035).
 * El fallo de envío no debe interrumpir la creación de la queja.
 */
export default class ComplaintNotificationService {
  /**
   * Dispara el aviso por correo al registrar una queja nueva.
   * Registra cada intento en `complaint_notification_logs`.
   */
  async notifyOnNewComplaint(complaintId: number): Promise<void> {
    try {
      const complaint = await Complaint.query()
        .where('complaint_id', complaintId)
        .whereNull('complaint_deleted_at')
        .preload('businessUnit')
        .first()

      if (!complaint) {
        return
      }

      const recipients = await this.fetchManageRecipients(complaint.businessUnitId)
      if (recipients.length === 0) {
        return
      }

      const pendingNewCount = await this.countNewPendingComplaints([complaint.businessUnitId])
      const branding = await this.resolveBrandingForBusinessUnit(complaint.businessUnitId)
      const boardUrl = this.buildBoardUrl()
      const from = resolveMailSender()

      const sentTo: string[] = []
      const isDevelopment = env.get('NODE_ENV') !== 'production'
      for (const recipient of recipients) {
        const sent = await this.sendToRecipient({
          complaintId: complaint.complaintId,
          recipient,
          folio: complaint.complaintFolio,
          pendingNewCount,
          boardUrl,
          from,
          branding,
        })

        if (sent) {
          if (isDevelopment) {
            const isInDevList = DEVELOPMENT_EMAIL_LIST.some(
              (devEmail) => devEmail.toLowerCase() === recipient.email.toLowerCase()
            )
            if (isInDevList) {
              sentTo.push(recipient.email)
            }
          } else {
            sentTo.push(recipient.email)
          }
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('[complaint-notification] Error inesperado al notificar queja nueva', {
        complaintId,
        error: message,
      })
    }
  }

  /**
   * Conteo de quejas en estatus `nuevo` dentro del scope (badge del BO).
   */
  async countNewPendingComplaints(allowedBusinessUnitIds: number[] = []): Promise<number> {
    if (allowedBusinessUnitIds.length === 0) {
      return 0
    }

    const row = await Complaint.query()
      .whereNull('complaint_deleted_at')
      .where('complaint_status', COMPLAINT_INITIAL_STATUS)
      .whereIn('business_unit_id', allowedBusinessUnitIds)
      .count('* as total')

    return Number(row[0]?.$extras?.total ?? 0)
  }

  private async sendToRecipient(input: {
    complaintId: number
    recipient: ComplaintManageRecipient
    folio: string
    pendingNewCount: number
    boardUrl: string
    from: string
    branding: { tradeName: string; backgroundImageLogo: string }
  }): Promise<boolean> {
    const { complaintId, recipient, folio, pendingNewCount, boardUrl, from, branding } = input

    try {
      await mail.send(
        new ComplaintNewAdminMail({
          to: recipient.email,
          from,
          language: 'es',
          branding,
          folio,
          pendingNewCount,
          boardUrl,
        })
      )

      await this.appendLog({
        complaintId,
        recipientUserId: recipient.userId,
        status: COMPLAINT_NOTIFICATION_STATUS.SENT,
      })

      return true
    } catch (error: unknown) {
      await this.appendLog({
        complaintId,
        recipientUserId: recipient.userId,
        status: COMPLAINT_NOTIFICATION_STATUS.FAILED,
      })

      return false
    }
  }

  private async appendLog(input: {
    complaintId: number
    recipientUserId: number
    status: typeof COMPLAINT_NOTIFICATION_STATUS.SENT | typeof COMPLAINT_NOTIFICATION_STATUS.FAILED
  }): Promise<void> {
    await ComplaintNotificationLog.create({
      complaintId: input.complaintId,
      recipientUserId: input.recipientUserId,
      complaintNotificationLogChannel: COMPLAINT_NOTIFICATION_CHANNEL.EMAIL,
      complaintNotificationLogStatus: input.status,
    })
  }

  /**
   * Usuarios activos con permiso `complaint.update` y acceso
   * a la unidad de negocio de la queja.
   */
  private async fetchManageRecipients(businessUnitId: number): Promise<ComplaintManageRecipient[]> {
    const manageRoleIds = await this.fetchComplaintManageRoleIds()
    if (manageRoleIds.length === 0) {
      return []
    }

    const users = await User.query()
      .whereNull('user_deleted_at')
      .where('user_active', 1)
      .whereNotNull('user_email')
      .whereRaw("TRIM(user_email) <> ''")
      .whereIn('role_id', manageRoleIds)
      .whereHas('role', (roleQuery) => {
        roleQuery.whereNull('role_deleted_at').where('role_active', 1)
      })
      .whereHas('businessUnits', (businessUnitQuery) => {
        businessUnitQuery
          .where('business_units.business_unit_id', businessUnitId)
          .where('business_units.business_unit_active', 1)
          .whereNull('business_units.business_unit_deleted_at')
      })
      .select('user_id', 'user_email')

    return this.dedupeRecipients(
      users.map((user) => ({
        userId: user.userId,
        email: user.userEmail.trim(),
      }))
    )
  }

  /** Roles con permiso `update` en el módulo `complaints`. */
  private async fetchComplaintManageRoleIds(): Promise<number[]> {
    const permission = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .where('system_permission_slug', COMPLAINT_MANAGE_PERMISSION)
      .whereHas('systemModule', (moduleQuery) => {
        moduleQuery
          .whereNull('system_module_deleted_at')
          .where('system_module_active', 1)
          .where('system_module_slug', COMPLAINT_MODULE_SLUG)
      })
      .select('system_permission_id')
      .first()

    if (!permission) {
      return []
    }

    const assignments = await RoleSystemPermission.query()
      .whereNull('role_system_permission_deleted_at')
      .where('system_permission_id', permission.systemPermissionId)
      .select('role_id')

    return [...new Set(assignments.map((assignment) => assignment.roleId))]
  }

  private dedupeRecipients(recipients: ComplaintManageRecipient[]): ComplaintManageRecipient[] {
    const seen = new Set<number>()
    const unique: ComplaintManageRecipient[] = []

    for (const recipient of recipients) {
      if (!recipient.email || seen.has(recipient.userId)) {
        continue
      }
      seen.add(recipient.userId)
      unique.push(recipient)
    }

    return unique
  }

  private async resolveBrandingForBusinessUnit(
    businessUnitId: number
  ): Promise<{ tradeName: string; backgroundImageLogo: string }> {
    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('business_unit_deleted_at')
      .first()

    const slug = businessUnit?.businessUnitSlug?.trim().toLowerCase() ?? ''
    const settings = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .select(
        'system_setting_trade_name',
        'system_setting_logo',
        'system_setting_business_units'
      )

    for (const setting of settings) {
      const slugs = (setting.systemSettingBusinessUnits ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)

      if (slug && slugs.includes(slug)) {
        return {
          tradeName: setting.systemSettingTradeName || 'Valanserh',
          backgroundImageLogo: setting.systemSettingLogo || DEFAULT_MAIL_LOGO,
        }
      }
    }

    const fallback = settings[0]
    return {
      tradeName: fallback?.systemSettingTradeName || 'Valanserh',
      backgroundImageLogo: fallback?.systemSettingLogo || DEFAULT_MAIL_LOGO,
    }
  }

  private buildBoardUrl(): string {
    const base = (env.get('BACKOFFICE_URL') ?? DEFAULT_BACKOFFICE_URL).replace(/\/$/, '')
    return `${base}${COMPLAINT_BOARD_MODULE_PATH}`
  }
}
