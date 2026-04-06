import { HttpContext } from '@adonisjs/core/http'
import PositionPsychometricProfileService from '#services/position_psychometric_profile_service'
import PositionPsychometricProfile from '#models/position_psychometric_profile'
import {
  createPositionPsychometricProfileValidator,
  updatePositionPsychometricProfileValidator,
} from '#validators/position_psychometric_profile'

export default class PositionPsychometricProfileController {
  /**
   * @swagger
   * /api/position-psychometric-profiles:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Psychometric Profiles
   *     summary: get position psychometric profiles
   *     parameters:
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: Filter by position id
   *         schema:
   *           type: integer
   *       - name: psychometricTestDimensionId
   *         in: query
   *         required: false
   *         description: Filter by psychometric test dimension id
   *         schema:
   *           type: integer
   *       - name: psychometricTestId
   *         in: query
   *         required: false
   *         description: Filter by psychometric test id (via dimension relationship)
   *         schema:
   *           type: integer
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
      const positionId = request.input('positionId')
        ? Number(request.input('positionId'))
        : undefined
      const psychometricTestDimensionId = request.input('psychometricTestDimensionId')
        ? Number(request.input('psychometricTestDimensionId'))
        : undefined
      const psychometricTestId = request.input('psychometricTestId')
        ? Number(request.input('psychometricTestId'))
        : undefined
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const service = new PositionPsychometricProfileService()
      const positionPsychometricProfiles = await service.index({
        positionId,
        psychometricTestDimensionId,
        psychometricTestId,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('position_psychometric_profiles'),
        message: t('resources_were_found_successfully'),
        data: {
          positionPsychometricProfiles,
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
   * /api/position-psychometric-profiles:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Psychometric Profiles
   *     summary: create new position psychometric profile
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionId:
   *                 type: number
   *                 description: Position id
   *                 required: true
   *               psychometricTestDimensionId:
   *                 type: number
   *                 description: Psychometric test dimension id
   *                 required: true
   *               positionPsychometricProfileMinimumValue:
   *                 type: number
   *                 description: Minimum value
   *                 required: true
   *               positionPsychometricProfileMaximumValue:
   *                 type: number
   *                 description: Maximum value
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
      await request.validateUsing(createPositionPsychometricProfileValidator)
      const profile = {
        positionId: request.input('positionId'),
        psychometricTestDimensionId: request.input('psychometricTestDimensionId'),
        positionPsychometricProfileMinimumValue: request.input(
          'positionPsychometricProfileMinimumValue'
        ),
        positionPsychometricProfileMaximumValue: request.input(
          'positionPsychometricProfileMaximumValue'
        ),
      } as PositionPsychometricProfile
      const service = new PositionPsychometricProfileService()
      const newProfile = await service.create(profile)
      response.status(201)
      return {
        type: 'success',
        title: t('position_psychometric_profile'),
        message: t('resource_was_created_successfully'),
        data: { positionPsychometricProfile: newProfile },
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
   * /api/position-psychometric-profiles/{positionPsychometricProfileId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Psychometric Profiles
   *     summary: update position psychometric profile
   *     parameters:
   *       - in: path
   *         name: positionPsychometricProfileId
   *         schema:
   *           type: number
   *         description: Position psychometric profile id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionPsychometricProfileMinimumValue:
   *                 type: number
   *               positionPsychometricProfileMaximumValue:
   *                 type: number
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionPsychometricProfileId = Number(
        request.param('positionPsychometricProfileId')
      )
      if (!positionPsychometricProfileId || Number.isNaN(positionPsychometricProfileId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position_psychometric_profile') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new PositionPsychometricProfileService()
      const currentProfile = await service.show(positionPsychometricProfileId)
      if (!currentProfile) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('position_psychometric_profile') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('position_psychometric_profile'),
          }),
          data: { positionPsychometricProfileId },
        }
      }
      await request.validateUsing(updatePositionPsychometricProfileValidator)
      const profile = {
        positionPsychometricProfileMinimumValue: request.input(
          'positionPsychometricProfileMinimumValue'
        ),
        positionPsychometricProfileMaximumValue: request.input(
          'positionPsychometricProfileMaximumValue'
        ),
      } as PositionPsychometricProfile
      const updatedProfile = await service.update(currentProfile, profile)
      response.status(201)
      return {
        type: 'success',
        title: t('position_psychometric_profile'),
        message: t('resource_was_updated_successfully'),
        data: { positionPsychometricProfile: updatedProfile },
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
   * /api/position-psychometric-profiles/{positionPsychometricProfileId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Psychometric Profiles
   *     summary: delete position psychometric profile
   *     parameters:
   *       - in: path
   *         name: positionPsychometricProfileId
   *         schema:
   *           type: number
   *         description: Position psychometric profile id
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
      const positionPsychometricProfileId = Number(
        request.param('positionPsychometricProfileId')
      )
      if (!positionPsychometricProfileId || Number.isNaN(positionPsychometricProfileId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position_psychometric_profile') }),
          message: t('missing_data_to_process'),
          data: { positionPsychometricProfileId },
        }
      }
      const service = new PositionPsychometricProfileService()
      const currentProfile = await service.show(positionPsychometricProfileId)
      if (!currentProfile) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('position_psychometric_profile') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('position_psychometric_profile'),
          }),
          data: { positionPsychometricProfileId },
        }
      }
      const deletedProfile = await service.delete(currentProfile)
      response.status(201)
      return {
        type: 'success',
        title: t('position_psychometric_profile'),
        message: t('resource_was_deleted_successfully'),
        data: { positionPsychometricProfile: deletedProfile },
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
   * /api/position-psychometric-profiles/{positionPsychometricProfileId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Psychometric Profiles
   *     summary: get position psychometric profile by id
   *     parameters:
   *       - in: path
   *         name: positionPsychometricProfileId
   *         schema:
   *           type: number
   *         description: Position psychometric profile id
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
      const positionPsychometricProfileId = Number(
        request.param('positionPsychometricProfileId')
      )
      if (!positionPsychometricProfileId || Number.isNaN(positionPsychometricProfileId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position_psychometric_profile') }),
          message: t('missing_data_to_process'),
          data: { positionPsychometricProfileId },
        }
      }
      const service = new PositionPsychometricProfileService()
      const positionPsychometricProfile = await service.show(positionPsychometricProfileId)
      if (!positionPsychometricProfile) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('position_psychometric_profile') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('position_psychometric_profile'),
          }),
          data: { positionPsychometricProfileId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('position_psychometric_profile'),
        message: t('resource_was_found_successfully'),
        data: { positionPsychometricProfile },
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
