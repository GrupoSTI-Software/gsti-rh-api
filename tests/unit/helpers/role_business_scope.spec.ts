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
 * No toca la base: los roles se arman en memoria a propósito, para que el caso
 * describa la regla y no el estado de la BD de pruebas.
 */

const SCOPE: RoleBusinessScope = {
  businessUnitIds: [7],
  businessUnitSlugs: ['empresa-activa'],
}

function buildRole(values: {
  roleSlug: string
  businessUnitId: number | null
  roleBusinessAccess?: string
}): Role {
  const role = new Role()
  role.roleId = 1
  role.roleName = 'Rol de prueba'
  role.roleSlug = values.roleSlug
  role.businessUnitId = values.businessUnitId
  role.roleBusinessAccess = values.roleBusinessAccess ?? ''
  return role
}

test.group('isRoleInBusinessScope — alcance de roles por empresa', () => {
  test('un rol con la empresa activa como dueña está en alcance', ({ assert }) => {
    const role = buildRole({ roleSlug: 'recursos-humanos', businessUnitId: 7 })
    assert.isTrue(isRoleInBusinessScope(role, SCOPE))
  })

  test('un rol de otra empresa queda fuera aunque su CSV nombre a la activa', ({ assert }) => {
    // `business_unit_id` manda: el CSV es compatibilidad, no una segunda llave.
    const role = buildRole({
      roleSlug: 'recursos-humanos',
      businessUnitId: 99,
      roleBusinessAccess: 'empresa-activa',
    })
    assert.isFalse(isRoleInBusinessScope(role, SCOPE))
  })

  test('los roles de sistema globales están en alcance de cualquier empresa', ({ assert }) => {
    assert.isTrue(isRoleInBusinessScope(buildRole({ roleSlug: 'owner', businessUnitId: null }), SCOPE))
    assert.isTrue(
      isRoleInBusinessScope(buildRole({ roleSlug: 'empleado', businessUnitId: null }), SCOPE)
    )
  })

  test('root no es rol de sistema visible: queda fuera del alcance de un tenant', ({ assert }) => {
    assert.isFalse(isRoleInBusinessScope(buildRole({ roleSlug: 'root', businessUnitId: null }), SCOPE))
  })

  test('compatibilidad temporal: sin dueño, el CSV decide', ({ assert }) => {
    const propio = buildRole({
      roleSlug: 'rh-manager',
      businessUnitId: null,
      roleBusinessAccess: 'otra-empresa,empresa-activa',
    })
    const ajeno = buildRole({
      roleSlug: 'rh-manager',
      businessUnitId: null,
      roleBusinessAccess: 'otra-empresa',
    })

    assert.isTrue(isRoleInBusinessScope(propio, SCOPE))
    assert.isFalse(isRoleInBusinessScope(ajeno, SCOPE))
  })

  test('sin dueño, sin slug de sistema y sin CSV no es de nadie', ({ assert }) => {
    const huerfano = buildRole({ roleSlug: 'rol-huerfano', businessUnitId: null })
    assert.isFalse(isRoleInBusinessScope(huerfano, SCOPE))
  })

  test('un alcance vacío no alcanza roles de empresa, solo los de sistema', ({ assert }) => {
    const vacio: RoleBusinessScope = { businessUnitIds: [], businessUnitSlugs: [] }

    assert.isFalse(
      isRoleInBusinessScope(buildRole({ roleSlug: 'recursos-humanos', businessUnitId: 7 }), vacio)
    )
    assert.isTrue(isRoleInBusinessScope(buildRole({ roleSlug: 'owner', businessUnitId: null }), vacio))
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
