/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'

router
  .group(() => {
    // Sin gate: la Matriz de vencimientos lee los documentos por vencer.
    router.get(
      '/get-expired-and-expiring/:systemSettingId',
      '#controllers/system_setting_controller.getExpiresAndExpiringProceedingFiles'
    )
    router
      .post('/', '#controllers/system_setting_controller.storeProceedingFile')
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.storeProceedingFile))
    // Sin gate: la tarjeta de documentos de la Matriz de vencimientos lista el expediente.
    router.get('/', '#controllers/system_setting_controller.proceedingFiles')
    router
      .put(
        '/:systemSettingProceedingFileId',
        '#controllers/system_setting_controller.updateProceedingFile'
      )
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.updateProceedingFile))
    router
      .get(
        '/:systemSettingProceedingFileId',
        '#controllers/system_setting_controller.showProceedingFile'
      )
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.showProceedingFile))
    router
      .delete(
        '/:systemSettingProceedingFileId',
        '#controllers/system_setting_controller.deleteProceedingFile'
      )
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.destroyProceedingFile))
  })
  .prefix('/api/system-settings-proceeding-files')
  .use(middleware.auth())
