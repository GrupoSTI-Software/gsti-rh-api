import EmployeeAssistsCalendarService from '#services/employee_assist_calendar_service'
import { HttpContext } from '@adonisjs/core/http'
import { ensureEmployeeTabRead } from '#helpers/ensure_employee_tab_read'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'

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
   *         description: |
   *           Incluye `data.employeeCalendar` y `data.temporaryAssignments` (misma semántica que GET /api/v1/assists).
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
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    const t = i18n.formatMessage.bind(i18n)
    const syncAssistsService = new EmployeeAssistsCalendarService(i18n)
    const employeeID = request.input('employeeId')
    const filterDate = request.input('date')
    const filterDateEnd = request.input('date-end')

    try {
      const allowed = await ensureEmployeeTabRead(
        ctx,
        Number(employeeID),
        EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexAssistCalendars
      )
      if (!allowed) {
        return
      }

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
