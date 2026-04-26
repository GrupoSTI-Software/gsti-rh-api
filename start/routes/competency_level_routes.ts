import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/competency_level_controller.index')
    router.get('/:competencyLevelId', '#controllers/competency_level_controller.show')
  })
  .prefix('/api/competency-levels')
  .use(middleware.auth())
