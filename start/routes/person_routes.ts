import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

// USRH1785766406726 — regla C-13: `/api/persons` es superficie compartida (colaborador,
// cliente y usuario del sistema). Deliberadamente SIN `.use(middleware.permissionGate(...))`:
// no existe una acción del módulo Empleados que aplique a una persona no-colaborador.
// El control vive en `person_controller.update` y `person_controller.delete`, como assert
// derivado por vínculo resuelto con PermissionGateService. NO montar aquí un permiso
// "ordinario" (p. ej. `update-information`): rompería la edición de clientes.
router
  .group(() => {
    router.get('/', '#controllers/person_controller.index')
    router.post('/', '#controllers/person_controller.store')
    router.put('/:personId', '#controllers/person_controller.update')
    router.delete('/:personId', '#controllers/person_controller.delete')
    router.get('/:personId', '#controllers/person_controller.show')
  })
  .prefix('/api/persons')
  .use(middleware.auth())
  .use(middleware.sensitiveAccess())
  .use(middleware.sensitiveMaskEcho())
router
  .group(() => {
    router.get('/:personId', '#controllers/person_controller.getEmployee')
  })
  .prefix('/api/person-get-employee')
  .use(middleware.auth()).use(middleware.businessScope())
router
  .group(() => {
    router.get('/', '#controllers/person_controller.getPlacesOfBirth')
  })
  .prefix('/api/persons-get-places-of-birth')
  .use(middleware.auth())
