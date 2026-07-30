import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post('/', '#controllers/position_approval_history_controller.store')
    router.get('/last/:positionId', '#controllers/position_approval_history_controller.getLast')
  })
  .prefix('/api/position-approval-histories')
  .use(middleware.auth())
  .use(middleware.businessScope())
