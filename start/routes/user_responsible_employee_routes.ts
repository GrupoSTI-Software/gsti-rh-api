import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/user_responsible_employee_controller.store')
    router.put('/:userResponsibleEmployeeId', '#controllers/user_responsible_employee_controller.update')
    router.get('/:userResponsibleEmployeeId', '#controllers/user_responsible_employee_controller.show')
    router.delete(
      '/:userResponsibleEmployeeId',
      '#controllers/user_responsible_employee_controller.delete'
    )
  })
  .prefix('/api/user-responsible-employees')
  .use(middleware.auth())
  .use(middleware.businessScope())
