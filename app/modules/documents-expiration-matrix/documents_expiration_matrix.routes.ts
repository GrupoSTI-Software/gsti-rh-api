import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS } from '#constants/documents_expiration_matrix_permission_declarations'

/**
 * Matriz de vencimientos agregada. La ruta exige `documents-expiration-matrix:read`;
 * el permiso de cada fuente lo evalúa el módulo (una fuente sin permiso no aporta
 * items y su archivo responde 403).
 */
router
  .group(() => {
    router
      .get('/', '#modules/documents-expiration-matrix/documents_expiration_matrix.controller.index')
      .use(
        middleware.permissionGate(DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS.getExpirationMatrix)
      )
    router
      .get(
        '/items/:key/file',
        '#modules/documents-expiration-matrix/documents_expiration_matrix.controller.file'
      )
      .use(
        middleware.permissionGate(
          DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS.downloadExpirationMatrixItemFile
        )
      )
  })
  .prefix('/api/documents-expiration-matrix')
  .use(middleware.auth())
  .use(middleware.businessScope())
