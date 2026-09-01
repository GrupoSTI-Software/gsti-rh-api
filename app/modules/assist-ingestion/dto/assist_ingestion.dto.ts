import type { DateTime } from 'luxon'
import type Assist from '#models/assist'
import type { AssistCreateFrom } from '#constants/assist_origin'

/** Desenlace de una checada entregada al motor de ingesta. */
export type AssistIngestionOutcome = 'inserted' | 'preexisting' | 'rejected'

/** Desenlace de una checada que sí llegó a la base. */
export type AssistIngestionPersistedOutcome = Exclude<AssistIngestionOutcome, 'rejected'>

/**
 * A quién pertenece la checada.
 *
 * El canal del checador físico (ESB-04-02-05-02) llegará sin sesión y sólo con el
 * código del colaborador: por eso ese caso viaja SIEMPRE con su empresa. El código
 * solo no identifica a nadie — dos empresas pueden repetirlo.
 */
export type AssistIngestionSubject =
  | { kind: 'employeeId'; employeeId: number }
  | { kind: 'employeeCode'; employeeCode: string; businessUnitId: number }

/** Coordenadas del marcaje tal como las declara el equipo de origen. */
export interface AssistIngestionGeo {
  latitude: number | null
  longitude: number | null
  precision: number | null
}

/** El hecho declarado por el cliente, ya normalizado por el adaptador de transporte. */
export interface AssistIngestionItem {
  subject: AssistIngestionSubject
  /** Tipo de marcaje. `null` cuando el cliente no lo declara: el alta lo omite y manda la columna a su valor por omisión, como hoy. */
  assistType: string | null
  /** Instante del marcaje, en UTC. Es la hora que cuenta para nómina. */
  punchTimeUtc: DateTime
  geo: AssistIngestionGeo
  origin: AssistCreateFrom
  createdByUserId: number | null
  /** Serie real del equipo; `null` cuando el origen no aporta una. Nunca cadena vacía. */
  terminalSn: string | null
  /** Referencia opaca del equipo de origen. Viaja de ida y vuelta; no se guarda (API-3). */
  clientRef: string | null
}

/** Registro listo para persistir: sujeto y empresa ya resueltos. */
export interface AssistIngestionRecord {
  /** Posición del elemento en la entrega original; el veredicto conserva el orden. */
  index: number
  businessUnitId: number
  employeeId: number
  employeeCode: string
  assistType: string | null
  punchTimeUtc: DateTime
  geo: AssistIngestionGeo
  origin: AssistCreateFrom
  createdByUserId: number | null
  terminalSn: string | null
}

/** Lo que el puerto devuelve por registro: se insertó, o su identidad ya estaba tomada. */
export interface AssistIngestionPersisted {
  index: number
  outcome: AssistIngestionPersistedOutcome
  assist: Assist
}

/**
 * Rechazo de un elemento. El dominio decide el motivo; el texto lo resuelve el
 * adaptador de transporte con `i18nBase` (`<base>_title` y `<base>_message`), para
 * que el módulo no dependa de `i18n` y pueda servir también al canal sin sesión.
 */
export interface AssistIngestionRejection {
  status: number
  code: string
  key: string
  i18nBase: string
}

/** Veredicto de un elemento de la entrega. */
export interface AssistIngestionItemResult {
  index: number
  clientRef: string | null
  outcome: AssistIngestionOutcome
  assist: Assist | null
  error: AssistIngestionRejection | null
}

/** Resumen de la entrega. Lo explota API-3; el unitario sólo toma el elemento cero. */
export interface AssistIngestionSummary {
  received: number
  inserted: number
  preexisting: number
  rejected: number
  /** `inserted + preexisting`: lo que el equipo de origen ya puede retirar de su cola. */
  acknowledged: number
}

export interface AssistIngestionResult {
  results: AssistIngestionItemResult[]
  summary: AssistIngestionSummary
}
