import { HttpContext } from '@adonisjs/core/http'
import { createEmployeeEvaluationValidator, updateEmployeeEvaluationValidator } from '#validators/employee_evaluation'
import EmployeeEvaluationService from '#services/employee_evaluation_service'
import EmployeeEvaluation from '#models/employee_evaluation'

export default class EmployeeEvaluationController {
 /**
   * @swagger
   * /api/employee-evaluations:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Evaluations
   *     summary: create new employee evaluation
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               employeeEvaluationDate:
   *                 type: string
   *                 description: Employee evaluation date
   *                 required: true
   *                 default: ''
   *               employeeEvaluationType:
   *                 type: string
   *                 description: Employee evaluation type
   *                 required: true
   *                 default: ''
   *               employeeEvaluationScore:
   *                 type: number
   *                 description: Employee evaluation score
   *                 required: false
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

    await request.validateUsing(createEmployeeEvaluationValidator)
    const employeeEvaluationService = new EmployeeEvaluationService(i18n)
    const employeeId = request.input('employeeId')
    const employeeEvaluationDate = request.input('employeeEvaluationDate')
    const employeeEvaluationType = request.input('employeeEvaluationType')
    const employeeEvaluationScore = request.input('employeeEvaluationScore')
    const employeeEvaluation = {
      employeeId: employeeId,
      employeeEvaluationDate: employeeEvaluationDate ? new Date(employeeEvaluationDate) : new Date(),
      employeeEvaluationType: employeeEvaluationType,
      employeeEvaluationScore: employeeEvaluationScore,
    } as EmployeeEvaluation

    const newEmployeeEvaluation = await employeeEvaluationService.create(employeeEvaluation)
    response.status(201)
    return {
      type: 'success',
      title: t('resource'),
      message: t('resource_was_created_successfully'),
      data: { employeeEvaluation: newEmployeeEvaluation },
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
   * /api/employee-evaluations/{employeeEvaluationId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Evaluations
   *     summary: update employee evaluation
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeEvaluationId
   *         schema:
   *           type: number
   *         description: Employee evaluation id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeEvaluationDate:
   *                 type: string
   *                 description: Employee evaluation date
   *                 required: true
   *               employeeEvaluationScore:
   *                 type: number
   *                 description: Employee evaluation score
   *                 required: false
   *                 default: ''
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
      await request.validateUsing(updateEmployeeEvaluationValidator)
      const employeeEvaluationId = request.param('employeeEvaluationId')
      const employeeEvaluationDate = request.input('employeeEvaluationDate')
      const employeeEvaluationScore = request.input('employeeEvaluationScore')
      const employeeEvaluation = {
        employeeEvaluationId: employeeEvaluationId,
        employeeEvaluationDate: employeeEvaluationDate ? new Date(employeeEvaluationDate) : new Date(),
        employeeEvaluationScore: employeeEvaluationScore,
      } as EmployeeEvaluation
      if (!employeeEvaluationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee evaluation Id was not found',
          message: 'Missing data to process',
          data: { ...employeeEvaluation },
        }
      }
      const currentEmployeeEvaluation = await EmployeeEvaluation.query()
        .whereNull('employee_evaluation_deleted_at')
        .where('employee_evaluation_id', employeeEvaluationId)
        .first()
      if (!currentEmployeeEvaluation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee evaluation was not found',
          message: 'The employee evaluation was not found with the entered ID',
          data: { ...employeeEvaluation },
        }
      }
      const employeeEvaluationService = new EmployeeEvaluationService(i18n)
      const updateEmployeeEvaluation = await employeeEvaluationService.update(currentEmployeeEvaluation, employeeEvaluation)
      if (updateEmployeeEvaluation) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { employeeEvaluation: updateEmployeeEvaluation },
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
   * /api/employee-evaluations/delete/{employeeEvaluationId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Evaluations
   *     summary: delete employee evaluation
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeEvaluationId
   *         schema:
   *           type: number
   *         description: Employee evaluation id
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
      const employeeEvaluationId = request.param('employeeEvaluationId')
      if (!employeeEvaluationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee evaluation Id was not found',
          message: 'Missing data to process',
          data: { employeeEvaluationId },
        }
      }
      const currentEmployeeEvaluation = await EmployeeEvaluation.query()
        .whereNull('employee_evaluation_deleted_at')
        .where('employee_evaluation_id', employeeEvaluationId)
        .first()
      if (!currentEmployeeEvaluation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee evaluation was not found',
          message: 'The employee evaluation was not found with the entered ID',
          data: { employeeEvaluationId },
        }
      }
      const employeeEvaluationService = new EmployeeEvaluationService(i18n)
      const deleteEmployeeEvaluation = await employeeEvaluationService.delete(currentEmployeeEvaluation)
      if (deleteEmployeeEvaluation) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { employeeEvaluation: deleteEmployeeEvaluation },
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
   * /api/employee-evaluations/{employeeEvaluationId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Evaluations
   *     summary: get employee evaluation by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeEvaluationId
   *         schema:
   *           type: number
   *         description: Employee evaluation id
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
  async show({ request, response, i18n }: HttpContext) {
    try {
      const employeeEvaluationId = request.param('employeeEvaluationId')
      if (!employeeEvaluationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee evaluation Id was not found',
          message: 'Missing data to process',
          data: { employeeEvaluationId },
        }
      }

      const employeeEvaluationService = new EmployeeEvaluationService(i18n)
      const showEmployeeEvaluation = await employeeEvaluationService.show(employeeEvaluationId)
      if (!showEmployeeEvaluation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee evaluation was not found',
          message: 'The employee evaluation was not found with the entered ID',
          data: { employeeEvaluationId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee evaluation',
          message: 'The employee evaluation was found successfully',
          data: { employeeEvaluation: showEmployeeEvaluation },
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
   * /api/employee-evaluations/by-employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Evaluations
   *     summary: get employee evaluations by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: integer
   *         description: Employee id
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
   async getByEmployee({ request, response, i18n }: HttpContext) {
    try {
      const employeeId = request.param('employeeId')

      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'Missing data to process',
          message: 'The employee Id was not found',
          data: { employeeId },
        }
      }

      const employeeEvaluationService = new EmployeeEvaluationService(i18n)
      const employeeEvaluations = await employeeEvaluationService.getByEmployee(employeeId)

      response.status(200)
      return {
        type: 'success',
        title: 'Employee Evaluations',
        message: 'The employee evaluations were found successfully',
        data: { employeeEvaluations },
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
