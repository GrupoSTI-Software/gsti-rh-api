import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/employee_evaluation_controller.index')
    router.post('/', '#controllers/employee_evaluation_controller.store')
    router.put('/:id', '#controllers/employee_evaluation_controller.update')
    router.delete('/:id', '#controllers/employee_evaluation_controller.destroy')
    router.get('/:id', '#controllers/employee_evaluation_controller.show')
  })
  .prefix('/api/employee-evaluations')
  .use(middleware.auth())
