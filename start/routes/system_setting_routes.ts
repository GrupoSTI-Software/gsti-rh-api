/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/assign-system-modules/:systemSettingId', '#controllers/system_setting_controller.assignSystemModules').use(middleware.auth())
    router.put('/:systemSettingId/birthday-emails', '#controllers/system_setting_controller.updateBirthdayEmailsStatus').use(middleware.auth())
    router.get('/', '#controllers/system_setting_controller.index').use(middleware.auth())
    router.post('/', '#controllers/system_setting_controller.store').use(middleware.auth())
    router.put('/:systemSettingId', '#controllers/system_setting_controller.update').use(middleware.auth())
    router.delete('/:systemSettingId', '#controllers/system_setting_controller.delete').use(middleware.auth())
    router.get('/:systemSettingId', '#controllers/system_setting_controller.show')
  })
  .prefix('/api/system-settings')
router.group(() => {
  router.get('/', '#controllers/system_setting_controller.getActive')
})
.prefix('/api/system-settings-active')
router.group(() => {
  router.get('/', '#controllers/system_setting_controller.getPayrollConfig')
})
.prefix('/api/system-settings-get-payroll-config')
