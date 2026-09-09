import type { DateTime } from 'luxon'
import AdmsHeldPunch from '#models/adms_held_punch'
import AdmsUnmappedPin from '#models/adms_unmapped_pin'
import type { HeldPunchInput, HeldPunchRepository } from './held_punch.repository.js'

/**
 * Anota lo que el equipo sabe del PIN y el sistema no.
 *
 * El nombre solo se escribe si llega uno y la fila no lo tenia: el primero que
 * dio el aparato basta, y sobrescribirlo en cada contacto haria que un renombre
 * en el equipo borrara la pista con la que alguien iba a conciliar.
 *
 * Las modalidades se acumulan: ver una huella hoy y un rostro mañana significa
 * que el PIN tiene las dos, no que la segunda sustituya a la primera.
 */
function applyHints(
  row: AdmsUnmappedPin,
  name: string | null | undefined,
  bioType: number | null | undefined
): void {
  const limpio = typeof name === 'string' ? name.trim().slice(0, 100) : ''
  if (limpio.length > 0 && !row.admsUnmappedPinName) {
    row.admsUnmappedPinName = limpio
  }
  if (typeof bioType === 'number' && Number.isInteger(bioType)) {
    const vistos = new Set(row.admsUnmappedPinBioTypesSeen ?? [])
    vistos.add(String(bioType))
    row.admsUnmappedPinBioTypesSeen = [...vistos].sort()
  }
}

/** Verdadero si el error es la violacion de una UNIQUE de MySQL. */
function isDuplicate(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY'
}

/** Adaptador Lucid de la retencion de checadas y de la cola de PINs desconocidos. */
export default class HeldPunchRepositoryMysql implements HeldPunchRepository {
  /**
   * El equipo reintenta el mismo lote hasta recibir acuse, asi que la misma
   * checada retenida puede llegar varias veces: la UNIQUE de identidad es el
   * arbitro y su violacion no es un error, es "ya estaba".
   */
  async hold(input: HeldPunchInput): Promise<void> {
    const unmappedPinId = await this.findUnmappedPinId(input.accessPointId, input.pin)
    const held = new AdmsHeldPunch()
    held.admsUnmappedPinId = unmappedPinId
    held.accessPointId = input.accessPointId
    held.businessUnitId = input.businessUnitId
    held.admsHeldPunchPin = input.pin
    held.admsHeldPunchPunchTimeLocal = input.punchTimeLocal
    held.admsHeldPunchPunchTimeUtc = input.punchTimeUtc
    held.admsHeldPunchVerify = input.verify
    held.admsRawMessageId = input.rawMessageId
    held.admsHeldPunchReason = input.reason
    try {
      await held.save()
    } catch (error) {
      if (!isDuplicate(error)) throw error
    }
  }

  async touchUnmappedPin(input: {
    accessPointId: number
    businessUnitId: number
    pin: string
    name?: string | null
    bioType?: number | null
    now: DateTime
  }): Promise<number> {
    const existing = await AdmsUnmappedPin.query()
      .where('access_point_id', input.accessPointId)
      .where('adms_unmapped_pin_pin', input.pin)
      .first()

    if (existing) {
      existing.admsUnmappedPinLastSeenAt = input.now
      existing.admsUnmappedPinPunchCount += 1
      /** Un PIN descartado que vuelve a aparecer regresa a pendiente (spec 9.4). */
      if (existing.admsUnmappedPinStatus === 'dismissed') {
        existing.admsUnmappedPinStatus = 'pending'
        existing.admsUnmappedPinDismissReason = null
      }
      applyHints(existing, input.name, input.bioType)
      await existing.save()
      return existing.admsUnmappedPinId
    }

    const row = new AdmsUnmappedPin()
    row.accessPointId = input.accessPointId
    row.businessUnitId = input.businessUnitId
    row.admsUnmappedPinPin = input.pin
    row.admsUnmappedPinFirstSeenAt = input.now
    row.admsUnmappedPinLastSeenAt = input.now
    row.admsUnmappedPinPunchCount = 1
    applyHints(row, input.name, input.bioType)
    try {
      await row.save()
      return row.admsUnmappedPinId
    } catch (error) {
      if (!isDuplicate(error)) throw error
      // Otra subida del mismo equipo lo creo entre la lectura y el alta.
      const winner = await AdmsUnmappedPin.query()
        .where('access_point_id', input.accessPointId)
        .where('adms_unmapped_pin_pin', input.pin)
        .firstOrFail()
      return winner.admsUnmappedPinId
    }
  }

  private async findUnmappedPinId(accessPointId: number, pin: string): Promise<number | null> {
    const row = await AdmsUnmappedPin.query()
      .where('access_point_id', accessPointId)
      .where('adms_unmapped_pin_pin', pin)
      .first()
    return row?.admsUnmappedPinId ?? null
  }
}
