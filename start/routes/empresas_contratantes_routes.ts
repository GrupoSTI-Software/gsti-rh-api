import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/empresas-contratantes',
      '#controllers/empresas_contratantes_controller.index'
    )
    router.get(
      '/empresas-contratantes/:id',
      '#controllers/empresas_contratantes_controller.show'
    )
    router.post(
      '/empresas-contratantes',
      '#controllers/empresas_contratantes_controller.store'
    )
    router.patch(
      '/empresas-contratantes/:id',
      '#controllers/empresas_contratantes_controller.update'
    )
    router.delete(
      '/empresas-contratantes/:id',
      '#controllers/empresas_contratantes_controller.destroy'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
