import type { PermissionGateOptions } from '#constants/permission_gate'

/** Acciones sembradas para el módulo 14 en `0018_system_permission_seeder`. */
type SystemSettingActionSlug =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'manage-attendance-fault-hr-emails'

const systemSettingsStandard = (action: SystemSettingActionSlug): PermissionGateOptions => ({
  module: 'system-settings',
  action,
  bypass: 'standard',
})

export const SYSTEM_SETTINGS_READ_PERMISSION_DECLARATIONS = {
  index: systemSettingsStandard('read'),
  show: systemSettingsStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>

export const SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS = {
  store: systemSettingsStandard('create'),
  /** Mapeo por defecto a `update`: cambio sobre la misma ficha de configuración. */
  update: systemSettingsStandard('update'),
  /** Mapeo por defecto a `update`: interruptor de correos de cumpleaños sobre la ficha. */
  updateBirthdayEmailsStatus: systemSettingsStandard('update'),
  /** Mapeo por defecto a `update`: interruptor de correos de aniversario sobre la ficha. */
  updateAnniversaryEmailsStatus: systemSettingsStandard('update'),
  /** Permiso dedicado: avisos a RH por faltas de asistencia (no comparte `update`). */
  updateAttendanceFaultHrEmailsStatus: systemSettingsStandard('manage-attendance-fault-hr-emails'),
  /** Mapeo por defecto a `update`: subida del ícono de la aplicación del empleado. */
  uploadEmployeeApplicationIcon: systemSettingsStandard('update'),
} as const satisfies Record<string, PermissionGateOptions>

export const SYSTEM_SETTINGS_DELETE_PERMISSION_DECLARATIONS = {
  delete: systemSettingsStandard('delete'),
} as const satisfies Record<string, PermissionGateOptions>
