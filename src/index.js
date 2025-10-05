// ThreeJS and Third-party deps
import * as THREE from "three"
import * as dat from 'dat.gui'
import Stats from "three/examples/jsm/libs/stats.module"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"

// Core boilerplate code deps
import { createCamera, createRenderer, runApp, updateLoadingProgressBar } from "./core-utils"

// Other deps
import { loadTexture } from "./common-utils"
// Coordinate mapping utilities
import { 
  latLonToVector3, 
  vector3ToLatLon, 
  createLocationMarker, 
  createLocationLabel, 
  FAMOUS_LOCATIONS,
  calculateDistance,
  getRegionName
} from "./coordinate-utils"
// Debug utilities
import { createDebugCoordinateGrid, testCoordinateMapping } from "./debug-coordinates"
// Internationalization
import i18n from "./i18n.js"
// Impact zones calculation
import ImpactZones from "./impactZones.js"
import Albedo from "./assets/Albedo.jpg"
import Bump from "./assets/Bump.jpg"
import Clouds from "./assets/Clouds.png"
import Ocean from "./assets/Ocean.png"
import NightLights from "./assets/night_lights_modified.png"
import vertexShader from "./shaders/vertex.glsl"
import fragmentShader from "./shaders/fragment.glsl"
import GaiaSky from "./assets/Gaia_EDR3_darkened.png"
import asteroidOrbitData from "./assets/asteroid_orbit_coords.json"

global.THREE = THREE
// Make i18n available globally for other modules
global.i18n = i18n
window.i18n = i18n
// previously this feature is .legacyMode = false, see https://www.donmccurdy.com/2020/06/17/color-management-in-threejs/
// turning this on has the benefit of doing certain automatic conversions (for hexadecimal and CSS colors from sRGB to linear-sRGB)
THREE.ColorManagement.enabled = true

/**************************************************
 * 0. Tweakable parameters for the scene
 *************************************************/
const params = {
  // general scene params
  sunIntensity: 1.3, // brightness of the sun
  speedFactor: 2.0, // rotation speed of the earth
  metalness: 0.1,
  atmOpacity: { value: 0.7 },
  atmPowFactor: { value: 4.1 },
  atmMultiplier: { value: 9.5 },
  // lighting params
  ambientIntensity: 0.6, // ambient light intensity
  hemisphereIntensity: 0.4, // hemisphere light intensity
  // navigation params
  cameraDistance: 25, // distance from Earth when viewing location
  animationSpeed: 1000, // animation duration in milliseconds
  // coordinate system params
  showLocationMarkers: true,
  showLocationLabels: true,
  showCoordinateInfo: true,
  showDebugGrid: true,
  targetLat: 40.7128, // New York by default
  targetLon: -74.0060,
  
  // Asteroid impact parameters
  asteroidSize: 100, // Size in meters (1m to 1500m = 1.5km)
  asteroidSpeed: 20, // Speed in km/s (1 to 100 km/s)
  
  // Orbital paths parameters
  showOrbitalPaths: true,
}


/**************************************************
 * 1. Initialize core threejs components
 *************************************************/
// Create the scene
let scene = new THREE.Scene()

// Create the renderer via 'createRenderer',
// 1st param receives additional WebGLRenderer properties
// 2nd param receives a custom callback to further configure the renderer
let renderer = createRenderer({ antialias: true }, (_renderer) => {
  // best practice: ensure output colorspace is in sRGB, see Color Management documentation:
  // https://threejs.org/docs/#manual/en/introduction/Color-management
  _renderer.outputColorSpace = THREE.SRGBColorSpace
})

// Create the camera
// Pass in fov, near, far and camera position respectively
let camera = createCamera(45, 1, 1000, { x: 0, y: 0, z: 30 })


/**************************************************
 * 2. Build your scene in this threejs app
 * This app object needs to consist of at least the async initScene() function (it is async so the animate function can wait for initScene() to finish before being called)
 * initScene() is called after a basic threejs environment has been set up, you can add objects/lighting to you scene in initScene()
 * if your app needs to animate things(i.e. not static), include a updateScene(interval, elapsed) function in the app as well
 *************************************************/
// Raycaster for mouse interaction
let raycaster = new THREE.Raycaster()
let mouse = new THREE.Vector2()

let app = {
  async initScene() {
    // OrbitControls
    this.controls = new OrbitControls(camera, renderer.domElement)
    this.controls.enableDamping = true
    this.controls.minDistance = 13 // Minimum zoom distance (prevent going inside Earth)
    this.controls.maxDistance = 200 // Maximum zoom distance (prevent going too far out)
    
    // Array to store all dots placed on the sphere
    this.dots = []
    
    // Initialize asteroid system arrays
    this.asteroids = []
    this.impactSites = []
    
    // Array to store orbital paths
    this.orbitalPaths = []

    // adding a virtual sun using directional light
    this.dirLight = new THREE.DirectionalLight(0xffffff, params.sunIntensity)
    this.dirLight.position.set(-50, 0, 30)
    scene.add(this.dirLight)
    
    // Add ambient light to make entire Earth visible
    this.ambientLight = new THREE.AmbientLight(0x404040, 0.6) // Soft white light
    scene.add(this.ambientLight)

    // Add ambient light to illuminate the entire Earth evenly
    this.ambientLight = new THREE.AmbientLight(0xffffff, params.ambientIntensity)
    scene.add(this.ambientLight)

    // Add hemisphere light for more natural lighting
    this.hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, params.hemisphereIntensity)
    scene.add(this.hemisphereLight)

    // updates the progress bar to 10% on the loading UI
    await updateLoadingProgressBar(0.1)

    // loads earth's color map, the basis of how our earth looks like
    const albedoMap = await loadTexture(Albedo)
    albedoMap.colorSpace = THREE.SRGBColorSpace
    await updateLoadingProgressBar(0.2)

    const bumpMap = await loadTexture(Bump)
    await updateLoadingProgressBar(0.3)
    
    const cloudsMap = await loadTexture(Clouds)
    await updateLoadingProgressBar(0.4)

    const oceanMap = await loadTexture(Ocean)
    await updateLoadingProgressBar(0.5)

    const lightsMap = await loadTexture(NightLights)
    await updateLoadingProgressBar(0.6)

    const envMap = await loadTexture(GaiaSky)
    envMap.mapping = THREE.EquirectangularReflectionMapping
    await updateLoadingProgressBar(0.7)
    
    scene.background = envMap

    // Create asteroid geometry and material for impact effects
    // Base geometry and material - will be randomized per asteroid
    this.baseAsteroidGeometry = new THREE.IcosahedronGeometry(0.8, 1) // Base irregular rocky shape
    this.baseAsteroidMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x666666, // Base gray color - will be randomized
      roughness: 0.9,
      metalness: 0.1
    })

    // create group for easier manipulation of objects(ie later with clouds and atmosphere added)
    this.group = new THREE.Group()
    // Remove axial tilt to align coordinates properly with geographic locations
    // this.group.rotation.z = 23.5 / 360 * 2 * Math.PI
    
    let earthGeo = new THREE.SphereGeometry(10, 64, 64)
    let earthMat = new THREE.MeshStandardMaterial({
      map: albedoMap,
      bumpMap: bumpMap,
      bumpScale: 0.03, // must be really small, if too high even bumps on the back side got lit up
      roughnessMap: oceanMap, // will get reversed in the shaders
      metalness: params.metalness, // gets multiplied with the texture values from metalness map
      metalnessMap: oceanMap,
      emissiveMap: lightsMap,
      emissive: new THREE.Color(0xffff88),
    })
    this.earth = new THREE.Mesh(earthGeo, earthMat)
    this.group.add(this.earth)
    
    let cloudGeo = new THREE.SphereGeometry(10.05, 64, 64)
    let cloudsMat = new THREE.MeshStandardMaterial({
      alphaMap: cloudsMap,
      transparent: true,
    })
    this.clouds = new THREE.Mesh(cloudGeo, cloudsMat)
    this.group.add(this.clouds)
    
    // Remove initial rotation to align coordinates properly with geographic locations
    // this.earth.rotateY(-0.3)
    // this.clouds.rotateY(-0.3)

    let atmosGeo = new THREE.SphereGeometry(12.5, 64, 64)
    let atmosMat = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        atmOpacity: params.atmOpacity,
        atmPowFactor: params.atmPowFactor,
        atmMultiplier: params.atmMultiplier
      },
      // notice that by default, Three.js uses NormalBlending, where if your opacity of the output color gets lower, the displayed color might get whiter
      blending: THREE.AdditiveBlending, // works better than setting transparent: true, because it avoids a weird dark edge around the earth
      side: THREE.BackSide // such that it does not overlays on top of the earth; this points the normal in opposite direction in vertex shader
    })
    this.atmos = new THREE.Mesh(atmosGeo, atmosMat)
    this.group.add(this.atmos)

    scene.add(this.group)

    // Initialize coordinate mapping system
    this.initCoordinateSystem()

    // Add debug coordinate grid to help with calibration
    this.debugGrid = createDebugCoordinateGrid(scene)
    
    // Run coordinate mapping test in console
    testCoordinateMapping()
    // Add mouse double-click event listener for asteroid impacts
    renderer.domElement.addEventListener('dblclick', (event) => this.onMouseClick(event))

    // Load and create asteroid orbital paths
    await this.createOrbitalPaths()

    earthMat.onBeforeCompile = function( shader ) {
      shader.uniforms.tClouds = { value: cloudsMap }
      shader.uniforms.tClouds.value.wrapS = THREE.RepeatWrapping;
      shader.uniforms.uv_xOffset = { value: 0 }
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
        #include <common>
        uniform sampler2D tClouds;
        uniform float uv_xOffset;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;

        #ifdef USE_ROUGHNESSMAP

          vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
          // reversing the black and white values because we provide the ocean map
          texelRoughness = vec4(1.0) - texelRoughness;

          // reads channel G, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
          roughnessFactor *= clamp(texelRoughness.g, 0.5, 1.0);

        #endif
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #ifdef USE_EMISSIVEMAP

          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );

          // Methodology of showing night lights only:
          //
          // going through the shader calculations in the meshphysical shader chunks (mostly on the vertex side),
          // we can confirm that geometryNormal is the normalized normal in view space,
          // for the night side of the earth, the dot product between geometryNormal and the directional light would be negative
          // since the direction vector actually points from target to position of the DirectionalLight,
          // for lit side of the earth, the reverse happens thus emissiveColor would be multiplied with 0.
          // The smoothstep is to smoothen the change between night and day
          
          emissiveColor *= 1.0 - smoothstep(-0.02, 0.0, dot(geometryNormal, directionalLights[0].direction));
          
          totalEmissiveRadiance *= emissiveColor.rgb;

        #endif

        // Methodology explanation:
        //
        // Our goal here is to use a “negative light map” approach to cast cloud shadows,
        // the idea is on any uv point on earth map(Point X),
        // we find the corresponding uv point(Point Y) on clouds map that is directly above Point X,
        // then we extract color value at Point Y.
        // We then darken the color value at Point X depending on the color value at Point Y,
        // that is the intensity of the clouds at Point Y.
        //
        // Since the clouds are made to spin twice as fast as the earth,
        // in order to get the correct shadows(clouds) position in this earth's fragment shader
        // we need to minus earth's UV.x coordinate by uv_xOffset,
        // which is calculated and explained in the updateScene()
        // after minus by uv_xOffset, the result would be in the range of -1 to 1,
        // we need to set RepeatWrapping for wrapS of the clouds texture so that texture2D still works for -1 to 0

        float cloudsMapValue = texture2D(tClouds, vec2(vMapUv.x - uv_xOffset, vMapUv.y)).r;
        
        // The shadow should be more intense where the clouds are more intense,
        // thus we do 1.0 minus cloudsMapValue to obtain the shadowValue, which is multiplied to diffuseColor
        // we also clamp the shadowValue to a minimum of 0.2 so it doesn't get too dark
        
        diffuseColor.rgb *= max(1.0 - cloudsMapValue, 0.2 );

        // adding small amount of atmospheric coloring to make it more realistic
        // fine tune the first constant for stronger or weaker effect
        float intensity = 1.4 - dot( geometryNormal, vec3( 0.0, 0.0, 1.0 ) );
        vec3 atmosphere = vec3( 0.3, 0.6, 1.0 ) * pow(intensity, 5.0);
        diffuseColor.rgb += atmosphere;
      `)

      // need save to userData.shader in order to enable our code to update values in the shader uniforms,
      // reference from https://github.com/mrdoob/three.js/blob/master/examples/webgl_materials_modified.html
      earthMat.userData.shader = shader
    }

    // GUI controls
    const gui = new dat.GUI()
    window.gui = gui // Store globally for updates
    gui.add(params, "sunIntensity", 0.0, 5.0, 0.1).onChange((val) => {
      this.dirLight.intensity = val
    }).name("Sun Intensity")
    gui.add(params, "ambientIntensity", 0.0, 2.0, 0.1).onChange((val) => {
      this.ambientLight.intensity = val
    }).name("Ambient Light")
    gui.add(params, "hemisphereIntensity", 0.0, 1.0, 0.1).onChange((val) => {
      this.hemisphereLight.intensity = val
    }).name("Hemisphere Light")
    gui.add(params, "metalness", 0.0, 1.0, 0.05).onChange((val) => {
      earthMat.metalness = val
    }).name("Ocean Metalness")
    gui.add(params, "speedFactor", 0.1, 20.0, 0.1).name("Rotation Speed")
    gui.add(params.atmOpacity, "value", 0.0, 1.0, 0.05).name("atmOpacity")
    gui.add(params.atmPowFactor, "value", 0.0, 20.0, 0.1).name("atmPowFactor")
    gui.add(params.atmMultiplier, "value", 0.0, 20.0, 0.1).name("atmMultiplier")

    // Coordinate system controls
    const coordFolder = gui.addFolder('Coordinate System')
    coordFolder.add(params, "showLocationMarkers").onChange((val) => {
      this.updateMarkersVisibility()
    }).name("Show Markers")
    coordFolder.add(params, "showLocationLabels").onChange((val) => {
      this.updateLabelsVisibility()
    }).name("Show Labels")
    coordFolder.add(params, "showDebugGrid").onChange((val) => {
      this.debugGrid.visible = val
    }).name("Show Debug Grid")
    coordFolder.add(params, "targetLat", -90, 90, 0.1).onChange((val) => {
      this.updateTargetLocation()
    }).name("Target Latitude")
    coordFolder.add(params, "targetLon", -180, 180, 0.1).onChange((val) => {
      this.updateTargetLocation()
    }).name("Target Longitude")
    
    // Navigation controls
    coordFolder.add(params, "cameraDistance", 15, 50, 1).name("Camera Distance")
    coordFolder.add(params, "animationSpeed", 500, 3000, 100).name("Animation Speed (ms)")
    
    // Add buttons for famous locations
    const locationActions = {
      'Go to New York': () => this.goToLocation(40.7128, -74.0060),
      'Go to London': () => this.goToLocation(51.5074, -0.1278),
      'Go to Tokyo': () => this.goToLocation(35.6762, 139.6503),
      'Go to Sydney': () => this.goToLocation(-33.8688, 151.2093),
      'Go to My Location': () => this.goToMyLocation(),
      'Go to Target': () => this.goToLocation(params.targetLat, params.targetLon),
      'Clear Markers': () => this.clearCustomMarkers()
    }
    
    Object.keys(locationActions).forEach(actionName => {
      coordFolder.add(locationActions, actionName)
    })
    
    coordFolder.open()
    // Add asteroid impact controls
    const asteroidFolder = gui.addFolder('Asteroid Impact')
    asteroidFolder.add(params, 'asteroidSize', 1, 5000).name('Size (meters)')
    asteroidFolder.add(params, 'asteroidSpeed', 1, 100).name('Speed (km/s)')
    asteroidFolder.open()
    
    // Add orbital paths controls
    const orbitalFolder = gui.addFolder('Orbital Paths')
    orbitalFolder.add(params, 'showOrbitalPaths').name('Show Orbital Paths').onChange((value) => {
      this.orbitalPaths.forEach(pathObject => {
        pathObject.visible = value;
      });
    })
    orbitalFolder.open()

    // Stats - show fps
    this.stats1 = new Stats()
    this.stats1.showPanel(0) // Panel 0 = fps
    this.stats1.domElement.style.cssText = "position:absolute;top:0px;left:0px;"
    // this.container is the parent DOM element of the threejs canvas element
    this.container.appendChild(this.stats1.domElement)

    await updateLoadingProgressBar(1.0, 100)
  },

  // Initialize the coordinate mapping system
  initCoordinateSystem() {
    this.locationMarkers = new THREE.Group()
    this.locationLabels = new THREE.Group()
    this.customMarkers = new THREE.Group()
    
    // Add marker groups directly to scene since Earth is not rotating
    scene.add(this.locationMarkers)
    scene.add(this.locationLabels)
    scene.add(this.customMarkers)
    
    // Add markers for famous locations
    Object.entries(FAMOUS_LOCATIONS).forEach(([name, coords]) => {
      const marker = createLocationMarker(coords.lat, coords.lon, { 
        color: 0x00ff00, 
        size: 0.1 
      })
      const label = createLocationLabel(name, coords.lat, coords.lon)
      
      this.locationMarkers.add(marker)
      this.locationLabels.add(label)
    })
    
    // Add target location marker
    this.targetMarker = createLocationMarker(params.targetLat, params.targetLon, {
      color: 0xff0000,
      size: 0.2
    })
    this.customMarkers.add(this.targetMarker)
    
    // Initialize coordinate info display
    this.createCoordinateInfoDisplay()
    
    // Add info button for math explanation
    this.createMathInfoButton()
    
    // Add mouse interaction for clicking on Earth
    this.setupEarthInteraction()
    
    this.updateMarkersVisibility()
    this.updateLabelsVisibility()
  },

  // Create coordinate info display
  createCoordinateInfoDisplay() {
    const infoDiv = document.createElement('div')
    infoDiv.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 15px;
      border-radius: 8px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      max-width: 300px;
      z-index: 1000;
    `
    infoDiv.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">Coordinate Information</h3>
      <div id="coord-info">Click on Earth to get coordinates</div>
      <div id="location-info" style="margin-top: 10px;"></div>
    `
    this.container.appendChild(infoDiv)
    this.coordInfoDiv = infoDiv.querySelector('#coord-info')
    this.locationInfoDiv = infoDiv.querySelector('#location-info')
  },

  // Create math info button
  createMathInfoButton() {
    const infoButton = document.createElement('button')
    infoButton.innerHTML = 'The Math'
    infoButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 25px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      z-index: 2000;
      transition: all 0.3s ease;
    `
    
    // Add hover effects
    infoButton.addEventListener('mouseenter', () => {
      infoButton.style.transform = 'translateY(-2px)'
      infoButton.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)'
    })
    
    infoButton.addEventListener('mouseleave', () => {
      infoButton.style.transform = 'translateY(0)'
      infoButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)'
    })
    
    // Add click functionality to show the math explanation overlay
    infoButton.addEventListener('click', () => {
      this.showMathExplanationOverlay()
    })
    
    this.container.appendChild(infoButton)
  },

  // Create and show math explanation overlay
  showMathExplanationOverlay() {
    // Create overlay backdrop
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
      box-sizing: border-box;
    `
    
    // Create content container
    const content = document.createElement('div')
    content.style.cssText = `
      background: white;
      border-radius: 15px;
      max-width: 900px;
      max-height: 90vh;
      overflow-y: auto;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      position: relative;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
    `
    
    // Add close button
    const closeButton = document.createElement('button')
    closeButton.innerHTML = '✕'
    closeButton.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: #667eea;
      color: white;
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 20px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    `
    
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.background = '#5a67d8'
      closeButton.style.transform = 'scale(1.1)'
    })
    
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.background = '#667eea'
      closeButton.style.transform = 'scale(1)'
    })
    
    closeButton.addEventListener('click', () => {
      document.body.removeChild(overlay)
    })
    
    // Add math explanation content
    content.innerHTML = `
      <h1 style="color: #4a5568; text-align: center; margin-bottom: 10px; font-size: 2.5rem;">🪐 Asteroid Impact Mortality Zone Model</h1>
      <div style="text-align: center; color: #666; font-size: 1.1rem; margin-bottom: 30px;">
        <strong>Based on Rumpf (2016) <em>Asteroid Impact Risk</em></strong><br>
        University of Southampton e-thesis — <a href="https://eprints.soton.ac.uk/412703/1/FINAL_e_thesis_for_e_prints_Rumpf_26699079.pdf" target="_blank">Rumpf, 2016</a>
      </div>

      <p>This document explains the physics and mathematical background behind the asteroid impact simulation. Each section corresponds to one of the modeled <strong>impact effects</strong>: crater formation, thermal radiation (fireball), overpressure (shockwave), wind blast, and seismic shaking (earthquake).</p>

      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-top: 30px;">⚙️ 1. Crater Formation</h2>
      <p><strong>Purpose:</strong> estimate the transient and final crater sizes for a ground impact.</p>

      <h3 style="color: #5a67d8; margin-top: 25px;">Transient Crater Diameter</h3>
      <p>From Rumpf Eq. (3.42), based on <strong>Collins et al. (2005)</strong> impact-scaling laws:</p>

      <div style="text-align: center; font-size: 18px; margin: 20px 0; color: #2d3748; background: #edf2f7; padding: 15px; border-radius: 6px;">
        D<sub>tc</sub> = 1.161 (ρ<sub>i</sub>/ρ<sub>t</sub>)<sup>1/3</sup> L<sub>0</sub><sup>0.78</sup> v<sub>i</sub><sup>0.44</sup> g<sub>0</sub><sup>-0.22</sup> sin<sup>1/3</sup>γ
      </div>

      <p><strong>Where:</strong></p>
      <ul>
        <li>D<sub>tc</sub>: transient crater diameter (m)</li>
        <li>ρ<sub>i</sub>: impactor density (kg/m³)</li>
        <li>ρ<sub>t</sub>: target (ground) density (kg/m³)</li>
        <li>L<sub>0</sub>: impactor diameter (m)</li>
        <li>v<sub>i</sub>: impact speed (m/s)</li>
        <li>g<sub>0</sub> = 9.81 m/s²: surface gravity</li>
        <li>γ: impact angle (degrees from horizontal)</li>
      </ul>

      <h3 style="color: #5a67d8; margin-top: 25px;">Final Crater Diameter</h3>
      <p>After collapse and rim formation, the final crater grows by ≈25%:</p>

      <div style="text-align: center; font-size: 18px; margin: 20px 0; color: #2d3748; background: #edf2f7; padding: 15px; border-radius: 6px;">
        D<sub>fr</sub> = 1.25 D<sub>tc</sub>
      </div>

      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-top: 30px;">☀️ 2. Thermal Radiation (Fireball Zone)</h2>
      <p><strong>Purpose:</strong> estimate the radius at which thermal radiation causes 50% mortality.</p>

      <h3 style="color: #5a67d8; margin-top: 25px;">Fireball Radius</h3>
      <p>From Rumpf Eq. (3.56):</p>

      <div style="text-align: center; font-size: 18px; margin: 20px 0; color: #2d3748; background: #edf2f7; padding: 15px; border-radius: 6px;">
        R<sub>f</sub> = 0.002 E<sup>1/3</sup>
      </div>

      <h3 style="color: #5a67d8; margin-top: 25px;">Vulnerability (Mortality Curve)</h3>
      <p>Thermal mortality follows a <strong>logistic (sigmoid)</strong> function (Rumpf Eq. 3.82):</p>

      <div style="text-align: center; font-size: 18px; margin: 20px 0; color: #2d3748; background: #edf2f7; padding: 15px; border-radius: 6px;">
        V<sub>thermal</sub>(φ) = 1 / (1 + e<sup>-0.00000562327(φ - 731641.664)</sup>)
      </div>

      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-top: 30px;">💨 3. Overpressure (Shockwave Zone)</h2>
      <p><strong>Purpose:</strong> determine radius where blast overpressure causes 50% mortality.</p>

      <h3 style="color: #5a67d8; margin-top: 25px;">Overpressure Vulnerability</h3>
      <p>From Rumpf Eq. (3.79), expected-case logistic fit:</p>

      <div style="text-align: center; font-size: 18px; margin: 20px 0; color: #2d3748; background: #edf2f7; padding: 15px; border-radius: 6px;">
        V<sub>overpressure</sub>(p) = 1 / (1 + e<sup>-0.0000242498102(p - 440430.986)</sup>)
      </div>

      <p>Midpoint (50% mortality) at p<sub>50</sub> = 440,430.986 Pa (4.4 atm)</p>

      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-top: 30px;">🌪️ 4. Wind Blast Zone</h2>
      <p><strong>Purpose:</strong> find radius where wind speeds from the blast cause 50% mortality.</p>

      <div style="text-align: center; font-size: 18px; margin: 20px 0; color: #2d3748; background: #edf2f7; padding: 15px; border-radius: 6px;">
        V<sub>wind</sub>(v) = 1 / (1 + e<sup>-0.05483(v - 112.4)</sup>)
      </div>

      <p>Midpoint (50% mortality): v<sub>50</sub> = 112.4 m/s</p>

      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-top: 30px;">🌍 5. Seismic (Earthquake) Zone</h2>
      <p><strong>Purpose:</strong> estimate the distance where seismic shaking causes 50% mortality.</p>

      <h3 style="color: #5a67d8; margin-top: 25px;">Impact Energy → Global Magnitude</h3>
      <p>Rumpf Eq. (3.45):</p>

      <div style="text-align: center; font-size: 18px; margin: 20px 0; color: #2d3748; background: #edf2f7; padding: 15px; border-radius: 6px;">
        M = 0.67 log<sub>10</sub>(E) - 5.87
      </div>

      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-top: 30px;">⚖️ 6. Energy and Yield Conversions</h2>
      <p>All these effects depend on the <strong>impact kinetic energy</strong>:</p>

      <div style="text-align: center; font-size: 18px; margin: 20px 0; color: #2d3748; background: #edf2f7; padding: 15px; border-radius: 6px;">
        E = ½mv² = (π/12) ρ<sub>i</sub> L<sub>0</sub>³ v²
      </div>

      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-top: 30px;">🧩 Summary of 50% Mortality Thresholds</h2>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 0.9rem;">
        <thead>
          <tr>
            <th style="border: 1px solid #ddd; padding: 12px; background: #667eea; color: white;">Effect</th>
            <th style="border: 1px solid #ddd; padding: 12px; background: #667eea; color: white;">Mortality Variable</th>
            <th style="border: 1px solid #ddd; padding: 12px; background: #667eea; color: white;">50% Threshold</th>
            <th style="border: 1px solid #ddd; padding: 12px; background: #667eea; color: white;">Source</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8f9fa;">
            <td style="border: 1px solid #ddd; padding: 12px;"><strong>Crater</strong></td>
            <td style="border: 1px solid #ddd; padding: 12px;">Crater interior</td>
            <td style="border: 1px solid #ddd; padding: 12px;">100% mortality</td>
            <td style="border: 1px solid #ddd; padding: 12px;">Eq. 3.42–3.43</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 12px;"><strong>Fireball</strong></td>
            <td style="border: 1px solid #ddd; padding: 12px;">Radiant exposure φ</td>
            <td style="border: 1px solid #ddd; padding: 12px;">731,642 J/m²</td>
            <td style="border: 1px solid #ddd; padding: 12px;">Eq. 3.82</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="border: 1px solid #ddd; padding: 12px;"><strong>Shockwave</strong></td>
            <td style="border: 1px solid #ddd; padding: 12px;">Overpressure p</td>
            <td style="border: 1px solid #ddd; padding: 12px;">440,431 Pa</td>
            <td style="border: 1px solid #ddd; padding: 12px;">Eq. 3.79</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 12px;"><strong>Wind blast</strong></td>
            <td style="border: 1px solid #ddd; padding: 12px;">Wind speed v</td>
            <td style="border: 1px solid #ddd; padding: 12px;">112.4 m/s</td>
            <td style="border: 1px solid #ddd; padding: 12px;">Eq. 3.88</td>
          </tr>
          <tr style="background: #f8f9fa;">
            <td style="border: 1px solid #ddd; padding: 12px;"><strong>Seismic</strong></td>
            <td style="border: 1px solid #ddd; padding: 12px;">Effective magnitude M<sub>eff</sub></td>
            <td style="border: 1px solid #ddd; padding: 12px;">8.6856</td>
            <td style="border: 1px solid #ddd; padding: 12px;">Eq. 3.75</td>
          </tr>
        </tbody>
      </table>

      <div style="background: #e6fffa; border-left: 4px solid #38b2ac; padding: 15px; margin: 15px 0;">
        <p><strong>Rumpf, C.</strong> (2016). <em>Asteroid Impact Risk.</em><br>
        University of Southampton, Faculty of Engineering and the Environment.<br>
        <a href="https://eprints.soton.ac.uk/412703/1/FINAL_e_thesis_for_e_prints_Rumpf_26699079.pdf" target="_blank">ePrints ID 412703</a></p>
      </div>

    `
    
    content.appendChild(closeButton)
    overlay.appendChild(content)
    document.body.appendChild(overlay)
    
    // Close overlay when clicking outside content
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay)
      }
    })
    
    // Close overlay with Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(overlay)
        document.removeEventListener('keydown', handleEscape)
      }
    }
    document.addEventListener('keydown', handleEscape)
  },

  // Setup mouse interaction for Earth clicking
  setupEarthInteraction() {
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()
    
    renderer.domElement.addEventListener('click', (event) => {
      // Calculate mouse position in normalized device coordinates
      const rect = renderer.domElement.getBoundingClientRect()
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      
      // Update the picking ray with the camera and mouse position
      this.raycaster.setFromCamera(this.mouse, camera)
      
      // Calculate objects intersecting the picking ray
      const intersects = this.raycaster.intersectObject(this.earth)
      
      if (intersects.length > 0) {
        const intersectionPoint = intersects[0].point
        const coords = vector3ToLatLon(intersectionPoint)
        
        // Update coordinate display
        this.updateCoordinateDisplay(coords.lat, coords.lon, intersectionPoint)
        
        // Add a temporary marker at clicked location
        this.addTemporaryMarker(coords.lat, coords.lon)
      }
    })
  },

  // Update coordinate display
  async updateCoordinateDisplay(lat, lon, position) {
    // Format coordinates with compass directions in the current language
    const latDir = lat >= 0 ? i18n.t('coordinates.north') : i18n.t('coordinates.south');
    const lonDir = lon >= 0 ? i18n.t('coordinates.east') : i18n.t('coordinates.west');
    const latStr = `${Math.abs(lat).toFixed(4)}°${latDir}`;
    const lonStr = `${Math.abs(lon).toFixed(4)}°${lonDir}`;
    
    // Debug logging
    console.log(i18n.t('coordinates.clicked', { lat: lat.toFixed(4), lon: lon.toFixed(4) }))
    
    // Show loading state first
    this.coordInfoDiv.innerHTML = `
      <strong>${i18n.t('coordinates.latitude')}:</strong> ${latStr}<br>
      <strong>${i18n.t('coordinates.longitude')}:</strong> ${lonStr}<br>
      <strong>${i18n.t('coordinates.region')}:</strong> <span style="color: #888;">${i18n.t('info.loading_data')}</span>
    `
    
    // Get location asynchronously
    try {
      const region = await getRegionName(lat, lon)
      this.coordInfoDiv.innerHTML = `
        <strong>${i18n.t('coordinates.latitude')}:</strong> ${latStr}<br>
        <strong>${i18n.t('coordinates.longitude')}:</strong> ${lonStr}<br>
        <strong>${i18n.t('coordinates.region')}:</strong> ${region}
      `
    } catch (error) {
      console.warn('Failed to get region name:', error)
      this.coordInfoDiv.innerHTML = `
        <strong>${i18n.t('coordinates.latitude')}:</strong> ${latStr}<br>
        <strong>${i18n.t('coordinates.longitude')}:</strong> ${lonStr}<br>
        <strong>${i18n.t('coordinates.region')}:</strong> <span style="color: #ff6666;">${i18n.t('errors.location_lookup_failed') || 'Location lookup failed'}</span>
      `
    }
    
    // Calculate distance to target location
    const distance = calculateDistance(lat, lon, params.targetLat, params.targetLon)
    this.locationInfoDiv.innerHTML = `
      <strong>${i18n.t('coordinates.distance_to_target')}:</strong> ${distance.toFixed(0)} ${i18n.t('measurements.kilometers')}
    `
  },

  // Add temporary marker at clicked location
  addTemporaryMarker(lat, lon) {
    // Remove previous temporary marker
    if (this.tempMarker) {
      this.customMarkers.remove(this.tempMarker)
    }
    
    // Add new temporary marker
    this.tempMarker = createLocationMarker(lat, lon, {
      color: 0xffff00,
      size: 0.15
    })
    this.customMarkers.add(this.tempMarker)
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (this.tempMarker) {
        this.customMarkers.remove(this.tempMarker)
        this.tempMarker = null
      }
    }, 5000)
  },

  // Go to a specific location
  goToLocation(lat, lon) {
    console.log(`goToLocation called with: ${lat}, ${lon}`)
    
    params.targetLat = lat
    params.targetLon = lon
    this.updateTargetLocation()
    
    // Update coordinate display
    this.updateCoordinateDisplay(lat, lon)
    
    // Move camera to view the location
    this.moveCameraToLocation(lat, lon)
  },

  // Move camera to view a specific location
  moveCameraToLocation(lat, lon) {
    // For navigation, use the same coordinate system as the visual markers
    // The issue might be elsewhere in the camera positioning logic
    const targetPosition = latLonToVector3(lat, lon, 10)
    
    // Debug logging
    console.log(`Moving camera to: ${lat}, ${lon}`)
    console.log(`Target position:`, targetPosition)
    
    // Calculate camera position - move camera back from the target point
    const cameraDirection = targetPosition.clone().normalize()
    const cameraPosition = cameraDirection.multiplyScalar(params.cameraDistance)
    
    console.log(`Camera position:`, cameraPosition)
    
    // Smoothly animate camera to new position
    if (this.controls) {
      // Set the target (what the camera looks at) to the location on Earth
      this.controls.target.copy(targetPosition)
      
      // Animate camera position
      const startPos = camera.position.clone()
      const endPos = cameraPosition
      
      // Simple animation using requestAnimationFrame
      let animationProgress = 0
      const startTime = Date.now()
      
      const animate = () => {
        const elapsed = Date.now() - startTime
        animationProgress = Math.min(elapsed / params.animationSpeed, 1)
        
        // Smooth easing function
        const ease = 1 - Math.pow(1 - animationProgress, 3)
        
        // Interpolate camera position
        camera.position.lerpVectors(startPos, endPos, ease)
        
        // Update controls
        this.controls.update()
        
        if (animationProgress < 1) {
          requestAnimationFrame(animate)
        }
      }
      
      animate()
    }
  },

  // Update target location marker
  updateTargetLocation() {
    if (this.targetMarker) {
      const newPosition = latLonToVector3(params.targetLat, params.targetLon, 10.1)
      this.targetMarker.position.copy(newPosition)
      this.targetMarker.userData = { lat: params.targetLat, lon: params.targetLon }
    }
  },

  // Update marker visibility
  updateMarkersVisibility() {
    this.locationMarkers.visible = params.showLocationMarkers
    this.customMarkers.visible = params.showLocationMarkers
  },

  // Update label visibility
  updateLabelsVisibility() {
    this.locationLabels.visible = params.showLocationLabels
  },

  // Clear custom markers
  clearCustomMarkers() {
    while(this.customMarkers.children.length > 1) { // Keep target marker
      this.customMarkers.remove(this.customMarkers.children[1])
    }
    if (this.tempMarker) {
      this.tempMarker = null
    }
  },

  // Go to user's current location using geolocation
  goToMyLocation() {
    if (!navigator.geolocation) {
      alert(i18n.t('errors.geolocation_not_supported'))
      return
    }

    // Show loading message
    console.log(i18n.t('info.loading_data'))
    
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000 // 5 minutes
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lon = position.coords.longitude
        const accuracy = position.coords.accuracy

        console.log(i18n.t('coordinates.your_location', { 
          lat: lat.toFixed(4), 
          lon: lon.toFixed(4), 
          accuracy: accuracy 
        }))
        
        // Add a special marker for user's location
        this.addUserLocationMarker(lat, lon)
        
        // Navigate to user's location
        this.goToLocation(lat, lon)
        
        // Update coordinate display
        await this.updateCoordinateDisplay(lat, lon)
        
        // Show success message with location info
        try {
          const region = await getRegionName(lat, lon)
          alert(i18n.t('coordinates.found_location_region', { 
            region: region,
            lat: lat.toFixed(4), 
            lon: lon.toFixed(4) 
          }))
        } catch (error) {
          alert(i18n.t('coordinates.found_location', { 
            lat: lat.toFixed(4), 
            lon: lon.toFixed(4) 
          }))
        }
      },
      (error) => {
        let errorKey = 'errors.location_unknown'
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorKey = 'errors.location_permission_denied'
            break
          case error.POSITION_UNAVAILABLE:
            errorKey = 'errors.location_unavailable'
            break
          case error.TIMEOUT:
            errorKey = 'errors.location_timeout'
            break
          default:
            errorKey = 'errors.location_unknown'
            break
        }
        
        console.error('Geolocation error:', error)
        alert(i18n.t(errorKey))
      },
      options
    )
  },

  // Add a special marker for user's current location
  addUserLocationMarker(lat, lon) {
    // Remove previous user location marker if it exists
    if (this.userLocationMarker) {
      this.customMarkers.remove(this.userLocationMarker)
    }
    
    // Create user location marker with distinctive appearance
    this.userLocationMarker = createLocationMarker(lat, lon, {
      color: 0xff6600, // Orange color for user location
      size: 0.25,
      radius: 10.1
    })
    
    // Add label for user location
    if (this.userLocationLabel) {
      this.locationLabels.remove(this.userLocationLabel)
    }
    
    this.userLocationLabel = createLocationLabel('Your Location', lat, lon, {
      fontSize: 48,
      fontColor: '#ff6600',
      backgroundColor: 'rgba(255, 102, 0, 0.8)',
      radius: 10.6
    })
    
    this.customMarkers.add(this.userLocationMarker)
    this.locationLabels.add(this.userLocationLabel)
  },

  // @param {number} interval - time elapsed between 2 frames
  // @param {number} elapsed - total time elapsed since app start
  updateScene(interval, elapsed) {
    this.controls.update()
    this.stats1.update()

    // Disabled Earth rotation to keep cities in fixed positions
    // this.earth.rotateY(interval * 0.005 * params.speedFactor)
    // this.clouds.rotateY(interval * 0.01 * params.speedFactor)

    // Update asteroid animations
    this.updateAsteroids()
    
    // Update orbital path animations
    this.updateOrbitalPaths()

    const shader = this.earth.material.userData.shader
    if ( shader ) {
      // Disabled shader uniform updates since Earth is not rotating
      // let offset = (interval * 0.005 * params.speedFactor) / (2 * Math.PI)
      // shader.uniforms.uv_xOffset.value += offset % 1
    }
  },

  onMouseClick(event) {
    // Convert mouse coordinates to normalized device coordinates (-1 to +1)
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    // Update the raycaster with the camera and mouse position
    raycaster.setFromCamera(mouse, camera)

    // Check for intersections with the earth sphere
    const intersects = raycaster.intersectObject(this.earth)
    
    if (intersects.length > 0) {
      // Get the intersection point in world coordinates
      const worldIntersectionPoint = intersects[0].point
      
      // Convert world coordinates to local coordinates relative to the group
      const localIntersectionPoint = this.group.worldToLocal(worldIntersectionPoint.clone())
      
      // Launch an asteroid toward the impact point
      this.launchAsteroid(localIntersectionPoint)
    }
  },

  launchAsteroid(targetPosition) {
    // Use GUI parameters for size (meters) and speed (km/s)
    const sizeInMeters = params.asteroidSize; // 1m to 1500m
    const speedInKmPerSec = params.asteroidSpeed; // 1 to 100 km/s

    // Convert to Three.js units (Earth radius = 10 units = ~6371km)
    // 1 unit = ~637km, so 1m = 1/637000 units
    const asteroidRadius = (sizeInMeters / 2) / 637000;
    // Scale up for visibility (min 0.05, max 2.0 units)
    const visualSize = Math.max(0.05, Math.min(2.0, asteroidRadius * 50000));

    // Generate random asteroid properties
    const randomDetail = Math.floor(Math.random() * 2) + 1;
    const randomColor = this.generateRandomAsteroidColor();
    const asteroidGeometry = new THREE.IcosahedronGeometry(visualSize, randomDetail);
    this.deformAsteroidGeometry(asteroidGeometry, visualSize);
    const asteroidMaterial = new THREE.MeshStandardMaterial({
      color: randomColor,
      roughness: 0.8 + Math.random() * 0.2,
      metalness: Math.random() * 0.3,
    });
    const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);

    // Calculate impact duration based on speed (slower flight time for better visibility)
    const baseDistance = 25; // units
    const flightTime = Math.max(2000, Math.min(5000, 5000 / speedInKmPerSec)); // 2s to 5s flight time

    // Calculate straight perpendicular approach
    const surfaceNormal = targetPosition.clone().normalize();
    const startPosition = targetPosition.clone().add(surfaceNormal.multiplyScalar(baseDistance));
    asteroid.position.copy(startPosition);

    asteroid.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    // Store animation properties with slower rotation
    asteroid.userData = {
      startPosition: startPosition.clone(),
      targetPosition: targetPosition.clone(),
      startTime: Date.now(),
      duration: flightTime,
      rotationSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 0.2, // Slower rotation
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2
      ),
      // Pass size for impact scaling
      realSizeMeters: sizeInMeters
    };

    this.group.add(asteroid);
    this.asteroids.push(asteroid);
  },

  generateRandomAsteroidColor() {
    // Generate random asteroid colors (grays, browns, dark reds)
    const colorVariations = [
      0x444444, // Dark gray
      0x666666, // Medium gray
      0x888888, // Light gray
      0x553322, // Dark brown
      0x664433, // Medium brown
      0x441122, // Dark reddish
      0x332211, // Very dark brown
      0x555544, // Grayish brown
    ]
    
    const baseColor = colorVariations[Math.floor(Math.random() * colorVariations.length)]
    
    // Add slight random tint variation
    const r = ((baseColor >> 16) & 0xff) / 255
    const g = ((baseColor >> 8) & 0xff) / 255
    const b = (baseColor & 0xff) / 255
    
    // Apply slight random variation (±20%)
    const variation = 0.2
    const newR = Math.max(0, Math.min(1, r + (Math.random() - 0.5) * variation))
    const newG = Math.max(0, Math.min(1, g + (Math.random() - 0.5) * variation))
    const newB = Math.max(0, Math.min(1, b + (Math.random() - 0.5) * variation))
    
    return new THREE.Color(newR, newG, newB)
  },

  deformAsteroidGeometry(geometry, baseSize) {
    // Add random vertex displacement for irregular asteroid shape
    const positions = geometry.attributes.position.array
    const deformationStrength = baseSize * 0.3 // Scale deformation with asteroid size
    
    for (let i = 0; i < positions.length; i += 3) {
      const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2])
      
      // Add random displacement along the vertex normal
      const displacement = (Math.random() - 0.5) * deformationStrength
      const normal = vertex.clone().normalize()
      vertex.add(normal.multiplyScalar(displacement))
      
      positions[i] = vertex.x
      positions[i + 1] = vertex.y
      positions[i + 2] = vertex.z
    }
    
    geometry.attributes.position.needsUpdate = true
    geometry.computeVertexNormals() // Recalculate normals after deformation
  },

  createImpactCrater(impactPosition, realSizeMeters, speed = params.asteroidSpeed) {
    // Calculate impact zones using the imported physics model
    this.calculateAndVisualizeImpactZones(impactPosition, realSizeMeters, speed * 1000); // Convert km/s to m/s
    
    // Create impact flash effect
    this.createImpactFlash(impactPosition, realSizeMeters, speed);
  },


  calculateAndVisualizeImpactZones(impactPosition, asteroidDiameter_m, speed_ms) {
    // Use realistic material densities and impact angles
    const impactParams = {
      L0_m: asteroidDiameter_m,
      rho_i: 3100,      // kg/m³ (typical stony asteroid density)
      rho_t: 2500,      // kg/m³ (typical sedimentary rock density)
      v_ms: speed_ms,
      gamma_deg: 45,    // 45° impact angle
      luminousEfficiency: 1e-3  // typical luminous efficiency
    };

    // Calculate impact zones using Rumpf (2016) physics model
    const zones = ImpactZones.computeAll(impactParams);
    
    console.log('Impact zones calculated:', zones);
    
    // Convert world coordinates to lat/lon for zone calculation
    const impactCoords = vector3ToLatLon(impactPosition);
    const impactLat = impactCoords.lat;
    const impactLon = impactCoords.lon;
    
    // Create visual zones on Earth surface
    this.createImpactZoneVisualization(impactLat, impactLon, zones);
  },

  createImpactZoneVisualization(centerLat, centerLon, zones) {
    // Zone configurations with colors and transparency
    const zoneConfigs = [
      {
        name: 'crater',
        radius_m: zones.crater.D_final_m / 2,
        color: 0x8B0000,  // Dark red - 100% mortality
        opacity: 0.8,
        label: 'Crater (100% mortality)'
      },
      {
        name: 'fireball',
        radius_m: zones.fireball50_m,
        color: 0xFF4500,  // Orange-red - thermal radiation
        opacity: 0.6,
        label: 'Fireball (50% mortality)'
      },
      {
        name: 'overpressure', 
        radius_m: zones.overpressure50_m,
        color: 0xFF1493,  // Deep pink - blast overpressure
        opacity: 0.5,
        label: 'Overpressure (50% mortality)'
      },
      {
        name: 'wind',
        radius_m: zones.wind50_m,
        color: 0x9370DB,  // Medium purple - wind blast
        opacity: 0.4,
        label: 'Wind Blast (50% mortality)'
      },
      {
        name: 'seismic',
        radius_m: zones.seismic50_m,
        color: 0x32CD32,  // Lime green - seismic/earthquake
        opacity: 0.3,
        label: 'Seismic (50% mortality)'
      }
    ];

    // Sort zones by radius (largest first) so they render properly
    zoneConfigs.sort((a, b) => (b.radius_m || 0) - (a.radius_m || 0));

    // Create each zone as a circle on Earth's surface
    zoneConfigs.forEach(config => {
      if (config.radius_m && !isNaN(config.radius_m) && config.radius_m > 0) {
        this.createImpactZoneCircle(centerLat, centerLon, config);
      }
    });

    // Use the addImpactZoneInfo function from ImpactZones module
    ImpactZones.addImpactZoneInfo(centerLat, centerLon, zones);
  },

  createImpactZoneCircle(centerLat, centerLon, config) {
    const radius_m = config.radius_m;
    const earthRadius_m = 6371000; // Earth radius in meters
    
    // Convert radius to angular distance (radians)
    const angularRadius = radius_m / earthRadius_m;
    
    // Create circle geometry points around the impact center
    const segments = 64;
    const points = [];
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      
      // Calculate point on circle using spherical trigonometry
      const deltaLat = angularRadius * Math.cos(angle);
      const deltaLon = angularRadius * Math.sin(angle) / Math.cos(centerLat * Math.PI / 180);
      
      const lat = centerLat + (deltaLat * 180 / Math.PI);
      const lon = centerLon + (deltaLon * 180 / Math.PI);
      
      // Convert to 3D position slightly above Earth surface
      const position = latLonToVector3(lat, lon, 10.02 + config.opacity * 0.1);
      points.push(position);
    }
    
    // Create the zone circle geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: config.opacity,
      linewidth: 3
    });
    
    const circle = new THREE.Line(geometry, material);
    circle.userData = {
      type: 'impactZone',
      zoneName: config.name,
      label: config.label,
      radius_m: radius_m
    };
    
    // Add to scene
    this.group.add(circle);
    
    // Also create a filled zone for better visibility
    if (config.name === 'crater' || config.name === 'fireball') {
      this.createFilledZone(points, config);
    }
  },

  createFilledZone(points, config) {
    // Create a filled circular area for high-mortality zones
    const shape = new THREE.Shape();
    
    if (points.length > 0) {
      // Project points to local 2D coordinate system for shape creation
      const center = points[0].clone();
      shape.moveTo(0, 0);
      
      for (let i = 1; i < points.length; i++) {
        const localPoint = points[i].clone().sub(center);
        shape.lineTo(localPoint.x, localPoint.y);
      }
      shape.closePath();
      
      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: config.opacity * 0.3,
        side: THREE.DoubleSide
      });
      
      const filledZone = new THREE.Mesh(geometry, material);
      filledZone.position.copy(center);
      filledZone.lookAt(new THREE.Vector3(0, 0, 0)); // Face toward Earth center
      
      filledZone.userData = {
        type: 'impactZoneFill',
        zoneName: config.name + '_fill'
      };
      
      this.group.add(filledZone);
    }
  },

  // Create impact flash effect
  createImpactFlash(impactPosition, asteroidSize = 100, speed = 10) {
    // Create a bright flash at impact point, scale with asteroid size and speed
    const baseScale = 0.5; // Larger base scale
    const baseDuration = 3000; // Longer duration (3 seconds)
    const scaleFactor = Math.max(1, asteroidSize / 100); // Scale based on asteroid size
    const speedFactor = Math.max(1, speed / 10); // speed in km/s, normalized
    const initialScale = baseScale * scaleFactor;
    const finalScale = initialScale * 3.0; // Larger final scale
    // Duration: baseDuration * sqrt(scaleFactor * speedFactor)
    const duration = baseDuration * Math.sqrt(scaleFactor * speedFactor);

    const flashGeometry = new THREE.SphereGeometry(1, 16, 16);
    const flashMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, // Bright white flash
      transparent: true,
      opacity: 1
    });
    
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    const surfacePosition = impactPosition.clone().normalize().multiplyScalar(10.1);
    flash.position.copy(surfacePosition);
    
    this.group.add(flash);
    
    flash.scale.set(initialScale, initialScale, initialScale);
    const startTime = Date.now();
    const fadeOut = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const scale = initialScale + (finalScale - initialScale) * t;
      flash.scale.set(scale, scale, scale);
      flash.material.opacity = 1 - t;
      
      // Color transition from white to orange to red
      if (t < 0.3) {
        flash.material.color.setHex(0xffffff); // White
      } else if (t < 0.6) {
        flash.material.color.setHex(0xffaa00); // Orange
      } else {
        flash.material.color.setHex(0xff4400); // Red
      }
      
      if (t < 1) {
        requestAnimationFrame(fadeOut);
      } else {
        this.group.remove(flash);
        flash.geometry.dispose();
        flash.material.dispose();
      }
    };
    fadeOut();
  },

  async createOrbitalPaths() {
    console.log('Starting to create orbital paths using imported data...');
    // Use the imported asteroid data directly

    const asteroidData = asteroidOrbitData;
    console.log('Using imported asteroid data:', Object.keys(asteroidData).length, 'asteroids');
    
    // Process the imported data
    this.processAsteroidData(asteroidData);
  },

  processAsteroidData(asteroidData) {
    console.log('Processing asteroid data...');
    
    // Much smaller scale factor - the coordinates are in km and are huge!
    const scaleFactor = 0.0000002; // Very small scale factor for km coordinates
    const earthRadius = 10; // Our Earth radius in Three.js units
    const minOrbitRadius = earthRadius + 5; // Close to Earth surface
    
    // Bright neon color palette for different orbital paths
    const colors = [
      0x00ff00, 0xff0080, 0x00ffff, 0xffff00, 0xff4000,
      0x8000ff, 0xff8000, 0x0080ff, 0xff00ff, 0x40ff00
    ];
    
    let colorIndex = 0;
    let pathCount = 0;
    const maxPaths = 10; // Show more asteroids now that scaling works
    
    // Process real asteroid data
    console.log(`Starting to process ${Object.keys(asteroidData).length} asteroids...`);
    
    for (const [asteroidName, coordinates] of Object.entries(asteroidData)) {
      if (pathCount >= maxPaths) break;
      
      console.log(`\n--- Processing asteroid ${pathCount + 1}/${maxPaths}: ${asteroidName} ---`);
      console.log(`Raw coordinates length: ${coordinates.length}`);
      
      // Sample fewer coordinates for debugging the scale
      const sampledCoords = coordinates.filter((_, index) => index % 20 === 0).slice(0, 10); // Only first 10 sampled points
      console.log(`Sampled coordinates: ${sampledCoords.length} points`);
      
      if (sampledCoords.length < 5) {
        console.log(`Skipping ${asteroidName} - too few points (${sampledCoords.length} < 5)`);
        continue;
      }
      
      // Convert coordinates and scale them
      const pathPoints = sampledCoords.map((coord, index) => {
        if (!Array.isArray(coord) || coord.length < 3) {
          console.warn(`Invalid coordinate at index ${index}:`, coord);
          return null;
        }
        
        const [x, y, z] = coord;
        
        // Scale down the coordinates
        let scaledX = x * scaleFactor;
        let scaledY = y * scaleFactor;
        let scaledZ = z * scaleFactor;
        
        console.log(`Raw coords: (${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}) -> Scaled: (${scaledX.toFixed(2)}, ${scaledY.toFixed(2)}, ${scaledZ.toFixed(2)})`);
        
        // Calculate distance from origin and ensure minimum distance
        const distance = Math.sqrt(scaledX * scaledX + scaledY * scaledY + scaledZ * scaledZ);
        if (distance < minOrbitRadius) {
          const ratio = minOrbitRadius / distance;
          scaledX *= ratio;
          scaledY *= ratio;
          scaledZ *= ratio;
          console.log(`Adjusted to minimum distance: (${scaledX.toFixed(2)}, ${scaledY.toFixed(2)}, ${scaledZ.toFixed(2)})`);
        }
        
        return new THREE.Vector3(scaledX, scaledY, scaledZ);
      }).filter(point => point !== null);
      
      console.log(`Created ${pathPoints.length} valid path points for ${asteroidName}`);
      console.log(`Sample points:`, pathPoints.slice(0, 3).map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`));
      console.log(`Distance from origin (first point): ${pathPoints[0].length().toFixed(1)} units`);
      
      // Create truly smooth orbital paths by fitting elliptical curves to the data
      console.log('Creating smooth elliptical orbital path...');
      
      // Analyze the asteroid coordinates to find orbital parameters
      const centerX = pathPoints.reduce((sum, p) => sum + p.x, 0) / pathPoints.length;
      const centerY = pathPoints.reduce((sum, p) => sum + p.y, 0) / pathPoints.length;
      const centerZ = pathPoints.reduce((sum, p) => sum + p.z, 0) / pathPoints.length;
      const center = new THREE.Vector3(centerX, centerY, centerZ);
      
      // Find the average distance to determine orbit size
      const distances = pathPoints.map(p => p.distanceTo(center));
      const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
      const maxDistance = Math.max(...distances);
      const minDistance = Math.min(...distances);
      
      // Create a smooth elliptical orbit based on the data
      const semiMajorAxis = (maxDistance + minDistance) / 2;
      const semiMinorAxis = semiMajorAxis * 0.8; // Slightly elliptical
      
      // Find the orbital plane orientation by analyzing the data spread
      const firstPoint = pathPoints[0].clone().sub(center).normalize();
      const midPoint = pathPoints[Math.floor(pathPoints.length / 2)].clone().sub(center).normalize();
      const normal = firstPoint.clone().cross(midPoint).normalize();
      const tangent = firstPoint.clone();
      const bitangent = normal.clone().cross(tangent).normalize();
      
      // Generate perfectly smooth elliptical points
      const numSmoothPoints = 200; // Many points for perfect smoothness
      const interpolatedPoints = [];
      
      for (let i = 0; i < numSmoothPoints; i++) {
        const angle = (i / numSmoothPoints) * Math.PI * 2;
        
        // Create elliptical coordinates
        const x = Math.cos(angle) * semiMajorAxis;
        const y = Math.sin(angle) * semiMinorAxis;
        
        // Transform to 3D orbital plane
        const point = center.clone()
          .add(tangent.clone().multiplyScalar(x))
          .add(bitangent.clone().multiplyScalar(y))
          .add(normal.clone().multiplyScalar(Math.sin(angle * 2) * semiMajorAxis * 0.1)); // Small vertical variation
        
        interpolatedPoints.push(point);
      }
      
      console.log(`Created ${interpolatedPoints.length} perfectly smooth elliptical orbit points`);
      
      // Use the interpolated points for creating the orbital path
      const finalPathPoints = interpolatedPoints;
      
      // Create the orbital path geometry using visible mesh tubes instead of lines
      const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
      
      console.log(`Creating orbital path with color: 0x${colors[colorIndex % colors.length].toString(16)}`);
      
      // Create tube geometry using the perfectly smooth elliptical curve
      const smoothCurve = new THREE.CatmullRomCurve3(finalPathPoints, true, 'catmullrom', 0);
      const tubeGeometry = new THREE.TubeGeometry(smoothCurve, 100, 0.5, 16, true); // High resolution
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: colors[colorIndex % colors.length],
        transparent: true,
        opacity: 0.7
      });
      const orbitTube = new THREE.Mesh(tubeGeometry, tubeMaterial);
      
      // Create bright spheres at evenly distributed points  
      const spheres = [];
      finalPathPoints.forEach((point, index) => {
        if (index % 25 === 0) { // Evenly spaced markers
          const sphereGeometry = new THREE.SphereGeometry(0.4, 8, 8);
          const sphereMaterial = new THREE.MeshBasicMaterial({
            color: colors[colorIndex % colors.length],
            transparent: true,
            opacity: 0.8
          });
          const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          sphere.position.copy(point);
          spheres.push(sphere);
        }
      });
      
      // Add userData to the tube
      orbitTube.userData = {
        asteroidName: asteroidName,
        originalPoints: finalPathPoints, // Use interpolated points
        currentIndex: 0,
        speed: 0.2 + Math.random() * 0.3
      };
      
      // Add to scene and array
      console.log(`✓ Successfully added orbital path for ${asteroidName} with ${pathPoints.length} points`);
      console.log(`  Color: 0x${colors[colorIndex % colors.length].toString(16)}`);
      console.log(`  Tube radius: 2.0, ${spheres.length} marker spheres`);
      
      this.group.add(orbitTube);
      this.orbitalPaths.push(orbitTube);
      
      // Create a larger moving asteroid on this orbit using interpolated points
      this.createOrbitingAsteroid(finalPathPoints, colors[colorIndex % colors.length], asteroidName);
      
      colorIndex++;
      pathCount++;
    }
    
    console.log(`\n=== ORBITAL PATHS SUMMARY ===`);
    console.log(`Created ${pathCount} asteroid orbits out of ${Object.keys(asteroidData).length} available`);
    console.log(`Total orbital elements: ${this.orbitalPaths.length} (paths + glows + asteroids)`);
    console.log(`Camera position: x=${camera.position.x}, y=${camera.position.y}, z=${camera.position.z}`);
    console.log(`Earth group position: x=${this.group.position.x}, y=${this.group.position.y}, z=${this.group.position.z}`);
    console.log('Orbital paths should now be visible around Earth with neon colors');
    console.log('Use mouse to orbit around and zoom in/out to find the orbital paths');
    console.log('================================\n');
  },

  createOrbitingAsteroid(pathPoints, color, name) {
    // Create a realistic asteroid
    const asteroidGeometry = new THREE.IcosahedronGeometry(0.4, 1); // Smaller, more realistic size
    
    // Deform the geometry for irregular asteroid shape
    const positions = asteroidGeometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const displacement = (Math.random() - 0.5) * 0.1;
      const normal = vertex.clone().normalize();
      vertex.add(normal.multiplyScalar(displacement));
      positions[i] = vertex.x;
      positions[i + 1] = vertex.y;
      positions[i + 2] = vertex.z;
    }
    asteroidGeometry.attributes.position.needsUpdate = true;
    asteroidGeometry.computeVertexNormals();
    
    const asteroidMaterial = new THREE.MeshStandardMaterial({
      color: this.generateRealisticAsteroidColor(),
      roughness: 0.9,
      metalness: 0.1,
      transparent: false
    });
    
    const orbitingAsteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
    
    // Create a large glowing sphere around the asteroid for visibility
    const glowGeometry = new THREE.SphereGeometry(2.0, 16, 16); // Large glow sphere
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
    
    // Create an even larger outer glow for extra visibility
    const outerGlowGeometry = new THREE.SphereGeometry(3.5, 12, 12);
    const outerGlowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide
    });
    const outerGlowSphere = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
    
    orbitingAsteroid.userData = {
      pathPoints: pathPoints,
      currentIndex: 0,
      speed: 0.005 + Math.random() * 0.01, // Much much slower movement
      name: name,
      rotationSpeed: {
        x: (Math.random() - 0.5) * 0.001, // Much slower rotation
        y: (Math.random() - 0.5) * 0.001,
        z: (Math.random() - 0.5) * 0.001
      },
      glowSphere: glowSphere,
      outerGlowSphere: outerGlowSphere
    };
    
    // Set initial positions for all elements
    if (pathPoints.length > 0) {
      orbitingAsteroid.position.copy(pathPoints[0]);
      glowSphere.position.copy(pathPoints[0]);
      outerGlowSphere.position.copy(pathPoints[0]);
      console.log(`Created orbiting asteroid for ${name} at position:`, pathPoints[0]);
    }
    
    this.group.add(orbitingAsteroid);
    this.group.add(glowSphere);
    this.group.add(outerGlowSphere);
    this.orbitalPaths.push(orbitingAsteroid);
    this.orbitalPaths.push(glowSphere);
    this.orbitalPaths.push(outerGlowSphere);
  },

  generateRealisticAsteroidColor() {
    // Generate realistic asteroid colors (grays, browns, dark colors)
    const baseColors = [
      0x444444, // Dark gray
      0x666666, // Medium gray  
      0x553322, // Dark brown
      0x664433, // Medium brown
      0x332211, // Very dark brown
      0x555544, // Grayish brown
      0x333333, // Very dark gray
    ];
    
    const baseColor = baseColors[Math.floor(Math.random() * baseColors.length)];
    
    // Add slight variation
    const r = ((baseColor >> 16) & 0xff) / 255;
    const g = ((baseColor >> 8) & 0xff) / 255;
    const b = (baseColor & 0xff) / 255;
    
    const variation = 0.1;
    const newR = Math.max(0, Math.min(1, r + (Math.random() - 0.5) * variation));
    const newG = Math.max(0, Math.min(1, g + (Math.random() - 0.5) * variation));
    const newB = Math.max(0, Math.min(1, b + (Math.random() - 0.5) * variation));
    
    return new THREE.Color(newR, newG, newB);
  },

  updateAsteroids() {
    const currentTime = Date.now()
    
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const asteroid = this.asteroids[i]
      const userData = asteroid.userData
      const elapsed = currentTime - userData.startTime
      const progress = Math.min(elapsed / userData.duration, 1)
      
      if (progress < 1) {
        // Animate asteroid position
        asteroid.position.lerpVectors(userData.startPosition, userData.targetPosition, progress)
        
        // Rotate asteroid
        asteroid.rotation.x += userData.rotationSpeed.x
        asteroid.rotation.y += userData.rotationSpeed.y
        asteroid.rotation.z += userData.rotationSpeed.z
      } else {
        // Impact! Remove asteroid and create crater
        this.group.remove(asteroid)
        this.asteroids.splice(i, 1)
        this.createImpactCrater(userData.targetPosition, userData.realSizeMeters, params.asteroidSpeed)
      }
    }
  },

  createImpactCrater(impactPosition, realSizeMeters, speed = params.asteroidSpeed) {
    // Calculate impact zones using the imported physics model
    this.calculateAndVisualizeImpactZones(impactPosition, realSizeMeters, speed * 1000); // Convert km/s to m/s
    
    // Create impact flash effect
    this.createImpactFlash(impactPosition, realSizeMeters, speed);
  },


  calculateAndVisualizeImpactZones(impactPosition, asteroidDiameter_m, speed_ms) {
    // Use realistic material densities and impact angles
    const impactParams = {
      L0_m: asteroidDiameter_m,
      rho_i: 3100,      // kg/m³ (typical stony asteroid density)
      rho_t: 2500,      // kg/m³ (typical sedimentary rock density)
      v_ms: speed_ms,
      gamma_deg: 45,    // 45° impact angle
      luminousEfficiency: 1e-3  // typical luminous efficiency
    };

    // Calculate impact zones using Rumpf (2016) physics model
    const zones = ImpactZones.computeAll(impactParams);
    
    console.log('Impact zones calculated:', zones);
    
    // Convert world coordinates to lat/lon for zone calculation
    const impactCoords = vector3ToLatLon(impactPosition);
    const impactLat = impactCoords.lat;
    const impactLon = impactCoords.lon;
    
    // Create visual zones on Earth surface
    this.createImpactZoneVisualization(impactLat, impactLon, zones);
  },

  createImpactZoneVisualization(centerLat, centerLon, zones) {
    // Zone configurations with colors and transparency
    const zoneConfigs = [
      {
        name: 'crater',
        radius_m: zones.crater.D_final_m / 2,
        color: 0x8B0000,  // Dark red - 100% mortality
        opacity: 0.8,
        label: 'Crater (100% mortality)'
      },
      {
        name: 'fireball',
        radius_m: zones.fireball50_m,
        color: 0xFF4500,  // Orange-red - thermal radiation
        opacity: 0.6,
        label: 'Fireball (50% mortality)'
      },
      {
        name: 'overpressure', 
        radius_m: zones.overpressure50_m,
        color: 0xFF1493,  // Deep pink - blast overpressure
        opacity: 0.5,
        label: 'Overpressure (50% mortality)'
      },
      {
        name: 'wind',
        radius_m: zones.wind50_m,
        color: 0x9370DB,  // Medium purple - wind blast
        opacity: 0.4,
        label: 'Wind Blast (50% mortality)'
      },
      {
        name: 'seismic',
        radius_m: zones.seismic50_m,
        color: 0x32CD32,  // Lime green - seismic/earthquake
        opacity: 0.3,
        label: 'Seismic (50% mortality)'
      }
    ];

    // Sort zones by radius (largest first) so they render properly
    zoneConfigs.sort((a, b) => (b.radius_m || 0) - (a.radius_m || 0));

    // Create each zone as a circle on Earth's surface
    zoneConfigs.forEach(config => {
      if (config.radius_m && !isNaN(config.radius_m) && config.radius_m > 0) {
        this.createImpactZoneCircle(centerLat, centerLon, config);
      }
    });

    // Use the addImpactZoneInfo function from ImpactZones module
    ImpactZones.addImpactZoneInfo(centerLat, centerLon, zones);
  },

  createImpactZoneCircle(centerLat, centerLon, config) {
    const radius_m = config.radius_m;
    const earthRadius_m = 6371000; // Earth radius in meters
    
    // Convert radius to angular distance (radians)
    const angularRadius = radius_m / earthRadius_m;
    
    // Create circle geometry points around the impact center
    const segments = 64;
    const points = [];
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      
      // Calculate point on circle using spherical trigonometry
      const deltaLat = angularRadius * Math.cos(angle);
      const deltaLon = angularRadius * Math.sin(angle) / Math.cos(centerLat * Math.PI / 180);
      
      const lat = centerLat + (deltaLat * 180 / Math.PI);
      const lon = centerLon + (deltaLon * 180 / Math.PI);
      
      // Convert to 3D position slightly above Earth surface
      const position = latLonToVector3(lat, lon, 10.02 + config.opacity * 0.1);
      points.push(position);
    }
    
    // Create the zone circle geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: config.color,
      transparent: true,
      opacity: config.opacity,
      linewidth: 3
    });
    
    const circle = new THREE.Line(geometry, material);
    circle.userData = {
      type: 'impactZone',
      zoneName: config.name,
      label: config.label,
      radius_m: radius_m
    };
    
    // Add to scene
    this.group.add(circle);
    
    // Also create a filled zone for better visibility
    if (config.name === 'crater' || config.name === 'fireball') {
      this.createFilledZone(points, config);
    }
  },

  createFilledZone(points, config) {
    // Create a filled circular area for high-mortality zones
    const shape = new THREE.Shape();
    
    if (points.length > 0) {
      // Project points to local 2D coordinate system for shape creation
      const center = points[0].clone();
      shape.moveTo(0, 0);
      
      for (let i = 1; i < points.length; i++) {
        const localPoint = points[i].clone().sub(center);
        shape.lineTo(localPoint.x, localPoint.y);
      }
      shape.closePath();
      
      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: config.opacity * 0.3,
        side: THREE.DoubleSide
      });
      
      const filledZone = new THREE.Mesh(geometry, material);
      filledZone.position.copy(center);
      filledZone.lookAt(new THREE.Vector3(0, 0, 0)); // Face toward Earth center
      
      filledZone.userData = {
        type: 'impactZoneFill',
        zoneName: config.name + '_fill'
      };
      
      this.group.add(filledZone);
    }
  },

  // Create impact flash effect
  createImpactFlash(impactPosition, asteroidSize = 100, speed = 10) {
    // Create a bright flash at impact point, scale with asteroid size and speed
    const baseScale = 0.5; // Larger base scale
    const baseDuration = 3000; // Longer duration (3 seconds)
    const scaleFactor = Math.max(1, asteroidSize / 100); // Scale based on asteroid size
    const speedFactor = Math.max(1, speed / 10); // speed in km/s, normalized
    const initialScale = baseScale * scaleFactor;
    const finalScale = initialScale * 3.0; // Larger final scale
    // Duration: baseDuration * sqrt(scaleFactor * speedFactor)
    const duration = baseDuration * Math.sqrt(scaleFactor * speedFactor);

    const flashGeometry = new THREE.SphereGeometry(1, 16, 16);
    const flashMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, // Bright white flash
      transparent: true,
      opacity: 1
    });
    
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    const surfacePosition = impactPosition.clone().normalize().multiplyScalar(10.1);
    flash.position.copy(surfacePosition);
    
    this.group.add(flash);
    
    flash.scale.set(initialScale, initialScale, initialScale);
    const startTime = Date.now();
    const fadeOut = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const scale = initialScale + (finalScale - initialScale) * t;
      flash.scale.set(scale, scale, scale);
      flash.material.opacity = 1 - t;
      
      // Color transition from white to orange to red
      if (t < 0.3) {
        flash.material.color.setHex(0xffffff); // White
      } else if (t < 0.6) {
        flash.material.color.setHex(0xffaa00); // Orange
      } else {
        flash.material.color.setHex(0xff4400); // Red
      }
      
      if (t < 1) {
        requestAnimationFrame(fadeOut);
      } else {
        this.group.remove(flash);
        flash.geometry.dispose();
        flash.material.dispose();
      }
    };
    fadeOut();
  },

  async createOrbitalPaths() {
    console.log('Starting to create orbital paths using imported data...');
    // Use the imported asteroid data directly

    const asteroidData = asteroidOrbitData;
    console.log('Using imported asteroid data:', Object.keys(asteroidData).length, 'asteroids');
    
    // Process the imported data
    this.processAsteroidData(asteroidData);
  },

  processAsteroidData(asteroidData) {
    console.log('Processing asteroid data...');
    
    // Much smaller scale factor - the coordinates are in km and are huge!
    const scaleFactor = 0.0000002; // Very small scale factor for km coordinates
    const earthRadius = 10; // Our Earth radius in Three.js units
    const minOrbitRadius = earthRadius + 5; // Close to Earth surface
    
    // Bright neon color palette for different orbital paths
    const colors = [
      0x00ff00, 0xff0080, 0x00ffff, 0xffff00, 0xff4000,
      0x8000ff, 0xff8000, 0x0080ff, 0xff00ff, 0x40ff00
    ];
    
    let colorIndex = 0;
    let pathCount = 0;
    const maxPaths = 10; // Show more asteroids now that scaling works
    
    // Process real asteroid data
    console.log(`Starting to process ${Object.keys(asteroidData).length} asteroids...`);
    
    for (const [asteroidName, coordinates] of Object.entries(asteroidData)) {
      if (pathCount >= maxPaths) break;
      
      console.log(`\n--- Processing asteroid ${pathCount + 1}/${maxPaths}: ${asteroidName} ---`);
      console.log(`Raw coordinates length: ${coordinates.length}`);
      
      // Sample fewer coordinates for debugging the scale
      const sampledCoords = coordinates.filter((_, index) => index % 20 === 0).slice(0, 10); // Only first 10 sampled points
      console.log(`Sampled coordinates: ${sampledCoords.length} points`);
      
      if (sampledCoords.length < 5) {
        console.log(`Skipping ${asteroidName} - too few points (${sampledCoords.length} < 5)`);
        continue;
      }
      
      // Convert coordinates and scale them
      const pathPoints = sampledCoords.map((coord, index) => {
        if (!Array.isArray(coord) || coord.length < 3) {
          console.warn(`Invalid coordinate at index ${index}:`, coord);
          return null;
        }
        
        const [x, y, z] = coord;
        
        // Scale down the coordinates
        let scaledX = x * scaleFactor;
        let scaledY = y * scaleFactor;
        let scaledZ = z * scaleFactor;
        
        console.log(`Raw coords: (${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}) -> Scaled: (${scaledX.toFixed(2)}, ${scaledY.toFixed(2)}, ${scaledZ.toFixed(2)})`);
        
        // Calculate distance from origin and ensure minimum distance
        const distance = Math.sqrt(scaledX * scaledX + scaledY * scaledY + scaledZ * scaledZ);
        if (distance < minOrbitRadius) {
          const ratio = minOrbitRadius / distance;
          scaledX *= ratio;
          scaledY *= ratio;
          scaledZ *= ratio;
          console.log(`Adjusted to minimum distance: (${scaledX.toFixed(2)}, ${scaledY.toFixed(2)}, ${scaledZ.toFixed(2)})`);
        }
        
        return new THREE.Vector3(scaledX, scaledY, scaledZ);
      }).filter(point => point !== null);
      
      console.log(`Created ${pathPoints.length} valid path points for ${asteroidName}`);
      console.log(`Sample points:`, pathPoints.slice(0, 3).map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`));
      console.log(`Distance from origin (first point): ${pathPoints[0].length().toFixed(1)} units`);
      
      // Create truly smooth orbital paths by fitting elliptical curves to the data
      console.log('Creating smooth elliptical orbital path...');
      
      // Analyze the asteroid coordinates to find orbital parameters
      const centerX = pathPoints.reduce((sum, p) => sum + p.x, 0) / pathPoints.length;
      const centerY = pathPoints.reduce((sum, p) => sum + p.y, 0) / pathPoints.length;
      const centerZ = pathPoints.reduce((sum, p) => sum + p.z, 0) / pathPoints.length;
      const center = new THREE.Vector3(centerX, centerY, centerZ);
      
      // Find the average distance to determine orbit size
      const distances = pathPoints.map(p => p.distanceTo(center));
      const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
      const maxDistance = Math.max(...distances);
      const minDistance = Math.min(...distances);
      
      // Create a smooth elliptical orbit based on the data
      const semiMajorAxis = (maxDistance + minDistance) / 2;
      const semiMinorAxis = semiMajorAxis * 0.8; // Slightly elliptical
      
      // Find the orbital plane orientation by analyzing the data spread
      const firstPoint = pathPoints[0].clone().sub(center).normalize();
      const midPoint = pathPoints[Math.floor(pathPoints.length / 2)].clone().sub(center).normalize();
      const normal = firstPoint.clone().cross(midPoint).normalize();
      const tangent = firstPoint.clone();
      const bitangent = normal.clone().cross(tangent).normalize();
      
      // Generate perfectly smooth elliptical points
      const numSmoothPoints = 200; // Many points for perfect smoothness
      const interpolatedPoints = [];
      
      for (let i = 0; i < numSmoothPoints; i++) {
        const angle = (i / numSmoothPoints) * Math.PI * 2;
        
        // Create elliptical coordinates
        const x = Math.cos(angle) * semiMajorAxis;
        const y = Math.sin(angle) * semiMinorAxis;
        
        // Transform to 3D orbital plane
        const point = center.clone()
          .add(tangent.clone().multiplyScalar(x))
          .add(bitangent.clone().multiplyScalar(y))
          .add(normal.clone().multiplyScalar(Math.sin(angle * 2) * semiMajorAxis * 0.1)); // Small vertical variation
        
        interpolatedPoints.push(point);
      }
      
      console.log(`Created ${interpolatedPoints.length} perfectly smooth elliptical orbit points`);
      
      // Use the interpolated points for creating the orbital path
      const finalPathPoints = interpolatedPoints;
      
      // Create the orbital path geometry using visible mesh tubes instead of lines
      const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
      
      console.log(`Creating orbital path with color: 0x${colors[colorIndex % colors.length].toString(16)}`);
      
      // Create tube geometry using the perfectly smooth elliptical curve
      const smoothCurve = new THREE.CatmullRomCurve3(finalPathPoints, true, 'catmullrom', 0);
      const tubeGeometry = new THREE.TubeGeometry(smoothCurve, 100, 0.5, 16, true); // High resolution
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: colors[colorIndex % colors.length],
        transparent: true,
        opacity: 0.7
      });
      const orbitTube = new THREE.Mesh(tubeGeometry, tubeMaterial);
      
      // Create bright spheres at evenly distributed points  
      const spheres = [];
      finalPathPoints.forEach((point, index) => {
        if (index % 25 === 0) { // Evenly spaced markers
          const sphereGeometry = new THREE.SphereGeometry(0.4, 8, 8);
          const sphereMaterial = new THREE.MeshBasicMaterial({
            color: colors[colorIndex % colors.length],
            transparent: true,
            opacity: 0.8
          });
          const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          sphere.position.copy(point);
          spheres.push(sphere);
        }
      });
      
      // Add userData to the tube
      orbitTube.userData = {
        asteroidName: asteroidName,
        originalPoints: finalPathPoints, // Use interpolated points
        currentIndex: 0,
        speed: 0.2 + Math.random() * 0.3
      };
      
      // Add to scene and array
      console.log(`✓ Successfully added orbital path for ${asteroidName} with ${pathPoints.length} points`);
      console.log(`  Color: 0x${colors[colorIndex % colors.length].toString(16)}`);
      console.log(`  Tube radius: 2.0, ${spheres.length} marker spheres`);
      
      this.group.add(orbitTube);
      this.orbitalPaths.push(orbitTube);
      
      // Create a larger moving asteroid on this orbit using interpolated points
      this.createOrbitingAsteroid(finalPathPoints, colors[colorIndex % colors.length], asteroidName);
      
      colorIndex++;
      pathCount++;
    }
    
    console.log(`\n=== ORBITAL PATHS SUMMARY ===`);
    console.log(`Created ${pathCount} asteroid orbits out of ${Object.keys(asteroidData).length} available`);
    console.log(`Total orbital elements: ${this.orbitalPaths.length} (paths + glows + asteroids)`);
    console.log(`Camera position: x=${camera.position.x}, y=${camera.position.y}, z=${camera.position.z}`);
    console.log(`Earth group position: x=${this.group.position.x}, y=${this.group.position.y}, z=${this.group.position.z}`);
    console.log('Orbital paths should now be visible around Earth with neon colors');
    console.log('Use mouse to orbit around and zoom in/out to find the orbital paths');
    console.log('================================\n');
  },

  createOrbitingAsteroid(pathPoints, color, name) {
    // Create a realistic asteroid
    const asteroidGeometry = new THREE.IcosahedronGeometry(0.4, 1); // Smaller, more realistic size
    
    // Deform the geometry for irregular asteroid shape
    const positions = asteroidGeometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const displacement = (Math.random() - 0.5) * 0.1;
      const normal = vertex.clone().normalize();
      vertex.add(normal.multiplyScalar(displacement));
      positions[i] = vertex.x;
      positions[i + 1] = vertex.y;
      positions[i + 2] = vertex.z;
    }
    asteroidGeometry.attributes.position.needsUpdate = true;
    asteroidGeometry.computeVertexNormals();
    
    const asteroidMaterial = new THREE.MeshStandardMaterial({
      color: this.generateRealisticAsteroidColor(),
      roughness: 0.9,
      metalness: 0.1,
      transparent: false
    });
    
    const orbitingAsteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
    
    // Create a large glowing sphere around the asteroid for visibility
    const glowGeometry = new THREE.SphereGeometry(2.0, 16, 16); // Large glow sphere
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
    
    // Create an even larger outer glow for extra visibility
    const outerGlowGeometry = new THREE.SphereGeometry(3.5, 12, 12);
    const outerGlowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide
    });
    const outerGlowSphere = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
    
    orbitingAsteroid.userData = {
      pathPoints: pathPoints,
      currentIndex: 0,
      speed: 0.005 + Math.random() * 0.01, // Much much slower movement
      name: name,
      rotationSpeed: {
        x: (Math.random() - 0.5) * 0.001, // Much slower rotation
        y: (Math.random() - 0.5) * 0.001,
        z: (Math.random() - 0.5) * 0.001
      },
      glowSphere: glowSphere,
      outerGlowSphere: outerGlowSphere
    };
    
    // Set initial positions for all elements
    if (pathPoints.length > 0) {
      orbitingAsteroid.position.copy(pathPoints[0]);
      glowSphere.position.copy(pathPoints[0]);
      outerGlowSphere.position.copy(pathPoints[0]);
      console.log(`Created orbiting asteroid for ${name} at position:`, pathPoints[0]);
    }
    
    this.group.add(orbitingAsteroid);
    this.group.add(glowSphere);
    this.group.add(outerGlowSphere);
    this.orbitalPaths.push(orbitingAsteroid);
    this.orbitalPaths.push(glowSphere);
    this.orbitalPaths.push(outerGlowSphere);
  },

  generateRealisticAsteroidColor() {
    // Generate realistic asteroid colors (grays, browns, dark colors)
    const baseColors = [
      0x444444, // Dark gray
      0x666666, // Medium gray  
      0x553322, // Dark brown
      0x664433, // Medium brown
      0x332211, // Very dark brown
      0x555544, // Grayish brown
      0x333333, // Very dark gray
    ];
    
    const baseColor = baseColors[Math.floor(Math.random() * baseColors.length)];
    
    // Add slight variation
    const r = ((baseColor >> 16) & 0xff) / 255;
    const g = ((baseColor >> 8) & 0xff) / 255;
    const b = (baseColor & 0xff) / 255;
    
    const variation = 0.1;
    const newR = Math.max(0, Math.min(1, r + (Math.random() - 0.5) * variation));
    const newG = Math.max(0, Math.min(1, g + (Math.random() - 0.5) * variation));
    const newB = Math.max(0, Math.min(1, b + (Math.random() - 0.5) * variation));
    
    return new THREE.Color(newR, newG, newB);
  },

  updateOrbitalPaths() {
    this.orbitalPaths.forEach(pathObject => {
      // Check if the object and its userData exist
      if (!pathObject || !pathObject.userData) {
        return; // Skip this object if it doesn't have userData
      }
      
      // Only update objects that have path movement (asteroids, not lines)
      if (pathObject.userData.pathPoints) {
        const userData = pathObject.userData;
        const pathPoints = userData.pathPoints;
        
        if (pathPoints && pathPoints.length > 1) {
          // Update position along path
          userData.currentIndex += userData.speed;
          
          // Wrap around when reaching end of path
          if (userData.currentIndex >= pathPoints.length) {
            userData.currentIndex = 0;
          }
          
          // Interpolate between path points for smooth movement
          const currentIdx = Math.floor(userData.currentIndex) % pathPoints.length;
          const nextIdx = (currentIdx + 1) % pathPoints.length;
          const t = userData.currentIndex - Math.floor(userData.currentIndex);
          
          const currentPoint = pathPoints[currentIdx];
          const nextPoint = pathPoints[nextIdx];
          
          // Check if both points exist before trying to interpolate
          if (currentPoint && nextPoint) {
            pathObject.position.lerpVectors(currentPoint, nextPoint, t);
            
            // Also move the glow spheres if they exist
            if (userData.glowSphere) {
              userData.glowSphere.position.copy(pathObject.position);
            }
            if (userData.outerGlowSphere) {
              userData.outerGlowSphere.position.copy(pathObject.position);
            }
          }
          
          // Rotate the asteroid if it has rotation speed
          if (userData.rotationSpeed) {
            pathObject.rotation.x += userData.rotationSpeed.x;
            pathObject.rotation.y += userData.rotationSpeed.y;
            pathObject.rotation.z += userData.rotationSpeed.z;
          }
        }
      }
    });
  }
}


runApp(app, scene, renderer, camera, true, undefined, undefined)


// Store app reference globally for HTML interface
window.appInstance = app

/**************************************************
 * 4. Global functions for HTML interface
 *************************************************/
// Make coordinate functions globally accessible for HTML buttons
window.goToInputCoordinates = function() {
  const lat = parseFloat(document.getElementById('lat-input').value)
  const lon = parseFloat(document.getElementById('lon-input').value)
  
  console.log(`HTML Input: lat=${lat}, lon=${lon}`)
  
  if (isNaN(lat) || isNaN(lon)) {
    alert('Please enter valid latitude and longitude values')
    return
  }
  
  if (lat < -90 || lat > 90) {
    alert('Latitude must be between -90 and 90 degrees')
    return
  }
  
  if (lon < -180 || lon > 180) {
    alert('Longitude must be between -180 and 180 degrees')
    return
  }
  
  console.log(`Calling goToLocation with: ${lat}, ${lon}`)
  window.appInstance.goToLocation(lat, lon)
  
  // Also update the GUI sliders
  if (window.gui) {
    window.gui.updateDisplay()
  }
}

window.addMarkerAtInput = function() {
  const lat = parseFloat(document.getElementById('lat-input').value)
  const lon = parseFloat(document.getElementById('lon-input').value)
  
  if (isNaN(lat) || isNaN(lon)) {
    alert(window.i18n.t('errors.invalid_coordinates') || 'Please enter valid latitude and longitude values')
    return
  }
  
  // Add a permanent marker
  const marker = createLocationMarker(lat, lon, {
    color: 0x00ffff,
    size: 0.15
  })
  window.appInstance.customMarkers.add(marker)
}

window.setCoordinates = function(lat, lon) {
  document.getElementById('lat-input').value = lat
  document.getElementById('lon-input').value = lon
  window.appInstance.goToLocation(lat, lon)
}

window.goToMyCurrentLocation = function() {
  window.appInstance.goToMyLocation()
}
