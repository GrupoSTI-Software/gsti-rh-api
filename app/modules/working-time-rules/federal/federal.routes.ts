import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

/**
 * Rutas del submódulo de catálogo federal de jornada (solo lectura).
 *
 * Requiere autenticación; el scope de unidad de negocio es opcional porque el
 * catálogo federal es global (no pertenece a ningún tenant). Si el header
 * X-Business-Unit-Id viene presente, el middleware lo valida igual que el resto
 * del módulo (400 BU.VAL.001 si es inválido).
 */
router
  .group(() => {
    router.get('/', '#modules/working-time-rules/federal/federal.controller.index')
  })
  .prefix('/api/v1/working-time-rules/federal')
  .use(middleware.auth())
  .use(middleware.businessScopeOptional())
