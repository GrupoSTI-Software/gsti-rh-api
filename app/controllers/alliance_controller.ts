import type { HttpContext } from '@adonisjs/core/http'
import { ALLIANCE_ERRORS } from '#constants/alliance_error_codes'
import AllianceBillingProfileService from '#services/alliance_billing_profile_service'
import AllianceService, { toAllianceView } from '#services/alliance_service'
import { upsertAllianceBillingProfileValidator } from '#validators/alliance_billing_profile'
import {
  createAllianceValidator,
  listAlliancesValidator,
  updateAllianceValidator,
} from '#validators/alliance'
import { resolveAllianceApiError } from '../helpers/alliance_api_error.js'

function resolveAllianceHttpError(error: unknown) {
  const err = error as { code?: string; messages?: Array<{ rule?: string }> }
  if (err?.code === 'E_VALIDATION_ERROR' && err.messages?.[0]?.rule === 'rfc_sat') {
    const catalog = ALLIANCE_ERRORS.RFC_INVALID
    return {
      title: 'Alianzas',
      detail: catalog.detail,
      key: catalog.key,
      code: catalog.code,
      status: catalog.status,
    }
  }

  return resolveAllianceApiError(error)
}

/**
 * Controlador del registro de alianzas comerciales (USRH1788505941892).
 * Todos los endpoints requieren middleware `auth` + `platformAdmin`: es dato
 * de plataforma, no de una empresa cliente.
 */
export default class AllianceController {
  private readonly service = new AllianceService()
  private readonly billingProfileService = new AllianceBillingProfileService()

  /**
   * @swagger
   * /api/platform/alliances:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Listar alianzas comerciales
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         schema:
   *           type: string
   *       - name: active
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *           enum: [0, 1]
   *       - name: page
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: false
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Lista paginada de alianzas comerciales
   *       '422':
   *         description: Filtros inválidos (PLT.ALL.VAL_INPUT)
   */
  async index({ request, response }: HttpContext) {
    try {
      const filters = await request.validateUsing(listAlliancesValidator)
      const result = await this.service.listAlliances(filters)
      return response.status(200).json({ type: 'success', ...result })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Obtener detalle de una alianza comercial
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Detalle de la alianza comercial
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   */
  async show({ params, response }: HttpContext) {
    try {
      const alliance = await this.service.getAlliance(Number(params.allianceId))
      return response.status(200).json({ type: 'success', data: toAllianceView(alliance) })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances:
   *   post:
   *     tags:
   *       - Platform Alliances
   *     summary: Registrar una alianza comercial
   *     description: >
   *       El nombre puede repetirse. La alianza nace activa. El plazo
   *       omitido o nulo se guarda como indeterminado. El porcentaje y el
   *       plazo son valores por omisión: el sistema no los aplica solo.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - allianceName
   *               - allianceDefaultCommissionPercent
   *             properties:
   *               allianceName:
   *                 type: string
   *                 maxLength: 160
   *               allianceContactName:
   *                 type: string
   *                 nullable: true
   *               allianceContactEmail:
   *                 type: string
   *                 nullable: true
   *               allianceContactPhone:
   *                 type: string
   *                 nullable: true
   *               allianceDefaultCommissionPercent:
   *                 type: number
   *                 description: Entre 0 y 100, máximo dos decimales
   *               allianceDefaultTermPeriods:
   *                 type: integer
   *                 nullable: true
   *                 description: Periodos de facturación; null = indeterminado
   *     responses:
   *       '201':
   *         description: Alianza comercial creada
   *       '422':
   *         description: >
   *           Datos inválidos (PLT.ALL.VAL_INPUT), comisión fuera de rango
   *           (PLT.ALL.COMMISSION_OUT_OF_RANGE) o plazo inválido
   *           (PLT.ALL.TERM_PERIODS_INVALID)
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createAllianceValidator)
      const alliance = await this.service.createAlliance(data)
      return response.status(201).json({ type: 'success', data: toAllianceView(alliance) })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}:
   *   patch:
   *     tags:
   *       - Platform Alliances
   *     summary: Corregir una alianza comercial
   *     description: >
   *       `allianceActive` no se acepta por esta vía. Para activar o
   *       desactivar usa los endpoints dedicados. La corrección solo
   *       afecta a lo que se pacte a partir de este momento.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               allianceName:
   *                 type: string
   *               allianceContactName:
   *                 type: string
   *                 nullable: true
   *               allianceContactEmail:
   *                 type: string
   *                 nullable: true
   *               allianceContactPhone:
   *                 type: string
   *                 nullable: true
   *               allianceDefaultCommissionPercent:
   *                 type: number
   *               allianceDefaultTermPeriods:
   *                 type: integer
   *                 nullable: true
   *     responses:
   *       '200':
   *         description: Alianza comercial actualizada
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   *       '422':
   *         description: >
   *           Datos inválidos (PLT.ALL.VAL_INPUT), comisión fuera de rango
   *           (PLT.ALL.COMMISSION_OUT_OF_RANGE) o plazo inválido
   *           (PLT.ALL.TERM_PERIODS_INVALID)
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateAllianceValidator)
      const alliance = await this.service.updateAlliance(Number(params.allianceId), data)
      return response.status(200).json({ type: 'success', data: toAllianceView(alliance) })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/activate:
   *   post:
   *     tags:
   *       - Platform Alliances
   *     summary: Reactivar una alianza comercial inactiva
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Alianza comercial activada
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   *       '422':
   *         description: Ya está activa (PLT.ALL.ALREADY_ACTIVE)
   */
  async activate({ params, response }: HttpContext) {
    try {
      const alliance = await this.service.activateAlliance(Number(params.allianceId))
      return response.status(200).json({ type: 'success', data: toAllianceView(alliance) })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/deactivate:
   *   post:
   *     tags:
   *       - Platform Alliances
   *     summary: Desactivar una alianza comercial (reversible)
   *     description: >
   *       No borra el registro. Conserva íntegras sus condiciones y deja
   *       de ofrecerse para usos nuevos.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Alianza comercial desactivada
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   *       '422':
   *         description: Ya está inactiva (PLT.ALL.ALREADY_INACTIVE)
   */
  async deactivate({ params, response }: HttpContext) {
    try {
      const alliance = await this.service.deactivateAlliance(Number(params.allianceId))
      return response.status(200).json({ type: 'success', data: toAllianceView(alliance) })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/billing-profile:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Consultar el perfil fiscal de una alianza
   *     description: >
   *       Si aún no hay fila, responde 200 con exists false y la razón
   *       social heredada del nombre de la alianza. Única superficie que
   *       entrega el RFC en claro.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Perfil fiscal (existente o heredado)
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   */
  async billingProfileShow({ params, response }: HttpContext) {
    try {
      const data = await this.billingProfileService.getBillingProfile(Number(params.allianceId))
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolveAllianceHttpError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/billing-profile:
   *   put:
   *     tags:
   *       - Platform Alliances
   *     summary: Crear o corregir el perfil fiscal de una alianza
   *     description: >
   *       Upsert singular (siempre 200). Ausente conserva, null limpia,
   *       valor escribe. Se permite sobre una alianza inactiva. El RFC
   *       se valida contra la forma SAT; régimen y uso contra el catálogo.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
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
   *               rfc:
   *                 type: string
   *                 nullable: true
   *               postalCode:
   *                 type: string
   *                 nullable: true
   *               taxRegimeCode:
   *                 type: string
   *                 nullable: true
   *               cfdiUseCode:
   *                 type: string
   *                 nullable: true
   *               billingEmail:
   *                 type: string
   *                 nullable: true
   *     responses:
   *       '200':
   *         description: Perfil fiscal creado o corregido
   *       '404':
   *         description: Alianza no encontrada (PLT.ALL.NOT_FOUND)
   *       '409':
   *         description: Conflicto de alta simultánea (PLT.ALL.BILLING_PROFILE_CONFLICT)
   *       '422':
   *         description: >
   *           Datos inválidos, RFC inválido o combinación SAT incompatible
   */
  async billingProfileUpsert({ params, request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(upsertAllianceBillingProfileValidator)
      const data = await this.billingProfileService.upsertBillingProfile(
        Number(params.allianceId),
        payload
      )
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolveAllianceHttpError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/code:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Consultar el código de descuento de una alianza
   *     description: >
   *       Única consulta dedicada del texto. Distingue alianza
   *       inexistente (NOT_FOUND) de alianza sin código (CODE_NOT_FOUND).
   *       No se cachea: el cuerpo lleva el texto del código.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Código de la alianza
   *       '404':
   *         description: >
   *           Alianza no encontrada (PLT.ALL.NOT_FOUND) o sin código
   *           (PLT.ALL.CODE_NOT_FOUND)
   */
  async showCode({ params, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    try {
      const data = await this.service.getAllianceDiscountCode(Number(params.allianceId))
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/alliances/{allianceId}/code/qr-url:
   *   get:
   *     tags:
   *       - Platform Alliances
   *     summary: Obtener la URL firmada del QR de la alianza
   *     description: >
   *       Entrega un enlace de 300 segundos. Si la imagen aún no está
   *       guardada, la produce y la sube en el acto. No es la imagen:
   *       es el paso 1 de dos.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: allianceId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: URL firmada y expiresIn
   *       '404':
   *         description: Alianza no encontrada o sin código
   *       '503':
   *         description: Almacenamiento no disponible (PLT.ALL.QR_UNAVAILABLE)
   */
  async showQrUrl({ params, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    try {
      const data = await this.service.getAllianceQrUrl(Number(params.allianceId))
      return response.status(200).json({ type: 'success', data })
    } catch (error) {
      const { status, ...body } = resolveAllianceApiError(error)
      return response.status(status).json(body)
    }
  }
}
