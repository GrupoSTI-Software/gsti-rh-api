import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/traumatic_event_type_controller.index')
  })
  .prefix('/api/traumatic-event-types')
  .use(middleware.auth())
