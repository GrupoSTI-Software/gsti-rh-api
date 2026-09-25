import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
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
  })
  .prefix('/api')
  .use(middleware.auth())
  .use(middleware.businessScope())
