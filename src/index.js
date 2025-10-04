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
import Albedo from "./assets/Albedo.jpg"
import Bump from "./assets/Bump.jpg"
import Clouds from "./assets/Clouds.png"
import Ocean from "./assets/Ocean.png"
import NightLights from "./assets/night_lights_modified.png"
import vertexShader from "./shaders/vertex.glsl"
import fragmentShader from "./shaders/fragment.glsl"
import GaiaSky from "./assets/Gaia_EDR3_darkened.png"

global.THREE = THREE
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
  targetLon: -74.0060
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
let app = {
  async initScene() {
    // OrbitControls
    this.controls = new OrbitControls(camera, renderer.domElement)
    this.controls.enableDamping = true

    // adding a virtual sun using directional light
    this.dirLight = new THREE.DirectionalLight(0xffffff, params.sunIntensity)
    this.dirLight.position.set(-50, 0, 30)
    scene.add(this.dirLight)

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

    // meshphysical.glsl.js is the shader used by MeshStandardMaterial: https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderLib/meshphysical.glsl.js
    // shadowing of clouds, from https://discourse.threejs.org/t/how-to-cast-shadows-from-an-outer-sphere-to-an-inner-sphere/53732/6
    // some notes of the negative light map done on the earth material to simulate shadows casted by clouds
    // we need uv_xOffset so as to act as a means to calibrate the offset of the clouds shadows on earth(especially when earth and cloud rotate at different speeds)
    // the way I need to use fracts here is to get a correct calculated result of the cloud texture offset as it moves,
    // arrived at current method by doing the enumeration of cases (writing them down truly helps, don't keep everything in your head!)
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
      'Go to Target': () => this.goToLocation(params.targetLat, params.targetLon),
      'Clear Markers': () => this.clearCustomMarkers()
    }
    
    Object.keys(locationActions).forEach(actionName => {
      coordFolder.add(locationActions, actionName)
    })
    
    coordFolder.open()

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
  updateCoordinateDisplay(lat, lon, position) {
    const latStr = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`
    const lonStr = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`
    const region = getRegionName(lat, lon)
    
    // Debug logging
    console.log(`Clicked coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`)
    
    this.coordInfoDiv.innerHTML = `
      <strong>Latitude:</strong> ${latStr}<br>
      <strong>Longitude:</strong> ${lonStr}<br>
      <strong>Region:</strong> ${region}
    `
    
    // Calculate distance to target location
    const distance = calculateDistance(lat, lon, params.targetLat, params.targetLon)
    this.locationInfoDiv.innerHTML = `
      <strong>Distance to target:</strong> ${distance.toFixed(0)} km
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

  // @param {number} interval - time elapsed between 2 frames
  // @param {number} elapsed - total time elapsed since app start
  updateScene(interval, elapsed) {
    this.controls.update()
    this.stats1.update()

    // Disabled Earth rotation to keep cities in fixed positions
    // this.earth.rotateY(interval * 0.005 * params.speedFactor)
    // this.clouds.rotateY(interval * 0.01 * params.speedFactor)

    const shader = this.earth.material.userData.shader
    if ( shader ) {
      // Disabled shader uniform updates since Earth is not rotating
      // let offset = (interval * 0.005 * params.speedFactor) / (2 * Math.PI)
      // shader.uniforms.uv_xOffset.value += offset % 1
    }
  }
}

/**************************************************
 * 3. Run the app
 * 'runApp' will do most of the boilerplate setup code for you:
 * e.g. HTML container, window resize listener, mouse move/touch listener for shader uniforms, THREE.Clock() for animation
 * Executing this line puts everything together and runs the app
 * ps. if you don't use custom shaders, pass undefined to the 'uniforms'(2nd-last) param
 * ps. if you don't use post-processing, pass undefined to the 'composer'(last) param
 *************************************************/
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
    alert('Please enter valid latitude and longitude values')
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
