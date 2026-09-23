/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'

router
  .group(() => {
    router.put('/:systemSettingId/birthday-emails', '#controllers/system_setting_controller.updateBirthdayEmailsStatus').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.updateBirthdayEmailsStatus))
    router.put('/:systemSettingId/anniversary-emails', '#controllers/system_setting_controller.updateAnniversaryEmailsStatus').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.updateAnniversaryEmailsStatus))
    router.put('/:systemSettingId/site-timezone', '#controllers/system_setting_controller.updateSiteTimezone').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.updateSiteTimezone))
    router.put('/:systemSettingId/attendance-fault-hr-emails', '#controllers/system_setting_controller.updateAttendanceFaultHrEmailsStatus').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.updateAttendanceFaultHrEmailsStatus))
    router.post('/:systemSettingId/employee-application-icon', '#controllers/system_setting_controller.uploadEmployeeApplicationIcon').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.uploadEmployeeApplicationIcon))
    router.get('/', '#controllers/system_setting_controller.index').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.indexSystemSettings))
    router.post('/', '#controllers/system_setting_controller.store').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.storeSystemSetting))
    router.put('/:systemSettingId', '#controllers/system_setting_controller.update').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.updateSystemSetting))
    router.delete('/:systemSettingId', '#controllers/system_setting_controller.delete').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.destroySystemSetting))
    router.get('/:systemSettingId', '#controllers/system_setting_controller.show').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.showSystemSetting))
  })
  .prefix('/api/system-settings')
/**
 * Sin gate a propósito: la configuración activa es la marca y las reglas de
 * arranque del backoffice y de la PWA del colaborador, y la leen también el
 * Monitor de asistencia, Puestos, Vacaciones e Historial de sueldo. Exigir
 * `system-settings:read` dejaría sin arranque a todo rol sin ese permiso.
 */
router.group(() => {
  router.get('/', '#controllers/system_setting_controller.getActive').use(middleware.auth())
})
.prefix('/api/system-settings-active')
/** Sin gate a propósito: la consumen Bonos del colaborador y el Monitor de asistencia. */
router.group(() => {
  router.get('/', '#controllers/system_setting_controller.getPayrollConfig').use(middleware.auth())
})
.prefix('/api/system-settings-get-payroll-config')
