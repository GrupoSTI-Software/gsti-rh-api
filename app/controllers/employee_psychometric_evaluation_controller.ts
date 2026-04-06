import { HttpContext } from '@adonisjs/core/http'
import EmployeePsychometricEvaluationService from '#services/employee_psychometric_evaluation_service'
import {
  createEmployeePsychometricEvaluationValidator,
  updateEmployeePsychometricEvaluationValidator,
} from '#validators/employee_psychometric_evaluation'
import Employee from '#models/employee'
import { DateTime } from 'luxon'

export default class EmployeePsychometricEvaluationController {
  /**
   * @swagger
   * /api/employee-psychometric-evaluations:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Psychometric Evaluations
   *     summary: get employee psychometric evaluations
   *     parameters:
   *       - name: employeeId
   *         in: query
   *         required: false
   *         description: Filter by employee id
   *         schema:
   *           type: integer
   *       - name: psychometricTestId
   *         in: query
   *         required: false
   *         description: Filter by psychometric test id
   *         schema:
   *           type: integer
   *       - name: status
   *         in: query
   *         required: false
   *         description: Filter by status (pending, approved, failed)
   *         schema:
   *           type: string
   *       - name: page
   *         in: query
   *         required: true
   *         description: The page number for pagination
   *         default: 1
   *         schema:
   *           type: integer
   *       - name: limit
   *         in: query
   *         required: true
   *         description: The number of records per page
   *         default: 100
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async index({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = request.input('employeeId')
        ? Number(request.input('employeeId'))
        : undefined
      const psychometricTestId = request.input('psychometricTestId')
        ? Number(request.input('psychometricTestId'))
        : undefined
      const status = request.input('status') || undefined
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const service = new EmployeePsychometricEvaluationService()
      const evaluations = await service.index({
        employeeId,
        psychometricTestId,
        status,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('employee_psychometric_evaluations'),
        message: t('resources_were_found_successfully'),
        data: { employeePsychometricEvaluations: evaluations },
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

  /**
   * @swagger
   * /api/employee-psychometric-evaluations:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Psychometric Evaluations
   *     summary: create new employee psychometric evaluation
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
   *               psychometricTestId:
   *                 type: number
   *                 description: Psychometric test id
   *                 required: true
   *               employeePsychometricEvaluationDate:
   *                 type: string
   *                 format: date
   *                 description: Evaluation date (YYYY-MM-DD)
   *                 required: true
   *               results:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     psychometricTestDimensionId:
   *                       type: number
   *                     employeePsychometricEvaluationResultValue:
   *                       type: string
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const payload = await request.validateUsing(createEmployeePsychometricEvaluationValidator)

      const evalDate = DateTime.fromISO(payload.employeePsychometricEvaluationDate)
      if (!evalDate.isValid || evalDate > DateTime.now().startOf('day')) {
        response.status(400)
        return {
          type: 'warning',
          title: t('employee_psychometric_evaluation'),
          message: t('employee_psychometric_evaluation_date_cannot_be_in_future'),
          data: {},
        }
      }

      const employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', payload.employeeId)
        .first()

      if (!employee) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('employee') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('employee') }),
          data: { employeeId: payload.employeeId },
        }
      }

      const service = new EmployeePsychometricEvaluationService()

      const isDuplicate = await service.existsDuplicate(
        payload.employeeId,
        payload.psychometricTestId,
        payload.employeePsychometricEvaluationDate
      )
      if (isDuplicate) {
        response.status(400)
        return {
          type: 'warning',
          title: t('employee_psychometric_evaluation'),
          message: t('employee_psychometric_evaluation_already_exists_for_date'),
          data: {},
        }
      }

      const positionId = employee.positionId ?? 0
      const newEvaluation = await service.create(
        {
          employeeId: payload.employeeId,
          psychometricTestId: payload.psychometricTestId,
          employeePsychometricEvaluationDate: payload.employeePsychometricEvaluationDate,
        },
        positionId,
        payload.results
      )

      response.status(201)
      return {
        type: 'success',
        title: t('employee_psychometric_evaluation'),
        message: t('resource_was_created_successfully'),
        data: { employeePsychometricEvaluation: newEvaluation },
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
   * /api/employee-psychometric-evaluations/{employeePsychometricEvaluationId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Psychometric Evaluations
   *     summary: update employee psychometric evaluation
   *     parameters:
   *       - in: path
   *         name: employeePsychometricEvaluationId
   *         schema:
   *           type: number
   *         description: Employee psychometric evaluation id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeePsychometricEvaluationDate:
   *                 type: string
   *                 format: date
   *               results:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     psychometricTestDimensionId:
   *                       type: number
   *                     employeePsychometricEvaluationResultValue:
   *                       type: string
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const evaluationId = Number(request.param('employeePsychometricEvaluationId'))
      if (!evaluationId || Number.isNaN(evaluationId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', {
            entity: t('employee_psychometric_evaluation'),
          }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }

      const service = new EmployeePsychometricEvaluationService()
      const currentEval = await service.show(evaluationId)
      if (!currentEval) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', {
            entity: t('employee_psychometric_evaluation'),
          }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('employee_psychometric_evaluation'),
          }),
          data: { employeePsychometricEvaluationId: evaluationId },
        }
      }

      const payload = await request.validateUsing(
        updateEmployeePsychometricEvaluationValidator
      )

      if (payload.employeePsychometricEvaluationDate) {
        const evalDate = DateTime.fromISO(payload.employeePsychometricEvaluationDate)
        if (!evalDate.isValid || evalDate > DateTime.now().startOf('day')) {
          response.status(400)
          return {
            type: 'warning',
            title: t('employee_psychometric_evaluation'),
            message: t('employee_psychometric_evaluation_date_cannot_be_in_future'),
            data: {},
          }
        }

        const isDuplicate = await service.existsDuplicate(
          currentEval.employeeId,
          currentEval.psychometricTestId,
          payload.employeePsychometricEvaluationDate,
          evaluationId
        )
        if (isDuplicate) {
          response.status(400)
          return {
            type: 'warning',
            title: t('employee_psychometric_evaluation'),
            message: t('employee_psychometric_evaluation_already_exists_for_date'),
            data: {},
          }
        }
      }

      const employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', currentEval.employeeId)
        .first()

      const positionId = employee?.positionId ?? 0

      const updatedEval = await service.update(
        currentEval,
        {
          employeePsychometricEvaluationDate: payload.employeePsychometricEvaluationDate,
        },
        positionId,
        payload.results
      )

      response.status(201)
      return {
        type: 'success',
        title: t('employee_psychometric_evaluation'),
        message: t('resource_was_updated_successfully'),
        data: { employeePsychometricEvaluation: updatedEval },
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
   * /api/employee-psychometric-evaluations/{employeePsychometricEvaluationId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Psychometric Evaluations
   *     summary: delete employee psychometric evaluation
   *     parameters:
   *       - in: path
   *         name: employeePsychometricEvaluationId
   *         schema:
   *           type: number
   *         description: Employee psychometric evaluation id
   *         required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async delete({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const evaluationId = Number(request.param('employeePsychometricEvaluationId'))
      if (!evaluationId || Number.isNaN(evaluationId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', {
            entity: t('employee_psychometric_evaluation'),
          }),
          message: t('missing_data_to_process'),
          data: { employeePsychometricEvaluationId: evaluationId },
        }
      }
      const service = new EmployeePsychometricEvaluationService()
      const currentEval = await service.show(evaluationId)
      if (!currentEval) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', {
            entity: t('employee_psychometric_evaluation'),
          }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('employee_psychometric_evaluation'),
          }),
          data: { employeePsychometricEvaluationId: evaluationId },
        }
      }
      const deletedEval = await service.delete(currentEval)
      response.status(201)
      return {
        type: 'success',
        title: t('employee_psychometric_evaluation'),
        message: t('resource_was_deleted_successfully'),
        data: { employeePsychometricEvaluation: deletedEval },
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

  /**
   * @swagger
   * /api/employee-psychometric-evaluations/{employeePsychometricEvaluationId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Psychometric Evaluations
   *     summary: get employee psychometric evaluation by id
   *     parameters:
   *       - in: path
   *         name: employeePsychometricEvaluationId
   *         schema:
   *           type: number
   *         description: Employee psychometric evaluation id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async show({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const evaluationId = Number(request.param('employeePsychometricEvaluationId'))
      if (!evaluationId || Number.isNaN(evaluationId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', {
            entity: t('employee_psychometric_evaluation'),
          }),
          message: t('missing_data_to_process'),
          data: { employeePsychometricEvaluationId: evaluationId },
        }
      }
      const service = new EmployeePsychometricEvaluationService()
      const evaluation = await service.show(evaluationId)
      if (!evaluation) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', {
            entity: t('employee_psychometric_evaluation'),
          }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('employee_psychometric_evaluation'),
          }),
          data: { employeePsychometricEvaluationId: evaluationId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('employee_psychometric_evaluation'),
        message: t('resource_was_found_successfully'),
        data: { employeePsychometricEvaluation: evaluation },
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

  /**
   * @swagger
   * /api/employee-psychometric-evaluations/employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Psychometric Evaluations
   *     summary: get all psychometric evaluations by employee
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async getByEmployee({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = Number(request.param('employeeId'))
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('employee') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new EmployeePsychometricEvaluationService()
      const evaluations = await service.getByEmployee(employeeId)
      response.status(200)
      return {
        type: 'success',
        title: t('employee_psychometric_evaluations'),
        message: t('resources_were_found_successfully'),
        data: { employeePsychometricEvaluations: evaluations },
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

  /**
   * @swagger
   * /api/employee-psychometric-evaluations/tests-by-position/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Psychometric Evaluations
   *     summary: get psychometric tests assigned to a position
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         description: Position id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async getTestsByPosition({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionId = Number(request.param('positionId'))
      if (!positionId || Number.isNaN(positionId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new EmployeePsychometricEvaluationService()
      const tests = await service.getTestsByPosition(positionId)
      response.status(200)
      return {
        type: 'success',
        title: t('psychometric_tests'),
        message: t('resources_were_found_successfully'),
        data: { psychometricTests: tests },
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
