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

/**
 * Puerto del scope de un checador: la responsable y sus invitadas vivas
 * (VLRH-P0065, 3.4).
 *
 * Punto unico de verdad de "quien participa de un aparato". Lo usan el canal,
 * el guard de comandos, la autorizacion del Backoffice, la replicacion y la
 * desasignacion. El adaptador lee sin modelo ni mixin: corre antes de que
 * exista contexto de tenant.
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

  /** El scope del canal y si el aparato se compartio alguna vez, en una consulta. */
  channelScope(accessPointId: number, ownerBusinessUnitId: number): Promise<ChannelScope>

  /** Empresa responsable del aparato, o `null` si no existe o esta borrado. */
  ownerOf(accessPointId: number): Promise<number | null>

  /** La empresa es la responsable del aparato vivo o una invitada viva. */
  isParticipant(accessPointId: number, businessUnitId: number): Promise<boolean>

  /**
   * Scope de las operaciones centradas en un colaborador: su empresa, las
   * responsables de los checadores compartidos con ella y las de aparatos
   * donde su personal tiene vinculos no revocados.
   */
  forEmployee(businessUnitId: number): Promise<number[]>

  /** Checadores ajenos con invitacion viva para la empresa. */
  sharedWith(businessUnitId: number): Promise<number[]>
}
