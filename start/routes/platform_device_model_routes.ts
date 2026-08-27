import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de plataforma para el catálogo de modelos de dispositivo biométrico.
 * Espeja el patrón de `platform_system_module_routes.ts`.
 *
 * Todas protegidas por `auth` + `platformAdmin` — globales, sin scope de tenant.
 * Prefijo: /api/platform/devices/models  (§11 del spec USRH1787189981870)
 *
 *   GET    /api/platform/devices/models                        → index
 *   GET    /api/platform/devices/models/:deviceModelId         → show
 *   POST   /api/platform/devices/models                        → store
 *   PATCH  /api/platform/devices/models/:deviceModelId         → update
 *   PUT    /api/platform/devices/models/:deviceModelId/status  → changeStatus
 *   DELETE /api/platform/devices/models/:deviceModelId         → destroy
 *
 * Convivencia de prefijos (C-3 del conjunto): todos los segmentos bajo
 * /api/platform/devices son literales (/models, /units), sin riesgo de
 * captura cruzada independientemente del orden de imports.
 *
 * Ref: USRH1787189981870.
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_device_model_controller.index')
    router.get('/:deviceModelId', '#controllers/platform_device_model_controller.show')
    router.post('/', '#controllers/platform_device_model_controller.store')
    router.patch('/:deviceModelId', '#controllers/platform_device_model_controller.update')
    router.put(
      '/:deviceModelId/status',
      '#controllers/platform_device_model_controller.changeStatus'
    )
    router.delete('/:deviceModelId', '#controllers/platform_device_model_controller.destroy')
  })
  .prefix('/api/platform/devices/models')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
