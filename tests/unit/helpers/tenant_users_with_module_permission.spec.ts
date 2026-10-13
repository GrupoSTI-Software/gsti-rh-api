import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import Role from '#models/role'
import User from '#models/user'
import {
  fetchTenantHumanCapitalUsers,
  fetchTenantUsersByEffectiveRoleSlugs,
  fetchTenantUsersWithModulePermission,
} from '#helpers/tenant_users_with_module_permission'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

const MODULE = 'employees-attendance-monitor'
const ACTION = 'consecutive-faults'
const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('tenant_users_with_module_permission', (group) => {
  let permissionId = 0
  let moduleId = 0

  group.setup(async () => {
    const row = await db
      .from('system_permissions as sp')
      .innerJoin('system_modules as sm', 'sm.system_module_id', 'sp.system_module_id')
      .where('sm.system_module_slug', MODULE)
      .where('sp.system_permission_slug', ACTION)
      .whereNull('sp.system_permission_deleted_at')
      .select('sp.system_permission_id', 'sm.system_module_id')
      .first()
    if (!row) throw new Error('No está sembrado consecutive-faults del monitor de asistencia')
    permissionId = Number(row.system_permission_id)
    moduleId = Number(row.system_module_id)
  })

  test('CA-1 y CA-2 el permiso de A no entrega destinatarios de B ni un rol sin la acción', async ({
    assert,
  }) => {
    const a = await unit('A')
    const b = await unit('B')
    const roleA = await role('capital-humano', a.businessUnitId)
    const roleRead = await role('solo-lectura', a.businessUnitId)
    const roleB = await role('RH Manager', b.businessUnitId)
    const userA = await user(roleA.roleId, 'capital')
    const userRead = await user(roleRead.roleId, 'lectura')
    const userB = await user(roleB.roleId, 'rh-b')
    await pivot(a.businessUnitId, userA.user.userId, roleA.roleId)
    await pivot(a.businessUnitId, userRead.user.userId, roleRead.roleId)
    await pivot(b.businessUnitId, userB.user.userId, roleB.roleId)
    const readPermission = await db
      .from('system_permissions as sp')
      .where('sp.system_module_id', moduleId)
      .where('sp.system_permission_slug', 'read')
      .whereNull('sp.system_permission_deleted_at')
      .first()
    await grant(roleA.roleId, permissionId)
    await grant(roleB.roleId, permissionId)
    if (readPermission) await grant(roleRead.roleId, Number(readPermission.system_permission_id))

    try {
      const ofA = await fetchTenantUsersWithModulePermission({
        businessUnitId: a.businessUnitId,
        moduleSlug: MODULE,
        permissionSlug: ACTION,
      })
      const ofB = await fetchTenantUsersWithModulePermission({
        businessUnitId: b.businessUnitId,
        moduleSlug: MODULE,
        permissionSlug: ACTION,
      })
      assert.deepEqual(ofA.map((row) => row.userId), [userA.user.userId])
      assert.deepEqual(ofB.map((row) => row.userId), [userB.user.userId])
    } finally {
      await cleanup([userA, userRead, userB], [roleA, roleRead, roleB], [a, b])
    }
  })

  test('CA-3 el permiso en B no alcanza para el aviso de A', async ({ assert }) => {
    const a = await unit('A')
    const b = await unit('B')
    const roleA = await role('sin-faltas', a.businessUnitId)
    const roleB = await role('con-faltas', b.businessUnitId)
    const account = await user(roleA.roleId, 'doble')
    await pivot(a.businessUnitId, account.user.userId, roleA.roleId)
    await pivot(b.businessUnitId, account.user.userId, roleB.roleId)
    await grant(roleB.roleId, permissionId)

    try {
      const ofA = await fetchTenantUsersWithModulePermission({
        businessUnitId: a.businessUnitId,
        moduleSlug: MODULE,
        permissionSlug: ACTION,
      })
      const ofB = await fetchTenantUsersWithModulePermission({
        businessUnitId: b.businessUnitId,
        moduleSlug: MODULE,
        permissionSlug: ACTION,
      })
      assert.deepEqual(ofA, [])
      assert.deepEqual(ofB.map((row) => row.userId), [account.user.userId])
    } finally {
      await cleanup([account], [roleA, roleB], [a, b])
    }
  })

  test('CA-4 el rol de la cuenta solo cuenta si es de la misma empresa y la pivote no apunta a un rol borrado', async ({
    assert,
  }) => {
    const a = await unit('A')
    const b = await unit('B')
    const roleA = await role('cuenta-a', a.businessUnitId)
    const roleB = await role('cuenta-b', b.businessUnitId)
    const deletedRole = await role('borrado-pivote', a.businessUnitId)
    await grant(roleA.roleId, permissionId)
    await grant(roleB.roleId, permissionId)
    await grant(deletedRole.roleId, permissionId)

    const sameCompany = await user(roleA.roleId, 'misma')
    await pivot(a.businessUnitId, sameCompany.user.userId, null)

    const otherCompany = await user(roleB.roleId, 'ajena')
    await pivot(a.businessUnitId, otherCompany.user.userId, null)

    const brokenPivot = await user(roleA.roleId, 'pivote-rota')
    await pivot(a.businessUnitId, brokenPivot.user.userId, deletedRole.roleId)
    await db.from('roles').where('role_id', deletedRole.roleId).update({ role_deleted_at: new Date() })

    try {
      const recipients = await fetchTenantUsersWithModulePermission({
        businessUnitId: a.businessUnitId,
        moduleSlug: MODULE,
        permissionSlug: ACTION,
      })
      const ids = recipients.map((recipient) => recipient.userId)
      assert.include(ids, sameCompany.user.userId)
      assert.notInclude(ids, otherCompany.user.userId)
      assert.notInclude(ids, brokenPivot.user.userId)
    } finally {
      await cleanup(
        [sameCompany, otherCompany, brokenPivot],
        [roleA, roleB, deletedRole],
        [a, b]
      )
    }
  })

  test('CA-5 y CA-6 no salen los estados terminales ni root u owner, y sí sale quien no tiene expediente', async ({
    assert,
  }) => {
    const a = await unit('A')
    const roleA = await role('con-permiso', a.businessUnitId)
    await grant(roleA.roleId, permissionId)
    const ok = await user(roleA.roleId, 'sin-expediente')
    await pivot(a.businessUnitId, ok.user.userId, roleA.roleId)

    const inactiveUser = await user(roleA.roleId, 'inactivo')
    await pivot(a.businessUnitId, inactiveUser.user.userId, roleA.roleId)
    await db.from('users').where('user_id', inactiveUser.user.userId).update({ user_active: 0 })

    const deletedUser = await user(roleA.roleId, 'borrado')
    await pivot(a.businessUnitId, deletedUser.user.userId, roleA.roleId)
    await db.from('users').where('user_id', deletedUser.user.userId).update({ user_deleted_at: new Date() })

    const blankEmail = await user(roleA.roleId, 'sin-correo')
    await pivot(a.businessUnitId, blankEmail.user.userId, roleA.roleId)
    await db.from('users').where('user_id', blankEmail.user.userId).update({ user_email: '   ' })

    const inactiveRole = await role('rol-inactivo', a.businessUnitId)
    await grant(inactiveRole.roleId, permissionId)
    const inactiveRoleUser = await user(inactiveRole.roleId, 'rol-off')
    await pivot(a.businessUnitId, inactiveRoleUser.user.userId, inactiveRole.roleId)
    await db.from('roles').where('role_id', inactiveRole.roleId).update({ role_active: 0 })

    const removedPivot = await user(roleA.roleId, 'pivote-baja')
    const pivotId = await pivot(a.businessUnitId, removedPivot.user.userId, roleA.roleId)
    await db
      .from('business_unit_users')
      .where('business_unit_user_id', pivotId)
      .update({ business_unit_user_deleted_at: new Date() })

    try {
      const recipients = await fetchTenantUsersWithModulePermission({
        businessUnitId: a.businessUnitId,
        moduleSlug: MODULE,
        permissionSlug: ACTION,
      })
      const ids = recipients.map((recipient) => recipient.userId)
      assert.deepEqual(ids, [ok.user.userId])
      const employee = await db.from('employees').where('person_id', ok.person.personId).first()
      assert.isNull(employee)
    } finally {
      await cleanup(
        [ok, inactiveUser, deletedUser, blankEmail, inactiveRoleUser, removedPivot],
        [roleA, inactiveRole],
        [a]
      )
    }
  })

  test('CA-5 el dueño y el usuario de plataforma no entran por su slug', async ({ assert }) => {
    const a = await unit('A')
    const owner = await role('owner', a.businessUnitId)
    const root = await role('root', a.businessUnitId)
    const ownerUser = await user(owner.roleId, 'owner')
    const rootUser = await user(root.roleId, 'root')
    await pivot(a.businessUnitId, ownerUser.user.userId, owner.roleId)
    await pivot(a.businessUnitId, rootUser.user.userId, root.roleId)
    const ownerGrant = await grant(owner.roleId, permissionId)
    const rootGrant = await grant(root.roleId, permissionId)

    try {
      const recipients = await fetchTenantUsersWithModulePermission({
        businessUnitId: a.businessUnitId,
        moduleSlug: MODULE,
        permissionSlug: ACTION,
      })
      const ids = recipients.map((recipient) => recipient.userId)
      assert.notInclude(ids, ownerUser.user.userId)
      assert.notInclude(ids, rootUser.user.userId)
    } finally {
      await db.from('role_system_permissions').whereIn('role_system_permission_id', [ownerGrant, rootGrant]).delete()
      await cleanup([ownerUser, rootUser], [owner, root], [a])
    }
  })

  test('CA-7 dos concesiones vivas del mismo rol dejan un solo usuario', async ({ assert }) => {
    const a = await unit('A')
    const roleA = await role('doble-concesion', a.businessUnitId)
    const account = await user(roleA.roleId, 'una-vez')
    await pivot(a.businessUnitId, account.user.userId, roleA.roleId)
    await grant(roleA.roleId, permissionId)
    await grant(roleA.roleId, permissionId)

    try {
      const rows = await fetchTenantUsersWithModulePermission({
        businessUnitId: a.businessUnitId,
        moduleSlug: MODULE,
        permissionSlug: ACTION,
      })
      assert.deepEqual(rows.map((row) => row.userId), [account.user.userId])
    } finally {
      await cleanup([account], [roleA], [a])
    }
  })

  test('CA-9 el modo de prueba solo ve al TESTER de esa empresa', async ({ assert }) => {
    const a = await unit('A')
    const b = await unit('B')
    const testerA = await role('TESTER', a.businessUnitId)
    const testerB = await role('TESTER', b.businessUnitId)
    const userA = await user(testerA.roleId, 'tester-a')
    const userB = await user(testerB.roleId, 'tester-b')
    await pivot(a.businessUnitId, userA.user.userId, testerA.roleId)
    await pivot(b.businessUnitId, userB.user.userId, testerB.roleId)

    try {
      const ofA = await fetchTenantUsersByEffectiveRoleSlugs({
        businessUnitId: a.businessUnitId,
        roleSlugs: ['TESTER'],
      })
      assert.deepEqual(ofA.map((row) => row.userId), [userA.user.userId])
    } finally {
      await cleanup([userA, userB], [testerA, testerB], [a, b])
    }
  })

  test('CA-11 una empresa o un slug inválidos no consultan', async ({ assert }) => {
    const trx = {
      from() {
        throw new Error('no debía consultar')
      },
    } as unknown as TransactionClientContract

    assert.deepEqual(
      await fetchTenantUsersWithModulePermission(
        { businessUnitId: 0, moduleSlug: MODULE, permissionSlug: ACTION },
        trx
      ),
      []
    )
    assert.deepEqual(
      await fetchTenantUsersWithModulePermission(
        { businessUnitId: Number.NaN, moduleSlug: MODULE, permissionSlug: ACTION },
        trx
      ),
      []
    )
    assert.deepEqual(
      await fetchTenantUsersWithModulePermission(
        { businessUnitId: 1, moduleSlug: '  ', permissionSlug: ACTION },
        trx
      ),
      []
    )
    assert.deepEqual(
      await fetchTenantUsersByEffectiveRoleSlugs({ businessUnitId: -1, roleSlugs: ['TESTER'] }, trx),
      []
    )
    assert.deepEqual(
      await fetchTenantUsersByEffectiveRoleSlugs({ businessUnitId: 1, roleSlugs: ['  '] }, trx),
      []
    )
  })

  test('CA-5 concesión borrada, rol borrado y empresa inactiva no entregan destinatarios', async ({
    assert,
  }) => {
    const a = await unit('A')
    const liveRole = await role('vivo', a.businessUnitId)
    const revokedRole = await role('concesion-baja', a.businessUnitId)
    const goneRole = await role('rol-borrado', a.businessUnitId)
    await grant(liveRole.roleId, permissionId)
    const revokedGrant = await grant(revokedRole.roleId, permissionId)
    await grant(goneRole.roleId, permissionId)
    const live = await user(liveRole.roleId, 'vivo')
    const revoked = await user(revokedRole.roleId, 'concesion-baja')
    const deletedRoleUser = await user(goneRole.roleId, 'rol-baja')
    await pivot(a.businessUnitId, live.user.userId, liveRole.roleId)
    await pivot(a.businessUnitId, revoked.user.userId, revokedRole.roleId)
    await pivot(a.businessUnitId, deletedRoleUser.user.userId, goneRole.roleId)
    await db
      .from('role_system_permissions')
      .where('role_system_permission_id', revokedGrant)
      .update({ role_system_permission_deleted_at: new Date() })
    await db.from('roles').where('role_id', goneRole.roleId).update({ role_deleted_at: new Date() })

    try {
      const recipients = await fetchTenantUsersWithModulePermission({
        businessUnitId: a.businessUnitId,
        moduleSlug: MODULE,
        permissionSlug: ACTION,
      })
      const ids = recipients.map((recipient) => recipient.userId)
      assert.deepEqual(ids, [live.user.userId])

      await db.from('business_units').where('business_unit_id', a.businessUnitId).update({
        business_unit_active: 0,
      })
      assert.deepEqual(
        await fetchTenantUsersWithModulePermission({
          businessUnitId: a.businessUnitId,
          moduleSlug: MODULE,
          permissionSlug: ACTION,
        }),
        []
      )
    } finally {
      await cleanup([live, revoked, deletedRoleUser], [liveRole, revokedRole, goneRole], [a])
    }
  })

  test('CA-5 con el módulo inactivo no sale nadie', async ({ assert }) => {
    const a = await unit('A')
    const roleA = await role('con-permiso', a.businessUnitId)
    const account = await user(roleA.roleId, 'modulo-off')
    await pivot(a.businessUnitId, account.user.userId, roleA.roleId)
    await grant(roleA.roleId, permissionId)
    await db.from('system_modules').where('system_module_id', moduleId).update({ system_module_active: 0 })

    try {
      const rows = await fetchTenantUsersWithModulePermission({
        businessUnitId: a.businessUnitId,
        moduleSlug: MODULE,
        permissionSlug: ACTION,
      })
      assert.deepEqual(rows, [])
    } finally {
      await db.from('system_modules').where('system_module_id', moduleId).update({ system_module_active: 1 })
      await cleanup([account], [roleA], [a])
    }
  })
})

test.group('fetchTenantHumanCapitalUsers', () => {
  test('CH1 el rol marcado entra y rh-manager sin marca no', async ({ assert }) => {
    const company = await unit('talento')
    const talento = await role('Talento', company.businessUnitId)
    const manager = await role('rh-manager', company.businessUnitId)
    await markHumanCapital(talento.roleId)
    const marked = await user(talento.roleId, 'talento')
    const unmarked = await user(manager.roleId, 'manager')
    await pivot(company.businessUnitId, marked.user.userId, talento.roleId)
    await pivot(company.businessUnitId, unmarked.user.userId, manager.roleId)

    try {
      const rows = await fetchTenantHumanCapitalUsers({ businessUnitIds: [company.businessUnitId] })
      const ids = rows.map((row) => row.userId)
      assert.include(ids, marked.user.userId)
      assert.notInclude(ids, unmarked.user.userId)
    } finally {
      await cleanup([marked, unmarked], [talento, manager], [company])
    }
  })

  test('CH2 un rol marcado de otra empresa no entra', async ({ assert }) => {
    const companyA = await unit('marca-a')
    const companyB = await unit('marca-b')
    const roleB = await role('talento-b', companyB.businessUnitId)
    await markHumanCapital(roleB.roleId)
    const account = await user(roleB.roleId, 'solo-b')
    await pivot(companyB.businessUnitId, account.user.userId, roleB.roleId)

    try {
      const rows = await fetchTenantHumanCapitalUsers({ businessUnitIds: [companyA.businessUnitId] })
      assert.notInclude(
        rows.map((row) => row.userId),
        account.user.userId
      )
    } finally {
      await cleanup([account], [roleB], [companyA, companyB])
    }
  })

  test('CH3 con acceso a dos empresas sale una fila, la de la empresa cuyo rol está marcado', async ({
    assert,
  }) => {
    const companyA = await unit('acceso-a')
    const companyB = await unit('acceso-b')
    const roleA = await role('operacion', companyA.businessUnitId)
    const roleB = await role('talento', companyB.businessUnitId)
    await markHumanCapital(roleB.roleId)
    const account = await user(roleA.roleId, 'dos-empresas')
    await pivot(companyA.businessUnitId, account.user.userId, roleA.roleId)
    await pivot(companyB.businessUnitId, account.user.userId, roleB.roleId)

    try {
      const rows = await fetchTenantHumanCapitalUsers({
        businessUnitIds: [companyA.businessUnitId, companyB.businessUnitId],
      })
      const own = rows.filter((row) => row.userId === account.user.userId)
      assert.lengthOf(own, 1)
      assert.equal(own[0]?.businessUnitId, companyB.businessUnitId)
    } finally {
      await cleanup([account], [roleA, roleB], [companyA, companyB])
    }
  })

  test('CH4 el rol de la cuenta cuenta si es de la empresa, el común marcado cuenta y el borrado en la pivote no', async ({
    assert,
  }) => {
    const companyA = await unit('efectivo-a')
    const companyB = await unit('efectivo-b')
    const roleA = await role('cuenta-a', companyA.businessUnitId)
    const roleB = await role('cuenta-b', companyB.businessUnitId)
    const deletedOnPivot = await role('pivote-borrada', companyA.businessUnitId)
    const shared = await role(`comun-${stamp()}`, null)
    await markHumanCapital(roleA.roleId)
    await markHumanCapital(roleB.roleId)
    await markHumanCapital(deletedOnPivot.roleId)
    await markHumanCapital(shared.roleId)

    const sameCompany = await user(roleA.roleId, 'cuenta-misma')
    await pivot(companyA.businessUnitId, sameCompany.user.userId, null)

    const otherCompany = await user(roleB.roleId, 'cuenta-ajena')
    await pivot(companyA.businessUnitId, otherCompany.user.userId, null)

    const brokenPivot = await user(roleA.roleId, 'pivote-rota')
    await pivot(companyA.businessUnitId, brokenPivot.user.userId, deletedOnPivot.roleId)
    await db.from('roles').where('role_id', deletedOnPivot.roleId).update({ role_deleted_at: new Date() })

    const sharedAccount = await user(shared.roleId, 'comun')
    await pivot(companyA.businessUnitId, sharedAccount.user.userId, null)

    try {
      const rows = await fetchTenantHumanCapitalUsers({ businessUnitIds: [companyA.businessUnitId] })
      const ids = rows.map((row) => row.userId)
      assert.include(ids, sameCompany.user.userId)
      assert.include(ids, sharedAccount.user.userId)
      assert.notInclude(ids, otherCompany.user.userId)
      assert.notInclude(ids, brokenPivot.user.userId)
    } finally {
      await cleanup(
        [sameCompany, otherCompany, brokenPivot, sharedAccount],
        [roleA, roleB, deletedOnPivot, shared],
        [companyA, companyB]
      )
    }
  })

  test('CH5 no salen los estados terminales, ni dueño, ni plataforma, ni la empresa inactiva', async ({
    assert,
  }) => {
    const company = await unit('terminal')
    const marked = await role('talento', company.businessUnitId)
    await markHumanCapital(marked.roleId)
    const ok = await user(marked.roleId, 'ok')
    await pivot(company.businessUnitId, ok.user.userId, marked.roleId)

    const removedPivot = await user(marked.roleId, 'pivote-baja')
    const pivotId = await pivot(company.businessUnitId, removedPivot.user.userId, marked.roleId)
    await db
      .from('business_unit_users')
      .where('business_unit_user_id', pivotId)
      .update({ business_unit_user_deleted_at: new Date() })

    const inactiveUser = await user(marked.roleId, 'inactivo')
    await pivot(company.businessUnitId, inactiveUser.user.userId, marked.roleId)
    await db.from('users').where('user_id', inactiveUser.user.userId).update({ user_active: 0 })

    const deletedUser = await user(marked.roleId, 'borrado')
    await pivot(company.businessUnitId, deletedUser.user.userId, marked.roleId)
    await db.from('users').where('user_id', deletedUser.user.userId).update({ user_deleted_at: new Date() })

    const inactiveRole = await role('rol-off', company.businessUnitId)
    await markHumanCapital(inactiveRole.roleId)
    const inactiveRoleUser = await user(inactiveRole.roleId, 'rol-off')
    await pivot(company.businessUnitId, inactiveRoleUser.user.userId, inactiveRole.roleId)
    await db.from('roles').where('role_id', inactiveRole.roleId).update({ role_active: 0 })

    const goneRole = await role('rol-baja', company.businessUnitId)
    await markHumanCapital(goneRole.roleId)
    const goneRoleUser = await user(goneRole.roleId, 'rol-baja')
    await pivot(company.businessUnitId, goneRoleUser.user.userId, goneRole.roleId)
    await db.from('roles').where('role_id', goneRole.roleId).update({ role_deleted_at: new Date() })

    const blankEmail = await user(marked.roleId, 'sin-correo')
    await pivot(company.businessUnitId, blankEmail.user.userId, marked.roleId)
    await db.from('users').where('user_id', blankEmail.user.userId).update({ user_email: '   ' })

    const ownerRole = await role('owner', company.businessUnitId)
    await markHumanCapital(ownerRole.roleId)
    const owner = await user(ownerRole.roleId, 'owner')
    await pivot(company.businessUnitId, owner.user.userId, ownerRole.roleId)

    const rootRole = await role('root', company.businessUnitId)
    await markHumanCapital(rootRole.roleId)
    const root = await user(rootRole.roleId, 'root')
    await pivot(company.businessUnitId, root.user.userId, rootRole.roleId)

    const inactiveCompany = await unit('apagada')
    const inactiveCompanyRole = await role('talento-off', inactiveCompany.businessUnitId)
    await markHumanCapital(inactiveCompanyRole.roleId)
    const inactiveCompanyUser = await user(inactiveCompanyRole.roleId, 'empresa-off')
    await pivot(inactiveCompany.businessUnitId, inactiveCompanyUser.user.userId, inactiveCompanyRole.roleId)
    await db
      .from('business_units')
      .where('business_unit_id', inactiveCompany.businessUnitId)
      .update({ business_unit_active: 0 })

    try {
      const rows = await fetchTenantHumanCapitalUsers({
        businessUnitIds: [company.businessUnitId, inactiveCompany.businessUnitId],
      })
      const ids = rows.map((row) => row.userId)
      assert.include(ids, ok.user.userId)
      for (const excluded of [
        removedPivot,
        inactiveUser,
        deletedUser,
        inactiveRoleUser,
        goneRoleUser,
        blankEmail,
        owner,
        root,
        inactiveCompanyUser,
      ]) {
        assert.notInclude(ids, excluded.user.userId)
      }
    } finally {
      await cleanup(
        [ok, removedPivot, inactiveUser, deletedUser, inactiveRoleUser, goneRoleUser, blankEmail, owner, root, inactiveCompanyUser],
        [marked, inactiveRole, goneRole, ownerRole, rootRole, inactiveCompanyRole],
        [company, inactiveCompany]
      )
    }
  })

  test('CH6 empresas vacías o inválidas no consultan, y las repetidas no duplican filas', async ({
    assert,
  }) => {
    const trx = {
      from() {
        throw new Error('no debía consultar')
      },
    } as unknown as TransactionClientContract

    assert.deepEqual(await fetchTenantHumanCapitalUsers({ businessUnitIds: [] }, trx), [])
    assert.deepEqual(await fetchTenantHumanCapitalUsers({ businessUnitIds: [0, -3, Number.NaN, 1.5] }, trx), [])

    const company = await unit('repetida')
    const talento = await role('talento', company.businessUnitId)
    await markHumanCapital(talento.roleId)
    const account = await user(talento.roleId, 'una-vez')
    await pivot(company.businessUnitId, account.user.userId, talento.roleId)

    try {
      const rows = await fetchTenantHumanCapitalUsers({
        businessUnitIds: [company.businessUnitId, company.businessUnitId, 0],
      })
      const own = rows.filter((row) => row.userId === account.user.userId)
      assert.lengthOf(own, 1)
      assert.equal(own[0]?.businessUnitId, company.businessUnitId)
    } finally {
      await cleanup([account], [talento], [company])
    }
  })
})

async function markHumanCapital(roleId: number): Promise<void> {
  await db.from('roles').where('role_id', roleId).update({ role_human_capital: 1 })
}

async function unit(label: string): Promise<BusinessUnit> {
  const token = stamp()
  return BusinessUnit.create({
    businessUnitName: `Aviso ${label} ${token}`,
    businessUnitSlug: `aviso-${label}-${token}`.toLowerCase(),
    businessUnitLegalName: `Aviso ${label} ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function role(slug: string, businessUnitId: number | null): Promise<Role> {
  return Role.create({
    roleName: `Rol ${slug} ${stamp()}`,
    roleSlug: slug,
    roleDescription: 'Rol del aviso de faltas',
    roleActive: 1,
    businessUnitId,
  })
}

async function user(roleId: number, label: string): Promise<{ user: User; person: Person }> {
  const token = stamp()
  const person = await Person.create({
    personFirstname: 'Aviso',
    personLastname: label,
    personSecondLastname: token,
    personEmail: `aviso-${label}-${token}@test.local`,
  })
  const created = await User.create({
    userEmail: `aviso-${label}-${token}@test.local`,
    userPassword: 'AvisoFaltasPrueba123!',
    userActive: 1,
    roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  return { user: created, person }
}

async function pivot(businessUnitId: number, userId: number, roleId: number | null): Promise<number> {
  const now = new Date()
  const [id] = await db.table('business_unit_users').insert({
    business_unit_id: businessUnitId,
    user_id: userId,
    role_id: roleId,
    business_unit_user_created_at: now,
    business_unit_user_updated_at: now,
  })
  return Number(id)
}

async function grant(roleId: number, systemPermissionId: number): Promise<number> {
  const now = new Date()
  const [id] = await db.table('role_system_permissions').insert({
    role_id: roleId,
    system_permission_id: systemPermissionId,
    role_system_permission_created_at: now,
    role_system_permission_updated_at: now,
  })
  return Number(id)
}

async function cleanup(
  users: Array<{ user: User; person: Person }>,
  roles: Role[],
  units: BusinessUnit[]
): Promise<void> {
  const userIds = users.map((row) => row.user.userId)
  if (userIds.length > 0) {
    await db.from('business_unit_users').whereIn('user_id', userIds).delete()
    await db.from('users').whereIn('user_id', userIds).delete()
    await db.from('people').whereIn('person_id', users.map((row) => row.person.personId)).delete()
  }
  for (const item of roles) {
    await db.from('role_system_permissions').where('role_id', item.roleId).delete()
    await db.from('roles').where('role_id', item.roleId).delete()
  }
  for (const item of units) {
    await db.from('business_units').where('business_unit_id', item.businessUnitId).delete()
  }
}
