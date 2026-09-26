import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { REFORM_SIMULATION_PERMISSION_DECLARATIONS } from '#constants/reform_simulation_permission_declarations'

/**
 * Rutas del simulador de reforma de jornada (proyección roster × tope futuro).
 *
 * Requiere autenticación, scope de unidad de negocio (anti-IDOR: la empresa sale
 * solo de ctx.businessUnitScope, nunca del query) y `reform-simulation:read`.
 */
router
  .group(() => {
    router
      .get('/', '#controllers/reform_simulator_controller.simulate')
      .use(middleware.permissionGate(REFORM_SIMULATION_PERMISSION_DECLARATIONS.simulate))
  })
  .prefix('/api/v1/working-time-rules/reform-simulation')
  .use(middleware.auth())
  .use(middleware.businessScope())
