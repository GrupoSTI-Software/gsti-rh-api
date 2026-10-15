import { readFileSync } from 'node:fs'
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
    assert.include(service, 'companyName')
    assert.include(service, '#0a3057')
    assert.notInclude(service, 'formatSidebarColor')
    assert.notInclude(service, 'systemSettingSidebarColor')
    assert.notInclude(service, 'system_setting_sidebar_color')

    const template = read('resources/views/emails/attendance_fault_hr_batch.edge')
    assert.include(template, '{{ companyName }}')
    assert.include(template, '{{ headerColor }}')
    assert.notInclude(template, 'sidebarColor')
  })
})
