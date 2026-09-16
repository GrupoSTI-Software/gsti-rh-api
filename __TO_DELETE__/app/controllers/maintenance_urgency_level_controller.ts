import { HttpContext } from '@adonisjs/core/http'
import { GenericFilterSearchInterface } from '../interfaces/generic_filter_search_interface.js'
import AircraftMaintenanceUrgencyLevelService from '#services/aircraft_maintenance_urgency_level_service'

export default class MaintenanceUrgencyLevelController {
  /**
   * @swagger
   * /api/aircraft-maintenance-urgency-levels:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Aircraft Maintenance Urgency Levels
   *     summary: Get all Aircraft Maintenance Urgency Levels
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
   *         description: List of aircraft maintenance urgency levels found
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

      const aircraftMaintenanceUrgencyLevelService = new AircraftMaintenanceUrgencyLevelService()
      const aircraftMaintenanceUrgencyLevels =
        await aircraftMaintenanceUrgencyLevelService.index(filters)

      response.status(200)
      return {
        type: 'success',
        title: 'Aircraft Maintenance Urgency Levels Found',
        message: 'Aircraft Maintenance Urgency Levels found successfully',
        data: { aircraftMaintenanceUrgencyLevels },
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
