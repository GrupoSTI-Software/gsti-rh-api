import AdmsHeldBiometric from '#models/adms_held_biometric'
import type { HeldBiometricInput, HeldBiometricRepository } from './held_biometric.repository.js'

function isDuplicate(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY'
}

/** Adaptador Lucid de la retencion de biometricos. */
export default class HeldBiometricRepositoryMysql implements HeldBiometricRepository {
  async hold(input: HeldBiometricInput): Promise<void> {
    const existing = await AdmsHeldBiometric.query()
      .where('access_point_id', input.accessPointId)
      .where('adms_held_biometric_pin', input.pin)
      .where('adms_held_biometric_bio_type', input.bioType)
      .where('adms_held_biometric_bio_no', input.bioNo)
      .first()

    const row = existing ?? new AdmsHeldBiometric()
    if (!existing) {
      row.accessPointId = input.accessPointId
      row.businessUnitId = input.businessUnitId
      row.admsHeldBiometricPin = input.pin
      row.admsHeldBiometricBioType = input.bioType
      row.admsHeldBiometricBioNo = input.bioNo
    }
    row.admsUnmappedPinId = input.admsUnmappedPinId
    row.admsHeldBiometricMajorVer = input.majorVer
    row.admsHeldBiometricMinorVer = input.minorVer
    row.admsHeldBiometricTemplate = input.template
    row.admsHeldBiometricSize = input.size

    try {
      await row.save()
    } catch (error) {
      // Otra subida del mismo lote lo creo entre la lectura y el alta.
      if (!isDuplicate(error)) throw error
    }
  }
}
