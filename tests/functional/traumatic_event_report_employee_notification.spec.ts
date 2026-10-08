import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import Role from '#models/role'
import TraumaticEventType from '#models/traumatic_event_type'
import User from '#models/user'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'

const MESSAGE = 'Reporte de evento traumático creado correctamente'
const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('POST del reporte de evento de origen empleado', () => {
  test('CA-S15 la respuesta es la misma con destinatario, sin destinatario y con fallo SMTP', async ({
    client,
    assert,
  }) => {
    const withRecipient = await postEmployee(client, { withHr: true, hrEmail: 'jsoto@siler-mx.com' })
    const without = await postEmployee(client, { withHr: false })
    const failed = await postEmployee(client, {
      withHr: true,
      hrEmail: 'wilvardo@gmail.com',
      failSmtp: true,
    })

    try {
      assert.equal(withRecipient.response.status(), 201)
      assert.equal(without.response.status(), 201)
      assert.equal(failed.response.status(), 201)
      assert.equal(withRecipient.body.message, MESSAGE)
      assert.equal(without.body.message, MESSAGE)
      assert.equal(failed.body.message, MESSAGE)
      assert.deepEqual(without.keys, withRecipient.keys)
      assert.deepEqual(failed.keys, withRecipient.keys)

      const sent = await waitForLogs(withRecipient.reportId)
      assert.lengthOf(sent, 1)
      assert.equal(sent[0].traumatic_event_report_notification_log_status, 'sent')
      assert.isAbove(withRecipient.mails, 0)

      await pause(400)
      assert.equal(await logCount(without.reportId), 0)

      const broken = await waitForLogs(failed.reportId)
      assert.lengthOf(broken, 1)
      assert.equal(broken[0].traumatic_event_report_notification_log_status, 'failed')
    } finally {
      await withRecipient.cleanup()
      await without.cleanup()
      await failed.cleanup()
    }
  })

  test('el alta del backoffice no deja constancia', async ({ client, assert }) => {
    const world = await prepare({ withHr: true })
    const fake = mail.fake()

    try {
      const response = await client
        .post('/api/traumatic-event-reports')
        .loginAs(world.poster.user)
        .header('X-Business-Unit-Id', world.unit.businessUnitPublicId)
        .json({
          traumaticEventReportEmployeeId: world.employeeId,
          traumaticEventTypeId: world.typeId,
          traumaticEventReportOccurredAt: '2020-01-15',
          traumaticEventReportInvolvedPeople: 'Persona del backoffice',
          traumaticEventReportDescription: 'Descripcion del backoffice',
        })
      assert.equal(response.status(), 201)
      const reportId = Number(response.body().data.traumaticEventReport.traumaticEventReportId)
      await pause(500)
      assert.equal(await logCount(reportId), 0)
      fake.mails.assertNoneSent()
      await db.from('traumatic_event_reports').where('traumatic_event_report_id', reportId).delete()
    } finally {
      mail.restore()
      await world.cleanup()
    }
  })
})

async function postEmployee(
  client: ApiClient,
  options: { withHr: boolean; hrEmail?: string; failSmtp?: boolean }
): Promise<{
  response: { status: () => number }
  body: { message: string; data: { traumaticEventReport: Record<string, unknown> } }
  keys: string[]
  reportId: number
  mails: number
  cleanup: () => Promise<void>
}> {
  const world = await prepare(options)
  const fake = mail.fake()
  const originalSend = mail.send.bind(mail)
  if (options.failSmtp) {
    mail.send = (async () => {
      throw new Error(`smtp down ${options.hrEmail}`)
    }) as typeof mail.send
  }

  try {
    const response = await client
      .post('/api/v1/traumatic-event-reports')
      .loginAs(world.poster.user)
      .header('X-Business-Unit-Id', world.unit.businessUnitPublicId)
      .json({
        traumaticEventTypeId: world.typeId,
        traumaticEventReportOccurredAt: '2020-01-15',
        traumaticEventReportInvolvedPeople: 'Persona del celular',
        traumaticEventReportDescription: 'Descripcion del celular',
      })
    const body = response.body()
    const report = body.data?.traumaticEventReport ?? {}
    const reportId = Number(report.traumaticEventReportId ?? 0)
    if (options.withHr && reportId > 0) await waitForLogs(reportId)
    else await pause(400)
    return {
      response,
      body,
      keys: Object.keys(report).sort(),
      reportId,
      mails: options.failSmtp ? 0 : fake.mails.sent().length,
      cleanup: async () => {
        mail.send = originalSend
        mail.restore()
        if (world.reportId === 0 && report.traumaticEventReportId) {
          await db
            .from('traumatic_event_report_notification_logs')
            .where('traumatic_event_report_id', report.traumaticEventReportId)
            .delete()
          await db
            .from('traumatic_event_reports')
            .where('traumatic_event_report_id', report.traumaticEventReportId)
            .delete()
        }
        await world.cleanup()
      },
    }
  } catch (error) {
    mail.send = originalSend
    mail.restore()
    await world.cleanup()
    throw error
  }
}

async function prepare(options: { withHr: boolean; hrEmail?: string }): Promise<{
  unit: BusinessUnit
  poster: { user: User; person: Person }
  employeeId: number
  typeId: number
  reportId: number
  cleanup: () => Promise<void>
}> {
  const token = stamp()
  const unit = await BusinessUnit.create({
    businessUnitName: `Funcional evento ${token}`,
    businessUnitSlug: `funcional-evento-${token}`,
    businessUnitLegalName: `Funcional evento ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
  const posterRole = await Role.create({
    roleName: `Empleado ${token}`,
    roleSlug: `empleado-evento-${token}`,
    roleDescription: 'Empleado que reporta',
    roleActive: 1,
    businessUnitId: unit.businessUnitId,
  })
  await grant(posterRole.roleId, 'employees', 'sensitive-salud-write')
  await grant(posterRole.roleId, 'traumatic-event-reports', 'create')
  const person = await Person.create({
    personFirstname: 'Trabajador',
    personLastname: 'Funcional',
    personSecondLastname: token,
    personEmail: `trabajador-funcional-${token}@test.local`,
    businessUnitId: unit.businessUnitId,
  })
  const poster = await User.create({
    userEmail: `trabajador-funcional-${token}@test.local`,
    userPassword: 'EventoFuncionalPrueba123!',
    userActive: 1,
    roleId: posterRole.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const employeeId = await insertEmployee(unit.businessUnitId, person.personId, token)
  await pivot(unit.businessUnitId, poster.userId, posterRole.roleId)

  let hr: User | null = null
  let hrPerson: Person | null = null
  let hrRole: Role | null = null
  let restoreEmail: () => Promise<void> = async () => undefined
  if (options.withHr) {
    hrRole = await Role.create({
      roleName: `Gestor ${token}`,
      roleSlug: `gestor-evento-${token}`,
      roleDescription: 'Gestiona eventos',
      roleActive: 1,
      businessUnitId: unit.businessUnitId,
    })
    await grant(hrRole.roleId, 'traumatic-event-reports', 'update')
    hrPerson = await Person.create({
      personFirstname: 'Gestor',
      personLastname: 'Funcional',
      personSecondLastname: token,
      personEmail: `gestor-funcional-${token}@test.local`,
      businessUnitId: unit.businessUnitId,
    })
    hr = await User.create({
      userEmail: `gestor-funcional-${token}@test.local`,
      userPassword: 'EventoFuncionalPrueba123!',
      userActive: 1,
      roleId: hrRole.roleId,
      personId: hrPerson.personId,
      userEmailType: 'institutional',
    })
    await pivot(unit.businessUnitId, hr.userId, hrRole.roleId)
    if (options.hrEmail) restoreEmail = await claimEmail(hr.userId, options.hrEmail)
  }

  const eventType = await TraumaticEventType.create({
    traumaticEventTypeName: `Tipo funcional ${token}`,
    traumaticEventTypeDescription: 'Tipo de prueba funcional',
    traumaticEventTypeSlug: `tipo-funcional-${token}`,
    traumaticEventTypeActive: 1,
  })

  return {
    unit,
    poster: { user: poster, person },
    employeeId,
    typeId: eventType.traumaticEventTypeId,
    reportId: 0,
    cleanup: async () => {
      const reportRows = await db
        .from('traumatic_event_reports')
        .where('employee_id', employeeId)
        .select('traumatic_event_report_id')
      const reportIds = reportRows.map((row) => Number(row.traumatic_event_report_id))
      if (reportIds.length > 0) {
        await db.from('traumatic_event_report_notification_logs').whereIn('traumatic_event_report_id', reportIds).delete()
        await db.from('traumatic_event_reports').whereIn('traumatic_event_report_id', reportIds).delete()
      }
      await db.from('employees').where('employee_id', employeeId).delete()
      const userIds = [poster.userId, hr?.userId].filter((id): id is number => typeof id === 'number')
      await db.from('api_tokens').whereIn('tokenable_id', userIds).delete()
      await db.from('business_unit_users').whereIn('user_id', userIds).delete()
      await db.from('users').whereIn('user_id', userIds).delete()
      await restoreEmail()
      const personIds = [person.personId, hrPerson?.personId].filter((id): id is number => typeof id === 'number')
      await db.from('people').whereIn('person_id', personIds).delete()
      const roleIds = [posterRole.roleId, hrRole?.roleId].filter((id): id is number => typeof id === 'number')
      await db.from('role_system_permissions').whereIn('role_id', roleIds).delete()
      await db.from('roles').whereIn('role_id', roleIds).delete()
      await db.from('traumatic_event_types').where('traumatic_event_type_id', eventType.traumaticEventTypeId).delete()
      await db.from('business_units').where('business_unit_id', unit.businessUnitId).delete()
    },
  }
}

async function claimEmail(userId: number, email: string): Promise<() => Promise<void>> {
  const existing = await db.from('users').whereRaw('LOWER(user_email) = ?', [email.toLowerCase()]).first()
  let restore = async () => undefined
  if (existing && Number(existing.user_id) !== userId) {
    const previous = String(existing.user_email)
    await db
      .from('users')
      .where('user_id', existing.user_id)
      .update({ user_email: `apartado-${existing.user_id}-${Date.now()}@test.local` })
    restore = async () => {
      await db.from('users').where('user_id', existing.user_id).update({ user_email: previous })
    }
  }
  await db.from('users').where('user_id', userId).update({ user_email: email })
  return restore
}

async function grant(roleId: number, moduleSlug: string, action: string): Promise<void> {
  const row = await db
    .from('system_permissions as sp')
    .innerJoin('system_modules as sm', 'sm.system_module_id', 'sp.system_module_id')
    .where('sm.system_module_slug', moduleSlug)
    .where('sp.system_permission_slug', action)
    .whereNull('sp.system_permission_deleted_at')
    .select('sp.system_permission_id')
    .first()
  if (!row) throw new Error(`No está sembrado ${moduleSlug}:${action}`)
  const now = new Date()
  await db.table('role_system_permissions').insert({
    role_id: roleId,
    system_permission_id: row.system_permission_id,
    role_system_permission_created_at: now,
    role_system_permission_updated_at: now,
  })
}

async function pivot(businessUnitId: number, userId: number, roleId: number): Promise<void> {
  const now = new Date()
  await db.table('business_unit_users').insert({
    business_unit_id: businessUnitId,
    user_id: userId,
    role_id: roleId,
    business_unit_user_created_at: now,
    business_unit_user_updated_at: now,
  })
}

async function insertEmployee(businessUnitId: number, personId: number, token: string): Promise<number> {
  const [employeeId] = await db.table('employees').insert({
    employee_slug: opaqueEmployeeSlug(),
    employee_sync_id: `EMP-FUN-${token}`,
    employee_code: `EMP-FUN-${token}`,
    employee_first_name: 'Trabajador',
    employee_last_name: 'Funcional',
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

async function waitForLogs(reportId: number): Promise<Array<Record<string, string>>> {
  const started = Date.now()
  while (Date.now() - started < 4000) {
    const rows = await db
      .from('traumatic_event_report_notification_logs')
      .where('traumatic_event_report_id', reportId)
    if (rows.length > 0) return rows
    await pause(40)
  }
  return []
}

async function logCount(reportId: number): Promise<number> {
  const rows = await db
    .from('traumatic_event_report_notification_logs')
    .where('traumatic_event_report_id', reportId)
    .count('* as total')
  return Number(rows[0].total)
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
