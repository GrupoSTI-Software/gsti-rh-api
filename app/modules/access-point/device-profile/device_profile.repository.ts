import type AccessPointProfile from '#models/access_point_profile'
import type { AdmsDialect } from '#modules/adms/adms.constants'

/** Puerto del perfil del equipo. Esta rebanada solo usa dialecto y codigo de registro. */
export interface DeviceProfileRepository {
  ensure(accessPointId: number, businessUnitId: number): Promise<AccessPointProfile>
  setDialect(
    accessPointId: number,
    businessUnitId: number,
    dialect: AdmsDialect
  ): Promise<AdmsDialect>
  setRegistryCode(accessPointId: number, businessUnitId: number, code: string): Promise<void>
}
