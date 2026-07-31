import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/subscription/me', '#controllers/billing_tenant_controller.mySubscription')
  })
  .prefix('/api/billing')
  .use(middleware.auth())
  .use(middleware.businessScope())
