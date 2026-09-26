import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de plataforma de solo lectura sobre el catálogo de módulos del sistema.
 * Espeja el patrón de `platform_billing_routes.ts`.
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
 * Ni la disponibilidad (`system_module_active`) ni la exigencia de permisos
 * (`system_module_permission_enforcement_active`) se escriben por HTTP a
 * propósito: las dos las gobierna `system_modules.constant.ts` y la siembra 0062
 * las sobrescribe por slug en cada corrida. Un interruptor HTTP solo abría una
 * divergencia entre BD y constante que la siguiente corrida de la siembra
 * deshacía en silencio.
 *
 * Apagar un módulo se hace en la constante Y exige correr la siembra: el repo no
 * automatiza `node ace db:seed` en ningún lado (no hay script en `package.json`
 * ni workflow que lo ejecute; el README lo documenta como paso manual), así que
 * un despliegue por sí solo NO aplica el cambio. Queda anotado en el backlog de
 * la fase 6 para que operación conozca el costo antes de necesitarlo.
 *
 * Ref: USRH1784573245783 · USRH1788282413110.
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_system_module_controller.index')
  })
  .prefix('/api/platform/system-modules')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
