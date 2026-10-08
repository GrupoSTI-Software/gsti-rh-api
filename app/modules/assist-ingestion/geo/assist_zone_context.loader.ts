import logger from '@adonisjs/core/services/logger'
import EmployeeZone from '#models/employee_zone'
import SystemSettingService from '#services/system_setting_service'
import { SYSTEM_SETTING_ZONE_TOLERANCE_METERS_DEFAULT } from '#constants/system_setting_defaults'
import { TenantContext } from '#utils/tenant_context'
import { parseZoneGeometries } from '#utils/zone_geometry_parser'
import type { ZoneGeometry } from '#utils/zone_geometry_parser'
import type { AssistZoneContext } from './assist_zone_decision.js'

/** Zonas de un empleado ya interpretadas. */
interface EmployeeZones {
  assignmentCount: number
  geometries: ZoneGeometry[]
}

/**
 * Caché de UNA llamada a `ingest`.
 *
 * Un lote de 200 checadas de un mismo kiosco no consulta 200 veces el margen de
 * su empresa. Vive solo lo que dura la entrega: las instancias del servicio en
 * ADMS y pines sin mapear viven mucho y una caché de instancia quedaría vieja
 * tras un cambio de zona o de margen.
 */
export interface AssistZoneContextCache {
  zonesByEmployee: Map<string, EmployeeZones>
  toleranceByBusinessUnit: Map<number, number>
}

/**
 * Lee lo que la comprobación de zona necesita, aislado por la empresa del
 * registro (VLRH-H1790812613754, reglas 5, 7 y 8).
 *
 * La empresa sale siempre del registro ya resuelto, nunca del contexto de la
 * petición: corre bajo `TenantContext.run([empresa])` y además filtra por
 * `business_unit_id` de forma explícita, así que una zona sin empresa o de otra
 * empresa nunca aporta geometría, con o sin contexto de petición.
 */
export class AssistZoneContextLoader {
  private readonly systemSettings: SystemSettingService

  constructor(systemSettings: SystemSettingService = new SystemSettingService()) {
    this.systemSettings = systemSettings
  }

  createCache(): AssistZoneContextCache {
    return { zonesByEmployee: new Map(), toleranceByBusinessUnit: new Map() }
  }

  async load(
    employeeId: number,
    businessUnitId: number,
    cache: AssistZoneContextCache
  ): Promise<AssistZoneContext> {
    const zones = await this.zonesOf(employeeId, businessUnitId, cache)
    const toleranceMeters = await this.toleranceOf(businessUnitId, cache)
    return { ...zones, toleranceMeters }
  }

  private async zonesOf(
    employeeId: number,
    businessUnitId: number,
    cache: AssistZoneContextCache
  ): Promise<EmployeeZones> {
    const key = `${businessUnitId}:${employeeId}`
    const cached = cache.zonesByEmployee.get(key)
    if (cached) return cached

    const assignments = await TenantContext.run([businessUnitId], async () =>
      EmployeeZone.query()
        .where('employee_id', employeeId)
        .where('business_unit_id', businessUnitId)
        .whereNull('employee_zone_deleted_at')
        .preload('zone', (zoneQuery) =>
          zoneQuery.where('business_unit_id', businessUnitId).whereNull('zone_deleted_at')
        )
    )

    const geometries: ZoneGeometry[] = []
    for (const assignment of assignments) {
      // Sin empresa, de otra empresa o borrada: la zona no precarga. La asignación
      // cuenta, pero no aporta geometría.
      if (!assignment.zone) continue
      const parsed = parseZoneGeometries(assignment.zone.zonePolygon)
      if (parsed.length === 0) {
        logger.warn(
          { zoneId: assignment.zone.zoneId, businessUnitId },
          'AssistZoneContextLoader: la zona no tiene una figura interpretable.'
        )
      }
      geometries.push(...parsed)
    }

    const zones = { assignmentCount: assignments.length, geometries }
    cache.zonesByEmployee.set(key, zones)
    return zones
  }

  /**
   * Margen de la empresa. Si su configuración no se puede leer se aplica el
   * valor base del producto: rechazar todas las checadas de una empresa por un
   * problema de configuración sería peor que tolerar 50 m.
   */
  private async toleranceOf(businessUnitId: number, cache: AssistZoneContextCache): Promise<number> {
    const cached = cache.toleranceByBusinessUnit.get(businessUnitId)
    if (cached !== undefined) return cached

    let toleranceMeters: number
    try {
      const setting = await TenantContext.run([businessUnitId], () =>
        this.systemSettings.resolveByBusinessUnitId(businessUnitId)
      )
      toleranceMeters = setting.systemSettingZoneToleranceMeters
    } catch (error: unknown) {
      logger.warn(
        { businessUnitId, error: error instanceof Error ? error.constructor.name : typeof error },
        'AssistZoneContextLoader: margen de zona no disponible; se aplica el valor base.'
      )
      toleranceMeters = SYSTEM_SETTING_ZONE_TOLERANCE_METERS_DEFAULT
    }

    cache.toleranceByBusinessUnit.set(businessUnitId, toleranceMeters)
    return toleranceMeters
  }
}
