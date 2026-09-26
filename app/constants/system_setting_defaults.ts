/**
 * Valores por defecto de la configuración (`system_settings`) de un tenant nuevo.
 *
 * Fuente autoritativa única: antes el alta automática copiaba el contenido del
 * registro base fundacional (`system_setting_id = 1`, GrupoSTI), lo que sembraba
 * la marca de GrupoSTI —trade name, logo, banner, favicon— en cada empresa nueva.
 * Ahora la empresa nace con su propia identidad (trade name = nombre de la
 * empresa, imágenes vacías) y con los defaults operativos de este archivo.
 *
 * Lo consume `SystemSettingService.createForTenant()` (alta de cliente nuevo y
 * alta de empresa desde el BO, ambas vía ese único punto).
 */

/**
 * Factor días/mes para convertir salario diario a mensual en UI.
 * Fuente única: también lo usa el alta manual desde el BO
 * (`SystemSettingService.assignManualContent`) y el `DEFAULT` de la columna
 * `system_setting_monthly_conversion_factor`.
 */
export const SYSTEM_SETTING_MONTHLY_CONVERSION_FACTOR_DEFAULT = 30.42

/**
 * Contenido que se siembra en la fila del tenant nuevo. Excluye `businessUnitId`
 * y `systemSettingBusinessUnits` (los resuelve el call-site con los datos del
 * tenant destino) y `systemSettingTradeName` (lo aporta `tenantDefaultContent`
 * a partir del nombre de la empresa).
 */
const SYSTEM_SETTING_TENANT_DEFAULTS = {
  systemSettingLogo: null,
  systemSettingBanner: null,
  systemSettingFavicon: null,
  systemSettingEmployeeAplicationIcon: null,
  systemSettingSidebarColor: 'FFFFFF',
  systemSettingActive: 1,
  systemSettingToleranceCountPerAbsence: 3,
  systemSettingRestrictFutureVacation: 1,
  systemSettingBirthdayEmails: 0,
  systemSettingAnniversaryEmails: 0,
  systemSettingAttendanceFaultHrEmails: 0,
  systemSettingMaxAbsencesBeforeAttendanceLock: null,
  systemSettingMaxLateArrivalsBeforeAttendanceLock: null,
  systemSettingPeriodAbsencesBeforeAttendanceLock: 'monthly',
  systemSettingPeriodLateArrivalsBeforeAttendanceLock: 'monthly',
  systemSettingMonthlyConversionFactor: SYSTEM_SETTING_MONTHLY_CONVERSION_FACTOR_DEFAULT,
} as const

export type SystemSettingTenantDefaults = typeof SYSTEM_SETTING_TENANT_DEFAULTS & {
  systemSettingTradeName: string
}

/**
 * Contenido inicial de la configuración de una empresa, con su nombre como
 * nombre comercial. Devuelve un objeto nuevo en cada llamada para que el
 * `Object.assign` del servicio nunca mute la constante compartida.
 */
export function tenantDefaultContent(businessUnitName: string): SystemSettingTenantDefaults {
  return {
    ...SYSTEM_SETTING_TENANT_DEFAULTS,
    systemSettingTradeName: businessUnitName,
  }
}

/**
 * Tolerancias de asistencia con las que nace la configuración de una empresa.
 *
 * Son los mismos tres valores que sembraba `0020_tolerance_seeder` sobre el
 * registro base de plataforma (`system_setting_id = 1`). Ese seeder se retiró:
 * las tolerancias son de cada empresa —las edita desde su backoffice— y colgarlas
 * de una fila global hacía que el motor de asistencia leyera las de plataforma
 * para todos los clientes por igual.
 *
 * `Delay` marca el retardo, `Fault` la falta y `TardinessTolerance` el margen de
 * impuntualidad acumulable.
 */
export const TENANT_TOLERANCE_DEFAULTS = [
  { toleranceName: 'Delay', toleranceMinutes: 10 },
  { toleranceName: 'Fault', toleranceMinutes: 30 },
  { toleranceName: 'TardinessTolerance', toleranceMinutes: 3 },
] as const

/**
 * Marca con la que responden los correos y reportes cuando no hay una empresa
 * que los reclame (procesos de plataforma, o una empresa sin configuración).
 *
 * Antes salía del registro base sembrado, que traía el nombre y los assets de
 * una instalación concreta (`GrupoSTI`, imágenes de `sae-assets`). Una marca de
 * respaldo es una constante, no una fila de datos que alguien pueda editar sin
 * saber a cuántos clientes afecta.
 */
export const PLATFORM_FALLBACK_TRADE_NAME = 'Valanserh'
