import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Bitácora de validaciones periódicas del folio de un proveedor REPSE
 * (USRH1784259105646). Append-only: solo listar y registrar (multipart con
 * evidencia); nunca editar ni borrar.
 */
router
  .group(() => {
    router.get(
      '/:providerId/validations',
      '#modules/repse-providers/validations/validations.controller.index'
    )
    router.post(
      '/:providerId/validations',
      '#modules/repse-providers/validations/validations.controller.store'
    )
    router.get(
      '/:providerId/validations/:validationId/download',
      '#modules/repse-providers/validations/validations.controller.download'
    )
  })
  .prefix('/api/repse-providers')
  .use(middleware.auth())
  .use(middleware.businessScope())
