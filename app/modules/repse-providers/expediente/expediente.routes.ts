import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Expediente documental del proveedor REPSE (USRH1784259105702).
 * Subida, consulta, descarga y baja lógica con retención normativa de 5 años.
 */
router
  .group(() => {
    router.get(
      '/:providerId/expediente',
      '#modules/repse-providers/expediente/expediente.controller.index'
    )
    router.post(
      '/:providerId/expediente',
      '#modules/repse-providers/expediente/expediente.controller.store'
    )
    router.get(
      '/:providerId/expediente/:docId/download',
      '#modules/repse-providers/expediente/expediente.controller.download'
    )
    router.delete(
      '/:providerId/expediente/:docId',
      '#modules/repse-providers/expediente/expediente.controller.destroy'
    )
  })
  .prefix('/api/repse-providers')
  .use(middleware.auth())
  .use(middleware.businessScope())
