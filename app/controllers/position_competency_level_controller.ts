import { HttpContext } from '@adonisjs/core/http'
import PositionCompetencyLevelService from '#services/position_competency_level_service'
import {
  createPositionCompetencyLevelValidator,
  updatePositionCompetencyLevelValidator,
} from '#validators/position_competency_level'

export default class PositionCompetencyLevelController {
  /**
   * @swagger
   * /api/position-competency-levels:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Competency Levels
   *     summary: Asigna una competencia del catalogo a un puesto con un nivel deseado
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
   *               competencyId:
   *                 type: number
   *                 required: true
   *               competencyLevelId:
   *                 type: number
   *                 description: Identificador del nivel deseado (catalogo competency_levels)
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
      const payload = await request.validateUsing(createPositionCompetencyLevelValidator)
      const service = new PositionCompetencyLevelService()
      const existing = await service.findByPositionAndCompetency(
        payload.positionId,
        payload.competencyId
      )
      if (existing) {
        response.status(409)
        return {
          type: 'warning',
          title: t('position_competency_level'),
          message: t('resource_already_exists'),
          data: { positionCompetencyLevel: existing },
        }
      }
      const newLevel = await service.create({
        positionId: payload.positionId,
        competencyId: payload.competencyId,
        competencyLevelId: payload.competencyLevelId,
      })
      response.status(201)
      return {
        type: 'success',
        title: t('position_competency_level'),
        message: t('resource_was_created_successfully'),
        data: { positionCompetencyLevel: newLevel },
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
   * /api/position-competency-levels/{positionCompetencyLevelId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Competency Levels
   *     summary: Actualiza el nivel deseado de una asignacion puesto-competencia
   *     parameters:
   *       - in: path
   *         name: positionCompetencyLevelId
   *         schema:
   *           type: number
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               competencyLevelId:
   *                 type: number
   *                 description: Identificador del nivel deseado
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionCompetencyLevelId = Number(request.param('positionCompetencyLevelId'))
      if (!positionCompetencyLevelId || Number.isNaN(positionCompetencyLevelId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position_competency_level') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new PositionCompetencyLevelService()
      const current = await service.show(positionCompetencyLevelId)
      if (!current) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('position_competency_level') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('position_competency_level'),
          }),
          data: { positionCompetencyLevelId },
        }
      }
      const payload = await request.validateUsing(updatePositionCompetencyLevelValidator)
      const updated = await service.update(current, {
        competencyLevelId: payload.competencyLevelId,
      })
      response.status(201)
      return {
        type: 'success',
        title: t('position_competency_level'),
        message: t('resource_was_updated_successfully'),
        data: { positionCompetencyLevel: updated },
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
   * /api/position-competency-levels/{positionCompetencyLevelId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Competency Levels
   *     summary: Elimina (soft) la asignacion de competencia del puesto
   *     parameters:
   *       - in: path
   *         name: positionCompetencyLevelId
   *         schema:
   *           type: number
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
      const positionCompetencyLevelId = Number(request.param('positionCompetencyLevelId'))
      if (!positionCompetencyLevelId || Number.isNaN(positionCompetencyLevelId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position_competency_level') }),
          message: t('missing_data_to_process'),
          data: { positionCompetencyLevelId },
        }
      }
      const service = new PositionCompetencyLevelService()
      const current = await service.show(positionCompetencyLevelId)
      if (!current) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('position_competency_level') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('position_competency_level'),
          }),
          data: { positionCompetencyLevelId },
        }
      }
      const deleted = await service.delete(current)
      response.status(201)
      return {
        type: 'success',
        title: t('position_competency_level'),
        message: t('resource_was_deleted_successfully'),
        data: { positionCompetencyLevel: deleted },
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
   * /api/position-competency-levels/by-position/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Competency Levels
   *     summary: Lista las competencias asignadas a un puesto con su nivel deseado
   *     parameters:
   *       - in: path
   *         name: positionId
   *         schema:
   *           type: number
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async getByPosition({ request, response, i18n }: HttpContext) {
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
      const service = new PositionCompetencyLevelService()
      const levels = await service.getByPosition(positionId)
      response.status(200)
      return {
        type: 'success',
        title: t('position_competency_levels'),
        message: t('resources_were_found_successfully'),
        data: { positionCompetencyLevels: levels },
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
