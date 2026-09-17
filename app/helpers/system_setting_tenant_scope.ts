import SystemSetting from '#models/system_setting'
import { TenantContext } from '#utils/tenant_context'

/**
 * Corte por empresa para todo lo que cuelga de `system_settings`.
 *
 * `SystemSetting` no compone el mixin de empresa por decisión documentada en
 * `app/models/system_setting.ts` (16 consumidores legacy de `getActive()`), y
 * sus entidades hijas —tolerancias, configuración de nómina, límite de
 * empleados, expediente y correos de notificación— tampoco lo componen. Como
 * el `systemSettingId` llega del cliente, sin este candado basta con cambiar
 * el número para leer o escribir la configuración de otra empresa.
 *
 * El mixin `withBusinessUnitScope` no cubre este caso: falla abierto cuando no
 * hay contexto activo, así que montar `businessScope()` en la ruta es
 * necesario pero no suficiente. La consulta tiene que acotarse aquí.
 *
 * Mismo criterio que `SystemSettingTradeNameService`, que fue el primero en
 * resolverlo: las filas con `business_unit_id` nulo son la configuración
 * global del sistema y quedan visibles para todos.
 */

/** true cuando hay un corte de empresa real que aplicar a la consulta. */
export function isTenantScopeActive(): boolean {
  return TenantContext.isActive() && !TenantContext.isBypassed()
}

/**
 * Subconsulta con los `system_setting_id` que la empresa activa puede ver.
 * Pensada para `query.whereIn('system_setting_id', scopedSystemSettingIds())`,
 * siempre bajo la guarda de `isTenantScopeActive()`.
 */
export function scopedSystemSettingIds() {
  const scope = TenantContext.getScope()

  return SystemSetting.query()
    .select('system_setting_id')
    .whereNull('system_setting_deleted_at')
    .where((subQuery) => {
      subQuery.whereIn('business_unit_id', scope).orWhereNull('business_unit_id')
    })
}

/**
 * Resuelve el ajuste dentro de la empresa activa. Devuelve `null` cuando no
 * pertenece a la empresa activa ni es configuración global, de modo que quien
 * llama responda lo mismo para «no existe» y para «existe pero es de otro»: si
 * las respuestas difirieran, el identificador consecutivo serviría de oráculo
 * para enumerar empresas.
 */
export async function findSystemSettingInScope(systemSettingId: number) {
  const query = SystemSetting.query()
    .whereNull('system_setting_deleted_at')
    .where('system_setting_id', systemSettingId)

  if (!isTenantScopeActive()) {
    return query.first()
  }

  const scope = TenantContext.getScope()

  return query
    .where((subQuery) => {
      subQuery.whereIn('business_unit_id', scope).orWhereNull('business_unit_id')
    })
    .first()
}

/** Atajo de lectura para las rutas que solo necesitan aceptar o rechazar. */
export async function isSystemSettingInScope(systemSettingId: number): Promise<boolean> {
  const systemSetting = await findSystemSettingInScope(systemSettingId)
  return systemSetting !== null
}
