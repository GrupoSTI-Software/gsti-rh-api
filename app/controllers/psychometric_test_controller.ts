import { HttpContext } from '@adonisjs/core/http'
import PsychometricTestService from '#services/psychometric_test_service'
import {
  createPsychometricTestValidator,
  updatePsychometricTestValidator,
} from '#validators/psychometric_test'

export default class PsychometricTestController {
  /**
   * @swagger
   * /api/psychometric-tests:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Psychometric Tests
   *     summary: get psychometric tests
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search term for psychometric test name
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
      const service = new PsychometricTestService()
      const psychometricTests = await service.index({
        search,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('psychometric_tests'),
        message: t('resources_were_found_successfully'),
        data: {
          psychometricTests,
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
   * /api/psychometric-tests:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Psychometric Tests
   *     summary: create new psychometric test
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               psychometricTestName:
   *                 type: string
   *                 description: Test name
   *                 required: true
   *                 default: ''
   *               psychometricTestDescription:
   *                 type: string
   *                 description: Test description
   *                 default: ''
   *               dimensions:
   *                 type: array
   *                 description: Test dimensions
   *                 items:
   *                   type: object
   *                   properties:
   *                     psychometricTestDimensionName:
   *                       type: string
   *                     psychometricTestDimensionAcronym:
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
      const payload = await request.validateUsing(createPsychometricTestValidator)
      const service = new PsychometricTestService()
      const newTest = await service.create(
        {
          psychometricTestName: payload.psychometricTestName,
          psychometricTestDescription: payload.psychometricTestDescription ?? null,
        },
        payload.dimensions
      )
      response.status(201)
      return {
        type: 'success',
        title: t('psychometric_test'),
        message: t('resource_was_created_successfully'),
        data: { psychometricTest: newTest },
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
   * /api/psychometric-tests/{psychometricTestId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Psychometric Tests
   *     summary: update psychometric test
   *     parameters:
   *       - in: path
   *         name: psychometricTestId
   *         schema:
   *           type: number
   *         description: Psychometric test id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               psychometricTestName:
   *                 type: string
   *               psychometricTestDescription:
   *                 type: string
   *               dimensions:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     psychometricTestDimensionId:
   *                       type: number
   *                     psychometricTestDimensionName:
   *                       type: string
   *                     psychometricTestDimensionAcronym:
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
      const psychometricTestId = Number(request.param('psychometricTestId'))
      if (!psychometricTestId || Number.isNaN(psychometricTestId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('psychometric_test') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new PsychometricTestService()
      const currentTest = await service.show(psychometricTestId)
      if (!currentTest) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('psychometric_test') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('psychometric_test') }),
          data: { psychometricTestId },
        }
      }
      const payload = await request.validateUsing(updatePsychometricTestValidator)
      const updatedTest = await service.update(
        currentTest,
        {
          psychometricTestName: payload.psychometricTestName,
          psychometricTestDescription: payload.psychometricTestDescription ?? null,
        },
        payload.dimensions
      )
      response.status(201)
      return {
        type: 'success',
        title: t('psychometric_test'),
        message: t('resource_was_updated_successfully'),
        data: { psychometricTest: updatedTest },
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
   * /api/psychometric-tests/{psychometricTestId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Psychometric Tests
   *     summary: delete psychometric test
   *     parameters:
   *       - in: path
   *         name: psychometricTestId
   *         schema:
   *           type: number
   *         description: Psychometric test id
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
      const psychometricTestId = Number(request.param('psychometricTestId'))
      if (!psychometricTestId || Number.isNaN(psychometricTestId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('psychometric_test') }),
          message: t('missing_data_to_process'),
          data: { psychometricTestId },
        }
      }
      const service = new PsychometricTestService()
      const currentTest = await service.show(psychometricTestId)
      if (!currentTest) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('psychometric_test') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('psychometric_test') }),
          data: { psychometricTestId },
        }
      }
      const deletedTest = await service.delete(currentTest)
      response.status(201)
      return {
        type: 'success',
        title: t('psychometric_test'),
        message: t('resource_was_deleted_successfully'),
        data: { psychometricTest: deletedTest },
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
   * /api/psychometric-tests/{psychometricTestId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Psychometric Tests
   *     summary: get psychometric test by id
   *     parameters:
   *       - in: path
   *         name: psychometricTestId
   *         schema:
   *           type: number
   *         description: Psychometric test id
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
      const psychometricTestId = Number(request.param('psychometricTestId'))
      if (!psychometricTestId || Number.isNaN(psychometricTestId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('psychometric_test') }),
          message: t('missing_data_to_process'),
          data: { psychometricTestId },
        }
      }
      const service = new PsychometricTestService()
      const psychometricTest = await service.show(psychometricTestId)
      if (!psychometricTest) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('psychometric_test') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('psychometric_test') }),
          data: { psychometricTestId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('psychometric_test'),
        message: t('resource_was_found_successfully'),
        data: { psychometricTest },
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
