import { HttpContext } from '@adonisjs/core/http'
import { GenericFilterSearchInterface } from '../interfaces/generic_filter_search_interface.js'
import MaintenanceTypeService from '#services/maintenance_type_service'

export default class MaintenanceTypeController {
  /**
   * @swagger
   * /api/maintenance-types:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Maintenance Types
   *     summary: Get all Maintenance Types
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         default: 100
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: List of maintenance types found
   *       '400':
   *         description: Invalid parameters
   *       '404':
   *         description: Not found
   *       '500':
   *         description: Server error
   */
  async index({ request, response }: HttpContext) {
    try {
      const search = request.input('search')
      const page = request.input('page', 1)
      const limit = request.input('limit', 100)

      const filters = {
        search,
        page,
        limit,
      } as GenericFilterSearchInterface

      const maintenanceTypeService = new MaintenanceTypeService()
      const maintenanceTypes = await maintenanceTypeService.index(filters)

      response.status(200)
      return {
        type: 'success',
        title: 'Aircraft Maintenances Found',
        message: 'Aircraft Maintenances found successfully',
        data: { maintenanceTypes },
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
