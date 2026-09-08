import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de asignaciones de aparatos biométricos a empresas cliente.
 *
 * Prefijo: /api/platform/devices/assignments  (§11 del spec USRH1787189981876)
 * Sin `businessScope` — respondería 400 BU.VAL.000 (business_unit_scope_middleware:63-66).
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

/**
 * Cierre de entrega (USRH1787189981881 · §9-10 del spec).
 *
 * Vive bajo /api/platform/devices/units — mismo prefijo paramétrico que ya
 * usa `platform_device_unit_routes.ts` para `:platformDeviceId/retirement`
 * (decisión A del ticket: la URL sigue "es una acción sobre la unidad", el
 * controlador y el servicio siguen siendo los de asignaciones, porque la
 * lógica de negocio — cerrar la entrega vigente — vive ahí, no en
 * `PlatformDeviceService`). Grupo separado porque el controlador es distinto.
 *
 *   POST /api/platform/devices/units/:platformDeviceId/unassign → unassign
 */
router
  .group(() => {
    router.post(
      '/:platformDeviceId/unassign',
      '#controllers/platform_device_assignment_controller.unassign'
    )
  })
  .prefix('/api/platform/devices/units')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
