import Employee from '#models/employee'
import SystemSetting from '#models/system_setting'
import BusinessUnit from '#models/business_unit'
import User from '#models/user'
import {
  DEVELOPMENT_EMAIL_LIST,
  EMPLOYEE_CELEBRATION_EMAIL_KIND,
  type EmployeeCelebrationEmailKind,
} from '#constants/employee_celebration_email'
import {
  generateAnniversaryEmailHtml,
  generateAnniversaryReminderEmailHtml,
  generateBirthdayEmailHtml,
  generateBirthdayReminderEmailHtml,
} from '#services/helpers/employee_celebration_email_html'
import env from '#start/env'
import mail from '@adonisjs/mail/services/main'
import { DateTime } from 'luxon'

type CelebrationFlag = 'birthday' | 'anniversary'

export type EmployeeCelebrationSkipReason =
  | 'no_business_units'
  | 'no_employees'
  | 'no_hr_recipients'
  | 'process_error'

export type EmployeeCelebrationProcessSettingResult =
  | { sent: true; emailsSent: number; emailsSkippedDev: number; emailsFailed: number }
  | { sent: false; reason: EmployeeCelebrationSkipReason; error?: string }

export type EmployeeCelebrationSettingRunResult = {
  systemSettingId: number
  tradeName: string
} & EmployeeCelebrationProcessSettingResult

export type EmployeeCelebrationRunResult = {
  kind: EmployeeCelebrationEmailKind
  sent: boolean
  totalEmailsSent: number
  totalEmailsSkippedDev: number
  totalEmailsFailed: number
  processedSettings: number
  sentSettings: number
  failedSettings: number
  skippedSettings: number
  results: EmployeeCelebrationSettingRunResult[]
  reason?: 'no_system_setting' | EmployeeCelebrationSkipReason
}

export interface EmployeeCelebrationEmailLogger {
  info: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
}

/**
 * Correos de celebración (cumpleaños y aniversario laboral) iterando todos los
 * system settings activos con su flag correspondiente, segmentados por BUs del setting.
 */
export default class EmployeeCelebrationEmailService {
  private settingMatchesAllowedBusinessUnits(
    setting: SystemSetting,
    allowedBusinessUnitSlugs: string[]
  ): boolean {
    const units = this.parseBusinessUnitSlugs(setting.systemSettingBusinessUnits)
    return units.some((unit) => allowedBusinessUnitSlugs.includes(unit))
  }

  private parseBusinessUnitSlugs(csv: string | null | undefined): string[] {
    return (csv || '')
      .split(',')
      .map((unit) => unit.trim())
      .filter(Boolean)
  }

  resolveActiveSystemSettings(
    systemSettings: SystemSetting[],
    allowedBusinessUnitSlugs: string[],
    flag: CelebrationFlag
  ): SystemSetting[] {
    if (allowedBusinessUnitSlugs.length === 0) {
      return []
    }

    return systemSettings
      .filter((setting) => {
        if (setting.systemSettingActive !== 1) {
          return false
        }
        const flagEnabled =
          flag === 'birthday'
            ? setting.systemSettingBirthdayEmails === 1
            : setting.systemSettingAnniversaryEmails === 1
        if (!flagEnabled) {
          return false
        }
        return this.settingMatchesAllowedBusinessUnits(setting, allowedBusinessUnitSlugs)
      })
      .sort((a, b) => a.systemSettingId - b.systemSettingId)
  }

  private isNonProduction(): boolean {
    return env.get('NODE_ENV') !== 'production'
  }

  /**
   * En ambientes no productivos solo permite envío a la lista de desarrollo.
   */
  private canSendToRecipient(email: string): boolean {
    const normalized = email.trim()
    if (!normalized) {
      return false
    }
    if (!this.isNonProduction()) {
      return true
    }
    return DEVELOPMENT_EMAIL_LIST.some(
      (devEmail) => devEmail.toLowerCase() === normalized.toLowerCase()
    )
  }

  private async sendHtmlEmail(
    to: string,
    subject: string,
    html: string,
    log: EmployeeCelebrationEmailLogger,
    settingLabel: string
  ): Promise<'sent' | 'skipped_dev' | 'skipped_empty'> {
    const recipient = to.trim()
    if (!recipient) {
      return 'skipped_empty'
    }
    if (!this.canSendToRecipient(recipient)) {
      log.info(
        `${settingLabel}: correo omitido en ambiente no productivo (destinatario fuera de DEVELOPMENT_EMAIL_LIST)`
      )
      return 'skipped_dev'
    }
    await mail.send((message) => {
      message.to(recipient).subject(subject).html(html)
    })
    return 'sent'
  }

  private async fetchBirthdayEmployeesForReminder(
    month: number,
    day: number,
    businessUnitSlugs: string[]
  ): Promise<Employee[]> {
    return Employee.query()
      .whereNull('employee_deleted_at')
      .whereHas('businessUnit', (businessUnitQuery) => {
        businessUnitQuery.whereIn('business_unit_slug', businessUnitSlugs)
      })
      .whereHas('person', (personQuery) => {
        personQuery
          .whereNotNull('person_birthday')
          .whereRaw('MONTH(person_birthday) = ?', [month])
          .whereRaw('DAY(person_birthday) = ?', [day])
      })
      .preload('person')
      .preload('businessUnit')
      .preload('department')
      .preload('position')
  }

  private async fetchBirthdayEmployees(
    month: number,
    day: number,
    businessUnitSlugs: string[]
  ): Promise<Employee[]> {
    return Employee.query()
      .whereNull('employee_deleted_at')
      .whereHas('businessUnit', (businessUnitQuery) => {
        businessUnitQuery.whereIn('business_unit_slug', businessUnitSlugs)
      })
      .whereHas('person', (personQuery) => {
        personQuery
          .whereNotNull('person_birthday')
          .whereNotNull('person_email')
          .whereRaw('MONTH(person_birthday) = ?', [month])
          .whereRaw('DAY(person_birthday) = ?', [day])
      })
      .preload('person')
      .preload('businessUnit')
      .preload('department')
      .preload('position')
  }

  private async fetchAnniversaryEmployees(
    month: number,
    day: number,
    year: number,
    businessUnitSlugs: string[]
  ): Promise<Employee[]> {
    return Employee.query()
      .whereNull('employee_deleted_at')
      .whereNotNull('employee_hire_date')
      .whereNotNull('employee_business_email')
      .whereRaw('MONTH(employee_hire_date) = ?', [month])
      .whereRaw('DAY(employee_hire_date) = ?', [day])
      .whereRaw('YEAR(employee_hire_date) < ?', [year])
      .whereHas('businessUnit', (businessUnitQuery) => {
        businessUnitQuery.whereIn('business_unit_slug', businessUnitSlugs)
      })
      .preload('person')
      .preload('businessUnit')
      .preload('department')
      .preload('position')
  }

  private async fetchHrUsers(businessUnitSlugs: string[]): Promise<User[]> {
    if (businessUnitSlugs.length === 0) {
      return []
    }

    const normalizedSlugs = businessUnitSlugs.map((slug) => slug.trim()).filter(Boolean)

    return User.query()
      .whereNull('user_deleted_at')
      .where('user_active', 1)
      .whereNotNull('user_email')
      .whereRaw("TRIM(user_email) <> ''")
      .whereHas('role', (roleQuery) => {
        roleQuery
          .whereNull('role_deleted_at')
          .where('role_active', 1)
          .whereRaw('LOWER(TRIM(role_slug)) = ?', ['rh-manager'])
          .whereNotNull('role_business_access')
          .andWhere((accessQuery) => {
            for (const slug of normalizedSlugs) {
              accessQuery.orWhereRaw('FIND_IN_SET(?, role_business_access)', [slug])
            }
          })
      })
      .preload('person')
      .preload('role')
  }

  private formatSettingLabel(setting: SystemSetting): string {
    return `${setting.systemSettingTradeName} (id ${setting.systemSettingId})`
  }

  private async processBirthdayEmployeeSetting(
    systemSetting: SystemSetting,
    today: DateTime,
    log: EmployeeCelebrationEmailLogger
  ): Promise<EmployeeCelebrationProcessSettingResult> {
    const settingLabel = this.formatSettingLabel(systemSetting)
    const businessUnitSlugs = this.parseBusinessUnitSlugs(systemSetting.systemSettingBusinessUnits)

    if (businessUnitSlugs.length === 0) {
      log.warning(`${settingLabel}: el system setting no tiene unidades de negocio configuradas`)
      return { sent: false, reason: 'no_business_units' }
    }

    const employees = await this.fetchBirthdayEmployees(today.month, today.day, businessUnitSlugs)
    if (employees.length === 0) {
      log.info(`${settingLabel}: sin cumpleaños elegibles hoy en sus unidades de negocio`)
      return { sent: false, reason: 'no_employees' }
    }

    let emailsSent = 0
    let emailsSkippedDev = 0
    let emailsFailed = 0

    for (const employee of employees) {
      const person = employee.person
      const recipient = person.personEmail?.trim() ?? ''
      const html = generateBirthdayEmailHtml(
        person.personFirstname,
        person.personLastname,
        systemSetting.systemSettingTradeName,
        systemSetting.systemSettingSidebarColor,
        systemSetting.systemSettingLogo
      )
      const subject = `¡Feliz Cumpleaños! - ${systemSetting.systemSettingTradeName}`

      try {
        const outcome = await this.sendHtmlEmail(recipient, subject, html, log, settingLabel)
        if (outcome === 'sent') {
          emailsSent++
        } else if (outcome === 'skipped_dev') {
          emailsSkippedDev++
        }
      } catch (e: unknown) {
        emailsFailed++
        const message = e instanceof Error ? e.message : String(e)
        log.error(`${settingLabel}: error al enviar felicitación de cumpleaños: ${message}`)
      }
    }

    log.info(
      `${settingLabel}: cumpleaños empleado — enviados ${emailsSent}, omitidos dev ${emailsSkippedDev}, fallidos ${emailsFailed}, elegibles ${employees.length}`
    )

    return emailsSent > 0 || emailsSkippedDev > 0
      ? { sent: true, emailsSent, emailsSkippedDev, emailsFailed }
      : { sent: false, reason: emailsFailed > 0 ? 'process_error' : 'no_employees' }
  }

  private async processBirthdayReminderSetting(
    systemSetting: SystemSetting,
    today: DateTime,
    log: EmployeeCelebrationEmailLogger
  ): Promise<EmployeeCelebrationProcessSettingResult> {
    const settingLabel = this.formatSettingLabel(systemSetting)
    const businessUnitSlugs = this.parseBusinessUnitSlugs(systemSetting.systemSettingBusinessUnits)

    if (businessUnitSlugs.length === 0) {
      log.warning(`${settingLabel}: el system setting no tiene unidades de negocio configuradas`)
      return { sent: false, reason: 'no_business_units' }
    }

    const employees = await this.fetchBirthdayEmployeesForReminder(
      today.month,
      today.day,
      businessUnitSlugs
    )
    if (employees.length === 0) {
      log.info(`${settingLabel}: sin cumpleaños para recordatorio a RH hoy`)
      return { sent: false, reason: 'no_employees' }
    }

    const hrUsers = await this.fetchHrUsers(businessUnitSlugs)
    if (hrUsers.length === 0) {
      log.warning(`${settingLabel}: no hay usuarios RH elegibles para recordatorio de cumpleaños`)
      return { sent: false, reason: 'no_hr_recipients' }
    }

    let emailsSent = 0
    let emailsSkippedDev = 0
    let emailsFailed = 0

    for (const hrUser of hrUsers) {
      const person = hrUser.person
      const html = generateBirthdayReminderEmailHtml(
        person.personFirstname,
        person.personLastname,
        employees,
        systemSetting.systemSettingTradeName,
        systemSetting.systemSettingSidebarColor,
        systemSetting.systemSettingLogo
      )
      const subject = `🎂 Recordatorio: Empleados que cumplen años hoy - ${systemSetting.systemSettingTradeName}`

      try {
        const outcome = await this.sendHtmlEmail(
          hrUser.userEmail,
          subject,
          html,
          log,
          settingLabel
        )
        if (outcome === 'sent') {
          emailsSent++
        } else if (outcome === 'skipped_dev') {
          emailsSkippedDev++
        }
      } catch (e: unknown) {
        emailsFailed++
        const message = e instanceof Error ? e.message : String(e)
        log.error(`${settingLabel}: error al enviar recordatorio de cumpleaños a RH: ${message}`)
      }
    }

    log.info(
      `${settingLabel}: recordatorio cumpleaños RH — enviados ${emailsSent}, omitidos dev ${emailsSkippedDev}, fallidos ${emailsFailed}, RH ${hrUsers.length}, cumpleañeros ${employees.length}`
    )

    return emailsSent > 0 || emailsSkippedDev > 0
      ? { sent: true, emailsSent, emailsSkippedDev, emailsFailed }
      : { sent: false, reason: emailsFailed > 0 ? 'process_error' : 'no_hr_recipients' }
  }

  private async processAnniversaryEmployeeSetting(
    systemSetting: SystemSetting,
    today: DateTime,
    log: EmployeeCelebrationEmailLogger
  ): Promise<EmployeeCelebrationProcessSettingResult> {
    const settingLabel = this.formatSettingLabel(systemSetting)
    const businessUnitSlugs = this.parseBusinessUnitSlugs(systemSetting.systemSettingBusinessUnits)

    if (businessUnitSlugs.length === 0) {
      log.warning(`${settingLabel}: el system setting no tiene unidades de negocio configuradas`)
      return { sent: false, reason: 'no_business_units' }
    }

    const employees = await this.fetchAnniversaryEmployees(
      today.month,
      today.day,
      today.year,
      businessUnitSlugs
    )
    if (employees.length === 0) {
      log.info(`${settingLabel}: sin aniversarios laborales elegibles hoy`)
      return { sent: false, reason: 'no_employees' }
    }

    let emailsSent = 0
    let emailsSkippedDev = 0
    let emailsFailed = 0

    for (const employee of employees) {
      const person = employee.person
      let yearsOfService = 0
      if (employee.employeeHireDate) {
        yearsOfService = Math.floor(today.diff(employee.employeeHireDate, 'years').years)
      }

      const html = generateAnniversaryEmailHtml(
        person.personFirstname,
        person.personLastname,
        yearsOfService,
        systemSetting.systemSettingTradeName,
        systemSetting.systemSettingSidebarColor,
        systemSetting.systemSettingLogo
      )
      const subject = `¡Feliz Aniversario! - ${systemSetting.systemSettingTradeName}`

      try {
        const outcome = await this.sendHtmlEmail(
          employee.employeeBusinessEmail,
          subject,
          html,
          log,
          settingLabel
        )
        if (outcome === 'sent') {
          emailsSent++
        } else if (outcome === 'skipped_dev') {
          emailsSkippedDev++
        }
      } catch (e: unknown) {
        emailsFailed++
        const message = e instanceof Error ? e.message : String(e)
        log.error(`${settingLabel}: error al enviar felicitación de aniversario: ${message}`)
      }
    }

    log.info(
      `${settingLabel}: aniversario empleado — enviados ${emailsSent}, omitidos dev ${emailsSkippedDev}, fallidos ${emailsFailed}, elegibles ${employees.length}`
    )

    return emailsSent > 0 || emailsSkippedDev > 0
      ? { sent: true, emailsSent, emailsSkippedDev, emailsFailed }
      : { sent: false, reason: emailsFailed > 0 ? 'process_error' : 'no_employees' }
  }

  private async processAnniversaryReminderSetting(
    systemSetting: SystemSetting,
    today: DateTime,
    log: EmployeeCelebrationEmailLogger
  ): Promise<EmployeeCelebrationProcessSettingResult> {
    const settingLabel = this.formatSettingLabel(systemSetting)
    const businessUnitSlugs = this.parseBusinessUnitSlugs(systemSetting.systemSettingBusinessUnits)

    if (businessUnitSlugs.length === 0) {
      log.warning(`${settingLabel}: el system setting no tiene unidades de negocio configuradas`)
      return { sent: false, reason: 'no_business_units' }
    }

    const employees = await this.fetchAnniversaryEmployees(
      today.month,
      today.day,
      today.year,
      businessUnitSlugs
    )
    if (employees.length === 0) {
      log.info(`${settingLabel}: sin aniversarios para recordatorio a RH hoy`)
      return { sent: false, reason: 'no_employees' }
    }

    const hrUsers = await this.fetchHrUsers(businessUnitSlugs)
    if (hrUsers.length === 0) {
      log.warning(`${settingLabel}: no hay usuarios RH elegibles para recordatorio de aniversario`)
      return { sent: false, reason: 'no_hr_recipients' }
    }

    let emailsSent = 0
    let emailsSkippedDev = 0
    let emailsFailed = 0

    for (const hrUser of hrUsers) {
      const person = hrUser.person
      const html = generateAnniversaryReminderEmailHtml(
        person.personFirstname,
        person.personLastname,
        employees,
        systemSetting.systemSettingTradeName,
        systemSetting.systemSettingSidebarColor,
        systemSetting.systemSettingLogo
      )
      const subject = `🎂 Recordatorio: Empleados que cumplen aniversario hoy - ${systemSetting.systemSettingTradeName}`

      try {
        const outcome = await this.sendHtmlEmail(
          hrUser.userEmail,
          subject,
          html,
          log,
          settingLabel
        )
        if (outcome === 'sent') {
          emailsSent++
        } else if (outcome === 'skipped_dev') {
          emailsSkippedDev++
        }
      } catch (e: unknown) {
        emailsFailed++
        const message = e instanceof Error ? e.message : String(e)
        log.error(`${settingLabel}: error al enviar recordatorio de aniversario a RH: ${message}`)
      }
    }

    log.info(
      `${settingLabel}: recordatorio aniversario RH — enviados ${emailsSent}, omitidos dev ${emailsSkippedDev}, fallidos ${emailsFailed}, RH ${hrUsers.length}, aniversarios ${employees.length}`
    )

    return emailsSent > 0 || emailsSkippedDev > 0
      ? { sent: true, emailsSent, emailsSkippedDev, emailsFailed }
      : { sent: false, reason: emailsFailed > 0 ? 'process_error' : 'no_hr_recipients' }
  }

  private async processSetting(
    kind: EmployeeCelebrationEmailKind,
    systemSetting: SystemSetting,
    today: DateTime,
    log: EmployeeCelebrationEmailLogger
  ): Promise<EmployeeCelebrationProcessSettingResult> {
    switch (kind) {
      case EMPLOYEE_CELEBRATION_EMAIL_KIND.BIRTHDAY_EMPLOYEE:
        return this.processBirthdayEmployeeSetting(systemSetting, today, log)
      case EMPLOYEE_CELEBRATION_EMAIL_KIND.BIRTHDAY_HR_REMINDER:
        return this.processBirthdayReminderSetting(systemSetting, today, log)
      case EMPLOYEE_CELEBRATION_EMAIL_KIND.ANNIVERSARY_EMPLOYEE:
        return this.processAnniversaryEmployeeSetting(systemSetting, today, log)
      case EMPLOYEE_CELEBRATION_EMAIL_KIND.ANNIVERSARY_HR_REMINDER:
        return this.processAnniversaryReminderSetting(systemSetting, today, log)
    }
  }

  private celebrationFlagForKind(kind: EmployeeCelebrationEmailKind): CelebrationFlag {
    return kind === EMPLOYEE_CELEBRATION_EMAIL_KIND.BIRTHDAY_EMPLOYEE ||
      kind === EMPLOYEE_CELEBRATION_EMAIL_KIND.BIRTHDAY_HR_REMINDER
      ? 'birthday'
      : 'anniversary'
  }

  private logRunSummary(
    kind: EmployeeCelebrationEmailKind,
    results: EmployeeCelebrationSettingRunResult[],
    totals: {
      totalEmailsSent: number
      totalEmailsSkippedDev: number
      totalEmailsFailed: number
    },
    log: EmployeeCelebrationEmailLogger
  ): void {
    const sentSettings = results.filter((r) => r.sent).length
    const failedSettings = results.filter(
      (r) => !r.sent && r.reason === 'process_error'
    ).length
    const skippedSettings = results.length - sentSettings - failedSettings

    const parts = [`${results.length} empresa(s) evaluada(s)`]
    if (sentSettings > 0) {
      parts.push(`${sentSettings} con envío (${totals.totalEmailsSent} correo(s))`)
    }
    if (skippedSettings > 0) {
      parts.push(`${skippedSettings} sin envío`)
    }
    if (failedSettings > 0) {
      parts.push(`${failedSettings} con error`)
    }
    if (totals.totalEmailsSkippedDev > 0) {
      parts.push(`${totals.totalEmailsSkippedDev} omitido(s) en dev`)
    }
    if (totals.totalEmailsFailed > 0) {
      parts.push(`${totals.totalEmailsFailed} fallo(s) de envío`)
    }

    log.info(`Resumen de corrida (${kind}): ${parts.join('; ')}`)
  }

  async run(
    kind: EmployeeCelebrationEmailKind,
    logger?: EmployeeCelebrationEmailLogger
  ): Promise<EmployeeCelebrationRunResult> {
    const log: EmployeeCelebrationEmailLogger = {
      info: (message) => logger?.info(message),
      error: (message) => logger?.error(message),
      warning: (message) => logger?.warning(message),
    }

    const today = DateTime.now()
    log.info(
      `Buscando celebraciones (${kind}) para ${today.month}/${today.day}/${today.year}`
    )

    const flag = this.celebrationFlagForKind(kind)
    const selectFields =
      flag === 'birthday'
        ? [
            'system_setting_id',
            'system_setting_business_units',
            'system_setting_active',
            'system_setting_trade_name',
            'system_setting_sidebar_color',
            'system_setting_logo',
            'system_setting_birthday_emails',
          ]
        : [
            'system_setting_id',
            'system_setting_business_units',
            'system_setting_active',
            'system_setting_trade_name',
            'system_setting_sidebar_color',
            'system_setting_logo',
            'system_setting_anniversary_emails',
          ]

    const systemSettings = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_active', 1)
      .select(...selectFields)

    const activeUnits = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .where('business_unit_active', 1)
      .select('business_unit_slug')
    const allowedBusinessUnitSlugs = activeUnits.map((unit) => unit.businessUnitSlug).filter(Boolean)

    const activeSettings = this.resolveActiveSystemSettings(
      systemSettings as SystemSetting[],
      allowedBusinessUnitSlugs,
      flag
    )

    if (activeSettings.length === 0) {
      log.warning(
        flag === 'birthday'
          ? 'No hay system settings activos con correos de cumpleaños habilitados'
          : 'No hay system settings activos con correos de aniversario habilitados'
      )
      return {
        kind,
        sent: false,
        reason: 'no_system_setting',
        totalEmailsSent: 0,
        totalEmailsSkippedDev: 0,
        totalEmailsFailed: 0,
        processedSettings: 0,
        sentSettings: 0,
        failedSettings: 0,
        skippedSettings: 0,
        results: [],
      }
    }

    const results: EmployeeCelebrationSettingRunResult[] = []
    let totalEmailsSent = 0
    let totalEmailsSkippedDev = 0
    let totalEmailsFailed = 0

    for (const systemSetting of activeSettings) {
      const settingLabel = this.formatSettingLabel(systemSetting)
      try {
        const result = await this.processSetting(kind, systemSetting, today, log)
        results.push({
          systemSettingId: systemSetting.systemSettingId,
          tradeName: systemSetting.systemSettingTradeName,
          ...result,
        })
        if (result.sent) {
          totalEmailsSent += result.emailsSent
          totalEmailsSkippedDev += result.emailsSkippedDev
          totalEmailsFailed += result.emailsFailed
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        log.error(`${settingLabel}: error inesperado al procesar celebración: ${message}`)
        results.push({
          systemSettingId: systemSetting.systemSettingId,
          tradeName: systemSetting.systemSettingTradeName,
          sent: false,
          reason: 'process_error',
          error: message,
        })
      }
    }

    const sentSettings = results.filter((r) => r.sent).length
    const failedSettings = results.filter(
      (r) => !r.sent && r.reason === 'process_error'
    ).length
    const skippedSettings = results.length - sentSettings - failedSettings

    this.logRunSummary(
      kind,
      results,
      { totalEmailsSent, totalEmailsSkippedDev, totalEmailsFailed },
      log
    )

    const failedResult = results.find((r) => !r.sent && r.reason === 'process_error')
    const lastResult = results[results.length - 1]
    const lastReason =
      failedResult && failedResult.sent === false
        ? failedResult.reason
        : lastResult && lastResult.sent === false
          ? lastResult.reason
          : 'no_employees'

    return {
      kind,
      sent: totalEmailsSent > 0,
      reason: totalEmailsSent > 0 ? undefined : lastReason,
      totalEmailsSent,
      totalEmailsSkippedDev,
      totalEmailsFailed,
      processedSettings: activeSettings.length,
      sentSettings,
      failedSettings,
      skippedSettings,
      results,
    }
  }
}
