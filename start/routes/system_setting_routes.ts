/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import {
  SYSTEM_SETTINGS_DELETE_PERMISSION_DECLARATIONS,
  SYSTEM_SETTINGS_READ_PERMISSION_DECLARATIONS,
  SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS,
} from '#constants/system_settings_permission_declarations'

router
  .group(() => {
    router.put('/:systemSettingId/birthday-emails', '#controllers/system_setting_controller.updateBirthdayEmailsStatus').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.updateBirthdayEmailsStatus))
    router.put('/:systemSettingId/anniversary-emails', '#controllers/system_setting_controller.updateAnniversaryEmailsStatus').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.updateAnniversaryEmailsStatus))
    router.put('/:systemSettingId/attendance-fault-hr-emails', '#controllers/system_setting_controller.updateAttendanceFaultHrEmailsStatus').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.updateAttendanceFaultHrEmailsStatus))
    router.post('/:systemSettingId/employee-application-icon', '#controllers/system_setting_controller.uploadEmployeeApplicationIcon').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.uploadEmployeeApplicationIcon))
    router.get('/', '#controllers/system_setting_controller.index').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_READ_PERMISSION_DECLARATIONS.index))
    router.post('/', '#controllers/system_setting_controller.store').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.store))
    router.put('/:systemSettingId', '#controllers/system_setting_controller.update').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_WRITE_PERMISSION_DECLARATIONS.update))
    router.delete('/:systemSettingId', '#controllers/system_setting_controller.delete').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_DELETE_PERMISSION_DECLARATIONS.delete))
    router.get('/:systemSettingId', '#controllers/system_setting_controller.show').use(middleware.auth()).use(middleware.businessScope()).use(middleware.permissionGate(SYSTEM_SETTINGS_READ_PERMISSION_DECLARATIONS.show))
  })
  .prefix('/api/system-settings')
router.group(() => {
  router.get('/', '#controllers/system_setting_controller.getActive').use(middleware.auth())
})
.prefix('/api/system-settings-active')
router.group(() => {
  router.get('/', '#controllers/system_setting_controller.getPayrollConfig').use(middleware.auth())
})
.prefix('/api/system-settings-get-payroll-config')
