import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/position_level_controller.index')
    router.post('/', '#controllers/position_level_controller.store')
    // /reorder ANTES de cualquier ruta con parámetro (spec §10)
    router.patch('/reorder', '#controllers/position_level_controller.reorder')
    router.get('/:positionLevelId', '#controllers/position_level_controller.show')
    router.put('/:positionLevelId', '#controllers/position_level_controller.update')
    router.patch('/:positionLevelId/active', '#controllers/position_level_controller.setActive')
    router.delete('/:positionLevelId', '#controllers/position_level_controller.delete')
  })
  .prefix('/api/position-levels')
  .use(middleware.auth())
  .use(middleware.businessScope())
