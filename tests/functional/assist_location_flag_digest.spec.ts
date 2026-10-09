import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import mail from '@adonisjs/mail/services/main'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import { ASSIST_LOCATION_FLAG } from '#constants/assist_location_flag'
import {
  ASSIST_LOCATION_FLAG_DIGEST_SUBJECT,
  ASSIST_LOCATION_FLAG_NOTIFY_MODULE,
} from '#constants/assist_location_flag_digest'
import AssistLocationFlagDigestService, {
  type AssistLocationFlagDigestDependencies,
  type AssistLocationFlagDigestMailer,
} from '#modules/assist-location-flag/assist_location_flag_digest.service'
import AssistLocationFlagDigestRepositoryMysql from '#modules/assist-location-flag/assist_location_flag_digest.repository.mysql'
import type { AssistLocationFlagDigestRepository } from '#modules/assist-location-flag/assist_location_flag_digest.repository'
import type { AssistLocationFlagDigestMailData } from '#modules/assist-location-flag/dto/assist_location_flag_digest.dto'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  cleanupTenantActor,
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  createTenantActor,
  grantModulePermissions,
  type TenantActor,
  type UnitUser,
} from '#tests/helpers/tenant_actor'

/**
 * Aviso por correo a RH de las checadas con ubicación simulada
 * (VLRH-H1791056340278): CA-01 a CA-06, CA-08 a CA-13 y CA-17 sobre el
 * servicio y el adaptador. CA-07 vive en el spec unitario del resolvedor.
 *
 * El reloj se fija en `NOW`; todo `assist_created_at` es relativo a él. La
 * búsqueda de empresas se acota a las del caso, para que una fila ajena en la
 * BD de pruebas no cambie lo que se envía.
 */

const NOW = DateTime.fromISO('2026-10-07T15:00:00Z', { zone: 'utc' })
const JUST_ARRIVED = NOW.minus({ minutes: 5 })
const SITE_ZONE = 'America/Mexico_City'
const DEV_RECIPIENT = 'wilvardo@gmail.com'

const toSql = (value: DateTime) => value.toUTC().toSQL({ includeOffset: false })!
const utc = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' })
const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

// ---------------------------------------------------------------- fixtures

interface Company {
  actor: TenantActor
  id: number
  owner: UnitUser | null
  users: UnitUser[]
  employees: EmployeeFixture[]
}

/** Empresa con U1 (rol propio con "Ver el monitor de asistencia") y, si se pide, su dueño. */
async function createCompany(prefix: string, withOwner = true): Promise<Company> {
  const actor = await createTenantActor(prefix)
  await grantModulePermissions(actor, ASSIST_LOCATION_FLAG_NOTIFY_MODULE, ['read'])
  const id = actor.businessUnit.businessUnitId
  await db.from('business_units').where('business_unit_id', id).update({ business_unit_timezone: SITE_ZONE })
  const owner = withOwner ? await createBypassUserInBusinessUnit('owner', `${prefix}-owner`, id) : null
  return { actor, id, owner, users: [], employees: [] }
}

async function addUser(company: Company, role: Role, label: string, email?: string): Promise<UnitUser> {
  const person = await Person.create({
    personFirstname: 'Usuario',
    personLastname: 'Aviso',
    personSecondLastname: label,
    personEmail: `alf-person-${label}-${uniqueStamp()}@gsti-tests.local`,
    businessUnitId: company.id,
  })
  const user = await User.create({
    userEmail: email ?? `alf-${label}-${uniqueStamp()}@gsti-tests.local`,
    userPassword: 'AssistLocationFlag123!',
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await attachBusinessUnitsWithRole(user, [company.id], role.roleId)
  const unitUser = { user, person }
  company.users.push(unitUser)
  return unitUser
}

async function addEmployee(company: Company, code: string, firstName: string): Promise<EmployeeFixture> {
  const fixture = await createEmployeeFixture(company.id, 'alf')
  await db.from('employees').where('employee_id', fixture.employee.employeeId).update({
    employee_code: code,
    employee_first_name: firstName,
    employee_last_name: 'Prueba',
    employee_second_last_name: null,
  })
  company.employees.push(fixture)
  return fixture
}

async function insertAssist(
  employee: EmployeeFixture,
  punchUtc: string,
  extra: Record<string, unknown> = {}
): Promise<number> {
  const punch = toSql(utc(punchUtc))
  const [id] = await db.table('assists').insert({
    assist_emp_code: employee.employee.employeeCode,
    assist_emp_id: employee.employee.employeeId,
    business_unit_id: employee.businessUnitId,
    assist_punch_time: punch,
    assist_punch_time_utc: punch,
    assist_punch_time_origin: punch,
    assist_upload_time: punch,
    assist_sync_id: 0,
    assist_type: 'check',
    assist_latitude: 19.4326,
    assist_longitude: -99.1332,
    assist_precision: 10,
    assist_location_flag: ASSIST_LOCATION_FLAG.SIMULATED,
    assist_created_at: toSql(JUST_ARRIVED),
    assist_natural_key: `alf-${randomUUID()}`,
    ...extra,
  })
  return Number(id)
}

async function notifiedAt(assistIds: number[]): Promise<Map<number, string | null>> {
  const rows = (await db
    .from('assists')
    .whereIn('assist_id', assistIds)
    .select('assist_id', 'assist_location_flag_notified_at')) as Array<{
    assist_id: number
    assist_location_flag_notified_at: Date | null
  }>
  return new Map(
    rows.map((row) => [
      Number(row.assist_id),
      row.assist_location_flag_notified_at ? row.assist_location_flag_notified_at.toISOString() : null,
    ])
  )
}

/** Valores de `notified_at` en el orden de `assistIds`. */
async function notifiedValues(assistIds: number[]): Promise<Array<string | null>> {
  const byId = await notifiedAt(assistIds)
  return assistIds.map((id) => byId.get(id) ?? null)
}

async function cleanupCompany(company: Company | null): Promise<void> {
  if (!company) return
  await db.from('assists').where('business_unit_id', company.id).delete()
  // El helper borra el organigrama de toda la empresa: los empleados salen
  // antes, o el segundo empleado seguiría colgando de un puesto borrado.
  await db.from('employees').where('business_unit_id', company.id).delete()
  for (const employee of company.employees) await cleanupEmployeeFixture(employee)
  for (const user of company.users) await cleanupUnitUser(user)
  await cleanupUnitUser(company.owner)
  await cleanupTenantActor(company.actor)
}

// ---------------------------------------------------------------- servicio

interface LogEntry {
  level: 'info' | 'warn' | 'error'
  meta: Record<string, unknown>
}

interface SentDigest {
  businessUnitId: number
  recipients: readonly string[]
  data: AssistLocationFlagDigestMailData
}

/** Adaptador real con la búsqueda de empresas acotada a las del caso. */
function scopedRepository(companies: Company[]): AssistLocationFlagDigestRepository {
  const real = new AssistLocationFlagDigestRepositoryMysql()
  const ids = new Set(companies.map((company) => company.id))
  return {
    findBusinessUnitsWithPending: async (since) => {
      const pending = await real.findBusinessUnitsWithPending(since)
      return pending.filter((id) => ids.has(id))
    },
    claimPending: (...args) => real.claimPending(...args),
    releaseClaim: (...args) => real.releaseClaim(...args),
  }
}

function capturingMailer(sent: SentDigest[], failFor?: number): AssistLocationFlagDigestMailer {
  return async (input) => {
    if (input.businessUnitId === failFor) throw new Error('smtp caido para jsoto@ejemplo.com')
    sent.push(input)
  }
}

function buildService(
  companies: Company[],
  overrides: Partial<AssistLocationFlagDigestDependencies> = {}
): { service: AssistLocationFlagDigestService; logs: LogEntry[] } {
  const logs: LogEntry[] = []
  const service = new AssistLocationFlagDigestService({
    repository: scopedRepository(companies),
    isProduction: () => true,
    now: () => NOW,
    logger: {
      info: (meta) => logs.push({ level: 'info', meta }),
      warn: (meta) => logs.push({ level: 'warn', meta }),
      error: (meta) => logs.push({ level: 'error', meta }),
    },
    ...overrides,
  })
  return { service, logs }
}

const email = (user: User | UnitUser | null) =>
  (user instanceof User ? user : user!.user).userEmail.toLowerCase()
const sortedEmails = (...users: Array<User | UnitUser | null>) => users.map(email).sort()

/** Direcciones de un campo del mensaje de nodemailer, sin importar su forma. */
function addresses(field: unknown): string[] {
  const list = Array.isArray(field) ? field : field ? [field] : []
  return list
    .map((entry: unknown) =>
      typeof entry === 'string' ? entry : ((entry as { address?: string }).address ?? '')
    )
    .map((value) => value.toLowerCase())
}

// ---------------------------------------------------------------- casos

test.group('Aviso de ubicación simulada — correo agrupado', (group) => {
  const companies: Company[] = []

  group.each.teardown(async () => {
    mail.restore()
    for (const company of companies.splice(0)) await cleanupCompany(company)
  })

  test('CA-01 y CA-13: un correo en copia oculta, por empleado y día, sin datos de más', async ({ assert }) => {
    const a = await createCompany('alf-ca01')
    companies.push(a)
    const e1 = await addEmployee(a, '1001', 'Elena')
    const ids = [
      await insertAssist(e1, '2026-10-05T14:02:00Z'),
      await insertAssist(e1, '2026-10-05T20:05:00Z'),
    ]
    const { service } = buildService([a])

    const fake = mail.fake()
    await service.run()
    const messages = fake.messages.sent()
    const json = messages.map((message) => message.toJSON().message as Record<string, unknown>)

    assert.lengthOf(json, 1)
    const sent = json[0]
    assert.deepEqual(addresses(sent.to), [resolveMailSender().toLowerCase()])
    assert.deepEqual(addresses(sent.bcc).sort(), sortedEmails(a.actor.user, a.owner))
    assert.equal(sent.subject, ASSIST_LOCATION_FLAG_DIGEST_SUBJECT)

    const html = String(sent.html ?? '')
    assert.include(html, 'Elena Prueba')
    assert.include(html, '1001')
    assert.include(html, 'lunes 5 de octubre 2026')
    assert.include(html, '08:02, 14:05')
    assert.include(html, '2 registros')

    const after = await notifiedAt(ids)
    for (const id of ids) assert.isNotNull(after.get(id))
    const updated = (await db.from('assists').whereIn('assist_id', ids).select('assist_updated_at')) as Array<{
      assist_updated_at: Date | null
    }>
    for (const row of updated) assert.isNull(row.assist_updated_at)

    // CA-13: minimización del cuerpo y del asunto.
    for (const forbidden of [
      'latitude',
      'longitude',
      'precision',
      'assist_id',
      'employee_id',
      'href',
      email(a.actor.user),
      email(a.owner),
      'teléfono propio',
      'kiosco',
      'equipo de otro usuario',
    ]) {
      assert.notInclude(html.toLowerCase(), forbidden.toLowerCase(), forbidden)
    }
    assert.notInclude(String(sent.subject), 'Elena')
  })

  test('CA-02: sin checadas nuevas no sale nada', async ({ assert }) => {
    const a = await createCompany('alf-ca02')
    companies.push(a)
    const e1 = await addEmployee(a, 'ALF-2', 'Elena')
    const ids = [await insertAssist(e1, '2026-10-05T14:02:00Z')]
    const sent: SentDigest[] = []
    const { service } = buildService([a], { mailer: capturingMailer(sent) })

    await service.run()
    const first = await notifiedAt(ids)
    await service.run()

    assert.lengthOf(sent, 1)
    assert.deepEqual(await notifiedAt(ids), first)
  })

  test('CA-03: tres empleados en un solo correo, ordenados por nombre', async ({ assert }) => {
    const a = await createCompany('alf-ca03')
    companies.push(a)
    for (const [code, name] of [
      ['ALF-C', 'Carla'],
      ['ALF-A', 'Ana'],
      ['ALF-B', 'Beto'],
    ]) {
      await insertAssist(await addEmployee(a, code, name), '2026-10-06T15:00:00Z')
    }
    const sent: SentDigest[] = []
    const { service } = buildService([a], { mailer: capturingMailer(sent) })

    await service.run()

    assert.lengthOf(sent, 1)
    assert.deepEqual(
      sent[0].data.lines.map((line) => line.employeeName),
      ['Ana Prueba', 'Beto Prueba', 'Carla Prueba']
    )
  })

  test('CA-04: el día es el del sitio, no el de UTC', async ({ assert }) => {
    const a = await createCompany('alf-ca04')
    companies.push(a)
    const e1 = await addEmployee(a, 'ALF-4', 'Elena')
    await insertAssist(e1, '2026-10-06T05:30:00Z')
    await insertAssist(e1, '2026-10-06T06:30:00Z')
    const sent: SentDigest[] = []
    const { service } = buildService([a], { mailer: capturingMailer(sent) })

    await service.run()

    assert.deepEqual(
      sent[0].data.lines.map((line) => [line.dayLabel, line.times]),
      [
        ['lunes 5 de octubre 2026', ['23:30']],
        ['martes 6 de octubre 2026', ['00:30']],
      ]
    )
  })

  test('CA-05: solo la simulada vigente, activa y no avisada entra', async ({ assert }) => {
    const a = await createCompany('alf-ca05')
    companies.push(a)
    const e1 = await addEmployee(a, 'ALF-5', 'Elena')
    const previous = toSql(NOW.minus({ hours: 3 }).startOf('second'))
    const valid = await insertAssist(e1, '2026-10-06T14:00:00Z')
    const others = [
      await insertAssist(e1, '2026-10-06T14:01:00Z', {
        assist_location_flag: ASSIST_LOCATION_FLAG.UNVERIFIED,
      }),
      await insertAssist(e1, '2026-10-06T14:02:00Z', { assist_active: 0 }),
      await insertAssist(e1, '2026-10-06T14:03:00Z', { assist_deleted_at: toSql(NOW) }),
      await insertAssist(e1, '2026-09-29T14:04:00Z', {
        assist_created_at: toSql(NOW.minus({ days: 8 })),
      }),
      await insertAssist(e1, '2026-10-06T14:05:00Z', {
        assist_location_flag_notified_at: previous,
      }),
    ]
    const before = await notifiedAt(others)
    const sent: SentDigest[] = []
    const { service } = buildService([a], { mailer: capturingMailer(sent) })

    await service.run()

    assert.lengthOf(sent, 1)
    assert.deepEqual(sent[0].data.lines.map((line) => line.times), [['08:00']])
    const [validNotifiedAt] = await notifiedValues([valid])
    assert.isNotNull(validNotifiedAt)
    assert.deepEqual(await notifiedAt(others), before)
  })

  test('CA-06: la entregada días después entra con su día y hora reales', async ({ assert }) => {
    const a = await createCompany('alf-ca06')
    companies.push(a)
    const e1 = await addEmployee(a, 'ALF-6', 'Elena')
    await insertAssist(e1, '2026-10-05T14:02:00Z', {
      assist_created_at: toSql(utc('2026-10-07T14:00:00Z')),
    })
    const sent: SentDigest[] = []
    const { service } = buildService([a], { mailer: capturingMailer(sent) })

    await service.run()

    assert.deepEqual(
      sent[0].data.lines.map((line) => [line.dayLabel, line.times]),
      [['lunes 5 de octubre 2026', ['08:02']]]
    )
  })

  test('CA-08: quien está en dos empresas recibe un correo por cada una', async ({ assert }) => {
    const a = await createCompany('alf-ca08a')
    const b = await createCompany('alf-ca08b')
    companies.push(a, b)
    const member = await addUser(a, a.actor.role, 'miembro')
    await attachBusinessUnitsWithRole(member.user, [b.id], b.actor.role.roleId)
    await insertAssist(await addEmployee(a, 'ALF-8A', 'Andrea'), '2026-10-06T15:00:00Z')
    await insertAssist(await addEmployee(b, 'ALF-8B', 'Bruno'), '2026-10-06T15:00:00Z')
    const sent: SentDigest[] = []
    const { service } = buildService([a, b], { mailer: capturingMailer(sent) })

    await service.run()

    assert.lengthOf(sent, 2)
    const toA = sent.find((digest) => digest.businessUnitId === a.id)!
    const toB = sent.find((digest) => digest.businessUnitId === b.id)!
    assert.include(toA.recipients, email(member))
    assert.include(toB.recipients, email(member))
    assert.deepEqual(toA.data.lines.map((line) => line.employeeName), ['Andrea Prueba'])
    assert.deepEqual(toB.data.lines.map((line) => line.employeeName), ['Bruno Prueba'])
  })

  test('CA-08: el permiso se evalúa con el rol de cada membresía', async ({ assert }) => {
    const a = await createCompany('alf-ca08c')
    const b = await createCompany('alf-ca08d')
    companies.push(a, b)
    const member = await addUser(a, a.actor.role, 'miembro')
    const withoutRead = await Role.create({
      roleName: `Sin monitor ${uniqueStamp()}`,
      roleSlug: `sin-monitor-${uniqueStamp()}`,
      roleDescription: 'Rol temporal de spec',
      roleActive: 1,
      roleManagementDays: 10,
      businessUnitId: b.id,
    })
    await attachBusinessUnitsWithRole(member.user, [b.id], withoutRead.roleId)
    await insertAssist(await addEmployee(a, 'ALF-8E', 'Andrea'), '2026-10-06T15:00:00Z')
    await insertAssist(await addEmployee(b, 'ALF-8F', 'Bruno'), '2026-10-06T15:00:00Z')
    const sent: SentDigest[] = []
    const { service } = buildService([a, b], { mailer: capturingMailer(sent) })

    await service.run()

    const toB = sent.find((digest) => digest.businessUnitId === b.id)!
    assert.include(sent.find((digest) => digest.businessUnitId === a.id)!.recipients, email(member))
    assert.notInclude(toB.recipients, email(member))
  })

  test('CA-09: sin destinatarios no se toca nada y sale en cuanto los hay', async ({ assert }) => {
    const c = await createCompany('alf-ca09', false)
    companies.push(c)
    await grantModulePermissions(c.actor, ASSIST_LOCATION_FLAG_NOTIFY_MODULE, [])
    const e1 = await addEmployee(c, 'ALF-9', 'Elena')
    const ids = [
      await insertAssist(e1, '2026-10-06T14:00:00Z'),
      await insertAssist(e1, '2026-10-06T15:00:00Z'),
    ]
    const sent: SentDigest[] = []
    const { service, logs } = buildService([c], { mailer: capturingMailer(sent) })

    await service.run()

    assert.lengthOf(sent, 0)
    assert.deepEqual(await notifiedValues(ids), [null, null])
    assert.deepInclude(logs, { level: 'warn', meta: { businessUnitId: c.id } })

    await grantModulePermissions(c.actor, ASSIST_LOCATION_FLAG_NOTIFY_MODULE, ['read'])
    await service.run()

    assert.lengthOf(sent, 1)
    assert.equal(sent[0].data.lines[0].count, 2)
  })

  test('CA-10: si el envío de una empresa falla, se libera y las demás siguen', async ({ assert }) => {
    const a = await createCompany('alf-ca10a')
    const b = await createCompany('alf-ca10b')
    companies.push(a, b)
    const idsA = [await insertAssist(await addEmployee(a, 'ALF-10A', 'Andrea'), '2026-10-06T15:00:00Z')]
    await insertAssist(await addEmployee(b, 'ALF-10B', 'Bruno'), '2026-10-06T15:00:00Z')
    const sent: SentDigest[] = []
    const { service, logs } = buildService([a, b], { mailer: capturingMailer(sent, a.id) })

    const result = await service.run()

    assert.deepEqual(await notifiedValues(idsA), [null])
    assert.deepEqual(
      sent.map((digest) => digest.businessUnitId),
      [b.id]
    )
    assert.equal(result.companiesFailed, 1)
    assert.deepInclude(logs, { level: 'error', meta: { businessUnitId: a.id, error: 'Error' } })
    assert.notInclude(JSON.stringify(logs), 'jsoto@')
  })

  test('CA-11: dos reclamos simultáneos nunca toman la misma checada', async ({ assert }) => {
    const a = await createCompany('alf-ca11')
    companies.push(a)
    const e1 = await addEmployee(a, 'ALF-11', 'Elena')
    const ids: number[] = []
    for (let minute = 0; minute < 20; minute++) {
      ids.push(await insertAssist(e1, `2026-10-06T14:${String(minute).padStart(2, '0')}:00Z`))
    }
    const repository = new AssistLocationFlagDigestRepositoryMysql()
    const since = NOW.minus({ days: 7 })
    const t1 = NOW.startOf('second')
    const t2 = t1.plus({ seconds: 1 })

    const [first, second] = await Promise.all([
      repository.claimPending(a.id, since, 500, t1),
      repository.claimPending(a.id, since, 500, t2),
    ])
    const firstIds = first.map((row) => row.assistId)
    const secondIds = second.map((row) => row.assistId)

    assert.sameMembers([...firstIds, ...secondIds], ids)
    assert.lengthOf(firstIds.filter((id) => secondIds.includes(id)), 0)

    // La liberación solo regresa lo reclamado con su propio instante.
    await db.from('assists').whereIn('assist_id', ids).update({ assist_location_flag_notified_at: null })
    const byT1 = await repository.claimPending(a.id, since, 10, t1)
    const byT2 = await repository.claimPending(a.id, since, 10, t2)
    await repository.releaseClaim(a.id, ids, t1)
    const after = await notifiedAt(ids)

    for (const row of byT1) assert.isNull(after.get(row.assistId))
    for (const row of byT2) assert.isNotNull(after.get(row.assistId))
  })

  test('CA-12: fuera de producción solo sale a la lista de desarrollo', async ({ assert }) => {
    const a = await createCompany('alf-ca12', false)
    companies.push(a)
    await addUser(a, a.actor.role, 'dev', DEV_RECIPIENT)
    await insertAssist(await addEmployee(a, 'ALF-12', 'Elena'), '2026-10-06T15:00:00Z')
    const sent: SentDigest[] = []
    const { service } = buildService([a], {
      isProduction: () => false,
      mailer: capturingMailer(sent),
    })

    await service.run()

    assert.lengthOf(sent, 1)
    assert.deepEqual(sent[0].recipients, [DEV_RECIPIENT])
  })

  test('CA-12: sin nadie de la lista, el envío se simula y se da por avisado', async ({ assert }) => {
    const a = await createCompany('alf-ca12b')
    companies.push(a)
    const ids = [await insertAssist(await addEmployee(a, 'ALF-12B', 'Elena'), '2026-10-06T15:00:00Z')]
    const sent: SentDigest[] = []
    const { service, logs } = buildService([a], {
      isProduction: () => false,
      mailer: capturingMailer(sent),
    })

    await service.run()

    assert.lengthOf(sent, 0)
    const [claimedAt] = await notifiedValues(ids)
    assert.isNotNull(claimedAt)
    assert.deepInclude(logs, { level: 'info', meta: { businessUnitId: a.id, simulated: 1 } })
  })

  test('CA-17: quien tiene checadas propias en el lote no recibe ese correo', async ({ assert }) => {
    const a = await createCompany('alf-ca17')
    companies.push(a)
    const e1 = await addEmployee(a, 'ALF-17A', 'Elena')
    const e2 = await addEmployee(a, 'ALF-17B', 'Ulises')
    await db
      .from('employees')
      .where('employee_id', e2.employee.employeeId)
      .update({ person_id: a.actor.person.personId })
    await insertAssist(e1, '2026-10-06T15:00:00Z')
    await insertAssist(e2, '2026-10-06T15:05:00Z')
    const sent: SentDigest[] = []
    const { service } = buildService([a], { mailer: capturingMailer(sent) })

    await service.run()

    assert.lengthOf(sent, 1)
    assert.deepEqual(sent[0].recipients, [email(a.owner)])
    assert.lengthOf(sent[0].data.lines, 2)
  })

  test('CA-17: si el único destinatario tiene checadas propias, no sale y se libera', async ({ assert }) => {
    const a = await createCompany('alf-ca17b', false)
    companies.push(a)
    const e2 = await addEmployee(a, 'ALF-17C', 'Ulises')
    await db
      .from('employees')
      .where('employee_id', e2.employee.employeeId)
      .update({ person_id: a.actor.person.personId })
    const ids = [await insertAssist(e2, '2026-10-06T15:05:00Z')]
    const sent: SentDigest[] = []
    const { service, logs } = buildService([a], { mailer: capturingMailer(sent) })

    await service.run()

    assert.lengthOf(sent, 0)
    assert.deepEqual(await notifiedValues(ids), [null])
    assert.deepInclude(logs, { level: 'warn', meta: { businessUnitId: a.id } })
  })
})
