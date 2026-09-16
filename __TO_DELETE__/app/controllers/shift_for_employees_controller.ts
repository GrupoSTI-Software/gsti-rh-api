import { HttpContext } from '@adonisjs/core/http'
import { fetchRecordsValidator } from '../validators/shift_for_employees.js'
import ShiftForEmployeeService from '#services/shift_for_employees_service'

/**
 * @swagger
 * tags:
 *   name: Shifts
 *   description: Shift management
 */

/**
 * @swagger
 * /api/shift-for-employees:
 *   post:
 *     summary: Get shift records for employees
 *     tags: [Shifts]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: Start date for filtering records
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: End date for filtering records
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: integer
 *         required: false
 *         description: Employee ID to filter records
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: integer
 *         required: false
 *         description: Department ID to filter records
 *       - in: query
 *         name: positionId
 *         schema:
 *           type: integer
 *         required: false
 *         description: Position ID to filter records
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *         required: false
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 10
 *         required: false
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Successfully fetched records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   example: success
 *                 title:
 *                   type: string
 *                   example: Successfully fetched
 *                 message:
 *                   type: string
 *                   example: Records fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 100
 *                         per_page:
 *                           type: integer
 *                           example: 10
 *                         current_page:
 *                           type: integer
 *                           example: 1
 *                         last_page:
 *                           type: integer
 *                           example: 10
 *                         first_page:
 *                           type: integer
 *                           example: 1
 *                         first_page_url:
 *                           type: string
 *                           example: '/api/shift-for-employees?page=1'
 *                         last_page_url:
 *                           type: string
 *                           example: '/api/shift-for-employees?page=10'
 *                         next_page_url:
 *                           type: string
 *                           example: '/api/shift-for-employees?page=2'
 *                         previous_page_url:
 *                           type: string
 *                           example: null
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           employeeId:
 *                             type: integer
 *                             example: 178
 *                           employeeSyncId:
 *                             type: string
 *                             example: '191'
 *                           employeeCode:
 *                             type: string
 *                             example: '28000008'
 *                           employeeFirstName:
 *                             type: string
 *                             example: 'Fernando'
 *                           employeeLastName:
 *                             type: string
 *                             example: 'Hernández Cruz'
 *                           employeePayrollNum:
 *                             type: string
 *                             example: 'SILER'
 *                           employeeHireDate:
 *                             type: string
 *                             format: date
 *                             example: '2023-02-21'
 *                           companyId:
 *                             type: integer
 *                             example: 1
 *                           departmentId:
 *                             type: integer
 *                             example: 14
 *                           positionId:
 *                             type: integer
 *                             example: 52
 *                           departmentSyncId:
 *                             type: string
 *                             example: '28'
 *                           positionSyncId:
 *                             type: string
 *                             example: '110'
 *                           employeeLastSynchronizationAt:
 *                             type: string
 *                             format: date-time
 *                             example: '2024-06-25T14:23:39.000Z'
 *                           employeeCreatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: '2024-06-23T00:34:10.000Z'
 *                           employeeUpdatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: '2024-06-25T14:23:38.000Z'
 *                           employeeShifts:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 employeeShiftId:
 *                                   type: integer
 *                                   example: 1
 *                                 employeeId:
 *                                   type: integer
 *                                   example: 178
 *                                 shiftId:
 *                                   type: integer
 *                                   example: 1
 *                                 employeShiftsApplySince:
 *                                   type: string
 *                                   format: date-time
 *                                   example: '2024-05-01T00:06:00.000Z'
 *                                 shiftDate:
 *                                   type: string
 *                                   format: date-time
 *                                   example: '2024-04-30T16:00:16.000Z'
 *                                 shift:
 *                                   type: object
 *                                   properties:
 *                                     shiftId:
 *                                       type: integer
 *                                       example: 1
 *                                     shiftName:
 *                                       type: string
 *                                       example: 'Estandar'
 *                                     shiftDayStart:
 *                                       type: integer
 *                                       example: 1
 *                                     shiftTimeStart:
 *                                       type: string
 *                                       example: '08:00:00'
 *                                     shiftActiveHours:
 *                                       type: integer
 *                                       example: 10
 *                                     shiftRestDays:
 *                                       type: string
 *                                       example: '6,7'
 *                                     shiftCreatedAt:
 *                                       type: string
 *                                       format: date-time
 *                                       example: '2024-04-30T16:00:16.000Z'
 *                                     shiftUpdatedAt:
 *                                       type: string
 *                                       format: date-time
 *                                       example: '2024-04-30T16:00:16.000Z'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   example: error
 *                 title:
 *                   type: string
 *                   example: Validation error
 *                 message:
 *                   type: string
 *                   example: Invalid input, validation error
 *                 data:
 *                   type: string
 *                   example: Detailed error message
 */
export default class RecordsController {
  async index({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(fetchRecordsValidator)
      const onlyDateStart = `${request.input('startDate')}`.split('T')[0]
      const onliDateEnd = `${request.input('endDate')}`.split('T')[0]
      const serviceResponse = await new ShiftForEmployeeService().getEmployeeShifts(
        {
          dateStart: `${onlyDateStart}T00:00:00.000-06:00`,
          dateEnd: `${onliDateEnd}T23:59:59.000-06:00`,
          employeeId: payload.employeeId,
        },
        payload.limit || 10,
        payload.page || 1
      )

      return response.status(serviceResponse.status).send({ ...serviceResponse })
    } catch (error) {
      return response.status(400).json({
        type: 'error',
        title: 'Validation error',
        message: 'Invalid input, validation error',
        data: error.messages || error.message,
      })
    }
  }
}
