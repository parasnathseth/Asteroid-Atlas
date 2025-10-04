// ThreeJS and Third-party deps
import * as THREE from "three"
import * as dat from 'dat.gui'
import Stats from "three/examples/jsm/libs/stats.module"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"

// Core boilerplate code deps
import { createCamera, createRenderer, runApp, updateLoadingProgressBar } from "./core-utils"

// Other deps
import { loadTexture } from "./common-utils"
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
    // earth's axial tilt is 23.5 degrees
    this.group.rotation.z = 23.5 / 360 * 2 * Math.PI
    
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
    
    // set initial rotational position of earth to get a good initial angle
    this.earth.rotateY(-0.3)
    this.clouds.rotateY(-0.3)

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

    // Add mouse double-click event listener for asteroid impacts
    renderer.domElement.addEventListener('dblclick', (event) => this.onMouseClick(event))

    // Load and create asteroid orbital paths
    await this.createOrbitalPaths()

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
    gui.add(params, "sunIntensity", 0.0, 5.0, 0.1).onChange((val) => {
      this.dirLight.intensity = val
    }).name("Sun Intensity")
    gui.add(params, "metalness", 0.0, 1.0, 0.05).onChange((val) => {
      earthMat.metalness = val
    }).name("Ocean Metalness")
    gui.add(params, "speedFactor", 0.1, 20.0, 0.1).name("Rotation Speed")
    gui.add(params.atmOpacity, "value", 0.0, 1.0, 0.05).name("atmOpacity")
    gui.add(params.atmPowFactor, "value", 0.0, 20.0, 0.1).name("atmPowFactor")
    gui.add(params.atmMultiplier, "value", 0.0, 20.0, 0.1).name("atmMultiplier")

    // Add asteroid impact controls
    const asteroidFolder = gui.addFolder('Asteroid Impact')
    asteroidFolder.add(params, 'asteroidSize', 1, 1500).name('Size (meters)')
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
  // @param {number} interval - time elapsed between 2 frames
  // @param {number} elapsed - total time elapsed since app start
  updateScene(interval, elapsed) {
    this.controls.update()
    this.stats1.update()

    // use rotateY instead of rotation.y so as to rotate by axis Y local to each mesh
    this.earth.rotateY(interval * 0.005 * params.speedFactor)
    this.clouds.rotateY(interval * 0.01 * params.speedFactor)

    // Update asteroid animations
    this.updateAsteroids()
    
    // Update orbital path animations
    this.updateOrbitalPaths()

    const shader = this.earth.material.userData.shader
    if ( shader ) {
      // As for each n radians Point X has rotated, Point Y would have rotated 2n radians.
      // Thus uv.x of Point Y would always be = uv.x of Point X - n / 2π.
      // Dividing n by 2π is to convert from radians(i.e. 0 to 2π) into the uv space(i.e. 0 to 1).
      // The offset n / 2π would be passed into the shader program via the uniform variable: uv_xOffset.
      // We do offset % 1 because the value of 1 for uv.x means full circle,
      // whenever uv_xOffset is larger than one, offsetting 2π radians is like no offset at all.
      let offset = (interval * 0.005 * params.speedFactor) / (2 * Math.PI)
      shader.uniforms.uv_xOffset.value += offset % 1
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

    // Calculate impact duration based on speed (faster = shorter flight time)
    const baseDistance = 25; // units
    const flightTime = Math.max(100, Math.min(2000, 2000 / speedInKmPerSec)); // 100ms to 2000ms

    // Calculate straight perpendicular approach
    const surfaceNormal = targetPosition.clone().normalize();
    const startPosition = targetPosition.clone().add(surfaceNormal.multiplyScalar(baseDistance));
    asteroid.position.copy(startPosition);

    asteroid.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    // Store animation properties
    asteroid.userData = {
      startPosition: startPosition.clone(),
      targetPosition: targetPosition.clone(),
      startTime: Date.now(),
      duration: flightTime,
      rotationSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4
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
    // Scale crater radius based on asteroid size (1m = 0.1, 1.5km = 3.0)
    const craterRadius = Math.max(0.1, Math.min(3.0, realSizeMeters / 500));
    this.impactSites.push({
      position: impactPosition.clone(),
      radius: craterRadius,
      depth: 0.3
    });
    // Deform Earth geometry at impact point
    this.deformEarth(impactPosition, craterRadius);
    // Create permanent orange impact marker
    this.createPermanentImpactMarker(impactPosition, craterRadius);
    // Create impact flash effect, scale with craterRadius and speed
    this.createImpactFlash(impactPosition, craterRadius, speed);
  },

  deformEarth(impactPosition, craterRadius) {
    const earthGeometry = this.earth.geometry;
    const positionAttribute = earthGeometry.attributes.position;
    const vertex = new THREE.Vector3();
    // Convert impact position from group coordinates to Earth's local coordinates
    const earthLocalImpact = this.earth.worldToLocal(this.group.localToWorld(impactPosition.clone()));
    // Deform vertices near the impact point
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      const distance = vertex.distanceTo(earthLocalImpact);
      if (distance < craterRadius) {
        // Calculate deformation strength based on distance and crater size
        const deformationStrength = (1 - distance / craterRadius) * Math.min(0.8, craterRadius * 0.2);
        // Pull vertex inward toward Earth center
        const direction = vertex.clone().normalize();
        vertex.sub(direction.multiplyScalar(deformationStrength));
        positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
    }
    positionAttribute.needsUpdate = true;
    earthGeometry.computeVertexNormals(); // Recalculate normals for proper lighting
  },

  createPermanentImpactMarker(impactPosition, craterRadius) {
    // Create permanent orange crater marker scaled to impact size
    const markerGeometry = new THREE.SphereGeometry(craterRadius, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff6600, // Bright orange
      transparent: true,
      opacity: 0.8
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    // Position marker slightly above surface at impact point
    const surfaceNormal = impactPosition.clone().normalize();
    const markerPosition = impactPosition.clone().add(surfaceNormal.multiplyScalar(0.05));
    marker.position.copy(markerPosition);
    // Scale marker to be flat against the surface (flatten along Z-axis)
    marker.scale.set(1, 1, 0.1);
    // Orient marker so its local Z-axis points along the surface normal (outward from sphere)
    const target = markerPosition.clone().add(surfaceNormal);
    marker.lookAt(target);
    // Add to group so it rotates with Earth
    this.group.add(marker);
  },

  createImpactFlash(impactPosition, craterRadius = 1, speed = 10) {
    // Create a bright flash at impact point, scale with craterRadius and speed
    // Flash size: proportional to craterRadius (asteroid size)
    // Flash duration: proportional to sqrt(kinetic energy) for visual effect
    // (Kinetic energy ~ 0.5 * m * v^2, but for visuals, sqrt is more pleasing)
    const baseScale = 0.2;
    const baseDuration = 500; // ms
    const scaleFactor = Math.max(1, craterRadius * 1.2); // craterRadius in km, scale up
    const speedFactor = Math.max(1, speed / 10); // speed in km/s, normalized
    const initialScale = baseScale * scaleFactor;
    const finalScale = initialScale * 2.5;
    // Duration: baseDuration * sqrt(scaleFactor * speedFactor)
    const duration = baseDuration * Math.sqrt(scaleFactor * speedFactor);

    const flashGeometry = new THREE.SphereGeometry(1, 16, 16);
    const flashMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffaa00,
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
    try {
      // Use the imported asteroid data directly
      const asteroidData = asteroidOrbitData;
      console.log('Using imported asteroid data:', Object.keys(asteroidData).length, 'asteroids');
      
      // Process the imported data
      this.processAsteroidData(asteroidData);
      
    } catch (importError) {
      console.warn('Could not use imported asteroid data:', importError);
      console.log('Creating fallback orbital paths...');
      
      // Create some fallback orbital paths if import fails
      this.createFallbackOrbits();
    }
  },

  processAsteroidData(asteroidData) {
    console.log('Processing asteroid data...');
    
    // First, create a test sphere to make sure we can see things
    console.log('Creating test sphere at distance 30...');
    const testSphere = new THREE.Mesh(
      new THREE.SphereGeometry(3, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    testSphere.position.set(30, 0, 0);
    this.group.add(testSphere);
    this.orbitalPaths.push(testSphere);
    
    // Much larger scale factor to make orbits very visible
    const scaleFactor = 0.02; // Much larger scale factor
    const earthRadius = 10; // Our Earth radius in Three.js units
    const minOrbitRadius = earthRadius + 50; // Much larger minimum distance from Earth surface
    
    // Bright neon color palette for different orbital paths
    const colors = [
      0x00ff00, 0xff0080, 0x00ffff, 0xffff00, 0xff4000,
      0x8000ff, 0xff8000, 0x0080ff, 0xff00ff, 0x40ff00
    ];
    
    let colorIndex = 0;
    let pathCount = 0;
    const maxPaths = 10; // Show more asteroid orbits
    
    // Process real asteroid data
    console.log(`Starting to process ${Object.keys(asteroidData).length} asteroids...`);
    
    for (const [asteroidName, coordinates] of Object.entries(asteroidData)) {
      if (pathCount >= maxPaths) break;
      
      console.log(`\n--- Processing asteroid ${pathCount + 1}/${maxPaths}: ${asteroidName} ---`);
      console.log(`Raw coordinates length: ${coordinates.length}`);
      
      // Sample every 5th coordinate for smoother paths
      const sampledCoords = coordinates.filter((_, index) => index % 5 === 0);
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
        
        // Calculate distance from origin and ensure minimum distance
        const distance = Math.sqrt(scaledX * scaledX + scaledY * scaledY + scaledZ * scaledZ);
        if (distance < minOrbitRadius) {
          const ratio = minOrbitRadius / distance;
          scaledX *= ratio;
          scaledY *= ratio;
          scaledZ *= ratio;
        }
        
        return new THREE.Vector3(scaledX, scaledY, scaledZ);
      }).filter(point => point !== null);
      
      console.log(`Created ${pathPoints.length} valid path points for ${asteroidName}`);
      console.log(`Sample points:`, pathPoints.slice(0, 3).map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`));
      console.log(`Distance from origin (first point): ${pathPoints[0].length().toFixed(1)} units`);
      
      // Create the orbital path geometry
      const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
      
      // Use LineBasicMaterial with maximum visibility settings
      const pathMaterial = new THREE.LineBasicMaterial({ 
        color: colors[colorIndex % colors.length],
        transparent: false,
        opacity: 1.0,
        linewidth: 50 // Much thicker lines
      });
      
      console.log(`Creating line with color: 0x${colors[colorIndex % colors.length].toString(16)}`);
      
      const orbitLine = new THREE.Line(pathGeometry, pathMaterial);
      
      // Create visible spheres at each path point for debugging
      pathPoints.forEach((point, index) => {
        if (index % 5 === 0) { // Every 5th point
          const sphereGeometry = new THREE.SphereGeometry(2, 8, 8);
          const sphereMaterial = new THREE.MeshBasicMaterial({
            color: colors[colorIndex % colors.length],
            transparent: true,
            opacity: 0.8
          });
          const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
          sphere.position.copy(point);
          this.group.add(sphere);
          this.orbitalPaths.push(sphere);
        }
      });
      
      // Create a tube geometry for much better visibility
      const curve = new THREE.CatmullRomCurve3(pathPoints, true);
      const tubeGeometry = new THREE.TubeGeometry(curve, pathPoints.length, 1.5, 8, true);
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: colors[colorIndex % colors.length],
        wireframe: true,
        transparent: true,
        opacity: 0.8
      });
      const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
      this.group.add(tube);
      this.orbitalPaths.push(tube);
      
      // Add glow effect by creating a second, thicker line behind
      const glowMaterial = new THREE.LineBasicMaterial({
        color: colors[colorIndex % colors.length],
        transparent: false,
        opacity: 1.0,
        linewidth: 100 // Much thicker glow
      });
      const glowLine = new THREE.Line(pathGeometry.clone(), glowMaterial);
      
      // Add userData to both lines to prevent errors
      glowLine.userData = {
        asteroidName: asteroidName + '_glow',
        isGlow: true
      };
      
      orbitLine.userData = {
        asteroidName: asteroidName,
        originalPoints: pathPoints,
        currentIndex: 0,
        speed: 0.2 + Math.random() * 0.3 // Random speed for variety
      };
      
      // Add to scene and array
      console.log(`✓ Successfully added orbital path for ${asteroidName} with ${pathPoints.length} points`);
      console.log(`  Color: 0x${colors[colorIndex % colors.length].toString(16)}`);
      this.group.add(glowLine); // Add glow effect first (behind)
      this.group.add(orbitLine);
      this.orbitalPaths.push(orbitLine);
      this.orbitalPaths.push(glowLine);
      
      // Create a larger moving asteroid on this orbit
      this.createOrbitingAsteroid(pathPoints, colors[colorIndex % colors.length], asteroidName);
      
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

  createFallbackOrbits() {
    console.log('Creating fallback orbital paths...');
    
    const colors = [0x00ff00, 0xff0080, 0x00ffff, 0xffff00, 0xff4000];
    
    for (let i = 0; i < 5; i++) {
      const radius = 20 + i * 8;
      const points = [];
      const numPoints = 60;
      
      for (let j = 0; j < numPoints; j++) {
        const angle = (j / numPoints) * Math.PI * 2;
        // Create elliptical orbits with different inclinations
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * (0.7 + i * 0.1);
        const z = Math.sin(angle + i) * (5 + i * 3);
        points.push(new THREE.Vector3(x, y, z));
      }
      
      // Create orbital path
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 1.0,
        linewidth: 12
      });
      
      const line = new THREE.Line(geometry, material);
      line.userData = {
        asteroidName: `FallbackOrbit${i + 1}`,
        isFallbackOrbit: true
      };
      console.log(`Adding fallback orbit ${i + 1}`);
      this.group.add(line);
      this.orbitalPaths.push(line);
      
      // Add a moving asteroid
      const asteroid = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 8, 8),
        new THREE.MeshStandardMaterial({
          color: colors[i],
          emissive: colors[i],
          emissiveIntensity: 0.4
        })
      );
      asteroid.position.copy(points[0]);
      asteroid.userData = {
        pathPoints: points,
        currentIndex: 0,
        speed: 0.3 + i * 0.1,
        name: `FallbackAsteroid${i + 1}`,
        rotationSpeed: {
          x: (Math.random() - 0.5) * 0.02,
          y: (Math.random() - 0.5) * 0.02,
          z: (Math.random() - 0.5) * 0.02
        }
      };
      this.group.add(asteroid);
      this.orbitalPaths.push(asteroid);
    }
    
    console.log('Fallback orbits created successfully');
  },

  createTestOrbit(color) {
    console.log('Creating simple test orbit...');
    
    // Create a simple circular orbit around Earth
    const testPoints = [];
    const radius = 25; // Distance from Earth center
    const numPoints = 50;
    
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const z = Math.sin(angle * 2) * 5; // Add some vertical variation
      testPoints.push(new THREE.Vector3(x, y, z));
    }
    
    // Create the test orbital path
    const testGeometry = new THREE.BufferGeometry().setFromPoints(testPoints);
    const testMaterial = new THREE.LineBasicMaterial({ 
      color: color,
      transparent: true,
      opacity: 1.0,
      linewidth: 15
    });
    
    const testLine = new THREE.Line(testGeometry, testMaterial);
    testLine.userData = {
      asteroidName: 'TestOrbit',
      isTestOrbit: true
    };
    console.log('Adding test orbit to scene');
    this.group.add(testLine);
    this.orbitalPaths.push(testLine);
    
    // Create a test asteroid
    const testAsteroid = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 8, 8),
      new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.3
      })
    );
    testAsteroid.position.copy(testPoints[0]);
    testAsteroid.userData = {
      pathPoints: testPoints,
      currentIndex: 0,
      speed: 0.5,
      name: 'TestAsteroid',
      rotationSpeed: {
        x: 0.01,
        y: 0.02,
        z: 0.01
      }
    };
    this.group.add(testAsteroid);
    this.orbitalPaths.push(testAsteroid);
  },

  createOrbitingAsteroid(pathPoints, color, name) {
    // Create a larger, more visible asteroid that moves along the orbital path
    const asteroidGeometry = new THREE.IcosahedronGeometry(0.8, 1); // Increased size from 0.4 to 0.8
    const asteroidMaterial = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: 0.7,
      emissive: color,
      emissiveIntensity: 0.4 // Increased from 0.2 to 0.4
    });
    
    const orbitingAsteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
    orbitingAsteroid.userData = {
      pathPoints: pathPoints,
      currentIndex: 0,
      speed: 0.3 + Math.random() * 0.5,
      name: name,
      rotationSpeed: {
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.02
      }
    };
    
    // Set initial position
    if (pathPoints.length > 0) {
      orbitingAsteroid.position.copy(pathPoints[0]);
    }
    
    this.group.add(orbitingAsteroid);
    this.orbitalPaths.push(orbitingAsteroid); // Store with paths for updating
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

/**************************************************
 * 3. Run the app
 * 'runApp' will do most of the boilerplate setup code for you:
 * e.g. HTML container, window resize listener, mouse move/touch listener for shader uniforms, THREE.Clock() for animation
 * Executing this line puts everything together and runs the app
 * ps. if you don't use custom shaders, pass undefined to the 'uniforms'(2nd-last) param
 * ps. if you don't use post-processing, pass undefined to the 'composer'(last) param
 *************************************************/
runApp(app, scene, renderer, camera, true, undefined, undefined)
