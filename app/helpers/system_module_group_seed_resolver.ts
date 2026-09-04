import SystemModuleGroup from '#models/system_module_group'
import type { SystemModuleGroupKey } from '#constants/system_module_group_catalog'

/**
 * Resuelve los ids de grupo a partir de claves estables, para uso exclusivo
 * de seeders de módulo (USRH1788282413088 §10.2).
 *
 * Contrato garantizado — el llamador puede confiar en estos invariantes:
 *
 *   TODO O NADA POR SEEDER.  La resolución ocurre antes de la primera
 *   escritura del llamador. Nunca queda un lote a medias.
 *
 *   NUNCA DEGRADA A NULO SILENCIOSO.  Una clave inexistente — por typo,
 *   renombre o grupo dado de baja — produce una excepción, no un módulo
 *   suelto sin que nadie lo note. (R12 / CA4)
 *
 *   CERO ACOPLAMIENTO A IDS.  Ningún consumidor conoce ni escribe
 *   `system_module_group_id` literal; los ids difieren entre ambientes.
 *
 * @param keys        Lista de claves pedidas. Los nulos se descartan sin error:
 *                    representan módulos sueltos declarados a propósito (R11 / CA5).
 * @param seederName  Nombre del seeder llamador, incluido en el mensaje de error
 *                    para que con 16+ llamadores sea inmediato saber quién falló.
 * @returns           Map<clave, id> con una entrada por cada clave no nula pedida.
 *                    El llamador escribe `groupIdMap.get(key) ?? null` donde el
 *                    `?? null` solo puede activarse en el caso de clave nula: si
 *                    la clave existiera y no resolviera, el paso 4 ya habría abortado.
 */
export async function resolveSystemModuleGroupIds(
  keys: (SystemModuleGroupKey | null)[],
  seederName: string
): Promise<Map<SystemModuleGroupKey, number>> {
  // 1. Normalizar: descartar nulos (módulos sueltos declarados, no errores) y deduplicar.
  const uniqueKeys = [...new Set(keys.filter((k): k is SystemModuleGroupKey => k !== null))]

  // 2. Corte temprano: sin claves que resolver → mapa vacío sin consultar la BD (CA6).
  if (uniqueKeys.length === 0) {
    return new Map()
  }

  // 3. Resolver en una sola consulta, solo sobre filas vivas.
  //    El whereNull va explícito — sin delegar al scope implícito de SoftDeletes,
  //    para que la intención sea legible en el sitio (nota de §7).
  const groups = await SystemModuleGroup.query()
    .whereIn('system_module_group_key', uniqueKeys)
    .whereNull('system_module_group_deleted_at')

  const groupIdByKey = new Map(
    groups.map((g) => [g.systemModuleGroupKey as SystemModuleGroupKey, g.systemModuleGroupId])
  )

  // 4. Fallar ruidosamente antes de devolver si alguna clave no resolvió (R12 / CA4).
  //    Formato copiado de 0032_system_feature_seeder.ts:21-26.
  const missingKeys = uniqueKeys.filter((key) => !groupIdByKey.has(key))
  if (missingKeys.length > 0) {
    throw new Error(
      `[${seederName}] Grupo(s) no encontrado(s) por clave: ${missingKeys.sort().join(', ')}. ` +
        'Verifica que la migración del catálogo y el seeder del catálogo de grupos ' +
        'hayan corrido antes.'
    )
  }

  return groupIdByKey
}
