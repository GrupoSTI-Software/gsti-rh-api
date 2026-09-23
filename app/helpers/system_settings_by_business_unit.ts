import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'

/**
 * Índice `slug de empresa -> su configuración activa`.
 *
 * Punto único de una pregunta que se hacía en seis lugares distintos, y en
 * todos igual de mal: cada uno traía TODAS las configuraciones activas, partía
 * el CSV `system_setting_business_units` y armaba su propio mapa en memoria.
 * La configuración pertenece a UNA empresa (`system_settings.business_unit_id`,
 * `1783968970000`), así que el índice se arma con la llave y un solo join.
 *
 * Quedan fuera las configuraciones sin empresa dueña: la fila base de la
 * plataforma no es de nadie y se pide con `SystemSettingService.getActive()`.
 *
 * Los slugs se normalizan a minúsculas, como hacían los mapas que sustituye.
 */
export async function indexSystemSettingsByBusinessUnitSlug(): Promise<Map<string, SystemSetting>> {
  const settings = await SystemSetting.query()
    .whereNull('system_setting_deleted_at')
    .where('system_setting_active', 1)
    .whereNotNull('business_unit_id')

  if (settings.length === 0) {
    return new Map()
  }

  const businessUnitIds = [
    ...new Set(settings.map((setting) => setting.businessUnitId).filter((id): id is number => id !== null)),
  ]

  const units = await BusinessUnit.query()
    .whereIn('business_unit_id', businessUnitIds)
    .select('business_unit_id', 'business_unit_slug')

  const slugById = new Map(units.map((unit) => [unit.businessUnitId, unit.businessUnitSlug]))

  const index = new Map<string, SystemSetting>()
  for (const setting of settings) {
    const slug = setting.businessUnitId === null ? null : slugById.get(setting.businessUnitId)
    if (!slug) {
      continue
    }

    const key = slug.trim().toLowerCase()
    if (!index.has(key)) {
      index.set(key, setting)
    }
  }

  return index
}

/**
 * Slugs de empresa de una configuración.
 *
 * Devuelve como mucho UNO: la configuración pertenece a una sola empresa. Se
 * mantiene la forma de lista porque es lo que esperan sus consumidores, que
 * antes partían el CSV `system_setting_business_units` y filtraban empleados
 * con el resultado. Vacía cuando la configuración es la base de la plataforma,
 * que no es de ninguna empresa.
 */
export async function resolveBusinessUnitSlugsForSetting(
  setting: Pick<SystemSetting, 'businessUnitId'>
): Promise<string[]> {
  if (setting.businessUnitId === null || setting.businessUnitId === undefined) {
    return []
  }

  const unit = await BusinessUnit.query()
    .where('business_unit_id', setting.businessUnitId)
    .select('business_unit_slug')
    .first()

  const slug = unit?.businessUnitSlug?.trim()

  return slug ? [slug] : []
}
