import DepartmentService from '#services/department_service'
import { HttpContext } from '@adonisjs/core/http'
import PositionService from '#services/position_service'

export default class EstructureDemoController {
   /**
   * @swagger
   * /api/generate-info-demo/departments:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Departments
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
   async generateDepartmentDemo({ response, i18n }: HttpContext) {
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
        const data = await departmentService.createDepartmentDemo()
        if (data.status !== 201) {
          response.status(data.status)
          return {
            type: data.type,
            title: data.title,
            message: data.message,
            data: { ...data },
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
        
        response.status(201)
        return {
          type: 'success',
          title: t('departments'),
          message: t('the_departments_and_positions_were_created_successfully'),
          data: { ...data },
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
