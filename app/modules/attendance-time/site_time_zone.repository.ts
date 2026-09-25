import type { EmployeeSiteTimeZoneRow } from './attendance_time.interface.js'

/**
 * Contrato de lectura de zonas configuradas. Devuelve lo crudo (sucursal base
 * y empresa de cada colaborador); resolver la cadena es trabajo del servicio.
 */
export interface SiteTimeZoneRepository {
  /**
   * Zonas configuradas de la sucursal base activa y de la empresa de cada
   * colaborador. Un colaborador sin sucursal base viene con la de sucursal en
   * `null`; uno que no existe no viene.
   */
  findForEmployees(employeeIds: number[]): Promise<EmployeeSiteTimeZoneRow[]>

  /** Zona configurada de la empresa, o `null` si no existe. */
  findForBusinessUnit(businessUnitId: number): Promise<string | null>
}
