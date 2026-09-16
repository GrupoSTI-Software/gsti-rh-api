import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { TenantContext } from '#utils/tenant_context'
import { ADMS_RAW_STATUS } from '#modules/adms/adms.constants'
import { DEVICE_COMMAND_STATUS } from '#modules/device-commands/device_command.constants'
import { PHOTO_PUBLICATION_STATUS } from '#models/biometric_photo_publication'
import {
  ADMS_PURGE_BATCH_SIZE,
  admsCommandRetentionDays,
  admsPhotoPublicationRetentionDays,
  admsQuarantineRetentionDays,
  admsRawFailedRetentionDays,
  admsRawRetentionDays,
} from './retention.constants.js'

export interface PurgeResult {
  deleted: number
  /** Verdadero si se llego al tope de la tanda: queda mas para la proxima. */
  hasMore: boolean
}

/**
 * La purga corre por proceso, no por peticion: su trabajo es de TODAS las
 * empresas, y el corte por tenant la dejaria sin ver nada.
 */
const UNSCOPED_REASON = 'retencion ADMS: la purga corre sobre todas las empresas'

/**
 * Borrado por plazo (spec ADMS 13.12).
 *
 * Se borra en tandas y por FECHA, nunca por patron de serie ni por empresa: un
 * borrado manual "de lo de este equipo" es el que se lleva por delante lo que
 * no debia.
 *
 * Cada tanda es un DELETE acotado por id para no bloquear la tabla mientras el
 * canal sigue escribiendo: un checador que no puede guardar su crudo es un
 * checador que no acusa y se atora.
 */
export default class RetentionService {
  /** Crudos ya procesados o descartados que cumplieron su plazo. */
  async purgeRawMessages(now: DateTime = DateTime.utc()): Promise<PurgeResult> {
    const normalCutoff = now.minus({ days: admsRawRetentionDays() })
    const failedCutoff = now.minus({ days: admsRawFailedRetentionDays() })

    return TenantContext.runUnscoped(async () => {
      const ids = await db
        .from('adms_raw_messages')
        .where((group) => {
          group
            .whereIn('adms_raw_message_status', [
              ADMS_RAW_STATUS.PROCESSED,
              ADMS_RAW_STATUS.PARTIAL,
              ADMS_RAW_STATUS.UNPARSED,
            ])
            .where('adms_raw_message_created_at', '<', format(normalCutoff))
        })
        .orWhere((group) => {
          group
            .where('adms_raw_message_status', ADMS_RAW_STATUS.FAILED)
            .where('adms_raw_message_created_at', '<', format(failedCutoff))
        })
        .orderBy('adms_raw_message_id', 'asc')
        .limit(ADMS_PURGE_BATCH_SIZE)
        .select('adms_raw_message_id')

      return this.deleteByIds('adms_raw_messages', 'adms_raw_message_id', ids)
    }, UNSCOPED_REASON)
  }

  /**
   * Comandos cerrados que cumplieron su plazo.
   *
   * Los vivos NUNCA se tocan, por viejos que sean: un `pending` de hace un año
   * es un equipo que lleva un año sin recoger su orden, y borrarlo esconde el
   * problema en vez de resolverlo.
   */
  async purgeCommands(now: DateTime = DateTime.utc()): Promise<PurgeResult> {
    const cutoff = now.minus({ days: admsCommandRetentionDays() })

    return TenantContext.runUnscoped(async () => {
      const ids = await db
        .from('device_commands')
        .whereIn('device_command_status', [
          DEVICE_COMMAND_STATUS.EXECUTED,
          DEVICE_COMMAND_STATUS.FAILED,
          DEVICE_COMMAND_STATUS.CANCELLED,
          DEVICE_COMMAND_STATUS.EXPIRED,
        ])
        .where('device_command_created_at', '<', format(cutoff))
        .orderBy('device_command_id', 'asc')
        .limit(ADMS_PURGE_BATCH_SIZE)
        .select('device_command_id')

      return this.deleteByIds('device_commands', 'device_command_id', ids)
    }, UNSCOPED_REASON)
  }

  /**
   * Publicaciones que ya no sirven. Se borran antes que nada porque cada una
   * es un permiso escrito para bajar la cara de una persona.
   */
  async purgePhotoPublications(now: DateTime = DateTime.utc()): Promise<PurgeResult> {
    const cutoff = now.minus({ days: admsPhotoPublicationRetentionDays() })

    return TenantContext.runUnscoped(async () => {
      const ids = await db
        .from('biometric_photo_publications')
        .whereIn('biometric_photo_publication_status', [
          PHOTO_PUBLICATION_STATUS.WITHDRAWN,
          PHOTO_PUBLICATION_STATUS.EXPIRED,
        ])
        .where('biometric_photo_publication_updated_at', '<', format(cutoff))
        .orderBy('biometric_photo_publication_id', 'asc')
        .limit(ADMS_PURGE_BATCH_SIZE)
        .select('biometric_photo_publication_id')

      return this.deleteByIds(
        'biometric_photo_publications',
        'biometric_photo_publication_id',
        ids
      )
    }, UNSCOPED_REASON)
  }

  /**
   * Cierra las publicaciones vencidas antes de purgarlas: una fila `published`
   * con el plazo pasado ya no sirve para descargar, pero mientras diga
   * `published` cualquier lectura casual la lee como viva.
   */
  async expirePhotoPublications(now: DateTime = DateTime.utc()): Promise<number> {
    return TenantContext.runUnscoped(async () => {
      const updated = await db
        .from('biometric_photo_publications')
        .whereIn('biometric_photo_publication_status', [
          PHOTO_PUBLICATION_STATUS.PUBLISHED,
          PHOTO_PUBLICATION_STATUS.DOWNLOADED,
        ])
        .where('biometric_photo_publication_expires_at', '<', format(now))
        .update({
          biometric_photo_publication_status: PHOTO_PUBLICATION_STATUS.EXPIRED,
          biometric_photo_publication_updated_at: format(now),
        })
      return Array.isArray(updated) ? updated.length : Number(updated)
    }, UNSCOPED_REASON)
  }

  /** Cuarentenas que dejaron de llamar. Las reclamadas no se tocan: son historia. */
  async purgeQuarantine(now: DateTime = DateTime.utc()): Promise<PurgeResult> {
    const cutoff = now.minus({ days: admsQuarantineRetentionDays() })

    return TenantContext.runUnscoped(async () => {
      const ids = await db
        .from('adms_quarantined_devices')
        .whereIn('adms_quarantined_device_status', ['pending', 'dismissed'])
        .where('adms_quarantined_device_last_seen_at', '<', format(cutoff))
        .orderBy('adms_quarantined_device_id', 'asc')
        .limit(ADMS_PURGE_BATCH_SIZE)
        .select('adms_quarantined_device_id')

      return this.deleteByIds(
        'adms_quarantined_devices',
        'adms_quarantined_device_id',
        ids
      )
    }, UNSCOPED_REASON)
  }

  private async deleteByIds(
    table: string,
    idColumn: string,
    rows: Array<Record<string, unknown>>
  ): Promise<PurgeResult> {
    if (rows.length === 0) return { deleted: 0, hasMore: false }
    const ids = rows.map((row) => Number(row[idColumn]))
    const deleted = await db.from(table).whereIn(idColumn, ids).delete()
    return { deleted: Number(deleted), hasMore: rows.length === ADMS_PURGE_BATCH_SIZE }
  }
}

function format(value: DateTime): string {
  return value.toFormat('yyyy-MM-dd HH:mm:ss')
}
