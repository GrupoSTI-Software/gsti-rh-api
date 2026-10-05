import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'

router
  .group(() => {
    router
      .get('/', '#controllers/exception_requests_controller.index')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexExceptionRequests))
    router
      .get('/all', '#controllers/exception_requests_controller.indexAllExceptionRequests')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexAllExceptionRequests))
    router.get('/my-requests', '#controllers/exception_requests_controller.getMyExceptionRequests')
    // Mismo dato y mismo permiso que `/all`; ningún cliente lo consume hoy.
    router
      .get('/unread', '#controllers/exception_requests_controller.getUnreadExceptionRequests')
      .use(
        middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexUnreadExceptionRequests)
      )
    // D-08: alta exenta — entrada compartida con la app del colaborador.
    router.post('/', '#controllers/exception_requests_controller.store')
    router
      .put('/:id', '#controllers/exception_requests_controller.update')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateExceptionRequest))
    router
      .delete('/:id', '#controllers/exception_requests_controller.destroy')
      .use(middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.deleteExceptionRequest))
    router.get('/:id', '#controllers/exception_requests_controller.show')
    router
      .post('/:id/status', '#controllers/exception_requests_controller.updateStatus')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateExceptionRequestStatus)
      )
    // Resolver en lote es la misma facultad ejercida N veces: mismo permiso que
    // la resolución individual, no uno nuevo.
    // Señales de apoyo: se leen con el mismo permiso con el que se consulta la
    // solicitud, porque son un detalle más de ella.
    router
      .get('/:id/decision-context', '#controllers/exception_requests_controller.decisionContext')
      .use(middleware.permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexAllExceptionRequests))
    // Adjuntos: entrada compartida, como el alta. Con la facultad del módulo se
    // ve y se sube todo lo que cuelga de la solicitud —leer va con el permiso
    // de lectura y subir con el de resolución, porque el comprobante es parte
    // de resolver—; sin ella solo se llega a la solicitud propia y solo a lo
    // que uno mismo subió. El gate no puede vivir en la ruta porque cerraría la
    // segunda puerta; se evalúa dentro, en `resolveAttachmentScope`.
    router.get('/:id/attachments', '#controllers/exception_requests_controller.indexAttachments')
    router.get(
      '/:id/attachments/:attachmentId',
      '#controllers/exception_requests_controller.showAttachment'
    )
    router.post('/:id/attachments', '#controllers/exception_requests_controller.storeAttachment')
    router
      .post('/resolve-batch', '#controllers/exception_requests_controller.resolveBatch')
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateExceptionRequestStatus)
      )
  })
  .prefix('/api/exception-requests')
  .use(middleware.auth())
  /**
   * `ExceptionRequest` no compone el mixin y su tabla no tiene marca de empresa:
   * la pertenencia va por el empleado. El contexto que abre este middleware es
   * lo que permite acotar por empleado en el controlador; sin él, el listado
   * devolvía las solicitudes de todas las empresas.
   */
  .use(middleware.businessScope())
  .use(middleware.sensitiveAccess())
