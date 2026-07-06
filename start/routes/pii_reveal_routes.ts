import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/:model/:column/:recordId', '#controllers/pii_reveal_controller.reveal')
  })
  .prefix('/api/v1/pii/reveal')
  .use(middleware.auth())
  .use(middleware.businessScopeOptional())

router
  .group(() => {
    router.get('/', '#controllers/pii_access_log_controller.index')
  })
  .prefix('/api/v1/pii/access-logs')
  .use(middleware.auth())
  .use(middleware.businessScopeOptional())
