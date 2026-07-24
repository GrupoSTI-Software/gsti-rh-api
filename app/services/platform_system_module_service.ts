import SystemModule from '#models/system_module'
import { PLATFORM_SYSTEM_MODULE_ERROR_CODES } from '../constants/platform_system_module_error_codes.js'
import { PlatformSystemModuleServiceError } from '../exceptions/platform_system_module_service_error.js'

/**
 * Servicio de plataforma para gobernar la disponibilidad global de los módulos
 * del sistema (`system_modules.system_module_active`).
 *
 * Separado del `SystemModuleService` de tenant (que alimenta el menú del BO)
 * para no acoplar la administración global con el consumo per-tenant.
 */
export default class PlatformSystemModuleService {
  /**
   * Lista todos los módulos del sistema, incluidos los inactivos, ordenados
   * por grupo de menú y luego por id (la agrupación visual la resuelve el
   * cliente). Excluye los módulos con baja lógica.
   *
   * @returns Catálogo completo de módulos.
   */
  async listAll(): Promise<SystemModule[]> {
    return SystemModule.query().orderBy('system_module_group').orderBy('system_module_id')
  }

  /**
   * Enciende o apaga un módulo de forma global. No borra datos: solo cambia
   * su disponibilidad (regla 3). `system_module_updated_at` se actualiza solo.
   *
   * @param systemModuleId - Identificador del módulo a togglear.
   * @param active - Estado deseado: `true` encendido, `false` apagado.
   * @returns El módulo con su nuevo estado.
   * @throws PlatformSystemModuleServiceError 404 si el módulo no existe.
   */
  async setActive(systemModuleId: number, active: boolean): Promise<SystemModule> {
    const systemModule = await SystemModule.find(systemModuleId)

    if (!systemModule) {
      throw new PlatformSystemModuleServiceError(
        `Módulo ${systemModuleId} no encontrado`,
        PLATFORM_SYSTEM_MODULE_ERROR_CODES.MODULE_NOT_FOUND,
        404,
        'PLT.MOD.MODULE_NOT_FOUND',
        'El módulo solicitado no existe.'
      )
    }

    systemModule.systemModuleActive = active ? 1 : 0
    await systemModule.save()

    return systemModule
  }
}
