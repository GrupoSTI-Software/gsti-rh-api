import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import RepseRegistration from '#models/repse_registration'

/**
 * USRH1783691644909 — verificación end-to-end contra BD real: el módulo
 * REPSE debe resolver su alcance con el scope central (unidad seleccionada),
 * no con SYSTEM_BUSINESS. La BD restablecida no tiene datos REPSE, así que
 * se crean fixtures mínimos en BU1 y BU6 para probar el aislamiento cruzado.
 */

const BU1_PUBLIC_ID = 'a76db057-2292-49a0-9f1b-911e328d93b0' // sae
const BU6_PUBLIC_ID = '8c3617a4-c942-4ba7-aee6-2ac32d4ab5ef' // cima

async function getUserByEmail(email: string): Promise<User> {
  return User.query().whereNull('user_deleted_at').where('user_email', email).firstOrFail()
}

test.group('REPSE — registros y empresas contratantes con scope central (BD real)', (group) => {
  let bu1RegistrationId: number
  let bu6RegistrationId: number

  group.setup(async () => {
    const bu1 = new RepseRegistration()
    bu1.businessUnitId = 1
    bu1.folio = `TEST-BU1-${Date.now()}`
    bu1.registeredAt = DateTime.now()
    bu1.expiresAt = DateTime.now().plus({ years: 1 })
    bu1.status = 'active'
    await bu1.save()
    bu1RegistrationId = bu1.repseRegistrationId

    const bu6 = new RepseRegistration()
    bu6.businessUnitId = 6
    bu6.folio = `TEST-BU6-${Date.now()}`
    bu6.registeredAt = DateTime.now()
    bu6.expiresAt = DateTime.now().plus({ years: 1 })
    bu6.status = 'active'
    await bu6.save()
    bu6RegistrationId = bu6.repseRegistrationId
  })

  group.teardown(async () => {
    if (bu1RegistrationId) {
      await RepseRegistration.query().where('repseRegistrationId', bu1RegistrationId).delete()
    }
    if (bu6RegistrationId) {
      await RepseRegistration.query().where('repseRegistrationId', bu6RegistrationId).delete()
    }
  })

  test('usuario BU1 ve su propio registro REPSE', async ({ client, assert }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/repse-registrations/${bu1RegistrationId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(200)
    assert.equal(response.body().data.repseRegistration.repseRegistrationId, bu1RegistrationId)
  })

  test('usuario BU1 recibe 404 uniforme al pedir el registro REPSE de BU6', async ({
    client,
  }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')

    const response = await client
      .get(`/api/repse-registrations/${bu6RegistrationId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'repse-no-encontrado' })
  })

  // jdsimon (rol "administrador") no tiene el permiso granular del módulo
  // compliance-repse en esta BD — un hallazgo de RBAC ajeno a esta HU. Se usa
  // un usuario root (bypass de RBAC + acceso total vía selección, regla 4)
  // para probar la dirección BU6 -> BU1, que además valida esa regla.
  test('root con BU6 seleccionada ve el registro REPSE de BU6 (acceso total vía selección)', async ({
    client,
    assert,
  }) => {
    const user = await getUserByEmail('wramirez@siler-mx.com')

    const response = await client
      .get(`/api/repse-registrations/${bu6RegistrationId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(200)
    assert.equal(response.body().data.repseRegistration.repseRegistrationId, bu6RegistrationId)
  })

  test('root con BU6 seleccionada recibe 404 uniforme al pedir el registro de BU1', async ({
    client,
  }) => {
    const user = await getUserByEmail('wramirez@siler-mx.com')

    const response = await client
      .get(`/api/repse-registrations/${bu1RegistrationId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'repse-no-encontrado' })
  })

  test('sin SYSTEM_BUSINESS: el helper resuelve del TenantContext, no de la env', ({
    assert,
  }) => {
    const content = readFileSync(
      join(process.cwd(), 'app/helpers/repse_tenant_scope.ts'),
      'utf-8'
    )
    assert.notInclude(content, 'SYSTEM_BUSINESS')
    assert.include(content, 'TenantContext.getScope()')
  })
})
