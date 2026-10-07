import type { HttpContext } from '@adonisjs/core/http'
import TeleworkComplianceSettingService from '#services/telework_compliance_setting_service'
import { upsertTeleworkComplianceSettingValidator } from '#validators/telework_compliance_setting'
import { TELEWORK_COMPLIANCE_SETTING_ERROR_CODES } from '#constants/telework_compliance_setting_error_codes'
import {
  assertComplianceRepsePermission,
} from '#helpers/compliance_repse_rbac'
import { resolveTeleworkComplianceSettingApiError } from '#helpers/telework_compliance_setting_api_error'

/** Módulo de catálogo cuyos permisos gobiernan estas rutas. */
const MODULE_SLUG = 'telework-settings'
/** Respuesta 403 propia del helper RBAC (sin `detail`, con `errorCode`). */
const RBAC_FORBIDDEN = {
  errorCode: TELEWORK_COMPLIANCE_SETTING_ERROR_CODES.FORBIDDEN,
  i18nPrefix: 'telework_settings',
}

/**
 * Controlador HTTP de los ajustes de teletrabajo por empresa
 * (VLRH-H1791306074375).
 *
 * Espejo de `retention_policy_controller.ts` con el permiso propio del módulo
 * `telework-settings` (`read`/`update`) vía `assertComplianceRepsePermission`
 * —patrón de `telework_policy.controller.ts`—. Sin id en la ruta: la empresa
 * siempre sale del scope resuelto por el header `X-Business-Unit-Id`. El `show`
 * nunca responde 404: el servicio devuelve el default virtual con 200.
 */
export default class TeleworkComplianceSettingController {
  /** Responde 403 y devuelve `false` si el usuario no tiene la acción pedida. */
  private async assertHasPermission(
    ctx: HttpContext,
    action: 'read' | 'update'
  ): Promise<boolean> {
    return assertComplianceRepsePermission(ctx, MODULE_SLUG, action, RBAC_FORBIDDEN)
  }

  /** Cuerpo de error uniforme `{ type, title, message, key, detail, code, data }`. */
  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallbackStatus: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveTeleworkComplianceSettingApiError(error, fallbackStatus, i18n)
    response.status(resolved.status)
    return {
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      key: resolved.key,
      detail: resolved.detail,
      code: resolved.errorCode,
      data: resolved.field ? { field: resolved.field } : null,
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-settings:
   *   get:
   *     tags:
   *       - NOM037
   *     summary: Get telework settings for the business unit
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Returns the telework settings of the authenticated user's business unit.
   *       If the business unit has never configured them, returns a **virtual default**
   *       `{ revalidationPeriodMonths: 12, expirationNoticeDays: 30, amounts: null }`
   *       without creating a database record (never 404).
   *
   *       The business unit is resolved from the `X-Business-Unit-Id` header; never
   *       from the URL or request body (anti-IDOR).
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Public code (UUID v4) of the active business unit
   *     responses:
   *       '200':
   *         description: Telework settings returned (real record or virtual default)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     isDefault:
   *                       type: boolean
   *                     teleworkComplianceSettingId:
   *                       type: integer
   *                       nullable: true
   *                     revalidationPeriodMonths:
   *                       type: integer
   *                     expirationNoticeDays:
   *                       type: integer
   *                     electricityAllowanceDefault:
   *                       type: number
   *                       nullable: true
   *                     internetAllowanceDefault:
   *                       type: number
   *                       nullable: true
   *                     ownEquipmentFeeDefault:
   *                       type: number
   *                       nullable: true
   *                     updatedAt:
   *                       type: string
   *                       format: date-time
   *                       nullable: true
   *                     updatedByName:
   *                       type: string
   *                       nullable: true
   *       '401':
   *         description: Unauthenticated user
   *       '403':
   *         description: Missing module permission
   *       '404':
   *         description: Invalid or out-of-scope business unit (businessScope middleware)
   *       default:
   *         description: Unexpected server error
   */
  async show(ctx: HttpContext) {
    const { response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.assertHasPermission(ctx, 'read'))) {
        return
      }

      const businessUnitId = businessUnitScope[0]
      const service = new TeleworkComplianceSettingService()
      const result = await service.getEffective(businessUnitId)

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('telework_settings.title'),
        message: i18n.formatMessage('telework_settings.get_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom037/telework-settings:
   *   put:
   *     tags:
   *       - NOM037
   *     summary: Create or update telework settings for the business unit
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Full-replacement upsert of the telework settings of the authenticated
   *       user's business unit. All five keys are mandatory; amounts accept `null`
   *       ("the business unit does not propose an amount", never 0). Extra keys are
   *       discarded. The `businessUnitId` in the body is ignored (anti-IDOR).
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Public code (UUID v4) of the active business unit
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - revalidationPeriodMonths
   *               - expirationNoticeDays
   *               - electricityAllowanceDefault
   *               - internetAllowanceDefault
   *               - ownEquipmentFeeDefault
   *             properties:
   *               revalidationPeriodMonths:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 12
   *                 example: 6
   *               expirationNoticeDays:
   *                 type: integer
   *                 minimum: 1
   *                 example: 15
   *               electricityAllowanceDefault:
   *                 type: number
   *                 nullable: true
   *                 example: 350
   *               internetAllowanceDefault:
   *                 type: number
   *                 nullable: true
   *                 example: 500
   *               ownEquipmentFeeDefault:
   *                 type: number
   *                 nullable: true
   *                 example: 250
   *     responses:
   *       '200':
   *         description: Settings saved (created or updated)
   *       '401':
   *         description: Unauthenticated user
   *       '403':
   *         description: Missing module permission
   *       '422':
   *         description: |
   *           Invalid input. `TWS.VAL.001` for a malformed body (Vine);
   *           `TWS.VAL.002/003/004` for a domain rule, with `data.field`
   *           naming the offending field.
   *       default:
   *         description: Unexpected server error
   */
  async update(ctx: HttpContext) {
    const { auth, request, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.assertHasPermission(ctx, 'update'))) {
        return
      }

      const businessUnitId = businessUnitScope[0]
      const payload = await request.validateUsing(upsertTeleworkComplianceSettingValidator)
      const service = new TeleworkComplianceSettingService()
      const result = await service.upsert(payload, businessUnitId, auth.user!.userId)

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('telework_settings.title'),
        message: i18n.formatMessage('telework_settings.upsert_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }
}
