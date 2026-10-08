import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import Role from '#models/role'
import SystemSetting from '#models/system_setting'
import TraumaticEventReport from '#models/traumatic_event_report'
import TraumaticEventType from '#models/traumatic_event_type'
import User from '#models/user'
import { MAIL_BRAND_LOGO_URL, MAIL_BRAND_TRADE_NAME } from '#constants/mail_branding'
import { TRAUMATIC_EVENT_REPORT_BOARD_MODULE_PATH } from '#constants/traumatic_event_report_notification'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import { TenantContext } from '#utils/tenant_context'
import TraumaticEventReportNotificationService from '#services/traumatic_event_report_notification_service'
import TraumaticEventReportService from '#services/traumatic_event_report_service'

const MODULE = 'traumatic-event-reports'
const ACTION = 'update'
const SECRET_DESCRIPTION = 'DescripcionSecretaNoDebeSalir'
const SECRET_INVOLVED = 'InvolucradosSecretosNoDebenSalir'
const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

type Account = { user: User; person: Person }
type LogFn = (obj: unknown, message?: string) => void
type LogCall = { data: Record<string, unknown>; message: string }

test.group('Aviso de reporte de evento traumático a RH', (group) => {
  let permissionId = 0
  let moduleId = 0
  let readPermissionId = 0
  let registryPermissionId = 0

  group.setup(async () => {
    permissionId = await permissionOf(MODULE, ACTION)
    moduleId = await moduleOf(MODULE)
    readPermissionId = await permissionOf(MODULE, 'read')
    registryPermissionId = await firstPermissionOf('traumatic-event-reports-registry')
  })

  test('CA-01 y CA-S17 el correo lleva la marca Valanserh y la constancia queda sent', async ({
    assert,
  }) => {
    const world = await buildWorld('envio')
    const report = await saveReport(world, world.hr, 'employee')
    const service = new TraumaticEventReportNotificationService(() => true)
    const fake = mail.fake()

    try {
      await service.notifyOnNewEmployeeReport(report.traumaticEventReportId, world.unit.businessUnitId)
      const sent = fake.mails.sent()
      assert.lengthOf(sent, 1)
      const html = String(sent[0].message.nodeMailerMessage.html ?? '')
      const subject = String(sent[0].message.nodeMailerMessage.subject ?? '')
      assert.include(subject, world.tradeName)
      assert.include(subject, 'nuevo reporte que requiere tu atención')
      assert.notInclude(subject, 'TrabajadorUnico')
      assert.notInclude(subject, 'TipoUnico')
      assert.include(html, world.tradeName)
      assert.include(html, 'TrabajadorUnico Envio')
      assert.include(html, 'TipoUnico')
      assert.include(html, '15/01/2020')
      assert.include(html, MAIL_BRAND_LOGO_URL)
      assert.include(html, MAIL_BRAND_TRADE_NAME)
      assert.include(html, '© Valanserh')
      assert.notInclude(html, world.logoUrl)
      assert.notInclude(html, SECRET_DESCRIPTION)
      assert.notInclude(html, SECRET_INVOLVED)
      const hidden = html.slice(html.indexOf('display: none'), html.indexOf('</div>'))
      assert.notInclude(hidden, 'TrabajadorUnico')
      assert.notInclude(hidden, 'TipoUnico')
      const from = JSON.stringify(sent[0].message.nodeMailerMessage.from ?? '')
      assert.include(from, MAIL_BRAND_TRADE_NAME)

      const row = await logRow(report.traumaticEventReportId)
      assert.equal(row.traumatic_event_report_notification_log_status, 'sent')
      assert.equal(row.traumatic_event_report_notification_log_channel, 'email')
      assert.equal(Number(row.business_unit_id), world.unit.businessUnitId)
      assert.equal(Number(row.recipient_user_id), world.hr.user.userId)
      assert.notInclude(JSON.stringify(row), world.hr.user.userEmail)
      assert.notInclude(JSON.stringify(row), 'TrabajadorUnico')
    } finally {
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId])
    }
  })

  test('CA-02 el rol de la cuenta cuenta cuando la pivote no trae rol', async ({ assert }) => {
    const world = await buildWorld('pivote-nula')
    await db
      .from('business_unit_users')
      .where('user_id', world.hr.user.userId)
      .update({ role_id: null })
    const report = await saveReport(world, world.hr, 'employee')
    const fake = mail.fake()

    try {
      await new TraumaticEventReportNotificationService(() => true).notifyOnNewEmployeeReport(
        report.traumaticEventReportId,
        world.unit.businessUnitId
      )
      assert.lengthOf(fake.mails.sent(), 1)
      const row = await logRow(report.traumaticEventReportId)
      assert.equal(Number(row.recipient_user_id), world.hr.user.userId)
    } finally {
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId])
    }
  })

  test('CA-03 y CA-S14 el origen rh no envía ni registra, y el enganche no lo invoca', async ({
    assert,
  }) => {
    const world = await buildWorld('origen-rh')
    const report = await saveReport(world, world.hr, 'rh')
    const fake = mail.fake()
    const logs = listen()
    const calls: number[] = []
    const original = TraumaticEventReportNotificationService.prototype.notifyOnNewEmployeeReport

    try {
      await new TraumaticEventReportNotificationService(() => true).notifyOnNewEmployeeReport(
        report.traumaticEventReportId,
        world.unit.businessUnitId
      )
      fake.mails.assertNoneSent()
      assert.equal(await logCount(report.traumaticEventReportId), 0)
      assert.isTrue(logs.warn.some((call) => call.data.reason === 'reporte-ajeno-o-inexistente'))

      TraumaticEventReportNotificationService.prototype.notifyOnNewEmployeeReport = async function (
        reportId: number
      ) {
        calls.push(reportId)
      }
      const service = new TraumaticEventReportService()
      await TenantContext.run([world.unit.businessUnitId], () =>
        service.create(payload(world, 'rh'), [world.unit.businessUnitId])
      )
      await TenantContext.run([world.unit.businessUnitId], () =>
        service.create(payload(world, 'employee'), [world.unit.businessUnitId])
      )
      assert.lengthOf(calls, 1)
    } finally {
      TraumaticEventReportNotificationService.prototype.notifyOnNewEmployeeReport = original
      logs.restore()
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId])
      await db
        .from('traumatic_event_reports')
        .where('employee_id', world.employeeId)
        .delete()
    }
  })

  test('CA-04 un fallo SMTP deja failed y no corta al otro destinatario', async ({ assert }) => {
    const world = await buildWorld('smtp')
    const second = await account(world.role.roleId, 'smtp-b')
    await pivot(world.unit.businessUnitId, second.user.userId, world.role.roleId)
    const report = await saveReport(world, world.hr, 'employee')
    const logs = listen()
    let attempts = 0
    mail.fake()
    const originalSend = mail.send.bind(mail)
    mail.send = (async (message: Parameters<typeof originalSend>[0]) => {
      attempts += 1
      if (attempts === 1) throw new Error(`smtp down ${world.hr.user.userEmail}`)
      return originalSend(message)
    }) as typeof mail.send

    try {
      await new TraumaticEventReportNotificationService(() => true).notifyOnNewEmployeeReport(
        report.traumaticEventReportId,
        world.unit.businessUnitId
      )
      const rows = await db
        .from('traumatic_event_report_notification_logs')
        .where('traumatic_event_report_id', report.traumaticEventReportId)
      const statuses = rows.map((row) => row.traumatic_event_report_notification_log_status).sort()
      assert.deepEqual(statuses, ['failed', 'sent'])
      const failure = logs.error.find((call) => call.message.includes('Fallo al enviar'))
      assert.exists(failure)
      assert.equal(failure?.message, '[traumatic-event-report] Fallo al enviar el aviso a RH')
      const published = { ...failure?.data }
      delete published.err
      assert.notInclude(JSON.stringify(published), '@')
      const stored = await db
        .from('traumatic_event_reports')
        .where('traumatic_event_report_id', report.traumaticEventReportId)
        .first()
      assert.equal(stored.traumatic_event_report_origin, 'employee')
    } finally {
      mail.send = originalSend
      mail.restore()
      logs.restore()
      await cleanup(world, [report.traumaticEventReportId], [second])
    }
  })

  test('CA-05 sin destinatarios no hay correo ni constancia y queda nota interna', async ({
    assert,
  }) => {
    const world = await buildWorld('vacio', { grant: false })
    const report = await saveReport(world, world.hr, 'employee')
    const logs = listen()
    const fake = mail.fake()

    try {
      await new TraumaticEventReportNotificationService(() => true).notifyOnNewEmployeeReport(
        report.traumaticEventReportId,
        world.unit.businessUnitId
      )
      fake.mails.assertNoneSent()
      assert.equal(await logCount(report.traumaticEventReportId), 0)
      assert.isTrue(
        logs.info.some(
          (call) =>
            call.message.includes('No hay usuarios con permiso') &&
            call.data.traumaticEventReportId === report.traumaticEventReportId
        )
      )
    } finally {
      logs.restore()
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId])
    }
  })

  test('CA-06 quitar y devolver el permiso cambia quién recibe el siguiente reporte', async ({
    assert,
  }) => {
    const world = await buildWorld('permiso')
    const service = new TraumaticEventReportNotificationService(() => true)
    const first = await saveReport(world, world.hr, 'employee')
    const fake = mail.fake()

    try {
      await service.notifyOnNewEmployeeReport(first.traumaticEventReportId, world.unit.businessUnitId)
      assert.equal(await logCount(first.traumaticEventReportId), 1)

      await db
        .from('role_system_permissions')
        .where('role_id', world.role.roleId)
        .update({ role_system_permission_deleted_at: new Date() })
      const second = await saveReport(world, world.hr, 'employee')
      await service.notifyOnNewEmployeeReport(second.traumaticEventReportId, world.unit.businessUnitId)
      assert.equal(await logCount(second.traumaticEventReportId), 0)

      await db.table('role_system_permissions').insert({
        role_id: world.role.roleId,
        system_permission_id: permissionId,
        role_system_permission_created_at: new Date(),
        role_system_permission_updated_at: new Date(),
      })
      const third = await saveReport(world, world.hr, 'employee')
      await service.notifyOnNewEmployeeReport(third.traumaticEventReportId, world.unit.businessUnitId)
      assert.equal(await logCount(third.traumaticEventReportId), 1)
      assert.equal(fake.mails.sent().length, 2)
    } finally {
      mail.restore()
      await cleanup(world, [])
      await db.from('traumatic_event_reports').where('employee_id', world.employeeId).delete()
    }
  })

  test('CA-S01 otra empresa, solo lectura y el registro auditable no reciben', async ({ assert }) => {
    const world = await buildWorld('aislamiento')
    const foreignRole = await role('ajena', world.other.businessUnitId)
    const foreign = await account(foreignRole.roleId, 'ajena')
    await pivot(world.other.businessUnitId, foreign.user.userId, foreignRole.roleId)
    await grant(foreignRole.roleId, permissionId)

    const readRole = await role('lectura', world.unit.businessUnitId)
    const reader = await account(readRole.roleId, 'lectura')
    await pivot(world.unit.businessUnitId, reader.user.userId, readRole.roleId)
    await grant(readRole.roleId, readPermissionId)

    const registryRole = await role('registro', world.unit.businessUnitId)
    const registryUser = await account(registryRole.roleId, 'registro')
    await pivot(world.unit.businessUnitId, registryUser.user.userId, registryRole.roleId)
    await grant(registryRole.roleId, registryPermissionId)

    const report = await saveReport(world, world.hr, 'employee')
    const fake = mail.fake()

    try {
      await new TraumaticEventReportNotificationService(() => true).notifyOnNewEmployeeReport(
        report.traumaticEventReportId,
        world.unit.businessUnitId
      )
      const rows = await db
        .from('traumatic_event_report_notification_logs')
        .where('traumatic_event_report_id', report.traumaticEventReportId)
      assert.deepEqual(
        rows.map((row) => Number(row.recipient_user_id)),
        [world.hr.user.userId]
      )
      assert.lengthOf(fake.mails.sent(), 1)
    } finally {
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId], [foreign, reader, registryUser], [
        foreignRole,
        readRole,
        registryRole,
      ])
    }
  })

  test('CA-S02 y CA-S03 ids inválidos y empresa distinta no consultan ni registran', async ({
    assert,
  }) => {
    const world = await buildWorld('ids')
    const report = await saveReport(world, world.hr, 'employee')
    const logs = listen()
    const service = new TraumaticEventReportNotificationService(() => true)
    const fake = mail.fake()

    try {
      await service.notifyOnNewEmployeeReport(0, world.unit.businessUnitId)
      await service.notifyOnNewEmployeeReport(Number.NaN, world.unit.businessUnitId)
      await service.notifyOnNewEmployeeReport(-4, world.unit.businessUnitId)
      await service.notifyOnNewEmployeeReport(report.traumaticEventReportId, world.other.businessUnitId)
      fake.mails.assertNoneSent()
      assert.equal(await logCount(report.traumaticEventReportId), 0)
      assert.isAbove(
        logs.warn.filter((call) => call.data.reason === 'identificador-invalido').length,
        2
      )
      assert.isTrue(logs.warn.some((call) => call.data.reason === 'reporte-ajeno-o-inexistente'))
    } finally {
      logs.restore()
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId])
    }
  })

  test('CA-S04 fuera de una petición HTTP el aviso envía sin exigir contexto previo', async ({
    assert,
  }) => {
    const world = await buildWorld('sin-contexto')
    const report = await saveReport(world, world.hr, 'employee')
    const fake = mail.fake()

    try {
      assert.isFalse(TenantContext.isActive())
      await new TraumaticEventReportNotificationService(() => true).notifyOnNewEmployeeReport(
        report.traumaticEventReportId,
        world.unit.businessUnitId
      )
      assert.lengthOf(fake.mails.sent(), 1)
      assert.equal(await logCount(report.traumaticEventReportId), 1)
    } finally {
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId])
    }
  })

  test('CA-S06 y CA-S07 empresa inactiva, módulo inactivo y owner no reciben', async ({
    assert,
  }) => {
    const world = await buildWorld('terminal')
    const ownerRole = await role('owner', world.unit.businessUnitId, true)
    const owner = await account(ownerRole.roleId, 'owner')
    await pivot(world.unit.businessUnitId, owner.user.userId, ownerRole.roleId)
    await grant(ownerRole.roleId, permissionId)
    const report = await saveReport(world, world.hr, 'employee')
    const service = new TraumaticEventReportNotificationService(() => true)

    try {
      await db
        .from('business_units')
        .where('business_unit_id', world.unit.businessUnitId)
        .update({ business_unit_active: 0 })
      await service.notifyOnNewEmployeeReport(report.traumaticEventReportId, world.unit.businessUnitId)
      assert.equal(await logCount(report.traumaticEventReportId), 0)

      await db
        .from('business_units')
        .where('business_unit_id', world.unit.businessUnitId)
        .update({ business_unit_active: 1, business_unit_deleted_at: new Date() })
      await service.notifyOnNewEmployeeReport(report.traumaticEventReportId, world.unit.businessUnitId)
      assert.equal(await logCount(report.traumaticEventReportId), 0)

      await db
        .from('business_units')
        .where('business_unit_id', world.unit.businessUnitId)
        .update({ business_unit_deleted_at: null })
      await db.from('system_modules').where('system_module_id', moduleId).update({ system_module_active: 0 })
      await service.notifyOnNewEmployeeReport(report.traumaticEventReportId, world.unit.businessUnitId)
      assert.equal(await logCount(report.traumaticEventReportId), 0)

      await db.from('system_modules').where('system_module_id', moduleId).update({ system_module_active: 1 })
      await service.notifyOnNewEmployeeReport(report.traumaticEventReportId, world.unit.businessUnitId)
      const rows = await db
        .from('traumatic_event_report_notification_logs')
        .where('traumatic_event_report_id', report.traumaticEventReportId)
      assert.deepEqual(
        rows.map((row) => Number(row.recipient_user_id)),
        [world.hr.user.userId]
      )
    } finally {
      await db.from('system_modules').where('system_module_id', moduleId).update({ system_module_active: 1 })
      await cleanup(world, [report.traumaticEventReportId], [owner], [ownerRole])
    }
  })

  test('CA-S09 un nombre y un tipo con marcas salen escapados', async ({ assert }) => {
    const world = await buildWorld('escape', {
      firstName: '<script>alert(1)</script>',
      typeName: '<a href="x">',
    })
    const report = await saveReport(world, world.hr, 'employee')
    const fake = mail.fake()

    try {
      await new TraumaticEventReportNotificationService(() => true).notifyOnNewEmployeeReport(
        report.traumaticEventReportId,
        world.unit.businessUnitId
      )
      const html = String(fake.mails.sent()[0].message.nodeMailerMessage.html ?? '')
      assert.notInclude(html, '<script>alert(1)</script>')
      assert.include(html, '&lt;script&gt;alert(1)&lt;/script&gt;')
      assert.notInclude(html, '<a href="x">')
      assert.include(html, '&lt;a href=&quot;x&quot;&gt;')
    } finally {
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId])
    }
  })

  test('CA-S12 el gate de desarrollo simula el envío y redacta el correo', async ({ assert }) => {
    const world = await buildWorld('gate')
    const report = await saveReport(world, world.hr, 'employee')
    const logs = listen()
    const fake = mail.fake()

    try {
      assert.notEqual(env.get('NODE_ENV'), 'production')
      await new TraumaticEventReportNotificationService().notifyOnNewEmployeeReport(
        report.traumaticEventReportId,
        world.unit.businessUnitId
      )
      fake.mails.assertNoneSent()
      const row = await logRow(report.traumaticEventReportId)
      assert.equal(row.traumatic_event_report_notification_log_status, 'sent')
      const note = logs.info.find((call) => call.message.includes('Entrega simulada'))
      assert.exists(note)
      assert.include(note?.message ?? '', '***@')
      assert.notInclude(note?.message ?? '', world.hr.user.userEmail.split('@')[0])
    } finally {
      logs.restore()
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId])
    }
  })

  test('CA-S13 quien ya tiene sent no se repite y quien falló sí se reintenta', async ({
    assert,
  }) => {
    const world = await buildWorld('reintento')
    const report = await saveReport(world, world.hr, 'employee')
    const service = new TraumaticEventReportNotificationService(() => true)
    const fake = mail.fake()

    try {
      await service.notifyOnNewEmployeeReport(report.traumaticEventReportId, world.unit.businessUnitId)
      await service.notifyOnNewEmployeeReport(report.traumaticEventReportId, world.unit.businessUnitId)
      assert.lengthOf(fake.mails.sent(), 1)
      assert.equal(await logCount(report.traumaticEventReportId), 1)

      await db
        .from('traumatic_event_report_notification_logs')
        .where('traumatic_event_report_id', report.traumaticEventReportId)
        .update({ traumatic_event_report_notification_log_status: 'failed' })
      await service.notifyOnNewEmployeeReport(report.traumaticEventReportId, world.unit.businessUnitId)
      assert.lengthOf(fake.mails.sent(), 2)
      const rows = await db
        .from('traumatic_event_report_notification_logs')
        .where('traumatic_event_report_id', report.traumaticEventReportId)
      const statuses = rows.map((row) => row.traumatic_event_report_notification_log_status)
      assert.includeMembers(statuses, ['failed', 'sent'])
    } finally {
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId])
    }
  })

  test('CA-S16 el botón apunta al listado y no lleva identificadores', async ({ assert }) => {
    const world = await buildWorld('boton')
    const report = await saveReport(world, world.hr, 'employee')
    const fake = mail.fake()

    try {
      await new TraumaticEventReportNotificationService(() => true).notifyOnNewEmployeeReport(
        report.traumaticEventReportId,
        world.unit.businessUnitId
      )
      const html = String(fake.mails.sent()[0].message.nodeMailerMessage.html ?? '')
      const base = String(env.get('BACKOFFICE_URL') ?? '').replace(/\/$/, '')
      const url = `${base}${TRAUMATIC_EVENT_REPORT_BOARD_MODULE_PATH}`
      assert.include(html, `href="${url}"`)
      assert.notInclude(html, `reportId=${report.traumaticEventReportId}`)
      assert.notInclude(html, `employeeId=${world.employeeId}`)
      assert.notInclude(html, '?')
    } finally {
      mail.restore()
      await cleanup(world, [report.traumaticEventReportId])
    }
  })

  test('el contrato de fuente no copia marca por empresa ni columnas cifradas', ({ assert }) => {
    const service = readFileSync(
      join(process.cwd(), 'app/services/traumatic_event_report_notification_service.ts'),
      'utf-8'
    )
    const mailSource = readFileSync(
      join(process.cwd(), 'app/mails/traumatic_event_report_new_hr_mail.ts'),
      'utf-8'
    )
    const view = readFileSync(
      join(process.cwd(), 'resources/views/emails/traumatic_event_report_new_hr.edge'),
      'utf-8'
    )
    const spanish = readFileSync(join(process.cwd(), 'resources/langs/es.json'), 'utf-8')
    assert.equal((service.match(/resolveBrandingForBusinessUnit|systemSettingLogo|DEFAULT_MAIL_LOGO/g) ?? []).length, 0)
    assert.equal((mailSource.match(/resolveBrandingForBusinessUnit|systemSettingLogo|DEFAULT_MAIL_LOGO/g) ?? []).length, 0)
    assert.notInclude(service, 'traumatic_event_report_description')
    assert.notInclude(service, 'traumatic_event_report_involved_people')
    assert.notInclude(service, 'serializeReport')
    assert.notInclude(service, "from('users")
    assert.include(service, 'fetchTenantUsersWithModulePermission')
    assert.notInclude(view, '{{{')
    assert.include(spanish, '"subject": "{companyName}: nuevo reporte que requiere tu atención"')
    assert.include(spanish, '"preheader": "Hay un nuevo reporte en el sistema que requiere tu atención."')
  })
})

async function permissionOf(moduleSlug: string, action: string): Promise<number> {
  const row = await db
    .from('system_permissions as sp')
    .innerJoin('system_modules as sm', 'sm.system_module_id', 'sp.system_module_id')
    .where('sm.system_module_slug', moduleSlug)
    .where('sp.system_permission_slug', action)
    .whereNull('sp.system_permission_deleted_at')
    .select('sp.system_permission_id')
    .first()
  if (!row) throw new Error(`No está sembrado ${moduleSlug}:${action}`)
  return Number(row.system_permission_id)
}

async function moduleOf(moduleSlug: string): Promise<number> {
  const row = await db
    .from('system_modules')
    .where('system_module_slug', moduleSlug)
    .whereNull('system_module_deleted_at')
    .select('system_module_id')
    .first()
  if (!row) throw new Error(`No está sembrado el módulo ${moduleSlug}`)
  return Number(row.system_module_id)
}

async function firstPermissionOf(moduleSlug: string): Promise<number> {
  const row = await db
    .from('system_permissions as sp')
    .innerJoin('system_modules as sm', 'sm.system_module_id', 'sp.system_module_id')
    .where('sm.system_module_slug', moduleSlug)
    .whereNull('sp.system_permission_deleted_at')
    .select('sp.system_permission_id')
    .first()
  if (!row) throw new Error(`No hay permisos en ${moduleSlug}`)
  return Number(row.system_permission_id)
}

interface World {
  unit: BusinessUnit
  other: BusinessUnit
  role: Role
  hr: Account
  employeeId: number
  personId: number
  typeId: number
  settingId: number
  tradeName: string
  logoUrl: string
}

async function buildWorld(
  label: string,
  options: { grant?: boolean; firstName?: string; typeName?: string } = {}
): Promise<World> {
  const token = stamp()
  const unit = await BusinessUnit.create({
    businessUnitName: `Evento ${label} ${token}`,
    businessUnitSlug: `evento-${label}-${token}`.toLowerCase(),
    businessUnitLegalName: `Evento ${label} ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const other = await BusinessUnit.create({
    businessUnitName: `Otra ${label} ${token}`,
    businessUnitSlug: `otra-${label}-${token}`.toLowerCase(),
    businessUnitLegalName: `Otra ${label} ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const tradeName = `Comercial ${label} ${token}`
  const logoUrl = `https://cliente.example/logo-${token}.png`
  const setting = await SystemSetting.create({
    businessUnitId: unit.businessUnitId,
    systemSettingTradeName: tradeName,
    systemSettingLogo: logoUrl,
    systemSettingSidebarColor: '#111111',
    systemSettingActive: 1,
    systemSettingMonthlyConversionFactor: 30.4,
  })
  const eventType = await TraumaticEventType.create({
    traumaticEventTypeName: options.typeName ?? 'TipoUnico',
    traumaticEventTypeDescription: 'Tipo de prueba',
    traumaticEventTypeSlug: `tipo-${label}-${token}`.toLowerCase(),
    traumaticEventTypeActive: 1,
  })
  const createdRole = await role(`gestor-${label}`, unit.businessUnitId)
  const hr = await account(createdRole.roleId, label)
  await pivot(unit.businessUnitId, hr.user.userId, createdRole.roleId)
  if (options.grant !== false) await grant(createdRole.roleId, await permissionOf(MODULE, ACTION))
  const person = await Person.create({
    personFirstname: options.firstName ?? 'TrabajadorUnico',
    personLastname: 'Envio',
    personSecondLastname: token,
    personEmail: `trabajador-${label}-${token}@test.local`,
  })
  const employeeId = await insertEmployee(unit.businessUnitId, person.personId, options.firstName ?? 'TrabajadorUnico')
  return {
    unit,
    other,
    role: createdRole,
    hr,
    employeeId,
    personId: person.personId,
    typeId: eventType.traumaticEventTypeId,
    settingId: setting.systemSettingId,
    tradeName,
    logoUrl,
  }
}

async function saveReport(world: World, capturer: Account, origin: 'employee' | 'rh') {
  const report = new TraumaticEventReport()
  report.employeeId = world.employeeId
  report.traumaticEventTypeId = world.typeId
  report.traumaticEventReportOccurredAt = DateTime.fromISO('2020-01-15')
  report.traumaticEventReportElaboratedAt = DateTime.now()
  report.traumaticEventReportInvolvedPeople = SECRET_INVOLVED
  report.traumaticEventReportDescription = SECRET_DESCRIPTION
  report.traumaticEventReportOrigin = origin
  report.traumaticEventReportCapturedByUserId = capturer.user.userId
  await TenantContext.run([world.unit.businessUnitId], () => report.save())
  return report
}

function payload(world: World, origin: 'employee' | 'rh') {
  return {
    traumaticEventReportEmployeeId: world.employeeId,
    traumaticEventTypeId: world.typeId,
    traumaticEventReportOccurredAt: '2020-01-15',
    traumaticEventReportInvolvedPeople: SECRET_INVOLVED,
    traumaticEventReportDescription: SECRET_DESCRIPTION,
    capturedByUserId: world.hr.user.userId,
    traumaticEventReportOrigin: origin,
  }
}

async function role(slug: string, businessUnitId: number, exact = false): Promise<Role> {
  return Role.create({
    roleName: `Rol ${slug} ${stamp()}`,
    roleSlug: exact ? slug : `${slug}-${stamp()}`.toLowerCase().slice(0, 140),
    roleDescription: 'Rol del aviso de evento',
    roleActive: 1,
    businessUnitId,
  })
}

async function account(roleId: number, label: string): Promise<Account> {
  const token = stamp()
  const person = await Person.create({
    personFirstname: 'Aviso',
    personLastname: label,
    personSecondLastname: token,
    personEmail: `aviso-${label}-${token}@test.local`,
  })
  const user = await User.create({
    userEmail: `aviso-${label}-${token}@test.local`,
    userPassword: 'AvisoEventoPrueba123!',
    userActive: 1,
    roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return { user, person }
}

async function pivot(businessUnitId: number, userId: number, roleId: number | null): Promise<void> {
  const now = new Date()
  await db.table('business_unit_users').insert({
    business_unit_id: businessUnitId,
    user_id: userId,
    role_id: roleId,
    business_unit_user_created_at: now,
    business_unit_user_updated_at: now,
  })
}

async function grant(roleId: number, systemPermissionId: number): Promise<void> {
  const now = new Date()
  await db.table('role_system_permissions').insert({
    role_id: roleId,
    system_permission_id: systemPermissionId,
    role_system_permission_created_at: now,
    role_system_permission_updated_at: now,
  })
}

async function insertEmployee(businessUnitId: number, personId: number, firstName: string): Promise<number> {
  const token = stamp()
  const [employeeId] = await db.table('employees').insert({
    employee_slug: opaqueEmployeeSlug(),
    employee_sync_id: `EMP-TER-${token}`,
    employee_code: `EMP-TER-${token}`,
    employee_first_name: firstName,
    employee_last_name: 'Envio',
    employee_second_last_name: token,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    person_id: personId,
    employee_created_at: new Date(),
    employee_updated_at: new Date(),
  })
  return Number(employeeId)
}

async function logRow(reportId: number): Promise<Record<string, unknown>> {
  const row = await db
    .from('traumatic_event_report_notification_logs')
    .where('traumatic_event_report_id', reportId)
    .first()
  if (!row) throw new Error('No hay constancia')
  return row
}

async function logCount(reportId: number): Promise<number> {
  const rows = await db
    .from('traumatic_event_report_notification_logs')
    .where('traumatic_event_report_id', reportId)
    .count('* as total')
  return Number(rows[0].total)
}

function listen(): { info: LogCall[]; warn: LogCall[]; error: LogCall[]; restore: () => void } {
  const info: LogCall[] = []
  const warn: LogCall[] = []
  const error: LogCall[] = []
  const original = {
    info: logger.info.bind(logger) as LogFn,
    warn: logger.warn.bind(logger) as LogFn,
    error: logger.error.bind(logger) as LogFn,
  }
  const wrap = (bucket: LogCall[]): LogFn => (first, second) => {
    if (typeof first === 'string') bucket.push({ data: {}, message: first })
    else bucket.push({ data: (first ?? {}) as Record<string, unknown>, message: second ?? '' })
  }
  logger.info = wrap(info) as typeof logger.info
  logger.warn = wrap(warn) as typeof logger.warn
  logger.error = wrap(error) as typeof logger.error
  return {
    info,
    warn,
    error,
    restore() {
      logger.info = original.info as typeof logger.info
      logger.warn = original.warn as typeof logger.warn
      logger.error = original.error as typeof logger.error
    },
  }
}

async function cleanup(
  world: World,
  reportIds: number[],
  extraAccounts: Account[] = [],
  extraRoles: Role[] = []
): Promise<void> {
  const reports = await db.from('traumatic_event_reports').where('employee_id', world.employeeId).select('traumatic_event_report_id')
  const ids = [...reportIds, ...reports.map((row) => Number(row.traumatic_event_report_id))]
  if (ids.length > 0) {
    await db.from('traumatic_event_report_notification_logs').whereIn('traumatic_event_report_id', ids).delete()
    await db.from('traumatic_event_reports').whereIn('traumatic_event_report_id', ids).delete()
  }
  await db.from('employees').where('employee_id', world.employeeId).delete()
  const accounts = [world.hr, ...extraAccounts]
  const userIds = accounts.map((item) => item.user.userId)
  await db.from('business_unit_users').whereIn('user_id', userIds).delete()
  await db.from('users').whereIn('user_id', userIds).delete()
  await db.from('people').whereIn('person_id', [...accounts.map((item) => item.person.personId), world.personId]).delete()
  const roles = [world.role, ...extraRoles]
  for (const item of roles) {
    await db.from('role_system_permissions').where('role_id', item.roleId).delete()
    await db.from('roles').where('role_id', item.roleId).delete()
  }
  await db.from('system_settings').where('system_setting_id', world.settingId).delete()
  await db.from('traumatic_event_types').where('traumatic_event_type_id', world.typeId).delete()
  await db.from('business_units').whereIn('business_unit_id', [world.unit.businessUnitId, world.other.businessUnitId]).delete()
}
