import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas de contrato USRH1789600808831 (N9 caso 8, N14 caso 5).
 * Solo se importa cuando `NODE_ENV === 'test'`.
 */
router
  .group(() => {
    router.get(
      '/employees-unscoped-list',
      '#controllers/test_tenant_scope_probe_controller.listEmployeesWithoutBusinessScope'
    )
    router.get(
      '/http-request-marker',
      '#controllers/test_tenant_scope_probe_controller.httpRequestMarkerFlag'
    )
  })
  .prefix('/api/__test__/tenant-scope-closed-default')
  .use(middleware.auth())
