import { test } from '@japa/runner'
import { resolveResponsibleUserId } from '#helpers/responsible_employee_scope'

/**
 * Tests unitarios — resolveResponsibleUserId.
 *
 * `root` y `owner` ven toda la plantilla de su empresa: sin candado de
 * colaboradores a cargo. Cualquier otro rol queda acotado a los colaboradores
 * que tiene a cargo (`user_responsible_employees`), como hasta ahora.
 */
test.group('resolveResponsibleUserId', () => {
  test('root no queda acotado a colaboradores a cargo', ({ assert }) => {
    assert.isNull(resolveResponsibleUserId({ userId: 1, role: { roleSlug: 'root' } }))
  })

  test('owner no queda acotado a colaboradores a cargo', ({ assert }) => {
    assert.isNull(resolveResponsibleUserId({ userId: 7, role: { roleSlug: 'owner' } }))
  })

  test('cualquier otro rol queda acotado a su propio usuario', ({ assert }) => {
    assert.equal(resolveResponsibleUserId({ userId: 9, role: { roleSlug: 'admin' } }), 9)
    assert.equal(resolveResponsibleUserId({ userId: 10, role: { roleSlug: 'empleado' } }), 10)
  })

  test('sin sesión no hay candado que aplicar', ({ assert }) => {
    assert.isNull(resolveResponsibleUserId(undefined))
  })
})
