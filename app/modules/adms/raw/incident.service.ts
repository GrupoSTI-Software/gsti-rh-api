import type { DateTime } from 'luxon'
import type { AdmsIncidentContext, AdmsIncidentContextKey } from '#models/adms_incident'
import {
  ADMS_INCIDENT_KIND,
  type AdmsIncidentKind,
  type AdmsIncidentSeverity,
} from '#modules/adms/adms.constants'
import IncidentRepositoryMysql from './incident.repository.mysql.js'
import type { IncidentRepository } from './incident.repository.js'

export interface IncidentInput {
  kind: AdmsIncidentKind
  severity: AdmsIncidentSeverity
  code: string
  title: string
  detail: string
  key: string
  serial: string | null
  accessPointId: number | null
  businessUnitId: number | null
  rawMessageId?: number | null
  deviceCommandId?: number | null
  context?: AdmsIncidentContext | null
  now: DateTime
}

export type IncidentOutcome = 'created' | 'deduped'

/**
 * Claves que un incidente puede llevar en `context` (spec 13, regla 11).
 * `AdmsIncidentContextKey` no tiene firma de indice, asi que un typo aqui es
 * error de compilacion y no una clave descartada en silencio.
 */
const CONTEXT_WHITELIST: ReadonlyArray<AdmsIncidentContextKey> = [
  'serial',
  'pin',
  'ip',
  'table',
  'returnCode',
  'bytes',
  'lines',
  'platform',
  'previousIp',
  'at',
  'field',
  'previous',
  'current',
  'modality',
  'driftSeconds',
  'reason',
]

const CONTEXT_VALUE_MAX_LENGTH = 200

function sanitizeContext(
  context: AdmsIncidentContext | null | undefined
): AdmsIncidentContext | null {
  if (!context) return null
  const clean: AdmsIncidentContext = {}
  for (const key of CONTEXT_WHITELIST) {
    const value = context[key]
    if (value === undefined || value === null) continue
    if (typeof value === 'string') {
      // Un salto de linea en el contexto ensucia la bitacora y el JSON del BO.
      clean[key] = value.replace(/[\r\n]+/g, ' ').slice(0, CONTEXT_VALUE_MAX_LENGTH) as never
      continue
    }
    clean[key] = value as never
  }
  return Object.keys(clean).length > 0 ? clean : null
}

/**
 * Registra incidentes del canal con deduplicacion opcional por ventana: el mismo
 * `kind` para el mismo dispositivo (o serie) dentro de `dedupeMinutes` no se
 * repite, este abierto o ya atendido. Nunca lanza hacia el canal: un incidente que no se pudo
 * escribir no debe convertir un acuse en error.
 *
 * La serie solo se copia al contexto cuando el incidente es global (sin punto
 * de acceso): es lo que permite deduplicar y consultar series desconocidas.
 * Con punto de acceso la serie ya vive en `access_points`.
 */
export default class IncidentService {
  private readonly repository: IncidentRepository

  constructor(repository?: IncidentRepository) {
    this.repository = repository ?? new IncidentRepositoryMysql()
  }

  /**
   * Con una anomalia de IP abierta el canal retiene los comandos que llevan
   * template o token de foto (spec 13, regla 10): si dos equipos presentan la
   * misma serie, un biometrico podria acabar en el aparato equivocado.
   */
  async hasOpenIpAnomaly(accessPointId: number): Promise<boolean> {
    return this.repository.hasOpen(ADMS_INCIDENT_KIND.IP_ANOMALY, accessPointId)
  }

  /**
   * Cierra los avisos de un tipo cuando su causa dejo de existir.
   *
   * Un aviso que se queda abierto para siempre entrena a la gente a ignorar
   * los avisos: el que sigue abierto tiene que significar algo.
   */
  async resolveResolvedCause(
    kind: AdmsIncidentKind,
    accessPointId: number,
    now: DateTime
  ): Promise<number> {
    return this.repository.resolveOpen(kind, accessPointId, now)
  }

  async record(
    input: IncidentInput,
    options: { dedupeMinutes?: number } = {}
  ): Promise<IncidentOutcome> {
    const serialForContext =
      input.accessPointId === null && input.serial ? { serial: input.serial } : {}
    const context = sanitizeContext({ ...(input.context ?? {}), ...serialForContext })
    const scope = { serial: input.serial, accessPointId: input.accessPointId }

    if (options.dedupeMinutes && options.dedupeMinutes > 0) {
      const since = input.now.minus({ minutes: options.dedupeMinutes })
      /**
       * Cuenta lo resuelto tambien: si alguien acaba de decir que ese aparato
       * es suyo, no se le vuelve a preguntar lo mismo hasta pasada la ventana.
       */
      const existing = await this.repository.findRecentSince(input.kind, scope, since)
      if (existing) return 'deduped'
    }

    await this.repository.insert({
      kind: input.kind,
      severity: input.severity,
      code: input.code,
      title: input.title,
      detail: input.detail,
      key: input.key,
      serial: input.serial,
      accessPointId: input.accessPointId,
      businessUnitId: input.businessUnitId,
      rawMessageId: input.rawMessageId ?? null,
      deviceCommandId: input.deviceCommandId ?? null,
      context,
      createdAt: input.now,
    })
    return 'created'
  }
}
