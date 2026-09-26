import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * Rutas internas de la consola landlord de GSTI.
 * Todas están protegidas por `auth` + `platformAdmin`; ninguna usa `businessScope`
 * (las operaciones de plataforma son globales, sin scope de tenant).
 *
 * Prefijo: /api/platform
 */
router
  .group(() => {
    /** Smoke endpoint — verifica guard y devuelve identidad del administrador. */
    router.get('/whoami', '#controllers/platform_user_controller.whoami')

    /** Alta de usuario interno de plataforma (Person mínima + User con marcador). */
    router.post('/users', '#controllers/platform_user_controller.store')
  })
  .prefix('/api/platform')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
