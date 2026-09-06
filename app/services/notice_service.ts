import Notice from '#models/notice'
import { resolvePublicAssetUrl } from '#helpers/public_asset_url'
import NoticeRecipient from '#models/notice_recipient'
import NoticeFile from '#models/notice_file'
import Employee from '#models/employee'
import { I18n } from '@adonisjs/i18n'
import i18nManager from '@adonisjs/i18n/services/main'
import { DateTime } from 'luxon'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import SystemSettingService from '#services/system_setting_service'
import SystemSetting from '#models/system_setting'
import { SystemSettingResolutionError } from '../exceptions/system_setting_resolution_error.js'
import UploadService from '#services/upload_service'
import path from 'node:path'
import Env from '#start/env'
import UserFcmToken from '#models/user_fcm_token'
import admin from '../../config/firebase.js'
import { noticePlainTextLength } from '#helpers/sanitize_notice_content'
import { resolveMailLocale } from '#constants/mail_locale'
import { MAIL_BRAND_LOGO_URL, MAIL_BRAND_TRADE_NAME, MAIL_TIME_ZONE } from '#constants/mail_branding'
import {
  NOTICE_AUDIENCE,
  NOTICE_DUPLICATE_SUBJECT_SUFFIX,
  NOTICE_FILE_FOLDER,
  NOTICE_FILE_INTAKE_PROFILE,
  NOTICE_MESSAGE_MAX_LENGTH,
  NOTICE_SEND_MODE,
  NOTICE_STATUS,
  NOTICE_TYPE,
  type NoticeAudienceValue,
  type NoticeSendModeValue,
  type NoticeStatusValue,
  type NoticeTypeValue,
} from '#constants/notice'

// Lista de desarrollo para pruebas - solo estos emails recibirán notificaciones en desarrollo
const DEVELOPMENT_EMAIL_LIST = [
  'jsoto@gruposti.com',
  //'rogelio.jinestas@gmail.com',
  'wramirez@siler-mx.com',
  'wilvardo@gmail.com'
]

/**
 * Lo que este servicio necesita de la sub-consulta de destinatarios.
 *
 * Contrato estructural y no el tipo de Lucid porque `whereHas` y `preload`
 * entregan builders DISTINTOS —`RelationSubQueryBuilderContract` y
 * `HasManyQueryBuilderContract`— y no hay un supertipo común que los cubra. Con
 * las dos operaciones que de verdad se usan, el mismo callback sirve a ambos y
 * el archivo se queda sin `any`, que es regla del repo.
 */
interface NoticeRecipientQuery {
  whereNull(column: string): NoticeRecipientQuery
  where(column: string, value: string | number | boolean): NoticeRecipientQuery
}

/** Filtros del listado. Los del backoffice son opcionales; el de la app es `employeeId`. */
export interface NoticeIndexFilters {
  search?: string
  page: number
  limit: number
  employeeId?: number
  readStatus?: 'all' | 'read' | 'unread'
  status?: NoticeStatusValue
  audience?: NoticeAudienceValue
  noticeType?: NoticeTypeValue
  /** Fecha `YYYY-MM-DD` inclusive, sobre la fecha relevante del aviso. */
  dateFrom?: string
  dateTo?: string
}

/**
 * Conteos del buzón para las carpetas y las etiquetas de público. Respetan la
 * búsqueda pero no el resto de filtros: son el "cuántos hay" de cada carpeta.
 */
export interface NoticeCounts {
  total: number
  status: Record<NoticeStatusValue, number>
  audience: Record<NoticeAudienceValue, number>
}

/** Datos del aviso tal como llegan del cliente, ya validados por Vine. */
export interface NoticeInput {
  noticeSubject: string
  noticeDescription: string
  noticeType: NoticeTypeValue
  noticeAudience: NoticeAudienceValue
}

/** Contexto que decide qué reglas de negocio aplican al guardar. */
export interface NoticeVerifyContext {
  sendMode: NoticeSendModeValue
  scheduledAt: DateTime | null
  /** `true` si el aviso de imagen o PDF tiene archivo, nuevo o ya guardado. */
  hasBodyFile: boolean
  recipientsCount: number
}

/** Rechazo de negocio con el triplete del estándar. */
export interface NoticeValidationError {
  status: number
  title: string
  detail: string
  key: string
}

interface ResolvedRecipient {
  employeeId: number
  employeeEmail: string
  employeeName: string | null
}

/** Nombres de departamento y puesto de un colaborador, para el seguimiento de lectura. */
interface RecipientOrgRow {
  employee_id: number
  department_name: string | null
  position_name: string | null
}

/** Fila cruda del agregado de conteos. */
interface NoticeCountsRow {
  total: number | string | null
  sent_count: number | string | null
  scheduled_count: number | string | null
  draft_count: number | string | null
  company_count: number | string | null
  department_count: number | string | null
  manual_count: number | string | null
}

/** Salida de un comando: mismo contrato que los otros barridos agendados. */
export interface NoticeSchedulerLogger {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

export interface SendScheduledResult {
  dueCount: number
  sentCount: number
  failedCount: number
}

/**
 * Fecha por la que el buzón ordena y filtra: la de envío si ya salió, la
 * agendada si está programado, y la de creación para un borrador. Es la
 * misma fecha que el backoffice pinta en cada fila.
 */
const RELEVANT_DATE_SQL = 'COALESCE(notice_sent_at, notice_scheduled_at, notice_created_at)'

/** Content-ID con el que la imagen del aviso se incrusta en el correo. */
const NOTICE_MAIL_IMAGE_CID = 'notice-image'

export default class NoticeService {
  private t: (key: string, params?: { [key: string]: string | number }) => string
  private i18n: I18n

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
    this.i18n = i18n
  }

  /**
   * Aplica el filtro de estado sobre las dos columnas de las que se deriva.
   */
  private applyStatusFilter(
    query: ModelQueryBuilderContract<typeof Notice>,
    status: NoticeStatusValue
  ): void {
    if (status === NOTICE_STATUS.SENT) {
      query.whereNotNull('notice_sent_at')
      return
    }
    if (status === NOTICE_STATUS.SCHEDULED) {
      query.whereNull('notice_sent_at')
      query.whereNotNull('notice_scheduled_at')
      return
    }
    query.whereNull('notice_sent_at')
    query.whereNull('notice_scheduled_at')
  }

  async index(filters: NoticeIndexFilters) {
    const selectedColumns = [
      'notice_id',
      'business_unit_id',
      'notice_subject',
      'notice_description',
      'notice_sent_count',
      'notice_sent_at',
      'notice_scheduled_at',
      'notice_created_by_user_id',
      'notice_audience',
      'notice_created_at',
      // `notice_updated_at` decide si un detalle guardado en el aparato sigue
      // sirviendo, sin pedir los avisos uno por uno.
      'notice_updated_at',
      // `notice_type` es obligatorio para el computed del cuerpo-archivo. Sin
      // él, el aviso saldría bien en el detalle y mal en el listado, sin un
      // solo error visible.
      'notice_type',
      // Sale `notice_recipient_emails`: es un longtext con los correos de TODOS
      // los destinatarios, domina el tamaño del payload y ningún cliente lo
      // parsea. Con el caché en el aparato del trabajador, además, eran los
      // correos de toda la plantilla en el disco de cada teléfono.
    ]

    let query = Notice.query()
      .whereNull('notice_deleted_at')
      // El contador de destinatarios que el BO pintaba con la longitud de la
      // lista de correos, ahora contado en el servidor.
      .withCount('recipients', (recipientQuery) => {
        recipientQuery.whereNull('notice_recipient_deleted_at')
      })
      .withCount('recipients', (recipientQuery) => {
        recipientQuery
          .whereNull('notice_recipient_deleted_at')
          .where('notice_recipient_read', true)
          .as('recipients_read_count')
      })
      .if(filters.search, (q) => {
        q.whereRaw('UPPER(notice_subject) LIKE ?', [`%${filters.search!.toUpperCase()}%`])
      })
      .if(filters.status, (q) => this.applyStatusFilter(q, filters.status!))
      .if(filters.audience, (q) => q.where('notice_audience', filters.audience!))
      .if(filters.noticeType, (q) => q.where('notice_type', filters.noticeType!))
      .if(filters.dateFrom, (q) => q.whereRaw(`${RELEVANT_DATE_SQL} >= ?`, [`${filters.dateFrom} 00:00:00`]))
      .if(filters.dateTo, (q) => q.whereRaw(`${RELEVANT_DATE_SQL} <= ?`, [`${filters.dateTo} 23:59:59`]))
      .preload('files')
      // El autor solo importa en el buzón del backoffice; la app no lo pinta.
      .if(!filters.employeeId, (q) => this.preloadCreator(q))

    // El corte por empresa lo hace el mixin del modelo con el TenantContext que
    // deja `businessScope()`, que estas rutas ya montan. El filtro explícito que
    // hubo aquí sobra desde que la columna es obligatoria: no quedan avisos sin
    // empresa que hubiera que dejar pasar aparte.

    // Si se proporciona employeeId, filtrar por notice_recipients y hacer preload
    if (filters.employeeId) {
      const baseRecipientQuery = (recipientSubQuery: NoticeRecipientQuery) => {
        recipientSubQuery
          .whereNull('notice_recipient_deleted_at')
          .where('employee_id', filters.employeeId!)
      }

      // Filtrar por estado de lectura si se proporciona
      if (filters.readStatus === 'read') {
        query = query
          .whereHas('recipients', (recipientSubQuery) => {
            baseRecipientQuery(recipientSubQuery)
            recipientSubQuery.where('notice_recipient_read', true)
          })
          .preload('recipients', (recipientSubQuery) => {
            baseRecipientQuery(recipientSubQuery)
            recipientSubQuery.where('notice_recipient_read', true)
          })
      } else if (filters.readStatus === 'unread') {
        query = query
          .whereHas('recipients', (recipientSubQuery) => {
            baseRecipientQuery(recipientSubQuery)
            recipientSubQuery.where('notice_recipient_read', false)
          })
          .preload('recipients', (recipientSubQuery) => {
            baseRecipientQuery(recipientSubQuery)
            recipientSubQuery.where('notice_recipient_read', false)
          })
      } else {
        // Sin filtro de lectura, mostrar todos
        query = query
          .whereHas('recipients', baseRecipientQuery)
          .preload('recipients', baseRecipientQuery)
      }
    }

    const notices = await query
      .select(selectedColumns)
      // La app conserva el orden por alta; el buzón ordena por la fecha que
      // pinta en cada fila (envío, agenda o edición).
      .if(
        !!filters.employeeId,
        (q) => q.orderBy('notice_created_at', 'desc'),
        (q) => q.orderByRaw(`${RELEVANT_DATE_SQL} DESC`)
      )
      .paginate(filters.page, filters.limit)

    return notices
  }

  /**
   * Conteos por carpeta y por público para el buzón. Solo respetan la
   * búsqueda: las carpetas dicen cuántos avisos hay en cada una, no cuántos
   * pasan el filtro activo.
   */
  async counts(search?: string): Promise<NoticeCounts> {
    // Sin `.pojo()`: Lucid solo corre los hooks `before:fetch` —y con ellos el
    // corte por empresa del mixin— cuando envuelve el resultado en el modelo.
    // Con `pojo()` los conteos saldrían de TODAS las empresas. Los agregados
    // quedan en `$extras` de la instancia.
    const row = await Notice.query()
      .whereNull('notice_deleted_at')
      .if(search, (q) => {
        q.whereRaw('UPPER(notice_subject) LIKE ?', [`%${search!.toUpperCase()}%`])
      })
      .select(
        db.raw('COUNT(*) AS total'),
        db.raw('SUM(notice_sent_at IS NOT NULL) AS sent_count'),
        db.raw(
          'SUM(notice_sent_at IS NULL AND notice_scheduled_at IS NOT NULL) AS scheduled_count'
        ),
        db.raw('SUM(notice_sent_at IS NULL AND notice_scheduled_at IS NULL) AS draft_count'),
        db.raw(`SUM(notice_audience = '${NOTICE_AUDIENCE.COMPANY}') AS company_count`),
        db.raw(`SUM(notice_audience = '${NOTICE_AUDIENCE.DEPARTMENT}') AS department_count`),
        db.raw(`SUM(notice_audience = '${NOTICE_AUDIENCE.MANUAL}') AS manual_count`)
      )
      .first()

    const extras = (row?.$extras ?? {}) as Partial<NoticeCountsRow>
    const toNumber = (value: number | string | null | undefined): number => Number(value ?? 0)

    return {
      total: toNumber(extras.total),
      status: {
        [NOTICE_STATUS.SENT]: toNumber(extras.sent_count),
        [NOTICE_STATUS.SCHEDULED]: toNumber(extras.scheduled_count),
        [NOTICE_STATUS.DRAFT]: toNumber(extras.draft_count),
      },
      audience: {
        [NOTICE_AUDIENCE.COMPANY]: toNumber(extras.company_count),
        [NOTICE_AUDIENCE.DEPARTMENT]: toNumber(extras.department_count),
        [NOTICE_AUDIENCE.MANUAL]: toNumber(extras.manual_count),
      },
    }
  }

  /**
   * Precarga lo mínimo del autor para armar `noticeAuthorName`: el usuario y
   * las tres partes del nombre de su persona. Nada más sale del usuario.
   */
  private preloadCreator(query: ModelQueryBuilderContract<typeof Notice>): void {
    query.preload('creator', (creatorQuery) => {
      creatorQuery.select(['user_id', 'person_id']).preload('person', (personQuery) => {
        personQuery.select([
          'person_id',
          'person_firstname',
          'person_lastname',
          'person_second_lastname',
        ])
      })
    })
  }

  /**
   * Obtiene el conteo de avisos no leídos para un empleado
   */
  async getUnreadCount(employeeId: number): Promise<number> {
    const count = await Notice.query()
      .whereNull('notice_deleted_at')
      .whereHas('recipients', (recipientQuery) => {
        recipientQuery
          .whereNull('notice_recipient_deleted_at')
          .where('employee_id', employeeId)
          .where('notice_recipient_read', false)
      })
      .count('* as total')

    return Number(count[0]?.$extras.total || 0)
  }

  /**
   * Misma jerarquía que la consulta de empleados con `getMails`:
   * correo de usuario > correo de empresa > correo personal.
   */
  private resolveRecipientEmailLikeGetMails(employee: Employee): string {
    const userEmail = employee.person?.user?.userEmail?.trim()
    if (userEmail) {
      return userEmail
    }
    const businessEmail = employee.employeeBusinessEmail?.trim()
    if (businessEmail) {
      return businessEmail
    }
    const personalEmail = employee.person?.personEmail?.trim()
    return personalEmail || ''
  }

  /**
   * Convierte ids de colaborador en destinatarios con correo efectivo. Los que
   * no tienen ningún correo se descartan: no hay a dónde enviarles.
   */
  async resolveRecipients(recipientEmployeeIds: number[]): Promise<ResolvedRecipient[]> {
    const uniqueIds = [...new Set(recipientEmployeeIds.filter((id) => Number.isInteger(id) && id > 0))]
    if (uniqueIds.length === 0) return []

    const employees = await Employee.query()
      .whereNull('employee_deleted_at')
      .whereIn('employee_id', uniqueIds)
      .preload('person', (personQuery) => {
        personQuery.preload('user')
      })

    const recipients: ResolvedRecipient[] = []
    for (const employee of employees) {
      const email = this.resolveRecipientEmailLikeGetMails(employee).trim()
      if (!email) {
        continue
      }
      recipients.push({
        employeeId: employee.employeeId,
        employeeEmail: email,
        employeeName:
          `${employee.employeeFirstName || ''} ${employee.employeeLastName || ''} ${employee.employeeSecondLastName || ''}`.trim() ||
          null,
      })
    }
    return recipients
  }

  /**
   * Reglas de negocio del guardado. Vine ya validó forma y catálogos; aquí va
   * lo que depende de varios campos a la vez.
   */
  verifyInfo(notice: NoticeInput, context: NoticeVerifyContext): NoticeValidationError | null {
    const title = this.t('notice_validation_title')
    const reject = (detail: string, key: string): NoticeValidationError => ({
      status: 400,
      title,
      detail,
      key,
    })

    if (!notice.noticeSubject || notice.noticeSubject.trim() === '') {
      return reject(this.t('notice_subject_is_required'), 'aviso-asunto-requerido')
    }

    if (notice.noticeType === NOTICE_TYPE.TEXT) {
      const length = noticePlainTextLength(notice.noticeDescription)
      if (length === 0) {
        return reject(this.t('notice_description_is_required'), 'aviso-mensaje-requerido')
      }
      if (length > NOTICE_MESSAGE_MAX_LENGTH) {
        return reject(
          this.t('notice_message_too_long', { max: NOTICE_MESSAGE_MAX_LENGTH }),
          'aviso-mensaje-demasiado-largo'
        )
      }
    } else if (!context.hasBodyFile) {
      return reject(this.t('notice_file_is_required'), 'aviso-archivo-requerido')
    }

    if (context.sendMode !== NOTICE_SEND_MODE.DRAFT && context.recipientsCount === 0) {
      return reject(this.t('notice_recipients_are_required'), 'aviso-destinatarios-requeridos')
    }

    if (context.sendMode === NOTICE_SEND_MODE.SCHEDULED) {
      if (!context.scheduledAt) {
        return reject(this.t('notice_scheduled_at_is_required'), 'aviso-fecha-envio-requerida')
      }
      // Un minuto de gracia: el usuario elige la hora sin segundos y el reloj
      // del navegador no va exacto con el del servidor.
      if (context.scheduledAt <= DateTime.now().minus({ minutes: 1 })) {
        return reject(
          this.t('notice_scheduled_at_must_be_future'),
          'aviso-fecha-envio-debe-ser-futura'
        )
      }
    }

    return null
  }

  /**
   * Interpreta la fecha de envío que manda el cliente (ISO 8601 con zona).
   * `null` si no viene o no es una fecha.
   */
  parseScheduledAt(raw: string | undefined | null): DateTime | null {
    if (!raw || !raw.trim()) return null
    const parsed = DateTime.fromISO(raw.trim())
    return parsed.isValid ? parsed : null
  }

  /**
   * @param businessUnitId empresa a la que pertenece el aviso. **Obligatorio.**
   *   Hasta ahora no se asignaba y cada aviso nacía sin empresa: invisible para
   *   el filtro de tenant —ni se podía editar ni borrar— y, con el corte de
   *   lectura, visible para todas. No eran avisos legacy: eran todos.
   * @param createdByUserId quién redacta. Se muestra como autor en el buzón.
   */
  async create(
    notice: NoticeInput,
    recipients: ResolvedRecipient[],
    businessUnitId: number,
    createdByUserId: number | null,
    scheduledAt: DateTime | null
  ) {
    const newNotice = new Notice()
    newNotice.businessUnitId = businessUnitId
    newNotice.noticeSubject = notice.noticeSubject
    newNotice.noticeDescription = notice.noticeDescription
    newNotice.noticeType = notice.noticeType
    newNotice.noticeAudience = notice.noticeAudience
    newNotice.noticeSentCount = 0
    newNotice.noticeSentAt = null
    newNotice.noticeScheduledAt = scheduledAt
    newNotice.noticeCreatedByUserId = createdByUserId
    newNotice.noticeRecipientEmails = JSON.stringify(recipients.map((r) => r.employeeEmail))

    await newNotice.save()

    for (const recipient of recipients) {
      await this.createRecipient(newNotice.noticeId, recipient)
    }

    return newNotice
  }

  private async createRecipient(noticeId: number, recipient: ResolvedRecipient): Promise<void> {
    const noticeRecipient = new NoticeRecipient()
    noticeRecipient.noticeId = noticeId
    noticeRecipient.employeeId = recipient.employeeId
    noticeRecipient.employeeEmail = recipient.employeeEmail
    noticeRecipient.employeeName = recipient.employeeName
    noticeRecipient.noticeRecipientSent = false
    noticeRecipient.noticeRecipientSentAt = null
    noticeRecipient.noticeRecipientRead = false
    noticeRecipient.noticeRecipientReadAt = null
    noticeRecipient.noticeRecipientError = null
    await noticeRecipient.save()
  }

  /**
   * Deja la lista de destinatarios igual a la recibida: agrega los que faltan y
   * da de baja los que ya no están. Los que se conservan mantienen su
   * seguimiento de lectura, que es lo que un reemplazo completo perdería.
   */
  private async syncRecipients(notice: Notice, recipients: ResolvedRecipient[]): Promise<void> {
    const existing = await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', notice.noticeId)

    const wantedIds = new Set(recipients.map((r) => r.employeeId))

    for (const current of existing) {
      if (current.employeeId === null || !wantedIds.has(current.employeeId)) {
        await current.delete()
      }
    }

    const existingIds = new Set(
      existing.filter((r) => r.employeeId !== null && wantedIds.has(r.employeeId)).map((r) => r.employeeId)
    )
    for (const recipient of recipients) {
      if (!existingIds.has(recipient.employeeId)) {
        await this.createRecipient(notice.noticeId, recipient)
      }
    }

    notice.noticeRecipientEmails = JSON.stringify(recipients.map((r) => r.employeeEmail))
    await notice.save()
  }

  async update(
    currentNotice: Notice,
    notice: NoticeInput,
    recipients: ResolvedRecipient[],
    scheduledAt: DateTime | null
  ) {
    currentNotice.noticeSubject = notice.noticeSubject
    currentNotice.noticeDescription = notice.noticeDescription
    currentNotice.noticeType = notice.noticeType
    currentNotice.noticeAudience = notice.noticeAudience
    currentNotice.noticeScheduledAt = scheduledAt
    await currentNotice.save()

    await this.syncRecipients(currentNotice, recipients)

    return currentNotice
  }

  async delete(currentNotice: Notice) {
    // Eliminar destinatarios relacionados
    await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', currentNotice.noticeId)
      .delete()
    await currentNotice.delete()
    return currentNotice
  }

  /**
   * Detalle de un aviso.
   *
   * Con `employeeId` (vista de la app) solo viaja el destinatario propio. Sin
   * él (vista de administración) viajan todos, con su departamento y puesto
   * para el seguimiento de lectura, más el autor y los conteos.
   */
  async show(noticeId: number, employeeId?: number) {
    let query = Notice.query()
      .whereNull('notice_deleted_at')
      .where('notice_id', noticeId)
      .preload('files')

    // Si se proporciona employeeId, filtrar el preload de recipients
    if (employeeId) {
      query = query.preload('recipients', (recipientQuery) => {
        recipientQuery
          .whereNull('notice_recipient_deleted_at')
          .where('employee_id', employeeId)
      })
      const notice = await query.first()
      return notice ? notice.serialize() : null
    }

    query = query
      .preload('recipients', (recipientQuery) => {
        recipientQuery.whereNull('notice_recipient_deleted_at').orderBy('employee_name', 'asc')
      })
      .withCount('recipients', (recipientQuery) => {
        recipientQuery.whereNull('notice_recipient_deleted_at')
      })
      .withCount('recipients', (recipientQuery) => {
        recipientQuery
          .whereNull('notice_recipient_deleted_at')
          .where('notice_recipient_read', true)
          .as('recipients_read_count')
      })
    this.preloadCreator(query)

    const notice = await query.first()
    if (!notice) return null

    const orgByEmployee = await this.fetchRecipientsOrg(
      notice.recipients.map((r) => r.employeeId).filter((id): id is number => id !== null)
    )

    const serialized = notice.serialize()
    return {
      ...serialized,
      recipients: notice.recipients.map((recipient) => {
        const org = recipient.employeeId !== null ? orgByEmployee.get(recipient.employeeId) : undefined
        return {
          ...recipient.serialize(),
          departmentName: org?.department_name ?? null,
          positionName: org?.position_name ?? null,
        }
      }),
    }
  }

  /**
   * Departamento y puesto de cada destinatario en una sola consulta. Se
   * consulta con el query builder y no con el modelo de empleado para no
   * arrastrar sus columnas sensibles ni sus hooks a una lista de lectura.
   */
  private async fetchRecipientsOrg(employeeIds: number[]): Promise<Map<number, RecipientOrgRow>> {
    const result = new Map<number, RecipientOrgRow>()
    if (employeeIds.length === 0) return result

    const rows = await db
      .from('employees')
      .leftJoin('departments', 'departments.department_id', 'employees.department_id')
      .leftJoin('positions', 'positions.position_id', 'employees.position_id')
      .whereIn('employees.employee_id', employeeIds)
      .select(
        'employees.employee_id as employee_id',
        'departments.department_name as department_name',
        'positions.position_name as position_name'
      )

    for (const row of rows as RecipientOrgRow[]) {
      result.set(Number(row.employee_id), row)
    }
    return result
  }

  /**
   * Marca un aviso como leído para un empleado específico
   */
  async markAsRead(noticeId: number, employeeId: number) {
    const noticeRecipient = await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', noticeId)
      .where('employee_id', employeeId)
      .first()

    if (!noticeRecipient) {
      return {
        status: 404,
        type: 'warning',
        title: this.t('notice_recipient'),
        message: this.t('entity_was_not_found', { entity: this.t('notice_recipient') }),
        data: { noticeId, employeeId },
      }
    }

    noticeRecipient.noticeRecipientRead = true
    noticeRecipient.noticeRecipientReadAt = DateTime.now()
    await noticeRecipient.save()

    return {
      status: 200,
      type: 'success',
      title: this.t('notice'),
      message: this.t('resource_was_updated_successfully'),
      data: { noticeRecipient },
    }
  }

  /**
   * Envía el aviso por correo y notificación push a sus destinatarios.
   * @param noticeId ID del aviso
   * @param isUpdate Si es true, agrega prefijo "Update" o "Actualización" al subject
   * @param businessUnitId empresa para el branding cuando el aviso no la tiene persistida
   * @param onlyUnread si es true, solo se reenvía a quienes no han confirmado lectura
   */
  async sendNoticeEmails(
    noticeId: number,
    isUpdate: boolean = false,
    businessUnitId: number | null = null,
    onlyUnread: boolean = false
  ) {
    const notice = await Notice.query()
      .whereNull('notice_deleted_at')
      .where('notice_id', noticeId)
      .preload('recipients', (query) => {
        query.whereNull('notice_recipient_deleted_at')
        if (onlyUnread) {
          query.where('notice_recipient_read', false)
        }
        query.preload('employee', (employeeQuery) => {
          employeeQuery.whereNull('employee_deleted_at')
          employeeQuery.preload('person', (personQuery) => {
            personQuery.whereNull('person_deleted_at')
            personQuery.preload('user', (userQuery) => {
              userQuery.whereNull('user_deleted_at')
            })
          })
        })
      })
      .preload('files', (query) => {
        query.whereNull('notice_file_deleted_at')
      })
      .first()

    if (!notice) {
      return {
        status: 404,
        type: 'warning',
        title: this.t('notice'),
        message: this.t('entity_was_not_found', { entity: this.t('notice') }),
        data: { noticeId },
      }
    }

    const isDevelopment = env.get('NODE_ENV') !== 'production'
    const recipients = notice.recipients || []
    let sentCount = 0
    let failedCount = 0

    // Correo siempre en español hasta el lanzamiento en inglés (mail_locale.ts),
    // sin importar el idioma de la petición que disparó el envío.
    const locale = resolveMailLocale(this.i18n.locale)
    const mailI18n = i18nManager.locale(locale)
    const tm = mailI18n.formatMessage.bind(mailI18n)
    const updatePrefix = locale.startsWith('es') ? 'Actualización' : 'Update'
    const subjectPrefix = isUpdate ? `${updatePrefix}: ` : ''
    const fromEmail = resolveMailSender()

    // Identidad del correo: la de Valanserh, como en los correos de acceso. La
    // empresa cliente solo aparece nombrada como remitente del aviso; su
    // configuración se consulta para el nombre y el icono de la notificación.
    const tradeName = MAIL_BRAND_TRADE_NAME
    const backgroundImageLogo = MAIL_BRAND_LOGO_URL
    const brandingBusinessUnitId = notice.businessUnitId ?? businessUnitId
    let companyName = tradeName
    let systemSettingActive: SystemSetting | null = null
    if (brandingBusinessUnitId) {
      const systemSettingService = new SystemSettingService()
      try {
        systemSettingActive = await systemSettingService.resolveByBusinessUnitId(brandingBusinessUnitId)
        if (systemSettingActive.systemSettingTradeName) {
          companyName = systemSettingActive.systemSettingTradeName
        }
      } catch (error) {
        if (!(error instanceof SystemSettingResolutionError)) throw error
      }
    }


     const mimeTypes: Record<string, string> = {
       '.pdf': 'application/pdf',
       '.png': 'image/png',
       '.jpg': 'image/jpeg',
       '.jpeg': 'image/jpeg',
       '.gif': 'image/gif',
       '.webp': 'image/webp',
       '.svg': 'image/svg+xml',
       '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       '.csv': 'text/csv',
     }

     // Cuerpo del aviso cuando es un archivo (tipo pdf o image). El PDF viaja
     // como adjunto; la imagen se incrusta en el cuerpo del correo con un CID,
     // porque el objeto es privado y no hay URL pública que un cliente de
     // correo pueda pintar.
     let attachmentBuffer: Buffer | null = null
     let attachmentFilename = ''
     let attachmentContentType = ''

     const description = (notice.noticeDescription || '').trim()
     const isUrl = /^https?:\/\//i.test(description)
     const isFilePath = !isUrl && /\.(pdf|png|jpg|jpeg|gif|webp|svg)$/i.test(description)
     const bodyIsFile = (isUrl || isFilePath) && (notice.noticeType === 'pdf' || notice.noticeType === 'image')

     if (bodyIsFile) {
       try {
         // Siempre por el bucket con credenciales, nunca con un `fetch` a la
         // URL guardada: eso era una petición saliente gobernada por un valor
         // de base de datos, y además el adjunto ya se guarda como key privada.
         const uploadService = new UploadService()
         attachmentBuffer = await uploadService.readStoredFileBuffer(description)
         attachmentFilename = decodeURIComponent(
           path.basename(isUrl ? new URL(description).pathname : description)
         )

         if (attachmentFilename) {
           const ext = path.extname(attachmentFilename).toLowerCase()
           attachmentContentType = mimeTypes[ext] || 'application/octet-stream'
         }
       } catch (error) {
         console.error('Error al descargar archivo para adjuntar al correo:', error)
       }
     }

     // Archivos múltiples cuando el tipo es text y tiene noticeFiles asociados
     const fileAttachments: Array<{ buffer: Buffer; filename: string; contentType: string }> = []

     if (notice.noticeType === 'text' && notice.files && notice.files.length > 0) {
       const uploadService = new UploadService()
       for (const noticeFile of notice.files) {
         const filePath = (noticeFile.noticeFilePath || '').trim()
         if (!filePath) continue

         try {
           // Igual que arriba: la lectura va por el bucket, no por HTTP contra
           // la URL guardada.
           const esUrl = /^https?:\/\//i.test(filePath)
           const fileBuffer = await uploadService.readStoredFileBuffer(filePath)
           const fileName = decodeURIComponent(
             path.basename(esUrl ? new URL(filePath).pathname : filePath)
           )

           if (fileBuffer && fileName) {
             const ext = path.extname(fileName).toLowerCase()
             fileAttachments.push({
               buffer: fileBuffer,
               filename: fileName,
               contentType: mimeTypes[ext] || 'application/octet-stream',
             })
           }
         } catch (error) {
           console.error(`Error al descargar archivo adjunto ${filePath}:`, error)
         }
       }
     }

     const embedImage = notice.noticeType === 'image' && !!attachmentBuffer && !!attachmentFilename

     // Textos de la plantilla. La fecha va en la zona de los clientes y con
     // am/pm en minúsculas, regla del producto.
     const sentAt = DateTime.now().setZone(MAIL_TIME_ZONE).setLocale(locale)
     const sentAtLabel = `${sentAt.toFormat("d 'de' LLLL 'de' yyyy, h:mm")} ${sentAt.hour < 12 ? 'am' : 'pm'}`
     const attachmentNames: string[] =
       notice.noticeType === 'pdf' && attachmentFilename
         ? [attachmentFilename]
         : fileAttachments.map((file) => file.filename)
     const mailTexts = {
       preheader: tm('notice_mail.preheader', { tradeName: companyName, subject: notice.noticeSubject }),
       kicker: isUpdate
         ? tm('notice_mail.kicker_update', { tradeName: companyName })
         : tm('notice_mail.kicker', { tradeName: companyName }),
       sentOn: tm('notice_mail.sent_on', { date: sentAtLabel }),
       attachmentsTitle: tm('notice_mail.attachments_title'),
       attachmentsNote:
         notice.noticeType === 'pdf' ? tm('notice_mail.pdf_note') : tm('notice_mail.attachments_note'),
       appHint: tm('notice_mail.app_hint'),
       footer: tm('notice_mail.footer', { tradeName }),
     }

     for (const recipient of recipients) {
      try {
        // En desarrollo, solo enviar a emails de la lista de desarrollo
        let emailToSend = recipient.employeeEmail
        if (isDevelopment) {
          // Verificar si el email está en la lista de desarrollo
          const isInDevList = DEVELOPMENT_EMAIL_LIST.some(
            (devEmail) => devEmail.toLowerCase() === recipient.employeeEmail.toLowerCase()
          )
          if (!isInDevList) {
            // Simular envío pero no enviar realmente
            recipient.noticeRecipientSent = true
            recipient.noticeRecipientSentAt = DateTime.now()
            recipient.noticeRecipientError = null
            await recipient.save()
            sentCount++
            continue
          }
        }

        // Enviar email con subject modificado si es actualización
        const emailSubject = `${subjectPrefix}${notice.noticeSubject}`
        await mail.send((message) => {
          message
            .to(emailToSend)
            .from(fromEmail, tradeName)
            .subject(emailSubject)
            .htmlView('emails/notice_mail', {
              noticeSubject: notice.noticeSubject,
              noticeDescription: notice.noticeDescription,
              // La imagen del aviso va incrustada por CID cuando se pudo leer
              // del bucket; la URL pública queda solo para filas históricas.
              noticeImageCid: embedImage ? NOTICE_MAIL_IMAGE_CID : null,
              noticeImageUrl: embedImage ? null : resolvePublicAssetUrl(notice.noticeDescription),
              tradeName,
              backgroundImageLogo,
              noticeType: notice.noticeType,
              attachmentNames,
              ...mailTexts,
            })

          if (attachmentBuffer && attachmentFilename) {
            if (embedImage) {
              message.embedData(attachmentBuffer, NOTICE_MAIL_IMAGE_CID, {
                filename: attachmentFilename,
                contentType: attachmentContentType,
              })
            } else {
              message.attachData(attachmentBuffer, {
                filename: attachmentFilename,
                contentType: attachmentContentType,
              })
            }
          }

          for (const file of fileAttachments) {
            message.attachData(file.buffer, {
              filename: file.filename,
              contentType: file.contentType,
            })
          }
        })

        if (recipient.employee) {
          if (recipient.employee.person && recipient.employee.person.user) {
            const userId = recipient.employee.person.user.userId
            const userFcmTokens = await UserFcmToken.query()
              .where('user_id', userId)
              .where('user_fcm_token_active', 1)
              .where('user_fcm_token_last_seen_at', '>', DateTime.now().minus({ days: 50 }).toISO())
            if (userFcmTokens) {
              for (const userFcmToken of userFcmTokens) {
                try {
                  // enviar id para poder ver el aviso en la app
                  admin.messaging().send({
                    webpush: {
                      notification: {
                        title: tm('new_notice'),
                        body: notice.noticeSubject,
                        icon: systemSettingActive?.systemSettingFavicon ? systemSettingActive.systemSettingFavicon : ''
                      },
                      data: {
                        noticeId: noticeId.toString()
                      }
                    },
                    token: userFcmToken.userFcmToken
                  });
                } catch (error) {
                  console.error(error)
                }
              }
            }
          }
        }

          recipient.noticeRecipientSent = true
          recipient.noticeRecipientSentAt = DateTime.now()
          recipient.noticeRecipientError = null
          await recipient.save()
          sentCount++
        } catch (error: any) {
          recipient.noticeRecipientSent = false
          recipient.noticeRecipientSentAt = null
          recipient.noticeRecipientError = error.message || 'Unknown error'
          await recipient.save()
          failedCount++
        }

    }

    // Actualizar el aviso con la información de envío. Un reenvío parcial (solo
    // a quien no ha leído) no reescribe la fecha del envío original.
    if (!onlyUnread || !notice.noticeSentAt) {
      notice.noticeSentCount = sentCount
      notice.noticeSentAt = sentCount > 0 ? DateTime.now() : notice.noticeSentAt
    } else {
      notice.noticeSentCount = notice.noticeSentCount + sentCount
    }
    // Enviado es enviado: la agenda deja de aplicar.
    if (notice.noticeSentAt) {
      notice.noticeScheduledAt = null
    }
    await notice.save()

    return {
      status: 200,
      type: 'success',
      title: this.t('notice'),
      message: `${this.t('notice_sent_successfully')} - ${sentCount} ${this.t('sent')}, ${failedCount} ${this.t('failed') || 'failed'}`,
      data: {
        noticeId: notice.noticeId,
        sentCount,
        failedCount,
        totalRecipients: recipients.length,
      },
    }
  }

  async sendNotice(noticeId: number, businessUnitId: number | null = null, onlyUnread = false) {
    return await this.sendNoticeEmails(noticeId, false, businessUnitId, onlyUnread)
  }

  /**
   * Crea un borrador idéntico al aviso dado: mismo contenido, mismo público y
   * mismos destinatarios (sin seguimiento de lectura, que es del original).
   * Los archivos se copian dentro del bucket para que borrar la copia no deje
   * al original sin ellos. Un archivo que no se pueda copiar se omite y se
   * registra: la copia sigue siendo útil sin él.
   */
  async duplicate(source: Notice, createdByUserId: number | null): Promise<Notice> {
    const uploadService = new UploadService()
    const isText = source.noticeType === NOTICE_TYPE.TEXT

    let description = source.noticeDescription
    if (!isText && source.noticeDescription) {
      const copiedKey = await uploadService.copyStoredObject(
        source.noticeDescription,
        NOTICE_FILE_INTAKE_PROFILE,
        NOTICE_FILE_FOLDER
      )
      if (!copiedKey) {
        console.error(
          `NoticeService.duplicate: no se pudo copiar el cuerpo del aviso ${source.noticeId}`
        )
      }
      description = copiedKey ?? ''
    }

    const copy = new Notice()
    copy.businessUnitId = source.businessUnitId
    copy.noticeSubject = `${source.noticeSubject}${NOTICE_DUPLICATE_SUBJECT_SUFFIX}`.slice(0, 500)
    copy.noticeDescription = description
    copy.noticeType = source.noticeType
    copy.noticeAudience = source.noticeAudience
    copy.noticeSentCount = 0
    copy.noticeSentAt = null
    copy.noticeScheduledAt = null
    copy.noticeCreatedByUserId = createdByUserId
    copy.noticeRecipientEmails = source.noticeRecipientEmails
    await copy.save()

    const recipients = await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', source.noticeId)
    for (const recipient of recipients) {
      if (recipient.employeeId === null) continue
      await this.createRecipient(copy.noticeId, {
        employeeId: recipient.employeeId,
        employeeEmail: recipient.employeeEmail,
        employeeName: recipient.employeeName,
      })
    }

    if (isText) {
      const files = await NoticeFile.query()
        .whereNull('notice_file_deleted_at')
        .where('notice_id', source.noticeId)
      for (const file of files) {
        const copiedKey = await uploadService.copyStoredObject(
          file.noticeFilePath,
          NOTICE_FILE_INTAKE_PROFILE,
          NOTICE_FILE_FOLDER
        )
        if (!copiedKey) {
          console.error(
            `NoticeService.duplicate: no se pudo copiar el adjunto ${file.noticeFileId} del aviso ${source.noticeId}`
          )
          continue
        }
        const copiedFile = new NoticeFile()
        copiedFile.noticeId = copy.noticeId
        copiedFile.noticeFilePath = copiedKey
        await copiedFile.save()
      }
    }

    return copy
  }

  /**
   * Envía los avisos programados cuya hora ya llegó. Lo corre el comando
   * agendado fuera de una request, así que el llamador debe abrir el bypass de
   * tenant. Un aviso que no logra ningún envío vuelve a borrador para no
   * reintentarse cada minuto: el error queda en la bitácora del comando y en
   * `notice_recipient_error`.
   */
  async sendDueScheduled(log: NoticeSchedulerLogger): Promise<SendScheduledResult> {
    const due = await Notice.query()
      .whereNull('notice_deleted_at')
      .whereNull('notice_sent_at')
      .whereNotNull('notice_scheduled_at')
      // La columna se guarda en UTC (`timezone: 'Z'` en config/database.ts):
      // el corte se compara en la misma zona y sin sufijo de offset.
      .where('notice_scheduled_at', '<=', DateTime.utc().toFormat('yyyy-LL-dd HH:mm:ss'))
      .orderBy('notice_scheduled_at', 'asc')

    const result: SendScheduledResult = { dueCount: due.length, sentCount: 0, failedCount: 0 }

    for (const notice of due) {
      try {
        const outcome = await this.sendNoticeEmails(notice.noticeId, false, notice.businessUnitId)
        const sent =
          outcome.data && 'sentCount' in outcome.data ? Number(outcome.data.sentCount ?? 0) : 0
        if (sent > 0) {
          result.sentCount += 1
          log.info(`Aviso ${notice.noticeId} enviado a ${sent} destinatario(s)`)
          continue
        }
        result.failedCount += 1
        await this.demoteToDraft(notice.noticeId)
        log.warn(`Aviso ${notice.noticeId} sin envíos: vuelve a borrador`)
      } catch (error: unknown) {
        result.failedCount += 1
        const message = error instanceof Error ? error.message : String(error)
        await this.demoteToDraft(notice.noticeId)
        log.error(`Aviso ${notice.noticeId} falló al enviarse: ${message}`)
      }
    }

    return result
  }

  private async demoteToDraft(noticeId: number): Promise<void> {
    const notice = await Notice.query().where('notice_id', noticeId).first()
    if (!notice) return
    notice.noticeScheduledAt = null
    await notice.save()
  }

  async deleteFileS3(fileUrl: string) {
    if (fileUrl && /^https?:\/\//i.test(fileUrl.trim())) {
      const uploadService = new UploadService()
      const fileNameWithExt = decodeURIComponent(
        path.basename(fileUrl)
      )
      const fileKey = `${Env.get('AWS_ROOT_PATH')}/notices/${fileNameWithExt}`
      await uploadService.deleteFile(fileKey)
    }
  }
}
