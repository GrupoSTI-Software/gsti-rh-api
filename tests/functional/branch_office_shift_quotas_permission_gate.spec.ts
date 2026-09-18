import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import BranchOffice from '#models/branch_office'
import Shift from '#models/shift'
import {
  assertModuleEnforced,
  assertPassesGate,
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
 * Cuotas de plantilla por sucursal y turno. Las dos rutas solo tenían `auth` y
 * `businessScope`: cualquier sesión del tenant leía y reescribía la plantilla
 * requerida de cualquier sucursal de su alcance.
 *
 *  - La ESCRITURA la gobierna `repse-registrations:gestion`, que es la casilla
 *    con la que el backoffice muestra el editor de cuotas (`canManage`).
 *  - La LECTURA la consumen dos pantallas de módulos distintos: la misma de
 *    REPSE y el formulario de préstamo temporal del colaborador, que es
 *    Empleados. La acepta cualquiera de los dos, resuelto en el controller.
 */

const REPSE_MODULE = 'repse-registrations'
const EMPLOYEES_MODULE = 'employees'

async function createBranch(actor: TenantActor, prefix: string): Promise<BranchOffice> {
  const name = uniqueTestName(prefix)
  return BranchOffice.create({
    businessUnitId: actor.businessUnit.businessUnitId,
    branchOfficeName: name,
    branchOfficeSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  })
}

async function createShift(actor: TenantActor, prefix: string): Promise<Shift> {
  return Shift.create({
    shiftName: uniqueTestName(prefix),
    shiftCalculateFlag: '',
    shiftDayStart: 1,
    shiftTimeStart: '08:00',
    shiftActiveHours: 8,
    shiftRestDays: '0',
    shiftAccumulatedFault: 1,
    businessUnitId: actor.businessUnit.businessUnitId,
    shiftTemp: 0,
  })
}

const quotasUrl = (branch: BranchOffice) =>
  `/api/branch-offices/${branch.branchOfficeId}/shift-quotas`

function readQuotas(client: ApiClient, actor: TenantActor, branch: BranchOffice) {
  return client.get(quotasUrl(branch)).loginAs(actor.user).headers(businessUnitHeaders(actor))
}

function replaceQuotas(
  client: ApiClient,
  actor: TenantActor,
  branch: BranchOffice,
  shift: Shift,
  required_: number
) {
  return client
    .put(quotasUrl(branch))
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
    .json({ quotas: [{ shiftId: shift.shiftId, required: required_, minimum: 1 }] })
}

function assertDenied(assert: Assert, response: ApiResponse, label: string): void {
  assert.equal(response.status(), 403, `${label}: ${JSON.stringify(response.body())}`)
  assertPermissionDenied(assert, response)
}

async function countQuotas(branch: BranchOffice): Promise<number> {
  const rows = await db
    .from('branch_office_shift_quotas')
    .where('branch_office_id', branch.branchOfficeId)
    .count('* as total')
  return Number(rows[0].total)
}

test.group('Cuotas de plantilla — permissionGate de lectura y escritura', (group) => {
  let actor: TenantActor | null = null
  let owner: TenantActor | null = null
  let branch: BranchOffice | null = null
  let shift: Shift | null = null

  group.setup(async () => {
    await assertModuleEnforced(REPSE_MODULE)
    await assertModuleEnforced(EMPLOYEES_MODULE)
    actor = await createTenantActor('cuotas-gate')
    owner = await createBypassActor('owner', 'cuotas-gate-owner')
    branch = await createBranch(actor, 'Cuotas sucursal')
    shift = await createShift(actor, 'Cuotas turno')
  })

  group.teardown(async () => {
    if (branch) {
      await db.from('branch_office_shift_quotas').where('branch_office_id', branch.branchOfficeId).delete()
      await db.from('branch_offices').where('branch_office_id', branch.branchOfficeId).delete()
    }
    if (shift) {
      await db.from('shifts').where('shift_id', shift.shiftId).delete()
    }
    await cleanupTenantActor(actor)
    await cleanupTenantActor(owner)
  })

  test('sin concesiones: leer y reescribir las cuotas responden PERM.DENIED', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const sucursal = required(branch, 'la sucursal')
    const turno = required(shift, 'el turno')
    await grantModulePermissions(tenant, REPSE_MODULE, [])

    assertDenied(assert, await readQuotas(client, tenant, sucursal), 'leer cuotas')
    assertDenied(assert, await replaceQuotas(client, tenant, sucursal, turno, 3), 'guardar cuotas')
    assert.equal(await countQuotas(sucursal), 0, 'no debe guardar nada')
  })

  test('repse read abre la lectura pero no la escritura', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const sucursal = required(branch, 'la sucursal')
    const turno = required(shift, 'el turno')
    await grantModulePermissions(tenant, REPSE_MODULE, ['read'])

    assertPassesGate(assert, await readQuotas(client, tenant, sucursal))
    assertDenied(assert, await replaceQuotas(client, tenant, sucursal, turno, 3), 'guardar cuotas')
    assert.equal(await countQuotas(sucursal), 0, 'no debe guardar nada')
  })

  test('repse update tampoco abre la escritura: el editor lo muestra gestion', async ({
    client,
    assert,
  }) => {
    const tenant = required(actor, 'el actor')
    const sucursal = required(branch, 'la sucursal')
    const turno = required(shift, 'el turno')
    await grantModulePermissions(tenant, REPSE_MODULE, ['update'])

    assertDenied(assert, await replaceQuotas(client, tenant, sucursal, turno, 3), 'guardar cuotas')
    assert.equal(await countQuotas(sucursal), 0, 'no debe guardar nada')
  })

  test('repse gestion abre las dos y la cuota queda guardada', async ({ client, assert }) => {
    const tenant = required(actor, 'el actor')
    const sucursal = required(branch, 'la sucursal')
    const turno = required(shift, 'el turno')
    await grantModulePermissions(tenant, REPSE_MODULE, ['gestion'])

    assertPassesGate(assert, await readQuotas(client, tenant, sucursal))

    const saved = await replaceQuotas(client, tenant, sucursal, turno, 4)
    assertPassesGate(assert, saved)
    assert.notEqual(saved.status(), 403, JSON.stringify(saved.body()))
    assert.equal(await countQuotas(sucursal), 1, 'la cuota debe quedar guardada')
  })

  test('tab-trabajo-write abre la lectura (préstamo temporal) y no la escritura', async ({
    client,
    assert,
  }) => {
    // Es el segundo consumidor de la lectura y vive en otro módulo: si la ruta
    // se hubiera cerrado con REPSE, el préstamo temporal se habría quedado sin
    // turnos que proponer.
    const tenant = required(actor, 'el actor')
    const sucursal = required(branch, 'la sucursal')
    const turno = required(shift, 'el turno')
    await grantModulePermissions(tenant, EMPLOYEES_MODULE, ['tab-trabajo-write'])

    assertPassesGate(assert, await readQuotas(client, tenant, sucursal))
    assertDenied(assert, await replaceQuotas(client, tenant, sucursal, turno, 3), 'guardar cuotas')
  })

  test('owner cruza las dos sin concesiones (bypass)', async ({ client, assert }) => {
    const account = required(owner, 'el owner')
    const sucursal = required(branch, 'la sucursal')
    const turno = required(shift, 'el turno')

    assertPassesGate(assert, await readQuotas(client, account, sucursal))
    assertPassesGate(assert, await replaceQuotas(client, account, sucursal, turno, 2))
  })
})
