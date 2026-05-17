import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/certification-categories', '#controllers/certifications_controller.indexCategories')
    router.get('/certifications', '#controllers/certifications_controller.index')
    router.post('/certifications', '#controllers/certifications_controller.store')
    router.put('/certifications/:id', '#controllers/certifications_controller.update')
    router.delete('/certifications/:id', '#controllers/certifications_controller.destroy')
  })
  .prefix('/api')
  .use(middleware.auth())
