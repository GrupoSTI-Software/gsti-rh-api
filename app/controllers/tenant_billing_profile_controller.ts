import type { HttpContext } from '@adonisjs/core/http'
import TenantBillingProfileService from '#services/tenant_billing_profile_service'
import { resolveTenantBillingProfileApiError } from '#helpers/tenant_billing_profile_api_error'
import { assertTenantBillingOwner } from '#helpers/tenant_billing_profile_owner_guard'
import { tenantBillingProfileUpsertValidator } from '#validators/tenant_billing_profile.validator'
import type {
  TenantBillingProfileSuccessResponse,
  TenantBillingProfileUpsertInput,
} from '../interfaces/tenant_billing_profile_interface.js'

/** Campos opcionales/nullable del body HTTP cuya ausencia significa "no tocar". */
type TenantBillingProfileUpsertRawBody = {
  legalName?: string
  rfc?: string | null
  postalCode?: string | null
  taxRegimeCode?: string | null
  billingEmail?: string | null
  cfdiUseCode?: string | null
}

const OPTIONAL_UPSERT_FIELDS = [
  'rfc',
  'postalCode',
  'taxRegimeCode',
  'billingEmail',
  'cfdiUseCode',
] as const satisfies ReadonlyArray<keyof TenantBillingProfileUpsertInput>

/**
 * Perfil de facturación fiscal del tenant (USRH1786737531057, USRH1786737531066).
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
   *       Devuelve el perfil fiscal vivo de la empresa activa del tenant, incluyendo
   *       código postal, régimen fiscal, correo de facturación, uso de CFDI y los
   *       derivados `taxpayerType`, `billingProfileComplete` y `missingFields`.
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
   *                       example: ABC010101AB9
   *                     legalName:
   *                       type: string
   *                       example: Abc SA de CV
   *                     postalCode:
   *                       type: string
   *                       nullable: true
   *                       example: "06600"
   *                     taxRegimeCode:
   *                       type: string
   *                       nullable: true
   *                       example: "601"
   *                     billingEmail:
   *                       type: string
   *                       nullable: true
   *                       example: facturas@empresa.mx
   *                     cfdiUseCode:
   *                       type: string
   *                       nullable: true
   *                       example: G03
   *                     taxpayerType:
   *                       type: string
   *                       nullable: true
   *                       enum: [fisica, moral]
   *                       example: moral
   *                     billingProfileComplete:
   *                       type: boolean
   *                       example: true
   *                     missingFields:
   *                       type: array
   *                       items:
   *                         type: string
   *                         enum: [rfc, legalName, postalCode, taxRegimeCode, cfdiUseCode]
   *                       example: []
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
   *       `legalName` es obligatorio; el resto de campos son opcionales.
   *       Omitir una clave conserva el valor previo; enviar `null` la limpia.
   *       Validación cruzada contra el catálogo SAT antes de persistir.
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
   *               postalCode:
   *                 type: string
   *                 pattern: "^\\d{5}$"
   *                 nullable: true
   *                 example: "06600"
   *               taxRegimeCode:
   *                 type: string
   *                 maxLength: 3
   *                 nullable: true
   *                 example: "601"
   *               billingEmail:
   *                 type: string
   *                 format: email
   *                 maxLength: 191
   *                 nullable: true
   *                 example: facturas@empresa.mx
   *               cfdiUseCode:
   *                 type: string
   *                 maxLength: 4
   *                 nullable: true
   *                 example: G03
   *     responses:
   *       '200':
   *         description: Perfil guardado con exists true
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
   *                     postalCode:
   *                       type: string
   *                       nullable: true
   *                     taxRegimeCode:
   *                       type: string
   *                       nullable: true
   *                     billingEmail:
   *                       type: string
   *                       nullable: true
   *                     cfdiUseCode:
   *                       type: string
   *                       nullable: true
   *                     taxpayerType:
   *                       type: string
   *                       nullable: true
   *                       enum: [fisica, moral]
   *                     billingProfileComplete:
   *                       type: boolean
   *                     missingFields:
   *                       type: array
   *                       items:
   *                         type: string
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
   *         description: Datos inválidos, RFC incorrecto o validación cruzada SAT
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
   *                   example: datos-invalidos
   *                 code:
   *                   type: string
   *                   example: TNT.BILL.VAL_INPUT
   *             examples:
   *               formaInvalida:
   *                 summary: CP o correo con forma inválida
   *                 value:
   *                   title: Datos de facturación
   *                   detail: El campo postalCode no es válido
   *                   key: datos-invalidos
   *                   code: TNT.BILL.VAL_INPUT
   *               regimenNoAplicable:
   *                 summary: Régimen incompatible con tipo de RFC
   *                 value:
   *                   title: Régimen fiscal no aplicable
   *                   detail: El régimen fiscal seleccionado no corresponde al tipo de contribuyente del RFC registrado.
   *                   key: regimen-fiscal-no-aplicable
   *                   code: TNT.BILL.TAX_REGIME_NOT_FOR_PERSON_TYPE
   *               usoCfdiNoCompatible:
   *                 summary: Uso de CFDI incompatible con régimen
   *                 value:
   *                   title: Uso de CFDI no compatible
   *                   detail: El uso de CFDI seleccionado no es válido para el régimen fiscal elegido.
   *                   key: uso-cfdi-no-compatible
   *                   code: TNT.BILL.CFDI_USE_NOT_FOR_REGIME
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
      const rawBody = request.body() as TenantBillingProfileUpsertRawBody

      const input: TenantBillingProfileUpsertInput = {
        legalName: validated.legalName,
      }

      for (const field of OPTIONAL_UPSERT_FIELDS) {
        if (field in rawBody) {
          input[field] = validated[field] ?? null
        }
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
