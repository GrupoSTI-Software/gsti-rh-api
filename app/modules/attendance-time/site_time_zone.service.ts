import { resolveSiteTimeZone } from './attendance_clock.js'
import SiteTimeZoneRepositoryMysql from './site_time_zone.repository.mysql.js'
import type {
  EmployeeSiteTimeZoneMap,
  ResolvedSiteTimeZone,
} from './attendance_time.interface.js'
import type { SiteTimeZoneRepository } from './site_time_zone.repository.js'

/**
 * Zona horaria del sitio donde un colaborador trabaja su turno.
 *
 * Cadena de resolución: sucursal base activa, luego empresa, luego sistema.
 * El punto de acceso no entra aquí: su zona sirve para convertir la hora que
 * manda el equipo al ingresar la checada (canal ADMS), no para evaluar el
 * turno, que está definido en el sitio.
 *
 * La asistencia siempre se muestra y se clasifica en esta zona, sin importar
 * desde dónde la consulte el usuario.
 */
export default class SiteTimeZoneService {
  private repository: SiteTimeZoneRepository

  constructor(repository?: SiteTimeZoneRepository) {
    this.repository = repository ?? new SiteTimeZoneRepositoryMysql()
  }

  /** Zona por colaborador. Uno que no existe se resuelve a la del sistema. */
  async forEmployees(employeeIds: number[]): Promise<EmployeeSiteTimeZoneMap> {
    const rows = await this.repository.findForEmployees(employeeIds)
    const byEmployee: EmployeeSiteTimeZoneMap = new Map()
    for (const row of rows) {
      byEmployee.set(
        row.employeeId,
        resolveSiteTimeZone([
          { zone: row.branchOfficeTimezone, source: 'branch_office' },
          { zone: row.businessUnitTimezone, source: 'business_unit' },
        ])
      )
    }
    for (const employeeId of employeeIds) {
      if (!byEmployee.has(employeeId)) byEmployee.set(employeeId, resolveSiteTimeZone([]))
    }
    return byEmployee
  }

  async forEmployee(employeeId: number): Promise<ResolvedSiteTimeZone> {
    const zones = await this.forEmployees([employeeId])
    return zones.get(employeeId) ?? resolveSiteTimeZone([])
  }

  /** Zona de la empresa, para checadas que no tienen colaborador resuelto. */
  async forBusinessUnit(businessUnitId: number | null | undefined): Promise<ResolvedSiteTimeZone> {
    if (!businessUnitId) return resolveSiteTimeZone([])
    const zone = await this.repository.findForBusinessUnit(businessUnitId)
    return resolveSiteTimeZone([{ zone, source: 'business_unit' }])
  }
}
