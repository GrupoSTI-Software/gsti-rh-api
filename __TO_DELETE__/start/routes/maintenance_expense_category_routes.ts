import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/maintenance_expense_category_controller.index')
  })
  .prefix('/api/maintenance-expense-categories')
  .use(middleware.auth())
