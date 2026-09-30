import { test } from '@japa/runner'
import {
  businessUnitHeaders,
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * personId faltante en alta y edición de usuarios (seguimiento de USRH1789698261611).
 * Antes respondía 500 crudo (".where expects value to be defined"); ahora 400 legible
 * con título, detalle, clave y código del formato del equipo.
 */
test.group('Alta y edición exigen expediente', (group) => {
  let actor: TenantActor | null = null

  group.setup(async () => {
    actor = await createTenantActor('personreq')
    await grantModulePermissions(actor, 'users', ['create', 'update'])
    return async () => cleanupTenantActor(actor)
  })

  test('alta-sin-persona', async ({ assert, client }) => {
    const a = actor!
    const response = await client
      .post('/api/users')
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({
        userEmail: `sin-persona-${Date.now()}@gsti-tests.local`,
        userActive: true,
        roleId: a.role.roleId,
        userEmailType: 'institutional',
      })
    assert.equal(response.status(), 400)
    assert.deepEqual(response.body(), {
      title: 'Falta el expediente de la cuenta',
      detail:
        'Indica a qué expediente pertenece la cuenta para poder guardarla. No se guardó ningún cambio.',
      key: 'persona-requerida',
      code: 'USR.VAL.001',
    })
  })

  test('edicion-sin-persona', async ({ assert, client }) => {
    const a = actor!
    const response = await client
      .put(`/api/users/${a.user.userId}`)
      .loginAs(a.user)
      .headers(businessUnitHeaders(a))
      .json({
        userEmail: a.user.userEmail,
        userActive: true,
        roleId: a.role.roleId,
        userEmailType: 'institutional',
      })
    assert.equal(response.status(), 400)
    assert.deepEqual(response.body(), {
      title: 'Falta el expediente de la cuenta',
      detail:
        'Indica a qué expediente pertenece la cuenta para poder guardarla. No se guardó ningún cambio.',
      key: 'persona-requerida',
      code: 'USR.VAL.001',
    })
  })
})
