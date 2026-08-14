import { test } from '@japa/runner'
import {
  buildPermissionGateIdentity,
  hasPermissionGateBypass,
} from '#helpers/permission_gate_identity'
import type Role from '#models/role'

function fakeRole(slug: string, roleId = 1): Role {
  return { roleId, roleSlug: slug } as Role
}

test.group('permission_gate_identity (USRH1785766406723)', () => {
  test('buildPermissionGateIdentity marca root/owner/super-administrador', ({ assert }) => {
    const root = buildPermissionGateIdentity(fakeRole('root', 10))
    assert.isTrue(root.isPlatformAccount)
    assert.isFalse(root.isCompanyOwnerAccount)
    assert.isFalse(root.isDireccionGeneralAccount)

    const owner = buildPermissionGateIdentity(fakeRole('owner', 20))
    assert.isFalse(owner.isPlatformAccount)
    assert.isTrue(owner.isCompanyOwnerAccount)

    const dg = buildPermissionGateIdentity(fakeRole('super-administrador', 30))
    assert.isTrue(dg.isDireccionGeneralAccount)

    const plain = buildPermissionGateIdentity(fakeRole('recursos-humanos', 40))
    assert.isFalse(plain.isPlatformAccount)
    assert.isFalse(plain.isCompanyOwnerAccount)
    assert.isFalse(plain.isDireccionGeneralAccount)
  })

  test('hasPermissionGateBypass respeta los cuatro perfiles', ({ assert }) => {
    const root = buildPermissionGateIdentity(fakeRole('root'))
    const owner = buildPermissionGateIdentity(fakeRole('owner'))
    const dg = buildPermissionGateIdentity(fakeRole('super-administrador'))
    const plain = buildPermissionGateIdentity(fakeRole('rh'))

    assert.isTrue(hasPermissionGateBypass(root, 'standard'))
    assert.isTrue(hasPermissionGateBypass(owner, 'standard'))
    assert.isFalse(hasPermissionGateBypass(dg, 'standard'))
    assert.isFalse(hasPermissionGateBypass(plain, 'standard'))

    assert.isTrue(hasPermissionGateBypass(dg, 'expanded'))
    assert.isTrue(hasPermissionGateBypass(root, 'platformReserved'))
    assert.isFalse(hasPermissionGateBypass(owner, 'platformReserved'))
    assert.isFalse(hasPermissionGateBypass(root, 'strict'))
  })
})
