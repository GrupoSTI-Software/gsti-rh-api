import { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import Notice from '#models/notice'
import NoticeService from '#services/notice_service'
import { createNoticeValidator, updateNoticeValidator } from '#validators/notice'
import UploadService from '#services/upload_service'
import NoticeFileService from '#services/notice_file_service'
import NoticeFile from '#models/notice_file'
import { resolveRequestBusinessUnitId } from '../helpers/resolve_request_business_unit_id.js'

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
      const rawEmployeeId = request.input('employeeId')
      const readStatus = request.input('readStatus') as 'all' | 'read' | 'unread' | undefined
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      const employeeId = rawEmployeeId ? Number(rawEmployeeId) : undefined
      const noticeService = new NoticeService(i18n)
      const notices = await noticeService.index({
        search,
        page,
        limit,
        employeeId,
        readStatus,
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
   * /api/notices/unread-count:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: get unread notices count for employee
   *     parameters:
   *       - name: employeeId
   *         in: query
   *         required: true
   *         description: Employee id
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Unread count retrieved successfully
   *       default:
   *         description: Unexpected error
   */
  async getUnreadCount({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const rawEmployeeId = request.input('employeeId')
      const employeeId = rawEmployeeId ? Number(rawEmployeeId) : undefined
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('employee') }),
          message: t('missing_data_to_process'),
          data: { employeeId },
        }
      }
      const noticeService = new NoticeService(i18n)
      const count = await noticeService.getUnreadCount(employeeId)
      response.status(200)
      return {
        type: 'success',
        title: t('notices'),
        message: t('resource_was_found_successfully'),
        data: {
          unreadCount: count,
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
   *               noticeType:
   *                 type: string
   *                 description: Notice type (text, image, pdf)
   *                 required: false
   *                 default: 'text'
   *               noticeFile:
   *                 type: string
   *                 format: binary
   *                 description: The file to upload
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *                   description: The files to upload (excel, doc, ppt, pdf, image, txt)
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      const recipientEmployeeIds = request.input('recipientEmployeeIds', []) || []
      const notice = {
        noticeSubject: (request.input('noticeSubject', '') || '').toString().trim(),
        noticeDescription: (request.input('noticeDescription', '') || '').toString().trim(),
        noticeType: (request.input('noticeType', 'text') || '').toString().trim(),
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

      // const validationOptions = {
      //   types: ['image', 'pdf'],
      //   size: '',
      // }

      // const file = request.file('noticeFile', validationOptions)
      // if (file) {
      //   // solo se pueden recibir imagenes y pdfs
      //   // validate file required
      //   if (!file) {
      //     response.status(400)
      //     return {
      //       status: 400,
      //       type: 'warning',
      //       title: 'Please upload a file valid',
      //       message: 'Missing data to process',
      //       data: file,
      //     }
      //   }
      //   const disallowedExtensions = [
      //     'mp4',
      //     'avi',
      //     'mkv',
      //     'mov',
      //     'wmv',
      //     'flv', // Video
      //     'mp3',
      //     'wav',
      //     'flac',
      //     'aac',
      //     'ogg', // Audio
      //   ]
      //   // Verificar si la extensión del archivo está en la lista de no permitidas
      //   if (disallowedExtensions.includes(file.extname ? file.extname : '')) {
      //     response.status(400)
      //     return {
      //       status: 400,
      //       type: 'warning',
      //       title: 'Please upload a file valid',
      //       message: 'Missing data to process',
      //       data: file,
      //     }
      //   }


      //   const fileName = `${new Date().getTime()}_${file.clientName}`
      //   const uploadService = new UploadService()
      //   const fileUrl = await uploadService.fileUpload(file, 'evidence-document', 'notices')
      //   notice.noticeDescription = fileUrl
      // }


      const newNotice = await noticeService.create(notice, recipientEmployeeIds)
      if (notice.noticeType === 'image' || notice.noticeType === 'pdf') {
        const validationOptions = {
          types: ['image', 'pdf'],
          size: '',
        }
        const file = request.file('noticeFile', validationOptions)
        if (file) {
          // solo se pueden recibir imagenes y pdfs
          // validate file required
          if (!file) {
            response.status(400)
            return {
              status: 400,
              type: 'warning',
              title: 'Please upload a file valid',
              message: 'Missing data to process',
              data: file,
            }
          }
          const disallowedExtensions = [
            'mp4',
            'avi',
            'mkv',
            'mov',
            'wmv',
            'flv', // Video
            'mp3',
            'wav',
            'flac',
            'aac',
            'ogg', // Audio
          ]
          // Verificar si la extensión del archivo está en la lista de no permitidas
          if (disallowedExtensions.includes(file.extname ? file.extname : '')) {
            response.status(400)
            return {
              status: 400,
              type: 'warning',
              title: 'Please upload a file valid',
              message: 'Missing data to process',
              data: file,
            }
          }


          const uploadService = new UploadService()
          const fileUrl = await uploadService.fileUpload(file, 'evidence-document', 'notices')
          notice.noticeDescription = fileUrl
        }
      } else if (notice.noticeType === 'text') {
        const validationOptions = {
          types: ['excel', 'doc', 'ppt', 'pdf', 'image', 'txt'],
          size: '',
        }
        const files = request.files('files', validationOptions)

        if (files) {
          const noticeFileService = new NoticeFileService()
          for (const file of files) {
            const uploadService = new UploadService()
            const fileUrl = await uploadService.fileUpload(file, 'evidence-document', 'notices')
            const noticeFile = {
              noticeId: newNotice.noticeId,
              noticeFilePath: fileUrl,
            } as NoticeFile
            await noticeFileService.create(noticeFile)
          }
        }
      }
      // USRH1783712837584: la ruta tiene `auth()` pero no `businessScope()`;
      // se resuelve el id de la empresa del usuario desde el header.
      const businessUnitId = await resolveRequestBusinessUnitId(ctx)
      await noticeService.sendNoticeEmails(newNotice.noticeId, false, businessUnitId)


      response.status(201)
      return {
        type: 'success',
        title: t('notice'),
        message: t('resource_was_created_successfully'),
        data: { notice: newNotice },
      }
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

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
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               noticeFile:
   *                 type: string
   *                 format: binary
   *                 description: The file to upload
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *                   description: The files to upload (excel, doc, ppt, pdf, image, txt)
   *               filesDeleted:
   *                 type: array
   *                 items:
   *                   type: number
   *                   description: Notice file id
   *                 required: false
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       default:
   *         description: Unexpected error
   */
  async update(ctx: HttpContext) {
    const { request, response, i18n } = ctx
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
        noticeType: (request.input('noticeType', 'text') || '').toString().trim(),
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
      const validationOptions = {
        types: ['image', 'pdf'],
        size: '',
      }
      const uploadService = new UploadService()
      const noticeFileService = new NoticeFileService()
      const filesDeleted = request.input('filesDeleted') || []
      for (const fileDeleted of filesDeleted) {
        // El identificador viene del cuerpo de la peticion: la consulta se
        // acota al aviso que se esta editando, que ya paso por el filtro de
        // empresa. Sin ese `where`, un administrador podia borrar el archivo
        // de un aviso de otra empresa —y su objeto en el bucket— pasando el id.
        const noticeFile = await NoticeFile.query()
          .whereNull('notice_file_deleted_at')
          .where('notice_file_id', fileDeleted)
          .where('notice_id', notice.noticeId)
          .first()
        if (noticeFile) {
          await noticeFileService.delete(noticeFile)
          await noticeService.deleteFileS3(noticeFile.noticeFilePath)
        }
      }

      if (notice.noticeType === 'image' || notice.noticeType === 'pdf') {
      const file = request.file('noticeFile', validationOptions)
        if (file) {
          // solo se pueden recibir imagenes y pdfs
          // validate file required
          const disallowedExtensions = [
            'mp4',
            'avi',
            'mkv',
            'mov',
            'wmv',
            'flv', // Video
            'mp3',
            'wav',
            'flac',
            'aac',
            'ogg', // Audio
          ]
          // Verificar si la extensión del archivo está en la lista de no permitidas
          if (disallowedExtensions.includes(file.extname ? file.extname : '')) {
            response.status(400)
            return {
              status: 400,
              type: 'warning',
              title: 'Please upload a file valid',
              message: 'Missing data to process',
              data: file,
            }
          }


          await noticeService.deleteFileS3(currentNotice.noticeDescription)
          const fileUrl = await uploadService.fileUpload(file, 'evidence-document', 'notices')
          notice.noticeDescription = fileUrl
        }
      } else if (notice.noticeType === 'text') {

        await noticeService.deleteFileS3(currentNotice.noticeDescription)

        const files = request.files('files', validationOptions)
        if (files) {
          for (const file of files) {
            const fileUrl = await uploadService.fileUpload(file, 'evidence-document', 'notices')
            const noticeFile = {
              noticeId: notice.noticeId,
              noticeFilePath: fileUrl,
            } as NoticeFile
            await noticeFileService.create(noticeFile)
          }
        }
      }

      // USRH1783712837584: la ruta tiene `auth()` pero no `businessScope()`;
      // se resuelve el id de la empresa del usuario desde el header.
      const businessUnitId = await resolveRequestBusinessUnitId(ctx)
      const updateNotice = await noticeService.update(
        currentNotice,
        notice,
        resendOnUpdate,
        recipientEmployeeIds,
        businessUnitId
      )
      response.status(201)
      return {
        type: 'success',
        title: t('notice'),
        message: t('resource_was_updated_successfully'),
        data: { notice: updateNotice },
      }
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

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
  async delete({ request, response, i18n }: HttpContext) {
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
      const rawEmployeeId = request.input('employeeId')
      const employeeId = rawEmployeeId ? Number(rawEmployeeId) : undefined
      const noticeService = new NoticeService(i18n)
      const notice = await noticeService.show(noticeId, employeeId)
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
  async send(ctx: HttpContext) {
    const { request, response, i18n } = ctx
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
      // USRH1783712837584: la ruta tiene `auth()` pero no `businessScope()`;
      // se resuelve el id de la empresa del usuario desde el header.
      const businessUnitId = await resolveRequestBusinessUnitId(ctx)
      const result = await noticeService.sendNotice(noticeId, businessUnitId)
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

  /**
   * @swagger
   * /api/notices/{noticeId}/mark-as-read:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: mark notice as read for employee
   *     parameters:
   *       - in: path
   *         name: noticeId
   *         schema:
   *           type: number
   *         description: Notice id
   *         required: true
   *       - name: employeeId
   *         in: query
   *         required: true
   *         description: Employee id
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Notice marked as read successfully
   *       default:
   *         description: Unexpected error
   */
  async markAsRead({ request, response, i18n }: HttpContext) {
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
      const rawEmployeeId = request.input('employeeId')
      const employeeId = rawEmployeeId ? Number(rawEmployeeId) : undefined
      if (!employeeId || Number.isNaN(employeeId)) {
        response.status(400)
        return {
          type: 'warning',
          title: t('entity_id_was_not_found', { entity: t('employee') }),
          message: t('missing_data_to_process'),
          data: { employeeId },
        }
      }
      const noticeService = new NoticeService(i18n)
      const result = await noticeService.markAsRead(noticeId, employeeId)
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
