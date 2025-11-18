/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/system_setting_payroll_config_controller.store').use(middleware.auth())
    router.put('/:systemSettingPayrollConfigId', '#controllers/system_setting_payroll_config_controller.update').use(middleware.auth())
    router.delete('/:systemSettingPayrollConfigId', '#controllers/system_setting_payroll_config_controller.delete').use(middleware.auth())
    router.get('/:systemSettingPayrollConfigId', '#controllers/system_setting_payroll_config_controller.show')
  })
  .prefix('/api/system-setting-payroll-configs')
