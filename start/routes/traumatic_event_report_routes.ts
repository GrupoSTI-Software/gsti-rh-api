import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/traumatic-event-reports', '#controllers/traumatic_event_report_controller.index')
    router.post('/traumatic-event-reports', '#controllers/traumatic_event_report_controller.store')
    router.get('/traumatic-event-reports/:id', '#controllers/traumatic_event_report_controller.show')
    router.put('/traumatic-event-reports/:id', '#controllers/traumatic_event_report_controller.update')
    router.delete(
      '/traumatic-event-reports/:id',
      '#controllers/traumatic_event_report_controller.destroy'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
