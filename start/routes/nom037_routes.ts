import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/nom037/telework-policy',
      '#modules/telework-policy/telework_policy.controller.getPolicy'
    )
    router.get(
      '/nom037/telework-policy/template',
      '#modules/telework-policy/telework_policy.controller.getTemplate'
    )
    router.post(
      '/nom037/telework-policy/initialize',
      '#modules/telework-policy/telework_policy.controller.initialize'
    )
    router.put(
      '/nom037/telework-policy',
      '#modules/telework-policy/telework_policy.controller.updateDraft'
    )
    router.delete(
      '/nom037/telework-policy/draft',
      '#modules/telework-policy/telework_policy.controller.discardDraft'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
