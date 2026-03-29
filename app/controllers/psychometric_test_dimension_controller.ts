import { HttpContext } from '@adonisjs/core/http'
import PsychometricTestDimensionService from '#services/psychometric_test_dimension_service'
import PsychometricTestDimension from '#models/psychometric_test_dimension'
import {
  createPsychometricTestDimensionValidator,
  updatePsychometricTestDimensionValidator,
} from '#validators/psychometric_test_dimension'

export default class PsychometricTestDimensionController {
  /**
   * @swagger
   * /api/psychometric-test-dimensions:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Psychometric Test Dimensions
   *     summary: get dimensions by psychometric test
   *     parameters:
   *       - name: psychometricTestId
   *         in: query
   *         required: true
   *         description: Psychometric test id
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
      const psychometricTestId = Number(request.input('psychometricTestId'))
      if (!psychometricTestId || Number.isNaN(psychometricTestId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('psychometric_test_dimension'),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const search = request.input('search')
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const service = new PsychometricTestDimensionService()
      const psychometricTestDimensions = await service.index({
        psychometricTestId,
        search,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('psychometric_test_dimensions'),
        message: t('resources_were_found_successfully'),
        data: {
          psychometricTestDimensions,
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
   * /api/psychometric-test-dimensions:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Psychometric Test Dimensions
   *     summary: create new psychometric test dimension
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               psychometricTestId:
   *                 type: number
   *                 description: Psychometric test id
   *                 required: true
   *               psychometricTestDimensionName:
   *                 type: string
   *                 description: Dimension name
   *                 required: true
   *               psychometricTestDimensionAcronym:
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
      await request.validateUsing(createPsychometricTestDimensionValidator)
      const dimension = {
        psychometricTestId: request.input('psychometricTestId'),
        psychometricTestDimensionName: request.input('psychometricTestDimensionName'),
        psychometricTestDimensionAcronym: request.input('psychometricTestDimensionAcronym'),
      } as PsychometricTestDimension
      const service = new PsychometricTestDimensionService()
      const newDimension = await service.create(dimension)
      response.status(201)
      return {
        type: 'success',
        title: t('psychometric_test_dimension'),
        message: t('resource_was_created_successfully'),
        data: { psychometricTestDimension: newDimension },
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
   * /api/psychometric-test-dimensions/{psychometricTestDimensionId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Psychometric Test Dimensions
   *     summary: update psychometric test dimension
   *     parameters:
   *       - in: path
   *         name: psychometricTestDimensionId
   *         schema:
   *           type: number
   *         description: Psychometric test dimension id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               psychometricTestDimensionName:
   *                 type: string
   *               psychometricTestDimensionAcronym:
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
      const psychometricTestDimensionId = Number(
        request.param('psychometricTestDimensionId')
      )
      if (!psychometricTestDimensionId || Number.isNaN(psychometricTestDimensionId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('psychometric_test_dimension') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new PsychometricTestDimensionService()
      const currentDimension = await service.show(psychometricTestDimensionId)
      if (!currentDimension) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('psychometric_test_dimension') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('psychometric_test_dimension'),
          }),
          data: { psychometricTestDimensionId },
        }
      }
      await request.validateUsing(updatePsychometricTestDimensionValidator)
      const dimension = {
        psychometricTestDimensionName: request.input('psychometricTestDimensionName'),
        psychometricTestDimensionAcronym: request.input('psychometricTestDimensionAcronym'),
      } as PsychometricTestDimension
      const updatedDimension = await service.update(currentDimension, dimension)
      response.status(201)
      return {
        type: 'success',
        title: t('psychometric_test_dimension'),
        message: t('resource_was_updated_successfully'),
        data: { psychometricTestDimension: updatedDimension },
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
   * /api/psychometric-test-dimensions/{psychometricTestDimensionId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Psychometric Test Dimensions
   *     summary: delete psychometric test dimension
   *     parameters:
   *       - in: path
   *         name: psychometricTestDimensionId
   *         schema:
   *           type: number
   *         description: Psychometric test dimension id
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
      const psychometricTestDimensionId = Number(
        request.param('psychometricTestDimensionId')
      )
      if (!psychometricTestDimensionId || Number.isNaN(psychometricTestDimensionId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('psychometric_test_dimension') }),
          message: t('missing_data_to_process'),
          data: { psychometricTestDimensionId },
        }
      }
      const service = new PsychometricTestDimensionService()
      const currentDimension = await service.show(psychometricTestDimensionId)
      if (!currentDimension) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('psychometric_test_dimension') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('psychometric_test_dimension'),
          }),
          data: { psychometricTestDimensionId },
        }
      }
      const deletedDimension = await service.delete(currentDimension)
      response.status(201)
      return {
        type: 'success',
        title: t('psychometric_test_dimension'),
        message: t('resource_was_deleted_successfully'),
        data: { psychometricTestDimension: deletedDimension },
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
   * /api/psychometric-test-dimensions/{psychometricTestDimensionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Psychometric Test Dimensions
   *     summary: get psychometric test dimension by id
   *     parameters:
   *       - in: path
   *         name: psychometricTestDimensionId
   *         schema:
   *           type: number
   *         description: Psychometric test dimension id
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
      const psychometricTestDimensionId = Number(
        request.param('psychometricTestDimensionId')
      )
      if (!psychometricTestDimensionId || Number.isNaN(psychometricTestDimensionId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('psychometric_test_dimension') }),
          message: t('missing_data_to_process'),
          data: { psychometricTestDimensionId },
        }
      }
      const service = new PsychometricTestDimensionService()
      const psychometricTestDimension = await service.show(psychometricTestDimensionId)
      if (!psychometricTestDimension) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('psychometric_test_dimension') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('psychometric_test_dimension'),
          }),
          data: { psychometricTestDimensionId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('psychometric_test_dimension'),
        message: t('resource_was_found_successfully'),
        data: { psychometricTestDimension },
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
