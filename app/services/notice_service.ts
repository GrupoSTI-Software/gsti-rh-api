import Notice from '#models/notice'
import NoticeRecipient from '#models/notice_recipient'
import Employee from '#models/employee'
import { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import SystemSettingService from '#services/system_setting_service'
import SystemSetting from '#models/system_setting'

// Lista de desarrollo para pruebas - solo estos emails recibirán notificaciones en desarrollo
const DEVELOPMENT_EMAIL_LIST = [
  //'rogelio.jinestas@gmail.com',
  'wramirez@siler-mx.com',
]

export default class NoticeService {
  private t: (key: string, params?: { [key: string]: string | number }) => string
  private i18n: I18n

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
    this.i18n = i18n
  }

  async index(filters: { search?: string; page: number; limit: number }) {
    const selectedColumns = [
      'notice_id',
      'notice_subject',
      'notice_description',
      'notice_recipient_emails',
      'notice_sent_count',
      'notice_sent_at',
      'notice_created_at',
    ]
    const notices = await Notice.query()
      .whereNull('notice_deleted_at')
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(notice_subject) LIKE ?', [`%${filters.search!.toUpperCase()}%`])
      })
      .select(selectedColumns)
      .orderBy('notice_created_at', 'desc')
      .paginate(filters.page, filters.limit)

    return notices
  }

  async create(notice: Notice, recipientEmployeeIds: number[] = [], sendEmails: boolean = true) {
    const newNotice = new Notice()
    newNotice.noticeSubject = notice.noticeSubject
    newNotice.noticeDescription = notice.noticeDescription
    newNotice.noticeSentCount = 0
    newNotice.noticeSentAt = null

    // Obtener empleados seleccionados
    const employees = await Employee.query()
      .whereNull('employee_deleted_at')
      .whereIn('employee_id', recipientEmployeeIds)
      .whereNotNull('employee_business_email')
      .where('employee_business_email', '!=', '')

    const recipientEmails: string[] = []
    const recipientData: Array<{
      employeeId: number | null
      employeeEmail: string
      employeeName: string | null
    }> = []

    for (const employee of employees) {
      if (employee.employeeBusinessEmail) {
        const email = employee.employeeBusinessEmail.trim()
        recipientEmails.push(email)
        recipientData.push({
          employeeId: employee.employeeId,
          employeeEmail: email,
          employeeName: `${employee.employeeFirstName || ''} ${employee.employeeLastName || ''} ${employee.employeeSecondLastName || ''}`.trim() || null,
        })
      }
    }

    newNotice.noticeRecipientEmails = JSON.stringify(recipientEmails)
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
      noticeRecipient.noticeRecipientError = null
      await noticeRecipient.save()
    }

    // Enviar correos automáticamente al crear
    if (sendEmails && recipientData.length > 0) {
      await this.sendNoticeEmails(newNotice.noticeId, false)
    }

    return newNotice
  }

  async update(currentNotice: Notice, notice: Notice, sendEmails: boolean = true, recipientEmployeeIds: number[] = []) {
    currentNotice.noticeSubject = notice.noticeSubject
    currentNotice.noticeDescription = notice.noticeDescription
    await currentNotice.save()

    // Actualizar destinatarios siempre que se proporcione un array
    if (recipientEmployeeIds.length > 0) {
      // Obtener empleados seleccionados
      const employees = await Employee.query()
        .whereNull('employee_deleted_at')
        .whereIn('employee_id', recipientEmployeeIds)
        .whereNotNull('employee_business_email')
        .where('employee_business_email', '!=', '')


      const recipientEmails: string[] = []
      const recipientData: Array<{
        employeeId: number | null
        employeeEmail: string
        employeeName: string | null
      }> = []

      for (const employee of employees) {
        if (employee.employeeBusinessEmail) {
          const email = employee.employeeBusinessEmail.trim()
          recipientEmails.push(email)
          recipientData.push({
            employeeId: employee.employeeId,
            employeeEmail: email,
            employeeName: `${employee.employeeFirstName || ''} ${employee.employeeLastName || ''} ${employee.employeeSecondLastName || ''}`.trim() || null,
          })
        }
      }

      // Actualizar la lista de emails en el notice
      currentNotice.noticeRecipientEmails = JSON.stringify(recipientEmails)
      await currentNotice.save()

      // Obtener destinatarios existentes
      const existingRecipients = await NoticeRecipient.query()
        .whereNull('notice_recipient_deleted_at')
        .where('notice_id', currentNotice.noticeId)

      const existingEmployeeIds = existingRecipients
        .map((r) => r.employeeId)
        .filter((id): id is number => id !== null)

      // Identificar destinatarios a agregar y eliminar
      const newEmployeeIds = recipientEmployeeIds.filter((id) => !existingEmployeeIds.includes(id))
      const removedEmployeeIds = existingEmployeeIds.filter((id) => !recipientEmployeeIds.includes(id))


      // Eliminar destinatarios que ya no están en la lista
      if (removedEmployeeIds.length > 0) {
        await NoticeRecipient.query()
          .whereNull('notice_recipient_deleted_at')
          .where('notice_id', currentNotice.noticeId)
          .whereIn('employee_id', removedEmployeeIds)
          .delete()
      }

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
      await this.sendNoticeEmails(currentNotice.noticeId, true)
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

  async show(noticeId: number) {
    const notice = await Notice.query()
      .whereNull('notice_deleted_at')
      .where('notice_id', noticeId)
      .preload('recipients')
      .first()
    return notice ? notice : null
  }

  /**
   * Método privado para enviar correos de un aviso
   * @param noticeId ID del aviso
   * @param isUpdate Si es true, agrega prefijo "Update" o "Actualización" al subject
   */
  private async sendNoticeEmails(noticeId: number, isUpdate: boolean = false) {
    const notice = await Notice.query()
      .whereNull('notice_deleted_at')
      .where('notice_id', noticeId)
      .preload('recipients', (query) => {
        query.whereNull('notice_recipient_deleted_at')
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
    const fromEmail = env.get('SMTP_USERNAME')

    // Obtener branding del sistema (solo una vez antes del loop)
    let tradeName = 'BO'
    let backgroundImageLogo = `${env.get('BACKGROUND_IMAGE_LOGO') || ''}`
    const systemSettingService = new SystemSettingService()
    const systemSettingActive = (await systemSettingService.getActive()) as unknown as SystemSetting
    if (systemSettingActive) {
      if (systemSettingActive.systemSettingLogo) {
        backgroundImageLogo = systemSettingActive.systemSettingLogo
      }
      if (systemSettingActive.systemSettingTradeName) {
        tradeName = systemSettingActive.systemSettingTradeName
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
            .from(fromEmail ? fromEmail : '', tradeName)
            .subject(emailSubject)
            .htmlView('emails/notice_mail', {
              noticeSubject: notice.noticeSubject,
              noticeDescription: notice.noticeDescription,
              tradeName,
              backgroundImageLogo,
            })
        })

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

  async sendNotice(noticeId: number) {
    return await this.sendNoticeEmails(noticeId, false)
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
    if (!notice.noticeDescription || notice.noticeDescription.trim() === '') {
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
}
