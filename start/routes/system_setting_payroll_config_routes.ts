/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'

router
  .group(() => {
    router.post('/', '#controllers/system_setting_payroll_config_controller.store').use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.storePayrollConfig))
    router.put('/:systemSettingPayrollConfigId', '#controllers/system_setting_payroll_config_controller.update').use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.updatePayrollConfig))
    router.delete('/:systemSettingPayrollConfigId', '#controllers/system_setting_payroll_config_controller.delete').use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.destroyPayrollConfig))
    // Era la única ruta pública del grupo: sin sesión se leía cualquier configuración de nómina por id.
    router.get('/:systemSettingPayrollConfigId', '#controllers/system_setting_payroll_config_controller.show').use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.showPayrollConfig))
  })
  .prefix('/api/system-setting-payroll-configs')
  /**
   * `auth()` va en el GRUPO y antes que `businessScope()`, no en cada ruta: los
   * middlewares del grupo corren ANTES que los de la ruta, así que con `auth()`
   * declarado ruta por ruta el scope se ejecutaba sin usuario autenticado y
   * reventaba al leer su rol (500 `Cannot read properties of undefined`).
   */
  .use(middleware.auth())
  /**
   * Sin `businessScope()` el servicio no puede acotar el `systemSettingId` que
   * manda el cliente y el alta escribía el régimen de pago de otra empresa.
   */
  .use(middleware.businessScope())
