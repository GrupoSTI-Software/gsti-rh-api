/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/system_setting_trade_name_controller.index')
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.indexTradeNames))
    router
      .post('/', '#controllers/system_setting_trade_name_controller.store')
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.storeTradeName))
    router
      .post(
        '/:systemSettingTradeNameId/employee-application-icon',
        '#controllers/system_setting_trade_name_controller.uploadEmployeeApplicationIcon'
      )
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.uploadTradeNameEmployeeApplicationIcon))
    router
      .put('/:systemSettingTradeNameId', '#controllers/system_setting_trade_name_controller.update')
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.updateTradeName))
    router
      .delete(
        '/:systemSettingTradeNameId',
        '#controllers/system_setting_trade_name_controller.delete'
      )
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.destroyTradeName))
    router
      .get('/:systemSettingTradeNameId', '#controllers/system_setting_trade_name_controller.show')
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.showTradeName))
  })
  .prefix('/api/system-setting-trade-names')
  .use(middleware.auth())
  /**
   * Sin `businessScope()` el contexto de empresa no se activa y las consultas
   * del servicio no pueden acotarse: el `systemSettingId` llega del cliente.
   */
  .use(middleware.businessScope())
