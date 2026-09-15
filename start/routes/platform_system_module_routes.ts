import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de plataforma para gobernar la disponibilidad global de los módulos
 * del sistema. Espeja el patrón de `platform_billing_routes.ts`.
 *
 * Todas protegidas por `auth` + `platformAdmin` — globales, sin scope de tenant.
 * Prefijo: /api/platform/system-modules
 *
 *   GET /api/platform/system-modules
 *     Lista todos los módulos (incl. inactivos), excluye bajas lógicas.
 *     Cada módulo lleva `systemModuleGroup` anidado (objeto | null; nunca ausente).
 *     Orden clusterizado: grupos por `systemModuleGroupOrder`, módulos por
 *     `systemModuleOrder` dentro del suyo, módulos sueltos juntos al final.
 *
 *   PUT /api/platform/system-modules/:systemModuleId/active → togglear disponibilidad
 *
 * La exigencia de permisos por módulo (`system_module_permission_enforcement_active`)
 * no se expone aquí a propósito: la gobierna `system_modules.constant.ts` y la
 * siembra 0062 la sobrescribe por slug, así que un interruptor HTTP solo abría
 * una divergencia entre BD y constante que la siguiente siembra deshacía.
 *
 * Ref: USRH1784573245783 · USRH1788282413110.
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_system_module_controller.index')
    router.put(
      '/:systemModuleId/active',
      '#controllers/platform_system_module_controller.updateActive'
    )
  })
  .prefix('/api/platform/system-modules')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
