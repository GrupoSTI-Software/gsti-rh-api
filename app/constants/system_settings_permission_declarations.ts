import type { PermissionGateOptions } from '#constants/permission_gate'

const systemSettingsStandard = (action: string): PermissionGateOptions => ({
  module: 'system-settings',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Ajustes Generales (`system-settings`).
 * Fuente única que consumen las rutas de la ficha de empresa y de sus
 * subrecursos: expediente de la empresa, tolerancias, configuración de nómina,
 * correos de notificación, límite de empleados y razones sociales.
 *
 * Criterio por verbo:
 *  - La ficha se lee, se crea, se edita y se borra con su permiso propio.
 *  - Las escrituras de los subrecursos piden `update`: el formulario del
 *    backoffice solo los muestra al editar una ficha que ya existe
 *    (`components/systemSettingInfoForm/index.vue`, `!isNewSystemSetting`) y la
 *    pantalla habilita el expediente con `canUpdate`. Agregar una tolerancia o
 *    borrar una razón social es editar la empresa, no darla de alta ni de baja.
 *  - Sus lecturas piden `read`: solo las consume esa misma pantalla.
 *
 * Quedan abiertas a propósito y por eso no se declaran aquí:
 *  - `GET /api/system-settings-active` y `GET /api/system-settings-get-payroll-config`:
 *    arranque y marca del backoffice y de la PWA del colaborador, bonos y
 *    Monitor de asistencia.
 *  - `GET /api/system-settings-proceeding-files`: lo lee la Matriz de
 *    vencimientos. Su vecina `get-expired-and-expiring/:systemSettingId` ya no
 *    está abierta: pide `documents-expiration-matrix:read`
 *    (`documents_expiration_matrix_permission_declarations.ts`).
 *  - Las lecturas de `/api/tolerances`: `/:systemSettingId` se registra antes
 *    que `/get-tardiness-tolerance` y atiende también la petición del Monitor
 *    de asistencia; protegerla le quitaría la tolerancia a ese módulo.
 *
 * Bypass `standard` (root y owner): son los dos únicos roles a los que el
 * backoffice da acceso total a la pantalla (`store/general.ts`, `getAccess`);
 * ningún código vigente trata a `super-administrador` como administrador de
 * ajustes.
 */
export const SYSTEM_SETTINGS_PERMISSION_DECLARATIONS = {
  // Ficha de empresa — start/routes/system_setting_routes.ts
  indexSystemSettings: systemSettingsStandard('read'),
  showSystemSetting: systemSettingsStandard('read'),
  storeSystemSetting: systemSettingsStandard('create'),
  updateSystemSetting: systemSettingsStandard('update'),
  updateBirthdayEmailsStatus: systemSettingsStandard('update'),
  updateAnniversaryEmailsStatus: systemSettingsStandard('update'),
  updateAttendanceFaultHrEmailsStatus: systemSettingsStandard('update'),
  uploadEmployeeApplicationIcon: systemSettingsStandard('update'),
  destroySystemSetting: systemSettingsStandard('delete'),

  // Expediente de la empresa — start/routes/system_settings_proceeding_files_routes.ts
  showProceedingFile: systemSettingsStandard('read'),
  storeProceedingFile: systemSettingsStandard('update'),
  updateProceedingFile: systemSettingsStandard('update'),
  destroyProceedingFile: systemSettingsStandard('update'),

  // Tolerancias — start/routes/tolerance_routes.ts
  storeTolerance: systemSettingsStandard('update'),
  updateTolerance: systemSettingsStandard('update'),
  destroyTolerance: systemSettingsStandard('update'),

  // Configuración de nómina — start/routes/system_setting_payroll_config_routes.ts
  showPayrollConfig: systemSettingsStandard('read'),
  storePayrollConfig: systemSettingsStandard('update'),
  updatePayrollConfig: systemSettingsStandard('update'),
  destroyPayrollConfig: systemSettingsStandard('update'),

  // Correos de notificación — start/routes/system_settings_notification_emails_routes.ts
  indexNotificationEmails: systemSettingsStandard('read'),
  indexNotificationEmailsBySystemSetting: systemSettingsStandard('read'),
  storeNotificationEmail: systemSettingsStandard('update'),
  destroyNotificationEmail: systemSettingsStandard('update'),

  // Límite de empleados — start/routes/system_settings_employees.ts
  indexEmployeeLimits: systemSettingsStandard('read'),
  showActiveEmployeeLimit: systemSettingsStandard('read'),
  storeEmployeeLimit: systemSettingsStandard('update'),
  destroyEmployeeLimit: systemSettingsStandard('update'),

  // Razones sociales — start/routes/system_setting_trade_name_routes.ts
  indexTradeNames: systemSettingsStandard('read'),
  showTradeName: systemSettingsStandard('read'),
  storeTradeName: systemSettingsStandard('update'),
  updateTradeName: systemSettingsStandard('update'),
  uploadTradeNameEmployeeApplicationIcon: systemSettingsStandard('update'),
  destroyTradeName: systemSettingsStandard('update'),
} as const satisfies Record<string, PermissionGateOptions>
