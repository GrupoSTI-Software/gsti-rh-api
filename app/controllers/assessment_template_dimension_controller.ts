import { HttpContext } from '@adonisjs/core/http'
import AssessmentTemplateDimensionService from '#services/assessment_template_dimension_service'
import AssessmentTemplateDimension from '#models/assessment_template_dimension'
import {
  createAssessmentTemplateDimensionValidator,
  updateAssessmentTemplateDimensionValidator,
} from '#validators/assessment_template_dimension'

export default class AssessmentTemplateDimensionController {
  /**
   * @swagger
   * /api/assessment-template-dimensions:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Template Dimensions
   *     summary: get dimensions by assessment template
   *     parameters:
   *       - name: assessmentTemplateId
   *         in: query
   *         required: true
   *         description: Assessment template id
   *         schema:
   *           type: integer
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search term for dimension name
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
      const assessmentTemplateId = Number(request.input('assessmentTemplateId'))
      if (!assessmentTemplateId || Number.isNaN(assessmentTemplateId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('assessment_template_dimension'),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const search = request.input('search')
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const service = new AssessmentTemplateDimensionService()
      const assessmentTemplateDimensions = await service.index({
        assessmentTemplateId,
        search,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('assessment_template_dimensions'),
        message: t('resources_were_found_successfully'),
        data: {
          assessmentTemplateDimensions,
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
   * /api/assessment-template-dimensions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Template Dimensions
   *     summary: create new assessment template dimension
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               assessmentTemplateId:
   *                 type: number
   *                 description: Assessment template id
   *                 required: true
   *               assessmentTemplateDimensionName:
   *                 type: string
   *                 description: Dimension name
   *                 required: true
   *               assessmentTemplateDimensionAcronym:
   *                 type: string
   *                 description: Dimension acronym
   *                 required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      await request.validateUsing(createAssessmentTemplateDimensionValidator)
      const dimension = {
        assessmentTemplateId: request.input('assessmentTemplateId'),
        assessmentTemplateDimensionName: request.input('assessmentTemplateDimensionName'),
        assessmentTemplateDimensionAcronym: request.input('assessmentTemplateDimensionAcronym'),
      } as AssessmentTemplateDimension
      const service = new AssessmentTemplateDimensionService()
      const newDimension = await service.create(dimension)
      response.status(201)
      return {
        type: 'success',
        title: t('assessment_template_dimension'),
        message: t('resource_was_created_successfully'),
        data: { assessmentTemplateDimension: newDimension },
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
   * /api/assessment-template-dimensions/{assessmentTemplateDimensionId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Template Dimensions
   *     summary: update assessment template dimension
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateDimensionId
   *         schema:
   *           type: number
   *         description: Assessment template dimension id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               assessmentTemplateDimensionName:
   *                 type: string
   *               assessmentTemplateDimensionAcronym:
   *                 type: string
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const assessmentTemplateDimensionId = Number(
        request.param('assessmentTemplateDimensionId')
      )
      if (!assessmentTemplateDimensionId || Number.isNaN(assessmentTemplateDimensionId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template_dimension') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new AssessmentTemplateDimensionService()
      const currentDimension = await service.show(assessmentTemplateDimensionId)
      if (!currentDimension) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template_dimension') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('assessment_template_dimension'),
          }),
          data: { assessmentTemplateDimensionId },
        }
      }
      await request.validateUsing(updateAssessmentTemplateDimensionValidator)
      const dimension = {
        assessmentTemplateDimensionName: request.input('assessmentTemplateDimensionName'),
        assessmentTemplateDimensionAcronym: request.input('assessmentTemplateDimensionAcronym'),
      } as AssessmentTemplateDimension
      const updatedDimension = await service.update(currentDimension, dimension)
      response.status(201)
      return {
        type: 'success',
        title: t('assessment_template_dimension'),
        message: t('resource_was_updated_successfully'),
        data: { assessmentTemplateDimension: updatedDimension },
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
   * /api/assessment-template-dimensions/{assessmentTemplateDimensionId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Template Dimensions
   *     summary: delete assessment template dimension
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateDimensionId
   *         schema:
   *           type: number
   *         description: Assessment template dimension id
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
      const assessmentTemplateDimensionId = Number(
        request.param('assessmentTemplateDimensionId')
      )
      if (!assessmentTemplateDimensionId || Number.isNaN(assessmentTemplateDimensionId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template_dimension') }),
          message: t('missing_data_to_process'),
          data: { assessmentTemplateDimensionId },
        }
      }
      const service = new AssessmentTemplateDimensionService()
      const currentDimension = await service.show(assessmentTemplateDimensionId)
      if (!currentDimension) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template_dimension') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('assessment_template_dimension'),
          }),
          data: { assessmentTemplateDimensionId },
        }
      }
      const deletedDimension = await service.delete(currentDimension)
      response.status(201)
      return {
        type: 'success',
        title: t('assessment_template_dimension'),
        message: t('resource_was_deleted_successfully'),
        data: { assessmentTemplateDimension: deletedDimension },
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
   * /api/assessment-template-dimensions/{assessmentTemplateDimensionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assessment Template Dimensions
   *     summary: get assessment template dimension by id
   *     parameters:
   *       - in: path
   *         name: assessmentTemplateDimensionId
   *         schema:
   *           type: number
   *         description: Assessment template dimension id
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
      const assessmentTemplateDimensionId = Number(
        request.param('assessmentTemplateDimensionId')
      )
      if (!assessmentTemplateDimensionId || Number.isNaN(assessmentTemplateDimensionId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('assessment_template_dimension') }),
          message: t('missing_data_to_process'),
          data: { assessmentTemplateDimensionId },
        }
      }
      const service = new AssessmentTemplateDimensionService()
      const assessmentTemplateDimension = await service.show(assessmentTemplateDimensionId)
      if (!assessmentTemplateDimension) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template_dimension') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('assessment_template_dimension'),
          }),
          data: { assessmentTemplateDimensionId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('assessment_template_dimension'),
        message: t('resource_was_found_successfully'),
        data: { assessmentTemplateDimension },
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
