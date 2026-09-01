import type { HttpContext } from '@adonisjs/core/http'
import type { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'
import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import { ASSIST_CHANNEL, ASSIST_ORIGIN } from '#constants/assist_origin'
import type { AssistChannel, AssistCreateFrom } from '#constants/assist_origin'
import { ensureEmployeeAssistWrite } from '#helpers/ensure_employee_assist_write'
import AssistIngestionService, { resolvePunchTime } from './assist_ingestion.service.js'
import {
  ASSIST_INGESTION_BATCH_MAX_BODY_BYTES,
  ASSIST_INGESTION_BATCH_MAX_ITEMS,
} from './assist_ingestion.constants.js'
import {
  ASSIST_INGESTION_CHANNEL_UNKNOWN,
  ASSIST_INGESTION_FOREIGN_WRITE,
  ASSIST_INGESTION_INVALID_ITEM,
} from './assist_ingestion.rejections.js'
import {
  assistBatchItemValidator,
  inspectAssistBatchEnvelope,
} from './validators/ingest_assists_batch.validator.js'
import { firstValidationIssue } from './validators/store_assist.validator.js'
import type {
  AssistIngestionItem,
  AssistIngestionItemResult,
  AssistIngestionRejection,
  AssistIngestionSummary,
} from './dto/assist_ingestion.dto.js'

/**
 * Canal declarado por el cliente → procedencia que se guarda.
 *
 * `ASSIST_ORIGIN` solo no basta: hoy la app personal y el kiosco escriben ambos
 * `self-service`, así que el canal lo declara el equipo y el servidor lo traduce.
 */
const CHANNEL_TO_ORIGIN: Record<AssistChannel, AssistCreateFrom> = {
  [ASSIST_CHANNEL.APP]: ASSIST_ORIGIN.SELF_SERVICE,
  [ASSIST_CHANNEL.KIOSK]: ASSIST_ORIGIN.DEVICE,
  [ASSIST_CHANNEL.BACKOFFICE]: ASSIST_ORIGIN.ADMIN_CAPTURE,
  [ASSIST_CHANNEL.DEVICE]: ASSIST_ORIGIN.SYNC,
}

/** Sobre HTTP: código de estado y cuerpo ya armado. */
export interface AssistIngestionHttpEnvelope {
  status: number
  body: Record<string, unknown>
}

/**
 * Procedencia de la checada. Con canal declarado manda el canal; sin él se deriva
 * de si quien registra es la propia persona, exactamente como hoy: un equipo que
 * no declara canal nunca falla por no declararlo.
 */
export function resolveAssistOrigin(
  channel: AssistChannel | null | undefined,
  isOwner: boolean
): AssistCreateFrom {
  if (channel) return CHANNEL_TO_ORIGIN[channel]
  return isOwner ? ASSIST_ORIGIN.SELF_SERVICE : ASSIST_ORIGIN.ADMIN_CAPTURE
}

function translate(i18n: I18n, key: string, fallback: string): string {
  return i18n.t(key, undefined, fallback)
}

/**
 * Traduce el veredicto de una checada al sobre del endpoint unitario.
 *
 * Los dos desenlaces de éxito responden **201**: el desenlace viaja en
 * `data.outcome` y nunca en el código de estado — el Backoffice discrimina por
 * `status === 201` estricto y con 200 pintaría una advertencia y no refrescaría.
 */
export function mapIngestionResultToHttp(
  result: AssistIngestionItemResult,
  i18n: I18n
): AssistIngestionHttpEnvelope {
  if (result.outcome === 'rejected' || !result.assist) {
    const rejection = result.error
    if (!rejection) {
      throw new Error('Veredicto de rechazo sin motivo: el motor de ingesta siempre lo declara.')
    }
    const detail = translate(i18n, `${rejection.i18nBase}_message`, rejection.key)
    return {
      status: rejection.status,
      body: {
        type: 'warning',
        title: translate(i18n, `${rejection.i18nBase}_title`, rejection.key),
        message: detail,
        detail,
        key: rejection.key,
        code: rejection.code,
      },
    }
  }

  const message =
    result.outcome === 'preexisting'
      ? translate(
          i18n,
          'assist_already_stored_message',
          'La checada ya estaba registrada; no se creó un segundo registro.'
        )
      : translate(i18n, 'assist_stored_message', 'La checada quedó registrada.')

  return {
    status: 201,
    body: {
      type: 'success',
      title: translate(i18n, 'assist_stored_title', 'Checada registrada'),
      message,
      data: {
        assist: result.assist,
        outcome: result.outcome,
        // Se deduce comparando la hora de captura con la hora en que llegó: no hay
        // dato guardado detrás, y sirve para saber qué checadas llegaron diferidas.
        deferred: result.assist.assistDeferred,
        deferredBySeconds: result.assist.assistDeferredBySeconds,
        // Única fuente de hora de servidor no manipulable: con ella el equipo
        // de origen corrige su propio reloj.
        serverTime: DateTime.utc().toISO(),
      },
    },
  }
}

/** Veredicto de un elemento tal como sale en la respuesta del lote. */
interface AssistBatchResultBody {
  index: number
  clientRef: string | null
  outcome: AssistIngestionItemResult['outcome']
  assistId?: number
  deferred?: boolean
  deferredBySeconds?: number
  error?: { title: string; detail: string; key: string; code: string }
}

function rejectionBody(
  rejection: AssistIngestionRejection,
  i18n: I18n
): { title: string; detail: string; key: string; code: string } {
  const detail = translate(i18n, `${rejection.i18nBase}_message`, rejection.key)
  return {
    title: translate(i18n, `${rejection.i18nBase}_title`, rejection.key),
    detail,
    key: rejection.key,
    code: rejection.code,
  }
}

function summarize(results: AssistBatchResultBody[]): AssistIngestionSummary {
  const inserted = results.filter((result) => result.outcome === 'inserted').length
  const preexisting = results.filter((result) => result.outcome === 'preexisting').length
  const rejected = results.filter((result) => result.outcome === 'rejected').length

  return {
    received: results.length,
    inserted,
    preexisting,
    rejected,
    acknowledged: inserted + preexisting,
  }
}

/**
 * Adaptador de transporte del motor de ingesta.
 *
 * Sólo publica la entrega de varias checadas: el alta unitaria sigue viviendo en
 * `assists_controller.store`, que consume el mismo motor por dentro.
 */
export default class AssistIngestionController {
  /**
   * @swagger
   * /api/v1/assists/batch:
   *   post:
   *     security:
   *       - bearerAuth: []
   *     tags:
   *       - Assists
   *     summary: Entregar varias checadas en un solo envío
   *     description: |
   *       Recibe hasta 200 checadas, cada una con su propio colaborador, y responde
   *       el veredicto de cada una en el mismo orden en que se enviaron. Un elemento
   *       rechazado no impide que los demás se procesen: sólo un sobre mal formado
   *       detiene la entrega completa.
   *
   *       El límite de peticiones del servicio se conserva íntegro y se suma un
   *       segundo contador que cuenta checadas, no peticiones.
   *     produces:
   *       - application/json
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [assists]
   *             properties:
   *               assists:
   *                 type: array
   *                 minItems: 1
   *                 maxItems: 200
   *                 items:
   *                   type: object
   *                   required: [employeeId, assistPunchTime]
   *                   properties:
   *                     clientRef:
   *                       type: string
   *                       maxLength: 64
   *                       description: Referencia opaca del equipo; regresa intacta y no se guarda
   *                     employeeId:
   *                       type: integer
   *                     assistPunchTime:
   *                       type: string
   *                       description: |
   *                         Hora en que ocurrió la checada, obligatoria por elemento.
   *                         ISO-8601 con desfase explícito o el formato legado
   *                         `YYYY-MM-DD HH:mm:ss` en UTC-6.
   *                     assistType:
   *                       type: string
   *                       enum: [check, eatin, eatout]
   *                     assistChannel:
   *                       type: string
   *                       enum: [app, kiosk, backoffice, device]
   *                     assistLatitude:
   *                       type: number
   *                     assistLongitude:
   *                       type: number
   *                     assistPrecision:
   *                       type: number
   *     responses:
   *       '200':
   *         description: |
   *           Entrega procesada. El veredicto de cada checada viaja en
   *           `data.results[]` (`inserted`, `preexisting` o `rejected` con su motivo),
   *           en el mismo orden en que se enviaron. Los elementos que quedaron
   *           registrados llevan además `deferred` y `deferredBySeconds`.
   *       '400':
   *         description: |
   *           Sobre mal formado (key `lote-de-checadas-fuera-de-tamano`, code
   *           `AST.VAL.004`): sin lista de checadas, lista vacía, por encima de 200
   *           elementos o por encima del tamaño máximo del mensaje. No se registra nada.
   *       '429':
   *         description: |
   *           Cuota agotada. El contador de checadas responde con triplete completo
   *           (key `cuota-de-checadas-agotada`, code `AST.RATE.001`); el contador de
   *           peticiones responde con el cuerpo por omisión del limitador, sin `code`.
   */
  async storeBatch({ auth, request, response, i18n }: HttpContext) {
    const rawAssists: unknown = request.input('assists')
    const contentLengthHeader = request.header('content-length')
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null

    const envelopeProblem = inspectAssistBatchEnvelope(
      rawAssists,
      Number.isFinite(contentLength) ? contentLength : null,
      ASSIST_INGESTION_BATCH_MAX_BODY_BYTES
    )

    if (envelopeProblem) {
      const detail = i18n.t(
        'assist_batch_size_message',
        { max: ASSIST_INGESTION_BATCH_MAX_ITEMS },
        `El lote debe traer entre 1 y ${ASSIST_INGESTION_BATCH_MAX_ITEMS} checadas.`
      )
      response.status(400)
      return {
        type: 'warning',
        title: translate(i18n, 'assist_batch_size_title', 'Lote de checadas fuera de tamaño'),
        message: detail,
        detail,
        key: 'lote-de-checadas-fuera-de-tamano',
        code: ASSIST_ERROR_CODES.VAL_BATCH_SIZE,
      }
    }

    const rawItems = rawAssists as unknown[]
    const results: AssistBatchResultBody[] = rawItems.map((_, index) => ({
      index,
      clientRef: null,
      outcome: 'rejected',
      error: rejectionBody(ASSIST_INGESTION_INVALID_ITEM, i18n),
    }))

    // El permiso se resuelve una vez por colaborador distinto, nunca una vez por
    // entrega: evaluarlo una sola vez dejaría colar checadas ajenas detrás de un
    // primer elemento propio.
    const writeAccess = new Map<number, { allowed: boolean; isOwner: boolean }>()
    const accepted: AssistIngestionItem[] = []
    const originalIndexes: number[] = []

    for (const [index, rawItem] of rawItems.entries()) {
      let item: Awaited<ReturnType<typeof assistBatchItemValidator.validate>>
      try {
        item = await assistBatchItemValidator.validate(rawItem)
      } catch (validationError) {
        const issue = firstValidationIssue(validationError)
        results[index].error = rejectionBody(
          issue?.field?.endsWith('assistChannel')
            ? ASSIST_INGESTION_CHANNEL_UNKNOWN
            : ASSIST_INGESTION_INVALID_ITEM,
          i18n
        )
        continue
      }

      results[index].clientRef = item.clientRef ?? null

      let access = writeAccess.get(item.employeeId)
      if (!access) {
        access = await ensureEmployeeAssistWrite(auth.user, item.employeeId)
        writeAccess.set(item.employeeId, access)
      }

      if (!access.allowed) {
        results[index].error = rejectionBody(ASSIST_INGESTION_FOREIGN_WRITE, i18n)
        continue
      }

      const resolvedPunchTime = resolvePunchTime(item.assistPunchTime, DateTime.utc())
      if (!resolvedPunchTime.ok) {
        results[index].error = rejectionBody(resolvedPunchTime.rejection, i18n)
        continue
      }

      accepted.push({
        subject: { kind: 'employeeId', employeeId: item.employeeId },
        assistType: item.assistType ?? null,
        punchTimeUtc: resolvedPunchTime.punchTimeUtc,
        geo: {
          latitude: item.assistLatitude ?? null,
          longitude: item.assistLongitude ?? null,
          precision: item.assistPrecision ?? null,
        },
        origin: resolveAssistOrigin(item.assistChannel, access.isOwner),
        createdByUserId: access.isOwner ? null : (auth.user?.userId ?? null),
        terminalSn: null,
        clientRef: item.clientRef ?? null,
      })
      originalIndexes.push(index)
    }

    const ingestion = await new AssistIngestionService().ingest(accepted)

    for (const result of ingestion.results) {
      const index = originalIndexes[result.index]
      results[index] = {
        index,
        clientRef: result.clientRef,
        outcome: result.outcome,
        ...(result.assist
          ? {
              assistId: result.assist.assistId,
              deferred: result.assist.assistDeferred,
              deferredBySeconds: result.assist.assistDeferredBySeconds,
            }
          : {}),
        ...(result.error ? { error: rejectionBody(result.error, i18n) } : {}),
      }
    }

    const summary = summarize(results)
    const message = i18n.t(
      'assist_batch_processed_message',
      summary,
      `Se procesaron ${summary.received} checadas: ${summary.inserted} registradas, ${summary.preexisting} ya existían y ${summary.rejected} rechazadas.`
    )

    response.status(200)
    return {
      type: 'success',
      title: translate(i18n, 'assist_batch_processed_title', 'Lote de checadas procesado'),
      message,
      data: {
        serverTime: DateTime.utc().toISO(),
        summary,
        results,
      },
    }
  }
}
