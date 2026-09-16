import { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import { resolveSessionEmployeeId } from '#helpers/resolve_session_employee_id'
import { sanitizeNoticeHtml } from '#helpers/sanitize_notice_content'
import Notice from '#models/notice'
import NoticeService, {
  type NoticeInput,
  type NoticeRecipientCriteria,
  type NoticeValidationError,
} from '#services/notice_service'
import { ensureSecondaryPermission } from '#helpers/permission_gate_secondary'
import {
  resolveEmployeeRoleScope,
  type EmployeeRoleScope,
} from '#helpers/resolve_employee_role_scope'
import { NOTICES_READ_PERMISSION_DECLARATIONS } from '#constants/notices_permission_declarations'
import {
  createNoticeValidator,
  sendNoticeValidator,
  updateNoticeValidator,
} from '#validators/notice'
import UploadService from '#services/upload_service'
import type { IncomingFile } from '#services/file_intake_service'
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
  isNoticeTypeValue,
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

/** Traductor ligado a la petición (`i18n.formatMessage`). */
type Translate = (key: string, data?: Record<string, string | number>) => string

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
      // Sin colaborador es el buzón de administración: exige el permiso de
      // lectura del módulo. No va en el router porque la ruta se comparte con
      // la app, que se identifica por su fila de destinatario y no por permiso.
      if (employeeId === undefined) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          NOTICES_READ_PERMISSION_DECLARATIONS.index
        )
        if (!allowed) return
      }
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
        noticeType: isNoticeTypeValue(noticeType) ? noticeType : undefined,
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
   * El departamento y el puesto solo se persisten con el público `department`.
   */
  private buildInput(payload: {
    noticeSubject: string
    noticeDescription?: string
    noticeType?: NoticeTypeValue
    noticeAudience?: NoticeAudienceValue
    departmentId?: number | null
    positionId?: number | null
  }): NoticeInput {
    const noticeType = payload.noticeType ?? NOTICE_TYPE.TEXT
    const noticeAudience = payload.noticeAudience ?? NOTICE_AUDIENCE.MANUAL
    const byDepartment = noticeAudience === NOTICE_AUDIENCE.DEPARTMENT
    return {
      noticeSubject: payload.noticeSubject.trim(),
      noticeDescription:
        noticeType === NOTICE_TYPE.TEXT ? sanitizeNoticeHtml(payload.noticeDescription) : '',
      noticeType,
      noticeAudience,
      noticeDepartmentId: byDepartment ? (payload.departmentId ?? null) : null,
      noticePositionId: byDepartment ? (payload.positionId ?? null) : null,
    }
  }

  /**
   * Criterio de destinatarios: el público del aviso más los ids del cuerpo,
   * que solo cuentan para `manual`. `company` y `department` los resuelve el
   * servidor.
   */
  private criteriaOf(
    notice: NoticeInput,
    recipientEmployeeIds: number[] | undefined
  ): NoticeRecipientCriteria {
    return {
      audience: notice.noticeAudience,
      departmentId: notice.noticeDepartmentId,
      positionId: notice.noticePositionId,
      recipientEmployeeIds: recipientEmployeeIds ?? [],
    }
  }

  /** Mensaje del guardado según lo que hizo con el aviso. */
  private saveMessage(
    t: Translate,
    sendMode: NoticeSendModeValue,
    dispatched: number,
    savedMessage: string
  ): string {
    if (sendMode === NOTICE_SEND_MODE.SCHEDULED) return t('notice_scheduled_successfully')
    if (sendMode === NOTICE_SEND_MODE.DRAFT) return t('notice_saved_as_draft')
    if (sendMode === NOTICE_SEND_MODE.NOW) return t('notice_send_dispatched', { count: dispatched })
    return savedMessage
  }

  /**
   * Alcance de colaboradores del usuario de la sesión, con la regla del
   * listado de empleados. El público `company` y `department` se resuelve con
   * él: el compositor cuenta y lista con ese mismo recorte, así que el número
   * que promete es el que sale.
   */
  private async roleScopeOf(ctx: HttpContext): Promise<EmployeeRoleScope | null> {
    const userId = ctx.auth.user?.userId
    return userId ? resolveEmployeeRoleScope(userId, ctx.i18n) : null
  }

  /**
   * Sube los adjuntos y devuelve sus keys. Si el perfil rechaza uno, los ya
   * subidos en esta misma petición se borran antes de relanzar: no quedan
   * objetos huérfanos ni filas a medias. Las filas se crean después, cuando
   * el aviso ya está guardado.
   */
  private async uploadAttachments(
    files: IncomingFile[],
    uploadService: UploadService,
    noticeService: NoticeService
  ): Promise<string[]> {
    const keys: string[] = []
    for (const file of files) {
      try {
        keys.push(
          await uploadService.fileUpload(file, NOTICE_FILE_INTAKE_PROFILE, NOTICE_FILE_FOLDER)
        )
      } catch (error) {
        for (const key of keys) {
          await noticeService.deleteStoredFile(key)
        }
        throw error
      }
    }
    return keys
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
   *                 description: now (send immediately), draft (save only; the subject is enough) or scheduled (send at noticeScheduledAt)
   *                 default: 'now'
   *               departmentId:
   *                 type: number
   *                 description: Department criterion when noticeAudience is department. Recipients for company and department are resolved server-side within the role scope of the author (same rule as the employees list); a department outside that scope is rejected with key departamento-fuera-de-alcance
   *               positionId:
   *                 type: number
   *                 description: Optional position criterion when noticeAudience is department
   *               noticeScheduledAt:
   *                 type: string
   *                 format: date-time
   *                 description: ISO 8601 send time, required when noticeSendMode is scheduled
   *               recipientEmployeeIds:
   *                 type: array
   *                 items:
   *                   type: number
   *                 description: Employee IDs when noticeAudience is manual (ignored otherwise)
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
   *         description: Notice saved. data.dispatched is how many recipients the send was dispatched to (0 unless noticeSendMode is now); the send itself runs in the background
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
      // La empresa del aviso sale del scope que ya resolvió `businessScope()`,
      // que este grupo sí monta. Nunca del cuerpo de la petición: quien crea no
      // elige a qué empresa pertenece lo que crea.
      const businessUnitId = ctx.businessUnitScope[0]
      const criteria = this.criteriaOf(notice, payload.recipientEmployeeIds)
      const roleScope = await this.roleScopeOf(ctx)
      const outOfScope = noticeService.verifyAudienceScope(criteria, roleScope)
      if (outOfScope) return this.reject(response, outOfScope)
      const recipients = await noticeService.resolveRecipientsByCriteria(
        criteria,
        businessUnitId,
        roleScope
      )
      const isText = notice.noticeType === NOTICE_TYPE.TEXT
      const bodyFile = isText ? null : request.file(NOTICE_FILE_FIELD)

      const rejected = noticeService.verifyInfo(notice, {
        sendMode,
        scheduledAt,
        hasBodyFile: !!bodyFile,
        recipientsCount: recipients.length,
        isSent: false,
      })
      if (rejected) return this.reject(response, rejected)

      // Los archivos entran al bucket ANTES de crear la fila: si el perfil
      // rechaza uno, no queda un aviso a medias.
      const uploadService = new UploadService()
      if (bodyFile) {
        notice.noticeDescription = await uploadService.fileUpload(
          bodyFile,
          NOTICE_FILE_INTAKE_PROFILE,
          NOTICE_FILE_FOLDER
        )
      }
      const attachmentKeys = isText
        ? await this.uploadAttachments(
            request.files(NOTICE_ATTACHMENTS_FIELD),
            uploadService,
            noticeService
          )
        : []

      const newNotice = await noticeService.create(
        notice,
        recipients,
        businessUnitId,
        auth.user?.userId ?? null,
        scheduledAt
      )

      const noticeFileService = new NoticeFileService()
      for (const noticeFilePath of attachmentKeys) {
        await noticeFileService.create({
          noticeId: newNotice.noticeId,
          noticeFilePath,
        } as NoticeFile)
      }

      // El envío no bloquea la petición: se despacha y la respuesta vuelve con
      // cuántos destinatarios recibirán el aviso.
      const dispatched =
        sendMode === NOTICE_SEND_MODE.NOW
          ? await noticeService.dispatchSend(newNotice, { businessUnitId })
          : 0

      const saved = await noticeService.show(newNotice.noticeId)
      response.status(201)
      return {
        type: 'success',
        title: t('notice'),
        message: this.saveMessage(t, sendMode, dispatched, t('resource_was_created_successfully')),
        data: { notice: saved, dispatched },
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
   *                 description: now (save and send), draft (save only), scheduled (save and schedule) or update (save without resending). Once the notice was sent only update and now are accepted (400 aviso-ya-enviado otherwise)
   *               departmentId:
   *                 type: number
   *                 description: Department criterion when noticeAudience is department
   *               positionId:
   *                 type: number
   *                 description: Optional position criterion when noticeAudience is department
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
      const isSent = !!currentNotice.noticeSentAt
      // Sin modo explícito, un enviado se guarda sin reenviar y el resto queda
      // en borrador: el valor seguro de cada estado.
      const sendMode: NoticeSendModeValue =
        payload.noticeSendMode ?? (isSent ? NOTICE_SEND_MODE.UPDATE : NOTICE_SEND_MODE.DRAFT)
      const scheduledAt =
        sendMode === NOTICE_SEND_MODE.SCHEDULED
          ? noticeService.parseScheduledAt(payload.noticeScheduledAt)
          : null
      const businessUnitId = ctx.businessUnitScope[0]
      const criteria = this.criteriaOf(notice, payload.recipientEmployeeIds)
      const roleScope = await this.roleScopeOf(ctx)
      const outOfScope = noticeService.verifyAudienceScope(criteria, roleScope)
      if (outOfScope) return this.reject(response, outOfScope)
      const recipients = await noticeService.resolveRecipientsByCriteria(
        criteria,
        businessUnitId,
        roleScope
      )
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
        isSent,
      })
      if (rejected) return this.reject(response, rejected)

      // Orden: subir -> persistir -> borrar lo anterior. Si el perfil rechaza
      // un archivo (422) o falla el guardado, el aviso sigue apuntando a
      // objetos que existen. Borrar antes dejaba una key colgante: `body-file`
      // en 404 y el correo sin adjunto.
      const uploadService = new UploadService()
      const noticeFileService = new NoticeFileService()
      let previousBodyKey: string | null = null
      if (!isText) {
        if (bodyFile) {
          previousBodyKey = currentNotice.noticeDescription
          notice.noticeDescription = await uploadService.fileUpload(
            bodyFile,
            NOTICE_FILE_INTAKE_PROFILE,
            NOTICE_FILE_FOLDER
          )
        } else {
          notice.noticeDescription = currentNotice.noticeDescription
        }
      } else if (currentNotice.noticeType !== NOTICE_TYPE.TEXT) {
        // Pasa de imagen o PDF a texto: el cuerpo anterior sobra, pero solo se
        // borra cuando el cambio de tipo ya quedó guardado.
        previousBodyKey = currentNotice.noticeDescription
      }
      const attachmentKeys = isText
        ? await this.uploadAttachments(
            request.files(NOTICE_ATTACHMENTS_FIELD),
            uploadService,
            noticeService
          )
        : []

      await noticeService.update(currentNotice, notice, recipients, scheduledAt)

      for (const noticeFilePath of attachmentKeys) {
        await noticeFileService.create({ noticeId, noticeFilePath } as NoticeFile)
      }

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
          await noticeService.deleteStoredFile(noticeFile.noticeFilePath)
        }
      }

      if (previousBodyKey && previousBodyKey !== notice.noticeDescription) {
        await noticeService.deleteStoredFile(previousBodyKey)
      }

      // Si ya había salido, el correo avisa que es una actualización. El envío
      // no bloquea la petición.
      const dispatched =
        sendMode === NOTICE_SEND_MODE.NOW
          ? await noticeService.dispatchSend(currentNotice, { businessUnitId, isUpdate: isSent })
          : 0

      const saved = await noticeService.show(noticeId)
      response.status(201)
      return {
        type: 'success',
        title: t('notice'),
        message: this.saveMessage(t, sendMode, dispatched, t('resource_was_updated_successfully')),
        data: { notice: saved, dispatched },
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
      // Misma regla que en `index`: la rama de administración exige el permiso
      // de lectura del módulo.
      if (employeeId === undefined) {
        const allowed = await ensureSecondaryPermission(
          ctx,
          NOTICES_READ_PERMISSION_DECLARATIONS.show
        )
        if (!allowed) return
      }
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
   *                 description: Resend only to recipients who have not opened the notice
   *     responses:
   *       '200':
   *         description: Send dispatched in the background. data.dispatched is how many recipients (still in the current audience) will receive it; a resend of an already sent notice updates noticeLastResentAt
   *       '400':
   *         description: The notice was never sent and is incomplete (title, detail, key as in store with noticeSendMode now)
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
      const notice = await Notice.query()
        .whereNull('notice_deleted_at')
        .where('notice_id', noticeId)
        .first()
      if (!notice) {
        response.status(404)
        return {
          type: 'warning',
          title: t('entity_was_not_found', { entity: t('notice') }),
          message: t('entity_was_not_found_with_entered_id', { entity: t('notice') }),
          data: { noticeId },
        }
      }
      const payload = await request.validateUsing(sendNoticeValidator)
      const noticeService = new NoticeService(i18n)
      // Primer envío de un borrador: el público por criterio se vuelve a
      // resolver con la plantilla de hoy, igual que hace el programado.
      if (!notice.noticeSentAt) await noticeService.refreshCriteriaRecipients(notice)
      // Un borrador solo exige asunto al guardarse; para salir tiene que estar
      // completo, con las mismas reglas que `now`.
      const incomplete = await noticeService.verifyDispatchable(notice)
      if (incomplete) return this.reject(response, incomplete)
      // La empresa sale del scope que ya resolvió `businessScope()`, que este
      // grupo monta. El envío se despacha sin bloquear la petición; sobre un
      // aviso ya enviado actualiza `noticeLastResentAt`.
      const dispatched = await noticeService.dispatchSend(notice, {
        businessUnitId: ctx.businessUnitScope[0],
        onlyUnread: payload.onlyUnread === true,
      })
      const saved = await noticeService.show(noticeId)
      response.status(200)
      return {
        type: 'success',
        title: t('notice'),
        message: t('notice_send_dispatched', { count: dispatched }),
        data: { notice: saved, dispatched },
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
