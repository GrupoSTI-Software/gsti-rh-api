import { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import CareerPathCandidateService from '#services/career_path_candidate_service'
import { CareerPathCandidateFilterSearchInterface } from 'app/interfaces/career_path_candidate_filter_search_interface.js'
import CareerPathCandidate from '#models/career_path_candidate'
import { createCareerPathCandidateValidator, updateCareerPathCandidateValidator } from '#validators/career_path_candidate'
import { resolveRequestBusinessUnitId } from '../helpers/resolve_request_business_unit_id.js'

/**
 * Traduce un error inesperado a 500. Conserva el comportamiento legacy para
 * `E_VALIDATION_ERROR` (message inocuo) pero deja de repetir `error.message`
 * para cualquier otro error (R-7, USRH1786648600061): el `@beforeCreate` del
 * historial de estatus lanza textos que contienen "no está en tu alcance".
 * El detalle interno de esos casos solo va al logger. Espejo de
 * `career_path_template_controller.ts:unexpectedErrorResponse`.
 */
function unexpectedErrorResponse(
  error: unknown,
  response: HttpContext['response'],
  t: (key: string) => string
) {
  const isValidationError =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'E_VALIDATION_ERROR'

  if (isValidationError) {
    const messages = (error as unknown as { messages: Array<{ message: string }> }).messages
    response.status(500)
    return {
      type: 'error',
      title: t('server_error'),
      message: t('an_unexpected_error_has_occurred_on_the_server'),
      error: messages[0].message,
    }
  }

  logger.error({ err: error }, 'career_path_candidate: error inesperado')
  response.status(500)
  return {
    type: 'error',
    title: t('server_error'),
    message: t('an_unexpected_error_has_occurred_on_the_server'),
  }
}

export default class CareerPathCandidateController {
  /**
   * @swagger
   * /api/career-path-candidates:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Candidates
   *     summary: get all
   *     parameters:
   *       - originPositionId: origin position id
   *         in: query
   *         required: false
   *         description: Origin position id
   *         schema:
   *           type: number
   *       - targetPositionId: target position id
   *         in: query
   *         required: false
   *         description: Target position id
   *         schema:
   *           type: number
   *       - status: status
   *         in: query
   *         required: false
   *         description: Status
   *         schema:
   *           type: string
   *           enum:
   *             - propuesto
   *             - activo
   *             - rechazado
   *             - desactivado
   *             - expirado
   *       - employeeName: employee name
   *         in: query
   *         required: false
   *         description: Employee name
   *         schema:
   *           type: string
   *       - proposedByName: proposed by name
   *         in: query
   *         required: false
   *         description: Proposed by name
   *         schema:
   *           type: string
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
      const originPositionId = request.input('originPositionId')
      const targetPositionId = request.input('targetPositionId')
      const status = request.input('status')
      const employeeName = request.input('employeeName')
      const proposedByName = request.input('proposedByName')
      const careerPathCandidateService = new CareerPathCandidateService(i18n)
      const filters = {
        originPositionId: originPositionId,
        targetPositionId: targetPositionId,
        status: status,
        employeeName: employeeName,
        proposedByName: proposedByName,
      } as CareerPathCandidateFilterSearchInterface
      const careerPathCandidates = await careerPathCandidateService.index(filters)
      response.status(200)
      return {
        type: 'success',
        title: t('resources'),
        message: t('resources_were_found_successfully'),
        data: {
          careerPathCandidates,
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
   * /api/career-path-candidates:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Candidates
   *     summary: create new career path candidate
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
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               originPositionId:
   *                 type: number
   *                 description: Origin position id
   *                 required: true
   *                 default: ''
   *               targetPositionId:
   *                 type: number
   *                 description: Target position id
   *                 required: true
   *                 default: ''
   *               careerPathCandidateIsOverride:
   *                 type: boolean
   *                 description: Career path candidate is override
   *                 required: true
   *                 default: false
   *               careerPathOverrideReasonId:
   *                 type: number
   *                 description: Career path override reason id
   *                 required: false
   *                 default: null
   *               careerPathCandidateJustification:
   *                 type: string
   *                 description: Career path candidate justification
   *                 required: false
   *                 default: ''
   *               careerPathCandidateStatus:
   *                 type: string
   *                 description: Career path candidate status
   *                 required: true
   *                 default: 'propuesto'
   *               proposedBy:
   *                 type: number
   *                 description: Proposed by user id
   *                 required: true
   *                 default: ''
   *               reviewedBy:
   *                 type: number
   *                 description: Reviewed by user id
   *                 required: false
   *                 default: null
   *               careerPathCandidateReviewedAt:
   *                 type: string
   *                 description: Career path candidate reviewed at
   *                 required: false
   *                 default: null
   *               careerPathCandidateRejectionReason:
   *                 type: string
   *                 description: Career path candidate rejection reason
   *                 required: false
   *                 default: ''
   *               careerPathCandidateActivatedAt:
   *                 type: string
   *                 description: Career path candidate activated at
   *                 required: false
   *                 default: null
   *               careerPathCandidateExpiresAt:
   *                 type: string
   *                 description: Career path candidate expires at
   *                 required: false
   *                 default: null
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
   *       '409':
   *         description: The limit of candidates has been exceeded
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
   *       '403':
   *         description: The user is not the direct boss of the employee
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
  async store({ request, response, i18n, auth }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const businessUnitId = request.input('businessUnitId')
      const employeeId = request.input('employeeId')
      const originPositionId = request.input('originPositionId')
      const targetPositionId = request.input('targetPositionId')
      const careerPathCandidateIsOverride = request.input('careerPathCandidateIsOverride')
      const careerPathOverrideReasonId = request.input('careerPathOverrideReasonId')
      const careerPathCandidateJustification = request.input('careerPathCandidateJustification')
      const careerPathCandidateStatus = request.input('careerPathCandidateStatus')
      const proposedBy = auth.user?.userId
      const reviewedBy = request.input('reviewedBy')
      const careerPathCandidateReviewedAt = request.input('careerPathCandidateReviewedAt')
      const careerPathCandidateRejectionReason = request.input('careerPathCandidateRejectionReason')
      const careerPathCandidateActivatedAt = request.input('careerPathCandidateActivatedAt')
      const careerPathCandidateExpiresAt = request.input('careerPathCandidateExpiresAt')
      const careerPathCandidate = {
        businessUnitId: businessUnitId,
        employeeId: employeeId,
        originPositionId: originPositionId,
        targetPositionId: targetPositionId,
        careerPathCandidateIsOverride: careerPathCandidateIsOverride,
        careerPathOverrideReasonId: careerPathOverrideReasonId,
        careerPathCandidateJustification: careerPathCandidateJustification,
        careerPathCandidateStatus: careerPathCandidateStatus,
        proposedBy: proposedBy,
        reviewedBy: reviewedBy,
        careerPathCandidateReviewedAt: careerPathCandidateReviewedAt,
        careerPathCandidateRejectionReason: careerPathCandidateRejectionReason,
        careerPathCandidateActivatedAt: careerPathCandidateActivatedAt,
        careerPathCandidateExpiresAt: careerPathCandidateExpiresAt,
      } as CareerPathCandidate
      const careerPathCandidateService = new CareerPathCandidateService(i18n)
      const data = await request.validateUsing(createCareerPathCandidateValidator)
      const exist = await careerPathCandidateService.verifyInfoExist(careerPathCandidate)
      if (exist.status !== 200) {
        response.status(exist.status)
        return {
          type: exist.type,
          title: exist.title,
          message: exist.message,
          data: { ...data },
        }
      }
      const verifyInfo = await careerPathCandidateService.verifyInfo(careerPathCandidate)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...data },
        }
      }
      const newCareerPathCandidate = await careerPathCandidateService.create(careerPathCandidate)
      if (newCareerPathCandidate) {
        response.status(201)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_created_successfully'),
          data: { careerPathCandidate: newCareerPathCandidate },
        }
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response, t)
    }
  }

  /**
   * @swagger
   * /api/career-path-candidates/{careerPathCandidateId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Candidates
   *     summary: update career path candidate
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: careerPathCandidateId
   *         schema:
   *           type: number
   *         description: Career path candidate id
   *         required: true
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
   *               employeeId:
   *                 type: number
   *                 description: Employee id
   *                 required: true
   *                 default: ''
   *               originPositionId:
   *                 type: number
   *                 description: Origin position id
   *                 required: true
   *                 default: ''
   *               targetPositionId:
   *                 type: number
   *                 description: Target position id
   *                 required: true
   *                 default: ''
   *               careerPathCandidateIsOverride:
   *                 type: boolean
   *                 description: Career path candidate is override
   *                 required: true
   *                 default: false
   *               careerPathOverrideReasonId:
   *                 type: number
   *                 description: Career path override reason id
   *                 required: false
   *                 default: null
   *               careerPathCandidateJustification:
   *                 type: string
   *                 description: Career path candidate justification
   *                 required: false
   *                 default: ''
   *               careerPathCandidateStatus:
   *                 type: string
   *                 description: Career path candidate status
   *                 required: true
   *                 default: 'propuesto'
   *               proposedBy:
   *                 type: number
   *                 description: Proposed by user id
   *                 required: true
   *                 default: ''
   *               reviewedBy:
   *                 type: number
   *                 description: Reviewed by user id
   *                 required: false
   *                 default: null
   *               careerPathCandidateReviewedAt:
   *                 type: string
   *                 description: Career path candidate reviewed at
   *                 required: false
   *                 default: null
   *               careerPathCandidateRejectionReason:
   *                 type: string
   *                 description: Career path candidate rejection reason
   *                 required: false
   *                 default: ''
   *               careerPathCandidateActivatedAt:
   *                 type: string
   *                 description: Career path candidate activated at
   *                 required: false
   *                 default: null
   *               careerPathCandidateExpiresAt:
   *                 type: string
   *                 description: Career path candidate expires at
   *                 required: false
   *                 default: null
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
   *       '422':
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
   *       '409':
   *         description: The limit of candidates has been exceeded
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
  async updateStatus(ctx: HttpContext) {
    const { request, response, i18n, auth } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      const careerPathCandidateId = request.param('careerPathCandidateId')
      const careerPathCandidateStatus = request.input('careerPathCandidateStatus')
      const reviewedBy = auth.user?.userId
      const careerPathCandidateRejectionReason = request.input('careerPathCandidateRejectionReason')
      const careerPathCandidateActivatedAt = request.input('careerPathCandidateActivatedAt')
      const careerPathCandidate = {
        careerPathCandidateId: careerPathCandidateId,
        careerPathCandidateStatus: careerPathCandidateStatus,
        reviewedBy: reviewedBy,
        careerPathCandidateReviewedAt: DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss'),
        careerPathCandidateRejectionReason: careerPathCandidateRejectionReason,
        careerPathCandidateActivatedAt: careerPathCandidateActivatedAt,
      } as CareerPathCandidate

      if (!careerPathCandidateId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { ...careerPathCandidate },
        }
      }
      const currentCareerPathCandidate = await CareerPathCandidate.query()
        .whereNull('career_path_candidate_deleted_at')
        .where('career_path_candidate_id', careerPathCandidateId)
        .first()
      if (!currentCareerPathCandidate) {
        const entity = `${t('relation')} ${t('department')} - ${t('position')}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { ...careerPathCandidate },
        }
      }
      const careerPathCandidateService = new CareerPathCandidateService(i18n)
      await request.validateUsing(updateCareerPathCandidateValidator)
      const verifyInfo = careerPathCandidateService.verifyInvalidTransitions(currentCareerPathCandidate, careerPathCandidate)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...careerPathCandidate },
        }
      }
      if (careerPathCandidateStatus === 'activo') {
      const verifyLimitCandidatesActive = await careerPathCandidateService.verifyLimitCandidatesActive(currentCareerPathCandidate.employeeId)
        if (verifyLimitCandidatesActive.status !== 200) {
          response.status(verifyLimitCandidatesActive.status)
          return {
            type: verifyLimitCandidatesActive.type,
            title: verifyLimitCandidatesActive.title,
            message: verifyLimitCandidatesActive.message,
            data: { ...careerPathCandidate },
          }
        }
      }
      const updateCareerPathCandidate = await careerPathCandidateService.updateStatus(
        currentCareerPathCandidate,
        careerPathCandidate
      )
      if (updateCareerPathCandidate) {
        if (
          careerPathCandidateStatus === 'activo' ||
          careerPathCandidateStatus === 'rechazado'
        ) {
          // USRH1783712837584: la ruta tiene `auth()` pero no `businessScope()`;
          // se resuelve el id de la empresa del usuario desde el header.
          const businessUnitId = await resolveRequestBusinessUnitId(ctx)
          await careerPathCandidateService.sendStatusNotificationEmail(
            currentCareerPathCandidate.proposedBy,
            currentCareerPathCandidate,
            careerPathCandidateStatus,
            i18n,
            businessUnitId
          )
        }
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_updated_successfully'),
          data: { careerPathCandidate: updateCareerPathCandidate },
        }
      }
    } catch (error) {
      return unexpectedErrorResponse(error, response, t)
    }
  }

  /**
   * @swagger
   * /api/career-path-candidates/{careerPathCandidateId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Candidates
   *     summary: delete career path candidate
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: careerPathCandidateId
   *         schema:
   *           type: number
   *         description: Career path candidate id
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
      const careerPathCandidateId = request.param('careerPathCandidateId')
      if (!careerPathCandidateId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { careerPathCandidateId },
        }
      }
      const currentCareerPathCandidate = await CareerPathCandidate.query()
        .whereNull('career_path_candidate_deleted_at')
        .where('career_path_candidate_id', careerPathCandidateId)
        .first()
      if (!currentCareerPathCandidate) {
        const entity = `${t('relation')} ${t('company')} - ${t('position')} - ${t('position')}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { careerPathCandidateId },
        }
      }
      const careerPathCandidateService = new CareerPathCandidateService(i18n)
      const deleteCareerPathCandidate =
        await careerPathCandidateService.delete(currentCareerPathCandidate)
      if (deleteCareerPathCandidate) {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_deleted_successfully'),
          data: { careerPathCandidate: deleteCareerPathCandidate },
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
   * /api/career-path-candidates/{careerPathCandidateId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Candidates
   *     summary: get relation career path candidate by id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: careerPathCandidateId
   *         schema:
   *           type: number
   *         description: Career path candidate id
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
      const careerPathCandidateId = request.param('careerPathCandidateId')
      if (!careerPathCandidateId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { careerPathCandidateId },
        }
      }
      const careerPathCandidateService = new CareerPathCandidateService(i18n)
      const showCareerPathCandidate = await careerPathCandidateService.show(careerPathCandidateId)
      if (!showCareerPathCandidate) {
        const entity = `${t('relation')} ${t('company')} - ${t('position')}}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { careerPathCandidateId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resource'),
          message: t('resource_was_found_successfully'),
          data: { careerPathCandidate: showCareerPathCandidate },
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
   * /api/career-path-candidates/employee/{employeeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Career Path Candidates
   *     summary: get relation career path candidate by employee id
   *     produces:
   *       - application/json
   *     parameters:
   *       - in: path
   *         name: employeeId
   *         schema:
   *           type: number
   *         description: Employee id
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
  async getByEmployeeId({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const employeeId = request.param('employeeId')
      if (!employeeId) {
        response.status(400)
        return {
          type: 'warning',
          title: t('resource'),
          message: t('resource_id_was_not_found'),
          data: { employeeId },
        }
      }
      const careerPathCandidateService = new CareerPathCandidateService(i18n)
      const careerPathCandidates = await careerPathCandidateService.getByEmployeeId(employeeId)
      if (!careerPathCandidates) {
        const entity = `${t('relation')} ${t('company')} - ${t('position')} - ${t('position')}`
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity }),
          message: t('entity_was_not_found_with_entered_id', { entity }),
          data: { employeeId },
        }
      } else {
        response.status(200)
        return {
          type: 'success',
          title: t('resources'),
          message: t('resources_were_found_successfully'),
          data: { careerPathCandidates },
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
