import { HttpContext } from '@adonisjs/core/http'
import { createCompanyCompetencyLevelValidator, updateCompanyCompetencyLevelValidator } from '#validators/company_competency_level'
import CompanyCompetencyLevelService from '#services/company_competency_level_service'
import CompanyCompetencyLevel from '#models/company_competency_level'
import { CompanyCompetencyLevelFilterInterface } from 'app/interfaces/company_competency_level_filter_interface.js'

export default class CompanyCompetencyLevelController {
  /**
   * @swagger
   * /api/company-competency-levels:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Company Competency Levels
   *     summary: get all
   *     parameters:
   *       - name: businessUnitId
   *         in: query
   *         required: true
   *         description: Business unit id
   *         schema:
   *           type: number
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Object processed
   *       '404':
   *         description: The resource could not be found
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: List of parameters set by the client
   *       '400':
   *         description: The parameters entered are invalid or essential data is missing to process the request.
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
   *                   description: Response message
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
   *                   description: Response message
   *                 data:
   *                   type: object
   *                   description: Error message obtained
   *                   properties:
   *                     error:
   *                       type: string
   */
  async index({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const businessUnitId = request.input('businessUnitId')
      const filters = {
        businessUnitId: businessUnitId,
      } as CompanyCompetencyLevelFilterInterface
      const companyCompetencyLevelService = new CompanyCompetencyLevelService(i18n)
      const companyCompetencyLevels = await companyCompetencyLevelService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: t('resources'),
        message: t('resources_were_found_successfully'),
        data: {
          companyCompetencyLevels,
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
   * /api/company-competency-levels:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Company Competency Levels
   *     summary: create new company competency level
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               businessUnitId:
   *                 type: number
   *                 description: Business unit id
   *                 required: true
   *                 default: ''
   *               companyCompetencyLevelLabel:
   *                 type: string
   *                 description: Company competency level label
   *                 required: true
   *                 default: ''
   *               companyCompetencyLevelPosition:
   *                 type: number
   *                 description: Company competency level position
   *                 required: true
   *                 default: ''
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

    await request.validateUsing(createCompanyCompetencyLevelValidator)
    const companyCompetencyLevelService = new CompanyCompetencyLevelService(i18n)
    const businessUnitId = request.input('businessUnitId')
    const companyCompetencyLevelLabel = request.input('companyCompetencyLevelLabel')
    const companyCompetencyLevelPosition = request.input('companyCompetencyLevelPosition')
    const companyCompetencyLevel = {
      businessUnitId: businessUnitId,
      companyCompetencyLevelLabel: companyCompetencyLevelLabel,
      companyCompetencyLevelPosition: companyCompetencyLevelPosition,
    } as CompanyCompetencyLevel

    const existInfoDate = await companyCompetencyLevelService.verifyInfoExist(companyCompetencyLevel)
    if (existInfoDate.status !== 200) {
      response.status(existInfoDate.status)
      return {
        type: existInfoDate.type,
        title: existInfoDate.title,
        message: existInfoDate.message,
        data: { ...companyCompetencyLevel },
      }
    }
    const verifyInfo = await companyCompetencyLevelService.verifyInfo(companyCompetencyLevel)
    if (verifyInfo.status !== 200) {
      response.status(verifyInfo.status)
      return {
        type: verifyInfo.type,
        title: verifyInfo.title,
        message: verifyInfo.message,
        data: { ...companyCompetencyLevel },
      }
    }
    const newCompanyCompetencyLevel = await companyCompetencyLevelService.create(companyCompetencyLevel)
    response.status(201)
    return {
      type: 'success',
      title: t('resource'),
      message: t('resource_was_created_successfully'),
      data: { companyCompetencyLevel: newCompanyCompetencyLevel },
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
   * /api/company-competency-levels/{companyCompetencyLevelId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Company Competency Levels
   *     summary: update company competency level
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: companyCompetencyLevelId
   *         schema:
   *           type: number
   *         description: Company competency level id
   *         required: true
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               companyCompetencyLevelLabel:
   *                 type: string
   *                 description: Company competency level label
   *                 required: true
   *               companyCompetencyLevelPosition:
   *                 type: number
   *                 description: Company competency level position
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
      await request.validateUsing(updateCompanyCompetencyLevelValidator)
      const companyCompetencyLevelId = request.param('companyCompetencyLevelId')
      const companyCompetencyLevelLabel = request.input('companyCompetencyLevelLabel')
      const companyCompetencyLevelPosition = request.input('companyCompetencyLevelPosition')
      const companyCompetencyLevel = {
        companyCompetencyLevelId: companyCompetencyLevelId,
        companyCompetencyLevelLabel: companyCompetencyLevelLabel,
        companyCompetencyLevelPosition: companyCompetencyLevelPosition,
      } as CompanyCompetencyLevel
      if (!companyCompetencyLevelId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The company competency level Id was not found',
          message: 'Missing data to process',
          data: { ...companyCompetencyLevel },
        }
      }
      const currentCompanyCompetencyLevel = await CompanyCompetencyLevel.query()
        .whereNull('company_competency_level_deleted_at')
        .where('company_competency_level_id', companyCompetencyLevelId)
        .first()
      if (!currentCompanyCompetencyLevel) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The company competency level was not found',
          message: 'The company competency level was not found with the entered ID',
          data: { ...companyCompetencyLevel },
        }
      }
      const companyCompetencyLevelService = new CompanyCompetencyLevelService(i18n)
      const verifyInfo = await companyCompetencyLevelService.verifyInfo(companyCompetencyLevel)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...companyCompetencyLevel },
        }
      }
      const updateCompanyCompetencyLevel = await companyCompetencyLevelService.update(currentCompanyCompetencyLevel, companyCompetencyLevel)
      if (updateCompanyCompetencyLevel) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { companyCompetencyLevel: updateCompanyCompetencyLevel },
        }
      }
    } catch (error) {
      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: messageError,
      }
    }
  }

  /**
   * @swagger
   * /api/company-competency-levels/delete/{companyCompetencyLevelId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Company Competency Levels
   *     summary: delete company competency level
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: companyCompetencyLevelId
   *         schema:
   *           type: number
   *         description: Company competency level id
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
  async destroy({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const companyCompetencyLevelId = request.param('companyCompetencyLevelId')
      if (!companyCompetencyLevelId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The company competency level Id was not found',
          message: 'Missing data to process',
          data: { companyCompetencyLevelId },
        }
      }
      const currentCompanyCompetencyLevel = await CompanyCompetencyLevel.query()
        .whereNull('company_competency_level_deleted_at')
        .where('company_competency_level_id', companyCompetencyLevelId)
        .first()
      if (!currentCompanyCompetencyLevel) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The company competency level was not found',
          message: 'The company competency level was not found with the entered ID',
          data: { companyCompetencyLevelId },
        }
      }
      const companyCompetencyLevelService = new CompanyCompetencyLevelService(i18n)
      const deleteCompanyCompetencyLevel = await companyCompetencyLevelService.delete(currentCompanyCompetencyLevel)
      if (deleteCompanyCompetencyLevel) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { companyCompetencyLevel: deleteCompanyCompetencyLevel },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }

  /**
   * @swagger
   * /api/company-competency-levels/{companyCompetencyLevelId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Company Competency Levels
   *     summary: get company competency level by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: companyCompetencyLevelId
   *         schema:
   *           type: number
   *         description: Company competency level id
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
    try {
      const companyCompetencyLevelId = request.param('companyCompetencyLevelId')
      if (!companyCompetencyLevelId) {
        response.status(400)
        return {
          type: 'warning',
          title: 'The company competency level Id was not found',
          message: 'Missing data to process',
          data: { companyCompetencyLevelId },
        }
      }

      const companyCompetencyLevelService = new CompanyCompetencyLevelService(i18n)
      const showCompanyCompetencyLevel = await companyCompetencyLevelService.show(companyCompetencyLevelId)
      if (!showCompanyCompetencyLevel) {
        response.status(404)
        return {
          type: 'warning',
          title: 'The company competency level was not found',
          message: 'The company competency level was not found with the entered ID',
          data: { companyCompetencyLevelId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: 'Company competency level',
          message: 'The company competency level was found successfully',
          data: { companyCompetencyLevel: showCompanyCompetencyLevel },
        }
      }
    } catch (error) {
      response.status(500)
      return {
        type: 'error',
        title: 'Server error',
        message: 'An unexpected error has occurred on the server',
        error: error.message,
      }
    }
  }
}
