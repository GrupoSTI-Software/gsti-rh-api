import { HttpContext } from '@adonisjs/core/http'
import EmployeeKpiEvaluationService from '#services/employee_kpi_evaluation_service'
import EmployeeKpiEvaluation from '#models/employee_kpi_evaluation'
import { createEmployeeKpiEvaluationValidator, updateEmployeeKpiEvaluationValidator } from '#validators/employee_kpi_evaluation'

export default class EmployeeKpiEvaluationController {
 /**
   * @swagger
   * /api/employee-kpi-evaluations:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Kpi Evaluations
   *     summary: create new employee kpi evaluation
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeEvaluationId:
   *                 type: number
   *                 description: Employee evaluation id
   *                 required: true
   *                 default: ''
   *               positionKpiId:
   *                 type: number
   *                 description: Position kpi id
   *                 required: true
   *                 default: ''
   *               employeeKpiEvaluationScore:
   *                 type: number
   *                 description: Employee kpi evaluation score
   *                 required: true
   *                 default: ''
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
 async store({ request, response, i18n }: HttpContext) {
  const t = i18n.formatMessage.bind(i18n)
  try {

    await request.validateUsing(createEmployeeKpiEvaluationValidator)
    const employeeKpiEvaluationService = new EmployeeKpiEvaluationService(i18n)
    const employeeEvaluationId = request.input('employeeEvaluationId')
    const positionKpiId = request.input('positionKpiId')
    const employeeKpiEvaluationScore = request.input('employeeKpiEvaluationScore')
    const employeeKpiEvaluation = {
      employeeEvaluationId: employeeEvaluationId,
      positionKpiId: positionKpiId,
      employeeKpiEvaluationScore: employeeKpiEvaluationScore,
    } as EmployeeKpiEvaluation

    const newEmployeeKpiEvaluation = await employeeKpiEvaluationService.create(employeeKpiEvaluation)
    response.status(201)
    return {
      type: 'success',
      title: t('resource'),
      message: t('resource_was_created_successfully'),
      data: { employeeKpiEvaluation: newEmployeeKpiEvaluation },
    }
  } catch (error) {
    const messageError =
      error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
    response.status(500)
    return {
      type: 'error',
      title: t('server_error'),
      message: t('an_unexpected_error_has_occurred_on_the_server'),
      error: messageError,
    }
  }
}

   /**
   * @swagger
   * /api/employee-kpi-evaluations/{employeeKpiEvaluationId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Kpi Evaluations
   *     summary: update employee kpi evaluation
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeKpiEvaluationId
   *         schema:
   *           type: number
   *         description: Employee kpi evaluation id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionKpiId:
   *                 type: string
   *                 description: Position kpi id
   *                 required: true
   *               employeeKpiEvaluationScore:
   *                 type: number
   *                 description: Employee kpi evaluation score
   *                 required: true
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
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      await request.validateUsing(updateEmployeeKpiEvaluationValidator)
      const employeeKpiEvaluationId = request.param('employeeKpiEvaluationId')
      const positionKpiId = request.input('positionKpiId')
      const employeeKpiEvaluationScore = request.input('employeeKpiEvaluationScore')
      const employeeKpiEvaluation = {
        employeeKpiEvaluationId: employeeKpiEvaluationId,
        positionKpiId: positionKpiId,
        employeeKpiEvaluationScore: employeeKpiEvaluationScore,
      } as EmployeeKpiEvaluation
      if (!employeeKpiEvaluationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee kpi evaluation Id was not found',
          message: 'Missing data to process',
          data: { ...employeeKpiEvaluation },
        }
      }
      const currentEmployeeKpiEvaluation = await EmployeeKpiEvaluation.query()
        .whereNull('employee_kpi_evaluation_deleted_at')
        .where('employee_kpi_evaluation_id', employeeKpiEvaluationId)
        .first()
      if (!currentEmployeeKpiEvaluation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee kpi evaluation was not found',
          message: 'The employee kpi evaluation was not found with the entered ID',
          data: { ...employeeKpiEvaluation },
        }
      }
      const employeeKpiEvaluationService = new EmployeeKpiEvaluationService(i18n)
      const updateEmployeeKpiEvaluation = await employeeKpiEvaluationService.update(currentEmployeeKpiEvaluation, employeeKpiEvaluation)
      if (updateEmployeeKpiEvaluation) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { employeeKpiEvaluation: updateEmployeeKpiEvaluation },
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

  /**
   * @swagger
   * /api/employee-kpi-evaluations/delete/{employeeKpiEvaluationId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Kpi Evaluations
   *     summary: delete employee kpi evaluation
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeKpiEvaluationId
   *         schema:
   *           type: number
   *         description: Employee kpi evaluation id
   *         required: true
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
  async destroy({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeKpiEvaluationId = request.param('employeeKpiEvaluationId')
      if (!employeeKpiEvaluationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee kpi evaluation Id was not found',
          message: 'Missing data to process',
          data: { employeeKpiEvaluationId },
        }
      }
      const currentEmployeeKpiEvaluation = await EmployeeKpiEvaluation.query()
        .whereNull('employee_kpi_evaluation_deleted_at')
        .where('employee_kpi_evaluation_id', employeeKpiEvaluationId)
        .first()
      if (!currentEmployeeKpiEvaluation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee kpi evaluation was not found',
          message: 'The employee kpi evaluation was not found with the entered ID',
          data: { employeeKpiEvaluationId },
        }
      }
      const employeeKpiEvaluationService = new EmployeeKpiEvaluationService(i18n)
      const deleteEmployeeKpiEvaluation = await employeeKpiEvaluationService.delete(currentEmployeeKpiEvaluation)
      if (deleteEmployeeKpiEvaluation) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { employeeKpiEvaluation: deleteEmployeeKpiEvaluation },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
  /**
   * @swagger
   * /api/employee-kpi-evaluations/{employeeKpiEvaluationId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Kpi Evaluations
   *     summary: get employee kpi evaluation by id
   *     parameters:
   *       - in: path
   *         name: employeeKpiEvaluationId
   *         schema:
   *           type: number
   *         description: Employee kpi evaluation id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       '404':
   *         description: Resource not found
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *       default:
   *         description: Unexpected error
   */
  async show({ request, response, i18n }: HttpContext) {
    try {
      const employeeKpiEvaluationId = request.param('employeeKpiEvaluationId')
      if (!employeeKpiEvaluationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee kpi evaluation Id was not found',
          message: 'Missing data to process',
          data: { employeeKpiEvaluationId },
        }
      }

      const employeeKpiEvaluationService = new EmployeeKpiEvaluationService(i18n)
      const showEmployeeKpiEvaluation = await employeeKpiEvaluationService.show(employeeKpiEvaluationId)
      if (!showEmployeeKpiEvaluation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee kpi evaluation was not found',
          message: 'The employee kpi evaluation was not found with the entered ID',
          data: { employeeKpiEvaluationId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee kpi evaluation',
          message: 'The employee kpi evaluation was found successfully',
          data: { showEmployeeKpiEvaluation: showEmployeeKpiEvaluation },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

}
