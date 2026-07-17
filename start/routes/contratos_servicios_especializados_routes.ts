import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/contratos-servicios-especializados',
      '#controllers/contratos_servicios_especializados_controller.index'
    )
    router.get(
      '/contratos-servicios-especializados/:id',
      '#controllers/contratos_servicios_especializados_controller.show'
    )
    router.post(
      '/contratos-servicios-especializados',
      '#controllers/contratos_servicios_especializados_controller.store'
    )
    router.patch(
      '/contratos-servicios-especializados/:id',
      '#controllers/contratos_servicios_especializados_controller.update'
    )
    router.delete(
      '/contratos-servicios-especializados/:id',
      '#controllers/contratos_servicios_especializados_controller.destroy'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
