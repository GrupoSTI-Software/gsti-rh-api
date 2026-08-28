import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas del inventario general de aparatos biométricos (unidades físicas).
 * Complementa `platform_device_routes.ts` (catálogo de modelos).
 *
 * Prefijo: /api/platform/devices/units  (§11 del spec USRH1787189981873)
 * Todas protegidas por `auth` + `platformAdmin`. Sin `businessScope`.
 *
 * Nota de convivencia (C-3 del spec): los segmentos que cuelgan de
 * `/api/platform/devices` son literales (`/models`, `/units`, etc.), por lo
 * que no hay riesgo de captura cruzada independientemente del orden de imports.
 *
 *   GET  /api/platform/devices/units                     → index (listado)
 *   GET  /api/platform/devices/units/:platformDeviceId   → show (detalle)
 *   POST /api/platform/devices/units                     → store (alta)
 *
 * Ref: USRH1787189981873.
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_device_controller.index')
    router.get('/:platformDeviceId', '#controllers/platform_device_controller.show')
    router.post('/', '#controllers/platform_device_controller.store')
  })
  .prefix('/api/platform/devices/units')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
