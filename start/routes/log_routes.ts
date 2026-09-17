import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

/**
 * Bitácora de navegación del backoffice.
 *
 * Queda una sola ruta a propósito. `GET /:entity` y `POST /` resolvían la
 * colección de MongoDB con el nombre CRUDO que venía en la petición y la leían
 * tal cual: el grupo solo monta `auth()`, así que cualquier sesión autenticada
 * de cualquier empresa podía pedir `log_vacations`, `log_shift_exceptions`,
 * `log_employee_shifts`, `log_zones` o `log_employee_zones` por nombre —
 * `LogFilterSearchInterface` no tiene campo de tenant ni de unidad de negocio,
 * así que no había nada que acotara la lectura—. Ninguna de las dos tenía
 * consumidor: en los seis clientes, la única llamada viva a `/api/logs` es el
 * `POST /logs/request` del backoffice (`LogService.ts`). Se retiraron con su
 * código muerto en lugar de quedarse protegidas.
 */
router
  .group(() => {
    router.post('/request', '#controllers/mongo-db/log_controller.store')
  })
  .prefix('/api/logs')
  .use(middleware.auth())
