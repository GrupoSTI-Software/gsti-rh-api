/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'

router
  .group(() => {
    // Rutas para gestión de límites de empleados en configuraciones del sistema
    router.post('/', '#controllers/system_settings_employees_controller.store').use(middleware.auth()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.storeEmployeeLimit))
    router.get('/:systemSettingId', '#controllers/system_settings_employees_controller.index').use(middleware.auth()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.indexEmployeeLimits))
    router.get('/:systemSettingId/active', '#controllers/system_settings_employees_controller.getActive').use(middleware.auth()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.showActiveEmployeeLimit))
    router.delete('/:systemSettingId', '#controllers/system_settings_employees_controller.delete').use(middleware.auth()).use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.destroyEmployeeLimit))
  })
  .prefix('/api/system-settings-employees')
  /**
   * Sin `businessScope()` el `systemSettingId` del cliente alcanzaba el techo de
   * contratación de cualquier empresa: el borrado no borra, crea un registro sin
   * límite, así que la fuga quitaba el tope de contratación ajeno.
   */
  .use(middleware.businessScope())
