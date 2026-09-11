import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import type { ResolvedAdmsDevice } from '#modules/adms/channel/adms_device_resolver.service'
import { parseOptionsBody, resolveVersions } from '#modules/adms/parsers/options.parser'
import { attlogLayoutFor } from '#modules/adms/parsers/parser.types'
import IncidentService from '#modules/adms/raw/incident.service'
import logger from '@adonisjs/core/services/logger'
import type AccessPointProfile from '#models/access_point_profile'
import ExecutionEvidenceService from '#modules/device-commands/evidence/execution_evidence.service'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import DeviceProfileRepositoryMysql from './device_profile.repository.mysql.js'
import {
  clampBytes,
  clampProfileTexts,
  clampText,
  DESCRIPTOR_TEXT_LIMITS,
  OPTIONS_RAW_MAX_BYTES,
} from './device_profile.limits.js'
import type {
  AccessPointDescriptor,
  DeviceProfilePatch,
  DeviceProfileRepository,
} from './device_profile.repository.js'

export interface OptionsUpsertResult {
  platform: string | null
  layoutKnown: boolean
  changedFields: string[]
  mismatches: number
}

interface VersionChange {
  field: string
  previous: string
  current: string
}

const VERSION_CHANGED_DEDUPE_MINUTES = 60

/**
 * El equipo saluda cada pocos segundos. Un dia de silencio basta para que
 * alguien lo atienda sin que el mismo hecho llene la bitacora sondeo tras
 * sondeo.
 */
const ROSTER_SHRUNK_DEDUPE_MINUTES = 24 * 60

/** Un aviso al dia basta: el aparato saluda muchas veces con la misma identidad. */
const IDENTITY_CHANGED_DEDUPE_MINUTES = 24 * 60
const PLATFORM_DEDUPE_MINUTES = 24 * 60

/**
 * Perfil del equipo a partir de `options` (spec 9.1). Nunca bloquea la
 * subida: una plataforma desconocida o un cambio de version quedan como
 * incidentes y el perfil se escribe igual. Ausencia de dato es null.
 */
export default class DeviceProfileService {
  constructor(
    private readonly profiles: DeviceProfileRepository = new DeviceProfileRepositoryMysql(),
    private readonly incidents: IncidentService = new IncidentService(),
    private readonly evidence: ExecutionEvidenceService = new ExecutionEvidenceService(),
    private readonly commands: DeviceCommandPort = new DeviceCommandService(),
    private readonly pivots: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql()
  ) {}

  /**
   * Llena el perfil con el volcado que el equipo devuelve al acusar un `INFO`
   * (spec 6.5, medido en hardware el 2026-09-08).
   *
   * Existe porque hay un hueco real en el ciclo: un aparato que hizo su saludo
   * mientras estaba en cuarentena recibio un `OK` seco, se quedo sondeando y NO
   * vuelve a saludar por su cuenta. Sin `options` no hay plataforma, y sin
   * plataforma sus checadas se leen con una disposicion que puede no ser la
   * suya. `INFO` es la unica via de preguntarselo.
   *
   * El volcado trae los mismos pares que `options` separados por saltos de
   * linea en vez de comas, asi que lo interpreta el mismo parser.
   */
  async upsertFromInfo(
    device: ResolvedAdmsDevice,
    dump: string,
    rawMessageId: number
  ): Promise<OptionsUpsertResult> {
    return this.upsertFromOptions(device, dump, rawMessageId)
  }

  async upsertFromOptions(
    device: ResolvedAdmsDevice,
    body: string,
    rawMessageId: number
  ): Promise<OptionsUpsertResult> {
    const parsed = parseOptionsBody(body)
    const versions = resolveVersions(parsed)
    const previous = await this.profiles.ensure(device.accessPointId, device.businessUnitId)

    /**
     * Se mira ANTES de aplicar el patch: `previous` es la fila viva y en cuanto
     * se escriben las opciones nuevas ya no queda con que comparar.
     */
    await this.checkIdentityChange(device, previous, parsed.platform)

    const changes = this.detectVersionChanges(previous, {
      fwVersion: parsed.fwVersion,
      fpVersion: versions.fpVersion,
      faceVersion: versions.faceVersion,
    })
    for (const change of changes) {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.VERSION_CHANGED,
          severity: 'warning',
          code: ADMS_ERROR_CODES.DEV_SERIAL_UNKNOWN,
          title: 'El checador cambio de version',
          detail:
            'El equipo declara un firmware o algoritmo distinto al que tenia registrado. Revisar compatibilidad de templates antes de replicar.',
          key: 'version-cambiada',
          serial: device.serial,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          rawMessageId,
          context: { field: change.field, previous: change.previous, current: change.current },
          now: device.receivedAt,
        },
        { dedupeMinutes: VERSION_CHANGED_DEDUPE_MINUTES }
      )

      /**
       * Un cambio de algoritmo de huella deja invalida la cola de ese equipo.
       *
       * Lo encolado lleva templates de la generacion anterior y ese aparato ya
       * no sabe leerlos. Peor: la escritura va por `FINGERTMP`, que no lleva
       * la version dentro, asi que el equipo contesta `Return=0`, sube su
       * contador y descarta el dato. El aviso quedaria abierto mientras la
       * pantalla anuncia una huella que no existe.
       *
       * Se cancela en vez de retener porque no es un estado pasajero: ese
       * template no va a servir para este equipo mas tarde. Lo que si sirve se
       * vuelve a encolar solo, cuando alguien enrole en la version nueva.
       */
      if (change.field === 'fpVersion' && device.accessPointId !== null) {
        await this.cancelStaleFingerprintWrites(device.accessPointId)
      }
    }

    for (const mismatch of versions.mismatches) {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.VERSION_SOURCE_MISMATCH,
          severity: 'info',
          code: ADMS_ERROR_CODES.DEV_SERIAL_UNKNOWN,
          title: 'Versiones de algoritmo discrepantes',
          detail:
            'MultiBioVersion y el campo suelto no coinciden; prevalece MultiBioVersion (spec 9.1).',
          key: 'version-discrepante',
          serial: device.serial,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          rawMessageId,
          context: {
            modality: mismatch.modality,
            previous: mismatch.flat,
            current: mismatch.multi,
          },
          now: device.receivedAt,
        },
        { dedupeMinutes: PLATFORM_DEDUPE_MINUTES }
      )
    }

    /**
     * Lo que el equipo NO declara en este mensaje no deja de ser cierto.
     *
     * Un volcado de opciones puede venir parcial --el firmware manda lo que le
     * toca segun el comando, y los hay que solo traen un punado de claves-- y
     * escribir `null` encima borraba conocimiento bueno: un mensaje con tres
     * campos dejaba la ficha sin firmware, sin version de rostro y sin
     * conteos, y nada en pantalla explicaba por que. El perfil es "lo ultimo
     * que el equipo declaro de CADA cosa", no "lo que declaro la ultima vez".
     *
     * Borrar un dato sigue siendo posible: el equipo manda el valor nuevo y
     * ese si pisa. Lo que no puede es borrarse por omision.
     */
    const keep = <T>(current: T | null | undefined, before: T | null | undefined): T | null =>
      current ?? before ?? null

    const platform = keep(parsed.platform, previous.accessPointProfilePlatform)

    /**
     * La disposicion se recalcula con la plataforma EFECTIVA, no con la del
     * mensaje: si esta no la trae, seguimos sabiendo leer sus checadas igual
     * que hace un minuto.
     */
    const layout = attlogLayoutFor(platform)
    const layoutKnown = layout !== null
    /**
     * El equipo ya declaro una plataforma que si sabemos leer: los avisos que
     * decian lo contrario dejan de ser ciertos. Si se quedaran abiertos, la
     * ficha marcaria un problema inexistente para siempre y la gente
     * aprenderia a ignorar el indicador.
     */
    if (layoutKnown) {
      await this.incidents.resolveResolvedCause(
        ADMS_INCIDENT_KIND.UNKNOWN_PLATFORM,
        device.accessPointId,
        device.receivedAt
      )
      await this.incidents.resolveResolvedCause(
        ADMS_INCIDENT_KIND.UNKNOWN_LAYOUT,
        device.accessPointId,
        device.receivedAt
      )
    }
    if (parsed.platform !== null && !layoutKnown) {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.UNKNOWN_PLATFORM,
          severity: 'warning',
          code: ADMS_ERROR_CODES.VAL_LAYOUT_UNKNOWN,
          title: 'Plataforma no validada',
          detail:
            'El equipo declara una plataforma fuera del mapa validado en hardware; las checadas se guardaran crudas hasta que se agregue su disposicion.',
          key: 'plataforma-desconocida',
          serial: device.serial,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          rawMessageId,
          context: { platform: parsed.platform },
          now: device.receivedAt,
        },
        { dedupeMinutes: PLATFORM_DEDUPE_MINUTES }
      )
    }

    const patch: DeviceProfilePatch = {
      accessPointProfilePlatform: platform,
      accessPointProfileFwVersion: keep(parsed.fwVersion, previous.accessPointProfileFwVersion),
      accessPointProfilePushVersion: keep(
        parsed.pushVersion,
        previous.accessPointProfilePushVersion
      ),
      accessPointProfileOemVendor: keep(parsed.oemVendor, previous.accessPointProfileOemVendor),
      accessPointProfileLayoutKnown: layoutKnown ? 1 : 0,
      accessPointProfileFpVersion: keep(versions.fpVersion, previous.accessPointProfileFpVersion),
      accessPointProfileFaceVersion: keep(
        versions.faceVersion,
        previous.accessPointProfileFaceVersion
      ),
      accessPointProfileFvVersion: keep(versions.fvVersion, previous.accessPointProfileFvVersion),
      accessPointProfilePvVersion: keep(versions.pvVersion, previous.accessPointProfilePvVersion),
      accessPointProfileVersionsSource:
        Object.keys(versions.source).length > 0
          ? versions.source
          : previous.accessPointProfileVersionsSource,
      accessPointProfileMultiBioDataSupport: keep(
        parsed.multiBioDataSupport,
        previous.accessPointProfileMultiBioDataSupport
      ),
      accessPointProfileMultiBioPhotoSupport: keep(
        parsed.multiBioPhotoSupport,
        previous.accessPointProfileMultiBioPhotoSupport
      ),
      accessPointProfileMultiBioVersion: keep(
        parsed.multiBioVersion,
        previous.accessPointProfileMultiBioVersion
      ),
      accessPointProfileMaxMultiBioDataCount: keep(
        parsed.maxMultiBioDataCount,
        previous.accessPointProfileMaxMultiBioDataCount
      ),
      accessPointProfileMaxMultiBioPhotoCount: keep(
        parsed.maxMultiBioPhotoCount,
        previous.accessPointProfileMaxMultiBioPhotoCount
      ),
      accessPointProfileMaxFaceCount: keep(
        parsed.maxFaceCount,
        previous.accessPointProfileMaxFaceCount
      ),
      accessPointProfileMaxUserPhotoCount: keep(
        parsed.maxUserPhotoCount,
        previous.accessPointProfileMaxUserPhotoCount
      ),
      accessPointProfileMaxUserCount: keep(
        parsed.maxUserCount,
        previous.accessPointProfileMaxUserCount
      ),
      accessPointProfileMaxFingerCount: keep(
        parsed.maxFingerCount,
        previous.accessPointProfileMaxFingerCount
      ),
      accessPointProfileMaxAttLogCount: keep(
        parsed.maxAttLogCount,
        previous.accessPointProfileMaxAttLogCount
      ),
      accessPointProfileUserCount: keep(parsed.userCount, previous.accessPointProfileUserCount),
      accessPointProfileFpCount: keep(parsed.fpCount, previous.accessPointProfileFpCount),
      accessPointProfileFaceCount: keep(parsed.faceCount, previous.accessPointProfileFaceCount),
      accessPointProfileTransactionCount: keep(
        parsed.transactionCount,
        previous.accessPointProfileTransactionCount
      ),
      accessPointProfileFingerFunOn: keep(
        parsed.fingerFunOn,
        previous.accessPointProfileFingerFunOn
      ),
      accessPointProfileFaceFunOn: keep(parsed.faceFunOn, previous.accessPointProfileFaceFunOn),
      accessPointProfilePhotoFunOn: keep(parsed.photoFunOn, previous.accessPointProfilePhotoFunOn),
      accessPointProfileUserPicUrlFunOn: keep(
        parsed.userPicUrlFunOn,
        previous.accessPointProfileUserPicUrlFunOn
      ),
      accessPointProfileSipEnableUnit: keep(
        parsed.sipEnableUnit,
        previous.accessPointProfileSipEnableUnit
      ),
      accessPointProfileVisualIntercomFunOn: keep(
        parsed.visualIntercomFunOn,
        previous.accessPointProfileVisualIntercomFunOn
      ),
      accessPointProfileSubcontractingUpgradeFunOn: keep(
        parsed.subcontractingUpgradeFunOn,
        previous.accessPointProfileSubcontractingUpgradeFunOn
      ),
      accessPointProfileVideoProtocol: keep(
        parsed.videoProtocol,
        previous.accessPointProfileVideoProtocol
      ),
      accessPointProfileOptionsRaw:
        body.length > 0
          ? clampBytes(body, OPTIONS_RAW_MAX_BYTES)
          : previous.accessPointProfileOptionsRaw,
      /** Cuando se leyo: esto si es de esta peticion, siempre. */
      accessPointProfileOptionsReadAt: device.receivedAt,
    }
    /**
     * Recortado al ancho de cada columna. Lo que manda el equipo no lo valida
     * nadie y un firmware distinto puede traer un valor mas largo del que cabe:
     * en modo estricto eso no trunca, falla, y el perfil se queda sin
     * actualizar mientras cada subida levanta un incidente.
     */
    await this.profiles.applyOptions(
      device.accessPointId,
      device.businessUnitId,
      clampProfileTexts(patch)
    )

    const descriptor: AccessPointDescriptor = {
      deviceName: clampText(parsed.deviceName, DESCRIPTOR_TEXT_LIMITS.deviceName),
      mac: clampText(parsed.mac, DESCRIPTOR_TEXT_LIMITS.mac),
      ip: clampText(parsed.ipAddress, DESCRIPTOR_TEXT_LIMITS.ip),
      firmware: clampText(parsed.fwVersion, DESCRIPTOR_TEXT_LIMITS.firmware),
      platform: clampText(parsed.platform, DESCRIPTOR_TEXT_LIMITS.platform),
    }
    if (Object.values(descriptor).some((value) => value !== null)) {
      await this.profiles.copyDescriptor(device.accessPointId, descriptor)
    }

    /**
     * Los contadores del equipo son la tercera prueba de ejecucion (spec 6.6):
     * si el numero de huellas subio respecto al que se guardo al acusar, la
     * huella entro. En su propio try/catch, que el perfil ya se guardo.
     */
    try {
      await this.evidence.fromCounters({
        accessPointId: device.accessPointId,
        counters: {
          fpCount: parsed.fpCount,
          faceCount: parsed.faceCount,
          userCount: parsed.userCount,
        },
        now: device.receivedAt,
      })
    } catch (error) {
      logger.warn(
        { accessPointId: device.accessPointId, error: (error as Error).message.slice(0, 200) },
        'canal ADMS: el perfil se guardo pero no se pudo cerrar un comando con sus contadores'
      )
    }

    await this.checkRosterShrunk(device, parsed.userCount)

    return {
      platform: parsed.platform,
      layoutKnown,
      changedFields: changes.map((change) => change.field),
      mismatches: versions.mismatches.length,
    }
  }

  /**
   * El aparato dice ser otro.
   *
   * Se mira SOLO la plataforma. El firmware tambien cambia --y ese cambio ya lo
   * cuenta `version_changed`-- pero actualizarlo es una operacion normal; la
   * plataforma, en cambio, no cambia nunca en un mismo aparato: un SpeedFace no
   * se convierte en SenseFace actualizandose. Contar los dos daria dos avisos
   * para la misma señal y uno de ellos seria falso la mayoria de las veces.
   *
   * La declara el propio equipo, asi que quien capture una sesion legitima la
   * replica: esto no es una puerta, es una alarma. Sirve para el atacante torpe
   * y para el caso real de un aparato reemplazado sin avisar, que deja a una
   * sede con biometricos que ya no sirven.
   *
   * **La excepcion importa:** reclamar un equipo, o rotarle la direccion,
   * cambia la identidad de forma legitima --es otro aparato ocupando el mismo
   * punto de acceso--. Si alguien lo configuro despues de la ultima lectura del
   * perfil, la identidad nueva se adopta como buena. Sin esto, cada alta
   * naceria con un incidente de seguridad abierto y la gente aprenderia a
   * ignorarlos.
   */
  private async checkIdentityChange(
    device: ResolvedAdmsDevice,
    previous: AccessPointProfile,
    platform: string | null
  ): Promise<void> {
    const before = previous.accessPointProfilePlatform
    if (!before || !platform || before === platform) return

    const readAt = previous.accessPointProfileOptionsReadAt ?? null
    const configuredAfterLastRead =
      device.configuredAt !== null && (readAt === null || device.configuredAt > readAt)
    if (configuredAfterLastRead) return

    try {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.DEVICE_IDENTITY_CHANGED,
          severity: 'error',
          code: ADMS_ERROR_CODES.DEV_IDENTITY_CHANGED,
          title: 'El checador dice ser otro aparato',
          detail:
            'Declara una plataforma o un firmware distintos de los registrados, y nadie lo reclamo ni le cambio la direccion en medio. Se retienen sus copias de biometricos hasta que alguien confirme que es el mismo equipo.',
          key: 'identidad-del-checador-cambio',
          serial: device.serial,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          context: { field: 'platform', previous: before, current: platform },
          now: device.receivedAt,
        },
        { dedupeMinutes: IDENTITY_CHANGED_DEDUPE_MINUTES }
      )
    } catch (error: unknown) {
      logger.warn(
        { accessPointId: device.accessPointId, err: error },
        'canal ADMS: no se pudo asentar el cambio de identidad del equipo'
      )
    }
  }

  /**
   * El equipo declara menos gente dentro de la que se le dio de alta.
   *
   * Pasa con un reset de fabrica, con un reemplazo, y --medido el 2026-09-10--
   * al cambiar la version del algoritmo de huella, que borra todo lo que el
   * aparato tenia. Del lado de aca todo sigue en `confirmed`: la pantalla dice
   * que la persona esta registrada y el lector no la conoce. Nadie se entera
   * hasta que alguien se queda parado en la puerta.
   *
   * Se mira el CONTADOR del saludo y no las lineas `USER` de un padron: los
   * `~Max*Count` son tamanos de lote --el SenseFace manda de 30 en 30-- asi
   * que un lote nunca declara a todos y leer ausencias ahi daria falsos
   * positivos en masa. El contador es global.
   *
   * Solo cuenta hacia abajo. Que el aparato tenga MAS gente de la que sabemos
   * es otra historia --alguien dado de alta a mano en el teclado-- y no deja a
   * nadie fuera.
   */
  private async checkRosterShrunk(
    device: ResolvedAdmsDevice,
    declared: number | null
  ): Promise<void> {
    if (declared === null) return

    try {
      const expected = await this.pivots.countConfirmedBefore(
        device.accessPointId,
        device.receivedAt
      )
      if (expected === 0 || declared >= expected) return

      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.DEVICE_ROSTER_SHRUNK,
          severity: 'error',
          code: ADMS_ERROR_CODES.DEV_ROSTER_SHRUNK,
          title: 'El equipo perdio gente que tenia dada de alta',
          detail:
            'El checador declara menos personas dentro de las que se le dieron de alta. Suele ser un reset, un reemplazo o un cambio de version de algoritmo de huella, que borra todo lo que el aparato guardaba. Quien falte no podra identificarse hasta que se le vuelva a dar de alta.',
          key: 'padron-del-equipo-encogido',
          serial: device.serial,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          context: { declared, expected },
          now: device.receivedAt,
        },
        { dedupeMinutes: ROSTER_SHRUNK_DEDUPE_MINUTES }
      )
    } catch (error: unknown) {
      logger.warn(
        { accessPointId: device.accessPointId, err: error },
        'canal ADMS: no se pudo comparar el padron declarado contra el pivote'
      )
    }
  }

  /**
   * No lanza: el canal esta respondiendo un `options` y una cola que no se pudo
   * limpiar no puede convertir ese acuse en un error para el aparato.
   */
  private async cancelStaleFingerprintWrites(accessPointId: number): Promise<void> {
    try {
      const cancelled = await this.commands.cancelFingerprintWritesFor(accessPointId)
      if (cancelled > 0) {
        logger.warn(
          { accessPointId, cancelled },
          'canal ADMS: el equipo cambio de version de huella; se cancelaron las copias en cola'
        )
      }
    } catch (error: unknown) {
      logger.warn(
        { accessPointId, err: error },
        'canal ADMS: no se pudieron cancelar las copias de huella tras el cambio de version'
      )
    }
  }

  /** Solo cuenta como cambio cuando habia valor previo y el nuevo existe y difiere. */
  private detectVersionChanges(
    previous: {
      accessPointProfileFwVersion?: string | null
      accessPointProfileFpVersion?: string | null
      accessPointProfileFaceVersion?: string | null
    },
    current: { fwVersion: string | null; fpVersion: string | null; faceVersion: string | null }
  ): VersionChange[] {
    const pairs: Array<[string, string | null | undefined, string | null]> = [
      ['fwVersion', previous.accessPointProfileFwVersion, current.fwVersion],
      ['fpVersion', previous.accessPointProfileFpVersion, current.fpVersion],
      ['faceVersion', previous.accessPointProfileFaceVersion, current.faceVersion],
    ]
    const changes: VersionChange[] = []
    for (const [field, before, after] of pairs) {
      if (before && after && before !== after) {
        changes.push({ field, previous: before, current: after })
      }
    }
    return changes
  }
}
