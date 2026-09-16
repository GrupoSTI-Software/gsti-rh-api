import { HttpContext } from '@adonisjs/core/http'
import LogService from '#services/mongo-db/log_service'

/**
 * Bitácora de navegación del backoffice (MongoDB).
 *
 * `show` (GET /api/logs/:entity) e `index` (POST /api/logs) se retiraron: no
 * tenían consumidor en ninguno de los seis clientes y resolvían la colección
 * con el nombre crudo de la petición, sin corte por empresa —ver la cabecera de
 * `start/routes/log_routes.ts`—.
 */
export default class LogController {
  /**
   * @swagger
   * /api/logs/request:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Logs
   *     summary: Create new log request page (MongoDB)
   *     description: |
   *       Registra una visita a una página/ruta en MongoDB.
   *       Guarda información del usuario, ruta visitada, headers del navegador y timestamp.
   *       Se almacena en la colección log_request de MongoDB.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *        application/json:
   *           schema:
   *             type: object
   *             properties:
   *               route:
   *                 type: string
   *                 description: Route
   *                 required: true
   *     responses:
   *       '201':
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
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
   *                   description: Message of response
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
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async store({ auth, request, response }: HttpContext) {
    try {
      const route = request.input('route')
      const logService = new LogService()
      const rawHeaders = request.request.rawHeaders
      const userId = auth.user?.userId
      if (userId) {
        const logUser = await logService.createActionLog(rawHeaders, 'read')
        logUser.user_id = userId
        logUser.route = route
        await logService.saveActionOnLog(logUser)
        response.status(201)
        return {
          type: 'success',
          title: 'Logs',
          message: 'The log was created successfully',
          data: { logUser: logUser },
        }
      } else {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The user Id was not found',
          data: {},
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }
}
