import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'
import DocumentoContratoEspecializado from '#models/documento_contrato_especializado'
import VersionContratoEspecializado, {
  type Anexo15dSnapshot,
  type VersionContratoEspecializadoTipoCambio,
} from '#models/version_contrato_especializado'
import ContratoServicioEspecializadoService, {
  serializeContratoServicioEspecializado,
} from '#services/contrato_servicio_especializado_service'
import { VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES } from '../constants/version_contrato_especializado_error_codes.js'
import { VersionContratoEspecializadoError } from '../exceptions/version_contrato_especializado_error.js'
import { serializeAnexo15d } from '../helpers/anexo_15d_serializer.js'
import { findContratoInTenantOrFail } from '../helpers/repse_tenant_scope.js'

export type VersionContratoSnapshotSerialized = {
  fechaInicio: string | null
  fechaFin: string | null
  anexo15d: Anexo15dSnapshot
  documentoVigenteId: number | null
}

export type VersionContratoSerialized = {
  numeroVersion: number
  tipoCambio: VersionContratoEspecializadoTipoCambio
  motivo: string
  fechaCambio: string
  snapshot: VersionContratoSnapshotSerialized
  creadoPor: number | null
  createdAt: string
}

export type RenovacionContratoResult = {
  contrato: ReturnType<typeof serializeContratoServicioEspecializado>
  version: VersionContratoSerialized
}

export type CrearSnapshotInput = {
  contratoId: number
  tipoCambio: VersionContratoEspecializadoTipoCambio
  motivo: string
  creadoPor: number | null
  trx: TransactionClientContract
}

export default class VersionContratoEspecializadoService {
  /**
   * Renueva la vigencia del contrato conservando snapshot del estado anterior.
   */
  async renovarContrato(input: {
    contratoId: number
    fechaInicio: Date
    fechaFin: Date
    motivo: string
    creadoPor: number | null
  }): Promise<RenovacionContratoResult> {
    const preCheck = await findContratoInTenantOrFail(input.contratoId, {
      withDocumentoVigenteFecha: true,
    })
    await preCheck.load('clausula15d')

    this.assertVigenciaCoherente(input.fechaInicio, input.fechaFin)
    this.assertRenovable(preCheck)
    this.assertAnexoPresente(preCheck)

    await db.transaction(async (trx) => {
      let headQuery = ContratoServicioEspecializado.query({ client: trx })
        .where('contrato_servicio_especializado_id', input.contratoId)
        .whereNull('contrato_servicio_especializado_deleted_at')
        .forUpdate()
        .preload('clausula15d')

      headQuery = ContratoServicioEspecializado.withDocumentoVigenteFechaVencimiento(headQuery)
      const head = await headQuery.firstOrFail()

      this.assertRenovable(head)
      this.assertAnexoPresente(head)

      await this.crearSnapshotDesdeHead({
        contratoId: input.contratoId,
        tipoCambio: 'renovacion',
        motivo: input.motivo.trim(),
        creadoPor: input.creadoPor,
        trx,
        head,
      })

      head.fechaInicio = DateTime.fromJSDate(input.fechaInicio)
      head.fechaFin = DateTime.fromJSDate(input.fechaFin)
      head.useTransaction(trx)
      await head.save()
    })

    logger.info(
      {
        contratoId: input.contratoId,
        fechaInicio: input.fechaInicio,
        fechaFin: input.fechaFin,
      },
      'Contrato de servicios especializados renovado con versión histórica'
    )

    const contratoService = new ContratoServicioEspecializadoService()
    const contrato = await contratoService.findById(input.contratoId)

    const versionRow = await VersionContratoEspecializado.query()
      .where('contrato_servicio_especializado_id', input.contratoId)
      .orderBy('version_contrato_especializado_numero', 'desc')
      .firstOrFail()

    return {
      contrato,
      version: this.serializeVersion(versionRow),
    }
  }

  /**
   * Congela el estado vigente del head como fila write-once (reutilizable por addendums).
   */
  async crearSnapshotDesdeHead(
    input: CrearSnapshotInput & { head?: ContratoServicioEspecializado }
  ): Promise<VersionContratoEspecializado> {
    const head =
      input.head ??
      (await ContratoServicioEspecializado.query({ client: input.trx })
        .where('contrato_servicio_especializado_id', input.contratoId)
        .whereNull('contrato_servicio_especializado_deleted_at')
        .forUpdate()
        .preload('clausula15d')
        .firstOrFail())

    if (!head.clausula15d) {
      throw new VersionContratoEspecializadoError(
        'El contrato no tiene anexo 15-D para generar el historial.',
        VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.SNAPSHOT_INCOMPLETE,
        409,
        undefined,
        'El contrato debe tener anexo 15-D antes de crear una versión histórica.'
      )
    }

    const documentoVigente = await DocumentoContratoEspecializado.query({ client: input.trx })
      .where('contrato_servicio_especializado_id', head.contratoServicioEspecializadoId)
      .where('documento_contrato_especializado_vigente', true)
      .whereNull('documento_contrato_especializado_deleted_at')
      .first()

    const maxRow = await VersionContratoEspecializado.query({ client: input.trx })
      .withTrashed()
      .where('contrato_servicio_especializado_id', head.contratoServicioEspecializadoId)
      .orderBy('version_contrato_especializado_numero', 'desc')
      .select('version_contrato_especializado_numero')
      .first()

    const numeroVersion = (maxRow?.numero ?? 0) + 1
    const anexoSnapshot = serializeAnexo15d(head.clausula15d) as Anexo15dSnapshot

    const version = new VersionContratoEspecializado()
    version.contratoServicioEspecializadoId = head.contratoServicioEspecializadoId
    version.businessUnitId = head.businessUnitId
    version.numero = numeroVersion
    version.tipoCambio = input.tipoCambio
    version.motivo = input.motivo
    version.fechaCambio = DateTime.now()
    version.snapshotFechaInicio = head.fechaInicio
    version.snapshotFechaFin = head.fechaFin
    version.anexo15dSnapshot = anexoSnapshot
    version.documentoVigenteId = documentoVigente?.documentoContratoEspecializadoId ?? null
    version.creadoPor = input.creadoPor
    version.useTransaction(input.trx)
    await version.save()

    return version
  }

  async listarVersiones(contratoId: number): Promise<VersionContratoSerialized[]> {
    await findContratoInTenantOrFail(contratoId)

    const rows = await VersionContratoEspecializado.query()
      .where('contrato_servicio_especializado_id', contratoId)
      .orderBy('version_contrato_especializado_numero', 'desc')

    return rows.map((row) => this.serializeVersion(row))
  }

  async obtenerVersion(
    contratoId: number,
    numeroVersion: number
  ): Promise<VersionContratoSerialized> {
    await findContratoInTenantOrFail(contratoId)

    const row = await VersionContratoEspecializado.query()
      .where('contrato_servicio_especializado_id', contratoId)
      .where('version_contrato_especializado_numero', numeroVersion)
      .first()

    if (!row) {
      throw new VersionContratoEspecializadoError(
        'La versión histórica solicitada no existe.',
        VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VERSION_NOT_FOUND,
        404,
        'version-no-encontrada',
        'La versión histórica solicitada no existe.'
      )
    }

    return this.serializeVersion(row)
  }

  private serializeVersion(row: VersionContratoEspecializado): VersionContratoSerialized {
    return {
      numeroVersion: row.numero,
      tipoCambio: row.tipoCambio,
      motivo: row.motivo,
      fechaCambio: row.fechaCambio.toISO()!,
      snapshot: {
        fechaInicio: row.snapshotFechaInicio.toISODate(),
        fechaFin: row.snapshotFechaFin?.toISODate() ?? null,
        anexo15d: row.anexo15dSnapshot,
        documentoVigenteId: row.documentoVigenteId,
      },
      creadoPor: row.creadoPor,
      createdAt: row.createdAt.toISO()!,
    }
  }

  private assertVigenciaCoherente(fechaInicio: Date, fechaFin: Date) {
    const inicio = DateTime.fromJSDate(fechaInicio).startOf('day')
    const fin = DateTime.fromJSDate(fechaFin).startOf('day')
    if (inicio > fin) {
      throw new VersionContratoEspecializadoError(
        'La fecha de inicio no puede ser posterior a la fecha de fin.',
        VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.VAL_VIGENCIA,
        400,
        'vigencia-incoherente',
        'La fecha de inicio debe ser anterior o igual a la fecha de fin.'
      )
    }
  }

  private assertRenovable(contrato: ContratoServicioEspecializado) {
    const efectivo = contrato.estatusEfectivo
    if (efectivo !== 'vigente' && efectivo !== 'vencido') {
      throw new VersionContratoEspecializadoError(
        'Solo se pueden renovar contratos en estatus vigente o vencido.',
        VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.NOT_RENEWABLE,
        409,
        'contrato-no-renovable',
        'Solo se pueden renovar contratos en estatus vigente o vencido.'
      )
    }
  }

  private assertAnexoPresente(contrato: ContratoServicioEspecializado) {
    if (!contrato.clausula15d) {
      throw new VersionContratoEspecializadoError(
        'El contrato no tiene anexo 15-D para generar el historial.',
        VERSION_CONTRATO_ESPECIALIZADO_ERROR_CODES.SNAPSHOT_INCOMPLETE,
        409,
        undefined,
        'El contrato debe tener anexo 15-D antes de renovar.'
      )
    }
  }
}
