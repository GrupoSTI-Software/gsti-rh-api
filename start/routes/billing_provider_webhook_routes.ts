import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.post('/stripe', '#controllers/billing_provider_webhook_controller.stripe')
  })
  .prefix('/api/webhooks')
