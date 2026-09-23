import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS } from '#constants/assessment_templates_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/assessment_template_dimension_controller.index')
      .use(
        middleware.permissionGate(
          ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.indexAssessmentTemplateDimensions
        )
      )
    router
      .post('/', '#controllers/assessment_template_dimension_controller.store')
      .use(
        middleware.permissionGate(
          ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.storeAssessmentTemplateDimension
        )
      )
    router
      .get(
        '/:assessmentTemplateDimensionId',
        '#controllers/assessment_template_dimension_controller.show'
      )
      .use(
        middleware.permissionGate(
          ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.showAssessmentTemplateDimension
        )
      )
    router
      .put(
        '/:assessmentTemplateDimensionId',
        '#controllers/assessment_template_dimension_controller.update'
      )
      .use(
        middleware.permissionGate(
          ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.updateAssessmentTemplateDimension
        )
      )
    router
      .delete(
        '/:assessmentTemplateDimensionId',
        '#controllers/assessment_template_dimension_controller.delete'
      )
      .use(
        middleware.permissionGate(
          ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.deleteAssessmentTemplateDimension
        )
      )
  })
  .prefix('/api/assessment-template-dimensions')
  .use(middleware.auth())
