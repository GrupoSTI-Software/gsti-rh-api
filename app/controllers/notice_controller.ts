import { HttpContext } from '@adonisjs/core/http'
import Notice from '#models/notice'
import NoticeService from '#services/notice_service'
import { createNoticeValidator, updateNoticeValidator } from '#validators/notice'

export default class NoticeController {
  /**
   * @swagger
   * /api/notices:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: get notices
   *     parameters:
   *       - name: search
   *         in: query
   *         required: false
   *         description: Search term for notice subject
   *         schema:
   *           type: string
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
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const noticeService = new NoticeService(i18n)
      const notices = await noticeService.index({
        search,
        page,
        limit,
      })
      response.status(200)
      return {
        type: 'success',
        title: t('notices'),
        message: t('resources_were_found_successfully'),
        data: {
          notices,
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
   * /api/notices:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: create new notice
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               noticeSubject:
   *                 type: string
   *                 description: Notice subject/title
   *                 required: true
   *                 default: ''
   *               noticeDescription:
   *                 type: string
   *                 description: Notice description/content (HTML rich text)
   *                 required: true
   *                 default: ''
   *               recipientEmployeeIds:
   *                 type: array
   *                 items:
   *                   type: number
   *                 description: Array of employee IDs to send notice to
   *                 required: false
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async store({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const recipientEmployeeIds = request.input('recipientEmployeeIds', []) || []
      const notice = {
        noticeSubject: (request.input('noticeSubject', '') || '').toString().trim(),
        noticeDescription: (request.input('noticeDescription', '') || '').toString().trim(),
      } as Notice

      const noticeService = new NoticeService(i18n)
      await request.validateUsing(createNoticeValidator)
      const verifyInfo = await noticeService.verifyInfo(notice)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...notice },
        }
      }
      const newNotice = await noticeService.create(notice, recipientEmployeeIds)
      response.status(201)
      return {
        type: 'success',
        title: t('notice'),
        message: t('resource_was_created_successfully'),
        data: { notice: newNotice },
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
   * /api/notices/{noticeId}:
   *   put:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: update notice
   *     parameters:
   *       - in: path
   *         name: noticeId
   *         schema:
   *           type: number
   *         description: Notice id
   *         required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async update({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const noticeId = Number(request.param('noticeId'))
      if (!noticeId || Number.isNaN(noticeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('notice') }),
          message: t('missing_data_to_process'),
          data: {},
        }
      }
      const currentNotice = await Notice.query()
        .whereNull('notice_deleted_at')
        .where('notice_id', noticeId)
        .first()
      if (!currentNotice) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('notice') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('notice') }),
          data: { noticeId },
        }
      }

      const notice = {
        noticeId,
        noticeSubject: (request.input('noticeSubject', '') || '').toString().trim(),
        noticeDescription: (request.input('noticeDescription', '') || '').toString().trim(),
      } as Notice

      const resendOnUpdate = request.input('resendOnUpdate', true) !== false // Por defecto true si no se especifica
      // Siempre recibir recipientEmployeeIds del request (puede ser array vacío)
      const recipientEmployeeIds = request.input('recipientEmployeeIds', []) || []

      await request.validateUsing(updateNoticeValidator)
      const noticeService = new NoticeService(i18n)
      const verifyInfo = await noticeService.verifyInfo(notice)
      if (verifyInfo.status !== 200) {
        response.status(verifyInfo.status)
        return {
          type: verifyInfo.type,
          title: verifyInfo.title,
          message: verifyInfo.message,
          data: { ...notice },
        }
      }
      const updateNotice = await noticeService.update(currentNotice, notice, resendOnUpdate, recipientEmployeeIds)
      response.status(201)
      return {
        type: 'success',
        title: t('notice'),
        message: t('resource_was_updated_successfully'),
        data: { notice: updateNotice },
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
   * /api/notices/{noticeId}:
   *   delete:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: delete notice
   *     parameters:
   *       - in: path
   *         name: noticeId
   *         schema:
   *           type: number
   *         description: Notice id
   *         required: true
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async delete({ auth, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const noticeId = Number(request.param('noticeId'))
      if (!noticeId || Number.isNaN(noticeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('notice') }),
          message: t('missing_data_to_process'),
          data: { noticeId },
        }
      }
      const currentNotice = await Notice.query()
        .whereNull('notice_deleted_at')
        .where('notice_id', noticeId)
        .first()
      if (!currentNotice) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('notice') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('notice') }),
          data: { noticeId },
        }
      }
      const noticeService = new NoticeService(i18n)
      const deletedNotice = await noticeService.delete(currentNotice)
      response.status(201)
      return {
        type: 'success',
        title: t('notice'),
        message: t('resource_was_deleted_successfully'),
        data: { notice: deletedNotice },
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
   * /api/notices/{noticeId}:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: get notice by id
   *     parameters:
   *       - in: path
   *         name: noticeId
   *         schema:
   *           type: number
   *         description: Notice id
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
      const noticeId = Number(request.param('noticeId'))
      if (!noticeId || Number.isNaN(noticeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('notice') }),
          message: t('missing_data_to_process'),
          data: { noticeId },
        }
      }
      const noticeService = new NoticeService(i18n)
      const notice = await noticeService.show(noticeId)
      if (!notice) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('notice') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('notice') }),
          data: { noticeId },
        }
      }
      response.status(200)
      return {
        type: 'success',
        title: t('notice'),
        message: t('resource_was_found_successfully'),
        data: { notice },
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
   * /api/notices/{noticeId}/send:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: send notice to recipients
   *     parameters:
   *       - in: path
   *         name: noticeId
   *         schema:
   *           type: number
   *         description: Notice id
   *         required: true
   *     responses:
   *       '200':
   *         description: Notice sent successfully
   *       default:
   *         description: Unexpected error
   */
  async send({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const noticeId = Number(request.param('noticeId'))
      if (!noticeId || Number.isNaN(noticeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('notice') }),
          message: t('missing_data_to_process'),
          data: { noticeId },
        }
      }
      const noticeService = new NoticeService(i18n)
      const result = await noticeService.sendNotice(noticeId)
      response.status(result.status)
      return result
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
