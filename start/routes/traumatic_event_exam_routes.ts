import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/traumatic-event-reports/:reportId/exams',
      '#controllers/traumatic_event_exam_controller.index'
    )
    router.post(
      '/traumatic-event-reports/:reportId/exams',
      '#controllers/traumatic_event_exam_controller.store'
    )
    router.put(
      '/traumatic-event-reports/:reportId/exams/:examId',
      '#controllers/traumatic_event_exam_controller.update'
    )
    router.delete(
      '/traumatic-event-reports/:reportId/exams/:examId',
      '#controllers/traumatic_event_exam_controller.destroy'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
