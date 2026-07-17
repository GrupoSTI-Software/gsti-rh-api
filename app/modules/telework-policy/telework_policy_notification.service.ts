import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import TeleworkPolicyNotificationLog from '#models/telework_policy_notification_log'
import type TeleworkPolicy from '#models/telework_policy'
import type { TeleworkWorkerRecipient } from '#services/telework_worker_service'
import type { TeleworkPolicyDiffusionSummaryDto } from './dto/telework_policy.dto.js'
import {
  TELEWORK_POLICY_NOTIFICATION_CHANNEL,
  TELEWORK_POLICY_NOTIFICATION_STATUS,
} from '#constants/telework_policy_notification'
import type { TeleworkPolicyNotificationType } from '#constants/telework_policy_notification'

/**
 * Lista de desarrollo para pruebas — solo estos correos reciben avisos
 * reales en desarrollo. Espejo módulo-local de `notice_service.ts` (el
 * gate que BLOQUEA de verdad; el matiz de `complaint_notification_service`
 * — que no bloquea el envío, solo filtra un array de tracking — no se
 * copia). El repo duplica esta lista por servicio (deuda conocida, no se
 * corrige aquí).
 */
const DEVELOPMENT_EMAIL_LIST = ['jsoto@siler-mx.com', 'wramirez@siler-mx.com', 'wilvardo@gmail.com']

const DEFAULT_MAIL_LOGO =
  'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png'

/**
 * Difusión por correo de la Política de Teletrabajo (publicación automática
 * y recordatorio masivo/selectivo, USRH1783547655377) con bitácora de cada
 * intento. Nunca lanza al caller y nunca revierte la publicación: cada
 * destinatario se procesa en su propio try/catch (regla de negocio 5) y
 * corre siempre POST-COMMIT respecto a la transacción de publicar.
 */
export default class TeleworkPolicyNotificationService {
  /**
   * Envía el aviso a cada destinatario y registra un intento por persona en
   * la bitácora. `email === ''` → `skipped` con motivo `sin-correo` (regla
   * de negocio 5, no es un fallo de envío: no hubo intento). Nunca lanza.
   */
  async send(
    policy: TeleworkPolicy,
    recipients: TeleworkWorkerRecipient[],
    type: TeleworkPolicyNotificationType,
    triggeredByUserId: number
  ): Promise<TeleworkPolicyDiffusionSummaryDto> {
    const summary: TeleworkPolicyDiffusionSummaryDto = {
      total: recipients.length,
      sent: 0,
      failed: 0,
      skipped: 0,
    }

    if (recipients.length === 0) {
      return summary
    }

    const branding = await this.resolveBrandingForBusinessUnit(policy.businessUnitId)
    const from = env.get('SMTP_FROM_ADDRESS', env.get('SMTP_USERNAME', 'no-reply@valanserh.local'))
    const isDevelopment = env.get('NODE_ENV') !== 'production'
    const subject = this.buildSubject(type, policy.teleworkPolicyVersion, branding.tradeName)

    for (const recipient of recipients) {
      const email = recipient.email.trim()

      if (!email) {
        await this.appendLog({
          policy,
          employeeId: recipient.employeeId,
          triggeredByUserId,
          type,
          status: TELEWORK_POLICY_NOTIFICATION_STATUS.SKIPPED,
          error: 'sin-correo',
        })
        summary.skipped += 1
        continue
      }

      try {
        if (isDevelopment) {
          const isInDevList = DEVELOPMENT_EMAIL_LIST.some(
            (devEmail) => devEmail.toLowerCase() === email.toLowerCase()
          )
          if (!isInDevList) {
            // En desarrollo, fuera de la lista blanca: simula envío (nunca
            // manda un correo real a un teletrabajador desde dev).
            await this.appendLog({
              policy,
              employeeId: recipient.employeeId,
              triggeredByUserId,
              type,
              status: TELEWORK_POLICY_NOTIFICATION_STATUS.SENT,
            })
            summary.sent += 1
            continue
          }
        }

        await mail.send((message) => {
          message
            .to(email)
            .from(from, branding.tradeName)
            .subject(subject)
            .htmlView('emails/telework_policy_mail', {
              fullName: recipient.fullName,
              version: policy.teleworkPolicyVersion,
              tradeName: branding.tradeName,
              backgroundImageLogo: branding.backgroundImageLogo,
              isReminder: type === 'reminder',
            })
        })

        await this.appendLog({
          policy,
          employeeId: recipient.employeeId,
          triggeredByUserId,
          type,
          status: TELEWORK_POLICY_NOTIFICATION_STATUS.SENT,
        })
        summary.sent += 1
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        await this.appendLog({
          policy,
          employeeId: recipient.employeeId,
          triggeredByUserId,
          type,
          status: TELEWORK_POLICY_NOTIFICATION_STATUS.FAILED,
          error: message.slice(0, 500),
        })
        summary.failed += 1
      }
    }

    return summary
  }

  private buildSubject(
    type: TeleworkPolicyNotificationType,
    version: number,
    tradeName: string
  ): string {
    return type === 'reminder'
      ? `Recordatorio: acusa la Política de Teletrabajo v${version} — ${tradeName}`
      : `Política de Teletrabajo v${version} — ${tradeName}`
  }

  private async appendLog(input: {
    policy: TeleworkPolicy
    employeeId: number
    triggeredByUserId: number
    type: TeleworkPolicyNotificationType
    status: (typeof TELEWORK_POLICY_NOTIFICATION_STATUS)[keyof typeof TELEWORK_POLICY_NOTIFICATION_STATUS]
    error?: string
  }): Promise<void> {
    await TeleworkPolicyNotificationLog.create({
      teleworkPolicyId: input.policy.teleworkPolicyId,
      employeeId: input.employeeId,
      businessUnitId: input.policy.businessUnitId,
      triggeredByUserId: input.triggeredByUserId,
      teleworkPolicyNotificationLogChannel: TELEWORK_POLICY_NOTIFICATION_CHANNEL.EMAIL,
      teleworkPolicyNotificationLogType: input.type,
      teleworkPolicyNotificationLogStatus: input.status,
      teleworkPolicyNotificationLogError: input.error ?? null,
    })
  }

  /**
   * Branding por empresa (tradeName + logo) para el correo. Espejo
   * módulo-local de `complaint_notification_service.resolveBrandingForBusinessUnit`
   * (esa es `private`; no se refactoriza complaint aquí).
   */
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
}
