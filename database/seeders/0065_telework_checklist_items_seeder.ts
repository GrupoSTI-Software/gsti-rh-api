import TeleworkChecklistItem from '#models/telework_checklist_item'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

/**
 * Semilla idempotente del catálogo global de puntos de la lista de verificación
 * de teletrabajo (VLRH-H1790812613870).
 *
 * Siete puntos de marcador; los textos definitivos los entrega asesoría (regla
 * C0129 R11) y su ausencia no bloquea. `labelKey` apunta a
 * `telework_checklist.items.<code>` en `resources/lang`. La clave de
 * idempotencia es `teleworkChecklistItemCode`: correrla dos veces deja siete
 * puntos.
 */
export default class extends BaseSeeder {
  async run() {
    const items = [
      {
        teleworkChecklistItemCode: 'iluminacion',
        teleworkChecklistItemLabelKey: 'telework_checklist.items.iluminacion',
        teleworkChecklistItemOrder: 1,
      },
      {
        teleworkChecklistItemCode: 'ventilacion_temperatura',
        teleworkChecklistItemLabelKey: 'telework_checklist.items.ventilacion_temperatura',
        teleworkChecklistItemOrder: 2,
      },
      {
        teleworkChecklistItemCode: 'mobiliario',
        teleworkChecklistItemLabelKey: 'telework_checklist.items.mobiliario',
        teleworkChecklistItemOrder: 3,
      },
      {
        teleworkChecklistItemCode: 'instalacion_electrica',
        teleworkChecklistItemLabelKey: 'telework_checklist.items.instalacion_electrica',
        teleworkChecklistItemOrder: 4,
      },
      {
        teleworkChecklistItemCode: 'orden_y_limpieza',
        teleworkChecklistItemLabelKey: 'telework_checklist.items.orden_y_limpieza',
        teleworkChecklistItemOrder: 5,
      },
      {
        teleworkChecklistItemCode: 'ruido',
        teleworkChecklistItemLabelKey: 'telework_checklist.items.ruido',
        teleworkChecklistItemOrder: 6,
      },
      {
        teleworkChecklistItemCode: 'primeros_auxilios_emergencia',
        teleworkChecklistItemLabelKey: 'telework_checklist.items.primeros_auxilios_emergencia',
        teleworkChecklistItemOrder: 7,
      },
    ]

    for (const item of items) {
      await TeleworkChecklistItem.updateOrCreate(
        { teleworkChecklistItemCode: item.teleworkChecklistItemCode },
        {
          teleworkChecklistItemLabelKey: item.teleworkChecklistItemLabelKey,
          teleworkChecklistItemOrder: item.teleworkChecklistItemOrder,
          teleworkChecklistItemIsActive: true,
        }
      )
    }
  }
}
