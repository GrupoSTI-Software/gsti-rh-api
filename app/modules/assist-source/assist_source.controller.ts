import type { HttpContext } from '@adonisjs/core/http'
import { StandardResponseFormatter } from '#helpers/standard_response_formatter'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import AssistSourceService from './assist_source.service.js'
import AssistAddressService from './assist_address.service.js'
import { assistSourceParamsValidator } from './assist_source.validator.js'

/** Error con el triplete título/detalle/key del estándar. */
function fail(
  response: HttpContext['response'],
  status: number,
  title: string,
  detail: string,
  key: string,
  code: string
) {
  return response.status(status).json({ type: 'error', title, detail, key, code })
}

function notFound(response: HttpContext['response']) {
  return fail(
    response,
    404,
    'Checada no encontrada',
    'La checada no existe o no pertenece a la empresa activa.',
    'checada-no-encontrada',
    ASSIST_ERROR_CODES.NF_ASSIST
  )
}

/**
 * Dónde se hizo una checada: el detalle que abre el registro desde la tarjeta
 * del día. Lee igual que el calendario de asistencia: dentro de la empresa
 * activa, sin permiso propio.
 */
export default class AssistSourceController {
  /**
   * @swagger
   * /api/v1/assists/{assistId}/source:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Asistencias]
   *     summary: Origen de una checada (ubicación, checador o captura en backoffice)
   *     responses:
   *       200:
   *         description: data.assistSource
   *       404:
   *         description: La checada no existe en la empresa activa
   */
  async show({ request, response }: HttpContext) {
    const { params } = await request.validateUsing(assistSourceParamsValidator, {
      data: { params: request.params() },
    })
    const source = await new AssistSourceService().find(params.assistId)
    if (!source) return notFound(response)
    return StandardResponseFormatter.success(
      response,
      source,
      'Origen de la checada',
      'Origen de la checada',
      200,
      'assistSource'
    )
  }

  /**
   * @swagger
   * /api/v1/assists/{assistId}/address:
   *   get:
   *     security:
   *       - bearerAuth: []
   *     tags: [Asistencias]
   *     summary: Dirección aproximada de una checada con coordenadas (OpenStreetMap)
   *     responses:
   *       200:
   *         description: data.address (null si el servicio no conoce una dirección para ese punto)
   *       404:
   *         description: La checada no existe en la empresa activa
   *       422:
   *         description: La checada no tiene coordenadas
   *       503:
   *         description: El servicio de direcciones no respondió; se puede reintentar
   */
  async address({ request, response }: HttpContext) {
    const { params } = await request.validateUsing(assistSourceParamsValidator, {
      data: { params: request.params() },
    })
    const result = await new AssistAddressService().find(params.assistId)

    if (result.status === 'not-found') return notFound(response)
    if (result.status === 'no-location') {
      return fail(
        response,
        422,
        'Checada sin ubicación',
        'La checada no tiene coordenadas, así que no hay dirección que consultar.',
        'checada-sin-ubicacion',
        ASSIST_ERROR_CODES.VAL_NO_LOCATION
      )
    }
    if (result.status === 'unavailable') {
      return fail(
        response,
        503,
        'Dirección no disponible',
        'El servicio de direcciones no respondió. Intenta de nuevo en unos segundos.',
        'direccion-no-disponible',
        ASSIST_ERROR_CODES.SYS_ADDRESS_UNAVAILABLE
      )
    }
    return StandardResponseFormatter.success(
      response,
      { address: result.address },
      'Dirección aproximada',
      'Dirección aproximada de la checada',
      200,
      'assistAddress'
    )
  }
}
