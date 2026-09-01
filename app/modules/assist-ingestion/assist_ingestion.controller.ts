import type { I18n } from '@adonisjs/i18n'
import { DateTime } from 'luxon'
import { ASSIST_CHANNEL, ASSIST_ORIGIN } from '#constants/assist_origin'
import type { AssistChannel, AssistCreateFrom } from '#constants/assist_origin'
import type { AssistIngestionItemResult } from './dto/assist_ingestion.dto.js'

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
        // Única fuente de hora de servidor no manipulable: con ella el equipo
        // de origen corrige su propio reloj.
        serverTime: DateTime.utc().toISO(),
      },
    },
  }
}
