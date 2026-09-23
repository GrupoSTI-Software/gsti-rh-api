import { test } from '@japa/runner'
import Role from '#models/role'
import {
  isRoleInBusinessScope,
  resolveActiveBusinessUnitId,
  type RoleBusinessScope,
} from '#helpers/role_business_scope'

/**
 * Decisión "¿este rol es de la empresa activa?" en memoria. Es la gemela de
 * `applyRoleBusinessScope` (la versión SQL) y las dos tienen que responder lo
 * mismo: la de aquí resuelve los 404 por id, la de allá el listado.
 *
 * La regla quedó en una sola: manda la empresa dueña. Antes había tres —dueña,
 * slug de sistema global y CSV— porque un rol podía no tener dueño; con el
 * modelo de roles por empresa, un rol sin dueño no es de nadie.
 *
 * No toca la base: los roles se arman en memoria a propósito, para que el caso
 * describa la regla y no el estado de la BD de pruebas.
 */

const SCOPE: RoleBusinessScope = {
  businessUnitIds: [7],
}

function buildRole(values: { roleSlug: string; businessUnitId: number | null }): Role {
  const role = new Role()
  role.roleId = 1
  role.roleName = 'Rol de prueba'
  role.roleSlug = values.roleSlug
  role.businessUnitId = values.businessUnitId
  return role
}

test.group('isRoleInBusinessScope — alcance de roles por empresa', () => {
  test('un rol con la empresa activa como dueña está en alcance', ({ assert }) => {
    const role = buildRole({ roleSlug: 'recursos-humanos', businessUnitId: 7 })
    assert.isTrue(isRoleInBusinessScope(role, SCOPE))
  })

  test('un rol de otra empresa queda fuera', ({ assert }) => {
    const role = buildRole({ roleSlug: 'recursos-humanos', businessUnitId: 99 })
    assert.isFalse(isRoleInBusinessScope(role, SCOPE))
  })

  test('el owner de otra empresa NO se alcanza por compartir slug', ({ assert }) => {
    // El caso que justifica el rediseño: cada empresa tiene su propio `owner`,
    // y el slug dejó de ser salvoconducto para llegar al rol de otro cliente.
    const ownerAjeno = buildRole({ roleSlug: 'owner', businessUnitId: 99 })
    assert.isFalse(isRoleInBusinessScope(ownerAjeno, SCOPE))
  })

  test('un rol sin empresa dueña no es de ningún tenant', ({ assert }) => {
    // `root` vive así: es de la plataforma y se resuelve por su salvoconducto,
    // nunca por alcance de empresa.
    assert.isFalse(isRoleInBusinessScope(buildRole({ roleSlug: 'root', businessUnitId: null }), SCOPE))
    assert.isFalse(
      isRoleInBusinessScope(buildRole({ roleSlug: 'rol-huerfano', businessUnitId: null }), SCOPE)
    )
  })

  test('un alcance vacío no alcanza ningún rol', ({ assert }) => {
    const vacio: RoleBusinessScope = { businessUnitIds: [] }

    assert.isFalse(
      isRoleInBusinessScope(buildRole({ roleSlug: 'recursos-humanos', businessUnitId: 7 }), vacio)
    )
    assert.isFalse(isRoleInBusinessScope(buildRole({ roleSlug: 'owner', businessUnitId: null }), vacio))
  })
})

test.group('resolveActiveBusinessUnitId — empresa activa de la petición', () => {
  test('devuelve la única empresa del alcance', ({ assert }) => {
    assert.equal(resolveActiveBusinessUnitId([7]), 7)
  })

  test('sin alcance o con más de una empresa no elige: devuelve null', ({ assert }) => {
    assert.isNull(resolveActiveBusinessUnitId([]))
    assert.isNull(resolveActiveBusinessUnitId([7, 8]))
  })
})
