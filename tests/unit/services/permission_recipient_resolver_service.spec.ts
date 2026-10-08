import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import { attachBusinessUnitsWithRole } from '#helpers/attach_business_units_with_role'
import {
  ASSIST_LOCATION_FLAG_NOTIFY_ACTION,
  ASSIST_LOCATION_FLAG_NOTIFY_MODULE,
} from '#constants/assist_location_flag_digest'
import PermissionRecipientResolverService from '#services/permission_recipient_resolver_service'
import {
  cleanupTenantActor,
  cleanupUnitUser,
  createBypassUserInBusinessUnit,
  createTenantActor,
  grantModulePermissions,
  grantRoleModulePermissions,
  type TenantActor,
  type UnitUser,
} from '#tests/helpers/tenant_actor'

/**
 * Destinatarios por permiso con el rol efectivo de cada empresa
 * (VLRH-H1791056340278, CA-07 y SEC-278-2).
 */

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

const query = (businessUnitId: number) => ({
  businessUnitId,
  module: ASSIST_LOCATION_FLAG_NOTIFY_MODULE,
  action: ASSIST_LOCATION_FLAG_NOTIFY_ACTION,
})

async function createRole(actor: TenantActor, label: string): Promise<Role> {
  const stamp = uniqueStamp()
  return Role.create({
    roleName: `Destinatarios ${label} ${stamp}`,
    roleSlug: `destinatarios-${label}-${stamp}`,
    roleDescription: 'Rol temporal de spec',
    roleActive: 1,
    roleManagementDays: 10,
    businessUnitId: actor.businessUnit.businessUnitId,
  })
}

/** Cuenta con membresía en la empresa del actor, con el rol dado en pivote y cuenta. */
async function addUser(
  actor: TenantActor,
  role: Role,
  label: string,
  email?: string
): Promise<UnitUser> {
  const address = email ?? `recipient-${label}-${uniqueStamp()}@gsti-tests.local`
  const person = await Person.create({
    personFirstname: 'Destinatario',
    personLastname: 'Spec',
    personSecondLastname: label,
    personEmail: `person-${label}-${uniqueStamp()}@gsti-tests.local`,
    businessUnitId: actor.businessUnit.businessUnitId,
  })
  const user = await User.create({
    userEmail: address,
    userPassword: 'RecipientResolver123!',
    userActive: 1,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  await attachBusinessUnitsWithRole(user, [actor.businessUnit.businessUnitId], role.roleId)
  return { user, person }
}

async function clearPivotRole(user: UnitUser, businessUnitId: number): Promise<void> {
  await db
    .from('business_unit_users')
    .where('user_id', user.user.userId)
    .where('business_unit_id', businessUnitId)
    .update({ role_id: null })
}

test.group('PermissionRecipientResolverService — resolveEmails', (group) => {
  let companyA: TenantActor | null = null
  let companyB: TenantActor | null = null
  const users: UnitUser[] = []

  group.each.teardown(async () => {
    for (const user of users.splice(0)) await cleanupUnitUser(user)
    await cleanupTenantActor(companyA)
    await cleanupTenantActor(companyB)
    companyA = null
    companyB = null
  })

  test('rol efectivo por empresa, dueño dentro y plataforma fuera', async ({ assert }) => {
    companyA = await createTenantActor('rcp-a')
    companyB = await createTenantActor('rcp-b')
    const a = companyA.businessUnit.businessUnitId
    const b = companyB.businessUnit.businessUnitId

    // U1: el actor de A, con el permiso por la pivote.
    await grantModulePermissions(companyA, ASSIST_LOCATION_FLAG_NOTIFY_MODULE, ['read'])
    const readerA = companyA.role
    const withoutRead = await createRole(companyA, 'sin-permiso')
    await grantRoleModulePermissions(withoutRead, ASSIST_LOCATION_FLAG_NOTIFY_MODULE, [
      'read-time-worked',
    ])
    await grantModulePermissions(companyB, ASSIST_LOCATION_FLAG_NOTIFY_MODULE, ['read'])
    const readerB = companyB.role

    const u2 = await addUser(companyA, withoutRead, 'u2')
    const u3 = await addUser(companyA, readerA, 'u3')
    await db.from('users').where('user_id', u3.user.userId).update({ user_active: 0 })
    const u4 = await addUser(companyA, readerA, 'u4')
    await db.from('users').where('user_id', u4.user.userId).update({ user_deleted_at: new Date() })
    const u5 = await addUser(companyA, readerA, 'u5')
    await db
      .from('business_unit_users')
      .where('user_id', u5.user.userId)
      .update({ business_unit_user_deleted_at: new Date() })
    // U7: sin rol en la pivote; su cuenta trae un rol de A con el permiso.
    const u7 = await addUser(companyA, readerA, 'u7')
    await clearPivotRole(u7, a)
    // U8: sin rol en la pivote; su cuenta trae un rol de B, que no cuenta en A.
    const u8 = await addUser(companyA, withoutRead, 'u8')
    await clearPivotRole(u8, a)
    await db.from('users').where('user_id', u8.user.userId).update({ role_id: readerB.roleId })
    const owner = await createBypassUserInBusinessUnit('owner', 'rcp-owner', a)
    const root = await createBypassUserInBusinessUnit('root', 'rcp-root', a)
    const platform = await addUser(companyA, readerA, 'plataforma')
    await db.from('users').where('user_id', platform.user.userId).update({ is_platform_admin: 1 })
    // En B: U6 con el permiso y su dueño. Nunca aparecen en A.
    const u6 = await addUser(companyB, readerB, 'u6')
    const ownerB = await createBypassUserInBusinessUnit('owner', 'rcp-owner-b', b)
    users.push(u2, u3, u4, u5, u7, u8, owner, root, platform, u6, ownerB)

    const expected = [
      { id: companyA.user.userId, email: companyA.user.userEmail },
      { id: u7.user.userId, email: u7.user.userEmail },
      { id: owner.user.userId, email: owner.user.userEmail },
    ]
      .sort((x, y) => x.id - y.id)
      .map((entry) => entry.email.toLowerCase())

    const emails = await new PermissionRecipientResolverService().resolveEmails(query(a))

    assert.deepEqual(emails, expected)
  })

  test('el correo sale en minusculas aunque se haya guardado con mayusculas', async ({ assert }) => {
    // Dos cuentas vivas no pueden compartir correo: lo impide el indice unico
    // `users_email_active_unique`, que no distingue mayusculas. Lo que si puede
    // pasar es un correo capturado con mayusculas, y debe compararse igual que
    // la lista de desarrollo y los correos de las cuentas del propio empleado.
    companyA = await createTenantActor('rcp-mayus')
    await grantModulePermissions(companyA, ASSIST_LOCATION_FLAG_NOTIFY_MODULE, ['read'])
    const upper = await addUser(
      companyA,
      companyA.role,
      'mayus',
      `  Recipient-Mayus-${uniqueStamp()}@GSTI-Tests.local`
    )
    users.push(upper)

    const emails = await new PermissionRecipientResolverService().resolveEmails(
      query(companyA.businessUnit.businessUnitId)
    )

    assert.deepEqual(emails, [
      companyA.user.userEmail.toLowerCase(),
      upper.user.userEmail.trim().toLowerCase(),
    ])
  })
})
