/**
 * Coordinate mapping utilities for converting between real-world coordinates
 * and 3D positions on the Earth sphere
 */

import * as THREE from "three"
import { getCountryKey, getCityKey, getStateProvinceKey } from './location-translator.js'

// Import i18n globally if available
let i18n = null;
if (typeof window !== 'undefined' && window.i18n) {
  i18n = window.i18n;
}

/**
 * Convert latitude/longitude to 3D position on sphere
 * @param {number} lat - Latitude in degrees (-90 to 90)
 * @param {number} lon - Longitude in degrees (-180 to 180)
 * @param {number} radius - Radius of the sphere (default: 10 to match Earth geometry)
 * @returns {THREE.Vector3} 3D position on sphere
 */
export function latLonToVector3(lat, lon, radius = 10) {
  // Convert latitude and longitude to radians
  const latRad = lat * Math.PI / 180;
  const lonRad = -lon * Math.PI / 180; // Negate longitude
  
  // Standard spherical to Cartesian conversion
  const x = radius * Math.cos(latRad) * Math.cos(lonRad);
  const y = radius * Math.sin(latRad);
  const z = radius * Math.cos(latRad) * Math.sin(lonRad);
  
  return new THREE.Vector3(x, y, z);
}

/**
 * Convert 3D position to latitude/longitude
 * @param {THREE.Vector3} position - 3D position on sphere
 * @param {number} radius - Radius of the sphere (default: 10)
 * @returns {object} Object with lat and lon properties
 */
export function vector3ToLatLon(position, radius = 10) {
  // Normalize the position to the sphere radius
  const normalizedPos = position.clone().normalize().multiplyScalar(radius);
  
  // Convert back from Cartesian to lat/lon
  const lat = Math.asin(normalizedPos.y / radius) * 180 / Math.PI;
  let lon = -Math.atan2(normalizedPos.z, normalizedPos.x) * 180 / Math.PI; // Negate to match forward conversion
  
  // Normalize longitude to -180 to 180 range
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  
  return {
    lat: lat,
    lon: lon
  };
}

/**
 * Create a marker at a specific latitude/longitude
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {object} options - Marker options (color, size, etc.)
 * @returns {THREE.Mesh} Marker mesh
 */
export function createLocationMarker(lat, lon, options = {}) {
  const {
    color = 0xff0000,
    size = 0.2,
    radius = 10.1 // Slightly above Earth surface
  } = options;
  
  const position = latLonToVector3(lat, lon, radius);
  
  const geometry = new THREE.SphereGeometry(size, 8, 8);
  const material = new THREE.MeshBasicMaterial({ color: color });
  const marker = new THREE.Mesh(geometry, material);
  
  marker.position.copy(position);
  marker.userData = { lat, lon };
  
  return marker;
}

/**
 * Create a text label for a location
 * @param {string} text - Text to display
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {object} options - Label options
 * @returns {THREE.Sprite} Text sprite
 */
export function createLocationLabel(text, lat, lon, options = {}) {
  const {
    fontSize = 64,
    fontColor = '#ffffff',
    backgroundColor = 'rgba(0, 0, 0, 0.7)',
    radius = 10.5
  } = options;
  
  // Create canvas for text
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 128;
  
  // Style the text
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  context.font = `${fontSize}px Arial`;
  context.fillStyle = fontColor;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  
  // Create texture and sprite
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  
  const position = latLonToVector3(lat, lon, radius);
  sprite.position.copy(position);
  sprite.scale.set(2, 1, 1);
  sprite.userData = { lat, lon, text };
  
  return sprite;
}

/**
 * Famous locations around the world with their coordinates
 */
export const FAMOUS_LOCATIONS = {
  'New York': { lat: 40.7128, lon: -74.0060 },
  'London': { lat: 51.5074, lon: -0.1278 },
  'Tokyo': { lat: 35.6762, lon: 139.6503 },
  'Washington': { lat: 38.9072, lon: -77.0369 },
  'Paris': { lat: 48.8566, lon: 2.3522 },
  'Rio de Janeiro': { lat: -22.9068, lon: -43.1729 },
  'Cairo': { lat: 30.0444, lon: 31.2357 },
  'Mumbai': { lat: 19.0760, lon: 72.8777 },
  'Moscow': { lat: 55.7558, lon: 37.6176 },
  'Cape Town': { lat: -33.9249, lon: 18.4241 },
  'Beijing': { lat: 39.9042, lon: 116.4074 },
  'Los Angeles': { lat: 34.0522, lon: -118.2437 },
  'Dubai': { lat: 25.2048, lon: 55.2708 },
  'Singapore': { lat: 1.3521, lon: 103.8198 },
  'Reykjavik': { lat: 64.1466, lon: -21.9426 },
  // Reference points for coordinate testing
  'Greenwich (0°,0°)': { lat: 51.4779, lon: 0.0015 }, // Prime Meridian
  'Null Island (0°,0°)': { lat: 0.0, lon: 0.0 }, // Equator + Prime Meridian intersection
};

/**
 * Calculate the great circle distance between two points on Earth
 * @param {number} lat1 - Latitude of first point in degrees
 * @param {number} lon1 - Longitude of first point in degrees
 * @param {number} lat2 - Latitude of second point in degrees
 * @param {number} lon2 - Longitude of second point in degrees
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Get the country/region name for given coordinates using reverse geocoding API
 * Falls back to basic region detection if API fails
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @returns {Promise<string>} Country or region name
 */
export async function getRegionName(lat, lon) {
  try {
    // Use free reverse geocoding API (no API key required)
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { 
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      
      // Extract and translate location information
      if (data.countryName) {
        const translatedCountry = translateLocationName(data.countryName, 'country');
        let location = translatedCountry;
        
        // Add more detail if available
        if (data.principalSubdivision && data.principalSubdivision !== data.countryName) {
          const translatedSubdivision = translateLocationName(data.principalSubdivision, 'subdivision');
          location = `${translatedSubdivision}, ${translatedCountry}`;
        } else if (data.city && data.city !== data.countryName) {
          const translatedCity = translateLocationName(data.city, 'city');
          location = `${translatedCity}, ${translatedCountry}`;
        }
        
        return location;
      }
      
      // Fallback to locality if country not found
      if (data.locality) {
        return translateLocationName(data.locality, 'city');
      }
    }
  } catch (error) {
    console.warn('Reverse geocoding failed, using fallback detection:', error.message);
  }
  
  // Fallback to basic geographic detection if API fails
  return getBasicRegionName(lat, lon);
}

/**
 * Basic fallback region detection when API is unavailable
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @returns {string} Basic region name
 */
function getBasicRegionName(lat, lon) {
  // Normalize longitude
  let normalizedLon = lon;
  while (normalizedLon > 180) normalizedLon -= 360;
  while (normalizedLon < -180) normalizedLon += 360;
  
  // Polar regions
  if (lat > 66.5) return "Arctic Region";
  if (lat < -66.5) return "Antarctica";
  
  // Basic continental detection
  if (normalizedLon >= -168 && normalizedLon <= -52) {
    // Americas
    if (lat > 48) return "Northern North America";
    if (lat > 23) return "United States/Canada";
    if (lat > 7) return "Mexico/Central America"; 
    if (lat > -56) return "South America";
  }
  
  if (normalizedLon >= -52 && normalizedLon <= 40) {
    // Europe/Africa/Atlantic
    if (lat > 35) return "Europe";
    if (lat > -35) return "Africa";
    return "South Atlantic";
  }
  
  if (normalizedLon >= 40 && normalizedLon <= 180) {
    // Asia/Oceania/Pacific
    if (lat > 50) return "Northern Asia";
    if (lat > 10) return "Asia";
    if (lat > -50) return "Southeast Asia/Oceania";
    return "Southern Ocean";
  }
  
  // Ocean fallbacks
  if (Math.abs(lat) < 60) {
    if (normalizedLon > 120 || normalizedLon < -120) return "Pacific Ocean";
    if (normalizedLon > -40 && normalizedLon < 40) return "Atlantic/Europe/Africa";
    return "Indian Ocean";
  }
  
  return "Unknown Region";
}

/**
 * Get detailed location information with caching
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @returns {Promise<object>} Detailed location object
 */
export async function getDetailedLocation(lat, lon) {
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  
  // Check if we have cached data (simple in-memory cache)
  if (typeof window !== 'undefined' && window.locationCache && window.locationCache[cacheKey]) {
    return window.locationCache[cacheKey];
  }
  
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );
    
    if (response.ok) {
      const data = await response.json();
      
      const locationInfo = {
        country: data.countryName || 'Unknown',
        region: data.principalSubdivision || '',
        city: data.city || '',
        locality: data.locality || '',
        continent: data.continent || '',
        formatted: data.countryName || getBasicRegionName(lat, lon),
        coordinates: { lat, lon },
        source: 'API'
      };
      
      // Cache the result
      if (typeof window !== 'undefined') {
        if (!window.locationCache) window.locationCache = {};
        window.locationCache[cacheKey] = locationInfo;
      }
      
      return locationInfo;
    }
  } catch (error) {
    console.warn('Detailed location lookup failed:', error.message);
  }
  
  // Fallback
  return {
    country: getBasicRegionName(lat, lon),
    region: '',
    city: '',
    locality: '',
    continent: '',
    formatted: getBasicRegionName(lat, lon),
    coordinates: { lat, lon },
    source: 'Fallback'
  };
}

/**
 * Helper function to translate location names using the translation mappings
 * @param {string} locationName - Original location name from API
 * @param {string} type - Type of location (country, city, subdivision)
 * @returns {string} Translated location name or original if no translation found
 */
function translateLocationName(locationName, type) {
  try {
    // Update i18n reference if not available
    if (!i18n && typeof window !== 'undefined' && window.i18n) {
      i18n = window.i18n;
    }
    
    if (!i18n || !locationName) {
      return locationName;
    }
    
    let translationKey = null;
    
    switch (type) {
      case 'country':
        translationKey = getCountryKey(locationName);
        if (translationKey) {
          const translated = i18n.t(`countries.${translationKey}`);
          // Return translation if it's different from the key (meaning translation exists)
          if (translated && translated !== `countries.${translationKey}`) {
            return translated;
          }
        }
        break;
        
      case 'city':
        translationKey = getCityKey(locationName);
        if (translationKey) {
          const translated = i18n.t(`locations.${translationKey}`);
          if (translated && translated !== `locations.${translationKey}`) {
            return translated;
          }
        }
        break;
        
      case 'subdivision':
        translationKey = getStateProvinceKey(locationName);
        if (translationKey) {
          const translated = i18n.t(`locations.${translationKey}`);
          if (translated && translated !== `locations.${translationKey}`) {
            return translated;
          }
        }
        break;
        
      default:
        // Try all translation types if type is unknown
        const countryKey = getCountryKey(locationName);
        if (countryKey) {
          const translated = i18n.t(`countries.${countryKey}`);
          if (translated && translated !== `countries.${countryKey}`) {
            return translated;
          }
        }
        
        const cityKey = getCityKey(locationName);
        if (cityKey) {
          const translated = i18n.t(`locations.${cityKey}`);
          if (translated && translated !== `locations.${cityKey}`) {
            return translated;
          }
        }
        
        const stateKey = getStateProvinceKey(locationName);
        if (stateKey) {
          const translated = i18n.t(`locations.${stateKey}`);
          if (translated && translated !== `locations.${stateKey}`) {
            return translated;
          }
        }
        break;
    }
    
    // Return original if no translation found
    return locationName;
  } catch (error) {
    console.warn('Translation failed for location:', locationName, error);
    return locationName;
  }
}