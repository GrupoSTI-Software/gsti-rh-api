import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Catálogo de proveedores REPSE del contratante (USRH1784259105646).
 * RBAC granular vía `assertComplianceRepsePermission` en el controller.
 */
router
  .group(() => {
    router.get('/', '#modules/repse-providers/providers/providers.controller.index')
    router.get('/:id', '#modules/repse-providers/providers/providers.controller.show')
    router.post('/', '#modules/repse-providers/providers/providers.controller.store')
    router.put('/:id', '#modules/repse-providers/providers/providers.controller.update')
    router.delete('/:id', '#modules/repse-providers/providers/providers.controller.destroy')
  })
  .prefix('/api/repse-providers')
  .use(middleware.auth())
  .use(middleware.businessScope())
