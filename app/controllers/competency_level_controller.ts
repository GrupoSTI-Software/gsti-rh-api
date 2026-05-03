import { HttpContext } from '@adonisjs/core/http'
import CompetencyLevelService from '#services/competency_level_service'

export default class CompetencyLevelController {
  /**
   * @swagger
   * /api/competency-levels:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Levels
   *     summary: Obtiene el catalogo fijo de niveles de competencia
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async index({ response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const service = new CompetencyLevelService()
      const competencyLevels = await service.index()
      response.status(200)
      return {
        type: 'success',
        title: t('competency_levels'),
        message: t('resources_were_found_successfully'),
        data: { competencyLevels },
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
   * /api/competency-levels/{competencyLevelId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Levels
   *     summary: Obtiene un nivel de competencia por id
   *     parameters:
   *       - in: path
   *         name: competencyLevelId
   *         schema:
   *           type: number
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
      const competencyLevelId = Number(request.param('competencyLevelId'))
      if (!competencyLevelId || Number.isNaN(competencyLevelId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('competency_level') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new CompetencyLevelService()
      const competencyLevel = await service.show(competencyLevelId)
      if (!competencyLevel) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('competency_level') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('competency_level') }),
          data: { competencyLevelId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('competency_level'),
        message: t('resource_was_found_successfully'),
        data: { competencyLevel },
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
