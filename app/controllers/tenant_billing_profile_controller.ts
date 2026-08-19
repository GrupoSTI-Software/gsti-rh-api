import type { HttpContext } from '@adonisjs/core/http'
import TenantBillingProfileService from '#services/tenant_billing_profile_service'
import { resolveTenantBillingProfileApiError } from '#helpers/tenant_billing_profile_api_error'
import { assertTenantBillingOwner } from '#helpers/tenant_billing_profile_owner_guard'
import { tenantBillingProfileUpsertValidator } from '#validators/tenant_billing_profile.validator'
import type {
  TenantBillingProfileSuccessResponse,
  TenantBillingProfileUpsertInput,
} from '../interfaces/tenant_billing_profile_interface.js'

/**
 * Perfil de facturación fiscal del tenant (USRH1786737531057).
 *
 * Contrato de éxito: `{ type: 'success', data: TenantBillingProfileView }`.
 * Errores: `{ title, detail, key, code }` con prefijo `TNT.BILL.*`.
 */
export default class TenantBillingProfileController {
  private readonly service = new TenantBillingProfileService()

  /**
   * @swagger
   * /api/billing/profile:
   *   get:
   *     tags:
   *       - Tenant Billing Profile
   *     summary: Consultar perfil de facturación de la empresa
   *     description: |
   *       Devuelve el perfil fiscal vivo de la empresa activa del tenant.
   *       Si nunca se ha capturado, responde **200** con `exists: false` y propone
   *       la razón social fiscal desde `business_unit_legal_name` — **nunca 404**.
   *       Solo el dueño de la cuenta (`owner`, `root`, `super-administrador`).
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Perfil existente o propuesta de herencia sin fila persistida
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     exists:
   *                       type: boolean
   *                     rfc:
   *                       type: string
   *                       nullable: true
   *                     legalName:
   *                       type: string
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                       nullable: true
   *                     updatedAt:
   *                       type: string
   *                       format: date-time
   *                       nullable: true
   *       '403':
   *         description: Rol no autorizado
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Datos de facturación
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: solo-el-dueno-de-la-cuenta
   *                 code:
   *                   type: string
   *                   example: TNT.BILL.FORBIDDEN_ROLE
   *       '500':
   *         description: Empresa activa no resuelta u error del sistema
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
   *                 code:
   *                   type: string
   *                   example: TNT.BILL.BUSINESS_UNIT_NOT_FOUND
   */
  async show(ctx: HttpContext) {
    const { response } = ctx

    try {
      await assertTenantBillingOwner(ctx)

      const businessUnitId = this.service.resolveActiveBusinessUnitId()
      const data = await this.service.getForTenant(businessUnitId)

      const payload: TenantBillingProfileSuccessResponse = { type: 'success', data }
      return response.status(200).json(payload)
    } catch (error) {
      const { status, ...body } = resolveTenantBillingProfileApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/billing/profile:
   *   put:
   *     tags:
   *       - Tenant Billing Profile
   *     summary: Guardar perfil de facturación de la empresa
   *     description: |
   *       Upsert del perfil fiscal de la empresa activa (un registro vivo por tenant).
   *       `legalName` es obligatorio; `rfc` es opcional y se valida contra el SAT
   *       si se envía. Omitir `rfc` conserva el valor previo; `rfc: null` lo limpia.
   *       Solo el dueño de la cuenta (`owner`, `root`, `super-administrador`).
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: header
   *         name: X-Business-Unit-Id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - legalName
   *             properties:
   *               legalName:
   *                 type: string
   *                 maxLength: 250
   *               rfc:
   *                 type: string
   *                 minLength: 12
   *                 maxLength: 13
   *                 nullable: true
   *     responses:
   *       '200':
   *         description: Perfil guardado (`exists: true`)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     exists:
   *                       type: boolean
   *                       example: true
   *                     rfc:
   *                       type: string
   *                       nullable: true
   *                     legalName:
   *                       type: string
   *                     createdAt:
   *                       type: string
   *                       format: date-time
   *                     updatedAt:
   *                       type: string
   *                       format: date-time
   *                       nullable: true
   *       '403':
   *         description: Rol no autorizado
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
   *                   example: solo-el-dueno-de-la-cuenta
   *                 code:
   *                   type: string
   *                   example: TNT.BILL.FORBIDDEN_ROLE
   *       '409':
   *         description: Colisión de alta simultánea
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
   *                   example: perfil-en-conflicto
   *                 code:
   *                   type: string
   *                   example: TNT.BILL.PROFILE_CONFLICT
   *       '422':
   *         description: Datos inválidos o RFC incorrecto
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 title:
   *                   type: string
   *                   example: Datos de facturación
   *                 detail:
   *                   type: string
   *                 key:
   *                   type: string
   *                   example: rfc-invalido
   *                 code:
   *                   type: string
   *                   example: TNT.BILL.RFC_INVALID
   *       '500':
   *         description: Empresa activa no resuelta u error del sistema
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
   *                 code:
   *                   type: string
   */
  async upsert(ctx: HttpContext) {
    const { request, response } = ctx

    try {
      await assertTenantBillingOwner(ctx)

      const businessUnitId = this.service.resolveActiveBusinessUnitId()
      const validated = await request.validateUsing(tenantBillingProfileUpsertValidator)
      const rawBody = request.body() as { rfc?: string | null; legalName?: string }

      const input: TenantBillingProfileUpsertInput = {
        legalName: validated.legalName,
      }

      if ('rfc' in rawBody) {
        input.rfc = validated.rfc ?? null
      }

      const data = await this.service.upsertForTenant(businessUnitId, input)

      const payload: TenantBillingProfileSuccessResponse = { type: 'success', data }
      return response.status(200).json(payload)
    } catch (error) {
      const { status, ...body } = resolveTenantBillingProfileApiError(error)
      return response.status(status).json(body)
    }
  }
}
