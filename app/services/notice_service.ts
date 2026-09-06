import Notice from '#models/notice'
import { resolvePublicAssetUrl } from '#helpers/public_asset_url'
import NoticeRecipient from '#models/notice_recipient'
import Employee from '#models/employee'
import { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'
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
import { TenantContext } from '#utils/tenant_context'

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

export default class NoticeService {
  private t: (key: string, params?: { [key: string]: string | number }) => string
  private i18n: I18n

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
    this.i18n = i18n
  }

  /**
   * @param scopeIds unidades de negocio accesibles para el usuario. Cuando se
   *   entrega, el listado deja de cruzar empresas.
   */
  async index(filters: {
    search?: string
    page: number
    limit: number
    employeeId?: number
    readStatus?: 'all' | 'read' | 'unread'
    scopeIds?: number[]
  }) {
    const selectedColumns = [
      'notice_id',
      'notice_subject',
      'notice_description',
      'notice_sent_count',
      'notice_sent_at',
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
      .if(filters.search, (q) => {
        q.whereRaw('UPPER(notice_subject) LIKE ?', [`%${filters.search!.toUpperCase()}%`])
      })
      .preload('files')

    // Corte por empresa. Sin esto, `GET /api/notices` sin employeeId devuelve
    // los avisos de TODAS las empresas a cualquier autenticado: el grupo monta
    // solo `auth()`, así que el TenantContext está inactivo y el mixin de scope
    // del modelo no aplica ningún filtro.
    //
    // No se arregla montando `businessScope()`: `notices.business_unit_id` es
    // nullable por diseño —la migración dejó NULL los no derivables— y el mixin
    // filtra con `whereIn`, que los excluiría. Ese es el motivo real de que la
    // ruta no lo monte, y sigue vigente.
    //
    // Los avisos con unidad NULL se CONSERVAN a propósito: un aviso legacy
    // sigue siendo visible para cualquier usuario de backoffice de cualquier
    // tenant. Es el precio de no ocultarlos, y va escrito para que nadie lo lea
    // como un olvido.
    const scopeIds = filters.scopeIds
    if (scopeIds !== undefined) {
      query = query.where((sub) => {
        sub.whereIn('business_unit_id', scopeIds).orWhereNull('business_unit_id')
      })
    }

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
      .orderBy('notice_created_at', 'desc')
      .paginate(filters.page, filters.limit)

    return notices
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

  async create(notice: Notice, recipientEmployeeIds: number[] = []) {
    const newNotice = new Notice()
    newNotice.noticeSubject = notice.noticeSubject
    newNotice.noticeDescription = notice.noticeDescription
    newNotice.noticeSentCount = 0
    newNotice.noticeSentAt = null
    newNotice.noticeType = notice.noticeType

    // Obtener empleados seleccionados (correo efectivo con la misma jerarquía que getMails)
    const employees = await Employee.query()
      .whereNull('employee_deleted_at')
      .whereIn('employee_id', recipientEmployeeIds)
      .preload('person', (personQuery) => {
        personQuery.preload('user')
      })

    const recipientEmails: string[] = []
    const recipientData: Array<{
      employeeId: number | null
      employeeEmail: string
      employeeName: string | null
    }> = []

    for (const employee of employees) {
      const email = this.resolveRecipientEmailLikeGetMails(employee).trim()
      if (!email) {
        continue
      }
      recipientEmails.push(email)
      recipientData.push({
        employeeId: employee.employeeId,
        employeeEmail: email,
        employeeName: `${employee.employeeFirstName || ''} ${employee.employeeLastName || ''} ${employee.employeeSecondLastName || ''}`.trim() || null,
      })
    }

    newNotice.noticeRecipientEmails = JSON.stringify(recipientEmails)

    // USRH1784316436823: persistir la empresa activa antes de guardar destinatarios
    // (el hook del recipient resuelve el aviso padre bajo TenantContext).
    const [activeBusinessUnitId] = TenantContext.getScope()
    newNotice.businessUnitId = activeBusinessUnitId ?? null

    await newNotice.save()

    // Crear registros de destinatarios
    for (const recipient of recipientData) {
      const noticeRecipient = new NoticeRecipient()
      noticeRecipient.noticeId = newNotice.noticeId
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

    // Enviar correos automáticamente al crear
    // if (sendEmails && recipientData.length > 0) {
    //   await this.sendNoticeEmails(newNotice.noticeId, false)
    // }

    return newNotice
  }

  async update(
    currentNotice: Notice,
    notice: Notice,
    sendEmails: boolean = true,
    recipientEmployeeIds: number[] = [],
    businessUnitId: number | null = null
  ) {
    currentNotice.noticeSubject = notice.noticeSubject
    currentNotice.noticeDescription = notice.noticeDescription
    currentNotice.noticeType = notice.noticeType
    await currentNotice.save()

    // Actualizar destinatarios siempre que se proporcione un array
    if (recipientEmployeeIds.length > 0) {
      // Obtener empleados seleccionados (correo efectivo con la misma jerarquía que getMails)
      const employees = await Employee.query()
        .whereNull('employee_deleted_at')
        .whereIn('employee_id', recipientEmployeeIds)
        .preload('person', (personQuery) => {
          personQuery.preload('user')
        })

      const recipientEmails: string[] = []
      const recipientData: Array<{
        employeeId: number | null
        employeeEmail: string
        employeeName: string | null
      }> = []

      for (const employee of employees) {
        const email = this.resolveRecipientEmailLikeGetMails(employee).trim()
        if (!email) {
          continue
        }
        recipientEmails.push(email)
        recipientData.push({
          employeeId: employee.employeeId,
          employeeEmail: email,
          employeeName: `${employee.employeeFirstName || ''} ${employee.employeeLastName || ''} ${employee.employeeSecondLastName || ''}`.trim() || null,
        })
      }

      // Actualizar la lista de emails en el notice
      currentNotice.noticeRecipientEmails = JSON.stringify(recipientEmails)
      
      await currentNotice.save()

      // Obtener destinatarios existentes
      const existingRecipients = await NoticeRecipient.query()
        .whereNull('notice_recipient_deleted_at')
        .where('notice_id', currentNotice.noticeId)

      // const existingEmployeeIds = existingRecipients
      //  .map((r) => r.employeeId)
      //  .filter((id): id is number => id !== null)

      // Identificar destinatarios a agregar y eliminar
      //const removedEmployeeIds = existingEmployeeIds.filter((id) => !recipientEmployeeIds.includes(id))


      // Eliminar destinatarios que ya no están en la lista
      // if (removedEmployeeIds.length > 0) {
      //   await NoticeRecipient.query()
      //     .whereNull('notice_recipient_deleted_at')
      //     .where('notice_id', currentNotice.noticeId)
      //     .whereIn('employee_id', removedEmployeeIds)
      //     .delete()
      // }

      // Agregar nuevos destinatarios
      for (const recipient of recipientData) {
        // Verificar si ya existe
        const exists = existingRecipients.some(
          (r) => r.employeeId === recipient.employeeId && r.employeeEmail === recipient.employeeEmail
        )
        if (!exists) {
          const noticeRecipient = new NoticeRecipient()
          noticeRecipient.noticeId = currentNotice.noticeId
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
      }
    } else {
      // Si el array está vacío, eliminar todos los destinatarios existentes
      await NoticeRecipient.query()
        .whereNull('notice_recipient_deleted_at')
        .where('notice_id', currentNotice.noticeId)
        .delete()

      // Actualizar la lista de emails vacía
      currentNotice.noticeRecipientEmails = JSON.stringify([])
      await currentNotice.save()
    }

    // Reenviar correos automáticamente al actualizar con prefijo
    if (sendEmails) {
      await this.sendNoticeEmails(currentNotice.noticeId, true, businessUnitId)
    }

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
    } else {
      query = query.preload('recipients')
    }

    const notice = await query.first()
    return notice ? notice : null
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
   * Método privado para enviar correos de un aviso
   * @param noticeId ID del aviso
   * @param isUpdate Si es true, agrega prefijo "Update" o "Actualización" al subject
   */
   async sendNoticeEmails(noticeId: number, isUpdate: boolean = false, businessUnitId: number | null = null) {
    const notice = await Notice.query()
      .whereNull('notice_deleted_at')
      .where('notice_id', noticeId)
      .preload('recipients', (query) => {
        query.whereNull('notice_recipient_deleted_at')
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

    // Determinar el prefijo del subject según el idioma
    const locale = this.i18n.locale || 'en'
    const updatePrefix = locale.startsWith('es') ? 'Actualización' : 'Update'
    const subjectPrefix = isUpdate ? `${updatePrefix}: ` : ''
    const fromEmail = resolveMailSender()

    // Branding del correo: preferir BU persistida en el aviso; fallback al header (legacy).
    const brandingBusinessUnitId = notice.businessUnitId ?? businessUnitId
    let tradeName = 'BO'
    let backgroundImageLogo = `${env.get('BACKGROUND_IMAGE_LOGO') || ''}`
    let systemSettingActive: SystemSetting | null = null
    if (brandingBusinessUnitId) {
      const systemSettingService = new SystemSettingService()
      try {
        systemSettingActive = await systemSettingService.resolveByBusinessUnitId(brandingBusinessUnitId)
        if (systemSettingActive.systemSettingLogo) {
          backgroundImageLogo = systemSettingActive.systemSettingLogo
        }
        if (systemSettingActive.systemSettingTradeName) {
          tradeName = systemSettingActive.systemSettingTradeName
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

     // Adjunto único cuando la descripción es una URL/path (tipo pdf o image)
     let attachmentBuffer: Buffer | null = null
     let attachmentFilename = ''
     let attachmentContentType = ''

     const description = (notice.noticeDescription || '').trim()
     const isUrl = /^https?:\/\//i.test(description)
     const isFilePath = !isUrl && /\.(pdf|png|jpg|jpeg|gif|webp|svg)$/i.test(description)

     if ((isUrl || isFilePath) && notice.noticeType === 'pdf') {
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
              // Solo se pinta la imagen del aviso si es publicamente
              // alcanzable; si es un objeto privado, la plantilla la omite en
              // vez de mostrar un recuadro roto. El archivo sigue viajando
              // adjunto al correo.
              noticeImageUrl: resolvePublicAssetUrl(notice.noticeDescription),
              tradeName,
              backgroundImageLogo,
              noticeType: notice.noticeType,
            })
   
          if (attachmentBuffer && attachmentFilename) {
            message.attachData(attachmentBuffer, {
              filename: attachmentFilename,
              contentType: attachmentContentType,
            })
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
                        title: this.t('new_notice'),
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

    // Actualizar el aviso con la información de envío
    notice.noticeSentCount = sentCount
    notice.noticeSentAt = sentCount > 0 ? DateTime.now() : null
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

  async sendNotice(noticeId: number, businessUnitId: number | null = null) {
    return await this.sendNoticeEmails(noticeId, false, businessUnitId)
  }

  async verifyInfo(notice: Notice) {
    if (!notice.noticeSubject || notice.noticeSubject.trim() === '') {
      return {
        status: 400,
        type: 'warning',
        title: this.t('validation_data'),
        message: this.t('notice_subject_is_required'),
        data: { ...notice },
      }
    }
    if ((!notice.noticeDescription || notice.noticeDescription.trim() === '') && notice.noticeType === 'text') {
      return {
        status: 400,
        type: 'warning',
        title: this.t('validation_data'),
        message: this.t('notice_description_is_required'),
        data: { ...notice },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...notice },
    }
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
