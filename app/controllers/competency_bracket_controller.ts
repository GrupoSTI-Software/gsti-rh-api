import { HttpContext } from '@adonisjs/core/http'
import CompetencyBracket from '#models/competency_bracket'
import CompetencyBracketService from '#services/competency_bracket_service'
import { createCompetencyBracketValidator, updateCompetencyBracketValidator } from '#validators/competency_bracket'

export default class CompetencyBracketController {
  /**
   * @swagger
   * /api/competency-brackets:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Brackets
   *     summary: create new competency bracket
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               competencyDescriptorId:
   *                 type: number
   *                 description: Competency descriptor id
   *                 required: true
   *               competencyBracketDescription:
   *                 type: string
   *                 description: Competency bracket description
   *                 required: true
   *               competencyBracketRangeMin:
   *                 type: number
   *                 description: Competency bracket range min
   *                 required: true
   *               competencyBracketRangeMax:
   *                 type: number
   *                 description: Competency bracket range max
   *                 required: true
   *               competencyBracketPosition:
   *                 type: number
   *                 description: Competency bracket position
   *                 required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const data = await request.validateUsing(createCompetencyBracketValidator)
      const service = new CompetencyBracketService(i18n)
      const competencyBracket = {
        competencyDescriptorId: data.competencyDescriptorId,
        competencyBracketDescription: data.competencyBracketDescription,
        competencyBracketRangeMin: data.competencyBracketRangeMin,
        competencyBracketRangeMax: data.competencyBracketRangeMax,
        competencyBracketPosition: data.competencyBracketPosition,
      } as CompetencyBracket
      const verifyInfoExist = await service.verifyInfoExist(competencyBracket)
      if (verifyInfoExist.status !== 200) {
        response.status(verifyInfoExist.status)
        return {
          type: verifyInfoExist.type,
          title: verifyInfoExist.title,
          message: verifyInfoExist.message,
          data: { ...competencyBracket },
        }
      }
      const newCompetencyBracket = await service.create(competencyBracket)
      response.status(201)
      return {
        type: 'success',
        title: t('competency'),
        message: t('resource_was_created_successfully'),
        data: { competencyBracket: newCompetencyBracket },
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
   * /api/competency-brackets/{competencyBracketId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Brackets
   *     summary: update competency bracket
   *     parameters:
   *       - in: path
   *         name: competencyBracketId
   *         schema:
   *           type: number
   *         description: Competency bracket id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               competencyBracketDescription:
   *                 type: string
   *                 description: Competency bracket description
   *                 required: true
   *               competencyBracketRangeMin:
   *                 type: number
   *                 description: Competency bracket range min
   *                 required: true
   *               competencyBracketRangeMax:
   *                 type: number
   *                 description: Competency bracket range max
   *                 required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async update({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const competencyBracketId = Number(request.param('competencyBracketId'))
      if (!competencyBracketId || Number.isNaN(competencyBracketId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('competency_bracket') }),
          message: t('missing_data_to_process'),
          data: { competencyBracketId },
        }
      }
      const currentCompetencyBracket = await CompetencyBracket.query()
        .whereNull('competency_bracket_deleted_at')
        .where('competency_bracket_id', competencyBracketId)
        .first()
      if (!currentCompetencyBracket) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('competency_bracket') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('competency_bracket') }),
          data: { competencyBracketId },
        }
      }
      const competencyBracketService = new CompetencyBracketService(i18n)
      const data = await request.validateUsing(updateCompetencyBracketValidator)
      const competencyBracket = {
        competencyBracketDescription: data.competencyBracketDescription,
        competencyBracketRangeMin: data.competencyBracketRangeMin,
        competencyBracketRangeMax: data.competencyBracketRangeMax,
        competencyBracketPosition: data.competencyBracketPosition,
      } as CompetencyBracket
      const updatedCompetencyBracket = await competencyBracketService.update(currentCompetencyBracket, competencyBracket)
        response.status(200)
        return {
          type: 'success',
          title: t('competency_bracket'),
          message: t('resource_was_updated_successfully'),
          data: { competencyBracket: updatedCompetencyBracket },
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
   * /api/competency-brackets/{competencyBracketId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Brackets
   *     summary: delete competency bracket
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: competencyBracketId
   *         schema:
   *           type: number
   *         description: Competency bracket id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async delete({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const competencyBracketId = request.param('competencyBracketId')
      if (!competencyBracketId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { competencyBracketId },
        }
      }
      const currentCompetencyBracket = await CompetencyBracket.query()
        .whereNull('competency_bracket_deleted_at')
        .where('competency_bracket_id', competencyBracketId)
        .first()
      if (!currentCompetencyBracket) {
        const entity = t('competency_bracket')
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { competencyBracketId },
        }
      }
      const competencyBracketService = new CompetencyBracketService(i18n)
      const deleteCompetencyBracket = await competencyBracketService.delete(currentCompetencyBracket)
      if (deleteCompetencyBracket) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { competencyBracket: deleteCompetencyBracket },
        }
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
   * /api/competency-brackets/{competencyBracketId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Brackets
   *     summary: get competency bracket by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: competencyBracketId
   *         schema:
   *           type: number
   *         description: Competency bracket id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async show({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const competencyBracketId = request.param('competencyBracketId')
      if (!competencyBracketId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { competencyBracketId },
        }
      }
      const competencyBracketService = new CompetencyBracketService(i18n)
      const showCompetencyBracket = await competencyBracketService.show(competencyBracketId)
      if (!showCompetencyBracket) {
        const entity = t('competency_bracket')
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { competencyBracketId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_found_successfully'),
          data: { competencyBracket: showCompetencyBracket },
        }
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
   * /api/competency-brackets/by-descriptor/{competencyDescriptorId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Brackets
   *     summary: get competency brackets by competency descriptor id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: competencyDescriptorId
   *         schema:
   *           type: number
   *         description: Competency descriptor id
   *         required: true
   *     responses:
   *       '200':
   *         description: Resource processed successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Processed object
   *       '404':
   *         description: Resource not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       default:
   *         description: Unexpected error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   description: Type of response generated
   *                 title:
   *                   type: string
   *                   description: Title of response generated
   *                 message:
   *                   type: string
   *                   description: Message of response
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async getByCompetencyDescriptorId({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const competencyDescriptorId = request.param('competencyDescriptorId')
      if (!competencyDescriptorId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { competencyDescriptorId },
        }
      }
      const competencyBracketService = new CompetencyBracketService(i18n)
      const competencyBrackets = await competencyBracketService.getByCompetencyDescriptorId(competencyDescriptorId)
      if (!competencyBrackets) {
        const entity = t('competency_bracket')
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { competencyDescriptorId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resources'),
          message: t('resources_were_found_successfully'),
          data: { competencyBrackets },
        }
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
