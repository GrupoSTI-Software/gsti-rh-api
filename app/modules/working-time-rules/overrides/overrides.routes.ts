import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { WORKING_TIME_OVERRIDES_PERMISSION_DECLARATIONS as OVERRIDES } from '#constants/working_time_overrides_permission_declarations'

/**
 * Rutas del submódulo de overrides de jornada por empresa.
 *
 * Todas requieren autenticación y el scope de unidades de negocio resuelto
 * (anti-IDOR: el controller valida que businessUnitId esté en ctx.businessUnitScope),
 * y cada una su permiso del módulo `working-time-overrides`.
 */
router
  .group(() => {
    router
      .get('/', '#modules/working-time-rules/overrides/overrides.controller.index')
      .use(middleware.permissionGate(OVERRIDES.indexOverrides))
    router
      .post('/', '#modules/working-time-rules/overrides/overrides.controller.store')
      .use(middleware.permissionGate(OVERRIDES.storeOverride))
    router
      .patch('/:id', '#modules/working-time-rules/overrides/overrides.controller.update')
      .use(middleware.permissionGate(OVERRIDES.updateOverride))
    router
      .delete('/:id', '#modules/working-time-rules/overrides/overrides.controller.destroy')
      .use(middleware.permissionGate(OVERRIDES.destroyOverride))
  })
  .prefix('/api/v1/working-time-rules/overrides')
  .use(middleware.auth())
  .use(middleware.businessScope())
