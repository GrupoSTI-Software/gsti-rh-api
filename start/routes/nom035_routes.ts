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
    router.get(
      '/nom035/attention-program-catalog',
      '#controllers/attention_program_controller.catalog'
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

    router
      .group(() => {
        router.get('/', '#controllers/attention_program_controller.index')
        router.post('/', '#controllers/attention_program_controller.store')
        router.get('/:id/actions', '#controllers/attention_program_action_controller.index')
        router.post('/:id/actions', '#controllers/attention_program_action_controller.store')
        router.patch('/:id/actions/:actionId', '#controllers/attention_program_action_controller.update')
        router.delete(
          '/:id/actions/:actionId',
          '#controllers/attention_program_action_controller.destroy'
        )
        router.get('/:id', '#controllers/attention_program_controller.show')
        router.patch('/:id', '#controllers/attention_program_controller.update')
      })
      .prefix('/nom035/attention-programs')
      .use(middleware.businessScopeOptional())

    router
      .group(() => {
        router.get('/', '#controllers/retention_policy_controller.show')
        router.put('/', '#controllers/retention_policy_controller.upsert')
      })
      .prefix('/nom035/retention-policy')
      .use(middleware.businessScope())

    router
      .group(() => {
        router.post('/:applicationId', '#controllers/questionnaire_tabulation_controller.tabulate')
        router.get('/:applicationId', '#controllers/questionnaire_tabulation_controller.show')
        router.get(
          '/:applicationId/employees',
          '#controllers/questionnaire_tabulation_controller.employees'
        )
      })
      .prefix('/nom035/questionnaire-tabulation')
      .use(middleware.businessScope())
  })
  .prefix('/api')
  .use(middleware.auth())
