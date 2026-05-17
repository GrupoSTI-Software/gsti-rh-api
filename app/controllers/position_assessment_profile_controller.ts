import { HttpContext } from '@adonisjs/core/http'
import PositionAssessmentProfileService from '#services/position_assessment_profile_service'
import PositionAssessmentProfile, {
  type AssessmentCategoricalValue,
} from '#models/position_assessment_profile'
import AssessmentTemplateDimension from '#models/assessment_template_dimension'
import {
  createPositionAssessmentProfileValidator,
  updatePositionAssessmentProfileValidator,
} from '#validators/position_assessment_profile'
import { checkPositionProfileCoherence } from '#services/assessment_data_type_coherence'

/**
 * Construye una respuesta 422 con la clave estable `rango-no-coherente-con-tipo`
 * (CAP-02-08-04). El `reason` exacto del verificador se devuelve como `detail`
 * a través de la traducción correspondiente, manteniendo el contrato simple
 * para el frontend.
 */
function buildIncoherentRangeResponse(
  t: (key: string, args?: Record<string, unknown>) => string,
  reason: string
) {
  return {
    type: 'error',
    title: t('position_assessment_profile'),
    detail: t(`position_assessment_profile_coherence_${reason.replaceAll('-', '_')}`),
    key: 'rango-no-coherente-con-tipo',
  }
}

export default class PositionAssessmentProfileController {
  /**
   * @swagger
   * /api/position-assessment-profiles:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Assessment Profiles
   *     summary: get position assessment profiles
   *     parameters:
   *       - name: positionId
   *         in: query
   *         required: false
   *         description: Filter by position id
   *         schema:
   *           type: integer
   *       - name: assessmentTemplateDimensionId
   *         in: query
   *         required: false
   *         description: Filter by assessment template dimension id
   *         schema:
   *           type: integer
   *       - name: assessmentTemplateId
   *         in: query
   *         required: false
   *         description: Filter by assessment template id (via dimension relationship)
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
      const assessmentTemplateDimensionId = request.input('assessmentTemplateDimensionId')
        ? Number(request.input('assessmentTemplateDimensionId'))
        : undefined
      const assessmentTemplateId = request.input('assessmentTemplateId')
        ? Number(request.input('assessmentTemplateId'))
        : undefined
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const service = new PositionAssessmentProfileService()
      const positionAssessmentProfiles = await service.index({
        positionId,
        assessmentTemplateDimensionId,
        assessmentTemplateId,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('position_assessment_profiles'),
        message: t('resources_were_found_successfully'),
        data: {
          positionAssessmentProfiles,
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
   * /api/position-assessment-profiles:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Assessment Profiles
   *     summary: create new position assessment profile
   *     description: |
   *       Crea un perfil cuyo contenido depende del `dataType` de la dimensión:
   *       - `numeric` y `percent`: requieren `minimumValue` y `maximumValue`.
   *       - `categorical_amb`: requiere `expectedValue` (high|medium|low).
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
   *                 required: true
   *               assessmentTemplateDimensionId:
   *                 type: number
   *                 required: true
   *               positionAssessmentProfileMinimumValue:
   *                 type: number
   *                 nullable: true
   *               positionAssessmentProfileMaximumValue:
   *                 type: number
   *                 nullable: true
   *               positionAssessmentProfileExpectedValue:
   *                 type: string
   *                 enum: [high, medium, low]
   *                 nullable: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '422':
   *         description: Rango/valor incoherente con el dataType (key 'rango-no-coherente-con-tipo')
   *       default:
   *         description: Unexpected error
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      await request.validateUsing(createPositionAssessmentProfileValidator)

      const dimensionId = Number(request.input('assessmentTemplateDimensionId'))
      const dimension = await AssessmentTemplateDimension.query()
        .whereNull('assessment_template_dimension_deleted_at')
        .where('assessment_template_dimension_id', dimensionId)
        .first()
      if (!dimension) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('assessment_template_dimension') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('assessment_template_dimension'),
          }),
          data: { assessmentTemplateDimensionId: dimensionId },
        }
      }

      const minimumValue = request.input('positionAssessmentProfileMinimumValue', null)
      const maximumValue = request.input('positionAssessmentProfileMaximumValue', null)
      const expectedValue = request.input(
        'positionAssessmentProfileExpectedValue',
        null
      ) as AssessmentCategoricalValue | null

      const coherence = checkPositionProfileCoherence(
        dimension.assessmentTemplateDimensionDataType,
        { minimumValue, maximumValue, expectedValue }
      )
      if (!coherence.ok) {
        response.status(422)
        return buildIncoherentRangeResponse(t, coherence.reason!)
      }

      const profile = {
        positionId: request.input('positionId'),
        assessmentTemplateDimensionId: dimensionId,
        positionAssessmentProfileMinimumValue: minimumValue,
        positionAssessmentProfileMaximumValue: maximumValue,
        positionAssessmentProfileExpectedValue: expectedValue,
      } as PositionAssessmentProfile
      const service = new PositionAssessmentProfileService()
      const newProfile = await service.create(profile)
      response.status(201)
      return {
        type: 'success',
        title: t('position_assessment_profile'),
        message: t('resource_was_created_successfully'),
        data: { positionAssessmentProfile: newProfile },
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
   * /api/position-assessment-profiles/{positionAssessmentProfileId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Assessment Profiles
   *     summary: update position assessment profile
   *     parameters:
   *       - in: path
   *         name: positionAssessmentProfileId
   *         schema:
   *           type: number
   *         description: Position assessment profile id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               positionAssessmentProfileMinimumValue:
   *                 type: number
   *                 nullable: true
   *               positionAssessmentProfileMaximumValue:
   *                 type: number
   *                 nullable: true
   *               positionAssessmentProfileExpectedValue:
   *                 type: string
   *                 enum: [high, medium, low]
   *                 nullable: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '422':
   *         description: Rango/valor incoherente con el dataType (key 'rango-no-coherente-con-tipo')
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionAssessmentProfileId = Number(request.param('positionAssessmentProfileId'))
      if (!positionAssessmentProfileId || Number.isNaN(positionAssessmentProfileId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position_assessment_profile') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new PositionAssessmentProfileService()
      const currentProfile = await service.show(positionAssessmentProfileId)
      if (!currentProfile) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('position_assessment_profile') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('position_assessment_profile'),
          }),
          data: { positionAssessmentProfileId },
        }
      }
      await request.validateUsing(updatePositionAssessmentProfileValidator)

      const minimumValue = request.input('positionAssessmentProfileMinimumValue', null)
      const maximumValue = request.input('positionAssessmentProfileMaximumValue', null)
      const expectedValue = request.input(
        'positionAssessmentProfileExpectedValue',
        null
      ) as AssessmentCategoricalValue | null

      const dataType =
        currentProfile.assessmentTemplateDimension?.assessmentTemplateDimensionDataType ?? 'numeric'
      const coherence = checkPositionProfileCoherence(dataType, {
        minimumValue,
        maximumValue,
        expectedValue,
      })
      if (!coherence.ok) {
        response.status(422)
        return buildIncoherentRangeResponse(t, coherence.reason!)
      }

      const profile = {
        positionAssessmentProfileMinimumValue: minimumValue,
        positionAssessmentProfileMaximumValue: maximumValue,
        positionAssessmentProfileExpectedValue: expectedValue,
      } as PositionAssessmentProfile
      const updatedProfile = await service.update(currentProfile, profile)
      response.status(201)
      return {
        type: 'success',
        title: t('position_assessment_profile'),
        message: t('resource_was_updated_successfully'),
        data: { positionAssessmentProfile: updatedProfile },
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
   * /api/position-assessment-profiles/{positionAssessmentProfileId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Assessment Profiles
   *     summary: delete position assessment profile
   *     parameters:
   *       - in: path
   *         name: positionAssessmentProfileId
   *         schema:
   *           type: number
   *         description: Position assessment profile id
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
      const positionAssessmentProfileId = Number(request.param('positionAssessmentProfileId'))
      if (!positionAssessmentProfileId || Number.isNaN(positionAssessmentProfileId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position_assessment_profile') }),
          message: t('missing_data_to_process'),
          data: { positionAssessmentProfileId },
        }
      }
      const service = new PositionAssessmentProfileService()
      const currentProfile = await service.show(positionAssessmentProfileId)
      if (!currentProfile) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('position_assessment_profile') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('position_assessment_profile'),
          }),
          data: { positionAssessmentProfileId },
        }
      }
      const deletedProfile = await service.delete(currentProfile)
      response.status(201)
      return {
        type: 'success',
        title: t('position_assessment_profile'),
        message: t('resource_was_deleted_successfully'),
        data: { positionAssessmentProfile: deletedProfile },
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
   * /api/position-assessment-profiles/{positionAssessmentProfileId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Assessment Profiles
   *     summary: get position assessment profile by id
   *     parameters:
   *       - in: path
   *         name: positionAssessmentProfileId
   *         schema:
   *           type: number
   *         description: Position assessment profile id
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
      const positionAssessmentProfileId = Number(request.param('positionAssessmentProfileId'))
      if (!positionAssessmentProfileId || Number.isNaN(positionAssessmentProfileId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position_assessment_profile') }),
          message: t('missing_data_to_process'),
          data: { positionAssessmentProfileId },
        }
      }
      const service = new PositionAssessmentProfileService()
      const positionAssessmentProfile = await service.show(positionAssessmentProfileId)
      if (!positionAssessmentProfile) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('position_assessment_profile') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('position_assessment_profile'),
          }),
          data: { positionAssessmentProfileId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('position_assessment_profile'),
        message: t('resource_was_found_successfully'),
        data: { positionAssessmentProfile },
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
