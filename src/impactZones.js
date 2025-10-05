// impactZones.js
// -----------------------------------------------------------------------------
// Full-form equations from Rumpf (2016) for crater, fireball, overpressure,
// wind, and seismic effects — but with *damage-level thresholds*
// instead of 50 % mortality midpoints.
// Fireball remains true 50 % mortality (PHI0).
// -----------------------------------------------------------------------------

const ImpactZones = (function () {
  const G0 = 9.80665;
  const Re = 6371000;
  const KT_TO_J = 4.184e12;
  const P_ATM = 101325;
  const C0 = 340;

  function bisect(fn, lo, hi, tol = 1e-6, maxIter = 200) {
    let fLo = fn(lo), fHi = fn(hi);
    
    // Check for invalid inputs
    if (!isFinite(fLo) || !isFinite(fHi)) {
      console.warn('bisect: Non-finite function values at bounds', { lo, hi, fLo, fHi });
      return NaN;
    }
    
    // If root is not bracketed, try to find a better bracket
    if (fLo * fHi > 0) {
      // Try expanding the search range
      let newLo = lo, newHi = hi;
      for (let i = 0; i < 10; i++) {
        newLo = Math.max(newLo * 0.1, 1e-10);
        newHi = newHi * 10;
        const fNewLo = fn(newLo), fNewHi = fn(newHi);
        if (isFinite(fNewLo) && isFinite(fNewHi) && fNewLo * fNewHi <= 0) {
          lo = newLo; hi = newHi; fLo = fNewLo; fHi = fNewHi;
          break;
        }
      }
      // If still not bracketed, return a fallback value
      if (fLo * fHi > 0) {
        console.warn('bisect: root not bracketed after search expansion', { lo, hi, fLo, fHi });
        return lo; // Return lower bound as fallback
      }
    }
    
    for (let i = 0; i < maxIter; i++) {
      const mid = 0.5 * (lo + hi);
      const fMid = fn(mid);
      if (!isFinite(fMid)) {
        console.warn('bisect: Non-finite function value at midpoint', { mid, fMid });
        return mid;
      }
      if (Math.abs(fMid) < tol) return mid;
      if (fLo * fMid <= 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
    }
    return 0.5 * (lo + hi);
  }

  function kineticEnergyJ(L0, rho_i, v) {
    const vol = (Math.PI / 6) * L0 ** 3;
    const m = rho_i * vol;
    return 0.5 * m * v * v;
  }
  function energyToKT(E) { return E / KT_TO_J; }

  function transientCraterDiameter(L0, rho_i, rho_t, v, gamma_deg) {
    const s = Math.sin((gamma_deg * Math.PI) / 180);
    return 1.161 * (rho_i / rho_t) ** (1 / 3) *
      L0 ** 0.78 * v ** 0.44 * G0 ** -0.22 * s ** (1 / 3);
  }
  function finalCraterDiameter(Dtc) { return 1.25 * Dtc; }

  const PHI0 = 731641.664; // J/m²  (50 % mortality, keep)
  function fireball50Radius(E_j, eta = 1e-3) {
    return Math.sqrt((eta * E_j) / (2 * Math.PI * PHI0));
  }

  const PX_REF = 75000, DX_REF = 290;
  function overpressureAtDistance(D, E) {
    const Wkt = Math.max(energyToKT(E), 1e-12);
    const Z = D / Math.pow(Wkt, 1 / 3);
    return PX_REF * Math.exp(-D / DX_REF);
  }
  function overpressureRadius(E, pTarget) {
    const f = (D) => overpressureAtDistance(D, E) - pTarget;
    let lo = 1, hi = 1000;
    
    // Ensure we have a proper bracket
    while (f(hi) > 0 && hi < 1e8) hi *= 2;
    
    // Check if target pressure is achievable
    if (f(lo) < 0 && f(hi) < 0) {
      console.warn('overpressureRadius: Target pressure too high', { pTarget, E });
      return 0; // No damage radius if pressure never reached
    }
    
    const result = bisect(f, lo, hi, 1e-3, 300);
    return isNaN(result) ? 0 : result;
  }

  function windFromOverpressure(p) {
    return C0 * Math.sqrt((5 * p) / (7 * P_ATM)) *
           Math.sqrt(1 + (6 * p) / (7 * P_ATM));
  }
  function pFromWind(u) {
    // Handle edge case of zero wind speed
    if (u <= 0) return 0;
    
    const f = (p) => windFromOverpressure(p) - u;
    
    // Check if wind speed is achievable
    const maxWind = windFromOverpressure(1e7); // Very high pressure
    if (u > maxWind) {
      console.warn('pFromWind: Wind speed too high', { u, maxWind });
      return 1e7; // Return max pressure
    }
    
    const result = bisect(f, 1e-3, 1e7, 1e-6, 200);
    return isNaN(result) ? 0 : result;
  }
  function windRadius(E, uTarget) {
    const pNeeded = pFromWind(uTarget);
    return overpressureRadius(E, pNeeded);
  }

  function globalMagnitudeFromEnergy(E) {
    return 0.67 * Math.log10(E) - 5.87;
  }
  function MeffAtDistance(Mg, D) {
    if (D < 60000) return Mg - 2.38e-5 * D;
    if (D < 700000) return Mg - 4.8e-6 * D - 1.1644;
    const Delta = D / Re;
    return Mg - 1.66 * Math.log10(Delta) - 6.399;
  }
  function seismicRadius(E, MeffTarget) {
    const M = globalMagnitudeFromEnergy(E);
    
    // Check if the global magnitude itself is less than target
    // In this case, there's no distance where we achieve the target
    if (M < MeffTarget) {
      // Only log warning once per calculation to avoid spam
      if (!seismicRadius._warnedLowMagnitude) {
        console.warn('seismicRadius: Impact magnitude too low for damage threshold', { MeffTarget, M });
        seismicRadius._warnedLowMagnitude = true;
      }
      return 0;
    }
    
    const f = (D) => MeffAtDistance(M, D) - MeffTarget;
    let lo = 1, hi = 1e5;
    
    // Expand search range if needed
    while (f(hi) > 0 && hi < 1e9) hi *= 2;
    
    // Additional check for edge cases
    if (f(lo) < 0 && f(hi) < 0) {
      return 0;
    }
    
    const result = bisect(f, lo, hi, 1e-3, 300);
    return isNaN(result) ? 0 : result;
  }

  const P_DAMAGE_OVERPRESSURE = 500;  // Pa (~0.07 psi) - light structural effects, windows may crack
  const V_DAMAGE_WIND = 10;           // m/s (~22 mph) - noticeable wind, light debris movement
  const MEFF_DAMAGE = 7.0;            // moderate earthquake damage

  function computeAll(p) {
    const { L0_m, rho_i, rho_t = 2500, v_ms, gamma_deg = 45, luminousEfficiency = 1e-3 } = p;
    const E = kineticEnergyJ(L0_m, rho_i, v_ms);
    const Dtc = transientCraterDiameter(L0_m, rho_i, rho_t, v_ms, gamma_deg);
    const Dfr = finalCraterDiameter(Dtc);

    const fire50 = fireball50Radius(E, luminousEfficiency);
    const seisDamage = seismicRadius(E, MEFF_DAMAGE);

    return {
      energy_J: E,
      energy_kt: E / KT_TO_J,
      crater: { D_transient_m: Dtc, D_final_m: Dfr },
      fireball50_m: fire50,
      seismicDamage_m: seisDamage
    };
  }

  // Function to add impact zone information (placeholder for external use)
  function addImpactZoneInfo(lat, lon, zones) {
    // This function can be used to store or display impact zone information
    // Currently acts as a no-op but prevents errors
    console.log(`Impact zones at ${lat.toFixed(4)}, ${lon.toFixed(4)}:`, {
      energy_kt: zones.energy_kt.toFixed(2),
      crater_diameter_m: zones.crater.D_final_m.toFixed(1),
      fireball_radius_m: zones.fireball50_m.toFixed(1),
      seismic_damage_m: zones.seismicDamage_m.toFixed(1)
    });
    
    // Log which zones are visible (have radius > 0)
    const visibleZones = [];
    if (zones.crater.D_final_m > 0) visibleZones.push(`crater: ${(zones.crater.D_final_m/2).toFixed(1)}m`);
    if (zones.fireball50_m > 0) visibleZones.push(`fireball: ${zones.fireball50_m.toFixed(1)}m`);
    if (zones.seismicDamage_m > 0) visibleZones.push(`seismic: ${zones.seismicDamage_m.toFixed(1)}m`);
    
    console.log('Visible zones:', visibleZones.length > 0 ? visibleZones.join(', ') : 'None');
    
    // Update the UI window if available
    if (typeof window !== 'undefined' && window.updateImpactZonesDisplay) {
      window.updateImpactZonesDisplay(lat, lon, zones);
    }
  }

  return {
    computeAll,
    transientCraterDiameter,
    finalCraterDiameter,
    fireball50Radius,
    overpressureAtDistance,
    windFromOverpressure,
    MeffAtDistance,
    addImpactZoneInfo
  };
})();

export default ImpactZones;

if (typeof module !== 'undefined' && require) {
  const params = {
    L0_m: 50,
    rho_i: 3100,
    rho_t: 2500,
    v_ms: 20000,
    gamma_deg: 45,
    luminousEfficiency: 1e-3
  };
  console.log('Impact wide-damage zones:',
    JSON.stringify(ImpactZones.computeAll(params), null, 2));
}
