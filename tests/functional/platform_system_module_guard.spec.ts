import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import SystemModule from '#models/system_module'

/**
 * Tests funcionales — guard de `/api/platform/system-modules` (USRH1784573245783).
 *
 * Reponen la única comprobación de 403 que vivía en el spec del interruptor de
 * exigencia de permisos, retirado porque esa bandera la gobierna la constante
 * de módulos. Table-driven con conteo, igual que el guard de alianzas: si se
 * agrega una ruta al archivo y no a esta tabla, el spec falla por conteo y
 * obliga a cubrir su guard.
 */

const TEST_PASSWORD = 'SystemModuleGuardTest123!'
const ROUTES_FILE = 'start/routes/platform_system_module_routes.ts'

type SystemModuleHttpMethod = 'get' | 'put'

interface SystemModuleAreaRoute {
  method: SystemModuleHttpMethod
  /** Recibe un id real de módulo para que un guard roto no escriba sobre un id inventado. */
  buildPath: (systemModuleId: number) => string
  label: string
}

const SYSTEM_MODULE_AREA_ROUTES: SystemModuleAreaRoute[] = [
  {
    method: 'get',
    buildPath: () => '/api/platform/system-modules',
    label: 'GET /api/platform/system-modules',
  },
  {
    method: 'put',
    buildPath: (systemModuleId) => `/api/platform/system-modules/${systemModuleId}/active`,
    label: 'PUT /api/platform/system-modules/:systemModuleId/active',
  },
]

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'root').firstOrFail()

  const person = await Person.create({
    personFirstname: 'SystemModule',
    personLastname: 'Guard',
    personSecondLastname: emailPrefix,
    personEmail: email,
  })
  const user = await User.create({
    userEmail: email,
    userPassword: TEST_PASSWORD,
    userActive: 1,
    isPlatformAdmin,
    roleId: role.roleId,
    personId: person.personId,
    userEmailType: 'institutional',
  })
  const businessUnit = await BusinessUnit.create({
    businessUnitName: `System Module Guard BU ${stamp}`,
    businessUnitSlug: `system-module-guard-bu-${stamp}`,
    businessUnitLegalName: `System Module Guard Legal ${stamp}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })

  await user.related('businessUnits').attach([businessUnit.businessUnitId])
  return { user, person, businessUnit }
}

async function cleanupActor(actor: TestActor | null) {
  if (!actor) return
  await actor.user.related('businessUnits').detach([actor.businessUnit.businessUnitId])
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
  await BusinessUnit.query().where('business_unit_id', actor.businessUnit.businessUnitId).delete()
}

/** Módulo real sobre el que se apuntan las rutas con id; `employees` existe en toda siembra. */
async function findEmployeesModule(): Promise<SystemModule> {
  return SystemModule.query()
    .whereNull('system_module_deleted_at')
    .where('system_module_slug', 'employees')
    .firstOrFail()
}

test.group('Guard /api/platform/system-modules — conteo del área', () => {
  test('las rutas del archivo coinciden en número con la tabla del guard', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), ROUTES_FILE), 'utf8')
    const declared = content.match(/router\.(get|post|patch|put|delete)\(/g) ?? []
    assert.equal(declared.length, SYSTEM_MODULE_AREA_ROUTES.length)
  })
})

test.group('Guard /api/platform/system-modules — 401 sin token', (group) => {
  let employeesModule: SystemModule

  group.setup(async () => {
    employeesModule = await findEmployeesModule()
  })

  for (const route of SYSTEM_MODULE_AREA_ROUTES) {
    test(`${route.label} sin token responde 401`, async ({ client }) => {
      const response = await client[route.method](route.buildPath(employeesModule.systemModuleId))
      response.assertStatus(401)
    })
  }
})

test.group('Guard /api/platform/system-modules — 403 sin platformAdmin', (group) => {
  let tenant: TestActor | null = null
  let employeesModule: SystemModule
  let previousActive: number

  group.setup(async () => {
    employeesModule = await findEmployeesModule()
    previousActive = employeesModule.systemModuleActive
    tenant = await createActor('system-module-guard-tenant', false)
  })

  group.teardown(async () => {
    await cleanupActor(tenant)
    // Solo repone si un guard roto alcanzó a escribir; así no pisa lo que dejó la siembra.
    if (employeesModule) {
      await employeesModule.refresh()
      if (employeesModule.systemModuleActive !== previousActive) {
        employeesModule.systemModuleActive = previousActive
        await employeesModule.save()
      }
    }
  })

  for (const route of SYSTEM_MODULE_AREA_ROUTES) {
    test(`${route.label} responde 403 sin datos del catálogo`, async ({ client, assert }) => {
      const request = client[route.method](route.buildPath(employeesModule.systemModuleId)).loginAs(
        tenant!.user
      )
      if (route.method === 'put') {
        // Pide el estado contrario al actual: si el guard falla, el cambio sería visible.
        request.json({ active: previousActive !== 1 })
      }

      const response = await request
      response.assertStatus(403)
      assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
      assert.isUndefined(response.body().code)
      assert.isUndefined(response.body().data)

      await employeesModule.refresh()
      assert.equal(employeesModule.systemModuleActive, previousActive)
    })
  }
})
