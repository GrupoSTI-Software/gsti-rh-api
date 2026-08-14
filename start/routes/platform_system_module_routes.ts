import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de plataforma para gobernar la disponibilidad global de los módulos
 * del sistema. Espeja el patrón de `platform_billing_routes.ts`.
 *
 * Todas protegidas por `auth` + `platformAdmin` — globales, sin scope de tenant.
 * Prefijo: /api/platform/system-modules
 *
 *   GET /api/platform/system-modules                    → listar todos (incl. inactivos)
 *   PUT /api/platform/system-modules/:systemModuleId/active → togglear disponibilidad
 *   PUT /api/platform/system-modules/:systemModuleId/permission-enforcement → togglear enforcement
 *
 * Ref: USRH1784573245783.
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_system_module_controller.index')
    router.put(
      '/:systemModuleId/active',
      '#controllers/platform_system_module_controller.updateActive'
    )
    router.put(
      '/:systemModuleId/permission-enforcement',
      '#controllers/platform_system_module_controller.updatePermissionEnforcement'
    )
  })
  .prefix('/api/platform/system-modules')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
