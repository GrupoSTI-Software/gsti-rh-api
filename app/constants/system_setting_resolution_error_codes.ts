/**
 * Códigos estables para el cliente de la resolución de System Settings por
 * `business_unit_id` (USRH1783712837584). Prefijo distinto del catálogo
 * legado `SYSTEM_SETTING_ERROR_CODES` (`SYS.CNFG.*`, errores de imagen del
 * ícono de la app), que permanece intacto.
 */
export const SYSTEM_SETTING_RESOLUTION_ERROR_CODES = {
  /**
   * La empresa (unidad de negocio) no tiene su propio registro de
   * `system_settings` (fail-closed: nunca se sirve la configuración de otra
   * empresa ni se cae a un registro por defecto).
   */
  NOT_FOUND_TENANT: 'SETTINGS.RESOLVE.NOT_FOUND_TENANT',
  /** Error no tipado durante la resolución (revisar logs). */
  SYS_UNHANDLED: 'SETTINGS.RESOLVE.SYS_UNHANDLED',
} as const

export type SystemSettingResolutionErrorCode =
  (typeof SYSTEM_SETTING_RESOLUTION_ERROR_CODES)[keyof typeof SYSTEM_SETTING_RESOLUTION_ERROR_CODES]
