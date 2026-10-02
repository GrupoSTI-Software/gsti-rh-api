import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { ASSIST_ORIGIN } from '#constants/assist_origin'
import type { AssistCreateFrom } from '#constants/assist_origin'
import {
  biometricStoredToUtc,
  parseBiometricStored,
} from '#modules/attendance-time/biometric_clock'
import SiteTimeZoneService from '#modules/attendance-time/site_time_zone.service'
import type { ResolvedSiteTimeZone } from '#modules/attendance-time/attendance_time.interface'
import { assistChannelSentinel, computeAssistNaturalKey } from '#utils/assist_natural_key'

const DEFAULT_BATCH = 5000
const SAMPLE_SIZE = 5
const SQL_DATE_TIME = 'yyyy-MM-dd HH:mm:ss'

/** Fila candidata leída como texto para que el driver no le mueva la zona. */
interface CandidateRow {
  assist_id: number | string
  business_unit_id: number | string
  assist_emp_code: string | null
  assist_terminal_sn: string | null
  assist_origin: string | null
  punch_utc: string
  employee_id: number | string | null
}

interface TenantCounters {
  evaluated: number
  changed: number
  unchanged: number
  collided: number
}

interface Sample {
  assistId: number
  before: string
  after: string
  zone: string
}

/**
 * Lleva a UTC real las checadas históricas del puente BioTime.
 *
 * El checador guardaba `assist_punch_time_utc` como hora de pared más su
 * propio offset (+5 de abril a octubre, +6 el resto). Desde que el puente
 * convierte al insertar, las filas nuevas ya nacen en UTC real; este comando
 * recorre las anteriores, recupera la pared con `biometric_clock` y la expresa
 * en UTC con la zona del sitio del colaborador. Marca cada fila evaluada con
 * `assist_punch_time_normalized_at`, cambie o no, para no tocarla dos veces.
 *
 * Filas BioTime: `assist_origin = 'sync'` (las que el puente ya etiqueta) o
 * `assist_origin` nulo con `assist_sync_id > 0` (históricas anteriores a la
 * etiqueta; el id del puente solo lo trae BioTime). Los demás canales nacen en
 * UTC real y no entran.
 *
 * Al mover el instante cambia la llave natural, así que se recalcula con el
 * mismo algoritmo del modelo. Una colisión de llave deja la fila sin tocar y
 * se reporta: nunca se pierde una checada en silencio.
 *
 * Sin `--apply` es simulación: lee, calcula y reporta sin escribir.
 */
export default class AttendanceBackfillBiotimeUtc extends BaseCommand {
  static commandName = 'attendance:backfill-biotime-utc'
  static description =
    'Convierte a UTC real las checadas históricas del puente BioTime (simulación sin --apply)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({ description: 'Escribe los cambios; sin esta bandera solo reporta' })
  declare apply: boolean

  @flags.number({ description: 'Acota a una business_unit_id' })
  declare businessUnit: number

  @flags.string({ description: 'Día civil inicial (yyyy-MM-dd) de la marca guardada' })
  declare from: string

  @flags.string({ description: 'Día civil final (yyyy-MM-dd) de la marca guardada' })
  declare to: string

  @flags.number({ description: `Filas por lote (default ${DEFAULT_BATCH})` })
  declare batch: number

  private zones = new SiteTimeZoneService()
  private businessUnitZones = new Map<number, ResolvedSiteTimeZone>()

  async run() {
    const batchSize = this.batch ?? DEFAULT_BATCH
    const apply = this.apply === true
    const byTenant = new Map<number, TenantCounters>()
    const samples: Sample[] = []
    let cursor = 0

    this.logger.info(
      apply
        ? 'Aplicando respaldo de checadas BioTime a UTC real'
        : 'Simulación: no se escribe nada (agrega --apply para aplicar)'
    )

    for (;;) {
      const rows = await this.readBatch(cursor, batchSize)
      if (rows.length === 0) break
      cursor = Number(rows[rows.length - 1].assist_id)

      const zoneByEmployee = await this.zones.forEmployees(
        rows.filter((row) => row.employee_id !== null).map((row) => Number(row.employee_id))
      )

      const trx = apply ? await db.transaction() : null
      try {
        for (const row of rows) {
          const businessUnitId = Number(row.business_unit_id)
          const counters = this.countersFor(byTenant, businessUnitId)
          const employeeZone =
            row.employee_id !== null ? zoneByEmployee.get(Number(row.employee_id)) : undefined
          const fallbackZone = employeeZone ?? (await this.zoneForBusinessUnit(businessUnitId))
          const resolvedZone = fallbackZone.zone

          const before = row.punch_utc
          const after = biometricStoredToUtc(parseBiometricStored(before), resolvedZone).toFormat(
            SQL_DATE_TIME
          )
          counters.evaluated += 1
          const changed = after !== before
          if (changed) counters.changed += 1
          else counters.unchanged += 1

          if (samples.length < SAMPLE_SIZE && changed) {
            samples.push({ assistId: Number(row.assist_id), before, after, zone: resolvedZone })
          }

          if (!trx) continue

          const collided = await this.writeRow(trx, row, after)
          if (collided) {
            counters.collided += 1
            counters.changed -= changed ? 1 : 0
          }
        }
        await trx?.commit()
      } catch (error) {
        await trx?.rollback()
        throw error
      }

      this.logger.info(`Lote procesado hasta assist_id ${cursor}`)
    }

    this.report(byTenant, samples, apply)
  }

  private countersFor(byTenant: Map<number, TenantCounters>, businessUnitId: number): TenantCounters {
    let counters = byTenant.get(businessUnitId)
    if (!counters) {
      counters = { evaluated: 0, changed: 0, unchanged: 0, collided: 0 }
      byTenant.set(businessUnitId, counters)
    }
    return counters
  }

  private async zoneForBusinessUnit(businessUnitId: number): Promise<ResolvedSiteTimeZone> {
    let zone = this.businessUnitZones.get(businessUnitId)
    if (!zone) {
      zone = await this.zones.forBusinessUnit(businessUnitId)
      this.businessUnitZones.set(businessUnitId, zone)
    }
    return zone
  }

  /**
   * Lote por cursor de `assist_id`. El colaborador se localiza por código y
   * empresa (mismo criterio que el join de attendance-stats); si no existe, la
   * fila viene con `employee_id` nulo y se convierte con la zona de la empresa.
   */
  private async readBatch(cursor: number, batchSize: number): Promise<CandidateRow[]> {
    const query = db
      .from('assists AS a')
      .leftJoin('employees AS e', (join) => {
        join
          .on('e.employee_code', 'a.assist_emp_code')
          .andOn('e.business_unit_id', 'a.business_unit_id')
          .andOnNull('e.employee_deleted_at')
      })
      .whereNull('a.assist_punch_time_normalized_at')
      .where((biotime) => {
        biotime.where('a.assist_origin', ASSIST_ORIGIN.SYNC).orWhere((historic) => {
          historic.whereNull('a.assist_origin').where('a.assist_sync_id', '>', 0)
        })
      })
      .where('a.assist_id', '>', cursor)

    if (this.businessUnit !== undefined) query.where('a.business_unit_id', this.businessUnit)
    if (this.from) query.whereRaw('DATE(a.assist_punch_time_utc) >= ?', [this.from])
    if (this.to) query.whereRaw('DATE(a.assist_punch_time_utc) <= ?', [this.to])

    return query
      .orderBy('a.assist_id', 'asc')
      .limit(batchSize)
      .select(
        'a.assist_id',
        'a.business_unit_id',
        'a.assist_emp_code',
        'a.assist_terminal_sn',
        'a.assist_origin',
        db.raw("DATE_FORMAT(a.assist_punch_time_utc, '%Y-%m-%d %H:%i:%s') AS punch_utc"),
        db.raw('MIN(e.employee_id) AS employee_id')
      )
      .groupBy('a.assist_id')
  }

  /**
   * Escribe el instante corregido, la marca de normalización y la llave natural
   * recalculada. Devuelve `true` si la llave chocó con otra fila; en ese caso
   * la fila queda intacta para revisión manual.
   */
  private async writeRow(
    trx: Awaited<ReturnType<typeof db.transaction>>,
    row: CandidateRow,
    after: string
  ): Promise<boolean> {
    const naturalKey = computeAssistNaturalKey({
      businessUnitId: Number(row.business_unit_id),
      assistEmpCode: row.assist_emp_code,
      assistPunchTimeUtc: DateTime.fromFormat(after, SQL_DATE_TIME, { zone: 'utc' }),
      assistTerminalSn: assistChannelSentinel(
        (row.assist_origin as AssistCreateFrom | null) ?? null,
        row.assist_terminal_sn
      ),
    })
    try {
      await trx.rawQuery(
        `UPDATE assists
           SET assist_punch_time_utc = ?, assist_natural_key = ?, assist_punch_time_normalized_at = UTC_TIMESTAMP()
         WHERE assist_id = ?`,
        [after, naturalKey, Number(row.assist_id)]
      )
      return false
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        this.logger.warning(
          `assist_id ${row.assist_id}: la llave natural corregida ya existe; fila sin tocar`
        )
        return true
      }
      throw error
    }
  }

  private isDuplicateKey(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) return false
    return (error as { code?: string }).code === 'ER_DUP_ENTRY'
  }

  private report(byTenant: Map<number, TenantCounters>, samples: Sample[], apply: boolean): void {
    const total: TenantCounters = { evaluated: 0, changed: 0, unchanged: 0, collided: 0 }
    const table = this.ui.table()
    table.head(['Empresa', 'Evaluadas', 'Cambiadas', 'Sin cambio', 'Colisiones'])
    for (const [businessUnitId, counters] of [...byTenant.entries()].sort((a, b) => a[0] - b[0])) {
      table.row([
        String(businessUnitId),
        String(counters.evaluated),
        String(counters.changed),
        String(counters.unchanged),
        String(counters.collided),
      ])
      total.evaluated += counters.evaluated
      total.changed += counters.changed
      total.unchanged += counters.unchanged
      total.collided += counters.collided
    }
    table.row([
      'Total',
      String(total.evaluated),
      String(total.changed),
      String(total.unchanged),
      String(total.collided),
    ])
    table.render()

    if (samples.length > 0) {
      this.logger.info('Ejemplos (antes -> después, zona):')
      for (const sample of samples) {
        this.logger.info(`  assist_id ${sample.assistId}: ${sample.before} -> ${sample.after} (${sample.zone})`)
      }
    }

    if (total.evaluated === 0) {
      this.logger.info('Sin filas candidatas: nada pendiente de normalizar en el alcance dado')
    } else if (!apply) {
      this.logger.info(`Simulación terminada: ${total.changed} filas cambiarían con --apply`)
    } else {
      this.logger.success(`Respaldo aplicado: ${total.changed} filas corregidas, ${total.unchanged} ya coincidían`)
    }
  }
}
