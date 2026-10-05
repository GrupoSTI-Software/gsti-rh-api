import vine from '@vinejs/vine'
import { ASSET_STATE_FILTERS, ASSETS_LIST_MAX_LIMIT } from '../assets.constants.js'
import type { AssetCharacteristicValueInput } from '../dto/assets.dto.js'

type CharacteristicValue = AssetCharacteristicValueInput['value']

function isCharacteristicValue(value: unknown): value is CharacteristicValue {
  return (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length <= 1000)
  )
}

/** Texto (hasta 1000), número, booleano o `null`. */
const characteristicValueRule = vine.createRule((value, _options, field) => {
  if (!isCharacteristicValue(value)) {
    field.report(
      'El valor debe ser texto (hasta 1000 caracteres), número, sí/no o vacío',
      'characteristicValue',
      field
    )
  }
})

/** Id numérico de la ruta (`:supplyId`, `:id`, `:photoId`). */
const routeId = () => vine.number().positive().withoutDecimals()

/** Query de `GET /api/assets`. */
export const listAssetsValidator = vine.compile(
  vine.object({
    search: vine.string().trim().maxLength(150).optional(),
    supplyTypeId: vine.number().positive().withoutDecimals().optional(),
    state: vine.enum(ASSET_STATE_FILTERS).optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(ASSETS_LIST_MAX_LIMIT).optional(),
  })
)

/** Query de `GET /api/assets/summary`. */
export const assetsSummaryValidator = vine.compile(
  vine.object({
    supplyTypeId: vine.number().positive().withoutDecimals().optional(),
  })
)

export const assetIdParamsValidator = vine.compile(vine.object({ supplyId: routeId() }))
export const fileIdParamsValidator = vine.compile(vine.object({ id: routeId() }))
export const photoIdParamsValidator = vine.compile(vine.object({ photoId: routeId() }))

/**
 * Cuerpo de `PUT /api/assets/:supplyId/characteristic-values`. El formato de
 * cada valor (número, fecha, sí/no) lo valida el service contra el tipo de su
 * característica.
 */
export const upsertCharacteristicValuesValidator = vine.compile(
  vine.object({
    values: vine
      .array(
        vine.object({
          characteristicId: vine.number().positive().withoutDecimals(),
          value: vine
            .any()
            .use(characteristicValueRule())
            .transform((value: unknown): CharacteristicValue =>
              isCharacteristicValue(value) ? value : null
            )
            .nullable(),
        })
      )
      .minLength(1)
      .maxLength(200),
  })
)
