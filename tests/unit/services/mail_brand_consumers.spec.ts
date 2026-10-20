import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Los avisos de queja, solicitudes y teletrabajo salen con la marca de
 * Valanserh. El de faltas usa el nombre y el color de la plataforma, y deja
 * el nombre de la empresa solo en el asunto y el título.
 */

const ROOT = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf-8')
}

function codeOnly(content: string): string {
  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*')
    })
    .join('\n')
}

const BRANDED = [
  'app/services/complaint_notification_service.ts',
  'app/services/exception_request_notification_service.ts',
  'app/modules/telework-policy/telework_policy_notification.service.ts',
] as const

test.group('Marca Valanserh de los avisos por correo', () => {
  test('quejas, solicitudes y teletrabajo toman la marca del producto', ({ assert }) => {
    for (const path of BRANDED) {
      const content = codeOnly(read(path))
      assert.include(content, "from '#constants/mail_branding'", path)
      assert.include(content, 'MAIL_BRAND_TRADE_NAME', path)
      assert.include(content, 'MAIL_BRAND_LOGO_URL', path)
      assert.notInclude(content, 'DEFAULT_MAIL_LOGO', path)
      assert.notInclude(content, 'resolveBranding', path)
      assert.notInclude(content, 'systemSettingLogo', path)
      assert.notInclude(content, "'Valanserh'", path)
    }

    for (const path of [
      'app/services/complaint_notification_service.ts',
      'app/services/exception_request_notification_service.ts',
    ]) {
      assert.notInclude(codeOnly(read(path)), 'SystemSetting', path)
    }
  })

  test('el aviso de faltas usa el nombre y el color de Valanserh y conserva la empresa en el asunto', ({
    assert,
  }) => {
    const service = codeOnly(read('app/services/attendance_fault_hr_notification_service.ts'))
    assert.include(service, 'MAIL_BRAND_TRADE_NAME')
    assert.include(service, 'MAIL_BRAND_HEADER_COLOR')
    assert.include(service, 'companyName')
    assert.notInclude(service, '#0a3057')
    assert.notInclude(service, 'formatSidebarColor')
    assert.notInclude(service, 'systemSettingSidebarColor')
    assert.notInclude(service, 'system_setting_sidebar_color')

    const template = read('resources/views/emails/attendance_fault_hr_batch.edge')
    assert.include(template, '{{ companyName }}')
    assert.include(template, '{{ headerColor }}')
    assert.notInclude(template, 'sidebarColor')
  })

  test('la identidad de correo declara nombre, logotipo y color de cabecera', ({ assert }) => {
    const branding = codeOnly(read('app/constants/mail_branding.ts'))
    assert.include(branding, 'MAIL_BRAND_TRADE_NAME')
    assert.include(branding, 'MAIL_BRAND_LOGO_URL')
    assert.include(branding, "MAIL_BRAND_HEADER_COLOR = '#0a3057'")
  })

  test('los nueve correos toman la marca de las constantes y dejan la empresa como contenido', ({
    assert,
  }) => {
    const celebration = codeOnly(read('app/services/employee_celebration_email_service.ts'))
    assert.include(celebration, '.from(resolveMailSender(), MAIL_BRAND_TRADE_NAME)')
    assert.notInclude(celebration, 'system_setting_sidebar_color')
    assert.notInclude(celebration, 'system_setting_logo')

    const helper = codeOnly(read('app/services/helpers/employee_celebration_email_html.ts'))
    assert.include(helper, 'function escapeHtml')
    assert.include(helper, 'MAIL_BRAND_LOGO_URL')
    assert.include(helper, 'MAIL_BRAND_HEADER_COLOR')
    assert.notInclude(helper, 'sidebarColor')

    const career = codeOnly(read('app/services/career_path_candidate_service.ts'))
    assert.include(career, 'MAIL_BRAND_TRADE_NAME')
    assert.include(career, 'MAIL_BRAND_LOGO_URL')
    assert.include(career, 'resolveByBusinessUnitId')
    assert.include(career, 'career_path_candidate_email_subject_without_company')
    assert.notInclude(career, "'BO'")
    assert.notInclude(career, 'BACKGROUND_IMAGE_LOGO')

    const lock = codeOnly(read('app/services/assist_service.ts'))
    assert.include(lock, '.from(userEmail, MAIL_BRAND_TRADE_NAME)')
    assert.include(lock, 'MAIL_BRAND_LOGO_URL')
    assert.include(lock, 'resolveForActiveTenant()')
    assert.notInclude(lock, "'BO'")
    assert.notInclude(lock, 'BACKGROUND_IMAGE_LOGO')

    const absence = codeOnly(read('app/services/notification_email_service.ts'))
    assert.include(absence, 'tradeName: MAIL_BRAND_TRADE_NAME')
    assert.include(absence, 'headerColor: MAIL_BRAND_HEADER_COLOR')
    assert.include(absence, 'backgroundImageLogo: MAIL_BRAND_LOGO_URL')
    assert.include(absence, '.from(resolveMailSender(), MAIL_BRAND_TRADE_NAME)')
    assert.notInclude(absence, 'systemSetting.systemSettingLogo')
    assert.notInclude(absence, 'systemSetting.systemSettingSidebarColor')

    const proceeding = codeOnly(read('app/services/proceeding_file_service.ts'))
    assert.include(proceeding, 'MAIL_BRAND_TRADE_NAME')
    assert.include(proceeding, 'MAIL_BRAND_LOGO_URL')
    assert.notInclude(proceeding, 'resolveForActiveTenant')
    assert.notInclude(proceeding, 'SystemSettingService')
    assert.notInclude(proceeding, 'BACKGROUND_IMAGE_LOGO')

    const seal = codeOnly(read('app/modules/work-journal/work_journal.seal_run_orchestrator.ts'))
    assert.notInclude(seal, 'system_setting_sidebar_color')
    assert.notInclude(seal, 'GSTI RH')
    const sealMail = codeOnly(read('app/mails/work_journal_seal_run_summary_mail.ts'))
    assert.include(sealMail, '.from(from, MAIL_BRAND_TRADE_NAME)')
    assert.include(sealMail, 'MAIL_BRAND_HEADER_COLOR')
    assert.include(sealMail, 'headerColor')

    const lactation = codeOnly(read('app/services/employee_lactation_notification_service.ts'))
    assert.include(lactation, 'companyName: setting.systemSettingTradeName')
    assert.notInclude(lactation, 'formatSidebarColor')
    const lactationMail = codeOnly(read('app/mails/lactation_expiring_mail.ts'))
    assert.include(lactationMail, '.from(from, MAIL_BRAND_TRADE_NAME)')
    assert.include(lactationMail, 'headerColor: MAIL_BRAND_HEADER_COLOR')

    const repse = codeOnly(read('app/services/repse_folio_aviso_service.ts'))
    assert.include(repse, 'companyName: setting.systemSettingTradeName')
    assert.notInclude(repse, 'formatSidebarColor')
    const repseMail = codeOnly(read('app/mails/repse_folio_expiring_mail.ts'))
    assert.include(repseMail, '.from(from, MAIL_BRAND_TRADE_NAME)')
    assert.include(repseMail, 'headerColor: MAIL_BRAND_HEADER_COLOR')

    const digest = codeOnly(read('app/modules/assist-location-flag/assist_location_flag_digest.service.ts'))
    assert.include(digest, '.from(sender, MAIL_BRAND_TRADE_NAME)')
    assert.include(digest, 'MAIL_BRAND_HEADER_COLOR')
    assert.include(digest, 'companyName:')
    assert.notInclude(digest, 'DEFAULT_SIDEBAR_COLOR')
    assert.notInclude(digest, 'sidebarColor')

    for (const template of [
      'resources/views/emails/attendance_lock.edge',
      'resources/views/emails/attendance_lock_rh.edge',
      'resources/views/emails/proceeding_files_report.edge',
    ]) {
      const html = read(template)
      assert.notInclude(html, 'sae-assets', template)
      assert.notInclude(html, 'logo_sae', template)
    }

    const vacation = read('resources/views/emails/vacation_permission_notification.edge')
    assert.notInclude(vacation, 'systemSetting.')
    assert.include(vacation, '{{ tradeName }}')
    assert.include(vacation, '{{ headerColor }}')
    assert.include(vacation, '{{ backgroundImageLogo }}')
  })

  test('los correos de acceso toman la marca de las constantes y conservan la marca blanca apagada', ({
    assert,
  }) => {
    for (const path of [
      'app/services/auth_mail_service.ts',
      'app/mails/magic_link_mail.ts',
      'app/mails/welcome_mail.ts',
    ]) {
      const content = codeOnly(read(path))
      assert.include(content, 'MAIL_BRAND_TRADE_NAME', path)
      assert.include(content, 'MAIL_BRAND_LOGO_URL', path)
      assert.include(content, 'isWhiteLabel', path)
      assert.notInclude(content, "'Valanserh'", path)
      assert.notInclude(content, 'logotipo-min.png', path)
    }

    const auth = codeOnly(read('app/services/auth_mail_service.ts'))
    assert.include(auth, 'resolveBranding')

    for (const path of ['app/services/user_service.ts', 'app/controllers/user_controller.ts']) {
      const content = codeOnly(read(path))
      assert.include(content, 'MAIL_BRAND_TRADE_NAME', path)
      assert.include(content, 'MAIL_BRAND_LOGO_URL', path)
      assert.notInclude(content, "'Valanserh'", path)
    }

    assert.include(read('resources/views/emails/request_password.edge'), 'alt="{{ tradeName }}"')
  })

  test('facturación toma el color y el nombre de la identidad de correo', ({ assert }) => {
    const billingMails = [
      'app/mails/billing_provider_compensation_failed_mail.ts',
      'app/mails/billing_provider_invoice_held_mail.ts',
      'app/mails/billing_provider_payment_misaligned_mail.ts',
      'app/mails/billing_provider_payment_unsettled_mail.ts',
      'app/mails/billing_provider_subscription_state_mail.ts',
      'app/mails/billing_provider_account_issue_mail.ts',
      'app/mails/subscription_change_not_applicable_mail.ts',
      'app/mails/subscription_change_requested_mail.ts',
    ]
    for (const path of billingMails) {
      const content = codeOnly(read(path))
      assert.include(content, 'MAIL_BRAND_HEADER_COLOR', path)
      assert.notInclude(content, 'DEFAULT_SIDEBAR_COLOR', path)
      assert.notInclude(content, "'#0a3057'", path)
    }

    const renewal = codeOnly(read('app/services/billing_tenant_service.ts'))
    assert.include(renewal, 'MAIL_BRAND_TRADE_NAME')
    assert.include(renewal, 'MAIL_BRAND_LOGO_URL')
    assert.notInclude(renewal, "'Valanserh'")

    const internal = codeOnly(read('app/services/billing_internal_notification_service.ts'))
    assert.include(internal, 'MAIL_BRAND_TRADE_NAME')
    assert.notInclude(internal, 'SENDER_TRADE_NAME')
  })

  test('el barrido de marca no deja literales fuera de la identidad de correo', ({ assert }) => {
    const pattern = /'Valanserh'|logotipo-min|'#0a3057'|BACKGROUND_IMAGE_LOGO/
    const leftovers: string[] = []

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          if (entry === 'node_modules' || entry === '__TO_DELETE__') continue
          walk(full)
          continue
        }
        if (!full.endsWith('.ts') && !full.endsWith('.edge') && !full.endsWith('.json')) continue
        const relative = full.slice(ROOT.length + 1)
        if (relative === 'app/constants/mail_branding.ts') continue
        const content = readFileSync(full, 'utf-8')
        if (!pattern.test(content)) continue
        if (
          relative === 'app/constants/system_setting_defaults.ts' &&
          content.includes("PLATFORM_FALLBACK_TRADE_NAME = 'Valanserh'") &&
          !content.includes('logotipo-min') &&
          !content.includes('#0a3057') &&
          !content.includes('BACKGROUND_IMAGE_LOGO')
        ) {
          continue
        }
        leftovers.push(relative)
      }
    }

    walk(join(ROOT, 'app'))
    const example = read('.env.example')
    if (pattern.test(example)) leftovers.push('.env.example')

    assert.deepEqual(leftovers, [])

    const localColor = /formatSidebarColor|DEFAULT_SIDEBAR_COLOR|MAIL_HEADER_COLOR =/
    const colorLeftovers: string[] = []
    const walkColor = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          if (entry === 'node_modules' || entry === '__TO_DELETE__') continue
          walkColor(full)
          continue
        }
        if (!full.endsWith('.ts')) continue
        if (localColor.test(readFileSync(full, 'utf-8'))) {
          colorLeftovers.push(full.slice(ROOT.length + 1))
        }
      }
    }
    walkColor(join(ROOT, 'app'))
    assert.deepEqual(colorLeftovers, [])
  })

  test('los gates de envío y el escape de plantilla se conservan', ({ assert }) => {
    const celebration = codeOnly(read('app/services/employee_celebration_email_service.ts'))
    assert.isBelow(
      celebration.indexOf('canSendToRecipient'),
      celebration.indexOf('mail.send'),
      'el filtro de desarrollo corre antes del envío'
    )
    assert.include(celebration, 'system_setting_trade_name')
    assert.include(celebration, 'system_setting_birthday_emails')
    assert.include(celebration, 'system_setting_anniversary_emails')

    const lock = read('app/services/assist_service.ts')
    assert.include(lock, 'if (systemSettingActive)')
    assert.include(lock, 'getAccessibleIds(user)')
    assert.include(lock, 'claimAttendanceLockNotice')

    const repse = codeOnly(read('app/services/repse_folio_aviso_service.ts'))
    assert.include(repse, 'if (!simulateSend)')

    const digest = codeOnly(read('app/modules/assist-location-flag/assist_location_flag_digest.service.ts'))
    assert.include(digest, 'isDevelopmentRecipient')
    assert.include(digest, '.to(sender)')
    assert.include(digest, '.bcc(')

    const auth = codeOnly(read('app/services/auth_mail_service.ts'))
    assert.include(auth, 'const isWhiteLabel = false')
    assert.include(auth, 'resolveBranding')

    for (const template of [
      'resources/views/emails/vacation_permission_notification.edge',
      'resources/views/emails/lactation_expiring.edge',
      'resources/views/emails/repse_folio_expiring.edge',
      'resources/views/emails/work_journal_seal_run_summary.edge',
      'resources/views/emails/assist_location_flag_digest.edge',
      'resources/views/emails/attendance_lock.edge',
      'resources/views/emails/attendance_lock_rh.edge',
      'resources/views/emails/proceeding_files_report.edge',
    ]) {
      const html = read(template)
      assert.notInclude(html, '{{{ companyName', template)
      assert.notInclude(html, '{{{ tradeName', template)
    }
  })

  test('los placeholders de empresa y de marca coinciden en ambos idiomas', ({ assert }) => {
    const es = JSON.parse(read('resources/langs/es.json'))
    const en = JSON.parse(read('resources/langs/en.json'))

    for (const catalog of [es, en]) {
      const lactation = catalog.employee_lactation_expiring_notification
      assert.include(lactation.subject, '{companyName}')
      assert.notInclude(lactation.subject, '{tradeName}')
      assert.include(lactation.intro, '{companyName}')
      assert.include(lactation.footer, '{tradeName}')

      const repse = catalog.repse_folio_expiring_notification
      assert.notInclude(repse.subject, '{companyName}')
      assert.notInclude(repse.subject, '{tradeName}')
      assert.include(repse.intro, '{companyName}')
      assert.include(repse.footer, '{tradeName}')

      assert.include(catalog.career_path_candidate_email_subject, '{companyName}')
      assert.notInclude(catalog.career_path_candidate_email_subject, '{tradeName}')
      assert.isString(catalog.career_path_candidate_email_subject_without_company)
      assert.notInclude(catalog.career_path_candidate_email_subject_without_company, '{companyName}')
      assert.notInclude(catalog.career_path_candidate_email_subject_without_company, 'BO')
    }
  })
})
