import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas del submódulo de jornada efectiva por empresa.
 *
 * Requiere autenticación y el scope de unidades de negocio resuelto (anti-IDOR: el
 * controller valida que businessUnitId esté en ctx.businessUnitScope).
 */
router
  .group(() => {
    router.get('/', '#modules/working-time-rules/effective/effective.controller.show')
  })
  .prefix('/api/v1/working-time-rules/effective')
  .use(middleware.auth())
  .use(middleware.businessScope())
