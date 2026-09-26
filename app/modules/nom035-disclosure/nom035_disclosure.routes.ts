import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/results', '#modules/nom035-disclosure/nom035_disclosure.controller.show')
  })
  .prefix('/api/nom035/disclosure')
  .use(middleware.auth())
  .use(middleware.businessScope())
