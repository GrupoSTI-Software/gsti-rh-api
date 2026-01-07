import DepartmentService from '#services/department_service'
import { HttpContext } from '@adonisjs/core/http'
import PositionService from '#services/position_service'
import ShiftService from '#services/shift_service'
import EmployeeService from '#services/employee_service'

export default class EstructureDemoController {
   /**
   * @swagger
   * /api/generate-info-demo:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Demo Information
   *     summary: generate info demo
   *     produces:
   *       - application/json
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
   async generateInformationDemo({ response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
        const positionsService = new PositionService(i18n)
        const deletePositions = await positionsService.deleteAllPositions()
        if (deletePositions.status !== 200) {
          response.status(deletePositions.status)
          return {
            type: deletePositions.type,
            title: deletePositions.title,
            message: deletePositions.message,
            data: { ...deletePositions },
          }
        }

        const departmentService = new DepartmentService(i18n)
        const deleteDepartments = await departmentService.deleteAllDepartments()
        if (deleteDepartments.status !== 200) {
          response.status(deleteDepartments.status)
          return {
            type: deleteDepartments.type,
            title: deleteDepartments.title,
            message: deleteDepartments.message,
            data: { ...deleteDepartments },
          }
        }

        const createDepartments = await departmentService.createDepartmentDemo()
        if (createDepartments.status !== 201) {
          response.status(createDepartments.status)
          return {
            type: createDepartments.type,
            title: createDepartments.title,
            message: createDepartments.message,
            data: { ...createDepartments },
          }
        }
        const createPositions = await positionsService.createPositionDemo()
        if (createPositions.status !== 201) {
          response.status(createPositions.status)
          return {
            type: createPositions.type,
            title: createPositions.title,
            message: createPositions.message,
            data: { ...createPositions },
          }
        }

        const shiftService = new ShiftService()
        const deleteShifts = await shiftService.deleteAllShifts()
        if (deleteShifts.status !== 200) {
          response.status(deleteShifts.status)
          return {
            type: deleteShifts.type,
            title: deleteShifts.title,
            message: deleteShifts.message,
            data: { ...deleteShifts },
          }
        }
        const createShifts = await shiftService.createShiftDemo()
        if (createShifts.status !== 201) {
          response.status(createShifts.status)
          return {
            type: createShifts.type,
            title: createShifts.title,
            message: createShifts.message,
            data: { ...createShifts },
          }
        }
        const employeeService = new EmployeeService(i18n)
        const deleteEmployees = await employeeService.deleteAllEmployees()
        if (deleteEmployees.status !== 200) {
          response.status(deleteEmployees.status)
          return {
            type: deleteEmployees.type,
            title: deleteEmployees.title,
            message: deleteEmployees.message,
            data: { ...deleteEmployees },
          }
        }
        response.status(201)
        return {
          type: 'success',
          title: t('information'),
          message: t('the_information_was_created_successfully'),
          data: { departments: createDepartments, positions: createPositions, shifts: createShifts, employees: deleteEmployees },
        }
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
