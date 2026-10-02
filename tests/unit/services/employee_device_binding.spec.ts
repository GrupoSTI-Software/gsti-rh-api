import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import EmployeeDevice from '#models/employee_device'
import EmployeeDeviceService from '#services/employee_device_service'
import { createTenantActor, cleanupTenantActor, type TenantActor } from '#tests/helpers/tenant_actor'
import {
  createEmployeeFixture,
  cleanupEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'

/**
 * Tests — EmployeeDeviceService.bindToEmployee.
 *
 * Un celular pertenece al último colaborador que inició sesión en él. Si era de
 * otro, pasa al nuevo y el registro anterior queda dado de baja con su token
 * original como prefijo: ese historial es el rastro que RH consulta para
 * detectar celulares que rotan entre personas.
 */

const service = () => new EmployeeDeviceService(i18nManager.locale(i18nManager.defaultLocale))

const deviceInput = (
  token: string,
  fixture: EmployeeFixture,
  businessUnitId: number = fixture.businessUnitId
) => ({
  employeeDeviceToken: token,
  employeeDeviceModel: 'Modelo',
  employeeDeviceBrand: 'Marca',
  employeeDeviceType: 'phone',
  employeeDeviceOs: 'ios',
  employeeId: fixture.employee.employeeId,
  businessUnitId,
})

/**
 * Pasa al colaborador a la empresa de otro fixture. Solo cambia la empresa del
 * registro: el fixture conserva la suya para que la limpieza borre su propio
 * organigrama.
 */
async function moveToBusinessUnitOf(fixture: EmployeeFixture, target: EmployeeFixture) {
  await db
    .from('employees')
    .where('employee_id', fixture.employee.employeeId)
    .update({ business_unit_id: target.businessUnitId })
}

const uniqueToken = () => `spec-device-${Date.now()}-${Math.floor(Math.random() * 100_000)}`

test.group('EmployeeDeviceService.bindToEmployee', (group) => {
  // Cada colaborador nace en su propia empresa; los casos de la misma empresa lo mudan.
  let ownerActor: TenantActor | null = null
  let otherActor: TenantActor | null = null
  let owner: EmployeeFixture | null = null
  let other: EmployeeFixture | null = null

  group.each.setup(async () => {
    ownerActor = await createTenantActor('device-owner')
    otherActor = await createTenantActor('device-other')
    owner = await createEmployeeFixture(ownerActor.businessUnit.businessUnitId, 'device-owner')
    other = await createEmployeeFixture(otherActor.businessUnit.businessUnitId, 'device-other')
  })

  group.each.teardown(async () => {
    const ids = [owner?.employee.employeeId, other?.employee.employeeId].filter(
      (id): id is number => typeof id === 'number'
    )
    if (ids.length > 0) await db.from('employee_devices').whereIn('employee_id', ids).delete()
    await cleanupEmployeeFixture(owner)
    await cleanupEmployeeFixture(other)
    await cleanupTenantActor(ownerActor)
    await cleanupTenantActor(otherActor)
    owner = null
    other = null
    ownerActor = null
    otherActor = null
  })

  test('un celular nuevo queda a nombre de quien inicia sesión', async ({ assert }) => {
    const token = uniqueToken()
    const result = await service().bindToEmployee(deviceInput(token, owner!))

    assert.equal(result.status, 'bound')
    const device = await EmployeeDevice.query().where('employee_device_token', token).firstOrFail()
    assert.equal(device.employeeId, owner!.employee.employeeId)
  })

  test('el mismo colaborador en su propio celular no crea otro registro', async ({ assert }) => {
    const token = uniqueToken()
    await service().bindToEmployee(deviceInput(token, owner!))
    const result = await service().bindToEmployee(deviceInput(token, owner!))

    assert.equal(result.status, 'bound')
    const rows = await db
      .from('employee_devices')
      .where('employee_id', owner!.employee.employeeId)
      .count('* as total')
    assert.equal(Number(rows[0].total), 1)
  })

  test('un celular ajeno se transfiere y deja rastro del dueño anterior', async ({ assert }) => {
    await moveToBusinessUnitOf(other!, owner!)
    const token = uniqueToken()
    await service().bindToEmployee(deviceInput(token, owner!))
    const result = await service().bindToEmployee(
      deviceInput(token, other!, owner!.businessUnitId)
    )

    assert.equal(result.status, 'transferred')
    if (result.status !== 'transferred') return
    assert.equal(result.previousEmployeeId, owner!.employee.employeeId)
    assert.isTrue(result.previousOwnerUsedItLast)

    const current = await EmployeeDevice.query().where('employee_device_token', token).firstOrFail()
    assert.equal(current.employeeId, other!.employee.employeeId)

    const trail = await db
      .from('employee_devices')
      .where('employee_id', owner!.employee.employeeId)
      .whereNotNull('employee_device_deleted_at')
      .where('employee_device_token', 'like', `${token}---deleted--%`)
      .first()
    assert.exists(trail)
  })

  test('si el dueño anterior ya usa otro celular, su sesión no se considera en ese equipo', async ({
    assert,
  }) => {
    await moveToBusinessUnitOf(other!, owner!)
    const shared = uniqueToken()
    await service().bindToEmployee(deviceInput(shared, owner!))
    // Llega después a su celular nuevo: ese es ahora su equipo más reciente.
    await new Promise((resolve) => setTimeout(resolve, 1100))
    await service().bindToEmployee(deviceInput(uniqueToken(), owner!))

    const result = await service().bindToEmployee(
      deviceInput(shared, other!, owner!.businessUnitId)
    )

    assert.equal(result.status, 'transferred')
    if (result.status !== 'transferred') return
    assert.isFalse(result.previousOwnerUsedItLast)
  })

  test('un celular de otra empresa se registra aparte y no toca al otro tenant', async ({
    assert,
  }) => {
    const token = uniqueToken()
    await service().bindToEmployee(deviceInput(token, owner!))

    const result = await service().bindToEmployee(deviceInput(token, other!))

    assert.equal(result.status, 'bound')
    const rows = await db
      .from('employee_devices')
      .where('employee_device_token', token)
      .whereNull('employee_device_deleted_at')
      .orderBy('employee_id')
    assert.deepEqual(
      rows.map((row) => row.employee_id).sort(),
      [owner!.employee.employeeId, other!.employee.employeeId].sort()
    )
  })

  test('un celular desactivado para el mismo colaborador sigue bloqueado', async ({ assert }) => {
    const token = uniqueToken()
    await service().bindToEmployee(deviceInput(token, owner!))
    await db
      .from('employee_devices')
      .where('employee_device_token', token)
      .update({ employee_device_active: 0 })

    const result = await service().bindToEmployee(deviceInput(token, owner!))

    assert.equal(result.status, 'inactive')
  })
})
