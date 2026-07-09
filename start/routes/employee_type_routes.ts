import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_type_controller.index')
  })
  .prefix('/api/employee-types')
  .use(middleware.auth())
  .use(middleware.businessScope())
