import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/maintenance_expense_controller.index')
    router.post('/', '#controllers/maintenance_expense_controller.store')
    router.put('/:id', '#controllers/maintenance_expense_controller.update')
    router.delete('/:id', '#controllers/maintenance_expense_controller.destroy')
    router.get('/:id', '#controllers/maintenance_expense_controller.show')
  })
  .prefix('/api/maintenance-expenses')
  .use(middleware.auth())
