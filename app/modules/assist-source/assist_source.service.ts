import Assist from '#models/assist'
import AccessPoint from '#models/access_point'
import User from '#models/user'
import {
  ASSIST_SOURCE_KIND,
  parseAssistLocation,
  resolveAssistSourceKind,
  resolveDeviceChannel,
  resolveVerifyMethod,
  type AssistDeviceChannel,
  type AssistLocation,
  type AssistSourceKind,
  type AssistVerifyMethod,
} from './assist_source.rules.js'

/** Checador dado de alta en la plataforma (canal ADMS). */
export interface AssistRegisteredDevice {
  name: string
  model: string | null
  lastConnectionAt: string | null
}

/** Checador que registró la checada. */
export interface AssistSourceDevice {
  alias: string | null
  area: string | null
  serialNumber: string | null
  channel: AssistDeviceChannel
  verifyMethod: AssistVerifyMethod | null
  /** Solo los checadores dados de alta por ADMS; los de BioTime no están registrados. */
  registered: AssistRegisteredDevice | null
}

/** Dónde y cómo se hizo una checada. */
export interface AssistSource {
  assistId: number
  punchTimeUtc: string | null
  kind: AssistSourceKind
  location: AssistLocation | null
  device: AssistSourceDevice | null
  /** Quién la capturó desde el backoffice. */
  capturedBy: { name: string } | null
}

/**
 * Origen de una checada para el detalle del registro: ubicación, checador o
 * captura administrativa. La consulta pasa por el filtro de empresa del
 * modelo, así que una checada de otra empresa simplemente no existe.
 */
export default class AssistSourceService {
  async find(assistId: number): Promise<AssistSource | null> {
    const assist = await Assist.query().where('assistId', assistId).first()
    if (!assist) return null

    const location = parseAssistLocation(
      assist.assistLatitude,
      assist.assistLongitude,
      assist.assistPrecision
    )
    const kind = resolveAssistSourceKind({
      origin: assist.assistOrigin,
      terminalSerialNumber: assist.assistTerminalSn,
      createdByUserId: assist.assistCreatedByUserId,
      hasLocation: location !== null,
    })

    return {
      assistId: assist.assistId,
      punchTimeUtc: assist.assistPunchTimeUtc?.toISO?.() ?? null,
      kind,
      location,
      device: kind === ASSIST_SOURCE_KIND.DEVICE ? await this.device(assist) : null,
      capturedBy: assist.assistCreatedByUserId
        ? await this.capturedBy(assist.assistCreatedByUserId)
        : null,
    }
  }

  private async device(assist: Assist): Promise<AssistSourceDevice> {
    return {
      alias: assist.assistTerminalAlias || null,
      area: assist.assistAreaAlias || null,
      serialNumber: assist.assistTerminalSn || null,
      channel: resolveDeviceChannel(assist.assistOrigin),
      verifyMethod: resolveVerifyMethod(assist.assistVerifyMethod),
      registered: await this.registeredDevice(assist),
    }
  }

  private async registeredDevice(assist: Assist): Promise<AssistRegisteredDevice | null> {
    const query = AccessPoint.query().preload('platformDevice', (device) => {
      device.preload('deviceModel')
    })
    if (assist.assistTerminalId) {
      query.where('accessPointId', assist.assistTerminalId)
    } else if (assist.assistTerminalSn) {
      query.where('accessPointSerialNumber', assist.assistTerminalSn)
    } else {
      return null
    }

    const accessPoint = await query.first()
    if (!accessPoint) return null
    const model = accessPoint.platformDevice?.deviceModel
    return {
      name: accessPoint.accessPointName,
      model: model
        ? `${model.platformDeviceModelBrand} ${model.platformDeviceModelName}`.trim()
        : null,
      lastConnectionAt: accessPoint.accessPointLastConnection?.toISO() ?? null,
    }
  }

  private async capturedBy(userId: number): Promise<{ name: string } | null> {
    const user = await User.query().where('userId', userId).preload('person').first()
    const person = user?.person
    if (!person) return null
    const name = [person.personFirstname, person.personLastname, person.personSecondLastname]
      .filter(Boolean)
      .join(' ')
    return name ? { name } : null
  }
}
