import { HttpContext } from '@adonisjs/core/http'
import CompetencyService from '#services/competency_service'
import {
  createCompetencyValidator,
  updateCompetencyValidator,
} from '#validators/competency'

export default class CompetencyController {
  /**
   * @swagger
   * /api/competencies:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competencies
   *     summary: get competencies catalog
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search term for competency name
   *         schema:
   *           type: string
   *       - name: competencyType
   *         in: query
   *         required: false
   *         description: Filter by competency type (technical or transversal)
   *         schema:
   *           type: string
   *           enum: [technical, transversal]
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
      const rawType = request.input('competencyType')
      const competencyType =
        rawType === 'technical' || rawType === 'transversal' ? rawType : undefined
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const service = new CompetencyService()
      const competencies = await service.index({
        search,
        competencyType,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('competencies'),
        message: t('resources_were_found_successfully'),
        data: {
          competencies,
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
   * /api/competencies:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competencies
   *     summary: create new competency
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               competencyName:
   *                 type: string
   *                 description: Competency name
   *                 required: true
   *                 default: ''
   *               competencyType:
   *                 type: string
   *                 description: Competency type
   *                 enum: [technical, transversal]
   *                 required: true
   *                 default: 'technical'
   *               levelDescriptions:
   *                 type: array
   *                 description: Descripciones por nivel para la competencia
   *                 items:
   *                   type: object
   *                   properties:
   *                     competencyLevelId:
   *                       type: number
   *                     competencyLevelDescription:
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
      const payload = await request.validateUsing(createCompetencyValidator)
      const service = new CompetencyService()
      const newCompetency = await service.create({
        competencyName: payload.competencyName,
        competencyType: payload.competencyType,
        levelDescriptions: payload.levelDescriptions,
      })
      response.status(201)
      return {
        type: 'success',
        title: t('competency'),
        message: t('resource_was_created_successfully'),
        data: { competency: newCompetency },
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
   * /api/competencies/{competencyId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competencies
   *     summary: update competency
   *     parameters:
   *       - in: path
   *         name: competencyId
   *         schema:
   *           type: number
   *         description: Competency id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               competencyName:
   *                 type: string
   *               competencyType:
   *                 type: string
   *                 enum: [technical, transversal]
   *               levelDescriptions:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     competencyLevelId:
   *                       type: number
   *                     competencyLevelDescription:
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
      const competencyId = Number(request.param('competencyId'))
      if (!competencyId || Number.isNaN(competencyId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('competency') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const service = new CompetencyService()
      const current = await service.show(competencyId)
      if (!current) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('competency') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('competency') }),
          data: { competencyId },
        }
      }
      const payload = await request.validateUsing(updateCompetencyValidator)
      const updated = await service.update(current, {
        competencyName: payload.competencyName,
        competencyType: payload.competencyType,
        levelDescriptions: payload.levelDescriptions,
      })
      response.status(201)
      return {
        type: 'success',
        title: t('competency'),
        message: t('resource_was_updated_successfully'),
        data: { competency: updated },
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
   * /api/competencies/{competencyId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competencies
   *     summary: delete competency
   *     parameters:
   *       - in: path
   *         name: competencyId
   *         schema:
   *           type: number
   *         description: Competency id
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
      const competencyId = Number(request.param('competencyId'))
      if (!competencyId || Number.isNaN(competencyId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('competency') }),
          message: t('missing_data_to_process'),
          data: { competencyId },
        }
      }
      const service = new CompetencyService()
      const current = await service.show(competencyId)
      if (!current) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('competency') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('competency') }),
          data: { competencyId },
        }
      }
      const deleted = await service.delete(current)
      response.status(201)
      return {
        type: 'success',
        title: t('competency'),
        message: t('resource_was_deleted_successfully'),
        data: { competency: deleted },
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
   * /api/competencies/{competencyId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competencies
   *     summary: get competency by id
   *     parameters:
   *       - in: path
   *         name: competencyId
   *         schema:
   *           type: number
   *         description: Competency id
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
      const competencyId = Number(request.param('competencyId'))
      if (!competencyId || Number.isNaN(competencyId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('competency') }),
          message: t('missing_data_to_process'),
          data: { competencyId },
        }
      }
      const service = new CompetencyService()
      const competency = await service.show(competencyId)
      if (!competency) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('competency') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('competency') }),
          data: { competencyId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('competency'),
        message: t('resource_was_found_successfully'),
        data: { competency },
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
