import type { PermissionGateOptions } from '#constants/permission_gate'

const suppliesStandard = (action: string | readonly string[]): PermissionGateOptions => ({
  module: 'supplies',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Activos e insumos. Fuente única que
 * consumen `start/routes/supply_type.ts`, `supplies.ts`,
 * `supplie_caracteristics.ts`, `supplie_caracteristic_values.ts`,
 * `supply_value_histories.ts` y `app/modules/assets/assets.routes.ts`.
 *
 * Todo el catálogo lo consume solo la página de activos del backoffice
 * (tipos, activos, características, valores e historial de valor), así que
 * las lecturas piden `read`: ninguna otra pantalla, ni la PWA ni la app del
 * colaborador, las usa.
 *
 * No se declaran:
 *  - `GET /api/supplies/:id`: la Matriz de vencimientos lo usa para pintar el
 *    activo asignado a un colaborador; pedir `supplies:read` la rompería.
 *  - `GET /api/supplies/excel`: ya exige `employees:download-supplies-report`
 *    y una ruta lleva un solo gate.
 *
 * Los valores de característica y el historial de valor aceptan `create` o
 * `update`: el formulario del activo los escribe al guardar tanto un activo
 * nuevo como uno existente, y un rol que solo crea (o solo edita) no debe
 * quedarse a medio guardar.
 *
 * Dar de baja un activo (`deactivate`) es un cambio de estado desde el
 * formulario de edición, por eso pide `update` y no `delete`.
 *
 * Módulo vertical `app/modules/assets` (rediseño de Activos del BO): el
 * listado, resumen, ficha, resguardos, historial de valor y tipos piden
 * `read`; guardar valores de características pide `update`. Las descargas de
 * la responsiva y de las fotos de un resguardo piden `read`: las abre la ficha
 * del activo (las escrituras de resguardos, contratos y fotos siguen con
 * `employees:manage-employee-supplies`).
 *
 * Bypass `standard` (root y owner): es el mismo salvoconducto con el que el
 * backoffice abre la página (`isRoot`); ningún servicio del API trata a
 * super-administrador como administrador de activos.
 */
export const SUPPLIES_PERMISSION_DECLARATIONS = {
  storeSupplyType: suppliesStandard('create'),
  indexSupplyTypes: suppliesStandard('read'),
  showSupplyType: suppliesStandard('read'),
  updateSupplyType: suppliesStandard('update'),
  destroySupplyType: suppliesStandard('delete'),
  showSupplyTypeWithCharacteristics: suppliesStandard('read'),

  storeSupply: suppliesStandard('create'),
  indexSupplies: suppliesStandard('read'),
  updateSupply: suppliesStandard('update'),
  destroySupply: suppliesStandard('delete'),
  deactivateSupply: suppliesStandard('update'),
  showSupplyWithType: suppliesStandard('read'),
  indexSuppliesByType: suppliesStandard('read'),

  storeSupplyCharacteristic: suppliesStandard('create'),
  indexSupplyCharacteristics: suppliesStandard('read'),
  showSupplyCharacteristic: suppliesStandard('read'),
  updateSupplyCharacteristic: suppliesStandard('update'),
  destroySupplyCharacteristic: suppliesStandard('delete'),
  showSupplyCharacteristicWithValues: suppliesStandard('read'),
  indexSupplyCharacteristicsBySupplyType: suppliesStandard('read'),

  storeSupplyCharacteristicValue: suppliesStandard(['create', 'update']),
  indexSupplyCharacteristicValues: suppliesStandard('read'),
  showSupplyCharacteristicValue: suppliesStandard('read'),
  updateSupplyCharacteristicValue: suppliesStandard('update'),
  destroySupplyCharacteristicValue: suppliesStandard('delete'),
  showSupplyCharacteristicValueWithCharacteristic: suppliesStandard('read'),
  indexSupplyCharacteristicValuesByCharacteristic: suppliesStandard('read'),
  indexSupplyCharacteristicValuesBySupply: suppliesStandard('read'),

  indexSupplyValueHistories: suppliesStandard('read'),
  storeSupplyValueHistory: suppliesStandard(['create', 'update']),
  showSupplyValueHistory: suppliesStandard('read'),
  updateSupplyValueHistory: suppliesStandard('update'),
  destroySupplyValueHistory: suppliesStandard('delete'),
  indexSupplyValueHistoriesBySupply: suppliesStandard('read'),
  showLatestSupplyValueHistory: suppliesStandard('read'),

  indexAssets: suppliesStandard('read'),
  showAssetsSummary: suppliesStandard('read'),
  showAsset: suppliesStandard('read'),
  indexAssetAssignments: suppliesStandard('read'),
  showAssetValueHistory: suppliesStandard('read'),
  indexAssetTypes: suppliesStandard('read'),
  upsertAssetCharacteristicValues: suppliesStandard('update'),
  downloadSupplyResponseContract: suppliesStandard('read'),
  downloadSupplyAssignationPhoto: suppliesStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>
