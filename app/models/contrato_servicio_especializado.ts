import { compose } from '@adonisjs/core/helpers'
import db from '@adonisjs/lucid/services/db'
import { BaseModel, belongsTo, column, hasOne, manyToMany, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo, HasOne, ManyToMany, HasMany } from '@adonisjs/lucid/types/relations'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import BusinessUnit from '#models/business_unit'
import EmpresaContratante from '#models/empresa_contratante'
import Clausula15d from '#models/clausula_15d'
import RepseSpecializedService from '#models/repse_specialized_service'
import DocumentoContratoEspecializado from '#models/documento_contrato_especializado'
import VersionContratoEspecializado from '#models/version_contrato_especializado'
import AsignacionContratoEspecializado from '#models/asignacion_contrato_especializado'
import {
  todayInBusinessZone,
  toBusinessDateString,
  toCalendarIsoDate,
  isBusinessCalendarDateBefore,
  daysBetweenBusinessDates,
} from '#utils/business_date'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { CONTRATO_POR_VENCER_UMBRAL_DIAS } from '#constants/contrato_servicio_especializado'

export type ContratoServicioEspecializadoEstatus =
  | 'borrador'
  | 'vigente'
  | 'vencido'
  | 'cancelado'

export type EstatusEfectivoResult = {
  estatus: ContratoServicioEspecializadoEstatus
  vencidoPorFecha: boolean
}

/** Alias en `$extras` de la subconsulta al documento firmado vigente. */
export const DOC_FECHA_VENCIMIENTO_EXTRA = 'doc_fecha_vencimiento'

/** Alias en `$extras` de los datos de tarjeta (ver `withResumenTarjeta`). */
export const TRABAJADORES_ASIGNADOS_EXTRA = 'trabajadores_asignados'
export const TRABAJADORES_DECLARADOS_EXTRA = 'trabajadores_declarados'
export const TIENE_DOCUMENTO_FIRMADO_EXTRA = 'tiene_documento_firmado'

export type VencimientoContratoResult = {
  /** Estatus efectivo `vigente` y `fechaFin` a ≤ `CONTRATO_POR_VENCER_UMBRAL_DIAS` días. */
  porVencer: boolean
  /** Días civiles de hoy a `fechaFin` (zona de negocio); `null` si no está vigente o no tiene fin. */
  diasParaVencer: number | null
}

/**
 * Contrato B2B de servicios especializados REPSE (anexo 15-D LFT).
 *
 * **Contrato arquitectónico de estatus:** la columna Lucid `estatus` conserva el valor
 * declarado en BD. Para lógica de negocio, filtros, reportes y serialización API usar
 * siempre `estatusEfectivo`, `vencidoPorFecha` y los scopes `applyEffectiveEstatusFilter` /
 * `withDocumentoVigenteFechaVencimiento`. Leer `contrato_servicio_especializado_estatus`
 * directamente reintroduce el bug de contratos caducados mostrándose vigentes.
 */
export default class ContratoServicioEspecializado extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'contratos_servicios_especializados'

  @column({ isPrimary: true, columnName: 'contrato_servicio_especializado_id' })
  declare contratoServicioEspecializadoId: number

  @column({ columnName: 'business_unit_id' })
  declare businessUnitId: number

  @column({ columnName: 'empresa_contratante_id' })
  declare empresaContratanteId: number

  @column({ columnName: 'contrato_servicio_especializado_numero_contrato' })
  declare numeroContrato: string

  @column.date({ columnName: 'contrato_servicio_especializado_fecha_inicio' })
  declare fechaInicio: DateTime

  @column.date({ columnName: 'contrato_servicio_especializado_fecha_fin' })
  declare fechaFin: DateTime | null

  @column({ columnName: 'contrato_servicio_especializado_objeto_servicio' })
  declare objetoServicio: string

  @column({ columnName: 'contrato_servicio_especializado_monto_total' })
  declare montoTotal: number | null

  @column({ columnName: 'contrato_servicio_especializado_moneda' })
  declare moneda: string

  /** Estatus declarado persistido en BD. Preferir `estatusEfectivo` en lecturas. */
  @column({ columnName: 'contrato_servicio_especializado_estatus' })
  declare estatus: ContratoServicioEspecializadoEstatus

  @column.dateTime({
    columnName: 'contrato_servicio_especializado_created_at',
    autoCreate: true,
  })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'contrato_servicio_especializado_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'contrato_servicio_especializado_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => EmpresaContratante, {
    foreignKey: 'empresaContratanteId',
    localKey: 'empresaContratanteId',
  })
  declare empresaContratante: BelongsTo<typeof EmpresaContratante>

  @hasOne(() => Clausula15d, {
    foreignKey: 'contratoServicioEspecializadoId',
    localKey: 'contratoServicioEspecializadoId',
  })
  declare clausula15d: HasOne<typeof Clausula15d>

  @manyToMany(() => RepseSpecializedService, {
    pivotTable: 'contrato_servicio_repse',
    localKey: 'contratoServicioEspecializadoId',
    pivotForeignKey: 'contrato_servicio_especializado_id',
    relatedKey: 'repseSpecializedServiceId',
    pivotRelatedForeignKey: 'repse_specialized_service_id',
    pivotTimestamps: true,
  })
  declare repseSpecializedServices: ManyToMany<typeof RepseSpecializedService>

  @hasMany(() => DocumentoContratoEspecializado, {
    foreignKey: 'contratoServicioEspecializadoId',
    localKey: 'contratoServicioEspecializadoId',
  })
  declare documentos: HasMany<typeof DocumentoContratoEspecializado>

  @hasMany(() => VersionContratoEspecializado, {
    foreignKey: 'contratoServicioEspecializadoId',
    localKey: 'contratoServicioEspecializadoId',
  })
  declare versiones: HasMany<typeof VersionContratoEspecializado>

  @hasMany(() => AsignacionContratoEspecializado, {
    foreignKey: 'contratoServicioEspecializadoId',
    localKey: 'contratoServicioEspecializadoId',
  })
  declare asignaciones: HasMany<typeof AsignacionContratoEspecializado>

  get estatusEfectivo(): ContratoServicioEspecializadoEstatus {
    return ContratoServicioEspecializado.computeEstatusEfectivo(
      this.estatus,
      this.fechaFin,
      this.$extras[DOC_FECHA_VENCIMIENTO_EXTRA],
      todayInBusinessZone()
    ).estatus
  }

  /** Ver `computeVencimiento`. Requiere los `$extras` de `withDocumentoVigenteFechaVencimiento`. */
  get porVencer(): boolean {
    return ContratoServicioEspecializado.computeVencimiento(this.estatusEfectivo, this.fechaFin)
      .porVencer
  }

  /** Ver `computeVencimiento`. */
  get diasParaVencer(): number | null {
    return ContratoServicioEspecializado.computeVencimiento(this.estatusEfectivo, this.fechaFin)
      .diasParaVencer
  }

  get vencidoPorFecha(): boolean {
    return ContratoServicioEspecializado.computeEstatusEfectivo(
      this.estatus,
      this.fechaFin,
      this.$extras[DOC_FECHA_VENCIMIENTO_EXTRA],
      todayInBusinessZone()
    ).vencidoPorFecha
  }

  /**
   * Subconsulta correlacionada: fecha de vencimiento del documento firmado vigente.
   * El contrato padre ya está acotado por tenant vía `business_unit_id`.
   */
  static sqlSubqueryDocumentoVigenteFechaVencimiento(): string {
    return `(
      SELECT d.documento_contrato_especializado_fecha_vencimiento
      FROM documentos_contrato_especializado AS d
      WHERE d.contrato_servicio_especializado_id = ${this.table}.contrato_servicio_especializado_id
        AND d.documento_contrato_especializado_vigente = 1
        AND d.documento_contrato_especializado_deleted_at IS NULL
      LIMIT 1
    )`
  }

  static computeEstatusEfectivo(
    declarado: ContratoServicioEspecializadoEstatus,
    fechaFin: DateTime | null,
    docFechaVencimiento: unknown,
    hoy: DateTime = todayInBusinessZone()
  ): EstatusEfectivoResult {
    if (declarado !== 'vigente') {
      return { estatus: declarado, vencidoPorFecha: false }
    }

    const hoyIso = toBusinessDateString(hoy)
    const fechaFinIso = fechaFin?.toISODate() ?? null
    const docFechaIso = toCalendarIsoDate(docFechaVencimiento)

    const fechaFinVencida = isBusinessCalendarDateBefore(fechaFinIso, hoyIso)
    const documentoVencido = isBusinessCalendarDateBefore(docFechaIso, hoyIso)

    if (fechaFinVencida || documentoVencido) {
      return { estatus: 'vencido', vencidoPorFecha: true }
    }

    return { estatus: 'vigente', vencidoPorFecha: false }
  }

  static withDocumentoVigenteFechaVencimiento(
    query: ModelQueryBuilderContract<typeof ContratoServicioEspecializado>
  ) {
    const sub = this.sqlSubqueryDocumentoVigenteFechaVencimiento()
    return query.select(`${this.table}.*`).select(db.raw(`${sub} as ${DOC_FECHA_VENCIMIENTO_EXTRA}`))
  }

  /**
   * "Por vencer" a partir del estatus EFECTIVO: solo un contrato `vigente` con
   * `fechaFin` puede estarlo. Días en calendario civil de la zona de negocio.
   */
  static computeVencimiento(
    estatusEfectivo: ContratoServicioEspecializadoEstatus,
    fechaFin: DateTime | null,
    hoy: DateTime = todayInBusinessZone()
  ): VencimientoContratoResult {
    const fechaFinIso = fechaFin?.toISODate() ?? null
    if (estatusEfectivo !== 'vigente' || !fechaFinIso) {
      return { porVencer: false, diasParaVencer: null }
    }

    const diasParaVencer = daysBetweenBusinessDates(toBusinessDateString(hoy), fechaFinIso)
    return { porVencer: diasParaVencer <= CONTRATO_POR_VENCER_UMBRAL_DIAS, diasParaVencer }
  }

  /**
   * Agrega en `$extras`, con subconsultas correlacionadas (sin N+1), los datos
   * de la tarjeta del contrato además de la fecha del documento vigente:
   *
   * - `TRABAJADORES_ASIGNADOS_EXTRA`: trabajadores distintos con asignación no
   *   borrada y vigente en `hoyIso` (misma regla que `AsignacionContratoEspecializado.vigentesEn`).
   * - `TRABAJADORES_DECLARADOS_EXTRA`: `numeroTrabajadoresAprox` del anexo 15-D (0 si no hay).
   * - `TIENE_DOCUMENTO_FIRMADO_EXTRA`: 1 si hay documento firmado vigente no borrado.
   */
  static withResumenTarjeta(
    query: ModelQueryBuilderContract<typeof ContratoServicioEspecializado>,
    hoyIso: string = toBusinessDateString()
  ) {
    const contratoId = `${this.table}.contrato_servicio_especializado_id`
    return this.withDocumentoVigenteFechaVencimiento(query)
      .select(
        db.raw(
          `(
            SELECT COUNT(DISTINCT a.employee_id)
            FROM asignaciones_contrato_especializado AS a
            WHERE a.contrato_servicio_especializado_id = ${contratoId}
              AND a.asignacion_contrato_especializado_deleted_at IS NULL
              AND a.asignacion_contrato_especializado_fecha_inicio <= ?
              AND (
                a.asignacion_contrato_especializado_fecha_fin IS NULL
                OR a.asignacion_contrato_especializado_fecha_fin >= ?
              )
          ) as ${TRABAJADORES_ASIGNADOS_EXTRA}`,
          [hoyIso, hoyIso]
        )
      )
      .select(
        db.raw(
          `COALESCE((
            SELECT c.clausula_15d_numero_trabajadores_aprox
            FROM clausulas_15d AS c
            WHERE c.contrato_servicio_especializado_id = ${contratoId}
            LIMIT 1
          ), 0) as ${TRABAJADORES_DECLARADOS_EXTRA}`
        )
      )
      .select(
        db.raw(
          `EXISTS (
            SELECT 1
            FROM documentos_contrato_especializado AS dt
            WHERE dt.contrato_servicio_especializado_id = ${contratoId}
              AND dt.documento_contrato_especializado_vigente = 1
              AND dt.documento_contrato_especializado_deleted_at IS NULL
          ) as ${TIENE_DOCUMENTO_FIRMADO_EXTRA}`
        )
      )
  }

  /**
   * Filtro SQL de "por vencer" (misma regla que `computeVencimiento`):
   * `true` deja solo vigentes por vencer; `false` los excluye. Se combina por
   * AND con `applyEffectiveEstatusFilter`.
   */
  static applyPorVencerFilter(
    query: ModelQueryBuilderContract<typeof ContratoServicioEspecializado>,
    porVencer: boolean,
    hoy: DateTime = todayInBusinessZone()
  ) {
    const porVencerSql = this.sqlVigentePorVencer(hoy)
    return porVencer
      ? query.whereRaw(porVencerSql.sql, porVencerSql.bindings)
      : query.whereRaw(`NOT ${porVencerSql.sql}`, porVencerSql.bindings)
  }

  /**
   * Vigente efectivo con `fechaFin` dentro del umbral. Nunca evalúa a NULL
   * (cada comparación sobre columna nullable va protegida), así que su `NOT`
   * es seguro.
   */
  static sqlVigentePorVencer(hoy: DateTime = todayInBusinessZone()) {
    const hoyIso = toBusinessDateString(hoy)
    const limiteIso = toBusinessDateString(hoy.plus({ days: CONTRATO_POR_VENCER_UMBRAL_DIAS }))
    const vigente = this.sqlVigenteNoExpiradoPorFecha(hoyIso)
    return {
      sql: `(
        ${vigente.sql}
        AND contrato_servicio_especializado_fecha_fin IS NOT NULL
        AND contrato_servicio_especializado_fecha_fin <= ?
      )`,
      bindings: [...vigente.bindings, limiteIso],
    }
  }

  static applyEffectiveEstatusFilter(
    query: ModelQueryBuilderContract<typeof ContratoServicioEspecializado>,
    estatusValues: ContratoServicioEspecializadoEstatus[],
    hoyIso: string
  ) {
    if (estatusValues.length === 0) {
      return query
    }

    const vigenteExpirado = this.sqlVigenteExpiradoPorFecha(hoyIso)
    const vigenteNoExpirado = this.sqlVigenteNoExpiradoPorFecha(hoyIso)

    return query.where((builder) => {
      estatusValues.forEach((estatus, index) => {
        const apply = index === 0 ? builder.where.bind(builder) : builder.orWhere.bind(builder)

        if (estatus === 'vencido') {
          apply((group) => {
            group
              .where('contrato_servicio_especializado_estatus', 'vencido')
              .orWhereRaw(vigenteExpirado.sql, vigenteExpirado.bindings)
          })
          return
        }

        if (estatus === 'vigente') {
          apply((group) => {
            group.whereRaw(vigenteNoExpirado.sql, vigenteNoExpirado.bindings)
          })
          return
        }

        apply('contrato_servicio_especializado_estatus', estatus)
      })
    })
  }

  /**
   * Restringe la consulta a las unidades de negocio permitidas del tenant.
   */
  static forAllowedBusinessUnits(
    query: ModelQueryBuilderContract<typeof ContratoServicioEspecializado>,
    allowedBusinessUnitIds: number[]
  ) {
    return query
      .whereNull('contrato_servicio_especializado_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
  }

  private static sqlVigenteExpiradoPorFecha(hoyIso: string) {
    const sub = this.sqlSubqueryDocumentoVigenteFechaVencimiento()
    return {
      sql: `(
        contrato_servicio_especializado_estatus = 'vigente'
        AND (
          (contrato_servicio_especializado_fecha_fin IS NOT NULL AND contrato_servicio_especializado_fecha_fin < ?)
          OR (${sub} IS NOT NULL AND ${sub} < ?)
        )
      )`,
      bindings: [hoyIso, hoyIso],
    }
  }

  private static sqlVigenteNoExpiradoPorFecha(hoyIso: string) {
    const sub = this.sqlSubqueryDocumentoVigenteFechaVencimiento()
    return {
      sql: `(
        contrato_servicio_especializado_estatus = 'vigente'
        AND (contrato_servicio_especializado_fecha_fin IS NULL OR contrato_servicio_especializado_fecha_fin >= ?)
        AND (${sub} IS NULL OR ${sub} >= ?)
      )`,
      bindings: [hoyIso, hoyIso],
    }
  }
}
