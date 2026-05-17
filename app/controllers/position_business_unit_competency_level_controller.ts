import { HttpContext } from '@adonisjs/core/http'
import PositionBusinessUnitCompetencyLevelService from '#services/position_business_unit_competency_level_service'
import {
  createPositionBusinessUnitCompetencyLevelValidator,
  updatePositionBusinessUnitCompetencyLevelValidator,
} from '#validators/position_business_unit_competency_level'

export default class PositionBusinessUnitCompetencyLevelController {
  /**
   * @swagger
   * /api/position-business-unit-competency-levels:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Business Unit Competency Levels
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
   *               businessUnitCompetencyLevelId:
   *                 type: number
   *                 description: Identificador del nivel deseado (catalogo business_unit_competency_levels)
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
      const payload = await request.validateUsing(createPositionBusinessUnitCompetencyLevelValidator)
      const service = new PositionBusinessUnitCompetencyLevelService()
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
          data: { positionBusinessUnitCompetencyLevel: existing },
        }
      }
      const newLevel = await service.create({
        positionId: payload.positionId,
        competencyId: payload.competencyId,
        businessUnitCompetencyLevelId: payload.businessUnitCompetencyLevelId,
      })
      response.status(201)
      return {
        type: 'success',
        title: t('position_competency_level'),
        message: t('resource_was_created_successfully'),
        data: { positionBusinessUnitCompetencyLevel: newLevel },
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
   * /api/position-business-unit-competency-levels/{positionBusinessUnitCompetencyLevelId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Business Unit Competency Levels
   *     summary: Actualiza el nivel deseado de una asignacion puesto-competencia
   *     parameters:
   *       - in: path
   *         name: positionBusinessUnitCompetencyLevelId
   *         schema:
   *           type: number
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               businessUnitCompetencyLevelId:
   *                 type: number
   *                 description: Identificador del nivel deseado (catalogo business_unit_competency_levels)
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const positionBusinessUnitCompetencyLevelId = Number(request.param('positionBusinessUnitCompetencyLevelId'))
      if (!positionBusinessUnitCompetencyLevelId || Number.isNaN(positionBusinessUnitCompetencyLevelId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position_competency_level') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new PositionBusinessUnitCompetencyLevelService()
      const current = await service.show(positionBusinessUnitCompetencyLevelId)
      if (!current) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('position_competency_level') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('position_competency_level'),
          }),
          data: { positionBusinessUnitCompetencyLevelId },
        }
      }
      const payload = await request.validateUsing(updatePositionBusinessUnitCompetencyLevelValidator)
      const updated = await service.update(current, {
        businessUnitCompetencyLevelId: payload.businessUnitCompetencyLevelId,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('position_competency_level'),
        message: t('resource_was_updated_successfully'),
        data: { positionBusinessUnitCompetencyLevel: updated },
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
   * /api/position-business-unit-competency-levels/{positionBusinessUnitCompetencyLevelId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Business Unit Competency Levels
   *     summary: Elimina (soft) la asignacion de competencia del puesto
   *     parameters:
   *       - in: path
   *         name: positionBusinessUnitCompetencyLevelId
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
      const positionBusinessUnitCompetencyLevelId = Number(request.param('positionBusinessUnitCompetencyLevelId'))
      if (!positionBusinessUnitCompetencyLevelId || Number.isNaN(positionBusinessUnitCompetencyLevelId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('position_competency_level') }),
          message: t('missing_data_to_process'),
          data: { positionBusinessUnitCompetencyLevelId },
        }
      }
      const service = new PositionBusinessUnitCompetencyLevelService()
      const current = await service.show(positionBusinessUnitCompetencyLevelId)
      if (!current) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('position_competency_level') }),
          message: t('entity_was_not_found_with_entered_id', {
            entity: t('position_competency_level'),
          }),
          data: { positionBusinessUnitCompetencyLevelId },
        }
      }
      const deleted = await service.delete(current)
      response.status(201)
      return {
        type: 'success',
        title: t('position_competency_level'),
        message: t('resource_was_deleted_successfully'),
        data: { positionBusinessUnitCompetencyLevel: deleted },
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
   * /api/position-business-unit-competency-levels/by-position/{positionId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Position Business Unit Competency Levels
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
      const service = new PositionBusinessUnitCompetencyLevelService()
      const levels = await service.getByPosition(positionId)
      response.status(200)
      return {
        type: 'success',
        title: t('position_competency_levels'),
        message: t('resources_were_found_successfully'),
        data: { positionBusinessUnitCompetencyLevels: levels },
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
