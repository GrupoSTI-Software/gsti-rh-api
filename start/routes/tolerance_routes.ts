import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'

router
  .group(() => {
    /**
     * Las lecturas quedan sin gate: las consumen el Monitor de asistencia y la
     * ficha de empresa (ver `system_settings_permission_declarations.ts`).
     *
     * El ORDEN importa y es la razón de este bloque: un parámetro de ruta acepta
     * cualquier segmento, así que `/:systemSettingId` registrado primero también
     * atendía `/get-tardiness-tolerance` —el Monitor recibía el listado vacío de
     * una empresa con id "get-tardiness-tolerance" en vez de su tolerancia—. La
     * ruta literal va antes que la paramétrica.
     *
     * `GET /:id` (show) sigue sin alcanzarse: `/:systemSettingId` la cubre por
     * ser ambas de un solo segmento. Queda reportado, no se toca aquí.
     */
    router.get(
      '/get-tardiness-tolerance',
      '#controllers/tolerances_controller.getTardinessTolerance'
    )
    router.get('/:systemSettingId', '#controllers/tolerances_controller.index')
    router
      .post('/', '#controllers/tolerances_controller.store')
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.storeTolerance))
    router
      .put('/:id', '#controllers/tolerances_controller.update')
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.updateTolerance))
    router
      .delete('/:id', '#controllers/tolerances_controller.destroy')
      .use(middleware.permissionGate(SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.destroyTolerance))
    router.get('/:id', '#controllers/tolerances_controller.show')
  })
  .prefix('/api/tolerances')
  .use(middleware.auth())
