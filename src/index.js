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

    // adding a virtual sun using directional light
    this.dirLight = new THREE.DirectionalLight(0xffffff, params.sunIntensity)
    this.dirLight.position.set(-50, 0, 30)
    scene.add(this.dirLight)

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
    this.asteroidGeometry = new THREE.IcosahedronGeometry(0.8, 1) // Larger irregular rocky shape
    this.asteroidMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x666666, // Lighter gray for better visibility
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

    // Add mouse double-click event listener
    renderer.domElement.addEventListener('dblclick', (event) => this.onMouseClick(event))

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
    // Create asteroid mesh
    const asteroid = new THREE.Mesh(this.asteroidGeometry, this.asteroidMaterial)
    
    // Calculate direction from target toward camera for direct approach
    const targetWorldPos = this.group.localToWorld(targetPosition.clone())
    const cameraDirection = camera.position.clone().sub(targetWorldPos).normalize()
    
    // Start position: along the camera-to-target line, but further back
    const startPosition = targetWorldPos.clone().add(cameraDirection.multiplyScalar(25))
    
    // Convert back to group local coordinates
    const localStartPosition = this.group.worldToLocal(startPosition)
    asteroid.position.copy(localStartPosition)
    
    // Add slight rotation to asteroid
    asteroid.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    )
    
    // Store animation properties
    asteroid.userData = {
      startPosition: startPosition.clone(),
      targetPosition: targetPosition.clone(),
      startTime: Date.now(),
      duration: 2000, // 2 seconds flight time
      rotationSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2
      )
    }
    
    this.group.add(asteroid)
    this.asteroids.push(asteroid)
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
        this.createImpactCrater(userData.targetPosition)
      }
    }
  },

  createImpactCrater(impactPosition) {
    // Store impact site for future reference
    this.impactSites.push({
      position: impactPosition.clone(),
      radius: 0.5,
      depth: 0.3
    })
    
    // Deform Earth geometry at impact point
    this.deformEarth(impactPosition)
    
    // Create impact flash effect
    this.createImpactFlash(impactPosition)
  },

  deformEarth(impactPosition) {
    const earthGeometry = this.earth.geometry
    const positionAttribute = earthGeometry.attributes.position
    const vertex = new THREE.Vector3()
    
    // Convert impact position from group coordinates to Earth's local coordinates
    const earthLocalImpact = this.earth.worldToLocal(this.group.localToWorld(impactPosition.clone()))
    
    // Deform vertices near the impact point
    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i)
      
      const distance = vertex.distanceTo(earthLocalImpact)
      const craterRadius = 1.0
      
      if (distance < craterRadius) {
        // Calculate deformation strength based on distance
        const deformationStrength = (1 - distance / craterRadius) * 0.3
        
        // Pull vertex inward toward Earth center
        const direction = vertex.clone().normalize()
        vertex.sub(direction.multiplyScalar(deformationStrength))
        
        positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z)
      }
    }
    
    positionAttribute.needsUpdate = true
    earthGeometry.computeVertexNormals() // Recalculate normals for proper lighting
  },

  createImpactFlash(impactPosition) {
    // Create a bright flash at impact point
    const flashGeometry = new THREE.SphereGeometry(0.2, 8, 8)
    const flashMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffaa00,
      transparent: true,
      opacity: 1
    })
    
    const flash = new THREE.Mesh(flashGeometry, flashMaterial)
    const surfacePosition = impactPosition.clone().normalize().multiplyScalar(10.1)
    flash.position.copy(surfacePosition)
    
    this.group.add(flash)
    
    // Animate flash fadeout
    const startTime = Date.now()
    const fadeOut = () => {
      const elapsed = Date.now() - startTime
      const progress = elapsed / 500 // 500ms fade
      
      if (progress < 1) {
        flash.material.opacity = 1 - progress
        flash.scale.setScalar(1 + progress * 2)
        requestAnimationFrame(fadeOut)
      } else {
        this.group.remove(flash)
      }
    }
    fadeOut()
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
