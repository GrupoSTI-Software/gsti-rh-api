import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import BillingGracePeriodService from '#services/billing_grace_period_service'
import {
  BILLING_GRACE_DAYS_MAX,
  BILLING_GRACE_DAYS_MIN,
} from '../helpers/contracted_employees_rules.js'
import { resolvePlatformBillingSettingApiError } from '../helpers/platform_billing_setting_api_error.js'
import {
  listPlatformBillingSettingHistoryValidator,
  platformBillingSettingValidatorMessages,
  updatePlatformBillingSettingValidator,
} from '../validators/platform_billing_setting.js'

export default class PlatformBillingSettingController {
  private service = new BillingGracePeriodService()

  /**
   * @swagger
   * /api/platform/billing/settings:
   *   get:
   *     summary: Consulta la configuración vigente de cobro de plataforma
   *     tags: [Platform Billing Settings]
   */
  async show({ response }: HttpContext) {
    try {
      const setting = await this.service.getEffectiveSetting()
      return response.status(200).json({
        type: 'success',
        data: {
          ...setting,
          graceDaysMin: BILLING_GRACE_DAYS_MIN,
          graceDaysMax: BILLING_GRACE_DAYS_MAX,
        },
      })
    } catch (error) {
      logger.error({ err: error, operation: 'show' }, 'platform-billing-setting: error no controlado')
      const { status, ...body } = resolvePlatformBillingSettingApiError(error, 'show')
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/settings:
   *   put:
   *     summary: Actualiza la configuración de cobro de plataforma (append-only)
   *     tags: [Platform Billing Settings]
   */
  async update({ auth, request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(updatePlatformBillingSettingValidator, {
        messagesProvider: platformBillingSettingValidatorMessages,
      })
      const actor = auth.getUserOrFail()
      const { setting, changed } = await this.service.updateSetting(payload, actor.userId)

      return response.status(200).json({
        type: 'success',
        data: {
          ...setting,
          graceDaysMin: BILLING_GRACE_DAYS_MIN,
          graceDaysMax: BILLING_GRACE_DAYS_MAX,
          changed,
        },
      })
    } catch (error) {
      if ((error as { code?: string }).code !== 'E_VALIDATION_ERROR') {
        logger.error({ err: error, operation: 'update' }, 'platform-billing-setting: error no controlado')
      }
      const { status, ...body } = resolvePlatformBillingSettingApiError(error, 'update')
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/billing/settings/history:
   *   get:
   *     summary: Consulta el historial de cambios de la configuración de cobro
   *     tags: [Platform Billing Settings]
   */
  async history({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(listPlatformBillingSettingHistoryValidator, {
        messagesProvider: platformBillingSettingValidatorMessages,
      })
      const page = payload.page ?? 1
      const limit = payload.limit ?? 20

      const result = await this.service.listSettingHistory(page, limit)
      return response.status(200).json({
        type: 'success',
        ...result,
      })
    } catch (error) {
      if ((error as { code?: string }).code !== 'E_VALIDATION_ERROR') {
        logger.error({ err: error, operation: 'history' }, 'platform-billing-setting: error no controlado')
      }
      const { status, ...body } = resolvePlatformBillingSettingApiError(error, 'history')
      return response.status(status).json(body)
    }
  }
}