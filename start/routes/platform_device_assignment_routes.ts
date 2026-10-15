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
 * Invitaciones de empresas del grupo al checador de la entrega (VLRH-P0065, 5).
 * Solo el landlord otorga y revoca (D3):
 *   GET    /api/platform/devices/assignments/:assignmentId/shares          → historial + candidatas
 *   POST   /api/platform/devices/assignments/:assignmentId/shares          → otorgar
 *   DELETE /api/platform/devices/assignments/:assignmentId/shares/:shareId → revocar
 *
 * Ref: USRH1787189981876, VLRH-H1792078645307.
 */
router
  .group(() => {
    router.post('/', '#controllers/platform_device_assignment_controller.store')
    router.get('/', '#controllers/platform_device_assignment_controller.index')
    router
      .get(
        '/:assignmentId/shares',
        '#modules/access-point/sharing/access_point_share.controller.index'
      )
      .where('assignmentId', router.matchers.number())
    router
      .post(
        '/:assignmentId/shares',
        '#modules/access-point/sharing/access_point_share.controller.store'
      )
      .where('assignmentId', router.matchers.number())
    router
      .delete(
        '/:assignmentId/shares/:shareId',
        '#modules/access-point/sharing/access_point_share.controller.destroy'
      )
      .where('assignmentId', router.matchers.number())
      .where('shareId', router.matchers.number())
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
    router
      .post(
        '/:platformDeviceId/unassign',
        '#controllers/platform_device_assignment_controller.unassign'
      )
      .where('platformDeviceId', router.matchers.number())
  })
  .prefix('/api/platform/devices/units')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
