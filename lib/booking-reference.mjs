export function bookingReference(booking) {
  const ref = booking.simulation_reference?.trim();
  if (booking.execution_mode === "simulation" || (!booking.pnr && ref)) {
    return `SIMULATION ${ref || "reference unavailable"}`;
  }
  return booking.pnr?.trim() ? `PNR ${booking.pnr.trim()}` : "Booking reference unavailable";
}
