import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/zone_controller.index')
    router.post('/', '#controllers/zone_controller.store')
    router.get('/:zoneId', '#controllers/zone_controller.show')
    router.put('/:zoneId', '#controllers/zone_controller.update')
    router.delete('/:zoneId', '#controllers/zone_controller.delete')
    router.put('/:zoneId/thumbnail', '#controllers/zone_controller.uploadThumbnail')
  })
  .prefix('/api/zones')
  .use(middleware.auth())


