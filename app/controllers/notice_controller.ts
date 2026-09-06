import { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import { resolveSessionEmployeeId } from '#helpers/resolve_session_employee_id'
import { sanitizeNoticeHtml } from '#helpers/sanitize_notice_content'
import Notice from '#models/notice'
import NoticeService, {
  type NoticeInput,
  type NoticeValidationError,
} from '#services/notice_service'
import {
  createNoticeValidator,
  sendNoticeValidator,
  updateNoticeValidator,
} from '#validators/notice'
import UploadService from '#services/upload_service'
import NoticeFileService from '#services/notice_file_service'
import NoticeFile from '#models/notice_file'
import {
  NOTICE_AUDIENCE,
  NOTICE_AUDIENCE_VALUES,
  NOTICE_FILE_FOLDER,
  NOTICE_FILE_INTAKE_PROFILE,
  NOTICE_SEND_MODE,
  NOTICE_STATUS_VALUES,
  NOTICE_TYPE,
  NOTICE_TYPE_VALUES,
  type NoticeAudienceValue,
  type NoticeSendModeValue,
  type NoticeStatusValue,
  type NoticeTypeValue,
} from '#constants/notice'

/**
 * Perfil y carpeta de todo archivo de aviso. Antes se pasaba `types: [...]` a
 * `request.file`, opción que Adonis 6 no reconoce: la validación real —por
 * contenido, no por extensión— la hace el perfil de entrada en el servicio de
 * subida.
 */
const NOTICE_FILE_FIELD = 'noticeFile'
const NOTICE_ATTACHMENTS_FIELD = 'files'

export default class NoticeController {
  /** Respuesta de rechazo con el triplete del estándar. */
  private reject(response: HttpContext['response'], error: NoticeValidationError) {
    response.status(error.status)
    return {
      type: 'warning',
      title: error.title,
      detail: error.detail,
      key: error.key,
    }
  }

  private isStatus(value: unknown): value is NoticeStatusValue {
    return typeof value === 'string' && (NOTICE_STATUS_VALUES as readonly string[]).includes(value)
  }

  private isAudience(value: unknown): value is NoticeAudienceValue {
    return typeof value === 'string' && (NOTICE_AUDIENCE_VALUES as readonly string[]).includes(value)
  }

  private isType(value: unknown): value is NoticeTypeValue {
    return typeof value === 'string' && (NOTICE_TYPE_VALUES as readonly string[]).includes(value)
  }

  /** Fecha `YYYY-MM-DD` tal cual, o `undefined` si no tiene esa forma. */
  private isoDate(value: unknown): string | undefined {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
  }

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
   *       - name: status
   *         in: query
   *         required: false
   *         description: Folder filter (sent, scheduled, draft)
   *         schema:
   *           type: string
   *       - name: audience
   *         in: query
   *         required: false
   *         description: Audience filter (company, department, manual)
   *         schema:
   *           type: string
   *       - name: noticeType
   *         in: query
   *         required: false
   *         description: Content type filter (text, image, pdf)
   *         schema:
   *           type: string
   *       - name: dateFrom
   *         in: query
   *         required: false
   *         description: Inclusive lower bound (YYYY-MM-DD) on the relevant date
   *         schema:
   *           type: string
   *       - name: dateTo
   *         in: query
   *         required: false
   *         description: Inclusive upper bound (YYYY-MM-DD) on the relevant date
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
   *         description: Resource processed successfully. Includes folder counts for the backoffice view.
   *       default:
   *         description: Unexpected error
   */
  async index(ctx: HttpContext) {
    const { request, response, i18n } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      const search = request.input('search')
      const rawPage = Number(request.input('page', 1))
      const rawLimit = Number(request.input('limit', 100))
      const rawEmployeeId = request.input('employeeId')
      const readStatus = request.input('readStatus') as 'all' | 'read' | 'unread' | undefined
      const page = Number.isNaN(rawPage) || rawPage <= 0 ? 1 : rawPage
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : rawLimit
      // La PRESENCIA del parámetro decide la vista; su VALOR se descarta y lo
      // pone la sesión. Antes se obedecía: con el token de cualquier trabajador
      // se leían los avisos de otro.
      //
      // Un employeeId ajeno no devuelve 403 sino lo propio: un 403 distinguiría
      // "existe pero no es tuyo" de "no existe", y rompería a un cliente viejo
      // que llevara el id desincronizado.
      const employeeId = rawEmployeeId
        ? ((await resolveSessionEmployeeId(ctx)) ?? -1)
        : undefined
      // El corte por empresa lo hace el middleware `businessScope()`, que esta
      // ruta ya monta: deja el TenantContext activo y el mixin del modelo filtra
      // solo. Aquí no se replica.
      const status = request.input('status')
      const audience = request.input('audience')
      const noticeType = request.input('noticeType')
      const noticeService = new NoticeService(i18n)
      const notices = await noticeService.index({
        search,
        page,
        limit,
        employeeId,
        readStatus,
        status: this.isStatus(status) ? status : undefined,
        audience: this.isAudience(audience) ? audience : undefined,
        noticeType: this.isType(noticeType) ? noticeType : undefined,
        dateFrom: this.isoDate(request.input('dateFrom')),
        dateTo: this.isoDate(request.input('dateTo')),
      })
      // Los conteos de carpetas son del buzón de administración; la app no
      // los pinta y no vale la pena la consulta extra en cada arranque.
      const counts = employeeId === undefined ? await noticeService.counts(search) : undefined
      response.status(200)
      return {
        type: 'success',
        title: t('notices'),
        message: t('resources_were_found_successfully'),
        data: {
          notices,
          counts,
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
  async getUnreadCount(ctx: HttpContext) {
    const { response, i18n } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      // Deja de leer el query por completo: no tiene consumidor fuera de la app
      // y esta cuenta es siempre la propia.
      const employeeId = await resolveSessionEmployeeId(ctx)
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
   * Arma la entrada del aviso a partir del cuerpo validado. El mensaje de
   * texto se sanea aquí porque se pinta como HTML en tres clientes; los avisos
   * de imagen o PDF no traen mensaje: su descripción es la key del archivo.
   */
  private buildInput(payload: {
    noticeSubject: string
    noticeDescription?: string
    noticeType?: NoticeTypeValue
    noticeAudience?: NoticeAudienceValue
  }): NoticeInput {
    const noticeType = payload.noticeType ?? NOTICE_TYPE.TEXT
    return {
      noticeSubject: payload.noticeSubject.trim(),
      noticeDescription:
        noticeType === NOTICE_TYPE.TEXT ? sanitizeNoticeHtml(payload.noticeDescription) : '',
      noticeType,
      noticeAudience: payload.noticeAudience ?? NOTICE_AUDIENCE.MANUAL,
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
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               noticeSubject:
   *                 type: string
   *                 description: Notice subject/title
   *                 required: true
   *               noticeDescription:
   *                 type: string
   *                 description: Message (HTML rich text). Only for text notices; max 1200 plain characters
   *               noticeType:
   *                 type: string
   *                 description: Notice type (text, image, pdf)
   *                 default: 'text'
   *               noticeAudience:
   *                 type: string
   *                 description: How recipients were chosen (company, department, manual)
   *                 default: 'manual'
   *               noticeSendMode:
   *                 type: string
   *                 description: now (send immediately), draft (save only) or scheduled (send at noticeScheduledAt)
   *                 default: 'now'
   *               noticeScheduledAt:
   *                 type: string
   *                 format: date-time
   *                 description: ISO 8601 send time, required when noticeSendMode is scheduled
   *               recipientEmployeeIds:
   *                 type: array
   *                 items:
   *                   type: number
   *                 description: Array of employee IDs to send notice to
   *               noticeFile:
   *                 type: string
   *                 format: binary
   *                 description: Body file for image or pdf notices
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *                   description: Attachments for text notices (pdf or image)
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '400':
   *         description: Business rule rejected the notice (title, detail, key)
   *       default:
   *         description: Unexpected error
   */
  async store(ctx: HttpContext) {
    const { request, response, i18n, auth } = ctx
    const t = i18n.formatMessage.bind(i18n)
    try {
      const payload = await request.validateUsing(createNoticeValidator)
      const noticeService = new NoticeService(i18n)
      const notice = this.buildInput(payload)
      const sendMode: NoticeSendModeValue = payload.noticeSendMode ?? NOTICE_SEND_MODE.NOW
      const scheduledAt =
        sendMode === NOTICE_SEND_MODE.SCHEDULED
          ? noticeService.parseScheduledAt(payload.noticeScheduledAt)
          : null
      const recipients = await noticeService.resolveRecipients(payload.recipientEmployeeIds ?? [])
      const bodyFile =
        notice.noticeType === NOTICE_TYPE.TEXT ? null : request.file(NOTICE_FILE_FIELD)

      const rejected = noticeService.verifyInfo(notice, {
        sendMode,
        scheduledAt,
        hasBodyFile: !!bodyFile,
        recipientsCount: recipients.length,
      })
      if (rejected) return this.reject(response, rejected)

      // El archivo entra al bucket ANTES de crear la fila: si el perfil lo
      // rechaza, no queda un aviso a medias.
      const uploadService = new UploadService()
      if (bodyFile) {
        notice.noticeDescription = await uploadService.fileUpload(
          bodyFile,
          NOTICE_FILE_INTAKE_PROFILE,
          NOTICE_FILE_FOLDER
        )
      }

      // La empresa del aviso sale del scope que ya resolvió `businessScope()`,
      // que este grupo sí monta. Nunca del cuerpo de la petición: quien crea no
      // elige a qué empresa pertenece lo que crea.
      const newNotice = await noticeService.create(
        notice,
        recipients,
        ctx.businessUnitScope[0],
        auth.user?.userId ?? null,
        scheduledAt
      )

      if (notice.noticeType === NOTICE_TYPE.TEXT) {
        const noticeFileService = new NoticeFileService()
        for (const file of request.files(NOTICE_ATTACHMENTS_FIELD)) {
          const fileUrl = await uploadService.fileUpload(
            file,
            NOTICE_FILE_INTAKE_PROFILE,
            NOTICE_FILE_FOLDER
          )
          await noticeFileService.create({
            noticeId: newNotice.noticeId,
            noticeFilePath: fileUrl,
          } as NoticeFile)
        }
      }

      if (sendMode === NOTICE_SEND_MODE.NOW) {
        await noticeService.sendNoticeEmails(newNotice.noticeId, false, ctx.businessUnitScope[0])
      }

      const saved = await noticeService.show(newNotice.noticeId)
      response.status(201)
      return {
        type: 'success',
        title: t('notice'),
        message:
          sendMode === NOTICE_SEND_MODE.SCHEDULED
            ? t('notice_scheduled_successfully')
            : sendMode === NOTICE_SEND_MODE.DRAFT
              ? t('notice_saved_as_draft')
              : t('resource_was_created_successfully'),
        data: { notice: saved },
      }
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(error.code === 'E_VALIDATION_ERROR' ? 422 : 500)
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
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               noticeSubject:
   *                 type: string
   *               noticeDescription:
   *                 type: string
   *               noticeType:
   *                 type: string
   *               noticeAudience:
   *                 type: string
   *               noticeSendMode:
   *                 type: string
   *                 description: now (save and send), draft (save only) or scheduled (save and schedule)
   *               noticeScheduledAt:
   *                 type: string
   *                 format: date-time
   *               recipientEmployeeIds:
   *                 type: array
   *                 items:
   *                   type: number
   *               noticeFile:
   *                 type: string
   *                 format: binary
   *                 description: Replacement body file for image or pdf notices
   *               files:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *                   description: New attachments for text notices
   *               filesDeleted:
   *                 type: array
   *                 items:
   *                   type: number
   *                   description: Notice file id to remove
   *     responses:
   *       '201':
   *         description: Resource processed successfully
   *       '400':
   *         description: Business rule rejected the notice (title, detail, key)
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

      const payload = await request.validateUsing(updateNoticeValidator)
      const noticeService = new NoticeService(i18n)
      const notice = this.buildInput(payload)
      const sendMode: NoticeSendModeValue = payload.noticeSendMode ?? NOTICE_SEND_MODE.DRAFT
      const scheduledAt =
        sendMode === NOTICE_SEND_MODE.SCHEDULED
          ? noticeService.parseScheduledAt(payload.noticeScheduledAt)
          : null
      const recipients = await noticeService.resolveRecipients(payload.recipientEmployeeIds ?? [])
      const isText = notice.noticeType === NOTICE_TYPE.TEXT
      const bodyFile = isText ? null : request.file(NOTICE_FILE_FIELD)
      // Un aviso de imagen o PDF que sigue siendo del mismo tipo conserva su
      // archivo si no llega uno nuevo.
      const keepsBodyFile =
        !isText && currentNotice.noticeType === notice.noticeType && !!currentNotice.noticeDescription

      const rejected = noticeService.verifyInfo(notice, {
        sendMode,
        scheduledAt,
        hasBodyFile: !!bodyFile || keepsBodyFile,
        recipientsCount: recipients.length,
      })
      if (rejected) return this.reject(response, rejected)

      const uploadService = new UploadService()
      const noticeFileService = new NoticeFileService()
      for (const fileDeleted of payload.filesDeleted ?? []) {
        // El identificador viene del cuerpo de la petición: la consulta se
        // acota al aviso que se esta editando, que ya paso por el filtro de
        // empresa. Sin ese `where`, un administrador podía borrar el archivo
        // de un aviso de otra empresa —y su objeto en el bucket— pasando el id.
        const noticeFile = await NoticeFile.query()
          .whereNull('notice_file_deleted_at')
          .where('notice_file_id', fileDeleted)
          .where('notice_id', noticeId)
          .first()
        if (noticeFile) {
          await noticeFileService.delete(noticeFile)
          await noticeService.deleteFileS3(noticeFile.noticeFilePath)
        }
      }

      if (!isText) {
        if (bodyFile) {
          await noticeService.deleteFileS3(currentNotice.noticeDescription)
          notice.noticeDescription = await uploadService.fileUpload(
            bodyFile,
            NOTICE_FILE_INTAKE_PROFILE,
            NOTICE_FILE_FOLDER
          )
        } else {
          notice.noticeDescription = currentNotice.noticeDescription
        }
      } else {
        if (currentNotice.noticeType !== NOTICE_TYPE.TEXT) {
          await noticeService.deleteFileS3(currentNotice.noticeDescription)
        }
        for (const file of request.files(NOTICE_ATTACHMENTS_FIELD)) {
          const fileUrl = await uploadService.fileUpload(
            file,
            NOTICE_FILE_INTAKE_PROFILE,
            NOTICE_FILE_FOLDER
          )
          await noticeFileService.create({
            noticeId,
            noticeFilePath: fileUrl,
          } as NoticeFile)
        }
      }

      await noticeService.update(currentNotice, notice, recipients, scheduledAt)

      if (sendMode === NOTICE_SEND_MODE.NOW) {
        // Si ya había salido, el correo avisa que es una actualización.
        await noticeService.sendNoticeEmails(
          noticeId,
          !!currentNotice.noticeSentAt,
          ctx.businessUnitScope[0]
        )
      }

      const saved = await noticeService.show(noticeId)
      response.status(201)
      return {
        type: 'success',
        title: t('notice'),
        message:
          sendMode === NOTICE_SEND_MODE.SCHEDULED
            ? t('notice_scheduled_successfully')
            : sendMode === NOTICE_SEND_MODE.DRAFT
              ? t('notice_saved_as_draft')
              : t('resource_was_updated_successfully'),
        data: { notice: saved },
      }
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      const messageError =
        error.code === 'E_VALIDATION_ERROR' ? error.messages[0].message : error.message
      response.status(error.code === 'E_VALIDATION_ERROR' ? 422 : 500)
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
  async show(ctx: HttpContext) {
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
      // Igual que en `index`: la presencia decide la vista, el valor lo pone
      // la sesión.
      const rawEmployeeId = request.input('employeeId')
      const employeeId = rawEmployeeId
        ? ((await resolveSessionEmployeeId(ctx)) ?? -1)
        : undefined
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
   *     summary: send (or resend) notice to recipients
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
   *               onlyUnread:
   *                 type: boolean
   *                 description: Resend only to recipients who have not confirmed reading
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
      const payload = await request.validateUsing(sendNoticeValidator)
      const noticeService = new NoticeService(i18n)
      // La empresa sale del scope que ya resolvió `businessScope()`, que este
      // grupo monta.
      const result = await noticeService.sendNotice(
        noticeId,
        ctx.businessUnitScope[0],
        payload.onlyUnread === true
      )
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
   * /api/notices/{noticeId}/duplicate:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Notices
   *     summary: create a draft copy of a notice (content, audience, recipients and files)
   *     parameters:
   *       - in: path
   *         name: noticeId
   *         schema:
   *           type: number
   *         description: Notice id
   *         required: true
   *     responses:
   *       '201':
   *         description: Draft copy created
   *       '404':
   *         description: Notice not found
   *       default:
   *         description: Unexpected error
   */
  async duplicate(ctx: HttpContext) {
    const { request, response, i18n, auth } = ctx
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
      const source = await Notice.query()
        .whereNull('notice_deleted_at')
        .where('notice_id', noticeId)
        .first()
      if (!source) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('notice') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('notice') }),
          data: { noticeId },
        }
      }
      const noticeService = new NoticeService(i18n)
      const copy = await noticeService.duplicate(source, auth.user?.userId ?? null)
      const saved = await noticeService.show(copy.noticeId)
      response.status(201)
      return {
        type: 'success',
        title: t('notice'),
        message: t('notice_duplicated_successfully'),
        data: { notice: saved },
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
  async markAsRead(ctx: HttpContext) {
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
      // Deja de leer el query: marcar como leído es siempre sobre lo propio.
      // Antes esto era una escritura IDOR — con el token de cualquiera se podía
      // marcar como leído el aviso de otro.
      const employeeId = await resolveSessionEmployeeId(ctx)
      if (!employeeId) {
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
