import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'

/**
 * Tablas que el aislamiento de Zonas y del catálogo de activos dejó con
 * `business_unit_id` NULLABLE, en orden padre → hijo (solo para que el reporte
 * se lea de arriba hacia abajo; el UPDATE de cada una es independiente).
 */
const TABLAS = [
  { tabla: 'zones', etiqueta: 'Zonas' },
  { tabla: 'supply_types', etiqueta: 'Tipos de activo' },
  { tabla: 'supplies', etiqueta: 'Activos' },
  { tabla: 'supplie_caracteristics', etiqueta: 'Características de activo' },
  { tabla: 'supplie_caracteristic_values', etiqueta: 'Valores de característica' },
  { tabla: 'supply_value_histories', etiqueta: 'Historial de valor de activo' },
] as const

/** Errores del comando: título, detalle y key, igual que el resto del API. */
const ERR = {
  SIN_EMPRESA: {
    key: 'BACKFILL.BU.000',
    title: 'No hay ninguna empresa viva',
    detail:
      'La tabla business_units no tiene ninguna fila sin borrado lógico: no hay a quién asignar las filas huérfanas.',
  },
  AMBIGUO: {
    key: 'BACKFILL.BU.001',
    title: 'Más de una empresa viva',
    detail:
      'El comando solo resuelve el caso de una única empresa viva. Con varias, a qué empresa pertenece cada fila es una decisión de negocio que este comando no puede adivinar.',
  },
} as const

interface EmpresaViva {
  business_unit_id: number
  business_unit_name: string
}

/**
 * Asigna la empresa a las filas de Zonas y del catálogo de activos que quedaron
 * sin `business_unit_id` tras las migraciones de aislamiento.
 *
 * ## Regla de asignación (única, deliberadamente estrecha)
 * 1. Cuenta las empresas VIVAS: filas de `business_units` sin borrado lógico
 *    (`business_unit_deleted_at IS NULL`). El estatus `business_unit_active` NO
 *    entra en la cuenta: una empresa desactivada sigue siendo dueña de sus datos.
 * 2. Si hay EXACTAMENTE UNA, todas las filas con `business_unit_id` NULL se le
 *    asignan. Es el caso del entorno previo al lanzamiento SaaS: un solo cliente
 *    en la base, así que no hay ambigüedad posible.
 * 3. Si hay CERO o MÁS DE UNA, el comando ABORTA listando las empresas y cuántas
 *    filas quedarían sin dueño por tabla. No adivina: con dos clientes en la
 *    misma base, atribuir un activo a la empresa equivocada se lo enseña a quien
 *    no debe verlo, y el error es silencioso.
 *
 * ## Idempotencia
 * Solo toca filas `WHERE business_unit_id IS NULL`. Correrlo dos veces deja la
 * segunda corrida en cero cambios. Incluye a propósito las filas con borrado
 * lógico: si quedaran en NULL, la migración que imponga `NOT NULL` fallaría.
 *
 * ## Uso
 *   node ace backfill:zones-supplies-business-unit           # seco (por defecto)
 *   node ace backfill:zones-supplies-business-unit --apply   # escribe
 */
export default class BackfillZonesSuppliesBusinessUnit extends BaseCommand {
  static commandName = 'backfill:zones-supplies-business-unit'
  static description =
    'Asigna la empresa a las filas de zonas y del catálogo de activos que quedaron sin business_unit_id; en seco por defecto'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({
    description: 'Escribe los cambios. Sin esta bandera el comando solo reporta lo que haría',
  })
  declare apply: boolean

  async run() {
    const prefijo = this.apply ? '' : '[EN SECO] '
    this.logger.info(`${prefijo}Backfill de business_unit_id en zonas y catálogo de activos`)

    const empresasVivas = await this.obtenerEmpresasVivas()
    const pendientesPorTabla = await this.contarPendientes()
    const totalPendiente = pendientesPorTabla.reduce((suma, fila) => suma + fila.pendientes, 0)

    this.reportarPendientes(pendientesPorTabla, totalPendiente)

    if (empresasVivas.length !== 1) {
      this.abortar(empresasVivas)
      return
    }

    const [empresa] = empresasVivas
    this.logger.info(
      `Empresa viva única: ${empresa.business_unit_name} (id ${empresa.business_unit_id})`
    )

    if (totalPendiente === 0) {
      this.logger.success('No hay filas sin empresa: nada que hacer')
      return
    }

    if (!this.apply) {
      this.logger.info(
        `${prefijo}Se asignarían ${totalPendiente} filas a ${empresa.business_unit_name}. ` +
          'Vuelve a correr con --apply para escribir.'
      )
      return
    }

    let escritas = 0
    for (const { tabla, etiqueta } of TABLAS) {
      const afectadas = await db
        .from(tabla)
        .whereNull('business_unit_id')
        .update({ business_unit_id: empresa.business_unit_id })
      const total = Number(afectadas)
      escritas += total
      this.logger.info(`  ${etiqueta} (${tabla}): ${total} filas asignadas`)
    }

    this.logger.success(
      `Backfill completado: ${escritas} filas asignadas a ${empresa.business_unit_name}`
    )
  }

  /**
   * Empresas vivas = sin borrado lógico. Consulta cruda a propósito: los modelos
   * con `withBusinessUnitScope` no filtran fuera de una request, pero una query
   * cruda deja explícito que este comando trabaja sobre TODA la base.
   */
  private async obtenerEmpresasVivas(): Promise<EmpresaViva[]> {
    return db
      .from('business_units')
      .whereNull('business_unit_deleted_at')
      .select('business_unit_id', 'business_unit_name')
      .orderBy('business_unit_id', 'asc')
  }

  private async contarPendientes(): Promise<
    { tabla: string; etiqueta: string; pendientes: number }[]
  > {
    const filas: { tabla: string; etiqueta: string; pendientes: number }[] = []
    for (const { tabla, etiqueta } of TABLAS) {
      const resultado = await db
        .from(tabla)
        .whereNull('business_unit_id')
        .count('* as total')
        .first()
      filas.push({ tabla, etiqueta, pendientes: Number(resultado?.total ?? 0) })
    }
    return filas
  }

  private reportarPendientes(
    filas: { tabla: string; etiqueta: string; pendientes: number }[],
    total: number
  ) {
    this.logger.info('Filas sin empresa por tabla:')
    for (const { tabla, etiqueta, pendientes } of filas) {
      this.logger.info(`  ${etiqueta} (${tabla}): ${pendientes}`)
    }
    this.logger.info(`  TOTAL: ${total}`)
  }

  /** Aborta sin escribir nada y deja en el log qué lo hizo ambiguo. */
  private abortar(empresasVivas: EmpresaViva[]) {
    const error = empresasVivas.length === 0 ? ERR.SIN_EMPRESA : ERR.AMBIGUO

    this.logger.error(`${error.key} — ${error.title}`)
    this.logger.error(error.detail)

    if (empresasVivas.length > 1) {
      this.logger.error(`Empresas vivas (${empresasVivas.length}):`)
      for (const empresa of empresasVivas) {
        this.logger.error(`  id ${empresa.business_unit_id}: ${empresa.business_unit_name}`)
      }
      this.logger.error(
        'Resuelve la pertenencia a mano (UPDATE por empresa) y vuelve a correr el comando para confirmar que no queda nada pendiente.'
      )
    }

    this.exitCode = 1
  }
}
