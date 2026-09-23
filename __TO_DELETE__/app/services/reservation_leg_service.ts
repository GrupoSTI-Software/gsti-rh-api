// app/Services/ReservationLegService.ts

import Airport from '#models/airport'
import Reservation from '#models/reservation'
import ReservationLeg from '#models/reservation_leg'

export default class ReservationLegService {
  /**
   * List all reservation legs.
   */
  async index() {
    const reservationLegs = await ReservationLeg.all()
    return reservationLegs
  }

  /**
   * Create a new reservation leg.
   * @param data - Data to create the reservation leg.
   */
  async create(data: ReservationLeg) {
    const newReservationLeg = new ReservationLeg()
    newReservationLeg.merge(data)
    return newReservationLeg.save()
  }

  /**
   * Find a reservation leg by ID.
   * @param id - ID of the reservation leg.
   */
  async show(id: number) {
    const reservationLeg = await ReservationLeg.findOrFail(id)
    return reservationLeg
  }

  /**
   * Update a reservation leg by ID.
   * @param id - ID of the reservation leg.
   * @param data - Updated data for the reservation leg.
   */
  async update(id: number, data: ReservationLeg) {
    const reservationLeg = await ReservationLeg.findOrFail(id)
    reservationLeg.merge(data)
    await reservationLeg.save()
    return reservationLeg
  }

  async verifyInfo(reservationLeg: ReservationLeg) {
    // validation if reservationId exists
    const reservation = await Reservation.find(reservationLeg.reservationId)
    if (!reservation) {
      return {
        status: 400,
        type: 'error',
        title: 'Reservation not found',
        message: 'Reservation not found',
      }
    }
    // valid if airportDepartureId exists
    const airportDeparture = await Airport.find(reservationLeg.airportDepartureId)
    if (!airportDeparture) {
      return {
        status: 400,
        type: 'error',
        title: 'Airport Departure not found',
        message: 'Airport Departure not found',
      }
    }
    // valid if airportDestinationId exists
    const airportDestination = await Airport.find(reservationLeg.airportDestinationId)
    if (!airportDestination) {
      return {
        status: 400,
        type: 'error',
        title: 'Airport Destination not found',
        message: 'Airport Destination not found',
      }
    }
    return {
      status: 200,
      type: 'success',
      title: 'Info verified successfully',
      message: 'Info verified successfully',
      data: { ...reservation },
    }
  }

  /**
   * Delete a reservation leg by ID.
   * @param id - ID of the reservation leg.
   */
  async delete(id: number) {
    const reservationLeg = await ReservationLeg.findOrFail(id)
    await reservationLeg.delete()
  }
}
