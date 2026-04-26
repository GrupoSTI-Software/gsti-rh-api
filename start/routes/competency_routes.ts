import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/competency_controller.index')
    router.post('/', '#controllers/competency_controller.store')
    router.get('/:competencyId', '#controllers/competency_controller.show')
    router.put('/:competencyId', '#controllers/competency_controller.update')
    router.delete('/:competencyId', '#controllers/competency_controller.delete')
  })
  .prefix('/api/competencies')
  .use(middleware.auth())
