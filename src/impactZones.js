// impactZones.js
// JavaScript calculator for crater + 50%-mortality zones (simplified, traceable to Rumpf 2016).
// Citations (Rumpf thesis equations):
// - transient crater formula (eq. 3.42): :contentReference[oaicite:9]{index=9}
// - fireball radius & thermal mapping (eqs. 3.56..3.59) & thermal midpoint phi0: 
// - blast/overpressure modelling references and vulnerability p50: 
// - wind-from-overpressure (eq. 3.55): :contentReference[oaicite:12]{index=12}
// - seismic magnitude and Meff relations (eqs. 3.45..3.47) and Meff50: 

const ImpactZones = (function () {
  const G0 = 9.80665; // m/s^2

  // ---------- helper numeric solvers ----------
  function bisect(fn, lo, hi, tol = 1e-6, maxIter = 100) {
    let fLo = fn(lo);
    let fHi = fn(hi);
    if (isNaN(fLo) || isNaN(fHi)) throw new Error('bisect: invalid function values');
    if (fLo === 0) return lo;
    if (fHi === 0) return hi;
    if (fLo * fHi > 0) throw new Error('bisect: root not bracketed');
    let mid, fMid;
    for (let i = 0; i < maxIter; i++) {
      mid = 0.5 * (lo + hi);
      fMid = fn(mid);
      if (Math.abs(fMid) < tol) return mid;
      if (fLo * fMid <= 0) {
        hi = mid; fHi = fMid;
      } else {
        lo = mid; fLo = fMid;
      }
    }
    return mid; // best-effort
  }

  // ---------- physics helpers ----------
  function kineticEnergyJ(diameter_m, density_kgm3, speed_ms) {
    const vol = (Math.PI / 6) * Math.pow(diameter_m, 3);
    const mass = density_kgm3 * vol;
    return 0.5 * mass * speed_ms * speed_ms;
  }

  // Convert energy (J) to kiloton TNT
  function energyToKT(E_j) { return E_j / 4.184e12; } // 1 kt = 4.184e12 J

  // ---------- 1) Crater functions ----------
  // Transient crater diameter D_tc (m) from Collins / Rumpf (eq. 3.42).
  // Dtc = 1.161 * (rho_i/rho_t)^(1/3) * L0^0.78 * v^0.44 * g0^-0.22 * sin^(1/3)gamma
  function transientCraterDiameter(L0_m, rho_i, rho_t, v_ms, gamma_deg) {
    const sinGamma = Math.sin((gamma_deg * Math.PI) / 180);
    const Dtc = 1.161 *
      Math.pow(rho_i / rho_t, 1 / 3) *
      Math.pow(L0_m, 0.78) *
      Math.pow(v_ms, 0.44) *
      Math.pow(G0, -0.22) *
      Math.pow(sinGamma, 1 / 3);
    return Dtc;
  }

  // Final crater: Rumpf uses simple scaling D_final = 1.25 * D_transient (sensitivity analysis)
  function finalCraterDiameter(Dtc) {
    return 1.25 * Dtc;
  }

  // ---------- 2) Fireball (thermal) 50% radius ----------
  // Use phi0 (the logistic midpoint) from Rumpf: phi0 = 731641.664 J/m^2 (50% mortality for fully exposed)
  // Rumpf derived fireball radius Rf = 0.002 * E^(1/3) (eq. 3.56). For simplicity we assume full visible hemisphere f=1,
  // giving phi(D) ~ (eta_lum * E) / (2 * pi * D^2). Solve phi = phi0 => D = sqrt( (eta * E) / (2*pi*phi0) ).
  // Note: The thesis contains a more accurate geometry factor f(Δ,Rf,Rearth) — this simplified form is acceptable for
  // conservative approximate radii; request full geometry if you need exact ARMOR outputs. 
  const PHI0 = 731641.664; // J/m^2 (thermal logistic midpoint - 50% for full exposure). :contentReference[oaicite:15]{index=15}

  function fireball50RadiusSimple(E_j, luminousEfficiency = 1e-3 /* default */) {
    // D = sqrt( f * eta * E / (2*pi*phi0) ) ; using f=1
    const numer = luminousEfficiency * E_j;
    if (numer <= 0) return NaN;
    const D = Math.sqrt(numer / (2 * Math.PI * PHI0));
    return D;
  }

  // ---------- 3) Overpressure (shockwave) 50% radius ----------
  // Rumpf's expected-case 50% mortality overpressure midpoint: p50 = 440430.986 Pa. :contentReference[oaicite:16]{index=16}
  const P50_OVERPRESSURE = 440430.986; // Pa (expected-case 50% midpoint). :contentReference[oaicite:17]{index=17}

  // Simplified blast-overpressure function using scaled distance Z = D / (W_mt)^(1/3), approximate empirical fit.
  // Rumpf/Collins use Hopkinson-Cranz scaling and piecewise formulae; we implement a practical approximate curve:
  // For ground impacts, use an empirical fit p(Z) ~ A / Z^3 for ranged Z; we use a standard scaled-distance approach.
  // NOTE: This is a simplified placeholder for demonstration. For exact ARMOR-calibrated curves use the full piecewise
  // expressions in Rumpf/Collins (eqs. 3.48..3.54). Here we implement a commonly used approximate conversion.
  // We'll implement p(D) as follows:
  //   - compute yield in kilotons (Wkt)
  //   - compute scaled distance Z = D / Wkt^(1/3)
  //   - use an approximate mapping p(Pa) = 1e6 * exp(-k * Z)   (very approximate)
  // We then solve p(D) = P50 using bisection.
  // Citation: blast modelling details are in Rumpf (section 3.2.5) / Collins. Use full formulas for production use. :contentReference[oaicite:18]{index=18}
  function approxOverpressureFromDistance(D_m, E_j) {
    const Wkt = energyToKT(E_j);
    const Z = D_m / Math.pow(Wkt, 1 / 3);
    // approximate empirical decay coefficients (tuned to produce reasonable numbers for small-mid yields)
    const k = 1.0; // decay constant — conservative placeholder
    // produce Pa-level overpressure. This is approximate.
    const pPa = 1e6 * Math.exp(-k * Z);
    return pPa;
  }

  function overpressure50Radius(E_j, searchUpper = 1e7 /* m */) {
    // bracket root: p(D) - P50 = 0
    const f = (D) => approxOverpressureFromDistance(D, E_j) - P50_OVERPRESSURE;
    // ensure bracket: evaluate at small D
    let lo = 1; // 1 m
    let hi = searchUpper;
    // if even at hi p > P50 then increase hi
    while (f(hi) > 0 && hi < 1e9) hi *= 2;
    if (f(lo) < 0 && f(hi) < 0) return NaN; // no root (overpressure always below P50)
    try {
      const D = bisect(f, lo, hi, 1e-3, 200);
      return D;
    } catch (e) {
      return NaN;
    }
  }

  // ---------- 4) Wind blast 50% radius ----------
  // Rumpf expected-case wind 50% midpoint v50 = 112.4 m/s. :contentReference[oaicite:19]{index=19}
  const V50_WIND = 112.4; // m/s (expected-case midpoint). :contentReference[oaicite:20]{index=20}

  // Wind speed u from overpressure p: Glasstone & Dolan relation (approx) (eq. 3.55 in Rumpf)
  // A practical invertible approximation: u(p) = c0 * sqrt(5*p/(7*p_a))   (we ignore the small correction factor)
  // We'll use atmospheric ambient pressure p_a = 101325 Pa, c0 = 340 m/s.
  function windFromOverpressure(pPa) {
    const p_a = 101325;
    const c0 = 340;
    const u = c0 * Math.sqrt((5 * pPa) / (7 * p_a));
    return u;
  }

  // To find p that yields wind = V50_WIND, invert windFromOverpressure:
  function pFromWind(u_ms) {
    const p_a = 101325;
    const c0 = 340;
    const p = (7 * p_a * (u_ms * u_ms)) / (5 * c0 * c0);
    return p;
  }

  function wind50Radius(E_j) {
    const pNeeded = pFromWind(V50_WIND);
    // Now solve p(D) = pNeeded using the same approxOverpressureFromDistance
    const f = (D) => approxOverpressureFromDistance(D, E_j) - pNeeded;
    let lo = 1, hi = 1e7;
    while (f(hi) > 0 && hi < 1e9) hi *= 2;
    try {
      const D = bisect(f, lo, hi, 1e-3, 200);
      return D;
    } catch (e) {
      return NaN;
    }
  }

  // ---------- 5) Seismic / earthquake 50% radius ----------
  // Rumpf: seismic 50% effective magnitude Meff50 = 8.68559246. (eq. 3.75). :contentReference[oaicite:21]{index=21}
  const MEFF50 = 8.68559246; // Rumpf seismic midpoint (expected-case). :contentReference[oaicite:22]{index=22}

  // Impact energy -> M (global Richter-like): M = 0.67 * log10(E_J) - 5.87  (eq. 3.45)
  function globalMagnitudeFromEnergy(E_j) {
    return 0.67 * Math.log10(E_j) - 5.87;
  }

  // Meff(D) piecewise: use Rumpf piecewise (eq. 3.46..3.47). We'll implement the branches:
  function MeffAtDistance(M_global, D_m) {
    if (D_m < 60000) {
      return M_global - 2.38e-5 * D_m;
    } else if (D_m < 700000) {
      return M_global - 4.8e-6 * D_m - 1.1644;
    } else {
      const Re = 6371000; // Earth radius
      const Delta = D_m / Re;
      return M_global - 1.66 * Math.log10(Delta) - 6.399;
    }
  }

  function seismic50Radius(E_j) {
    const M = globalMagnitudeFromEnergy(E_j);
    // find D such that MeffAtDistance(M, D) = MEFF50
    // We'll check which branch the root falls into by testing branch endpoints
    // 1) Try small branch: Meff(D)=M - 2.38e-5*D = MEFF50 => D = (M - MEFF50) / 2.38e-5
    const D_small = (M - MEFF50) / 2.38e-5;
    if (D_small >= 0 && D_small < 60000) return D_small;
    // 2) middle branch: M - 4.8e-6*D - 1.1644 = MEFF50 => D = (M - 1.1644 - MEFF50)/4.8e-6
    const D_mid = (M - 1.1644 - MEFF50) / 4.8e-6;
    if (D_mid >= 60000 && D_mid < 700000) return D_mid;
    // 3) far branch: M - 1.66*log10(D/Re) - 6.399 = MEFF50
    // => 1.66*log10(D/Re) = M - 6.399 - MEFF50
    // => log10(D/Re) = (M - 6.399 - MEFF50)/1.66
    const Re = 6371000;
    const rhs = (M - 6.399 - MEFF50) / 1.66;
    const D_far = Re * Math.pow(10, rhs);
    if (D_far >= 700000) return D_far;
    return NaN; // out of range / not found
  }

  // ---------- top-level convenience ----------
  function computeAll(params) {
    const { L0_m, rho_i, rho_t, v_ms, gamma_deg, luminousEfficiency = 1e-3 } = params;
    const E = kineticEnergyJ(L0_m, rho_i, v_ms);

    // crater:
    const Dtc = transientCraterDiameter(L0_m, rho_i, rho_t, v_ms, gamma_deg);
    const Dfr = finalCraterDiameter(Dtc);
    const Afr = Math.PI * Math.pow(Dfr / 2, 2);

    // fireball 50% (approx):
    const fire50 = fireball50RadiusSimple(E, luminousEfficiency);

    // overpressure 50% (approx using simplified blast model):
    const over50 = overpressure50Radius(E);

    // wind 50%:
    const wind50 = wind50Radius(E);

    // seismic 50%:
    const seis50 = seismic50Radius(E);

    return {
      energy_J: E,
      crater: { D_transient_m: Dtc, D_final_m: Dfr, area_m2: Afr },
      fireball50_m: fire50,
      overpressure50_m: over50,
      wind50_m: wind50,
      seismic50_m: seis50
    };
  }

  // Add impact zone info panel with close button and persistence
  function addImpactZoneInfo(centerLat, centerLon, zones) {
    // Check if info panel already exists - update it instead of creating new one
    let infoDiv = document.getElementById('impact-zone-info');
    
    if (!infoDiv) {
      // Create new info display for the impact zones
      infoDiv = document.createElement('div');
      infoDiv.id = 'impact-zone-info';
      infoDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 10px;
        transform: translateY(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: Arial, sans-serif;
        font-size: 12px;
        max-width: 300px;
        z-index: 1500;
        border-left: 4px solid #ff6600;
      `;
      
      // Add close button
      const closeButton = document.createElement('button');
      closeButton.innerHTML = '✕';
      closeButton.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: #ff6600;
        color: white;
        border: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      `;
      
      closeButton.addEventListener('mouseenter', () => {
        closeButton.style.background = '#cc5200';
        closeButton.style.transform = 'scale(1.1)';
      });
      
      closeButton.addEventListener('mouseleave', () => {
        closeButton.style.background = '#ff6600';
        closeButton.style.transform = 'scale(1)';
      });
      
      closeButton.addEventListener('click', () => {
        document.body.removeChild(infoDiv);
      });
      
      infoDiv.appendChild(closeButton);
      document.body.appendChild(infoDiv);
    }
    
    const formatDistance = (distance_m) => {
      if (!distance_m || isNaN(distance_m)) return 'N/A';
      if (distance_m < 1000) return `${Math.round(distance_m)} m`;
      return `${(distance_m / 1000).toFixed(1)} km`;
    };
    
    // Update the content (excluding the close button)
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = `
      <h4 style="margin: 0 0 10px 0; color: #ff6600; padding-right: 25px;">Impact Zones</h4>
      <div style="font-size: 11px; margin-bottom: 10px;">
        Location: ${centerLat.toFixed(3)}°, ${centerLon.toFixed(3)}°
      </div>
      <div style="margin-bottom: 5px;">
        <span style="color: #8B0000;">●</span> Crater: ${formatDistance(zones.crater.D_final_m)}
      </div>
      <div style="margin-bottom: 5px;">
        <span style="color: #FF4500;">●</span> Fireball: ${formatDistance(zones.fireball50_m)}
      </div>
      <div style="margin-bottom: 5px;">
        <span style="color: #FF1493;">●</span> Overpressure: ${formatDistance(zones.overpressure50_m)}
      </div>
      <div style="margin-bottom: 5px;">
        <span style="color: #9370DB;">●</span> Wind Blast: ${formatDistance(zones.wind50_m)}
      </div>
      <div style="margin-bottom: 5px;">
        <span style="color: #32CD32;">●</span> Seismic: ${formatDistance(zones.seismic50_m)}
      </div>
      <div style="margin-top: 10px; font-size: 10px; color: #ccc;">
        Energy: ${(zones.energy_J / 4.184e12).toFixed(2)} kt TNT<br>
        <span style="font-style: italic;">Most recent impact</span>
      </div>
    `;
    
    // Replace the content while keeping the close button
    const closeButton = infoDiv.querySelector('button');
    infoDiv.innerHTML = '';
    infoDiv.appendChild(closeButton);
    infoDiv.appendChild(contentDiv);
  }

  return {
    computeAll,
    addImpactZoneInfo, // Export the new function
    // also expose individual helpers:
    transientCraterDiameter,
    finalCraterDiameter,
    fireball50RadiusSimple,
    overpressure50Radius,
    wind50Radius,
    seismic50Radius
  };
})();

// Only use ES6 export for the build system
export default ImpactZones;

// ---------- Example usage ----------
if (typeof module !== 'undefined' && require) {
  // Node example
  const params = {
    L0_m: 50,          // 50 m diameter (this should be the primary export)
    rho_i: 3100,      // kg/m3 (stony)
    rho_t: 2500,      // target density (sedimentary rock)
    v_ms: 20000,      // 20 km/s
    gamma_deg: 45,    // impact angle
    luminousEfficiency: 1e-3
  };
  const result = ImpactZones.computeAll(params);
  console.log('Impact summary (approx):', JSON.stringify(result, null, 2));
}