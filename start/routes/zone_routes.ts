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
    // La miniatura se transmite como la foto de perfil: el cliente pide la
    // zona, nunca una ruta de almacenamiento.
    router
      .get('/:zoneId/thumbnail', '#controllers/zone_thumbnail_stream_controller.show')
      .use(middleware.permissionGate(ZONES_PERMISSION_DECLARATIONS.streamZoneThumbnail))
    router
      .put('/:zoneId/thumbnail', '#controllers/zone_controller.uploadThumbnail')
      .use(middleware.permissionGate(ZONES_PERMISSION_DECLARATIONS.uploadZoneThumbnail))
  })
  .prefix('/api/zones')
  .use(middleware.auth())
  // Zonas dejó de ser catálogo compartido: cada empresa ve las suyas. Sin este
  // middleware no hay TenantContext y el mixin de Zone no filtraría nada.
  .use(middleware.businessScope())
