import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import { SUPPLIES_PERMISSION_DECLARATIONS } from '#constants/supplies_permission_declarations'

/**
 * Activos del backoffice (rediseño). Conviven con las rutas de `/supplies`,
 * `/supply-types` y `/employee-supplies`, que siguen vivas para el BO actual
 * y la Matriz de vencimientos.
 */
router
  .group(() => {
    router
      .get('/assets', '#modules/assets/assets.controller.index')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexAssets))
    // Antes de `/:supplyId` para que "summary" no se lea como identificador.
    router
      .get('/assets/summary', '#modules/assets/assets.controller.summary')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showAssetsSummary))
    router
      .get('/assets/:supplyId', '#modules/assets/assets.controller.show')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showAsset))
    router
      .get('/assets/:supplyId/assignments', '#modules/assets/assets.controller.assignments')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexAssetAssignments))
    router
      .get('/assets/:supplyId/value-history', '#modules/assets/assets.controller.valueHistory')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showAssetValueHistory))
    router
      .put('/assets/:supplyId/characteristic-values', '#modules/assets/assets.controller.upsertCharacteristicValues')
      .use(
        middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.upsertAssetCharacteristicValues)
      )
    router
      .get('/asset-types', '#modules/assets/assets.controller.types')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexAssetTypes))

    router
      .get('/employee-supplies-response-contracts/:id/file', '#modules/assets/asset_files.controller.responseContract')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.downloadSupplyResponseContract))
    router
      .get(
        '/employee-supply-assignation-photos/photo/:photoId/file',
        '#modules/assets/asset_files.controller.assignationPhoto'
      )
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.downloadSupplyAssignationPhoto))
    router
      .get('/employees/:employeeId/assets', '#modules/assets/employee_assets.controller.assets')
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.indexEmployeeAssets))
    router
      .get(
        '/employees/:employeeId/telework-supplies',
        '#modules/assets/employee_assets.controller.teleworkSupplies'
      )
      .use(middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.showEmployeeTeleworkSupplies))
    // Alta de la declaración de equipo propio: el permiso es el de administrar
    // los suministros del colaborador, que vive en Empleados (no en supplies).
    router
      .post(
        '/employees/:employeeId/own-equipment-declarations',
        '#modules/assets/own_equipment_declarations.controller.store'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.storeOwnEquipmentDeclaration)
      )
    // Ajuste versionado de la declaración: cierra la vigente y abre la nueva.
    router
      .put(
        '/own-equipment-declarations/:declarationId',
        '#modules/assets/own_equipment_declarations.controller.update'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.updateOwnEquipmentDeclaration)
      )
    // Término de la declaración vigente: fija fecha de fin y motivo del catálogo.
    router
      .post(
        '/own-equipment-declarations/:declarationId/close',
        '#modules/assets/own_equipment_declarations.controller.close'
      )
      .use(
        middleware.permissionGate(EMPLOYEES_WRITE_PERMISSION_DECLARATIONS.closeOwnEquipmentDeclaration)
      )
    // Evidencia adjunta de la declaración: la abre la ficha del activo, así que
    // pide la lectura de insumos (no el permiso de Empleados que exige el alta).
    router
      .get(
        '/own-equipment-declarations/:declarationId/file',
        '#modules/assets/asset_files.controller.ownEquipmentEvidence'
      )
      .use(
        middleware.permissionGate(SUPPLIES_PERMISSION_DECLARATIONS.downloadOwnEquipmentDeclarationFile)
      )
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
