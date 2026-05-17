import { HttpContext } from '@adonisjs/core/http'
import CompetencyDescriptorService from '#services/competency_descriptor_service'
import { createCompetencyDescriptorValidator, updateCompetencyDescriptorValidator } from '#validators/competency_descriptor'
import CompetencyDescriptor from '#models/competency_descriptor'

export default class CompetencyDescriptorController {
  /**
   * @swagger
   * /api/competency-descriptors:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Descriptors
   *     summary: create new competency descriptor
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               competencyId:
   *                 type: string
   *                 description: Competency id
   *                 required: true
   *               businessUnitCompetencyLevelId:
   *                 type: number
   *                 description: Business unit competency level id
   *                 required: true
   *               competencyDescriptorDescription:
   *                 type: string
   *                 description: Competency descriptor description
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
      const payload = await request.validateUsing(createCompetencyDescriptorValidator)
      const service = new CompetencyDescriptorService(i18n)
      const competencyDescriptor = {
        competencyId: payload.competencyId,
        businessUnitCompetencyLevelId: payload.businessUnitCompetencyLevelId,
        competencyDescriptorDescription: payload.competencyDescriptorDescription,
      } as CompetencyDescriptor
      const verifyInfoExist = await service.verifyInfoExist(competencyDescriptor)
      if (verifyInfoExist.status !== 200) {
        response.status(verifyInfoExist.status)
        return {
          type: verifyInfoExist.type,
          title: verifyInfoExist.title,
          message: verifyInfoExist.message,
          data: { ...competencyDescriptor },
        }
      }
      const newCompetencyDescriptor = await service.create(competencyDescriptor)
      response.status(201)
      return {
        type: 'success',
        title: t('competency'),
        message: t('resource_was_created_successfully'),
        data: { competencyDescriptor: newCompetencyDescriptor },
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
   * /api/competency-descriptors/{competencyDescriptorId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Descriptors
   *     summary: update competency descriptor
   *     parameters:
   *       - in: path
   *         name: competencyDescriptorId
   *         schema:
   *           type: number
   *         description: Competency descriptor id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               competencyDescriptorDescription:
   *                 type: string
   *                 description: Competency descriptor description
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
      const competencyDescriptorId = Number(request.param('competencyDescriptorId'))
     await request.validateUsing(updateCompetencyDescriptorValidator)
      if (!competencyDescriptorId || Number.isNaN(competencyDescriptorId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('competency_descriptor') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const currentCompetencyDescriptor = await CompetencyDescriptor.query()
        .whereNull('competency_descriptor_deleted_at')
        .where('competency_descriptor_id', competencyDescriptorId)
        .first()
      if (!currentCompetencyDescriptor) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('competency_descriptor') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('competency_descriptor') }),
          data: { competencyDescriptorId },
        }
      }
      const competencyDescriptorService = new CompetencyDescriptorService(i18n)
      const data = await request.validateUsing(updateCompetencyDescriptorValidator)
      const competencyDescriptor = {
        competencyDescriptorDescription: data.competencyDescriptorDescription,
      } as CompetencyDescriptor
      const updatedCompetencyDescriptor = await competencyDescriptorService.update(currentCompetencyDescriptor, competencyDescriptor)
        response.status(200)
        return {
          type: 'success',
          title: t('competency_descriptor'),
          message: t('resource_was_updated_successfully'),
          data: { competencyDescriptor: updatedCompetencyDescriptor },
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
   * /api/competency-descriptors/{competencyDescriptorId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Descriptors
   *     summary: delete competency descriptor
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
  async delete({ request, response, i18n }: HttpContext) {
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
      const currentCompetencyDescriptor = await CompetencyDescriptor.query()
        .whereNull('competency_descriptor_deleted_at')
        .where('competency_descriptor_id', competencyDescriptorId)
        .first()
      if (!currentCompetencyDescriptor) {
        const entity = t('competency_descriptor')
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { competencyDescriptorId },
        }
      }
      const competencyDescriptorService = new CompetencyDescriptorService(i18n)
      const deleteCompetencyDescriptor = await competencyDescriptorService.delete(currentCompetencyDescriptor)
      if (deleteCompetencyDescriptor) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { competencyDescriptor: deleteCompetencyDescriptor },
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
   * /api/competency-descriptors/{competencyDescriptorId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Descriptors
   *     summary: get competency descriptor by id
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
  async show({ request, response, i18n }: HttpContext) {
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
      const competencyDescriptorService = new CompetencyDescriptorService(i18n)
      const showCompetencyDescriptor = await competencyDescriptorService.show(competencyDescriptorId)
      if (!showCompetencyDescriptor) {
        const entity = t('competency_descriptor')
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
          title: t('resource'),
          message: t('resource_was_found_successfully'),
          data: { competencyDescriptor: showCompetencyDescriptor },
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
   * /api/competency-descriptors/by-competency/{competencyId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Competency Descriptors
   *     summary: get competency descriptors by competency id
   *     produces:
   *       - application/json
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
  async getByCompetencyId({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const competencyId = request.param('competencyId')
      if (!competencyId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { competencyId },
        }
      }
      const competencyDescriptorService = new CompetencyDescriptorService(i18n)
      const competencyDescriptors = await competencyDescriptorService.getByCompetencyId(competencyId)
      if (!competencyDescriptors) {
        const entity = t('competency_descriptor')
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { competencyId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resources'),
          message: t('resources_were_found_successfully'),
          data: { competencyDescriptors },
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
