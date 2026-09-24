import db from '@adonisjs/lucid/services/db'
import ContratoServicioEspecializado, {
  TIENE_DOCUMENTO_FIRMADO_EXTRA,
  TRABAJADORES_ASIGNADOS_EXTRA,
  TRABAJADORES_DECLARADOS_EXTRA,
} from '#models/contrato_servicio_especializado'
import type { RepseSpecializedServiceStatus } from '#models/repse_specialized_service'
import {
  buildInformativaExpirationSnapshot,
  INFORMATIVA_PANORAMA_THRESHOLD_DAYS,
} from '#constants/repse_folio_aviso'
import { getAllowedBusinessUnitIds } from '#helpers/repse_tenant_scope'
import { todayInBusinessZone, toBusinessDateString } from '#utils/business_date'
import type {
  RepsePanoramaContratoRef,
  RepsePanoramaKpis,
  RepsePanoramaPendiente,
  RepsePanoramaResult,
} from './dto/repse_panorama.dto.js'

type CountRow = { total: number | string | null }

const SERVICIO_ACTIVO: RepseSpecializedServiceStatus = 'active'

function toCount(rows: CountRow[]): number {
  return Number(rows[0]?.total ?? 0)
}

/**
 * Panorama del módulo REPSE: KPIs del tenant y pendientes accionables.
 *
 * Todo sale de un número fijo de consultas (sin N+1): una de contratos con
 * sus datos de tarjeta como subconsultas correlacionadas, una de preload de
 * empresas y tres conteos. Las reglas de "vigente" y "por vencer" son las del
 * modelo `ContratoServicioEspecializado` (estatus efectivo), no se reescriben aquí.
 */
export default class RepsePanoramaService {
  async getPanorama(): Promise<RepsePanoramaResult> {
    const hoy = todayInBusinessZone()
    const hoyIso = toBusinessDateString(hoy)
    const pendientes: RepsePanoramaPendiente[] = []

    const informativa = buildInformativaExpirationSnapshot(hoy)
    if (informativa.daysRemaining <= INFORMATIVA_PANORAMA_THRESHOLD_DAYS) {
      pendientes.push({
        tipo: 'informativa',
        fecha: informativa.presentationDate,
        dias: informativa.daysRemaining,
      })
    }

    const allowed = await getAllowedBusinessUnitIds()
    if (allowed.length === 0) {
      return { kpis: this.emptyKpis(), pendientes }
    }

    // Contratos no borrador y no cancelados (estatus efectivo vigente o
    // vencido), en orden de fechaFin ascendente; sin fechaFin al final.
    const contratos = await ContratoServicioEspecializado.applyEffectiveEstatusFilter(
      ContratoServicioEspecializado.withResumenTarjeta(ContratoServicioEspecializado.query(), hoyIso),
      ['vigente', 'vencido'],
      hoyIso
    )
      .whereNull('contrato_servicio_especializado_deleted_at')
      .whereIn('business_unit_id', allowed)
      .preload('empresaContratante', (empresa) => {
        empresa.select('empresa_contratante_id', 'empresa_contratante_razon_social')
      })
      .orderByRaw('contrato_servicio_especializado_fecha_fin IS NULL ASC')
      .orderBy('contrato_servicio_especializado_fecha_fin', 'asc')
      .orderBy('contrato_servicio_especializado_id', 'asc')

    const vigenteIds = contratos
      .filter((contrato) => contrato.estatusEfectivo === 'vigente')
      .map((contrato) => contrato.contratoServicioEspecializadoId)

    const [empresasContratantes, serviciosActivos, trabajadoresAsignados] = await Promise.all([
      this.countEmpresasContratantes(allowed),
      this.countServiciosActivos(allowed),
      this.countTrabajadoresAsignados(vigenteIds, hoyIso),
    ])

    for (const contrato of contratos) {
      pendientes.push(...this.pendientesDeContrato(contrato))
    }

    return {
      kpis: {
        contratosVigentes: vigenteIds.length,
        empresasContratantes,
        serviciosActivos,
        trabajadoresAsignados,
      },
      pendientes,
    }
  }

  /** Pendientes de un contrato, en el orden: por vencer, sin documento, personal sin asignar. */
  private pendientesDeContrato(contrato: ContratoServicioEspecializado): RepsePanoramaPendiente[] {
    const ref: RepsePanoramaContratoRef = {
      contratoId: contrato.contratoServicioEspecializadoId,
      numeroContrato: contrato.numeroContrato,
      empresaRazonSocial: contrato.empresaContratante?.razonSocial ?? null,
    }
    const result: RepsePanoramaPendiente[] = []

    const { porVencer, diasParaVencer } = contrato
    const fechaFin = contrato.fechaFin?.toISODate() ?? null
    if (porVencer && fechaFin !== null && diasParaVencer !== null) {
      result.push({ tipo: 'contrato_por_vencer', ...ref, fechaFin, dias: diasParaVencer })
    }

    if (Number(contrato.$extras[TIENE_DOCUMENTO_FIRMADO_EXTRA] ?? 0) !== 1) {
      result.push({ tipo: 'contrato_sin_documento', ...ref })
    }

    const asignados = Number(contrato.$extras[TRABAJADORES_ASIGNADOS_EXTRA] ?? 0)
    const declarados = Number(contrato.$extras[TRABAJADORES_DECLARADOS_EXTRA] ?? 0)
    if (asignados < declarados) {
      result.push({ tipo: 'personal_sin_asignar', ...ref, asignados, declarados })
    }

    return result
  }

  private async countEmpresasContratantes(allowed: number[]): Promise<number> {
    const rows: CountRow[] = await db
      .from('empresas_contratantes')
      .whereNull('empresa_contratante_deleted_at')
      .whereIn('business_unit_id', allowed)
      .count('* as total')
    return toCount(rows)
  }

  private async countServiciosActivos(allowed: number[]): Promise<number> {
    const rows: CountRow[] = await db
      .from('repse_specialized_services as s')
      .join('repse_registrations as r', 'r.repse_registration_id', 's.repse_registration_id')
      .whereNull('s.repse_specialized_service_deleted_at')
      .whereNull('r.repse_registration_deleted_at')
      .whereIn('r.business_unit_id', allowed)
      .where('s.repse_specialized_service_status', SERVICIO_ACTIVO)
      .count('* as total')
    return toCount(rows)
  }

  /**
   * Trabajadores distintos con asignación no borrada y vigente hoy en algún
   * contrato vigente (misma regla que `AsignacionContratoEspecializado.vigentesEn`).
   */
  private async countTrabajadoresAsignados(vigenteIds: number[], hoyIso: string): Promise<number> {
    if (vigenteIds.length === 0) {
      return 0
    }
    const rows: CountRow[] = await db
      .from('asignaciones_contrato_especializado')
      .whereIn('contrato_servicio_especializado_id', vigenteIds)
      .whereNull('asignacion_contrato_especializado_deleted_at')
      .where('asignacion_contrato_especializado_fecha_inicio', '<=', hoyIso)
      .where((group) => {
        group
          .whereNull('asignacion_contrato_especializado_fecha_fin')
          .orWhere('asignacion_contrato_especializado_fecha_fin', '>=', hoyIso)
      })
      .countDistinct('employee_id as total')
    return toCount(rows)
  }

  private emptyKpis(): RepsePanoramaKpis {
    return {
      contratosVigentes: 0,
      empresasContratantes: 0,
      serviciosActivos: 0,
      trabajadoresAsignados: 0,
    }
  }
}
