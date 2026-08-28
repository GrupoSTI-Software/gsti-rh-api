import BusinessUnitService from '#services/business_unit_service'
import AdditionalBusinessUnitService from '#services/additional_business_unit_service'
import { assertAdditionalBusinessUnitOwner } from '#helpers/billing_owner_guard'
import { resolveAdditionalBusinessUnitApiError } from '#helpers/business_unit_signup_api_error'
import { createAdditionalBusinessUnitValidator } from '#validators/business_unit'
import { HttpContext } from '@adonisjs/core/http'

export default class BusinessUnitController {
  /**
   * @swagger
   * /api/business-units:
   *   get:
   *     tags:
   *       - Business Units
   *     summary: Get all system business units
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Business units fetched successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   */
  async index({ response, i18n, businessUnitScope }: HttpContext) {
    const res = await new BusinessUnitService(i18n).index(businessUnitScope)
    return response.status(res.status || 200).send(res)
  }

  /**
   * @swagger
   * /api/business-units:
   *   post:
   *     tags:
   *       - Business Units
   *     summary: Dar de alta una empresa adicional y contratarla en un solo acto
   *     description: |
   *       Crea una nueva empresa bajo la cuenta del usuario autenticado y la
   *       contrata en el plan indicado, todo en un solo acto atómico
   *       (USRH1787932877001).
   *
   *       El alta omite el periodo de prueba: el incentivo solo aplica al primer
   *       registro de la cuenta.
   *
   *       La operación requiere que el usuario tenga el rol `owner`,
   *       `root` o `super-administrador`.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - businessUnitName
   *               - billingPlanId
   *               - contractedEmployees
   *             properties:
   *               businessUnitName:
   *                 type: string
   *                 maxLength: 200
   *                 example: "Región Monterrey"
   *               businessUnitLegalName:
   *                 type: string
   *                 maxLength: 250
   *                 example: "Operaciones Monterrey S.A. de C.V."
   *               billingPlanId:
   *                 type: integer
   *                 example: 3
   *               contractedEmployees:
   *                 type: integer
   *                 example: 20
   *     responses:
   *       '201':
   *         description: >
   *           Empresa creada y suscripción activa (sin periodo de prueba).
   *           La respuesta incluye los datos de la empresa y el snapshot
   *           completo de la suscripción con `firstPaymentDate`.
   *       '400':
   *         description: >
   *           Datos inválidos (TNT.BU.VAL_INPUT).
   *       '403':
   *         description: >
   *           Solo el dueño de la cuenta puede crear empresas adicionales
   *           (TNT.BU.FORBIDDEN_ROLE).
   *       '404':
   *         description: >
   *           Plan no encontrado (PLT.SUB.PLAN_NOT_FOUND).
   *       '409':
   *         description: >
   *           Ya tienes una empresa activa con ese nombre (TNT.BU.DUPLICATE_NAME), o bien
   *           alcanzaste el máximo de empresas activas por cuenta (TNT.BU.LIMIT_REACHED).
   *       '422':
   *         description: >
   *           Cantidad contratada inválida (PLT.SUB.EMPLOYEES_NOT_BLOCK_OF_TEN o
   *           PLT.SUB.EMPLOYEES_ABOVE_SAFETY_CAP), o plan no publicado/vigente
   *           (PLT.SUB.PLAN_NOT_PUBLISHED).
   *       '429':
   *         description: >
   *           Más de 5 altas de empresa por minuto desde la misma IP
   *           (TNT.BU.RATE_LIMITED).
   *       '500':
   *         description: >
   *           Error interno: colisión de slug agotada (TNT.BU.SLUG_CONFLICT),
   *           fallo de configuración base (TNT.BU.SETTINGS_PROVISIONING_FAILED), o
   *           error no clasificado (TNT.BU.CREATION_FAILED).
   */
  async store(ctx: HttpContext) {
    const { request, response, auth, logger } = ctx

    try {
      // Guard: solo owner / root / super-administrador — antes de leer el cuerpo (CA-5)
      await assertAdditionalBusinessUnitOwner(ctx)

      const body = await request.validateUsing(createAdditionalBusinessUnitValidator)

      const result = await new AdditionalBusinessUnitService().createAdditionalBusinessUnit({
        ...body,
        user: auth.user!,
      })

      return response.status(201).json({ type: 'success', data: result })
    } catch (error: unknown) {
      const resolved = resolveAdditionalBusinessUnitApiError(error)

      if (resolved.status >= 500) {
        logger.error({ err: error }, 'BusinessUnitController.store: error no clasificado en alta.')
      }

      const { status, ...body } = resolved
      return response.status(status).json(body)
    }
  }
}
