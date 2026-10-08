import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import Role from '#models/role'
import SystemSetting from '#models/system_setting'
import User from '#models/user'
import AttendanceFaultHrNotificationService, {
  type AttendanceFaultHrNotifyRow,
} from '#services/attendance_fault_hr_notification_service'

const MODULE = 'employees-attendance-monitor'
const ACTION = 'consecutive-faults'
const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('attendance_fault_hr_notification destinatarios', (group) => {
  let permissionId = 0

  group.setup(async () => {
    const permission = await db
      .from('system_permissions as sp')
      .innerJoin('system_modules as sm', 'sm.system_module_id', 'sp.system_module_id')
      .where('sm.system_module_slug', MODULE)
      .where('sp.system_permission_slug', ACTION)
      .whereNull('sp.system_permission_deleted_at')
      .select('sp.system_permission_id')
      .first()
    if (!permission) throw new Error('No está sembrado consecutive-faults del monitor de asistencia')
    permissionId = Number(permission.system_permission_id)
  })

  test('CA-1, CA-6 y CA-7 el correo de A no incluye a B y un correo repetido sale una vez', async ({
    assert,
  }) => {
    const a = await unit('A')
    const b = await unit('B')
    const roleA = await role('Capital Humano', a.businessUnitId)
    const roleB = await role('RH Manager', b.businessUnitId)
    const userA = await user(roleA.roleId, 'aviso-a')
    const userB = await user(roleB.roleId, 'aviso-b')
    await pivot(a.businessUnitId, userA.user.userId, roleA.roleId)
    await pivot(b.businessUnitId, userB.user.userId, roleB.roleId)
    await grant(roleA.roleId, permissionId)
    await grant(roleA.roleId, permissionId)
    await grant(roleB.roleId, permissionId)
    const service = new AttendanceFaultHrNotificationService()

    try {
      const ofA = await service.fetchHrRecipientUserEmails(a.businessUnitId)
      const ofB = await service.fetchHrRecipientUserEmails(b.businessUnitId)
      assert.deepEqual(ofA.map((email) => email.toLowerCase()), [userA.user.userEmail.toLowerCase()])
      assert.deepEqual(ofB.map((email) => email.toLowerCase()), [userB.user.userEmail.toLowerCase()])
      const employee = await db.from('employees').where('person_id', userA.person.personId).first()
      assert.isNull(employee)
    } finally {
      await cleanup([userA, userB], [roleA, roleB], [a, b], [])
    }
  })

  test('CA-8 sin destinatarios no envía y la siguiente empresa no se entera', async ({ assert }) => {
    const a = await unit('A')
    const setting = await SystemSetting.create({
      businessUnitId: a.businessUnitId,
      systemSettingTradeName: `Aviso ${stamp()}`,
      systemSettingSidebarColor: '#111111',
      systemSettingActive: 1,
      systemSettingMonthlyConversionFactor: 30.4,
      systemSettingAttendanceFaultHrEmails: 1,
    })
    const warnings: string[] = []
    const fake = mail.fake()
    try {
      const result = await new AttendanceFaultHrNotificationService().processSetting(setting, {
        isTest: false,
        log: {
          info: () => undefined,
          error: () => undefined,
          warning: (message) => warnings.push(message),
        },
      })
      assert.deepEqual(result, { sent: false, reason: 'no_recipients' })
      assert.isTrue(warnings.some((message) => message.includes('Ver faltas consecutivas')))
      fake.messages.assertNoneSent()
    } finally {
      mail.restore()
      await cleanup([], [], [a], [setting.systemSettingId])
    }
  })

  test('CA-9 el correo de prueba de A no llega al TESTER de B', async ({ assert }) => {
    const a = await unit('A')
    const b = await unit('B')
    const testerB = await role('TESTER', b.businessUnitId)
    const userB = await user(testerB.roleId, 'tester-b')
    await pivot(b.businessUnitId, userB.user.userId, testerB.roleId)
    const service = new AttendanceFaultHrNotificationService()

    try {
      const ofA = await service.fetchRecipientUserEmailsByRoleSlug('TESTER', a.businessUnitId)
      assert.deepEqual(ofA, [])
      const ofB = await service.fetchRecipientUserEmailsByRoleSlug('TESTER', b.businessUnitId)
      assert.deepEqual(ofB.map((email) => email.toLowerCase()), [userB.user.userEmail.toLowerCase()])
    } finally {
      await cleanup([userB], [testerB], [a, b], [])
    }
  })

  test('CA-10 una fila de otra empresa no entra al correo', ({ assert }) => {
    const service = new AttendanceFaultHrNotificationService()
    const rows: AttendanceFaultHrNotifyRow[] = [
      faultRow(1, 10),
      faultRow(2, 99),
      faultRow(3, 10),
    ]
    const filtered = service.keepRowsOfBusinessUnit(rows, 10)
    assert.deepEqual(
      filtered.kept.map((item) => item.employeeId),
      [1, 3]
    )
    assert.equal(filtered.droppedCount, 1)
  })
})

function faultRow(employeeId: number, businessUnitId: number): AttendanceFaultHrNotifyRow {
  return {
    employeeAssistCalendarId: employeeId,
    employeeId,
    businessUnitId,
    day: '2026-10-06',
    shiftTimeStart: '08:00:00',
    shiftName: 'Matutino',
  }
}

async function unit(label: string): Promise<BusinessUnit> {
  const token = stamp()
  return BusinessUnit.create({
    businessUnitName: `Faltas ${label} ${token}`,
    businessUnitSlug: `faltas-${label}-${token}`.toLowerCase(),
    businessUnitLegalName: `Faltas ${label} ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function role(slug: string, businessUnitId: number): Promise<Role> {
  return Role.create({
    roleName: `Rol ${slug} ${stamp()}`,
    roleSlug: slug,
    roleDescription: 'Rol del aviso',
    roleActive: 1,
    businessUnitId,
  })
}

async function user(roleId: number, label: string): Promise<{ user: User; person: Person }> {
  const token = stamp()
  const person = await Person.create({
    personFirstname: 'Faltas',
    personLastname: label,
    personSecondLastname: token,
    personEmail: `faltas-${label}-${token}@test.local`,
  })
  const created = await User.create({
    userEmail: `faltas-${label}-${token}@test.local`,
    userPassword: 'AvisoFaltasPrueba123!',
    userActive: 1,
    roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return { user: created, person }
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

async function grant(roleId: number, systemPermissionId: number): Promise<void> {
  const now = new Date()
  await db.table('role_system_permissions').insert({
    role_id: roleId,
    system_permission_id: systemPermissionId,
    role_system_permission_created_at: now,
    role_system_permission_updated_at: now,
  })
}

async function cleanup(
  users: Array<{ user: User; person: Person }>,
  roles: Role[],
  units: BusinessUnit[],
  settingIds: number[]
): Promise<void> {
  const userIds = users.map((account) => account.user.userId)
  if (userIds.length > 0) {
    await db.from('business_unit_users').whereIn('user_id', userIds).delete()
    await db.from('users').whereIn('user_id', userIds).delete()
    const personIds = users.map((account) => account.person.personId)
    await db.from('people').whereIn('person_id', personIds).delete()
  }
  for (const item of roles) {
    await db.from('role_system_permissions').where('role_id', item.roleId).delete()
    await db.from('roles').where('role_id', item.roleId).delete()
  }
  if (settingIds.length > 0) {
    await db.from('system_settings').whereIn('system_setting_id', settingIds).delete()
  }
  for (const item of units) {
    await db.from('business_units').where('business_unit_id', item.businessUnitId).delete()
  }
}
