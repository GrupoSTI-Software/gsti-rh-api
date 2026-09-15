import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import User from '#models/user'
import Role from '#models/role'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import SystemModule from '#models/system_module'
import { SYSTEM_MODULES } from '#constants/system_modules_menu/system_modules.constant'

/**
 * Tests funcionales — guard y contenido de `/api/platform/system-modules`
 * (USRH1784573245783).
 *
 * El área quedó de solo lectura: la disponibilidad y la exigencia de permisos
 * las gobierna `system_modules.constant.ts` y 0062 las sobrescribe en cada
 * siembra, así que los interruptores HTTP se retiraron. Table-driven con conteo,
 * igual que el guard de alianzas: si se agrega una ruta al archivo y no a esta
 * tabla, el spec falla por conteo y obliga a cubrir su guard.
 *
 * El guard se prueba en los dos sentidos: rechaza sin token (401) y sin
 * marcador de plataforma (403), y deja pasar a un admin de plataforma (200)
 * por el grupo real de rutas. Sin el 200, un middleware de más en el grupo que
 * bloqueara a todos pasaría la suite en verde. Un grupo aparte fija que el
 * interruptor retirado no vuelva a escribir la disponibilidad.
 */

const TEST_PASSWORD = 'SystemModuleGuardTest123!'
const ROUTES_FILE = 'start/routes/platform_system_module_routes.ts'
const LIST_PATH = '/api/platform/system-modules'

type SystemModuleHttpMethod = 'get'

interface SystemModuleAreaRoute {
  method: SystemModuleHttpMethod
  path: string
  label: string
}

const SYSTEM_MODULE_AREA_ROUTES: SystemModuleAreaRoute[] = [
  {
    method: 'get',
    path: LIST_PATH,
    label: 'GET /api/platform/system-modules',
  },
]

/** Forma mínima de un módulo del listado que leen las aserciones. */
interface ListedSystemModule {
  systemModuleSlug: string
  systemModuleActive: number
  systemModuleGroup: { systemModuleGroupKey: string } | null
}

interface TestActor {
  user: User
  person: Person
  businessUnit: BusinessUnit
}

async function createActor(emailPrefix: string, isPlatformAdmin: boolean): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`
  const role = await Role.query()
    .whereNull('role_deleted_at')
    .where('role_slug', 'root')
    .firstOrFail()

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

/** Módulo real sobre el que se apunta el interruptor retirado; `employees` existe en toda siembra. */
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

test.group('Guard /api/platform/system-modules — 401 sin token', () => {
  for (const route of SYSTEM_MODULE_AREA_ROUTES) {
    test(`${route.label} sin token responde 401`, async ({ client }) => {
      const response = await client[route.method](route.path)
      response.assertStatus(401)
    })
  }
})

test.group('Guard /api/platform/system-modules — 403 sin platformAdmin', (group) => {
  let tenant: TestActor | null = null

  group.setup(async () => {
    tenant = await createActor('system-module-guard-tenant', false)
  })

  group.teardown(async () => {
    await cleanupActor(tenant)
  })

  for (const route of SYSTEM_MODULE_AREA_ROUTES) {
    test(`${route.label} responde 403 sin datos del catálogo`, async ({ client, assert }) => {
      const response = await client[route.method](route.path).loginAs(tenant!.user)

      response.assertStatus(403)
      assert.equal(response.body().key, 'AUTH.PLATFORM.FORBIDDEN')
      assert.isUndefined(response.body().code)
      assert.isUndefined(response.body().data)
    })
  }
})

test.group('Guard /api/platform/system-modules — 200 con platformAdmin', (group) => {
  let admin: TestActor | null = null

  group.setup(async () => {
    admin = await createActor('system-module-guard-admin', true)
  })

  group.teardown(async () => {
    await cleanupActor(admin)
  })

  for (const route of SYSTEM_MODULE_AREA_ROUTES) {
    test(`${route.label} pasa el guard con platformAdmin y responde 200`, async ({
      client,
      assert,
    }) => {
      const response = await client[route.method](route.path).loginAs(admin!.user)

      response.assertStatus(200)
      assert.equal(response.body().type, 'success')
    })
  }

  test('el listado trae todo módulo vivo de la constante con su grupo y su disponibilidad', async ({
    client,
    assert,
  }) => {
    const response = await client.get(LIST_PATH).loginAs(admin!.user)
    response.assertStatus(200)

    const listed = response.body().data.systemModules as ListedSystemModule[]
    const listedBySlug = new Map(
      listed.map((systemModule) => [systemModule.systemModuleSlug, systemModule])
    )

    // Se compara contra la constante y no contra un número fijo: agregar o dar
    // de baja un módulo ahí no debe romper este spec, pero perderlo del listado sí.
    for (const declared of SYSTEM_MODULES.filter(
      (systemModule) => !systemModule.systemModuleRetired
    )) {
      const row = listedBySlug.get(declared.systemModuleSlug)
      assert.exists(row, `falta ${declared.systemModuleSlug} en el listado`)
      assert.include([0, 1], row!.systemModuleActive)
      assert.equal(
        row!.systemModuleGroup?.systemModuleGroupKey ?? null,
        declared.systemModuleGroupKey,
        `grupo de ${declared.systemModuleSlug}`
      )
    }

    // Un módulo dado de baja en la constante no aparece en el listado.
    for (const retired of SYSTEM_MODULES.filter(
      (systemModule) => systemModule.systemModuleRetired
    )) {
      assert.isFalse(
        listedBySlug.has(retired.systemModuleSlug),
        `${retired.systemModuleSlug} dado de baja`
      )
    }
  })
})

test.group(
  'Interruptor retirado PUT /api/platform/system-modules/:systemModuleId/active',
  (group) => {
    let admin: TestActor | null = null
    let employeesModule: SystemModule
    let previousActive: number

    group.setup(async () => {
      employeesModule = await findEmployeesModule()
      previousActive = employeesModule.systemModuleActive
      admin = await createActor('system-module-guard-retired', true)
    })

    group.teardown(async () => {
      await cleanupActor(admin)
      // Solo repone si una ruta revivida alcanzó a escribir; así no pisa lo que dejó la siembra.
      if (employeesModule) {
        await employeesModule.refresh()
        if (employeesModule.systemModuleActive !== previousActive) {
          employeesModule.systemModuleActive = previousActive
          await employeesModule.save()
        }
      }
    })

    test('responde 404 aun con platformAdmin y no cambia la disponibilidad', async ({
      client,
      assert,
    }) => {
      // Pide el estado contrario al actual: si la ruta reviviera, el cambio sería visible.
      const response = await client
        .put(`${LIST_PATH}/${employeesModule.systemModuleId}/active`)
        .loginAs(admin!.user)
        .json({ active: previousActive !== 1 })

      response.assertStatus(404)

      await employeesModule.refresh()
      assert.equal(employeesModule.systemModuleActive, previousActive)
    })
  }
)
