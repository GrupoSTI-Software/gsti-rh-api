import {
  ADMS_CA_PUSH_OPTIONS,
  ADMS_HANDSHAKE,
  ADMS_HANDSHAKE_VARIANT,
  ADMS_REGISTRY_CODE_PREFIX,
  ADMS_STAMP_INITIAL,
  ADMS_STAMP_TABLES,
  ADMS_TRANS_FLAG,
} from '#modules/adms/adms.constants'

/**
 * Bloques de saludo del canal (spec v2, seccion 2). El bloque `minimal` es el que
 * la sonda emitio por defecto; `extended` suma TransFlag, Stamp y OpStamp como
 * hipotesis hasta la prueba 16.1. Lineas unidas por `\n`, nunca CRLF.
 */
export default class AdmsHandshakeService {
  constructor(private readonly variant: 'extended' | 'minimal' = ADMS_HANDSHAKE_VARIANT) {}

  buildHandshake(stamps: Record<string, string>): string {
    const stampOf = (table: string) => stamps[table] ?? ADMS_STAMP_INITIAL
    const lines: string[] = [
      `ServerVer=${ADMS_HANDSHAKE.serverVer}`,
      `GET OPTION FROM=${ADMS_HANDSHAKE.getOptionFrom}`,
      `ATTLOGStamp=${stampOf('ATTLOG')}`,
      `OPERLOGStamp=${stampOf('OPERLOG')}`,
      `USERINFOStamp=${stampOf('USERINFO')}`,
      `ATTPHOTOStamp=${stampOf('ATTPHOTO')}`,
    ]
    if (this.variant === 'extended') {
      lines.push(`BIODATAStamp=${stampOf('BIODATA')}`)
    }
    lines.push(
      `ErrorDelay=${ADMS_HANDSHAKE.errorDelay}`,
      `Delay=${ADMS_HANDSHAKE.delay}`,
      `TransTimes=${ADMS_HANDSHAKE.transTimes}`,
      `TransInterval=${ADMS_HANDSHAKE.transInterval}`,
      `Realtime=${ADMS_HANDSHAKE.realtime}`,
      `Encrypt=${ADMS_HANDSHAKE.encrypt}`
    )
    if (this.variant === 'extended') {
      lines.push(
        `TransFlag=${ADMS_TRANS_FLAG}`,
        `Stamp=${stampOf('ATTLOG')}`,
        `OpStamp=${stampOf('OPERLOG')}`
      )
    }
    return lines.join('\n')
  }

  buildCaPushOptions(timezoneOffsetHours: number, sessionId: string): string {
    return [
      `ServerVersion=${ADMS_CA_PUSH_OPTIONS.serverVersion}`,
      `ServerName=${ADMS_CA_PUSH_OPTIONS.serverName}`,
      `PushVersion=${ADMS_CA_PUSH_OPTIONS.pushVersion}`,
      `ErrorDelay=${ADMS_CA_PUSH_OPTIONS.errorDelay}`,
      `Delay=${ADMS_CA_PUSH_OPTIONS.delay}`,
      `TransTimes=${ADMS_CA_PUSH_OPTIONS.transTimes}`,
      `TransInterval=${ADMS_CA_PUSH_OPTIONS.transInterval}`,
      `TransFlag=${ADMS_TRANS_FLAG}`,
      `TimeZone=${timezoneOffsetHours}`,
      `Realtime=${ADMS_CA_PUSH_OPTIONS.realtime}`,
      `SessionID=${sessionId}`,
      `Encrypt=${ADMS_CA_PUSH_OPTIONS.encrypt}`,
    ].join('\n')
  }

  registryCodeFor(accessPointId: number): string {
    return `${ADMS_REGISTRY_CODE_PREFIX}${accessPointId}`
  }

  /** Tablas cuyo stamp se devuelve, para que el controlador pida solo esas. */
  stampTables(): readonly string[] {
    return ADMS_STAMP_TABLES
  }
}
