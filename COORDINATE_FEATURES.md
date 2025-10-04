# Coordinate Mapping Features

This Three.js Earth simulation now includes real-world coordinate mapping that allows you to work with actual latitude and longitude coordinates.

## Features Added

### 1. Real-World Coordinate System
- **Accurate mapping**: Latitude/longitude coordinates map correctly to positions on the 3D Earth
- **Standard coordinate ranges**: Latitude (-90° to 90°), Longitude (-180° to 180°)
- **Proper Earth orientation**: Earth is correctly oriented with North Pole at top

### 2. Interactive Coordinate Input
- **Manual input**: Enter specific lat/lon coordinates in the bottom-left interface
- **Quick locations**: Buttons for major cities (London, Tokyo, Sydney)
- **Click-to-get coordinates**: Click anywhere on Earth to see coordinates at that point

### 3. Location Markers
- **Famous locations**: Green markers show major world cities
- **Target marker**: Red marker shows your current target location
- **Temporary markers**: Yellow markers appear when you click on Earth (auto-disappear after 5 seconds)
- **Custom markers**: Add cyan markers at specific coordinates

### 4. Visual Controls
- **GUI Controls**: Right-side panel with coordinate system options
- **Toggle visibility**: Show/hide markers and labels
- **Live updates**: Coordinate display updates as you interact

### 5. Distance Calculation
- **Real distances**: Shows distance in kilometers between clicked point and target location
- **Great circle calculation**: Uses proper spherical geometry for accurate distances

## How to Use

### Navigate to Specific Coordinates
1. Use the coordinate input interface (bottom-left)
2. Enter latitude and longitude values
3. Click "Go to Location" to move the target marker
4. Click "Add Marker" to place a permanent marker

### Explore by Clicking
1. Click anywhere on the Earth surface
2. See coordinates displayed in the info panel (top-right)
3. Yellow marker appears at clicked location
4. Distance to target location is calculated

### Use GUI Controls
1. Open the "Coordinate System" folder in the GUI (right side)
2. Toggle markers and labels on/off
3. Adjust target coordinates with sliders
4. Use quick navigation buttons

## Technical Details

### Coordinate Conversion
- **Spherical to Cartesian**: Converts lat/lon to 3D positions on sphere
- **UV mapping**: Properly aligned with Earth textures
- **Rotation handling**: Accounts for Earth's 23.5° axial tilt

### Coordinate System
- **Latitude**: -90° (South Pole) to +90° (North Pole)
- **Longitude**: -180° (Date Line West) to +180° (Date Line East)
- **Origin**: 0°,0° is at the intersection of the Equator and Prime Meridian (Gulf of Guinea)

## Example Coordinates

| Location | Latitude | Longitude |
|----------|----------|-----------|
| New York | 40.7128° | -74.0060° |
| London | 51.5074° | -0.1278° |
| Tokyo | 35.6762° | 139.6503° |
| Sydney | -33.8688° | 151.2093° |
| Cairo | 30.0444° | 31.2357° |

## Accuracy Notes

- The coordinate mapping is designed to be accurate for educational and visualization purposes
- Earth textures are properly aligned with coordinate system
- Distance calculations use the haversine formula for great circle distances
- Regional detection is simplified but covers major continental areas