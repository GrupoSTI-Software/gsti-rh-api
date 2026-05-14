import { HttpContext } from '@adonisjs/core/http'
import { createEmployeeCompetencyEvaluationValidator, updateEmployeeCompetencyEvaluationValidator } from '#validators/employee_competency_evaluation'
import EmployeeCompetencyEvaluation from '#models/employee_competency_evaluation'
import EmployeeCompetencyEvaluationService from '#services/employee_competency_evaluation_service'

export default class EmployeeCompetencyEvaluationController {
 /**
   * @swagger
   * /api/employee-competency-evaluations:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Competency Evaluations
   *     summary: create new employee competency evaluation
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
   *               positionBusinessUnitCompetencyLevelId:
   *                 type: number
   *                 description: Position business unit competency level id
   *                 required: true
   *               businessUnitCompetencyLevelId:
   *                 type: number
   *                 description: Business unit competency level id
   *                 required: true
   *               competencyBracketId:
   *                 type: number
   *                 description: Competency bracket id
   *                 required: true
   *               employeeCompetencyEvaluationBracketDescription:
   *                 type: string
   *                 description: Employee competency evaluation bracket description
   *                 required: true
   *               employeeCompetencyEvaluationBracketRangeMin:
   *                 type: number
   *                 description: Employee competency evaluation bracket range min
   *                 required: true
   *               employeeCompetencyEvaluationBracketRangeMax:
   *                 type: number
   *                 description: Employee competency evaluation bracket range max
   *                 required: true
   *               employeeCompetencyEvaluationScore:
   *                 type: number
   *                 description: Employee competency evaluation score
   *                 required: true
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

    await request.validateUsing(createEmployeeCompetencyEvaluationValidator)
    const employeeCompetencyEvaluationService = new EmployeeCompetencyEvaluationService(i18n)
    const employeeEvaluationId = request.input('employeeEvaluationId')
    const positionBusinessUnitCompetencyLevelId = request.input('positionBusinessUnitCompetencyLevelId')
    const businessUnitCompetencyLevelId = request.input('businessUnitCompetencyLevelId')
    const competencyBracketId = request.input('competencyBracketId')
    const employeeCompetencyEvaluationBracketDescription = request.input('employeeCompetencyEvaluationBracketDescription')
    const employeeCompetencyEvaluationBracketRangeMin = request.input('employeeCompetencyEvaluationBracketRangeMin')
    const employeeCompetencyEvaluationBracketRangeMax = request.input('employeeCompetencyEvaluationBracketRangeMax')
    const employeeCompetencyEvaluationScore = request.input('employeeCompetencyEvaluationScore')
    const employeeCompetencyEvaluation = {
      employeeEvaluationId: employeeEvaluationId,
      positionBusinessUnitCompetencyLevelId: positionBusinessUnitCompetencyLevelId,
      businessUnitCompetencyLevelId: businessUnitCompetencyLevelId,
      employeeCompetencyEvaluationBracketDescription: employeeCompetencyEvaluationBracketDescription,
      employeeCompetencyEvaluationBracketRangeMin: employeeCompetencyEvaluationBracketRangeMin,
      employeeCompetencyEvaluationBracketRangeMax: employeeCompetencyEvaluationBracketRangeMax,
      competencyBracketId: competencyBracketId,
      employeeCompetencyEvaluationScore: employeeCompetencyEvaluationScore,
    } as EmployeeCompetencyEvaluation

    const newEmployeeCompetencyEvaluation = await employeeCompetencyEvaluationService.create(employeeCompetencyEvaluation)
    response.status(201)
    return {
      type: 'success',
      title: t('resource'),
      message: t('resource_was_created_successfully'),
      data: { employeeCompetencyEvaluation: newEmployeeCompetencyEvaluation },
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
   * /api/employee-competency-evaluations/{employeeCompetencyEvaluationId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Competency Evaluations
   *     summary: update employee competency evaluation
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeCompetencyEvaluationId
   *         schema:
   *           type: number
   *         description: Employee competency evaluation id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionBusinessUnitCompetencyLevelId:
   *                 type: number
   *                 description: Position business unit competency level id
   *                 required: true
   *               businessUnitCompetencyLevelId:
   *                 type: number
   *                 description: Business unit competency level id
   *                 required: true
   *               competencyBracketId:
   *                 type: number
   *                 description: Competency bracket id
   *                 required: true
   *               employeeCompetencyEvaluationBracketDescription:
   *                 type: string
   *                 description: Employee competency evaluation bracket description
   *                 required: true
   *               employeeCompetencyEvaluationBracketRangeMin:
   *                 type: number
   *                 description: Employee competency evaluation bracket range min
   *                 required: true
   *               employeeCompetencyEvaluationBracketRangeMax:
   *                 type: number
   *                 description: Employee competency evaluation bracket range max
   *                 required: true
   *               employeeCompetencyEvaluationScore:
   *                 type: number
   *                 description: Employee competency evaluation score
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
      await request.validateUsing(updateEmployeeCompetencyEvaluationValidator)
      const employeeCompetencyEvaluationId = request.param('employeeCompetencyEvaluationId')
      const positionBusinessUnitCompetencyLevelId = request.input('positionBusinessUnitCompetencyLevelId')
      const businessUnitCompetencyLevelId = request.input('businessUnitCompetencyLevelId')
      const competencyBracketId = request.input('competencyBracketId')
      const employeeCompetencyEvaluationBracketDescription = request.input('employeeCompetencyEvaluationBracketDescription')
      const employeeCompetencyEvaluationBracketRangeMin = request.input('employeeCompetencyEvaluationBracketRangeMin')
      const employeeCompetencyEvaluationBracketRangeMax = request.input('employeeCompetencyEvaluationBracketRangeMax')
      const employeeCompetencyEvaluationScore = request.input('employeeCompetencyEvaluationScore')
      const employeeCompetencyEvaluation = {
        employeeCompetencyEvaluationId: employeeCompetencyEvaluationId,
        positionBusinessUnitCompetencyLevelId: positionBusinessUnitCompetencyLevelId,
        businessUnitCompetencyLevelId: businessUnitCompetencyLevelId,
        competencyBracketId: competencyBracketId,
        employeeCompetencyEvaluationBracketDescription: employeeCompetencyEvaluationBracketDescription,
        employeeCompetencyEvaluationBracketRangeMin: employeeCompetencyEvaluationBracketRangeMin,
        employeeCompetencyEvaluationBracketRangeMax: employeeCompetencyEvaluationBracketRangeMax,
        employeeCompetencyEvaluationScore: employeeCompetencyEvaluationScore,
      } as EmployeeCompetencyEvaluation
      if (!employeeCompetencyEvaluationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee competency evaluation Id was not found',
          message: 'Missing data to process',
          data: { ...employeeCompetencyEvaluation },
        }
      }
      const currentEmployeeCompetencyEvaluation = await EmployeeCompetencyEvaluation.query()
        .whereNull('employee_competency_evaluation_deleted_at')
        .where('employee_competency_evaluation_id', employeeCompetencyEvaluationId)
        .first()
      if (!currentEmployeeCompetencyEvaluation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee competency evaluation was not found',
          message: 'The employee competency evaluation was not found with the entered ID',
          data: { ...employeeCompetencyEvaluation },
        }
      }
      const employeeCompetencyEvaluationService = new EmployeeCompetencyEvaluationService(i18n)
      const updateEmployeeCompetencyEvaluation = await employeeCompetencyEvaluationService.update(currentEmployeeCompetencyEvaluation, employeeCompetencyEvaluation)
      if (updateEmployeeCompetencyEvaluation) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { employeeCompetencyEvaluation: updateEmployeeCompetencyEvaluation },
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
   * /api/employee-competency-evaluations/delete/{employeeCompetencyEvaluationId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Competency Evaluations
   *     summary: delete employee competency evaluation
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeCompetencyEvaluationId
   *         schema:
   *           type: number
   *         description: Employee competency evaluation id
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
      const employeeCompetencyEvaluationId = request.param('employeeCompetencyEvaluationId')
      if (!employeeCompetencyEvaluationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee competency evaluation Id was not found',
          message: 'Missing data to process',
          data: { employeeCompetencyEvaluationId },
        }
      }
      const currentEmployeeCompetencyEvaluation = await EmployeeCompetencyEvaluation.query()
        .whereNull('employee_competency_evaluation_deleted_at')
        .where('employee_competency_evaluation_id', employeeCompetencyEvaluationId)
        .first()
      if (!currentEmployeeCompetencyEvaluation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee competency evaluation was not found',
          message: 'The employee competency evaluation was not found with the entered ID',
          data: { employeeCompetencyEvaluationId },
        }
      }
      const employeeCompetencyEvaluationService = new EmployeeCompetencyEvaluationService(i18n)
      const deleteEmployeeCompetencyEvaluation = await employeeCompetencyEvaluationService.delete(currentEmployeeCompetencyEvaluation)
      if (deleteEmployeeCompetencyEvaluation) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { employeeCompetencyEvaluation: deleteEmployeeCompetencyEvaluation },
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
   * /api/employee-competency-evaluations/{employeeCompetencyEvaluationId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Competency Evaluations
   *     summary: get employee competency evaluation by id
   *     parameters:
   *       - in: path
   *         name: employeeCompetencyEvaluationId
   *         schema:
   *           type: number
   *         description: Employee competency evaluation id
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
      const employeeCompetencyEvaluationId = request.param('employeeCompetencyEvaluationId')
      if (!employeeCompetencyEvaluationId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The employee competency evaluation Id was not found',
          message: 'Missing data to process',
          data: { employeeCompetencyEvaluationId },
        }
      }

      const employeeCompetencyEvaluationService = new EmployeeCompetencyEvaluationService(i18n)
      const showEmployeeCompetencyEvaluation = await employeeCompetencyEvaluationService.show(employeeCompetencyEvaluationId)
      if (!showEmployeeCompetencyEvaluation) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The employee competency evaluation was not found',
          message: 'The employee competency evaluation was not found with the entered ID',
          data: { employeeCompetencyEvaluationId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Employee competency evaluation',
          message: 'The employee competency evaluation was found successfully',
          data: { showEmployeeCompetencyEvaluation: showEmployeeCompetencyEvaluation },
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
