import type { HttpContext } from '@adonisjs/core/http'
import RetentionPolicyService from '#services/retention_policy_service'
import RoleService from '#services/role_service'
import { upsertRetentionPolicyValidator } from '#validators/retention_policy'
import { resolveRetentionPolicyApiError } from '../helpers/retention_policy_api_error.js'

export default class RetentionPolicyController {
  private async checkPermission(ctx: HttpContext, action: 'read' | 'write'): Promise<boolean> {
    const user = ctx.auth.user
    if (!user) return false

    await user.load('role')
    if (user.role?.roleSlug === 'root') return true

    const roleService = new RoleService()
    return roleService.hasAccess(user.roleId, 'retention-policy', action)
  }

  private respondError(
    error: unknown,
    response: HttpContext['response'],
    fallbackStatus: number,
    i18n: HttpContext['i18n']
  ) {
    const resolved = resolveRetentionPolicyApiError(error, fallbackStatus, i18n)
    response.status(resolved.status)
    return {
      type: 'error',
      title: resolved.title,
      message: resolved.message,
      key: resolved.key,
      detail: resolved.detail,
      code: resolved.errorCode,
      data: null,
    }
  }

  /**
   * @swagger
   * /api/nom035/retention-policy:
   *   get:
   *     tags:
   *       - NOM035
   *     summary: Get NOM-035 evidence retention policy
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Returns the retention policy for the authenticated user's business unit.
   *       If the business unit has never configured a policy, returns a **virtual default**
   *       `{ isActive: false, retentionYears: 4, coveredEvidenceTypes: [all] }`
   *       without creating a database record.
   *
   *       The business unit is resolved from the `X-Business-Unit-Id` header; never
   *       from the URL or request body (anti-IDOR).
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Active business unit ID of the authenticated user
   *     responses:
   *       '200':
   *         description: Retention policy returned (real record or virtual default)
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
   *                     retentionPolicyId:
   *                       type: integer
   *                       nullable: true
   *                       description: null when returning the virtual default (no DB record yet)
   *                     businessUnitId:
   *                       type: integer
   *                     retentionPolicyIsActive:
   *                       type: boolean
   *                       example: false
   *                     retentionPolicyRetentionYears:
   *                       type: integer
   *                       example: 4
   *                     retentionPolicyCoveredEvidenceTypes:
   *                       type: array
   *                       items:
   *                         type: string
   *                         enum:
   *                           - questionnaire_application
   *                           - traumatic_event_report
   *                           - traumatic_event_referral
   *                           - traumatic_event_exam
   *                           - complaint
   *                     retentionPolicyUpdatedByUserId:
   *                       type: integer
   *                       nullable: true
   *                     retentionPolicyUpdatedAt:
   *                       type: string
   *                       format: date-time
   *                       nullable: true
   *       '401':
   *         description: Unauthenticated user
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: AUTH.UNAUTH
   *                 code:
   *                   type: string
   *                   example: AUTH.UNAUTH
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '400':
   *         description: Missing or invalid X-Business-Unit-Id header (businessScope middleware)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: BU.VAL.000
   *                 code:
   *                   type: string
   *                   example: BU.VAL.000
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '403':
   *         description: Forbidden access
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: forbidden-scope
   *                 code:
   *                   type: string
   *                   example: forbidden-scope
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Unexpected server error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async show(ctx: HttpContext) {
    const { response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'read'))) {
        response.status(403)
        return {
          type: 'error',
          title: i18n.formatMessage('nom035.retention_policy.error_title'),
          message: i18n.formatMessage('nom035.retention_policy.forbidden_scope'),
          key: 'forbidden-scope',
          detail: null,
          code: 'NOM035.RET.FORBIDDEN_SCOPE',
          data: null,
        }
      }

      const businessUnitId = businessUnitScope[0]
      const service = new RetentionPolicyService()
      const result = await service.getByBusinessUnit(businessUnitId)

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('nom035.retention_policy.title'),
        message: i18n.formatMessage('nom035.retention_policy.get_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 500, i18n)
    }
  }

  /**
   * @swagger
   * /api/nom035/retention-policy:
   *   put:
   *     tags:
   *       - NOM035
   *     summary: Create or update NOM-035 evidence retention policy
   *     security:
   *       - bearerAuth: []
   *     description: |
   *       Idempotent upsert of the retention policy for the authenticated user's
   *       business unit. Creates the policy if it does not exist; updates it otherwise.
   *
   *       The business unit is resolved from the `X-Business-Unit-Id` header; the
   *       `businessUnitId` field is **not** accepted in the request body (anti-IDOR).
   *
   *       Records `updatedBy` and `updatedAt` on every write.
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: integer
   *           minimum: 1
   *         description: Active business unit ID of the authenticated user
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - retentionPolicyIsActive
   *               - retentionPolicyRetentionYears
   *               - retentionPolicyCoveredEvidenceTypes
   *             properties:
   *               retentionPolicyIsActive:
   *                 type: boolean
   *                 description: Enable or disable retention for this business unit
   *                 example: true
   *               retentionPolicyRetentionYears:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 99
   *                 description: Retention period in years (legal minimum 1, default 4)
   *                 example: 4
   *               retentionPolicyCoveredEvidenceTypes:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: string
   *                   enum:
   *                     - questionnaire_application
   *                     - traumatic_event_report
   *                     - traumatic_event_referral
   *                     - traumatic_event_exam
   *                     - complaint
   *                 description: NOM-035 evidence types covered by this policy
   *     responses:
   *       '200':
   *         description: Policy saved successfully (created or updated)
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
   *                   description: Persisted policy with audit fields
   *       '400':
   *         description: Request body validation failed (missing field or invalid value)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: NOM035.RET.VAL_INPUT
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: NOM035.RET.VAL_INPUT
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '401':
   *         description: Unauthenticated user
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: unauthorized
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: unauthorized
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '403':
   *         description: Unresolved business unit scope or cross-tenant access attempt
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: forbidden-scope
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: NOM035.RET.FORBIDDEN_SCOPE
   *                 data:
   *                   type: object
   *                   nullable: true
   *       '422':
   *         description: retentionPolicyRetentionYears < 1 (NOM-035 §10.4 legal minimum)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: NOM035.RET.INVALID_PERIOD
   *                 detail:
   *                   type: string
   *                 code:
   *                   type: string
   *                   example: NOM035.RET.INVALID_PERIOD
   *                 data:
   *                   type: object
   *                   nullable: true
   *       default:
   *         description: Unexpected server error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: error
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   nullable: true
   */
  async upsert(ctx: HttpContext) {
    const { auth, request, response, i18n, businessUnitScope } = ctx
    try {
      if (!(await this.checkPermission(ctx, 'write'))) {
        response.status(403)
        return {
          type: 'error',
          title: i18n.formatMessage('nom035.retention_policy.error_title'),
          message: i18n.formatMessage('nom035.retention_policy.forbidden_scope'),
          key: 'forbidden-scope',
          detail: null,
          code: 'NOM035.RET.FORBIDDEN_SCOPE',
          data: null,
        }
      }
      const businessUnitId = businessUnitScope[0]
      const payload = await request.validateUsing(upsertRetentionPolicyValidator)
      const service = new RetentionPolicyService()
      const result = await service.upsert(payload, businessUnitId, auth.user!.userId)

      response.status(200)
      return {
        type: 'success',
        title: i18n.formatMessage('nom035.retention_policy.title'),
        message: i18n.formatMessage('nom035.retention_policy.upsert_success'),
        data: result,
      }
    } catch (error) {
      return this.respondError(error, response, 400, i18n)
    }
  }
}
