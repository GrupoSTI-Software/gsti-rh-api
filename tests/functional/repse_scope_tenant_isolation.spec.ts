import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import RepseRegistration from '#models/repse_registration'
import {
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * USRH1783691644909 — el módulo REPSE resuelve su alcance con el scope central
 * (la unidad seleccionada en el header), no con `SYSTEM_BUSINESS`.
 *
 * Las dos empresas y sus usuarios los crea este spec. Antes apuntaba a datos de
 * una máquina de desarrollo —los ids públicos de "sae" y "cima", el correo de
 * `betosimon@sae.com.mx` y el de un root concreto— y sobre una BD recién
 * sembrada la empresa 6 no existe: el `insert` del setup moría por llave
 * foránea y japa marcaba el grupo entero como "Setup hook" fallido. Los cinco
 * casos llevaban tiempo sin ejercitar una sola línea de aislamiento sin que el
 * conteo de la suite lo delatara, porque un grupo que no arranca no reporta
 * tests fallidos: reporta cero tests.
 *
 * Los dos sentidos se prueban con actores distintos a propósito:
 *  - el de la empresa A tiene un rol propio con `repse-registrations:read` y
 *    nada más, que es el caso real de un usuario de cliente;
 *  - el `root` no prueba RBAC (lo saltea), prueba la regla 4: aun con acceso
 *    total, ve solo la empresa que trae seleccionada en el header.
 */

const MODULE_SLUG = 'repse-registrations'

let empresaA: TenantActor | null = null
let empresaB: TenantActor | null = null
let root: TenantActor | null = null
let registroA: RepseRegistration | null = null
let registroB: RepseRegistration | null = null

function folioUnico(prefijo: string): string {
  return `TEST-${prefijo}-${Date.now()}-${Math.floor(Math.random() * 100_000)}`
}

async function crearRegistro(businessUnitId: number, prefijo: string): Promise<RepseRegistration> {
  const registro = new RepseRegistration()
  registro.businessUnitId = businessUnitId
  registro.folio = folioUnico(prefijo)
  registro.registeredAt = DateTime.now()
  registro.expiresAt = DateTime.now().plus({ years: 1 })
  registro.status = 'active'
  await registro.save()
  return registro
}

function headerDe(actor: TenantActor): string {
  return actor.businessUnit.businessUnitPublicId
}

test.group('REPSE — registros con scope central (BD real)', (group) => {
  group.setup(async () => {
    empresaA = await createTenantActor('repse-scope-a')
    empresaB = await createTenantActor('repse-scope-b')
    root = await createBypassActor('root', 'repse-scope-root')

    // El usuario de la empresa A solo puede leer registros REPSE: el resto del
    // módulo le queda cerrado, para que un 200 aquí signifique "su empresa" y
    // no "tiene de todo".
    await grantModulePermissions(empresaA, MODULE_SLUG, ['read'])

    registroA = await crearRegistro(empresaA.businessUnit.businessUnitId, 'A')
    registroB = await crearRegistro(empresaB.businessUnit.businessUnitId, 'B')
  })

  group.teardown(async () => {
    // Los registros primero: cuelgan de la empresa por llave foránea y
    // `cleanupTenantActor` borra la empresa.
    const ids = [registroA?.repseRegistrationId, registroB?.repseRegistrationId].filter(
      (id): id is number => typeof id === 'number'
    )
    if (ids.length > 0) {
      await RepseRegistration.query().whereIn('repse_registration_id', ids).delete()
    }
    registroA = null
    registroB = null

    await cleanupTenantActor(empresaA)
    await cleanupTenantActor(empresaB)
    await cleanupTenantActor(root)
    empresaA = null
    empresaB = null
    root = null
  })

  test('un usuario ve el registro REPSE de su propia empresa', async ({ client, assert }) => {
    const response = await client
      .get(`/api/repse-registrations/${registroA!.repseRegistrationId}`)
      .loginAs(empresaA!.user)
      .header('X-Business-Unit-Id', headerDe(empresaA!))

    response.assertStatus(200)
    assert.equal(
      response.body().data.repseRegistration.repseRegistrationId,
      registroA!.repseRegistrationId
    )
  })

  test('un usuario recibe 404 uniforme al pedir el registro REPSE de otra empresa', async ({
    client,
  }) => {
    const response = await client
      .get(`/api/repse-registrations/${registroB!.repseRegistrationId}`)
      .loginAs(empresaA!.user)
      .header('X-Business-Unit-Id', headerDe(empresaA!))

    response.assertStatus(404)
    response.assertBodyContains({ key: 'repse-no-encontrado' })
  })

  test('root con la empresa B seleccionada ve el registro de B (acceso total vía selección)', async ({
    client,
    assert,
  }) => {
    const response = await client
      .get(`/api/repse-registrations/${registroB!.repseRegistrationId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', headerDe(empresaB!))

    response.assertStatus(200)
    assert.equal(
      response.body().data.repseRegistration.repseRegistrationId,
      registroB!.repseRegistrationId
    )
  })

  test('root con la empresa B seleccionada recibe 404 al pedir el registro de A', async ({
    client,
  }) => {
    const response = await client
      .get(`/api/repse-registrations/${registroA!.repseRegistrationId}`)
      .loginAs(root!.user)
      .header('X-Business-Unit-Id', headerDe(empresaB!))

    response.assertStatus(404)
    response.assertBodyContains({ key: 'repse-no-encontrado' })
  })

  test('sin SYSTEM_BUSINESS: el helper resuelve del TenantContext, no de la env', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'app/helpers/repse_tenant_scope.ts'), 'utf-8')
    assert.notInclude(content, 'SYSTEM_BUSINESS')
    assert.include(content, 'TenantContext.getScope()')
  })
})
