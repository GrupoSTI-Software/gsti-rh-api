import { HttpContext } from '@adonisjs/core/http'
import Tolerance from '../models/tolerance.js'
import ToleranceService from '#services/tolerance_service'
import SystemSettingService from '#services/system_setting_service'

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
    const tolerance = await Tolerance.find(params.id)
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
    const tolerance = await Tolerance.find(params.id)
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
    const tolerance = await Tolerance.find(params.id)
    if (!tolerance) {
      return response.notFound({ message: 'Tolerance not found' })
    }
    tolerance.toleranceMinutes = 0
    await tolerance.save()

    return response.ok({ message: 'Tolerance minutes set to 0' })
  }

  /**
   * @swagger
   * /api/tolerances/get-tardiness-tolerance/{systemSettingId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Tolerances
   *     summary: get tardiness tolerance
   *     parameters:
   *       - name: systemSettingId
   *         in: query
   *         required: true
   *         description: System setting id
   *         schema:
   *           type: number
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
   * La empresa activa se resuelve con `SystemSettingService.getActive()`, que es
   * lo que ya usa `AssistsService.getTardinessToleranceMinutes()` para este mismo
   * dato. Sin empresa activa responde `tardinessTolerance: null` y el backoffice
   * cae a su valor por omisión, igual que cuando la empresa no la tiene
   * configurada.
   */
  async getTardinessTolerance({ response }: HttpContext) {
    try {
      const systemSettingActive = await new SystemSettingService().getActive()
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
