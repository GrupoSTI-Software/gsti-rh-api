import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/assessment_template_dimension_controller.index')
    router.post('/', '#controllers/assessment_template_dimension_controller.store')
    router.get(
      '/:assessmentTemplateDimensionId',
      '#controllers/assessment_template_dimension_controller.show'
    )
    router.put(
      '/:assessmentTemplateDimensionId',
      '#controllers/assessment_template_dimension_controller.update'
    )
    router.delete(
      '/:assessmentTemplateDimensionId',
      '#controllers/assessment_template_dimension_controller.delete'
    )
  })
  .prefix('/api/assessment-template-dimensions')
  .use(middleware.auth())
