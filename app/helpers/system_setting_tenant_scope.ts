import SystemSetting from '#models/system_setting'
import { TenantContext } from '#utils/tenant_context'
import { recordTenantScopeBlock } from '#utils/tenant_scope_block_log'

/**
 * Corte por empresa para todo lo que cuelga de `system_settings`.
 *
 * `SystemSetting` no compone el mixin de empresa (16 consumidores legacy de
 * `getActive()`). El mixin ya falla cerrado sin contexto; este corte sigue la
 * misma regla: sin contexto, alcance vacío con la configuración global visible.
 */

/** true cuando hay que aplicar el corte de empresa: siempre, salvo bypass declarado. */
export function isTenantScopeActive(): boolean {
  return !TenantContext.isBypassed()
}

function recordSystemSettingBlock(hook: 'find' | 'fetch'): void {
  if (!TenantContext.isActive()) {
    recordTenantScopeBlock({ table: 'system_settings', hook })
  }
}

/**
 * Subconsulta con los `system_setting_id` que la empresa activa puede ver.
 * Pensada para `query.whereIn('system_setting_id', scopedSystemSettingIds())`,
 * siempre bajo la guarda de `isTenantScopeActive()`.
 */
export function scopedSystemSettingIds() {
  recordSystemSettingBlock('fetch')
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
  recordSystemSettingBlock('find')
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
