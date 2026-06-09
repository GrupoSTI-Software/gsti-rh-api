import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post(
      '/contratos-servicios-especializados/:contratoId/renovaciones',
      '#controllers/version_contrato_especializado_controller.renew'
    )
    router.post(
      '/contratos-servicios-especializados/:contratoId/addendums',
      '#controllers/version_contrato_especializado_controller.addendum'
    )
    router.get(
      '/contratos-servicios-especializados/:contratoId/versiones',
      '#controllers/version_contrato_especializado_controller.index'
    )
    router.get(
      '/contratos-servicios-especializados/:contratoId/versiones/:numeroVersion',
      '#controllers/version_contrato_especializado_controller.show'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
