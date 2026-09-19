import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS } from '#constants/assessment_templates_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/assessment_template_controller.index')
      .use(middleware.permissionGate(ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.indexAssessmentTemplates))
    router
      .post('/', '#controllers/assessment_template_controller.store')
      .use(middleware.permissionGate(ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.storeAssessmentTemplate))
    router
      .get('/:assessmentTemplateId', '#controllers/assessment_template_controller.show')
      .use(middleware.permissionGate(ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.showAssessmentTemplate))
    router
      .put('/:assessmentTemplateId', '#controllers/assessment_template_controller.update')
      .use(middleware.permissionGate(ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.updateAssessmentTemplate))
    // Sin gate: el controller verifica `toggle-status` con RoleService.hasAccess.
    router.patch(
      '/:assessmentTemplateId/status',
      '#controllers/assessment_template_controller.toggleStatus'
    )
    router
      .patch(
        '/:assessmentTemplateId/dimensions/reorder',
        '#controllers/assessment_template_controller.reorderDimensions'
      )
      .use(
        middleware.permissionGate(
          ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.reorderAssessmentTemplateDimensions
        )
      )
    router
      .delete('/:assessmentTemplateId', '#controllers/assessment_template_controller.delete')
      .use(middleware.permissionGate(ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.deleteAssessmentTemplate))
  })
  .prefix('/api/assessment-templates')
  .use(middleware.auth())
