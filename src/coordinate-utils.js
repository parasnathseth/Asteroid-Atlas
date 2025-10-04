/**
 * Coordinate mapping utilities for converting between real-world coordinates
 * and 3D positions on the Earth sphere
 */

import * as THREE from "three"

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
  const lonRad = -lon * Math.PI / 180; // Try negating longitude
  
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
  'Sydney': { lat: -33.8688, lon: 151.2093 },
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
 * Get the country/region name for given coordinates (simplified lookup)
 * This is a basic implementation - for production use, consider using a proper geocoding service
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @returns {string} Approximate region name
 */
export function getRegionName(lat, lon) {
  // Very basic region detection based on coordinate ranges
  if (lat > 66.5) return "Arctic";
  if (lat < -66.5) return "Antarctic";
  
  if (lon >= -180 && lon < -60) {
    if (lat > 45) return "North America";
    if (lat > 20) return "United States";
    if (lat > -10) return "Central America";
    return "South America";
  }
  
  if (lon >= -60 && lon < 20) {
    if (lat > 35) return "Europe";
    if (lat > 0) return "Africa (North)";
    return "Africa (South)";
  }
  
  if (lon >= 20 && lon < 140) {
    if (lat > 50) return "Russia/Siberia";
    if (lat > 25) return "Asia (Central)";
    if (lat > -10) return "Asia (South)";
    return "Australia/Oceania";
  }
  
  if (lon >= 140 && lon <= 180) {
    if (lat > 20) return "East Asia";
    return "Pacific";
  }
  
  return "Unknown Region";
}