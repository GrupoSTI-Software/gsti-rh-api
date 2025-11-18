import EmployeeAssistsCalendarService from '#services/employee_assist_calendar_service'
import { HttpContext } from '@adonisjs/core/http'

export default class EmployeeAssistCalendarController {

  /**
   * @swagger
   * /api/v1/employee-assist-calendars:
   *   get:
   *     summary: get employee assists calendar list
   *     security:
   *       - bearerAuth: []
   *     tags: [EmployeeAssistCalendar]
   *     parameters:
   *       - name: date
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2023-01-01"
   *         description: Date from get list
   *       - name: date-end
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *         default: "2024-12-31"
   *         description: Date limit to get list
   *       - name: employeeId
   *         in: query
   *         required: true
   *         schema:
   *           type: number
   *         description: Number of limit on paginator page
   *     responses:
   *       200:
   *         description: Resource action successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               example: {}
   *       400:
   *         description: Invalid data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  async index({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    const syncAssistsService = new EmployeeAssistsCalendarService(i18n)
    const employeeID = request.input('employeeId')
    const filterDate = request.input('date')
    const filterDateEnd = request.input('date-end')

    try {
      const result = await syncAssistsService.index(
        {
          dateStart: filterDate,
          dateEnd: filterDateEnd,
          employeeID: employeeID,
        }
      )
      return response.status(result.status).json(result)
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: t('server_error'),
        message: t('an_unexpected_error_has_occurred_on_the_server'),
        error: error.message,
      }
    }
  }
}
