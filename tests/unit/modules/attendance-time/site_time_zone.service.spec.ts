import { test } from '@japa/runner'
import SiteTimeZoneService from '#modules/attendance-time/site_time_zone.service'
import type { EmployeeSiteTimeZoneRow } from '#modules/attendance-time/attendance_time.interface'
import type { SiteTimeZoneRepository } from '#modules/attendance-time/site_time_zone.repository'

/** Repositorio en memoria: el servicio solo resuelve la cadena, no consulta. */
function repositoryWith(
  rows: EmployeeSiteTimeZoneRow[],
  businessUnits: Record<number, string | null> = {}
): SiteTimeZoneRepository {
  return {
    async findForEmployees(employeeIds) {
      return rows.filter((row) => employeeIds.includes(row.employeeId))
    },
    async findForBusinessUnit(businessUnitId) {
      return businessUnits[businessUnitId] ?? null
    },
  }
}

test.group('attendance-time — zona del sitio por colaborador', () => {
  test('la sucursal gana sobre la empresa y la empresa sobre el sistema', async ({ assert }) => {
    const service = new SiteTimeZoneService(
      repositoryWith([
        { employeeId: 1, branchOfficeTimezone: 'America/Ciudad_Juarez', businessUnitTimezone: 'America/Mexico_City' },
        { employeeId: 2, branchOfficeTimezone: null, businessUnitTimezone: 'America/Tijuana' },
        { employeeId: 3, branchOfficeTimezone: null, businessUnitTimezone: null },
      ])
    )
    const zones = await service.forEmployees([1, 2, 3])
    assert.deepEqual(zones.get(1), { zone: 'America/Ciudad_Juarez', source: 'branch_office', fellBack: false })
    assert.deepEqual(zones.get(2), { zone: 'America/Tijuana', source: 'business_unit', fellBack: false })
    assert.equal(zones.get(3)?.source, 'system')
  })

  test('una sucursal con zona inválida cae a la empresa y lo marca', async ({ assert }) => {
    const service = new SiteTimeZoneService(
      repositoryWith([
        { employeeId: 7, branchOfficeTimezone: 'America/Noexiste', businessUnitTimezone: 'America/Mexico_City' },
      ])
    )
    assert.deepEqual(await service.forEmployee(7), {
      zone: 'America/Mexico_City',
      source: 'business_unit',
      fellBack: true,
    })
  })

  test('un colaborador que no existe se resuelve a la zona del sistema sin fallar', async ({ assert }) => {
    const service = new SiteTimeZoneService(repositoryWith([]))
    const zones = await service.forEmployees([99])
    assert.equal(zones.get(99)?.source, 'system')
    assert.isFalse(zones.get(99)?.fellBack)
  })

  test('la zona de la empresa sirve para checadas sin colaborador resuelto', async ({ assert }) => {
    const service = new SiteTimeZoneService(repositoryWith([], { 4: 'America/Hermosillo' }))
    const configured = await service.forBusinessUnit(4)
    const missing = await service.forBusinessUnit(null)
    assert.equal(configured.zone, 'America/Hermosillo')
    assert.equal(missing.source, 'system')
  })
})
