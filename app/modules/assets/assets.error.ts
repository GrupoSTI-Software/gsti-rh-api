import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { errors as vineErrors } from '@vinejs/vine'
import {
  ASSET_ERROR_KEYS,
  MAX_ASSIGNATION_PHOTOS_PER_ASSIGNMENT,
  type AssetErrorKey,
} from './assets.constants.js'

/**
 * Error de dominio de Activos. Lleva el status HTTP, la key semántica y el
 * prefijo i18n (`<prefijo>_title` / `<prefijo>_detail` en
 * `resources/langs/*.json`); el texto en español es el respaldo si falta la
 * traducción.
 */
export class AssetError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly key: AssetErrorKey,
    readonly i18nPrefix: string,
    readonly fallbackTitle: string,
    readonly fallbackDetail: string,
    readonly i18nData?: Record<string, string | number>
  ) {
    super(fallbackDetail)
    this.name = 'AssetError'
  }

  /** El activo no existe, está borrado o es de otra empresa. */
  static assetNotFound(): AssetError {
    return new AssetError(
      404,
      ASSET_ERROR_KEYS.ASSET_NOT_FOUND,
      'asset_not_found',
      'Activo no encontrado',
      'El activo no existe o no pertenece a la empresa.'
    )
  }

  /** Otro activo vivo de la misma empresa ya usa el folio. */
  static fileNumberTaken(): AssetError {
    return new AssetError(
      409,
      ASSET_ERROR_KEYS.FILE_NUMBER_TAKEN,
      'asset_file_number_taken',
      'Folio duplicado',
      'Ya existe un activo con ese folio en la empresa.'
    )
  }

  /** El activo ya tiene un resguardo activo con otro colaborador. */
  static activeAssignmentExists(): AssetError {
    return new AssetError(
      409,
      ASSET_ERROR_KEYS.ACTIVE_ASSIGNMENT_EXISTS,
      'asset_active_assignment_exists',
      'El activo ya está asignado',
      'El activo tiene un resguardo activo. Registra la devolución antes de asignarlo de nuevo.'
    )
  }

  /** No se borra un activo mientras esté en resguardo. */
  static assetHasActiveAssignment(): AssetError {
    return new AssetError(
      409,
      ASSET_ERROR_KEYS.ASSET_HAS_ACTIVE_ASSIGNMENT,
      'asset_has_active_assignment',
      'No fue posible eliminar el activo',
      'El activo tiene un resguardo activo. Registra la devolución antes de eliminarlo.'
    )
  }

  /** No se borra un tipo que todavía tiene activos. */
  static typeHasAssets(): AssetError {
    return new AssetError(
      409,
      ASSET_ERROR_KEYS.TYPE_HAS_ASSETS,
      'asset_type_has_assets',
      'No fue posible eliminar el tipo de activo',
      'El tipo tiene activos registrados. Elimínalos o cámbialos de tipo antes de eliminarlo.'
    )
  }

  /** La característica no existe o no es del tipo del activo. */
  static characteristicNotInType(): AssetError {
    return new AssetError(
      422,
      ASSET_ERROR_KEYS.CHARACTERISTIC_NOT_IN_TYPE,
      'asset_characteristic_not_in_type',
      'Característica inválida',
      'Una de las características no pertenece al tipo del activo.'
    )
  }

  /** El valor no respeta el formato de su característica. */
  static characteristicValueInvalid(name: string): AssetError {
    return new AssetError(
      422,
      ASSET_ERROR_KEYS.CHARACTERISTIC_VALUE_INVALID,
      'asset_characteristic_value_invalid',
      'Valor inválido',
      `El valor de "${name}" no tiene el formato de la característica.`,
      { name }
    )
  }

  /** El resguardo ya llegó al tope de fotos de asignación. */
  static photoLimitExceeded(): AssetError {
    return new AssetError(
      422,
      ASSET_ERROR_KEYS.PHOTO_LIMIT_EXCEEDED,
      'asset_photo_limit_exceeded',
      'Demasiadas fotos',
      `Un resguardo admite hasta ${MAX_ASSIGNATION_PHOTOS_PER_ASSIGNMENT} fotos de asignación.`,
      { max: MAX_ASSIGNATION_PHOTOS_PER_ASSIGNMENT }
    )
  }

  /** El registro no existe, es de otra empresa o no tiene archivo. */
  static fileNotFound(): AssetError {
    return new AssetError(
      404,
      ASSET_ERROR_KEYS.FILE_NOT_FOUND,
      'asset_file_not_found',
      'Archivo no encontrado',
      'El archivo no existe o no está disponible.'
    )
  }
}

type ErrorContext = Pick<HttpContext, 'response' | 'i18n'>

/** Respuesta con el contrato del repo (`type/title/message/detail/key`). */
function sendError(
  ctx: ErrorContext,
  status: number,
  title: string,
  detail: string,
  key: AssetErrorKey
) {
  return ctx.response.status(status).json({
    type: 'error',
    title,
    message: detail,
    detail,
    key,
    data: null,
  })
}

/** Traduce un `AssetError` a su respuesta HTTP. */
export function respondAssetError(ctx: ErrorContext, error: AssetError) {
  const { i18n } = ctx
  return sendError(
    ctx,
    error.httpStatus,
    i18n.t(`${error.i18nPrefix}_title`, error.i18nData, error.fallbackTitle),
    i18n.t(`${error.i18nPrefix}_detail`, error.i18nData, error.fallbackDetail),
    error.key
  )
}

/**
 * Respuesta de error de los controladores del módulo: dominio, validación
 * (422) o inesperado (500, sin filtrar el mensaje interno).
 */
export function respondAssetsModuleError(ctx: ErrorContext, error: unknown) {
  const { i18n } = ctx
  if (error instanceof AssetError) return respondAssetError(ctx, error)

  if (error instanceof vineErrors.E_VALIDATION_ERROR) {
    const [first] = error.messages as Array<{ message?: string }>
    return sendError(
      ctx,
      422,
      i18n.t('asset_invalid_input_title', undefined, 'Datos inválidos'),
      first?.message ?? i18n.t('asset_invalid_input_detail', undefined, 'Revisa los datos enviados.'),
      ASSET_ERROR_KEYS.INVALID_INPUT
    )
  }

  logger.error({ err: error }, 'Activos: error inesperado')
  return sendError(
    ctx,
    500,
    i18n.t('asset_unexpected_error_title', undefined, 'Error inesperado'),
    i18n.t(
      'asset_unexpected_error_detail',
      undefined,
      'Ocurrió un error inesperado al consultar los activos.'
    ),
    ASSET_ERROR_KEYS.UNEXPECTED
  )
}
