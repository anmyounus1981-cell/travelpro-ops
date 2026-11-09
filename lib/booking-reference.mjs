export function bookingReference(booking) {
  const pnr = booking?.pnr?.trim();
  return pnr ? `PNR ${pnr}` : 'Booking reference unavailable';
}
