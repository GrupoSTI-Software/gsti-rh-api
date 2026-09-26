import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'

/**
 * Rate-limit de la importación de contratos por Excel (USRH1785509296682):
 * acota el abuso de un procesamiento sin tope de filas (regla 7 de la HU).
 * Keyed por usuario autenticado; precedente `recovery-code-verify-*` en
 * `start/routes/auth_recovery_routes.ts`.
 */
const contratoImportExcelLimit = limiter.define('contrato-servicio-especializado-import-excel', (ctx) => {
  const userId = ctx.auth.user?.userId ?? 'anonimo'
  return limiter.allowRequests(10).every('15 minutes').usingKey(`user:${userId}`)
})

router
  .group(() => {
    router.get(
      '/contratos-servicios-especializados',
      '#controllers/contratos_servicios_especializados_controller.index'
    )
    router.get(
      '/contratos-servicios-especializados/plantilla-importacion',
      '#controllers/contratos_servicios_especializados_controller.downloadImportTemplate'
    )
    router
      .post(
        '/contratos-servicios-especializados/importacion',
        '#controllers/contratos_servicios_especializados_controller.importFromExcel'
      )
      .use(contratoImportExcelLimit)
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
