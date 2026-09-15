import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ZONES_PERMISSION_DECLARATIONS } from '#constants/zones_permission_declarations'

router
  .group(() => {
    // Sin gate: el select de zonas al asignar zona a un colaborador (Empleados)
    // consume este listado. Pedir zones:read lo rompería.
    router.get('/', '#controllers/zone_controller.index')
    router
      .post('/', '#controllers/zone_controller.store')
      .use(middleware.permissionGate(ZONES_PERMISSION_DECLARATIONS.storeZone))
    router
      .get('/:zoneId', '#controllers/zone_controller.show')
      .use(middleware.permissionGate(ZONES_PERMISSION_DECLARATIONS.showZone))
    router
      .put('/:zoneId', '#controllers/zone_controller.update')
      .use(middleware.permissionGate(ZONES_PERMISSION_DECLARATIONS.updateZone))
    router
      .delete('/:zoneId', '#controllers/zone_controller.delete')
      .use(middleware.permissionGate(ZONES_PERMISSION_DECLARATIONS.deleteZone))
    router
      .put('/:zoneId/thumbnail', '#controllers/zone_controller.uploadThumbnail')
      .use(middleware.permissionGate(ZONES_PERMISSION_DECLARATIONS.uploadZoneThumbnail))
  })
  .prefix('/api/zones')
  .use(middleware.auth())
