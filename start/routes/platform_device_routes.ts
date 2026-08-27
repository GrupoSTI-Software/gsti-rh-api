import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de plataforma para el catálogo de modelos de dispositivo biométrico.
 * Espeja el patrón de `platform_system_module_routes.ts`.
 *
 * Todas protegidas por `auth` + `platformAdmin` — globales, sin scope de tenant.
 * Prefijo: /api/platform/device-models
 *
 *   GET    /api/platform/device-models                        → index (listar)
 *   GET    /api/platform/device-models/:deviceModelId         → show (detalle)
 *   POST   /api/platform/device-models                        → store (crear)
 *   PATCH  /api/platform/device-models/:deviceModelId         → update (editar brand/name)
 *   PUT    /api/platform/device-models/:deviceModelId/status  → changeStatus
 *   DELETE /api/platform/device-models/:deviceModelId         → destroy (baja lógica)
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
  .prefix('/api/platform/device-models')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
