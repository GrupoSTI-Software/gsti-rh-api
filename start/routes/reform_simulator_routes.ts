import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas del simulador de reforma de jornada (proyección roster × tope futuro).
 *
 * Requiere autenticación y scope de unidad de negocio (anti-IDOR: la empresa sale
 * solo de ctx.businessUnitScope, nunca del query).
 */
router
  .group(() => {
    router.get('/', '#controllers/reform_simulator_controller.simulate')
  })
  .prefix('/api/v1/working-time-rules/reform-simulation')
  .use(middleware.auth())
  .use(middleware.businessScope())
