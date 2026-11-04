export const STAGING_PROJECT_REF = 'zkrpbcxukbtbsakcepxv';

// Server callers pass deployment configuration, never FormData.
export function bookingMode(mode, projectRef) {
  if (mode === 'production' && projectRef === 'zhqdssbysdebgeijscvm') return 'live';
  if (mode === 'staging' && projectRef === STAGING_PROJECT_REF) return 'simulation';
  throw new Error('Booking writes require the approved production or staging deployment.');
}

export function simulationReference(value) {
  const reference = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(reference))
    throw new Error('Enter a simulation reference of 3 to 32 characters.');
  return reference;
}
