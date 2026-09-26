import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { SYSTEM_SETTINGS_PERMISSION_DECLARATIONS } from '#constants/system_settings_permission_declarations'

/**
 * El módulo `proceeding-file-types` está retirado: su pantalla propia ya no
 * existe y no tiene permisos. Las carpetas se administran desde el expediente
 * del COLABORADOR y desde el de la EMPRESA, así que cada operación la gobierna
 * el módulo de la pantalla que la dispara, no un módulo sin dueño.
 *
 * Las dos altas tienen un solo contexto cada una y llevan gate de ruta. La
 * edición y la baja sirven a los dos con la misma ruta —el mismo formulario
 * llama al mismo PUT— y las decide el controller según el área del tipo, con
 * `ensureSecondaryPermission`.
 */
router
  .group(() => {
    router.get('/by-area/:areaToUse', '#controllers/proceeding_file_type_controller.indexByArea')
    router.get('/', '#controllers/proceeding_file_type_controller.index')
    router.post('/', '#controllers/proceeding_file_type_controller.store')
    router
      .post(
        '/create-employee-type',
        '#controllers/proceeding_file_type_controller.createEmployeeType'
      )
      .use(
        middleware.permissionGate(
          EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.createEmployeeProceedingFileType
        )
      )
    router
      .post(
        '/create-system-setting-type',
        '#controllers/proceeding_file_type_controller.createSystemSettingType'
      )
      .use(
        middleware.permissionGate(
          SYSTEM_SETTINGS_PERMISSION_DECLARATIONS.storeSystemSettingProceedingFileType
        )
      )
    router.put('/:proceedingFileTypeId', '#controllers/proceeding_file_type_controller.update')
    router.delete('/:proceedingFileTypeId', '#controllers/proceeding_file_type_controller.delete')
    router.get(
      '/:proceedingFileTypeId/get-legacy-emails',
      '#controllers/proceeding_file_type_controller.getLegacyEmails'
    )
    router.get('/:proceedingFileTypeId', '#controllers/proceeding_file_type_controller.show')
  })
  .prefix('/api/proceeding-file-types')
  .use(middleware.auth())
  .use(middleware.businessScope())
