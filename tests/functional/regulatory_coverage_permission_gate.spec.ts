import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import ApiToken from '#models/api_token'
import Person from '#models/person'
import Regulation from '#models/regulation'
import Role from '#models/role'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import User from '#models/user'
import {
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Cobertura regulatoria detrás del guard de plataforma: las tres lecturas de
 * cobertura y las cinco del marco regulatorio (autoridades, normas, numerales
 * y features) viven bajo `/api/platform` y solo las abre un token de consola
 * (`origin = 'platform'`) de un usuario con `isPlatformAdmin`.
 *
 * El guard (`auth` + `platformAdmin`) responde:
 *  - 401 sin token.
 *  - 403 `AUTH.PLATFORM.FORBIDDEN` a todo lo que no sea consola de plataforma:
 *    dueños de tenant, roles `root` y `super-administrador` con token de
 *    backoffice, y un `isPlatformAdmin` con token web. Ese 403 no trae `code`
 *    ni `data`.
 *  - 403 también cuando se le revoca `isPlatformAdmin` a un token de consola
 *    ya emitido: el guard relee al usuario en cada petición.
 *
 * Una concesión `regulatory-coverage:read` guardada en un rol de tenant ya no
 * abre nada: estas rutas no consultan permisos de módulo.
 *
 * Las ocho URLs viejas bajo `/api/v1` se retiraron y responden 404.
 *
 * El catálogo regulatorio es global (sin empresa): los actores no mandan
 * cabecera de unidad de negocio y los datos vienen de la siembra (0028-0033).
 */

const TEST_PASSWORD = 'RegulatoryCoveragePlatform123!'
const MODULE = 'regulatory-coverage'
const REGULATION_CODE = 'NOM-035-STPS'

const COVERAGE_ROUTE = '/api/platform/regulatory-coverage'
const REGULATION_ROUTE = `/api/platform/regulations/${REGULATION_CODE}`

interface ApiCall {
  label: string
  url: string
}

interface PlatformActor {
  user: User
  person: Person
  email: string
}

/** Las ocho lecturas de plataforma, con parámetros que existen en la siembra. */
async function platformCalls(): Promise<ApiCall[]> {
  const regulation = await Regulation.query()
    .where('regulation_code', REGULATION_CODE)
    .firstOrFail()

  return [
    { label: 'lista de cobertura', url: '/api/platform/regulatory-coverage' },
    { label: 'resumen ejecutivo', url: '/api/platform/regulatory-coverage/summary' },
    {
      label: 'detalle de cobertura por norma',
      url: `/api/platform/regulatory-coverage/${regulation.regulationId}`,
    },
    { label: 'lista de autoridades', url: '/api/platform/regulatory-authorities' },
    { label: 'detalle de autoridad', url: '/api/platform/regulatory-authorities/stps' },
    {
      label: 'norma con árbol de numerales',
      url: `/api/platform/regulations/${REGULATION_CODE}`,
    },
    { label: 'numeral', url: `/api/platform/regulations/${REGULATION_CODE}/clauses/5.8.a` },
    {
      label: 'features del numeral',
      url: `/api/platform/regulations/${REGULATION_CODE}/clauses/5.8.a/features`,
    },
  ]
}

/** Las mismas ocho lecturas en su ubicación vieja, ya retirada. */
async function legacyCalls(): Promise<ApiCall[]> {
  const regulation = await Regulation.query()
    .where('regulation_code', REGULATION_CODE)
    .firstOrFail()

  return [
    { label: 'lista de cobertura', url: '/api/v1/regulatory-coverage' },
    { label: 'resumen ejecutivo', url: '/api/v1/regulatory-coverage/summary' },
    {
      label: 'detalle de cobertura por norma',
      url: `/api/v1/regulatory-coverage/${regulation.regulationId}`,
    },
    { label: 'lista de autoridades', url: '/api/v1/regulatory-authorities' },
    { label: 'detalle de autoridad', url: '/api/v1/regulatory-authorities/stps' },
    { label: 'norma con árbol de numerales', url: `/api/v1/regulations/${REGULATION_CODE}` },
    { label: 'numeral', url: `/api/v1/regulations/${REGULATION_CODE}/clauses/5.8.a` },
    {
      label: 'features del numeral',
      url: `/api/v1/regulations/${REGULATION_CODE}/clauses/5.8.a/features`,
    },
  ]
}

/** El 403 del guard de plataforma: cuerpo exacto, sin `code` ni `data`. */
function assertPlatformForbidden(assert: Assert, response: ApiResponse): void {
  assert.equal(response.status(), 403)
  assert.deepEqual(response.body(), {
    title: 'Acceso restringido a plataforma',
    detail: 'Esta sección es exclusiva de administradores de plataforma.',
    key: 'AUTH.PLATFORM.FORBIDDEN',
  })
  assert.notProperty(response.body(), 'code')
  assert.notProperty(response.body(), 'data')
}

/**
 * Siembra la concesión `regulatory-coverage:read` directo sobre el rol. El
 * módulo está retirado (soft-deleted) y su entrada del catálogo ya no declara
 * permisos, así que en una BD migrada y sembrada desde cero la fila `read` no
 * existe. Se busca con `withTrashed` y, si falta, se crea colgada de la fila del
 * módulo retirado: es exactamente el estado "permiso guardado sin efecto" que
 * el spec prueba. Devuelve el permiso solo si lo creó aquí, para que el spec lo
 * retire al terminar y no deje la fila en la BD.
 */
async function grantOrphanedCoverageRead(role: Role): Promise<SystemPermission | null> {
  const systemModule = await SystemModule.query()
    .withTrashed()
    .where('system_module_slug', MODULE)
    .firstOrFail()

  let createdPermission: SystemPermission | null = null
  let permission = await SystemPermission.query()
    .withTrashed()
    .where('system_module_id', systemModule.systemModuleId)
    .where('system_permission_slug', 'read')
    .first()
  if (!permission) {
    permission = await SystemPermission.create({
      systemModuleId: systemModule.systemModuleId,
      systemPermissionSlug: 'read',
      systemPermissionName: 'Acceder a cobertura regulatoria',
    })
    createdPermission = permission
  }

  const existing = await RoleSystemPermission.query()
    .withTrashed()
    .where('role_id', role.roleId)
    .where('system_permission_id', permission.systemPermissionId)
    .first()
  if (!existing) {
    await RoleSystemPermission.create({
      roleId: role.roleId,
      systemPermissionId: permission.systemPermissionId,
    })
  }

  return createdPermission
}

async function createPlatformAdmin(emailPrefix: string): Promise<PlatformActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

  const person = await Person.create({
    personFirstname: 'CoberturaPlataforma',
    personLastname: 'Guard',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })

  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin: true,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })

  return { user, person, email }
}

async function cleanupActor(actor: PlatformActor | null): Promise<void> {
  if (!actor) return
  await ApiToken.query().where('tokenable_id', actor.user.userId).delete()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function loginPlatformConsole(client: ApiClient, email: string): Promise<string> {
  const response = await client.post('/api/platform/auth/login').json({
    userEmail: email,
    userPassword: TEST_PASSWORD,
  })
  response.assertStatus(200)
  const token = response.body().data?.token
  if (typeof token !== 'string' || token === '') {
    throw new Error('Login de plataforma no devolvió token')
  }
  return token
}

test.group('Cobertura regulatoria — guard de plataforma', (group) => {
  let owner: TenantActor | null = null
  let root: TenantActor | null = null
  let superAdmin: TenantActor | null = null
  let tenant: TenantActor | null = null
  let webPlatformAdmin: PlatformActor | null = null
  let consoleAdmin: PlatformActor | null = null
  let createdOrphanPermission: SystemPermission | null = null

  group.setup(async () => {
    owner = await createBypassActor('owner', 'cobertura-owner')
    root = await createBypassActor('root', 'cobertura-root')
    superAdmin = await createBypassActor('super-administrador', 'cobertura-superadmin')
    webPlatformAdmin = await createPlatformAdmin('cobertura-web-admin')
  })

  group.teardown(async () => {
    await cleanupTenantActor(owner)
    await cleanupTenantActor(root)
    await cleanupTenantActor(superAdmin)
    await cleanupActor(webPlatformAdmin)
    // Los roles (y con ellos sus concesiones) ya salieron: la fila creada por el spec puede irse.
    if (createdOrphanPermission) await createdOrphanPermission.forceDelete()
    createdOrphanPermission = null
  })

  group.each.teardown(async () => {
    await cleanupTenantActor(tenant)
    tenant = null
    await cleanupActor(consoleAdmin)
    consoleAdmin = null
  })

  test('T1: sin token las ocho responden 401', async ({ client, assert }) => {
    for (const call of await platformCalls()) {
      const response = await client.get(call.url)
      assert.equal(response.status(), 401, call.label)
    }
  })

  test('T2: un actor de tenant recibe 403 de plataforma, aun con la concesión guardada', async ({
    client,
    assert,
  }) => {
    const account = required(owner, 'el owner')
    for (const call of await platformCalls()) {
      const response = await client.get(call.url).loginAs(account.user)
      assert.equal(response.status(), 403, `owner — ${call.label}`)
      assertPlatformForbidden(assert, response)
    }

    tenant = await createTenantActor('cobertura-gate')
    createdOrphanPermission =
      (await grantOrphanedCoverageRead(tenant.role)) ?? createdOrphanPermission
    for (const call of await platformCalls()) {
      const response = await client.get(call.url).loginAs(tenant.user)
      assert.equal(response.status(), 403, `concesión guardada — ${call.label}`)
      assertPlatformForbidden(assert, response)
    }
  })

  test('T3: root y super-administrador con token de backoffice reciben 403 de plataforma', async ({
    client,
    assert,
  }) => {
    const accounts = [
      { label: 'root', actor: required(root, 'el root') },
      { label: 'super-administrador', actor: required(superAdmin, 'el super-administrador') },
    ]

    for (const { label, actor } of accounts) {
      for (const url of [COVERAGE_ROUTE, REGULATION_ROUTE]) {
        const response = await client.get(url).loginAs(actor.user)
        assert.equal(response.status(), 403, `${label} — ${url}`)
        assertPlatformForbidden(assert, response)
      }
    }
  })

  test('T4: un isPlatformAdmin con token web recibe 403 de plataforma', async ({
    client,
    assert,
  }) => {
    const admin = required(webPlatformAdmin, 'el admin de plataforma')

    for (const url of [COVERAGE_ROUTE, REGULATION_ROUTE]) {
      const response = await client.get(url).loginAs(admin.user)
      assert.equal(response.status(), 403, url)
      assertPlatformForbidden(assert, response)
    }
  })

  test('T6: al revocar isPlatformAdmin, el token de consola ya emitido recibe 403', async ({
    client,
    assert,
  }) => {
    consoleAdmin = await createPlatformAdmin('cobertura-console-admin')
    const token = await loginPlatformConsole(client, consoleAdmin.email)

    const before = await client.get(COVERAGE_ROUTE).bearerToken(token)
    assert.equal(before.status(), 200, JSON.stringify(before.body()))

    consoleAdmin.user.isPlatformAdmin = false
    await consoleAdmin.user.save()

    const after = await client.get(COVERAGE_ROUTE).bearerToken(token)
    assertPlatformForbidden(assert, after)
  })

  test('T7: las ocho URLs viejas bajo /api/v1 responden 404', async ({ client, assert }) => {
    const account = required(owner, 'el owner')

    for (const call of await legacyCalls()) {
      const anonymous = await client.get(call.url)
      assert.equal(anonymous.status(), 404, `sin token — ${call.label}`)

      const authenticated = await client.get(call.url).loginAs(account.user)
      assert.equal(authenticated.status(), 404, `con owner — ${call.label}`)
    }
  })
})
