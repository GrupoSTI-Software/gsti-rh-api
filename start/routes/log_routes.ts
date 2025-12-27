import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.post('/request', '#controllers/mongo-db/log_controller.store')
    router.post('/', '#controllers/mongo-db/log_controller.index')
    router.get(
      '/exceptions/vacations-disabilities',
      '#controllers/mongo-db/log_controller.getExceptionsVacationsDisabilities'
    )
    router.get('/:entity', '#controllers/mongo-db/log_controller.show')
  })
  .prefix('/api/logs')
  .use(middleware.auth())
