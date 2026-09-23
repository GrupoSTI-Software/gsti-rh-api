import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION } from '#constants/employees_read_permission_declarations'

// USRH1785766406726/USRH1787433076995 — regla C-13: `/api/persons` es superficie compartida
// (colaborador y usuario del sistema; los destinos de aviación, incluido cliente, se
// retiraron y resuelven a colaborador). `GET /` exige `tab-persona-read` mediante
// gate declarativo, porque el listado siempre corresponde al módulo Empleados. `POST /`
// exige `tab-persona-write` solo cuando el destino resuelve a colaborador; ese chequeo
// es condicional y vive en `person_controller.store` (no se monta gate aquí). `PUT`/`DELETE`
// conservan evaluación por vínculo resuelto con PermissionGateService, vía
// `personIsCollaborator` + `ensureSecondaryPermission` en `person_controller.update`
// y `person_controller.delete`. NO montar aquí un permiso "ordinario" en `POST`/`PUT`/`DELETE`
// (p. ej. `update-information`): rompería la edición de clientes.
//
// USRH1789698261609 — los tres grupos montan `businessScope()`: la pertenencia del
// expediente va por `people.business_unit_id` y sin scope cualquier inquilino
// listaba, leía, editaba y borraba expedientes de los demás. En `/api/persons` va
// ANTES que `sensitiveAccess()`: los dos abren el contexto de lectura sensible y al
// serializar gana el del primero montado; `businessScope` aplica antes el rol
// efectivo de la empresa. Solo scope: sin `permissionGate` de grupo (ése es de
// "Cerrar las consecuencias del cambio de credencial"). `/api/persons-get-places-of-birth`
// no es un catálogo aunque lo parezca: `PersonService.getPlacesOfBirth` consulta
// `Person.query()` con `distinct` y `withTrashed()` y sin scope agregaba los lugares
// de nacimiento de todos los inquilinos. NO meter comentarios entre los `.use()`:
// el censo de `sensitive_access_context_mounts.spec.ts` corta la cadena ahí.
router
  .group(() => {
    router
      .get('/', '#controllers/person_controller.index')
      .use(middleware.permissionGate(EMPLOYEES_PERSON_COLLABORATOR_READ_PERMISSION))
    router.post('/', '#controllers/person_controller.store')
    router.put('/:personId', '#controllers/person_controller.update')
    router.delete('/:personId', '#controllers/person_controller.delete')
    router.get('/:personId', '#controllers/person_controller.show')
  })
  .prefix('/api/persons')
  .use(middleware.auth())
  .use(middleware.businessScope())
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
  .use(middleware.businessScope())
