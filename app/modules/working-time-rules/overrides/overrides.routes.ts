import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas del submódulo de overrides de jornada por empresa.
 *
 * Todas requieren autenticación y el scope de unidades de negocio resuelto
 * (anti-IDOR: el controller valida que businessUnitId esté en ctx.businessUnitScope).
 */
router
  .group(() => {
    router.get('/', '#modules/working-time-rules/overrides/overrides.controller.index')
    router.post('/', '#modules/working-time-rules/overrides/overrides.controller.store')
    router.patch('/:id', '#modules/working-time-rules/overrides/overrides.controller.update')
    router.delete('/:id', '#modules/working-time-rules/overrides/overrides.controller.destroy')
  })
  .prefix('/api/v1/working-time-rules/overrides')
  .use(middleware.auth())
  .use(middleware.businessScope())
