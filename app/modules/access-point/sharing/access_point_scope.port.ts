import type AccessPoint from '#models/access_point'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/** Scope del canal ADMS de un checador y si alguna vez se compartio. */
export interface ChannelScope {
  /**
   * La responsable primero, luego las invitadas vivas por antiguedad de la
   * invitacion y al final, ascendentes, las empresas con vinculos no revocados
   * o comandos vivos en el aparato. Sin duplicados.
   */
  participantBusinessUnitIds: number[]
  /** El aparato tiene o tuvo al menos una invitacion, viva o revocada. */
  everShared: boolean
}

/** Papel de una empresa sobre un checador que ve. */
export type AccessPointRole = 'owner' | 'guest'

/** Papel y scope de una empresa sobre un checador (sin el checador). */
export interface AccessPointRoleScope {
  role: AccessPointRole
  /**
   * Scope del aparato: responsable e invitadas vivas, o el del canal con
   * `includeLingering`. Toda operacion sobre el aparato corre dentro de el.
   */
  deviceScope: number[]
}

/** Un checador que la peticion puede ver, con su papel y su scope. */
export interface AccessPointVisibility extends AccessPointRoleScope {
  accessPoint: AccessPoint
}

/** Opciones de la regla de visibilidad. */
export interface VisibilityOptions {
  /**
   * Admite tambien a la ex-invitada con personal sin baja confirmada en el
   * aparato (scope del canal). Solo para cerrar esos vinculos, nunca para
   * operar el aparato.
   */
  includeLingering?: boolean
}

/**
 * Puerto del scope de un checador: la responsable y sus invitadas vivas
 * (VLRH-P0065, 3.4).
 *
 * Punto unico de verdad de "quien participa de un aparato". Lo usan el canal,
 * el guard de comandos, la autorizacion del Backoffice, la replicacion y la
 * desasignacion. El adaptador lee sin mixin: corre antes de que exista
 * contexto de tenant o con la responsable fuera del alcance.
 */
export interface AccessPointScopePort {
  /**
   * Empresas que operan el checador en el Backoffice: la responsable primero y
   * despues las invitadas vivas por antiguedad de la invitacion.
   */
  participants(accessPointId: number, ownerBusinessUnitId: number): Promise<number[]>

  /**
   * Scope del canal ADMS (`ChannelScope.participantBusinessUnitIds`). Mas
   * amplio que `participants`: incluye a la ex-invitada mientras el aparato no
   * confirme la baja de su personal.
   */
  channelParticipants(accessPointId: number, ownerBusinessUnitId: number): Promise<number[]>

  /**
   * El scope del canal y si el aparato se compartio alguna vez, en una
   * consulta. Con `client`, lee en esa conexion (p. ej. la transaccion que
   * tiene el aparato bloqueado) en vez de pedir otra al pool.
   */
  channelScope(
    accessPointId: number,
    ownerBusinessUnitId: number,
    client?: QueryClientContract
  ): Promise<ChannelScope>

  /** Empresa responsable del aparato, o `null` si no existe o esta borrado. */
  ownerOf(accessPointId: number): Promise<number | null>

  /**
   * La empresa es la responsable del aparato vivo o una invitada viva. Con
   * `client`, lee en esa conexion (p. ej. la transaccion que tiene el aparato
   * bloqueado) en vez de pedir otra al pool.
   */
  isParticipant(
    accessPointId: number,
    businessUnitId: number,
    client?: QueryClientContract
  ): Promise<boolean>

  /**
   * Scope de las operaciones centradas en un colaborador: su empresa, las
   * responsables de los checadores compartidos con ella y las de aparatos
   * donde su personal tiene vinculos no revocados.
   */
  forEmployee(businessUnitId: number): Promise<number[]>

  /** Checadores ajenos con invitacion viva para la empresa. */
  sharedWith(businessUnitId: number): Promise<number[]>

  /**
   * Regla unica de "quien ve un checador" (VLRH-P0065, 6): `owner` si la
   * responsable esta en el alcance de la peticion; `guest` si alguna empresa
   * del alcance participa del aparato; `null` si no lo ve, si no existe o si
   * el alcance viene vacio (falla cerrado).
   */
  visibleTo(
    accessPointId: number,
    requestScope: number[],
    options?: VisibilityOptions
  ): Promise<AccessPointVisibility | null>

  /**
   * La misma regla que `visibleTo` sobre un checador que el llamador ya leyo
   * (con sus propias columnas): devuelve papel y scope, o `null`.
   */
  roleOf(
    accessPoint: { accessPointId: number; businessUnitId: number },
    requestScope: number[],
    options?: VisibilityOptions
  ): Promise<AccessPointRoleScope | null>
}
