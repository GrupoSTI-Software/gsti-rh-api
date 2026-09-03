import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de asignaciones de aparatos biométricos a empresas cliente.
 *
 * Prefijo: /api/platform/devices/assignments  (§11 del spec USRH1787189981876)
 * Sin `businessScope` — respondería 400 BU.VAL.000 (business_unit_scope_middleware:63-66).
 *
 * Convivencia de prefijos (C-3): todos los segmentos bajo /api/platform/devices
 * son literales (/models, /units, /assignments). Ninguna ruta paramétrica
 * cuelga de /api/platform/devices; el identificador de unidad viaja en body
 * (POST) y en query (GET).
 *
 *   POST /api/platform/devices/assignments  → store (asignar aparato a tenant)
 *   GET  /api/platform/devices/assignments  → index (listar asignaciones del tenant)
 *
 * Ref: USRH1787189981876.
 */
router
  .group(() => {
    router.post('/', '#controllers/platform_device_assignment_controller.store')
    router.get('/', '#controllers/platform_device_assignment_controller.index')
  })
  .prefix('/api/platform/devices/assignments')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
