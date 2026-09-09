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
