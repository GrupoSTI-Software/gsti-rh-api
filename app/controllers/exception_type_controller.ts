import { HttpContext } from '@adonisjs/core/http'
import ExceptionTypeService from '#services/exception_type_service'
import { ExceptionTypeFilterSearchInterface } from '../interfaces/exception_type_filter_search_interface.js'

export default class ExceptionTypeController {
  /**
   * @swagger
   * /api/exception-types:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Exception Types
   *     summary: get all
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: onlyActive
   *         in: query
   *         required: false
   *         description: Include only active
   *         default: true
   *         schema:
   *           type: boolean
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
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
  async index({ request, response ,auth}: HttpContext) {
    try {
      await auth.check()
      const user = auth.user
      if (!user) {
        return response.status(401).json({
          type: 'error',
          title: 'Unauthorized',
          message: 'Usuario no autenticado',
        })
      }
      await user.load('role')
      var canEmployeeRequests = false
      const roleSlug = user.role.roleSlug
      if (roleSlug !== 'employee') {
        canEmployeeRequests = true
      }
      const search = request.input('search')
      const onlyActive = request.input('onlyActive', true)
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)
      const filters = {
        search: search,
        onlyActive: onlyActive,
        page: page,
        limit: limit,
      } as ExceptionTypeFilterSearchInterface
      const exceptionTypeService = new ExceptionTypeService()
      const exceptionTypes = await exceptionTypeService.index(filters, canEmployeeRequests)
      response.status(200)
      return {
        type: 'success',
        title: 'Exception types',
        message: 'The exception types were found successfully',
        data: {
          exceptionTypes: exceptionTypes,
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
