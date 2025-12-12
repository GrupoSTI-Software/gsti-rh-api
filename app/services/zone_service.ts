import Zone from '#models/zone'
import { ZoneFilterSearchInterface } from '../interfaces/zone_filter_search_interface.js'
import { I18n } from '@adonisjs/i18n'

export default class ZoneService {
  private t: (key: string, params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  async index(filters: ZoneFilterSearchInterface) {
    const selectedColumns = ['zone_id', 'zone_name', 'zone_thumbnail', 'zone_address', 'zone_polygon', 'zone_created_at']
    const zones = await Zone.query()
      .whereNull('zone_deleted_at')
      .if(filters.search, (query) => {
        query.whereRaw('UPPER(zone_name) LIKE ?', [`%${filters.search!.toUpperCase()}%`])
      })
      .select(selectedColumns)
      .orderBy('zone_created_at', 'asc')
      .paginate(filters.page, filters.limit)

    return zones
  }

  async create(zone: Zone) {
    const newZone = new Zone()
    newZone.zoneName = zone.zoneName
    newZone.zoneThumbnail = zone.zoneThumbnail ?? null
    newZone.zoneAddress = zone.zoneAddress
    newZone.zonePolygon = zone.zonePolygon
    await newZone.save()
    return newZone
  }

  async update(currentZone: Zone, zone: Zone) {
    currentZone.zoneName = zone.zoneName
    currentZone.zoneThumbnail = zone.zoneThumbnail ?? null
    currentZone.zoneAddress = zone.zoneAddress
    currentZone.zonePolygon = zone.zonePolygon
    await currentZone.save()
    return currentZone
  }

  async delete(currentZone: Zone) {
    await currentZone.delete()
    return currentZone
  }

  async show(zoneId: number) {
    const selectedColumns = ['zone_id', 'zone_name', 'zone_thumbnail', 'zone_address', 'zone_polygon']
    const zone = await Zone.query()
      .whereNull('zone_deleted_at')
      .where('zone_id', zoneId)
      .select(selectedColumns)
      .first()
    return zone ? zone : null
  }

  async verifyInfo(zone: Zone) {
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...zone },
    }
  }

  async updateZoneThumbnailUrl(zoneId: number, thumbnailUrl: string) {
    const currentZone = await Zone.query()
      .whereNull('zone_deleted_at')
      .where('zone_id', zoneId)
      .first()
    if (!currentZone) {
      return null
    }
    currentZone.zoneThumbnail = thumbnailUrl
    await currentZone.save()
    return currentZone
  }
}


