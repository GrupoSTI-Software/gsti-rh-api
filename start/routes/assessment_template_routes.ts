import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/assessment_template_controller.index')
    router.post('/', '#controllers/assessment_template_controller.store')
    router.get('/:assessmentTemplateId', '#controllers/assessment_template_controller.show')
    router.put('/:assessmentTemplateId', '#controllers/assessment_template_controller.update')
    router.patch(
      '/:assessmentTemplateId/status',
      '#controllers/assessment_template_controller.toggleStatus'
    )
    router.delete('/:assessmentTemplateId', '#controllers/assessment_template_controller.delete')
  })
  .prefix('/api/assessment-templates')
  .use(middleware.auth())
