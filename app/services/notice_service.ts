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
import NoticeFileService from '#services/notice_file_service'
import path from 'node:path'
import logger from '@adonisjs/core/services/logger'
import UserFcmToken from '#models/user_fcm_token'
import admin from '../../config/firebase.js'
import { noticePlainTextLength } from '#helpers/sanitize_notice_content'
import {
  resolveEmployeeRoleScope,
  type EmployeeRoleScope,
} from '#helpers/resolve_employee_role_scope'
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
  isNoticeTypeValue,
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
  /** Criterio del público `department`; `null` para `company` y `manual`. */
  noticeDepartmentId: number | null
  noticePositionId: number | null
}

/** Contexto que decide qué reglas de negocio aplican al guardar. */
export interface NoticeVerifyContext {
  sendMode: NoticeSendModeValue
  scheduledAt: DateTime | null
  /** `true` si el aviso de imagen o PDF tiene archivo, nuevo o ya guardado. */
  hasBodyFile: boolean
  recipientsCount: number
  /** `true` si el aviso ya salió (`notice_sent_at` con valor): cambia qué modos se aceptan. */
  isSent: boolean
}

/**
 * Con qué se arma la lista de destinatarios. El público decide qué campos
 * cuentan: `manual` usa los ids, `department` el departamento y el puesto, y
 * `company` no necesita nada más que la empresa.
 */
export interface NoticeRecipientCriteria {
  audience: NoticeAudienceValue
  departmentId: number | null
  positionId: number | null
  recipientEmployeeIds: number[]
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
      // Los conteos son del público vigente: una fila histórica que el criterio
      // nuevo dejó fuera sigue en el seguimiento, pero no cuenta en "N de M lo
      // abrieron" ni en cuántos recibirán un reenvío.
      .withCount('recipients', (recipientQuery) => {
        recipientQuery
          .whereNull('notice_recipient_deleted_at')
          .where('notice_recipient_in_audience', true)
      })
      .withCount('recipients', (recipientQuery) => {
        recipientQuery
          .whereNull('notice_recipient_deleted_at')
          .where('notice_recipient_in_audience', true)
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
      // Para el colaborador solo existe lo enviado: un borrador o un programado
      // no se lista aunque ya tenga su fila de destinatario.
      query = query.whereNotNull('notice_sent_at')
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
      // Solo cuenta lo enviado: un borrador o un programado con fila de
      // destinatario no es un aviso pendiente para la app.
      .whereNotNull('notice_sent_at')
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

    return this.toResolvedRecipients(employees)
  }

  /**
   * Destinatarios según el público. `company` y `department` se resuelven en
   * el servidor —colaboradores activos de la empresa con correo efectivo,
   * recortados al alcance del rol de quien redacta: el mismo criterio con el
   * que el compositor cuenta y lista— y `manual` con los ids que manda el
   * cliente.
   *
   * @param businessUnitId empresa del aviso. Va explícita y no se fía del
   *   tenant: el comando programado corre con el filtro apagado y resuelve el
   *   criterio de cada aviso con SU empresa.
   * @param roleScope alcance de colaboradores de quien redacta. `null` solo
   *   cuando no hay a quién atribuírselo (autor sin registrar o dado de baja):
   *   entonces se resuelve con la empresa completa.
   */
  async resolveRecipientsByCriteria(
    criteria: NoticeRecipientCriteria,
    businessUnitId: number,
    roleScope: EmployeeRoleScope | null
  ): Promise<ResolvedRecipient[]> {
    if (criteria.audience === NOTICE_AUDIENCE.MANUAL) {
      return this.resolveRecipients(criteria.recipientEmployeeIds)
    }

    const departmentId =
      criteria.audience === NOTICE_AUDIENCE.DEPARTMENT ? criteria.departmentId : null
    // Sin departamento no hay criterio que resolver; `verifyInfo` lo rechaza
    // como "sin destinatarios" cuando el modo exige el aviso completo.
    if (criteria.audience === NOTICE_AUDIENCE.DEPARTMENT && !departmentId) return []

    const query = Employee.query()
      .whereNull('employee_deleted_at')
      .where('business_unit_id', businessUnitId)
    if (departmentId) {
      query.where('department_id', departmentId)
      if (criteria.positionId) {
        query.where('position_id', criteria.positionId)
      }
    }
    if (roleScope) {
      this.applyRoleScope(query, roleScope)
    }
    const employees = await query.preload('person', (personQuery) => {
      personQuery.preload('user')
    })

    return this.toResolvedRecipients(employees)
  }

  /**
   * Mismo recorte que `EmployeeService.index`: sin acceso completo a la
   * plantilla, solo los colaboradores a cargo del usuario y él mismo; con
   * acceso completo, los departamentos visibles para el rol.
   */
  private applyRoleScope(
    query: ModelQueryBuilderContract<typeof Employee>,
    roleScope: EmployeeRoleScope
  ): void {
    const userId = roleScope.userResponsibleId
    if (userId) {
      query.where((scoped) => {
        scoped
          .whereHas('userResponsibleEmployee', (responsibleQuery) => {
            responsibleQuery
              .where('user_id', userId)
              .whereNull('user_responsible_employee_deleted_at')
          })
          .orWhereHas('person', (personQuery) => {
            personQuery.whereHas('user', (userQuery) => {
              userQuery.where('user_id', userId)
            })
          })
      })
      return
    }
    query.whereIn('department_id', roleScope.departmentsList)
  }

  /**
   * El criterio `department` solo puede apuntar a un departamento que el rol
   * ve; si no, el compositor prometería un alcance que el usuario no tiene.
   * `company` no se rechaza: se recorta al resolver.
   */
  verifyAudienceScope(
    criteria: NoticeRecipientCriteria,
    roleScope: EmployeeRoleScope | null
  ): NoticeValidationError | null {
    if (!roleScope || criteria.audience !== NOTICE_AUDIENCE.DEPARTMENT) return null
    if (!criteria.departmentId || roleScope.departmentsList.includes(criteria.departmentId)) {
      return null
    }
    return {
      status: 400,
      title: this.t('notice_validation_title'),
      detail: this.t('notice_department_out_of_scope'),
      key: 'departamento-fuera-de-alcance',
    }
  }

  /** Deja fuera a quien no tiene ningún correo: no habría a dónde enviarle. */
  private toResolvedRecipients(employees: Employee[]): ResolvedRecipient[] {
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
   * `draft` guarda lo que haya, y `update` sobre un aviso que aún no sale se
   * comporta igual. Sobre un aviso ya enviado, `update` y `now` exigen el aviso
   * completo: lo que ya recibió la gente no puede quedar a medias.
   */
  private requiresCompleteContent(sendMode: NoticeSendModeValue, isSent: boolean): boolean {
    if (sendMode === NOTICE_SEND_MODE.DRAFT) return false
    if (sendMode === NOTICE_SEND_MODE.UPDATE) return isSent
    return true
  }

  /**
   * Reglas de negocio del guardado. Vine ya validó forma y catálogos; aquí va
   * lo que depende de varios campos a la vez.
   *
   * Un borrador solo exige asunto. Sobre un aviso ya enviado solo caben
   * `update` (guardar sin reenviar) y `now` (guardar y reenviar): volverlo
   * borrador o programarlo se rechaza con `aviso-ya-enviado`.
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

    if (
      context.isSent &&
      (context.sendMode === NOTICE_SEND_MODE.DRAFT ||
        context.sendMode === NOTICE_SEND_MODE.SCHEDULED)
    ) {
      return reject(this.t('notice_already_sent'), 'aviso-ya-enviado')
    }

    const requiresComplete = this.requiresCompleteContent(context.sendMode, context.isSent)

    if (notice.noticeType === NOTICE_TYPE.TEXT) {
      const length = noticePlainTextLength(notice.noticeDescription)
      if (requiresComplete && length === 0) {
        return reject(this.t('notice_description_is_required'), 'aviso-mensaje-requerido')
      }
      // El tope aplica también al borrador: lo que no cabe no se guarda.
      if (length > NOTICE_MESSAGE_MAX_LENGTH) {
        return reject(
          this.t('notice_message_too_long', { max: NOTICE_MESSAGE_MAX_LENGTH }),
          'aviso-mensaje-demasiado-largo'
        )
      }
    } else if (requiresComplete && !context.hasBodyFile) {
      return reject(this.t('notice_file_is_required'), 'aviso-archivo-requerido')
    }

    if (requiresComplete && context.recipientsCount === 0) {
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
    newNotice.noticeDepartmentId = notice.noticeDepartmentId
    newNotice.noticePositionId = notice.noticePositionId
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
    noticeRecipient.noticeRecipientInAudience = true
    await noticeRecipient.save()
  }

  /**
   * Alinea los destinatarios con la lista recibida: agrega los que faltan y
   * retira los que ya no aplican, salvo los que tienen historial. Una fila a la
   * que ya se le envió o que ya abrió el aviso es seguimiento y se conserva
   * aunque el criterio nuevo la deje fuera —marcada fuera del público, para
   * que un reenvío no la alcance—; solo se elimina lo que nunca recibió nada.
   * Volver a entrar al público restaura la marca.
   */
  private async syncRecipients(notice: Notice, recipients: ResolvedRecipient[]): Promise<void> {
    const existing = await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', notice.noticeId)

    const wantedIds = new Set(recipients.map((r) => r.employeeId))
    const keptIds = new Set<number>()

    for (const current of existing) {
      if (current.employeeId !== null && wantedIds.has(current.employeeId)) {
        keptIds.add(current.employeeId)
        await this.setInAudience(current, true)
        continue
      }
      if (this.hasDeliveryHistory(current)) {
        await this.setInAudience(current, false)
        continue
      }
      await current.delete()
    }

    for (const recipient of recipients) {
      if (!keptIds.has(recipient.employeeId)) {
        await this.createRecipient(notice.noticeId, recipient)
      }
    }

    notice.noticeRecipientEmails = JSON.stringify(recipients.map((r) => r.employeeEmail))
    await notice.save()
  }

  /** Ya se le envió o ya lo abrió: es historial de seguimiento, no una fila descartable. */
  private hasDeliveryHistory(recipient: NoticeRecipient): boolean {
    return !!recipient.noticeRecipientSentAt || !!recipient.noticeRecipientReadAt
  }

  /** Solo escribe si cambia: la sincronización corre en cada guardado. */
  private async setInAudience(recipient: NoticeRecipient, inAudience: boolean): Promise<void> {
    if (Boolean(recipient.noticeRecipientInAudience) === inAudience) return
    recipient.noticeRecipientInAudience = inAudience
    await recipient.save()
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
    currentNotice.noticeDepartmentId = notice.noticeDepartmentId
    currentNotice.noticePositionId = notice.noticePositionId
    currentNotice.noticeScheduledAt = scheduledAt
    // Cualquier guardado limpia el error del intento programado anterior: RH
    // ya vio el aviso y lo tocó. Enviar con éxito también lo limpia (ver
    // `markDispatched`).
    currentNotice.noticeScheduleError = null
    await currentNotice.save()

    await this.syncRecipients(currentNotice, recipients)

    return currentNotice
  }

  /**
   * Baja del aviso: primero las filas (destinatarios, adjuntos y el aviso) y
   * al final los objetos del almacenamiento (adjuntos y cuerpo imagen o PDF).
   *
   * En ese orden porque un objeto que no se pueda borrar se registra y no
   * detiene nada, mientras que borrar los objetos antes dejaba, si la baja de
   * filas fallaba después, un aviso vivo apuntando a keys inexistentes
   * (`body-file` en 404 y correos sin adjunto).
   */
  async delete(currentNotice: Notice) {
    const noticeFileService = new NoticeFileService()
    const files = await NoticeFile.query()
      .whereNull('notice_file_deleted_at')
      .where('notice_id', currentNotice.noticeId)
    const storedKeys = files.map((file) => file.noticeFilePath)
    if (currentNotice.noticeType !== NOTICE_TYPE.TEXT) {
      storedKeys.push(currentNotice.noticeDescription)
    }

    await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', currentNotice.noticeId)
      .delete()
    for (const file of files) {
      await noticeFileService.delete(file)
    }
    await currentNotice.delete()

    for (const storedKey of storedKeys) {
      await this.deleteStoredFile(storedKey)
    }
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

    if (employeeId) {
      // Vista del colaborador: solo lo enviado y solo si es destinatario. Viaja
      // únicamente su fila (su bandera de lectura), nunca la lista de
      // destinatarios.
      const ownRecipient = (recipientQuery: NoticeRecipientQuery) => {
        recipientQuery.whereNull('notice_recipient_deleted_at').where('employee_id', employeeId)
      }
      query = query
        .whereNotNull('notice_sent_at')
        .whereHas('recipients', ownRecipient)
        .preload('recipients', ownRecipient)
      const notice = await query.first()
      return notice ? notice.serialize() : null
    }

    // Viajan TODAS las filas vivas (las históricas fuera del público también:
    // son seguimiento), cada una con `noticeRecipientInAudience`; los conteos
    // solo cuentan el público vigente.
    query = query
      .preload('recipients', (recipientQuery) => {
        recipientQuery.whereNull('notice_recipient_deleted_at').orderBy('employee_name', 'asc')
      })
      .withCount('recipients', (recipientQuery) => {
        recipientQuery
          .whereNull('notice_recipient_deleted_at')
          .where('notice_recipient_in_audience', true)
      })
      .withCount('recipients', (recipientQuery) => {
        recipientQuery
          .whereNull('notice_recipient_deleted_at')
          .where('notice_recipient_in_audience', true)
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
   * Registra que el colaborador abrió el aviso. Idempotente: la primera
   * apertura fija `notice_recipient_read_at` y las siguientes no la mueven.
   */
  async markAsRead(noticeId: number, employeeId: number) {
    const noticeRecipient = await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', noticeId)
      .where('employee_id', employeeId)
      // Solo se abre lo enviado: sin fecha de envío el aviso no existe para la app.
      .whereHas('notice', (noticeQuery) => {
        noticeQuery.whereNull('notice_deleted_at').whereNotNull('notice_sent_at')
      })
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

    if (!noticeRecipient.noticeRecipientReadAt) {
      noticeRecipient.noticeRecipientRead = true
      noticeRecipient.noticeRecipientReadAt = DateTime.now()
      await noticeRecipient.save()
    }

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
   *
   * Es síncrono y puede tardar: el comando programado lo espera; las rutas
   * HTTP lo disparan sin `await` a través de `dispatchSend`. No fija la fecha
   * de envío ni cancela la agenda —eso es de `markDispatched`—; aquí solo se
   * acumula cuántos correos salieron y el resultado por destinatario.
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
        // Solo el público vigente: una fila histórica que el criterio nuevo
        // dejó fuera conserva su seguimiento pero no recibe reenvíos.
        query
          .whereNull('notice_recipient_deleted_at')
          .where('notice_recipient_in_audience', true)
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

    // Solo el conteo: un reenvío parcial (a quien no lo ha abierto) acumula y
    // uno completo reemplaza. El estado del aviso lo fija `markDispatched`.
    notice.noticeSentCount = onlyUnread ? notice.noticeSentCount + sentCount : sentCount
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

  /**
   * Destinatarios vivos del público vigente a los que iría un envío; con
   * `onlyUnread`, solo los que no han abierto el aviso.
   */
  private async countPendingRecipients(noticeId: number, onlyUnread: boolean): Promise<number> {
    const pending = await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', noticeId)
      .where('notice_recipient_in_audience', true)
      .if(onlyUnread, (recipientQuery) => {
        recipientQuery.where('notice_recipient_read', false)
      })
      .count('* as total')
    return Number(pending[0]?.$extras.total ?? 0)
  }

  /**
   * Un aviso que aún no ha salido solo se despacha completo. `send` no pasa
   * por `verifyInfo` y, desde que un borrador solo exige asunto, un borrador
   * con público `company` ya tiene destinatarios y podía salir vacío. Sobre un
   * aviso ya enviado no aplica: lo que salió ya estaba completo.
   */
  async verifyDispatchable(notice: Notice): Promise<NoticeValidationError | null> {
    if (notice.noticeSentAt) return null
    const input: NoticeInput = {
      noticeSubject: notice.noticeSubject,
      noticeDescription: notice.noticeDescription ?? '',
      noticeType: isNoticeTypeValue(notice.noticeType) ? notice.noticeType : NOTICE_TYPE.TEXT,
      noticeAudience: notice.noticeAudience,
      noticeDepartmentId: notice.noticeDepartmentId ?? null,
      noticePositionId: notice.noticePositionId ?? null,
    }
    return this.verifyInfo(input, {
      sendMode: NOTICE_SEND_MODE.NOW,
      scheduledAt: null,
      hasBodyFile: input.noticeType !== NOTICE_TYPE.TEXT && !!notice.noticeDescription,
      recipientsCount: await this.countPendingRecipients(notice.noticeId, false),
      isSent: false,
    })
  }

  /**
   * Despacha el envío sin bloquear la petición: fija el estado del aviso
   * (`markDispatched`), cuenta a cuántos destinatarios se les enviará y
   * dispara `sendNoticeEmails` sin `await`. Los fallos del envío quedan en
   * cada fila de destinatario y en la bitácora, nunca en la respuesta HTTP,
   * que ya salió. Con cero destinatarios pendientes no cambia nada.
   *
   * @returns número de destinatarios a los que se les enviará
   */
  async dispatchSend(
    notice: Notice,
    options: { businessUnitId: number | null; isUpdate?: boolean; onlyUnread?: boolean }
  ): Promise<number> {
    const onlyUnread = options.onlyUnread === true
    const dispatched = await this.countPendingRecipients(notice.noticeId, onlyUnread)
    if (dispatched === 0) return 0

    await this.markDispatched(notice)

    this.sendNoticeEmails(
      notice.noticeId,
      options.isUpdate === true,
      options.businessUnitId,
      onlyUnread
    ).catch((error: unknown) => {
      logger.error(
        { err: error, noticeId: notice.noticeId },
        'NoticeService: falló el envío en segundo plano del aviso'
      )
    })

    return dispatched
  }

  /**
   * Enviado es enviado: fija la fecha de envío la primera vez y la de reenvío
   * las siguientes, cancela la agenda y limpia el error del programado.
   */
  private async markDispatched(notice: Notice): Promise<void> {
    const now = DateTime.now()
    if (notice.noticeSentAt) {
      notice.noticeLastResentAt = now
    } else {
      notice.noticeSentAt = now
    }
    notice.noticeScheduledAt = null
    notice.noticeScheduleError = null
    await notice.save()
  }

  /**
   * Crea un borrador idéntico al aviso dado: mismo contenido, mismo público
   * (con su departamento y puesto) y mismos destinatarios (sin seguimiento de
   * envío ni de lectura, que es del original).
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
    copy.noticeDepartmentId = source.noticeDepartmentId
    copy.noticePositionId = source.noticePositionId
    copy.noticeSentCount = 0
    copy.noticeSentAt = null
    copy.noticeScheduledAt = null
    copy.noticeCreatedByUserId = createdByUserId
    copy.noticeRecipientEmails = source.noticeRecipientEmails
    await copy.save()

    // Solo el público vigente: las filas históricas fuera del criterio son
    // seguimiento del original, no destinatarios de la copia.
    const recipients = await NoticeRecipient.query()
      .whereNull('notice_recipient_deleted_at')
      .where('notice_id', source.noticeId)
      .where('notice_recipient_in_audience', true)
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
   * tenant. El criterio del público (`company`, `department`) se vuelve a
   * resolver al momento de enviar: quien entró o salió del departamento desde
   * que se programó cuenta hoy, no entonces.
   *
   * Un aviso que no logra ningún envío vuelve a borrador para no reintentarse
   * cada minuto, con el motivo en `notice_schedule_error` (además de la
   * bitácora del comando y de `notice_recipient_error`).
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
        await this.refreshCriteriaRecipients(notice)
        const outcome = await this.sendNoticeEmails(notice.noticeId, false, notice.businessUnitId)
        const sent =
          outcome.data && 'sentCount' in outcome.data ? Number(outcome.data.sentCount ?? 0) : 0
        if (sent > 0) {
          await this.markDispatched(notice)
          result.sentCount += 1
          log.info(`Aviso ${notice.noticeId} enviado a ${sent} destinatario(s)`)
          continue
        }
        result.failedCount += 1
        await this.demoteToDraft(notice.noticeId, this.t('notice_scheduled_send_no_deliveries'))
        log.warn(`Aviso ${notice.noticeId} sin envíos: vuelve a borrador`)
      } catch (error: unknown) {
        result.failedCount += 1
        const message = error instanceof Error ? error.message : String(error)
        await this.demoteToDraft(notice.noticeId, message)
        log.error(`Aviso ${notice.noticeId} falló al enviarse: ${message}`)
      }
    }

    return result
  }

  /**
   * Vuelve a resolver los destinatarios de un aviso por criterio (`company` o
   * `department`) con la empresa del propio aviso y con el alcance del rol de
   * quien lo redactó, igual que al guardarlo. `manual` se queda con su lista:
   * fue elegida a mano.
   *
   * Sin autor atribuible (aviso anterior al registro del autor, o autor dado
   * de baja) se resuelve sin recorte, con la empresa completa: es lo que
   * hacían los programados hasta ahora. Lo usan el comando programado y el
   * primer envío de un borrador desde `send`, para que la plantilla sea la
   * del momento de salir y no la del momento de guardar.
   */
  async refreshCriteriaRecipients(notice: Notice): Promise<void> {
    if (notice.noticeAudience === NOTICE_AUDIENCE.MANUAL || notice.businessUnitId === null) return

    const roleScope =
      typeof notice.noticeCreatedByUserId === 'number'
        ? await resolveEmployeeRoleScope(notice.noticeCreatedByUserId, this.i18n)
        : null
    const recipients = await this.resolveRecipientsByCriteria(
      {
        audience: notice.noticeAudience,
        departmentId: notice.noticeDepartmentId ?? null,
        positionId: notice.noticePositionId ?? null,
        recipientEmployeeIds: [],
      },
      notice.businessUnitId,
      roleScope
    )
    await this.syncRecipients(notice, recipients)
  }

  /**
   * Degrada un programado fallido a borrador y deja el motivo a la vista del
   * buzón. Se relee la fila: `sendNoticeEmails` la tocó en otra instancia.
   */
  private async demoteToDraft(noticeId: number, reason: string): Promise<void> {
    const notice = await Notice.query().where('notice_id', noticeId).first()
    if (!notice) return
    notice.noticeScheduledAt = null
    notice.noticeScheduleError = reason
    await notice.save()
  }

  /**
   * Borra un objeto del almacenamiento por su key o por su URL histórica.
   * Antes solo se borraban URLs públicas y la key se reconstruía con la carpeta
   * de avisos; desde que los archivos se guardan como key privada, eso no
   * borraba nada. Un fallo se registra y no interrumpe: la fila que apuntaba
   * al objeto ya se dio de baja o se reemplaza.
   */
  async deleteStoredFile(storedPath: string | null | undefined): Promise<void> {
    const reference = (storedPath || '').trim()
    if (!reference) return

    const result = await new UploadService().deleteFile(reference)
    if (result.status !== 200 && result.status !== 404) {
      logger.warn(
        { storedPath: reference, message: result.message },
        'NoticeService: no se pudo borrar el objeto del aviso en el almacenamiento'
      )
    }
  }
}
