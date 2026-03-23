/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/system_setting_controller.storeProceedingFile')
    router.get('/', '#controllers/system_setting_controller.proceedingFiles')
    router.put(
      '/:systemSettingProceedingFileId',
      '#controllers/system_setting_controller.updateProceedingFile'
    )
    router.get(
      '/:systemSettingProceedingFileId',
      '#controllers/system_setting_controller.showProceedingFile'
    )
    router.delete(
      '/:systemSettingProceedingFileId',
      '#controllers/system_setting_controller.deleteProceedingFile'
    )
  })
  .prefix('/api/system-settings-proceeding-files')
  .use(middleware.auth())
