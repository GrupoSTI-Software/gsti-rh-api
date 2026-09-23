import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS } from '#constants/assessment_templates_permission_declarations'

router
  .group(() => {
    // Sin gate: lo lee el formulario de assessments del empleado (módulo Empleados).
    router.get('/', '#controllers/position_assessment_profile_controller.index')
    router
      .post('/', '#controllers/position_assessment_profile_controller.store')
      .use(
        middleware.permissionGate(
          ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.storePositionAssessmentProfile
        )
      )
    router
      .get(
        '/:positionAssessmentProfileId',
        '#controllers/position_assessment_profile_controller.show'
      )
      .use(
        middleware.permissionGate(
          ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.showPositionAssessmentProfile
        )
      )
    router
      .put(
        '/:positionAssessmentProfileId',
        '#controllers/position_assessment_profile_controller.update'
      )
      .use(
        middleware.permissionGate(
          ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.updatePositionAssessmentProfile
        )
      )
    router
      .delete(
        '/:positionAssessmentProfileId',
        '#controllers/position_assessment_profile_controller.delete'
      )
      .use(
        middleware.permissionGate(
          ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS.deletePositionAssessmentProfile
        )
      )
  })
  .prefix('/api/position-assessment-profiles')
  .use(middleware.auth())
  .use(middleware.businessScope())
