import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas del inventario general de aparatos biométricos (unidades físicas).
 * Complementa `platform_device_model_routes.ts` (catálogo de modelos).
 *
 * Prefijo: /api/platform/devices/units  (§11 del spec USRH1787189981873)
 * Todas protegidas por `auth` + `platformAdmin`. Sin `businessScope`.
 *
 * Convivencia de prefijos (C-3): los segmentos bajo /api/platform/devices son
 * literales (/models, /units), sin riesgo de captura cruzada.
 *
 * Resolución `/summary` vs `/:platformDeviceId` (§11 del spec 1874):
 * El detalle usa `.where('platformDeviceId', router.matchers.number())` para
 * que `summary` nunca sea capturado como id numérico, sin importar el orden
 * de declaración. Precedente vivo: `employee_routes.ts:62`, `auth_signup_routes.ts:34`.
 *
  *   GET   /api/platform/devices/units/summary                        → summary
  *   GET   /api/platform/devices/units                                → index
  *   GET   /api/platform/devices/units/:platformDeviceId              → show
  *   POST  /api/platform/devices/units                                → store
  *   PATCH /api/platform/devices/units/:platformDeviceId/active       → setActive (apartar/devolver)
  *   POST  /api/platform/devices/units/:platformDeviceId/retirement   → retire (retiro definitivo)
 *
 * Ref: USRH1787189981873 (alta) · USRH1787189981874 (tablero) · USRH1787189981877 (ciclo de vida).
 */
router
  .group(() => {
    router.get('/summary', '#controllers/platform_device_controller.summary')
    router.get('/', '#controllers/platform_device_controller.index')
    router
      .get('/:platformDeviceId', '#controllers/platform_device_controller.show')
      .where('platformDeviceId', router.matchers.number())
    router.post('/', '#controllers/platform_device_controller.store')
    router
      .patch('/:platformDeviceId/active', '#controllers/platform_device_controller.setActive')
      .where('platformDeviceId', router.matchers.number())
    router
      .post('/:platformDeviceId/retirement', '#controllers/platform_device_controller.retire')
      .where('platformDeviceId', router.matchers.number())
  })
  .prefix('/api/platform/devices/units')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
