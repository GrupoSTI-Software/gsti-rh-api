import { HttpContext } from '@adonisjs/core/http'
import EmployeeAssessmentService from '#services/employee_assessment_service'
import {
  createEmployeeAssessmentValidator,
  updateEmployeeAssessmentValidator,
} from '#validators/employee_assessment'
import Employee from '#models/employee'
import AssessmentTemplateDimension from '#models/assessment_template_dimension'
import { checkEmployeeAssessmentValueCoherence } from '#services/assessment_data_type_coherence'
import { DateTime } from 'luxon'

/**
 * Resultado de la validación de coherencia para los `results` de una
 * evaluación de empleado. Si alguna dimensión no es coherente con su
 * `dataType`, devuelve la dimensión y la razón del verificador.
 */
type ResultsCoherence =
  | { ok: true }
  | { ok: false; assessmentTemplateDimensionId: number; reason: string }

/**
 * Verifica todos los `results` recibidos contra el `dataType` de cada
 * dimensión perteneciente a la plantilla indicada (CAP-02-08-02).
 *
 * - Cada `result` debe referenciar una dimensión activa de la plantilla.
 * - El valor capturado debe ser coherente con `dataType`:
 *   parseable como número (`numeric`/`percent`) o uno de high/medium/low
 *   (`categorical_amb`).
 *
 * El primer error encontrado corta la verificación.
 */
async function validateResultsAgainstDataTypes(
  assessmentTemplateId: number,
  results:
    | { assessmentTemplateDimensionId: number; employeeAssessmentResultValue?: string | null }[]
    | undefined
): Promise<ResultsCoherence> {
  if (!results || results.length === 0) return { ok: true }

  const dimensionIds = results.map((r) => r.assessmentTemplateDimensionId)
  const dimensions = await AssessmentTemplateDimension.query()
    .whereNull('assessment_template_dimension_deleted_at')
    .where('assessment_template_id', assessmentTemplateId)
    .whereIn('assessment_template_dimension_id', dimensionIds)

  const byId = new Map<number, AssessmentTemplateDimension>(
    dimensions.map((d) => [d.assessmentTemplateDimensionId, d])
  )

  for (const result of results) {
    const dimension = byId.get(result.assessmentTemplateDimensionId)
    if (!dimension) {
      return {
        ok: false,
        assessmentTemplateDimensionId: result.assessmentTemplateDimensionId,
        reason: 'dimension-not-found',
      }
    }
    const coherence = checkEmployeeAssessmentValueCoherence(
      dimension.assessmentTemplateDimensionDataType,
      result.employeeAssessmentResultValue ?? null
    )
    if (!coherence.ok) {
      return {
        ok: false,
        assessmentTemplateDimensionId: result.assessmentTemplateDimensionId,
        reason: coherence.reason!,
      }
    }
  }
  return { ok: true }
}

function buildIncoherentValueResponse(
  t: (key: string, args?: Record<string, unknown>) => string,
  assessmentTemplateDimensionId: number,
  reason: string
) {
  return {
    type: 'error',
    title: t('employee_assessment'),
    detail: t(`employee_assessment_result_coherence_${reason.replaceAll('-', '_')}`),
    key: 'valor-no-coherente-con-tipo',
    data: { assessmentTemplateDimensionId },
  }
}

export default class EmployeeAssessmentController {
  /**
   * @swagger
   * /api/employee-assessments:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Assessments
   *     summary: get employee assessments
   *     parameters:
   *       - name: employeeId
   *         in: query
   *         required: false
   *         description: Filter by employee id
   *         schema:
   *           type: integer
   *       - name: assessmentTemplateId
   *         in: query
   *         required: false
   *         description: Filter by assessment template id
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
      const assessmentTemplateId = request.input('assessmentTemplateId')
        ? Number(request.input('assessmentTemplateId'))
        : undefined
      const status = request.input('status') || undefined
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const service = new EmployeeAssessmentService()
      const assessments = await service.index({
        employeeId,
        assessmentTemplateId,
        status,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('employee_assessments'),
        message: t('resources_were_found_successfully'),
        data: { employeeAssessments: assessments },
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
   * /api/employee-assessments:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Assessments
   *     summary: create new employee assessment
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
   *               assessmentTemplateId:
   *                 type: number
   *                 description: Assessment template id
   *                 required: true
   *               employeeAssessmentDate:
   *                 type: string
   *                 format: date
   *                 description: Assessment date (YYYY-MM-DD)
   *                 required: true
   *               results:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     assessmentTemplateDimensionId:
   *                       type: number
   *                     employeeAssessmentResultValue:
   *                       type: string
   *                       description: |
   *                         Valor capturado. Debe ser coherente con el `dataType` de la dimensión:
   *                         - `numeric` / `percent`: cadena parseable como número (percent en [0,100]).
   *                         - `categorical_amb`: uno de `high`, `medium`, `low`.
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '422':
   *         description: Valor incoherente con el dataType (key 'valor-no-coherente-con-tipo')
   *       default:
   *         description: Unexpected error
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const payload = await request.validateUsing(createEmployeeAssessmentValidator)

      const assessmentDate = DateTime.fromISO(payload.employeeAssessmentDate)
      if (!assessmentDate.isValid || assessmentDate > DateTime.now().startOf('day')) {
        response.status(400)
        return {
          type: 'warning',
          title: t('employee_assessment'),
          message: t('employee_assessment_date_cannot_be_in_future'),
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

      const service = new EmployeeAssessmentService()

      const isDuplicate = await service.existsDuplicate(
        payload.employeeId,
        payload.assessmentTemplateId,
        payload.employeeAssessmentDate
      )
      if (isDuplicate) {
        response.status(400)
        return {
          type: 'warning',
          title: t('employee_assessment'),
          message: t('employee_assessment_already_exists_for_date'),
          data: {},
        }
      }

      const valueCoherence = await validateResultsAgainstDataTypes(
        payload.assessmentTemplateId,
        payload.results
      )
      if (!valueCoherence.ok) {
        response.status(422)
        return buildIncoherentValueResponse(
          t,
          valueCoherence.assessmentTemplateDimensionId,
          valueCoherence.reason
        )
      }

      const positionId = employee.positionId ?? 0
      const newAssessment = await service.create(
        {
          employeeId: payload.employeeId,
          assessmentTemplateId: payload.assessmentTemplateId,
          employeeAssessmentDate: payload.employeeAssessmentDate,
        },
        positionId,
        payload.results
      )

      response.status(201)
      return {
        type: 'success',
        title: t('employee_assessment'),
        message: t('resource_was_created_successfully'),
        data: { employeeAssessment: newAssessment },
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
   * /api/employee-assessments/{employeeAssessmentId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Assessments
   *     summary: update employee assessment
   *     parameters:
   *       - in: path
   *         name: employeeAssessmentId
   *         schema:
   *           type: number
   *         description: Employee assessment id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               employeeAssessmentDate:
   *                 type: string
   *                 format: date
   *               results:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     assessmentTemplateDimensionId:
   *                       type: number
   *                     employeeAssessmentResultValue:
   *                       type: string
   *                       description: Valor coherente con el dataType de la dimensión.
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '422':
   *         description: Valor incoherente con el dataType (key 'valor-no-coherente-con-tipo')
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const assessmentId = Number(request.param('employeeAssessmentId'))
      if (!assessmentId || Number.isNaN(assessmentId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', {
            entity: t('employee_assessment'),
          }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }

      const service = new EmployeeAssessmentService()
      const currentAssessment = await service.show(assessmentId)
      if (!currentAssessment) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', {
            entity: t('employee_assessment'),
          }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('employee_assessment'),
          }),
          data: { employeeAssessmentId: assessmentId },
        }
      }

      const payload = await request.validateUsing(updateEmployeeAssessmentValidator)

      if (payload.employeeAssessmentDate) {
        const assessmentDate = DateTime.fromISO(payload.employeeAssessmentDate)
        if (!assessmentDate.isValid || assessmentDate > DateTime.now().startOf('day')) {
          response.status(400)
          return {
            type: 'warning',
            title: t('employee_assessment'),
            message: t('employee_assessment_date_cannot_be_in_future'),
            data: {},
          }
        }

        const isDuplicate = await service.existsDuplicate(
          currentAssessment.employeeId,
          currentAssessment.assessmentTemplateId,
          payload.employeeAssessmentDate,
          assessmentId
        )
        if (isDuplicate) {
          response.status(400)
          return {
            type: 'warning',
            title: t('employee_assessment'),
            message: t('employee_assessment_already_exists_for_date'),
            data: {},
          }
        }
      }

      const employee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', currentAssessment.employeeId)
        .first()

      const positionId = employee?.positionId ?? 0

      const valueCoherence = await validateResultsAgainstDataTypes(
        currentAssessment.assessmentTemplateId,
        payload.results
      )
      if (!valueCoherence.ok) {
        response.status(422)
        return buildIncoherentValueResponse(
          t,
          valueCoherence.assessmentTemplateDimensionId,
          valueCoherence.reason
        )
      }

      const updatedAssessment = await service.update(
        currentAssessment,
        {
          employeeAssessmentDate: payload.employeeAssessmentDate,
        },
        positionId,
        payload.results
      )

      response.status(201)
      return {
        type: 'success',
        title: t('employee_assessment'),
        message: t('resource_was_updated_successfully'),
        data: { employeeAssessment: updatedAssessment },
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
   * /api/employee-assessments/{employeeAssessmentId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Assessments
   *     summary: delete employee assessment
   *     parameters:
   *       - in: path
   *         name: employeeAssessmentId
   *         schema:
   *           type: number
   *         description: Employee assessment id
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
      const assessmentId = Number(request.param('employeeAssessmentId'))
      if (!assessmentId || Number.isNaN(assessmentId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', {
            entity: t('employee_assessment'),
          }),
          message: t('missing_data_to_process'),
          data: { employeeAssessmentId: assessmentId },
        }
      }
      const service = new EmployeeAssessmentService()
      const currentAssessment = await service.show(assessmentId)
      if (!currentAssessment) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', {
            entity: t('employee_assessment'),
          }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('employee_assessment'),
          }),
          data: { employeeAssessmentId: assessmentId },
        }
      }
      const deletedAssessment = await service.delete(currentAssessment)
      response.status(201)
      return {
        type: 'success',
        title: t('employee_assessment'),
        message: t('resource_was_deleted_successfully'),
        data: { employeeAssessment: deletedAssessment },
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
   * /api/employee-assessments/{employeeAssessmentId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Assessments
   *     summary: get employee assessment by id
   *     parameters:
   *       - in: path
   *         name: employeeAssessmentId
   *         schema:
   *           type: number
   *         description: Employee assessment id
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
      const assessmentId = Number(request.param('employeeAssessmentId'))
      if (!assessmentId || Number.isNaN(assessmentId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', {
            entity: t('employee_assessment'),
          }),
          message: t('missing_data_to_process'),
          data: { employeeAssessmentId: assessmentId },
        }
      }
      const service = new EmployeeAssessmentService()
      const assessment = await service.show(assessmentId)
      if (!assessment) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', {
            entity: t('employee_assessment'),
          }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('employee_assessment'),
          }),
          data: { employeeAssessmentId: assessmentId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('employee_assessment'),
        message: t('resource_was_found_successfully'),
        data: { employeeAssessment: assessment },
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
   * /api/employee-assessments/employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Assessments
   *     summary: get all assessments by employee
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
      const service = new EmployeeAssessmentService()
      const assessments = await service.getByEmployee(employeeId)
      response.status(200)
      return {
        type: 'success',
        title: t('employee_assessments'),
        message: t('resources_were_found_successfully'),
        data: { employeeAssessments: assessments },
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
   * /api/employee-assessments/tests-by-position/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Employee Assessments
   *     summary: get assessment templates assigned to a position
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
  async getTemplatesByPosition({ request, response, i18n }: HttpContext) {
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
      const service = new EmployeeAssessmentService()
      const templates = await service.getTemplatesByPosition(positionId)
      response.status(200)
      return {
        type: 'success',
        title: t('assessment_templates'),
        message: t('resources_were_found_successfully'),
        data: { assessmentTemplates: templates },
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
