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

    router
      .group(() => {
        router.get('/', '#controllers/questionnaire_application_controller.index')
        router.post('/', '#controllers/questionnaire_application_controller.store')
        router.get('/:id', '#controllers/questionnaire_application_controller.show')
        router.get('/:id/targets', '#controllers/questionnaire_application_controller.targets')
        router.patch('/:id/close', '#controllers/questionnaire_application_controller.close')
        router.get('/:id/history', '#controllers/questionnaire_application_controller.history')
        router.delete('/:id', '#controllers/questionnaire_application_controller.destroy')
        router.get(
          '/:id/targets/:employeeId/instrument',
          '#controllers/questionnaire_application_response_controller.instrument'
        )
        router.post(
          '/:id/targets/:employeeId/answers',
          '#controllers/questionnaire_application_response_controller.store'
        )
        router.put(
          '/:id/targets/:employeeId/draft',
          '#controllers/questionnaire_application_response_controller.draft'
        )
        router.get(
          '/:id/targets/:employeeId/response',
          '#controllers/questionnaire_application_response_controller.show'
        )
      })
      .prefix('/nom035/questionnaire-applications')
      .use(middleware.businessScopeOptional())
  })
  .prefix('/api')
  .use(middleware.auth())
