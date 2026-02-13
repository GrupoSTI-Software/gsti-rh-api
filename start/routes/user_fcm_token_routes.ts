import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/user_fcm_token_controller.registerOrUpdate')
  })
  .prefix('/api/user-fcm-tokens')
  .use(middleware.auth())
