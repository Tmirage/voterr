import { getTautulliStatus } from '../services/tautulli.js';
import { getOverseerrStatus } from '../services/overseerr.js';

export function getTautulliWarning() {
  const status = getTautulliStatus();
  if (!status.configured || !status.failed) return null;
  
  const msg = status.circuitOpen 
    ? `Tautulli disabled for ${status.remainingMinutes} min (${status.error})`
    : `Tautulli unavailable: ${status.error}`;
  
  return {
    message: msg,
    type: 'warning',
    service: 'tautulli',
    circuitOpen: status.circuitOpen,
    remainingMinutes: status.remainingMinutes
  };
}

export function getOverseerrWarning() {
  const status = getOverseerrStatus();
  if (!status.configured || !status.failed) return null;
  
  const msg = status.circuitOpen 
    ? `Overseerr disabled for ${status.remainingMinutes} min (${status.error})`
    : `Overseerr unavailable: ${status.error}`;
  
  return {
    message: msg,
    type: 'warning',
    service: 'overseerr',
    circuitOpen: status.circuitOpen,
    remainingMinutes: status.remainingMinutes
  };
}

export function collectServiceWarnings(...warningFns) {
  const warnings = [];
  for (const fn of warningFns) {
    const warning = fn();
    if (warning) warnings.push(warning);
  }
  return warnings;
}
