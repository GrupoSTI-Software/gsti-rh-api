/* eslint-disable prettier/prettier */

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    // Rutas para gestión de límites de empleados en configuraciones del sistema
    router.post('/', '#controllers/system_settings_employees_controller.store').use(middleware.auth())
    router.get('/:systemSettingId', '#controllers/system_settings_employees_controller.index').use(middleware.auth())
    router.get('/:systemSettingId/active', '#controllers/system_settings_employees_controller.getActive').use(middleware.auth())
    router.delete('/:systemSettingId', '#controllers/system_settings_employees_controller.delete').use(middleware.auth())
  })
  .prefix('/api/system-settings-employees')
