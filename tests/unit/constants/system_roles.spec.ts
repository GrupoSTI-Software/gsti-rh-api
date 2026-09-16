import { test } from '@japa/runner'
import RoleService from '#services/role_service'
import {
  RESERVED_ROLE_IDENTITY_SLUGS,
  SYSTEM_ROLE_SLUGS,
  isReservedRoleIdentitySlug,
  isSystemRoleSlug,
} from '#constants/system_roles'

/**
 * Contrato de las dos listas de roles de `system_roles.ts`: la de visibilidad
 * global (`SYSTEM_ROLE_SLUGS`) y la de slugs de identidad que un rol del
 * tenant no puede tomar (`RESERVED_ROLE_IDENTITY_SLUGS`).
 *
 * El caso que motiva la segunda lista: el slug de un rol sale de su nombre y el
 * runtime decide por slug. Un rol llamado "Super Administrador" nacía con el
 * slug `super-administrador` y con él el salvoconducto `expanded`.
 */
test.group('system_roles — slugs de identidad reservados', () => {
  test('reserva exactamente root, owner, super-administrador y empleado', ({ assert }) => {
    assert.sameMembers(
      [...RESERVED_ROLE_IDENTITY_SLUGS],
      ['root', 'owner', 'super-administrador', 'empleado']
    )
  })

  test('la lista de visibilidad global sigue siendo owner y empleado', ({ assert }) => {
    // Si root o super-administrador entraran aquí, los listados los mostrarían
    // y los harían asignables en todas las empresas.
    assert.sameMembers([...SYSTEM_ROLE_SLUGS], ['owner', 'empleado'])
    assert.isFalse(isSystemRoleSlug('root'))
    assert.isFalse(isSystemRoleSlug('super-administrador'))
  })

  test('los nombres que derivan un slug reservado quedan bloqueados', ({ assert }) => {
    const roleService = new RoleService()
    const reservedNames = [
      'Super Administrador',
      'SUPER   administrador',
      ' super-administrador ',
      'Root',
      'Owner',
      'Empleado',
    ]

    for (const name of reservedNames) {
      const slug = roleService.generateSlug(name)
      assert.isTrue(isReservedRoleIdentitySlug(slug), `"${name}" -> "${slug}" debe estar reservado`)
    }
  })

  test('los slugs que solo cambian visibilidad en el BO no se reservan (decisión pendiente)', ({
    assert,
  }) => {
    const roleService = new RoleService()

    for (const name of ['RH Manager', 'Recursos Humanos', 'Admin', 'Nominas']) {
      const slug = roleService.generateSlug(name)
      assert.isFalse(isReservedRoleIdentitySlug(slug), `"${name}" -> "${slug}" no debe reservarse`)
    }
    assert.isFalse(isReservedRoleIdentitySlug(null))
    assert.isFalse(isReservedRoleIdentitySlug(''))
  })
})
