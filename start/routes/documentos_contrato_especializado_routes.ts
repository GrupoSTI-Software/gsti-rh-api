import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

router
  .group(() => {
    router.get(
      '/contratos-servicios-especializados/:contratoId/documentos/vigente/descarga',
      '#controllers/documentos_contrato_especializado_controller.downloadVigente'
    )
    router.put(
      '/contratos-servicios-especializados/:contratoId/documentos/vigente',
      '#controllers/documentos_contrato_especializado_controller.replaceVigente'
    )
    router.get(
      '/contratos-servicios-especializados/:contratoId/documentos',
      '#controllers/documentos_contrato_especializado_controller.index'
    )
    router.post(
      '/contratos-servicios-especializados/:contratoId/documentos',
      '#controllers/documentos_contrato_especializado_controller.store'
    )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
