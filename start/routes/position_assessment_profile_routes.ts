import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get('/', '#controllers/position_assessment_profile_controller.index')
    router.post('/', '#controllers/position_assessment_profile_controller.store')
    router.get(
      '/:positionAssessmentProfileId',
      '#controllers/position_assessment_profile_controller.show'
    )
    router.put(
      '/:positionAssessmentProfileId',
      '#controllers/position_assessment_profile_controller.update'
    )
    router.delete(
      '/:positionAssessmentProfileId',
      '#controllers/position_assessment_profile_controller.delete'
    )
  })
  .prefix('/api/position-assessment-profiles')
  .use(middleware.auth())
  .use(middleware.businessScope())
