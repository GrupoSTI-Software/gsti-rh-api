import router from '@adonisjs/core/services/router'
import limiter from '@adonisjs/limiter/services/main'
import { middleware } from '#start/kernel'

/**
 * Alta de empresa adicional (USRH1787932877001).
 * Cuota por IP: la ruta crea empresas + suscripciones (escritura comprometida con dinero).
 * 5 altas/min por IP es holgado para cualquier caso real y suficiente para frenar
 * la creación masiva automatizada desde la misma red.
 */
const additionalBusinessUnitCreateRateLimit = limiter.define(
  'additional-business-unit-create',
  (ctx) => {
    const ip = ctx.request.ip()
    return limiter.allowRequests(5).every('1 minute').usingKey(`bu-create:${ip}`)
  }
)

router
  .group(() => {
    router.get('/', '#controllers/business_unit_controller.index')
    router.post('/', '#controllers/business_unit_controller.store').use(
      additionalBusinessUnitCreateRateLimit
    )
  })
  .prefix('/api/business-units')
  .use(middleware.auth())
  .use(middleware.businessScopeOptional())
