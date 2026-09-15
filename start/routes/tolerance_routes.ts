import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'

router
  .group(() => {
    /**
     * Las tres lecturas quedan sin gate. `/:systemSettingId` se registra antes
     * que `/get-tardiness-tolerance` y el parámetro acepta cualquier segmento,
     * así que también atiende la petición del Monitor de asistencia; por la
     * misma causa `GET /:id` no se alcanza. Reordenarlas cambia lo que hoy
     * recibe el Monitor y queda fuera de este cambio.
     */
    router.get('/:systemSettingId', '#controllers/tolerances_controller.index')
    router.get(
      '/get-tardiness-tolerance',
      '#controllers/tolerances_controller.getTardinessTolerance'
    )
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
