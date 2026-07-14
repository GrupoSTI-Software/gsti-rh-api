import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.post(
      '/contratos-servicios-especializados/:contratoId/asignaciones',
      '#controllers/asignaciones_contrato_especializado_controller.store'
    )
    router.get(
      '/contratos-servicios-especializados/:contratoId/asignaciones',
      '#controllers/asignaciones_contrato_especializado_controller.index'
    )
    router.patch(
      '/contratos-servicios-especializados/:contratoId/asignaciones/:id',
      '#controllers/asignaciones_contrato_especializado_controller.update'
    )
    router.delete(
      '/contratos-servicios-especializados/:contratoId/asignaciones/:id',
      '#controllers/asignaciones_contrato_especializado_controller.destroy'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
