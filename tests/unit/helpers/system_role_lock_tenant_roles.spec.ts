import { test } from '@japa/runner'
import {
  isLockedIdentityRename,
  isUndeletableTenantRole,
  isUnmanagedTenantRole,
} from '#helpers/system_role_lock'

test.group('Bloqueo de los roles sembrados del tenant', () => {
  test('el dueño y el empleado no se administran desde Roles y permisos', ({ assert }) => {
    assert.isTrue(isUnmanagedTenantRole({ roleSlug: 'owner' }))
    assert.isTrue(isUnmanagedTenantRole({ roleSlug: 'empleado' }))
  })

  test('el administrador sí se administra: sus permisos son revocables', ({ assert }) => {
    assert.isFalse(isUnmanagedTenantRole({ roleSlug: 'admin' }))
  })

  test('un rol propio de la empresa no queda alcanzado por la regla', ({ assert }) => {
    assert.isFalse(isUnmanagedTenantRole({ roleSlug: 'supervisor-de-sucursal' }))
    assert.isFalse(isUndeletableTenantRole({ roleSlug: 'supervisor-de-sucursal' }))
  })

  test('ninguno de los tres roles sembrados se elimina', ({ assert }) => {
    assert.isTrue(isUndeletableTenantRole({ roleSlug: 'owner' }))
    assert.isTrue(isUndeletableTenantRole({ roleSlug: 'admin' }))
    assert.isTrue(isUndeletableTenantRole({ roleSlug: 'empleado' }))
  })

  test('renombrar al administrador queda bloqueado', ({ assert }) => {
    assert.isTrue(
      isLockedIdentityRename({ roleSlug: 'admin', roleName: 'Administrador' }, 'Capital Humano')
    )
  })

  test('guardar al administrador con su mismo nombre no es un renombrado', ({ assert }) => {
    assert.isFalse(
      isLockedIdentityRename({ roleSlug: 'admin', roleName: 'Administrador' }, 'Administrador')
    )
    // Los espacios de sobra no cuentan como cambio: el formulario los manda tal cual.
    assert.isFalse(
      isLockedIdentityRename({ roleSlug: 'admin', roleName: 'Administrador' }, '  Administrador  ')
    )
  })

  test('una petición sin nombre no dispara el bloqueo: la valida el validador', ({ assert }) => {
    assert.isFalse(isLockedIdentityRename({ roleSlug: 'admin', roleName: 'Administrador' }, null))
    assert.isFalse(
      isLockedIdentityRename({ roleSlug: 'admin', roleName: 'Administrador' }, undefined)
    )
  })

  test('renombrar un rol propio de la empresa sigue permitido', ({ assert }) => {
    assert.isFalse(isLockedIdentityRename({ roleSlug: 'auditor', roleName: 'Auditor' }, 'Revisor'))
  })
})
