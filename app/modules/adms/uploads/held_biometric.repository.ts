export interface HeldBiometricInput {
  admsUnmappedPinId: number | null
  accessPointId: number
  businessUnitId: number
  pin: string
  bioType: number
  bioNo: number
  majorVer: string | null
  minorVer: string | null
  template: string
  size: number
}

/**
 * Puerto de la retencion de biometricos (spec 9.4). `hold` es idempotente por
 * (dispositivo, PIN, modalidad, numero): el equipo reintenta el lote entero.
 */
export interface HeldBiometricRepository {
  hold(input: HeldBiometricInput): Promise<void>
}
