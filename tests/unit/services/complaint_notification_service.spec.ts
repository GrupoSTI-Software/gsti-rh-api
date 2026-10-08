import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import { TenantContext } from '#utils/tenant_context'
import ComplaintNotificationService from '#services/complaint_notification_service'

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

type Account = { user: User; person: Person }

let permissionId = 0
let categoryId = 0

test.group('Aviso de queja nueva', (group) => {
  group.setup(async () => {
    const permission = await db
      .from('system_permissions as sp')
      .innerJoin('system_modules as sm', 'sm.system_module_id', 'sp.system_module_id')
      .where('sm.system_module_slug', 'complaints')
      .where('sp.system_permission_slug', 'update')
      .whereNull('sp.system_permission_deleted_at')
      .select('sp.system_permission_id')
      .first()
    if (!permission) throw new Error('No está sembrado complaints:update')
    permissionId = Number(permission.system_permission_id)

    const category = await db
      .from('complaint_categories')
      .where('complaint_category_slug', 'otro')
      .first()
    if (!category) throw new Error('No está sembrada la categoría otro del buzón')
    categoryId = Number(category.complaint_category_id)
  })

  test('CA-1 y CA-7 el aviso de A no sale a B y el correo no lleva al denunciante', async ({
    assert,
  }) => {
    const a = await unit('A')
    const b = await unit('B')
    const roleA = await role('gestor-a', a.businessUnitId)
    const roleB = await role('gestor-b', b.businessUnitId)
    await grant(roleA.roleId, permissionId)
    await grant(roleB.roleId, permissionId)
    const userA = await account(roleA.roleId, 'gestor-a')
    const userB = await account(roleB.roleId, 'gestor-b')
    await pivot(a.businessUnitId, userA.user.userId, roleA.roleId)
    await pivot(b.businessUnitId, userB.user.userId, roleB.roleId)
    const employeeA = await employee(a.businessUnitId, 'DenuncianteUnicoA', 'ApellidoUnicoA')
    const employeeB = await employee(b.businessUnitId, 'DenuncianteUnicoB', 'ApellidoUnicoB')
    const complaintA = await complaint(a.businessUnitId, employeeA.employeeId, 'DescripcionSecretaQuejaA')
    const complaintB = await complaint(b.businessUnitId, employeeB.employeeId, 'DescripcionSecretaQuejaB')
    const service = new ComplaintNotificationService()
    const fake = mail.fake()

    try {
      await TenantContext.run([a.businessUnitId], () => service.notifyOnNewComplaint(complaintA.id))
      await TenantContext.run([b.businessUnitId], () => service.notifyOnNewComplaint(complaintB.id))

      const htmlA = htmlFor(fake, userA.user.userEmail)
      const htmlB = htmlFor(fake, userB.user.userEmail)
      assert.include(htmlA, complaintA.folio)
      assert.notInclude(htmlA, complaintB.folio)
      assert.include(htmlB, complaintB.folio)
      assert.notInclude(htmlB, complaintA.folio)
      const ofA = await logs(complaintA.id)
      const ofB = await logs(complaintB.id)
      assert.deepEqual(ofA.map((row) => Number(row.recipient_user_id)), [userA.user.userId])
      assert.deepEqual(ofB.map((row) => Number(row.recipient_user_id)), [userB.user.userId])

      assert.notInclude(htmlA, 'DescripcionSecretaQuejaA')
      assert.notInclude(htmlA, 'DenuncianteUnicoA')
      assert.notInclude(htmlA, 'ApellidoUnicoA')
    } finally {
      mail.restore()
      await cleanup(
        [complaintA.id, complaintB.id],
        [employeeA, employeeB],
        [userA, userB],
        [roleA, roleB],
        [a, b]
      )
    }
  })

  test('CA-2 el rol de la cuenta en B no alcanza para la queja de A', async ({ assert }) => {
    const a = await unit('A')
    const b = await unit('B')
    const roleA = await role('colaborador-a', a.businessUnitId)
    const roleB = await role('admin-b', b.businessUnitId)
    await grant(roleB.roleId, permissionId)
    const user = await account(roleB.roleId, 'cuenta-b')
    await pivot(a.businessUnitId, user.user.userId, roleA.roleId)
    const worker = await employee(a.businessUnitId, 'PersonaA', 'QuejaA')
    const created = await complaint(a.businessUnitId, worker.employeeId, 'Texto de A')
    const fake = mail.fake()

    try {
      await TenantContext.run([a.businessUnitId], () =>
        new ComplaintNotificationService().notifyOnNewComplaint(created.id)
      )
      assert.isFalse(sentTo(fake, user.user.userEmail))
      assert.equal(await logCount(created.id), 0)
    } finally {
      mail.restore()
      await cleanup([created.id], [worker], [user], [roleA, roleB], [a, b])
    }
  })

  test('CA-3 el rol asignado en A cuenta aunque la cuenta nació con otro', async ({ assert }) => {
    const a = await unit('A')
    const plain = await role('sin-quejas', a.businessUnitId)
    const manager = await role('con-quejas', a.businessUnitId)
    await grant(manager.roleId, permissionId)
    const user = await account(plain.roleId, 'nacio-sin')
    await pivot(a.businessUnitId, user.user.userId, manager.roleId)
    const worker = await employee(a.businessUnitId, 'PersonaC', 'QuejaC')
    const created = await complaint(a.businessUnitId, worker.employeeId, 'Texto de C')
    const fake = mail.fake()

    try {
      await TenantContext.run([a.businessUnitId], () =>
        new ComplaintNotificationService().notifyOnNewComplaint(created.id)
      )
      assert.isTrue(sentTo(fake, user.user.userEmail))
      const rows = await logs(created.id)
      assert.deepEqual(rows.map((row) => Number(row.recipient_user_id)), [user.user.userId])
    } finally {
      mail.restore()
      await cleanup([created.id], [worker], [user], [plain, manager], [a])
    }
  })

  test('CA-4 sin rol en la pivote no cae al rol de otra empresa', async ({ assert }) => {
    const a = await unit('A')
    const b = await unit('B')
    const roleB = await role('admin-b', b.businessUnitId)
    await grant(roleB.roleId, permissionId)
    const user = await account(roleB.roleId, 'pivote-nula')
    await pivot(a.businessUnitId, user.user.userId, null)
    const worker = await employee(a.businessUnitId, 'PersonaD', 'QuejaD')
    const created = await complaint(a.businessUnitId, worker.employeeId, 'Texto de D')
    const fake = mail.fake()

    try {
      await TenantContext.run([a.businessUnitId], () =>
        new ComplaintNotificationService().notifyOnNewComplaint(created.id)
      )
      assert.isFalse(sentTo(fake, user.user.userEmail))
      assert.equal(await logCount(created.id), 0)
    } finally {
      mail.restore()
      await cleanup([created.id], [worker], [user], [roleB], [a, b])
    }
  })

  test('CA-5 no reciben inactivo, pivote borrada, owner ni root', async ({ assert }) => {
    const a = await unit('A')
    const liveRole = await role('gestor', a.businessUnitId)
    await grant(liveRole.roleId, permissionId)
    const live = await account(liveRole.roleId, 'vivo')
    const inactive = await account(liveRole.roleId, 'inactivo')
    const removed = await account(liveRole.roleId, 'pivote-baja')
    await pivot(a.businessUnitId, live.user.userId, liveRole.roleId)
    await pivot(a.businessUnitId, inactive.user.userId, liveRole.roleId)
    await pivot(a.businessUnitId, removed.user.userId, liveRole.roleId)
    await db.from('users').where('user_id', inactive.user.userId).update({ user_active: 0 })
    await db
      .from('business_unit_users')
      .where('user_id', removed.user.userId)
      .update({ business_unit_user_deleted_at: new Date() })

    const ownerRole = await role('owner', a.businessUnitId, true)
    const rootRole = await role('root', a.businessUnitId, true)
    await grant(ownerRole.roleId, permissionId)
    await grant(rootRole.roleId, permissionId)
    const owner = await account(ownerRole.roleId, 'owner')
    const root = await account(rootRole.roleId, 'root')
    await pivot(a.businessUnitId, owner.user.userId, ownerRole.roleId)
    await pivot(a.businessUnitId, root.user.userId, rootRole.roleId)

    const worker = await employee(a.businessUnitId, 'PersonaE', 'QuejaE')
    const created = await complaint(a.businessUnitId, worker.employeeId, 'Texto de E')
    const fake = mail.fake()

    try {
      await TenantContext.run([a.businessUnitId], () =>
        new ComplaintNotificationService().notifyOnNewComplaint(created.id)
      )
      assert.isTrue(sentTo(fake, live.user.userEmail))
      assert.isFalse(sentTo(fake, inactive.user.userEmail))
      assert.isFalse(sentTo(fake, removed.user.userEmail))
      assert.isFalse(sentTo(fake, owner.user.userEmail))
      assert.isFalse(sentTo(fake, root.user.userEmail))
      const rows = await logs(created.id)
      const ids = rows.map((row) => Number(row.recipient_user_id))
      assert.deepEqual(ids, [live.user.userId])
    } finally {
      mail.restore()
      await cleanup(
        [created.id],
        [worker],
        [live, inactive, removed, owner, root],
        [liveRole, ownerRole, rootRole],
        [a]
      )
    }
  })

  test('CA-6 sin concesión no envía, no registra y no abre el aviso a la empresa', async ({
    assert,
  }) => {
    const a = await unit('A')
    const plain = await role('sin-permiso', a.businessUnitId)
    const user = await account(plain.roleId, 'sin-permiso')
    await pivot(a.businessUnitId, user.user.userId, plain.roleId)
    const worker = await employee(a.businessUnitId, 'PersonaF', 'QuejaF')
    const created = await complaint(a.businessUnitId, worker.employeeId, 'Texto de F')
    const fake = mail.fake()

    try {
      await TenantContext.run([a.businessUnitId], () =>
        new ComplaintNotificationService().notifyOnNewComplaint(created.id)
      )
      fake.messages.assertNoneSent()
      fake.mails.assertNoneSent()
      assert.equal(await logCount(created.id), 0)
    } finally {
      mail.restore()
      await cleanup([created.id], [worker], [user], [plain], [a])
    }
  })

  test('CA-8 dos concesiones vivas dejan un solo correo y un solo registro', async ({ assert }) => {
    const a = await unit('A')
    const manager = await role('doble', a.businessUnitId)
    await grant(manager.roleId, permissionId)
    await grant(manager.roleId, permissionId)
    const user = await account(manager.roleId, 'una-vez')
    await pivot(a.businessUnitId, user.user.userId, manager.roleId)
    const worker = await employee(a.businessUnitId, 'PersonaH', 'QuejaH')
    const created = await complaint(a.businessUnitId, worker.employeeId, 'Texto de H')
    const fake = mail.fake()

    try {
      await TenantContext.run([a.businessUnitId], () =>
        new ComplaintNotificationService().notifyOnNewComplaint(created.id)
      )
      const matches = fake.mails.sent().filter((item) => item.message.hasTo(user.user.userEmail))
      assert.lengthOf(matches, 1)
      assert.equal(await logCount(created.id), 1)
    } finally {
      mail.restore()
      await cleanup([created.id], [worker], [user], [manager], [a])
    }
  })
})

function sentTo(fake: ReturnType<typeof mail.fake>, email: string): boolean {
  return fake.mails.sent().some((item) => item.message.hasTo(email))
}

function htmlFor(fake: ReturnType<typeof mail.fake>, email: string): string {
  const found = fake.mails.sent().find((item) => item.message.hasTo(email))
  return String(found?.message.nodeMailerMessage.html ?? '')
}

async function unit(label: string): Promise<BusinessUnit> {
  const token = stamp()
  return BusinessUnit.create({
    businessUnitName: `Queja ${label} ${token}`,
    businessUnitSlug: `queja-${label}-${token}`.toLowerCase(),
    businessUnitLegalName: `Queja ${label} ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function role(slug: string, businessUnitId: number, exact = false): Promise<Role> {
  return Role.create({
    roleName: `Rol ${slug} ${stamp()}`,
    roleSlug: exact ? slug : `${slug}-${stamp()}`.toLowerCase().slice(0, 140),
    roleDescription: 'Rol del aviso de quejas',
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
    personEmail: `queja-${label}-${token}@test.local`,
  })
  const user = await User.create({
    userEmail: `queja-${label}-${token}@test.local`,
    userPassword: 'AvisoQuejaPrueba123!',
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

async function employee(
  businessUnitId: number,
  firstName: string,
  lastName: string
): Promise<{ employeeId: number; personId: number }> {
  const token = stamp()
  const person = await Person.create({
    personFirstname: firstName,
    personLastname: lastName,
    personSecondLastname: token,
    personEmail: `denuncia-${token}@test.local`,
    businessUnitId,
  })
  const [employeeId] = await db.table('employees').insert({
    employee_slug: opaqueEmployeeSlug(),
    employee_sync_id: `EMP-QJ-${token}`,
    employee_code: `EMP-QJ-${token}`,
    employee_first_name: firstName,
    employee_last_name: lastName,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    person_id: person.personId,
    employee_created_at: new Date(),
    employee_updated_at: new Date(),
  })
  return { employeeId: Number(employeeId), personId: person.personId }
}

async function complaint(
  businessUnitId: number,
  employeeId: number,
  description: string
): Promise<{ id: number; folio: string }> {
  const token = stamp()
  const folio = `QJ-${token}`
  const now = new Date()
  const [id] = await db.table('complaints').insert({
    employee_id: employeeId,
    business_unit_id: businessUnitId,
    complaint_folio: folio,
    complaint_passphrase_hash: `hash-${token}`,
    complaint_category_id: categoryId,
    complaint_description: description,
    complaint_status: 'nuevo',
    complaint_created_at: now,
    complaint_updated_at: now,
  })
  return { id: Number(id), folio }
}

async function logs(complaintId: number): Promise<Array<Record<string, unknown>>> {
  return db.from('complaint_notification_logs').where('complaint_id', complaintId)
}

async function logCount(complaintId: number): Promise<number> {
  const rows = await db
    .from('complaint_notification_logs')
    .where('complaint_id', complaintId)
    .count('* as total')
  return Number(rows[0].total)
}

async function cleanup(
  complaintIds: number[],
  workers: Array<{ employeeId: number; personId: number }>,
  users: Account[],
  roles: Role[],
  units: BusinessUnit[]
): Promise<void> {
  if (complaintIds.length > 0) {
    await db.from('complaint_notification_logs').whereIn('complaint_id', complaintIds).delete()
    await db.from('complaints').whereIn('complaint_id', complaintIds).delete()
  }
  const employeeIds = workers.map((row) => row.employeeId)
  if (employeeIds.length > 0) {
    await db.from('employees').whereIn('employee_id', employeeIds).delete()
  }
  const userIds = users.map((row) => row.user.userId)
  if (userIds.length > 0) {
    await db.from('business_unit_users').whereIn('user_id', userIds).delete()
    await db.from('users').whereIn('user_id', userIds).delete()
  }
  const personIds = [
    ...users.map((row) => row.person.personId),
    ...workers.map((row) => row.personId),
  ]
  if (personIds.length > 0) {
    await db.from('people').whereIn('person_id', personIds).delete()
  }
  for (const item of roles) {
    await db.from('role_system_permissions').where('role_id', item.roleId).delete()
    await db.from('roles').where('role_id', item.roleId).delete()
  }
  for (const item of units) {
    await db.from('business_units').where('business_unit_id', item.businessUnitId).delete()
  }
}
