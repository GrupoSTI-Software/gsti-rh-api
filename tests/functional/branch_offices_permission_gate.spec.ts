import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BranchOffice from '#models/branch_office'
import {
  assertModuleEnforced,
  assertPermissionDenied,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  uniqueTestName,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Sucursales con la exigencia encendida: alta, detalle, edición y baja piden
 * su permiso de `branch-offices`; el listado queda abierto porque es catálogo
 * de Empleados, Monitor de asistencia, NOM-035 y REPSE.
 */

const MODULE = 'branch-offices'

async function createBranchOfficeFixture(actor: TenantActor, prefix: string): Promise<BranchOffice> {
  const name = uniqueTestName(prefix)
  return BranchOffice.create({
    businessUnitId: actor.businessUnit.businessUnitId,
    branchOfficeName: name,
    branchOfficeSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  })
}

const findAliveBranchOffice = (branchOfficeId: number) =>
  BranchOffice.query().where('branchOfficeId', branchOfficeId).first()

test.group('Sucursales — permissionGate con exigencia encendida', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
    actor = await createTenantActor('sucursales-gate')
    owner = await createBypassActor('owner', 'sucursales-owner')
  })

  group.teardown(async () => {
    for (const current of [actor, owner]) {
      if (current) {
        await db
          .from('branch_offices')
          .where('business_unit_id', current.businessUnit.businessUnitId)
          .delete()
      }
      await cleanupTenantActor(current)
    }
  })

  test('sin concesiones: alta, detalle, edición y baja responden PERM.DENIED y no tocan la sucursal', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])
    const branch = await createBranchOfficeFixture(tenant, 'Sucursal sin permiso')
    const deniedName = uniqueTestName('Alta negada')

    const store = await client
      .post('/api/branch-offices')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ businessUnitId: tenant.businessUnit.businessUnitId, branchOfficeName: deniedName })
    assertPermissionDenied(assert, store)
    assert.isNull(await BranchOffice.query().where('branchOfficeName', deniedName).first())

    const show = await client
      .get(`/api/branch-offices/${branch.branchOfficeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPermissionDenied(assert, show)

    const update = await client
      .put(`/api/branch-offices/${branch.branchOfficeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ branchOfficeName: uniqueTestName('Edición negada') })
    assertPermissionDenied(assert, update)

    const destroy = await client
      .delete(`/api/branch-offices/${branch.branchOfficeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPermissionDenied(assert, destroy)

    const after = await findAliveBranchOffice(branch.branchOfficeId)
    assert.equal(after?.branchOfficeName, branch.branchOfficeName)
  })

  test('sin concesiones: el listado sigue abierto porque lo consumen otras pantallas', async ({
    client,
  }) => {
    const tenant = required(actor, 'el actor')
    await grantModulePermissions(tenant, MODULE, [])

    const response = await client
      .get('/api/branch-offices')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))

    response.assertStatus(200)
  })

  test('cada permiso abre solo su operación: create 201, read 200, update 200, delete 200', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const name = uniqueTestName('Alta con permiso')

    await grantModulePermissions(tenant, MODULE, ['create'])
    const store = await client
      .post('/api/branch-offices')
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ businessUnitId: tenant.businessUnit.businessUnitId, branchOfficeName: name })
    store.assertStatus(201)
    const created = required(
      await BranchOffice.query().where('branchOfficeName', name).first(),
      'la sucursal creada'
    )
    const showWithCreateOnly = await client
      .get(`/api/branch-offices/${created.branchOfficeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPermissionDenied(assert, showWithCreateOnly)

    await grantModulePermissions(tenant, MODULE, ['read'])
    const show = await client
      .get(`/api/branch-offices/${created.branchOfficeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    show.assertStatus(200)
    const updateWithReadOnly = await client
      .put(`/api/branch-offices/${created.branchOfficeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ branchOfficeName: uniqueTestName('Edición solo lectura') })
    assertPermissionDenied(assert, updateWithReadOnly)

    await grantModulePermissions(tenant, MODULE, ['update'])
    const renamed = uniqueTestName('Edición con permiso')
    const update = await client
      .put(`/api/branch-offices/${created.branchOfficeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
      .json({ branchOfficeName: renamed })
    update.assertStatus(200)
    const updated = await findAliveBranchOffice(created.branchOfficeId)
    assert.equal(updated?.branchOfficeName, renamed)
    const destroyWithUpdateOnly = await client
      .delete(`/api/branch-offices/${created.branchOfficeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    assertPermissionDenied(assert, destroyWithUpdateOnly)

    await grantModulePermissions(tenant, MODULE, ['delete'])
    const destroy = await client
      .delete(`/api/branch-offices/${created.branchOfficeId}`)
      .loginAs(tenant.user)
      .headers(businessUnitHeaders(tenant))
    destroy.assertStatus(200)
    assert.isNull(await findAliveBranchOffice(created.branchOfficeId))
  })

  test('owner cruza el gate por el bypass standard sin concesiones', async ({ client }) => {
    const account = required(owner, 'el owner')

    const response = await client
      .post('/api/branch-offices')
      .loginAs(account.user)
      .headers(businessUnitHeaders(account))
      .json({
        businessUnitId: account.businessUnit.businessUnitId,
        branchOfficeName: uniqueTestName('Alta owner'),
      })

    response.assertStatus(201)
  })
})
