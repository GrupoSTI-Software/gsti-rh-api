import Tolerance from '../models/tolerance.js'
import { isTenantScopeActive, scopedSystemSettingIds } from '#helpers/system_setting_tenant_scope'

/**
 * Tolerancias de asistencia de una empresa.
 *
 * `Tolerance` no compone el mixin de empresa y el `systemSettingId` llega del
 * cliente, así que cada consulta se acota con el candado compartido. La lectura
 * va además sin gate de permisos por decisión del equipo (la consume el Monitor
 * de asistencia), de modo que este corte es la única defensa del dominio.
 */
export default class ToleranceService {
  async index(systemSettingId: number): Promise<Tolerance[]> {
    const tolerances = await Tolerance.query()
      .where('system_setting_id', systemSettingId)
      .if(isTenantScopeActive(), (query) => {
        query.whereIn('system_setting_id', scopedSystemSettingIds())
      })
      .orderBy('system_setting_id')
    return tolerances
  }

  /**
   * Resuelve una tolerancia por su identificador dentro de la empresa activa.
   * Devuelve `null` cuando es de otra empresa, para que quien llama responda lo
   * mismo que ante una que no existe.
   */
  async findInScope(toleranceId: number) {
    const tolerance = await Tolerance.query()
      .where('tolerance_id', toleranceId)
      .if(isTenantScopeActive(), (query) => {
        query.whereIn('system_setting_id', scopedSystemSettingIds())
      })
      .first()
    return tolerance ? tolerance : null
  }

  async getTardinessTolerance(systemSettingId: number) {
    const tolerance = await Tolerance.query()
      .whereNull('tolerance_deleted_at')
      .where('tolerance_name', 'TardinessTolerance')
      .where('system_setting_id', systemSettingId)
      .if(isTenantScopeActive(), (query) => {
        query.whereIn('system_setting_id', scopedSystemSettingIds())
      })
      .first()
    return tolerance ? tolerance : null
  }
}
