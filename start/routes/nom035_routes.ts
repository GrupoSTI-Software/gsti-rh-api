import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/nom035/questionnaire-applicability',
      '#controllers/questionnaire_applicability_controller.index'
    )
    router.get(
      '/nom035/questionnaire-applicability/:branchOfficeId',
      '#controllers/questionnaire_applicability_controller.show'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
