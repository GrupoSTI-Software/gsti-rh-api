import { HttpContext } from '@adonisjs/core/http'
import AssessmentTemplateService from '#services/assessment_template_service'
import {
  createAssessmentTemplateValidator,
  updateAssessmentTemplateValidator,
} from '#validators/assessment_template'

/**
 * Detecta si la falla VineJS proviene de un valor inválido en
 * `assessmentTemplateDimensionDataType` (campo plano o anidado dentro de
 * `dimensions[]`). Cuando ocurre, el controlador responde 422 con la clave
 * estable `tipo-dato-invalido` (CAP-02-08-01).
 */
function isInvalidDataTypeError(error: any): boolean {
  if (error?.code !== 'E_VALIDATION_ERROR') return false
  const messages: Array<{ field?: string; rule?: string }> = error.messages ?? []
  return messages.some(
    (m) =>
      m.rule === 'enum' &&
      typeof m.field === 'string' &&
      m.field.endsWith('assessmentTemplateDimensionDataType')
  )
}

function buildInvalidDataTypeResponse(t: (key: string, args?: Record<string, unknown>) => string) {
  return {
    type: 'error',
    title: t('assessment_template_dimension'),
    detail: t('assessment_template_dimension_data_type_invalid'),
    key: 'tipo-dato-invalido',
  }
}

export default class AssessmentTemplateController {
  /**
   * @swagger
   * /api/assessment-templates:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: get assessment templates
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search term for assessment template name
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
      const search = request.input('search')
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const service = new AssessmentTemplateService()
      const assessmentTemplates = await service.index({
        search,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('assessment_templates'),
        message: t('resources_were_found_successfully'),
        data: {
          assessmentTemplates,
        },
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
   * /api/assessment-templates:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: create new assessment template
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               assessmentTemplateName:
   *                 type: string
   *                 description: Template name
   *                 required: true
   *                 default: ''
   *               assessmentTemplateDescription:
   *                 type: string
   *                 description: Template description
   *                 default: ''
   *               dimensions:
   *                 type: array
   *                 description: Template dimensions
   *                 items:
   *                   type: object
   *                   properties:
   *                     assessmentTemplateDimensionName:
   *                       type: string
   *                     assessmentTemplateDimensionAcronym:
   *                       type: string
   *                     assessmentTemplateDimensionDataType:
   *                       type: string
   *                       enum: [numeric, percent, categorical_amb]
   *                       description: Tipo de dato de la dimensión (default 'numeric')
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '422':
   *         description: Tipo de dato inválido (key 'tipo-dato-invalido')
   *       default:
   *         description: Unexpected error
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const payload = await request.validateUsing(createAssessmentTemplateValidator)
      const service = new AssessmentTemplateService()
      const newTemplate = await service.create(
        {
          assessmentTemplateName: payload.assessmentTemplateName,
          assessmentTemplateDescription: payload.assessmentTemplateDescription ?? null,
        },
        payload.dimensions
      )
      response.status(201)
      return {
        type: 'success',
        title: t('assessment_template'),
        message: t('resource_was_created_successfully'),
        data: { assessmentTemplate: newTemplate },
      }
    } catch (error) {
      if (isInvalidDataTypeError(error)) {
        response.status(422)
        return buildInvalidDataTypeResponse(t)
      }
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
   * /api/assessment-templates/{assessmentTemplateId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: update assessment template
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateId
   *         schema:
   *           type: number
   *         description: Assessment template id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               assessmentTemplateName:
   *                 type: string
   *               assessmentTemplateDescription:
   *                 type: string
   *               dimensions:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     assessmentTemplateDimensionId:
   *                       type: number
   *                     assessmentTemplateDimensionName:
   *                       type: string
   *                     assessmentTemplateDimensionAcronym:
   *                       type: string
   *                     assessmentTemplateDimensionDataType:
   *                       type: string
   *                       enum: [numeric, percent, categorical_amb]
   *                       description: Tipo de dato de la dimensión
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '422':
   *         description: Tipo de dato inválido (key 'tipo-dato-invalido')
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const assessmentTemplateId = Number(request.param('assessmentTemplateId'))
      if (!assessmentTemplateId || Number.isNaN(assessmentTemplateId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new AssessmentTemplateService()
      const currentTemplate = await service.show(assessmentTemplateId)
      if (!currentTemplate) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('assessment_template') }),
          data: { assessmentTemplateId },
        }
      }
      const payload = await request.validateUsing(updateAssessmentTemplateValidator)
      const updatedTemplate = await service.update(
        currentTemplate,
        {
          assessmentTemplateName: payload.assessmentTemplateName,
          assessmentTemplateDescription: payload.assessmentTemplateDescription ?? null,
        },
        payload.dimensions
      )
      response.status(201)
      return {
        type: 'success',
        title: t('assessment_template'),
        message: t('resource_was_updated_successfully'),
        data: { assessmentTemplate: updatedTemplate },
      }
    } catch (error) {
      if (isInvalidDataTypeError(error)) {
        response.status(422)
        return buildInvalidDataTypeResponse(t)
      }
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
   * /api/assessment-templates/{assessmentTemplateId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: delete assessment template
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateId
   *         schema:
   *           type: number
   *         description: Assessment template id
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
      const assessmentTemplateId = Number(request.param('assessmentTemplateId'))
      if (!assessmentTemplateId || Number.isNaN(assessmentTemplateId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template') }),
          message: t('missing_data_to_process'),
          data: { assessmentTemplateId },
        }
      }
      const service = new AssessmentTemplateService()
      const currentTemplate = await service.show(assessmentTemplateId)
      if (!currentTemplate) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('assessment_template') }),
          data: { assessmentTemplateId },
        }
      }
      const deletedTemplate = await service.delete(currentTemplate)
      response.status(201)
      return {
        type: 'success',
        title: t('assessment_template'),
        message: t('resource_was_deleted_successfully'),
        data: { assessmentTemplate: deletedTemplate },
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
   * /api/assessment-templates/{assessmentTemplateId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Templates
   *     summary: get assessment template by id
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateId
   *         schema:
   *           type: number
   *         description: Assessment template id
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
      const assessmentTemplateId = Number(request.param('assessmentTemplateId'))
      if (!assessmentTemplateId || Number.isNaN(assessmentTemplateId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template') }),
          message: t('missing_data_to_process'),
          data: { assessmentTemplateId },
        }
      }
      const service = new AssessmentTemplateService()
      const assessmentTemplate = await service.show(assessmentTemplateId)
      if (!assessmentTemplate) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('assessment_template') }),
          data: { assessmentTemplateId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('assessment_template'),
        message: t('resource_was_found_successfully'),
        data: { assessmentTemplate },
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
