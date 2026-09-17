import { HttpContext } from '@adonisjs/core/http'
import Tolerance from '../models/tolerance.js'
import SystemSetting from '#models/system_setting'
import ToleranceService from '#services/tolerance_service'
import SystemSettingService from '#services/system_setting_service'
import { SystemSettingResolutionError } from '../exceptions/system_setting_resolution_error.js'
import { resolveOptionalTenantBusinessUnitId } from '#helpers/resolve_optional_tenant_business_unit_id'
import { findSystemSettingInScope } from '#helpers/system_setting_tenant_scope'

export default class TolerancesController {
  /**
   * @swagger
   * /api/tolerances/{systemSettingId}:
   *   get:
   *     tags:
   *       - Tolerances
   *     summary: get tolerances by system setting id
   *     parameters:
   *       - name: systemSettingId
   *         in: query
   *         required: true
   *         description: System setting id
   *         schema:
   *           type: number
   *     responses:
   *       200:
   *         description: Returns a list of tolerances
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Tolerance'
   */
  async index({ params, response }: HttpContext) {
    const tolerances = await new ToleranceService().index(params.systemSettingId)
    return response.ok({ data: tolerances })
  }

  /**
   * @swagger
   * /api/tolerances:
   *   post:
   *     summary: create a new tolerance
   *     tags:
   *       - Tolerances
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               toleranceName:
   *                 type: string
   *               toleranceMinutes:
   *                 type: integer
   *               systemSettingId:
   *                 type: integer
   *     responses:
   *       201:
   *         description: Tolerance created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/Tolerance'
   */
  async store({ request, response }: HttpContext) {
    const data = request.only(['toleranceName', 'toleranceMinutes', 'systemSettingId'])

    // El `systemSettingId` llega del cliente: sin resolverlo dentro de la
    // empresa activa se podían sembrar tolerancias en la configuración ajena.
    const systemSetting = await findSystemSettingInScope(data.systemSettingId)
    if (!systemSetting) {
      return response.notFound({ message: 'Tolerance not found' })
    }

    const tolerance = await Tolerance.create({
      toleranceName: data.toleranceName,
      toleranceMinutes: data.toleranceMinutes,
      systemSettingId: data.systemSettingId,
    })

    return response.created({ data: tolerance })
  }

  /**
   * @swagger
   * /api/tolerances/{id}:
   *   get:
   *     summary: get a single tolerance by ID
   *     tags:
   *       - Tolerances
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Returns the specified tolerance
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/Tolerance'
   *       404:
   *         description: Tolerance not found
   */
  async show({ params, response }: HttpContext) {
    const tolerance = await new ToleranceService().findInScope(params.id)
    if (!tolerance) {
      return response.notFound({ message: 'Tolerance not found' })
    }
    return response.ok({ data: tolerance })
  }

  /**
   * @swagger
   * /api/tolerances/{id}:
   *   put:
   *     summary: update an existing tolerance
   *     tags:
   *       - Tolerances
   *     parameters:
   *       - name: id
   *         in: path
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
   *               toleranceName:
   *                 type: string
   *               toleranceMinutes:
   *                 type: integer
   *     responses:
   *       200:
   *         description: Tolerance updated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   $ref: '#/components/schemas/Tolerance'
   *       404:
   *         description: Tolerance not found
   */
  async update({ params, request, response }: HttpContext) {
    const tolerance = await new ToleranceService().findInScope(params.id)
    if (!tolerance) {
      return response.notFound({ message: 'Tolerance not found' })
    }

    tolerance.toleranceName = request.input('toleranceName')
    tolerance.toleranceMinutes = request.input('toleranceMinutes')

    await tolerance.save()

    return response.ok({ data: tolerance })
  }

  /**
   * @swagger
   * /api/tolerances/{id}:
   *   delete:
   *     summary: Set tolerance_minutes to 0 without modifying tolerance_name
   *     tags:
   *       - Tolerances
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Tolerance minutes set to 0
   *       404:
   *         description: Tolerance not found
   */
  async destroy({ params, response }: HttpContext) {
    const tolerance = await new ToleranceService().findInScope(params.id)
    if (!tolerance) {
      return response.notFound({ message: 'Tolerance not found' })
    }
    tolerance.toleranceMinutes = 0
    await tolerance.save()

    return response.ok({ message: 'Tolerance minutes set to 0' })
  }

  /**
   * @swagger
   * /api/tolerances/get-tardiness-tolerance:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Tolerances
   *     summary: Tolerancia de retardo de la empresa que pide (Monitor de asistencia)
   *     description: >-
   *       Ruta literal, sin parámetros. La empresa se resuelve del encabezado
   *       `X-Business-Unit-Id`, ahora obligatorio: el grupo monta `businessScope()`
   *       y sin encabezado la respuesta es 400. Responde `data.tardinessTolerance`
   *       con el objeto Tolerance de esa empresa, o `null` si no tiene una
   *       configurada; el backoffice cae entonces a su valor por omisión.
   *     parameters:
   *       - name: X-Business-Unit-Id
   *         in: header
   *         required: true
   *         description: >-
   *           Empresa activa. Antes era opcional y se caía a la ficha base; el
   *           corte de empresa del grupo lo volvió obligatorio.
   *         schema:
   *           type: string
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  /**
   * La ruta es literal (`/get-tardiness-tolerance`) y no lleva `systemSettingId`:
   * el Monitor de asistencia pide la tolerancia de retardo de la empresa activa,
   * no la de una empresa que él elija. Antes leía `params.systemSettingId`, que
   * aquí siempre es `undefined`, y la consulta reventaba con `".where" expects
   * value to be defined`; el defecto quedaba tapado porque `/:systemSettingId`
   * se registraba primero y atendía esta ruta en su lugar.
   *
   * La empresa sale del encabezado `X-Business-Unit-Id`, no de
   * `SystemSettingService.getActive()` sin argumentos: esa rama filtra
   * `whereNull('business_unit_id')` y devuelve SIEMPRE la ficha base
   * (GrupoSTI), nunca la del tenant que pide. Como las fichas de empresa
   * siempre llevan `business_unit_id` y el backoffice ESCRIBE la tolerancia en
   * la ficha del tenant, el Monitor de cualquier empresa provisionada acababa
   * mostrando, en silencio, la tolerancia de otra.
   *
   * `getActive()` sin scope queda solo para el llamador sin encabezado, que es
   * el contrato legacy de esta ruta.
   */
  private async resolveTardinessSystemSetting(ctx: HttpContext): Promise<SystemSetting | null> {
    const systemSettingService = new SystemSettingService()
    const { businessUnitId, notInScope } = await resolveOptionalTenantBusinessUnitId(ctx)

    // Empresa fuera del alcance del usuario: no se cae a la base, que sería
    // servir la configuración de otra empresa.
    if (notInScope) return null
    if (businessUnitId === null) return systemSettingService.getActive()

    try {
      return await systemSettingService.resolveByBusinessUnitId(businessUnitId)
    } catch (error) {
      // La empresa no tiene ficha propia: mismo contrato que "no la tiene
      // configurada", el backoffice cae a su valor por omisión.
      if (error instanceof SystemSettingResolutionError) return null
      throw error
    }
  }

  /**
   * Tolerancia de retardo de la empresa que pide. La consume el Monitor de
   * asistencia del backoffice.
   *
   * Sin ficha resuelta responde `tardinessTolerance: null` y el backoffice cae a
   * su valor por omisión, igual que cuando la empresa no la tiene configurada.
   */
  async getTardinessTolerance(ctx: HttpContext) {
    const { response } = ctx
    try {
      const systemSettingActive = await this.resolveTardinessSystemSetting(ctx)
      if (!systemSettingActive) {
        response.status(200)
        return {
          type: 'success',
          title: 'Tolerance',
          message: 'The tardiness tolerance found successfully',
          data: {
            tardinessTolerance: null,
          },
        }
      }

      const toleranceService = new ToleranceService()
      const tardinessTolerance = await toleranceService.getTardinessTolerance(
        systemSettingActive.systemSettingId
      )
      response.status(200)
      return {
        type: 'success',
        title: 'Tolerance',
        message: 'The tardiness tolerance found successfully',
        data: {
          tardinessTolerance,
        },
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server Error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}
