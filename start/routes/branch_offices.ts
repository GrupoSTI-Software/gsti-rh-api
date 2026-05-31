import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/branch-offices', '#controllers/branch_offices_controller.store')
    router.get('/branch-offices', '#controllers/branch_offices_controller.index')
    router.get('/branch-offices/:id', '#controllers/branch_offices_controller.show')
    router.put('/branch-offices/:id', '#controllers/branch_offices_controller.update')
    router.delete('/branch-offices/:id', '#controllers/branch_offices_controller.destroy')
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
