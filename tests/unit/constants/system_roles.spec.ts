import { test } from '@japa/runner'
import RoleService from '#services/role_service'
import {
  PLATFORM_ROLE_SLUG,
  RESERVED_ROLE_IDENTITY_SLUGS,
  isReservedRoleIdentitySlug,
} from '#constants/system_roles'

/**
 * Contrato de `system_roles.ts`: el slug del único rol global de la plataforma
 * y la lista de slugs de identidad que un rol del tenant no puede tomar.
 *
 * El caso que motiva la lista: el slug de un rol sale de su nombre y el runtime
 * decide por slug. Un rol llamado "Super Administrador" nacía con el slug
 * `super-administrador` y con él el salvoconducto `expanded`; uno llamado
 * "Admin" chocaría con el administrador que su empresa ya estrenó al nacer.
 *
 * La lista de visibilidad global (`SYSTEM_ROLE_SLUGS`) desapareció: no queda
 * ningún rol de tenant que se vea desde todas las empresas, que es justo el
 * cruce que el modelo de roles por empresa cierra.
 */
test.group('system_roles — slugs de identidad reservados', () => {
  test('reserva root, owner, admin, super-administrador y empleado', ({ assert }) => {
    assert.sameMembers(
      [...RESERVED_ROLE_IDENTITY_SLUGS],
      ['root', 'owner', 'admin', 'super-administrador', 'empleado']
    )
  })

  test('el rol global de la plataforma es root y nada más', ({ assert }) => {
    assert.equal(PLATFORM_ROLE_SLUG, 'root')
  })

  test('los nombres que derivan un slug reservado quedan bloqueados', ({ assert }) => {
    const roleService = new RoleService()
    const reservedNames = [
      'Super Administrador',
      'SUPER   administrador',
      ' super-administrador ',
      'Root',
      'Owner',
      'Admin',
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
    // `Admin` salió de esta lista: dejó de ser una decisión pendiente el día
    // que cada empresa estrena su propio `admin` al nacer, y el candado
    // (empresa, slug) rechazaría una segunda fila con ese slug.
    const roleService = new RoleService()

    for (const name of ['RH Manager', 'Recursos Humanos', 'Nominas']) {
      const slug = roleService.generateSlug(name)
      assert.isFalse(isReservedRoleIdentitySlug(slug), `"${name}" -> "${slug}" no debe reservarse`)
    }
    assert.isFalse(isReservedRoleIdentitySlug(null))
    assert.isFalse(isReservedRoleIdentitySlug(''))
  })
})
