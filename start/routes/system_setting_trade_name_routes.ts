/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/system_setting_trade_name_controller.index')
    router.post('/', '#controllers/system_setting_trade_name_controller.store')
    router.post(
      '/:systemSettingTradeNameId/employee-application-icon',
      '#controllers/system_setting_trade_name_controller.uploadEmployeeApplicationIcon'
    )
    router.put('/:systemSettingTradeNameId', '#controllers/system_setting_trade_name_controller.update')
    router.delete(
      '/:systemSettingTradeNameId',
      '#controllers/system_setting_trade_name_controller.delete'
    )
    router.get('/:systemSettingTradeNameId', '#controllers/system_setting_trade_name_controller.show')
  })
  .prefix('/api/system-setting-trade-names')
  .use(middleware.auth())
