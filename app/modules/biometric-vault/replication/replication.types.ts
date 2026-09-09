/**
 * Replicacion de biometricos entre checadores (spec ADMS 7.4).
 */

/** Que se intenta copiar. Vacio o ausente: todo lo que haya. */
export const REPLICATION_MODALITY = {
  FINGERPRINT: 'fingerprint',
  FACE: 'face',
} as const

export type ReplicationModality =
  (typeof REPLICATION_MODALITY)[keyof typeof REPLICATION_MODALITY]

/** Por que un biometrico no se pudo copiar a un equipo. */
export const REPLICATION_SKIP = {
  /** El colaborador no tiene numero en el equipo destino. */
  NO_PIN: 'no_pin',
  /**
   * Ningun template del dedo coincide con la version de algoritmo del destino,
   * o el destino no declara version. La bateria midio `Return=-30` al empujar
   * un template v10 a un equipo v13: mandarlo igual gasta un comando y deja al
   * colaborador creyendo que ya puede checar.
   */
  NOT_REPLICABLE_VERSION: 'not_replicable_version',
  /** Ni foto autorizada ni template de rostro compatible. */
  NOT_REPLICABLE_FACE: 'not_replicable_face',
  /** No hay nada de esa modalidad que copiar. */
  NOTHING_TO_COPY: 'nothing_to_copy',
  /** El destino es el origen. */
  SAME_DEVICE: 'same_device',
} as const

export type ReplicationSkip = (typeof REPLICATION_SKIP)[keyof typeof REPLICATION_SKIP]

export interface ReplicationItem {
  modality: ReplicationModality
  /** Dedo (0 a 9) o 9 para rostro. */
  bioNo: number
  status: 'queued' | 'already_queued' | 'skipped'
  reason?: ReplicationSkip
  /** Version del template que se copio, para que el operador la vea. */
  majorVer?: string | null
}

export interface ReplicationTargetResult {
  accessPointId: number
  accessPointName: string
  fpVersion: string | null
  faceVersion: string | null
  items: ReplicationItem[]
}

export interface ReplicationResult {
  sourceAccessPointId: number
  targets: ReplicationTargetResult[]
}
