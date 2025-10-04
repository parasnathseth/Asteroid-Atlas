/**
 * Debug utility to help calibrate coordinate mapping
 * This creates a set of test markers at cardinal directions and known locations
 * to help visually identify how the coordinate system needs to be adjusted
 */

import * as THREE from "three"
import { createLocationMarker, createLocationLabel, latLonToVector3, vector3ToLatLon } from "./coordinate-utils"

export function createDebugCoordinateGrid(scene) {
  const debugGroup = new THREE.Group()
  
  // Cardinal directions markers (should align with Earth's features)
  const cardinalPoints = [
    { lat: 0, lon: 0, name: "0°,0° (Gulf of Guinea)", color: 0xff0000 },
    { lat: 0, lon: 90, name: "0°,90° (Indian Ocean)", color: 0x00ff00 },
    { lat: 0, lon: 180, name: "0°,180° (Pacific)", color: 0x0000ff },
    { lat: 0, lon: -90, name: "0°,-90° (Galapagos)", color: 0xffff00 },
    { lat: 90, lon: 0, name: "North Pole", color: 0xff00ff },
    { lat: -90, lon: 0, name: "South Pole", color: 0x00ffff },
  ]
  
  cardinalPoints.forEach(point => {
    const marker = createLocationMarker(point.lat, point.lon, {
      color: point.color,
      size: 0.3,
      radius: 10.2
    })
    const label = createLocationLabel(point.name, point.lat, point.lon, {
      radius: 10.8
    })
    debugGroup.add(marker)
    debugGroup.add(label)
  })
  
  // Known geographical features for reference
  const knownFeatures = [
    { lat: 51.4779, lon: 0.0015, name: "Greenwich", color: 0xffffff }, // Prime Meridian
    { lat: 0, lon: 0, name: "Null Island", color: 0x888888 }, // Equator + Prime Meridian
    { lat: 40.7128, lon: -74.0060, name: "NYC", color: 0xff4444 }, // Should be over North America
    { lat: -33.8688, lon: 151.2093, name: "Sydney", color: 0x44ff44 }, // Should be over Australia
    { lat: 35.6762, lon: 139.6503, name: "Tokyo", color: 0x4444ff }, // Should be over Japan
  ]
  
  knownFeatures.forEach(feature => {
    const marker = createLocationMarker(feature.lat, feature.lon, {
      color: feature.color,
      size: 0.2,
      radius: 10.15
    })
    debugGroup.add(marker)
  })
  
  scene.add(debugGroup)
  return debugGroup
}

export function testCoordinateMapping() {
  console.log("=== Coordinate Mapping Test ===")
  
  // Test known locations
  const testPoints = [
    { name: "New York City", lat: 40.7128, lon: -74.0060 },
    { name: "Sydney", lat: -33.8688, lon: 151.2093 },
    { name: "London", lat: 51.5074, lon: -0.1278 },
    { name: "Tokyo", lat: 35.6762, lon: 139.6503 }
  ]
  
  testPoints.forEach(point => {
    const vector = latLonToVector3(point.lat, point.lon)
    const backToLatLon = vector3ToLatLon(vector)
    
    console.log(`${point.name}:`)
    console.log(`  Input: ${point.lat.toFixed(4)}°, ${point.lon.toFixed(4)}°`)
    console.log(`  Vector: (${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}, ${vector.z.toFixed(2)})`)
    console.log(`  Back to LatLon: ${backToLatLon.lat.toFixed(4)}°, ${backToLatLon.lon.toFixed(4)}°`)
    console.log(`  Error: lat=${Math.abs(point.lat - backToLatLon.lat).toFixed(4)}°, lon=${Math.abs(point.lon - backToLatLon.lon).toFixed(4)}°`)
    console.log("---")
  })
}