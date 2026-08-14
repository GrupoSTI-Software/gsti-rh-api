import { test } from '@japa/runner'
import { decideSessionPermissionAction } from '#helpers/session_permission_decision'
import type { PermissionGateIdentity } from '#helpers/permission_gate_identity'

const plain: PermissionGateIdentity = {
  roleId: 1,
  isPlatformAccount: false,
  isCompanyOwnerAccount: false,
  isDireccionGeneralAccount: false,
}
const root: PermissionGateIdentity = {
  roleId: 2,
  isPlatformAccount: true,
  isCompanyOwnerAccount: false,
  isDireccionGeneralAccount: false,
}
const owner: PermissionGateIdentity = {
  roleId: 3,
  isPlatformAccount: false,
  isCompanyOwnerAccount: true,
  isDireccionGeneralAccount: false,
}

test.group('decideSessionPermissionAction (USRH1785766406723)', () => {
  test('módulo inactivo niega con module-inactive aunque haya grant o privilegio', ({ assert }) => {
    const d = decideSessionPermissionAction({
      identity: root,
      exceptionProfile: 'standard',
      moduleActive: false,
      isGranted: true,
    })
    assert.isFalse(d.allowed)
    assert.equal(d.reason, 'module-inactive')
  })

  test('rol no privilegiado con grant: assignment', ({ assert }) => {
    const d = decideSessionPermissionAction({
      identity: plain,
      exceptionProfile: 'standard',
      moduleActive: true,
      isGranted: true,
    })
    assert.isTrue(d.allowed)
    assert.equal(d.reason, 'assignment')
  })

  test('rol no privilegiado sin grant: missing-assignment', ({ assert }) => {
    const d = decideSessionPermissionAction({
      identity: plain,
      exceptionProfile: 'standard',
      moduleActive: true,
      isGranted: false,
    })
    assert.isFalse(d.allowed)
    assert.equal(d.reason, 'missing-assignment')
  })

  test('owner con standard sin grant: privileged-role', ({ assert }) => {
    const d = decideSessionPermissionAction({
      identity: owner,
      exceptionProfile: 'standard',
      moduleActive: true,
      isGranted: false,
    })
    assert.isTrue(d.allowed)
    assert.equal(d.reason, 'privileged-role')
  })

  test('root con strict sin grant: explicit-revocation', ({ assert }) => {
    const d = decideSessionPermissionAction({
      identity: root,
      exceptionProfile: 'strict',
      moduleActive: true,
      isGranted: false,
    })
    assert.isFalse(d.allowed)
    assert.equal(d.reason, 'explicit-revocation')
  })

  test('root con strict CON grant: assignment (el privilegio no aplica, pero la asignación sí)', ({
    assert,
  }) => {
    const d = decideSessionPermissionAction({
      identity: root,
      exceptionProfile: 'strict',
      moduleActive: true,
      isGranted: true,
    })
    assert.isTrue(d.allowed)
    assert.equal(d.reason, 'assignment')
  })

  test('owner con platformReserved sin grant: missing-assignment (no alcanza el perfil)', ({
    assert,
  }) => {
    const d = decideSessionPermissionAction({
      identity: owner,
      exceptionProfile: 'platformReserved',
      moduleActive: true,
      isGranted: false,
    })
    assert.isFalse(d.allowed)
    assert.equal(d.reason, 'missing-assignment')
  })
})
