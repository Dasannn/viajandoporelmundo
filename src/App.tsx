import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Destination, DestinationDetail } from './types'
import { fetchDestination, fetchDestinations } from './api'
import DestinationModal from './components/DestinationModal'

// Convert geographic coordinates to a point on the globe's surface.
// Inverse of the lat/lng read in handleMouseMove — keep both in sync.
function latLngToVec3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

// Soft radial-gradient texture for the glowing halo under each pin.
function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,210,80,0.9)')
  g.addColorStop(0.4, 'rgba(255,170,40,0.35)')
  g.addColorStop(1, 'rgba(255,170,40,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function GlobeExplorer() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const globeRef = useRef<THREE.Mesh | null>(null)
  const animFrameRef = useRef<number>(0)
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())
  const isInitializedRef = useRef(false)
  const pinsGroupRef = useRef<THREE.Group | null>(null)
  const pinMeshesRef = useRef<THREE.Mesh[]>([])
  const pinHalosRef = useRef<THREE.Sprite[]>([])
  const glowTexRef = useRef<THREE.Texture | null>(null)
  const pointerDownRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const hoveredNameRef = useRef<string | null>(null)

  const [coords, setCoords] = useState({ lat: 0, lng: 0 })
  const [zoom, setZoom] = useState(2.5)
  const [isLoading, setIsLoading] = useState(true)
  const [autoRotate, setAutoRotate] = useState(true)
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [selected, setSelected] = useState<DestinationDetail | null>(null)
  const [selectedLoading, setSelectedLoading] = useState(false)
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!mountRef.current || isInitializedRef.current) return
    isInitializedRef.current = true

    const W = mountRef.current.clientWidth
    const H = mountRef.current.clientHeight

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene
    scene.background = new THREE.Color(0x050a14)

    // Twinkling star field (varied size/color, animated brightness)
    const starCount = 6000
    const sPos = new Float32Array(starCount * 3)
    const sSize = new Float32Array(starCount)
    const sPhase = new Float32Array(starCount)
    const sColor = new Float32Array(starCount * 3)
    const starPalette = [
      [1.0, 1.0, 1.0], [0.78, 0.88, 1.0], [1.0, 0.93, 0.78], [0.9, 0.85, 1.0],
    ]
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 70 + Math.random() * 90
      sPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      sPos[i * 3 + 1] = r * Math.cos(phi)
      sPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      sSize[i] = Math.random() * Math.random() * 2.6 + 0.5 // mostly small, few large
      sPhase[i] = Math.random() * Math.PI * 2
      const c = starPalette[(Math.random() * starPalette.length) | 0]
      sColor[i * 3] = c[0]; sColor[i * 3 + 1] = c[1]; sColor[i * 3 + 2] = c[2]
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3))
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1))
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1))
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(sColor, 3))
    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize; attribute float aPhase; attribute vec3 aColor;
        uniform float uTime; uniform float uPixelRatio;
        varying vec3 vColor; varying float vTw;
        void main() {
          vColor = aColor;
          float tw = 0.55 + 0.45 * sin(uTime * 2.2 + aPhase);
          vTw = tw;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio * (200.0 / -mv.z) * (0.7 + 0.3 * tw);
        }
      `,
      fragmentShader: `
        varying vec3 vColor; varying float vTw;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * vTw, a * vTw);
        }
      `,
    })
    scene.add(new THREE.Points(starGeo, starMat))

    // Occasional shooting star (a fading streak that respawns)
    const meteorMat = new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const meteorGeo = new THREE.BufferGeometry()
    const meteorPos = new Float32Array(2 * 3)
    meteorGeo.setAttribute('position', new THREE.BufferAttribute(meteorPos, 3))
    const meteor = new THREE.Line(meteorGeo, meteorMat)
    meteor.frustumCulled = false
    scene.add(meteor)
    const meteorHead = new THREE.Vector3()
    const meteorVel = new THREE.Vector3()
    let meteorLife = 0
    let meteorDelay = 2 + Math.random() * 4
    const spawnMeteor = () => {
      const theta = Math.random() * Math.PI * 2
      const r = 110
      meteorHead.set(r * Math.cos(theta), 40 + Math.random() * 40, r * Math.sin(theta))
      meteorVel.set((Math.random() - 0.5) * 2, -1 - Math.random(), (Math.random() - 0.5) * 2)
        .normalize().multiplyScalar(200)
      meteorLife = 0.8
    }

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000)
    camera.position.set(0, 0, 2.5)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    rendererRef.current = renderer
    mountRef.current.appendChild(renderer.domElement)

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 1.2
    controls.maxDistance = 5
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.3
    controlsRef.current = controls

    controls.addEventListener('change', () => {
      setZoom(parseFloat(camera.position.length().toFixed(2)))
    })

    // Lighting — soft, even illumination to preserve the flat map look
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.2)
    scene.add(ambientLight)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0)
    sunLight.position.set(4, 3, 4)
    scene.add(sunLight)

    // Pokemon-style globe (texture path respects the deploy base URL)
    const loader = new THREE.TextureLoader()
    const earthRadius = 1.0
    const sphereGeo = new THREE.SphereGeometry(earthRadius, 64, 64)

    const earthMat = new THREE.MeshLambertMaterial({
      map: loader.load(`${import.meta.env.BASE_URL}pokemon-map.png`, () => setIsLoading(false)),
    })

    const globe = new THREE.Mesh(sphereGeo, earthMat)
    scene.add(globe)
    globeRef.current = globe

    // Procedural cloud layer (soft white blobs on a transparent canvas texture)
    const cloudCanvas = document.createElement('canvas')
    cloudCanvas.width = 1024
    cloudCanvas.height = 512
    const cctx = cloudCanvas.getContext('2d')!
    const cloudBlob = (x: number, y: number, rad: number) => {
      const grad = cctx.createRadialGradient(x, y, 0, x, y, rad)
      grad.addColorStop(0, 'rgba(255,255,255,0.95)')
      grad.addColorStop(0.5, 'rgba(255,255,255,0.5)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      cctx.fillStyle = grad
      cctx.beginPath()
      cctx.arc(x, y, rad, 0, Math.PI * 2)
      cctx.fill()
    }
    for (let i = 0; i < 70; i++) {
      const cx = Math.random() * 1024
      const cy = Math.random() * 512
      const puffs = 3 + ((Math.random() * 5) | 0)
      for (let j = 0; j < puffs; j++) {
        const rad = 16 + Math.random() * 38
        const bx = cx + (Math.random() - 0.5) * 90
        const by = cy + (Math.random() - 0.5) * 50
        cloudBlob(bx, by, rad)
        if (bx < 70) cloudBlob(bx + 1024, by, rad)      // wrap seam
        if (bx > 954) cloudBlob(bx - 1024, by, rad)
      }
    }
    const cloudTex = new THREE.CanvasTexture(cloudCanvas)
    cloudTex.anisotropy = 4
    const cloudGeo = new THREE.SphereGeometry(earthRadius + 0.016, 64, 64)
    const cloudMat = new THREE.MeshLambertMaterial({
      map: cloudTex, transparent: true, opacity: 0.5, depthWrite: false,
    })
    const clouds = new THREE.Mesh(cloudGeo, cloudMat)
    scene.add(clouds)

    // Fresnel atmosphere — bright teal rim glow around the planet
    const atmGeo = new THREE.SphereGeometry(earthRadius * 1.2, 64, 64)
    const atmMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x46d6e6) } },
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor; varying vec3 vNormal;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.2);
          intensity = clamp(intensity, 0.0, 1.0);
          gl_FragColor = vec4(uColor, 1.0) * intensity * 1.5;
        }
      `,
    })
    scene.add(new THREE.Mesh(atmGeo, atmMat))

    // Glow texture shared by all pin halos (disposed on cleanup).
    glowTexRef.current = makeGlowTexture()

    // Animation loop
    const clock = new THREE.Clock()
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate)
      const dt = clock.getDelta()

      // Twinkle stars
      starMat.uniforms.uTime.value = clock.elapsedTime

      // Drift clouds slowly over the surface
      clouds.rotation.y += dt * 0.015

      // Shooting star: advance + fade, then respawn after a random delay
      if (meteorLife > 0) {
        meteorLife -= dt
        meteorHead.addScaledVector(meteorVel, dt)
        meteorPos[0] = meteorHead.x
        meteorPos[1] = meteorHead.y
        meteorPos[2] = meteorHead.z
        meteorPos[3] = meteorHead.x - meteorVel.x * 0.045
        meteorPos[4] = meteorHead.y - meteorVel.y * 0.045
        meteorPos[5] = meteorHead.z - meteorVel.z * 0.045
        meteorGeo.attributes.position.needsUpdate = true
        meteorMat.opacity = Math.max(0, Math.min(1, meteorLife * 1.6))
      } else {
        meteorMat.opacity = 0
        meteorDelay -= dt
        if (meteorDelay <= 0) {
          spawnMeteor()
          meteorDelay = 3 + Math.random() * 6
        }
      }

      // Gently pulse the pin halos
      const halos = pinHalosRef.current
      for (let i = 0; i < halos.length; i++) {
        halos[i].scale.setScalar(0.085 * (0.85 + 0.25 * Math.sin(clock.elapsedTime * 3 + i * 1.7)))
      }

      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    function onResize() {
      if (!mountRef.current) return
      const w = mountRef.current.clientWidth
      const h = mountRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(animFrameRef.current)
      if (pinsGroupRef.current) {
        pinsGroupRef.current.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose()
            ;(o.material as THREE.Material).dispose()
          } else if (o instanceof THREE.Sprite) {
            o.material.dispose()
          }
        })
        pinsGroupRef.current = null
      }
      glowTexRef.current?.dispose()
      renderer.dispose()
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement)
      }
      isInitializedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate
    }
  }, [autoRotate])

  // Load destinations once (App renders inside <AuthGate>, so we're authed).
  useEffect(() => {
    let cancelled = false
    fetchDestinations()
      .then((d) => {
        if (!cancelled) setDestinations(d)
      })
      .catch(() => {
        /* leave the globe empty if the API is unavailable */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // (Re)build the 3D pins whenever the destination list changes.
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return

    if (pinsGroupRef.current) {
      globe.remove(pinsGroupRef.current)
      pinsGroupRef.current.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        } else if (o instanceof THREE.Sprite) {
          o.material.dispose()
        }
      })
    }

    const group = new THREE.Group()
    const meshes: THREE.Mesh[] = []
    const halos: THREE.Sprite[] = []
    const dotGeo = new THREE.SphereGeometry(0.02, 16, 16)
    for (const d of destinations) {
      const pos = latLngToVec3(d.lat, d.lng, 1.012)
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xffd24f }))
      dot.position.copy(pos)
      dot.userData.destination = d
      group.add(dot)
      meshes.push(dot)
      if (glowTexRef.current) {
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexRef.current,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        )
        halo.position.copy(pos)
        halo.scale.setScalar(0.085)
        group.add(halo)
        halos.push(halo)
      }
    }
    globe.add(group)
    pinsGroupRef.current = group
    pinMeshesRef.current = meshes
    pinHalosRef.current = halos
  }, [destinations])

  // Open a pin: show its metadata instantly, then load the photo gallery.
  const openDestination = useCallback(async (d: Destination) => {
    setSelected({ ...d, photos: [] })
    setSelectedLoading(true)
    try {
      const detail = await fetchDestination(d.id)
      setSelected(detail)
    } catch {
      /* keep the metadata-only view on failure */
    } finally {
      setSelectedLoading(false)
    }
  }, [])

  // Distinguish a click on a pin from an orbit drag.
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }, [])

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const down = pointerDownRef.current
      pointerDownRef.current = null
      if (!down || !mountRef.current || !cameraRef.current) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      if (moved > 6 || Date.now() - down.t > 600) return // it was a drag/hold, not a click

      const rect = mountRef.current.getBoundingClientRect()
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current)
      const hits = raycasterRef.current.intersectObjects(pinMeshesRef.current, false)
      if (hits.length > 0) {
        const d = hits[0].object.userData.destination as Destination | undefined
        if (d) openDestination(d)
      }
    },
    [openDestination],
  )

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mountRef.current || !cameraRef.current || !globeRef.current) return
    const rect = mountRef.current.getBoundingClientRect()
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current)

    // Live GPS coordinates from the globe surface under the cursor
    const globeHits = raycasterRef.current.intersectObject(globeRef.current)
    if (globeHits.length > 0) {
      const point = globeHits[0].point.clone().normalize()
      const lat = 90 - Math.acos(point.y) * (180 / Math.PI)
      const lng = Math.atan2(point.z, -point.x) * (180 / Math.PI) - 180
      setCoords({ lat: parseFloat(lat.toFixed(2)), lng: parseFloat(lng.toFixed(2)) })
    }

    // Pin hover → floating name tooltip (and pointer cursor via .over-pin)
    const pinHits = raycasterRef.current.intersectObjects(pinMeshesRef.current, false)
    const name =
      pinHits.length > 0
        ? ((pinHits[0].object.userData.destination as Destination | undefined)?.name ?? null)
        : null
    if (name) setHover({ name, x: e.clientX, y: e.clientY })
    else if (hoveredNameRef.current !== null) setHover(null)
    hoveredNameRef.current = name
  }, [])

  const zoomIn = () => {
    if (cameraRef.current && controlsRef.current) {
      const dir = cameraRef.current.position.clone().normalize()
      const newDist = Math.max(1.2, cameraRef.current.position.length() - 0.3)
      cameraRef.current.position.copy(dir.multiplyScalar(newDist))
      controlsRef.current.update()
      setZoom(newDist)
    }
  }

  const zoomOut = () => {
    if (cameraRef.current && controlsRef.current) {
      const dir = cameraRef.current.position.clone().normalize()
      const newDist = Math.min(5, cameraRef.current.position.length() + 0.3)
      cameraRef.current.position.copy(dir.multiplyScalar(newDist))
      controlsRef.current.update()
      setZoom(newDist)
    }
  }

  const zoomPercent = Math.round(((5 - zoom) / (5 - 1.2)) * 100)

  return (
    <div className="globe-wrapper">
      {/* Loading screen */}
      {isLoading && (
        <div className="loading-screen">
          <div className="pokeball-loader" />
          <p className="loading-text">Cargando Mundo...</p>
        </div>
      )}

      {/* 3D Canvas */}
      <div
        ref={mountRef}
        className={`globe-canvas${hover ? ' over-pin' : ''}`}
        onMouseMove={handleMouseMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      />

      {/* Coordinates HUD */}
      <div className="hud-coords">
        <div className="pokemon-box coords-box">
          <div className="coords-row">
            <span className="coord-label">LAT</span>
            <span className="coord-value">{coords.lat > 0 ? '+' : ''}{coords.lat}°</span>
          </div>
          <div className="coords-row">
            <span className="coord-label">LNG</span>
            <span className="coord-value">{coords.lng > 0 ? '+' : ''}{coords.lng}°</span>
          </div>
          <div className="coords-divider" />
          <div className="coords-row">
            <span className="coord-label">ZOOM</span>
            <span className="coord-value">{zoomPercent}%</span>
          </div>
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="hud-zoom">
        <div className="pokemon-box zoom-box">
          <button className="zoom-btn" onClick={zoomIn} title="Acercar">
            <span className="zoom-icon">+</span>
          </button>
          <div className="zoom-bar">
            <div className="zoom-fill" style={{ height: `${zoomPercent}%` }} />
          </div>
          <button className="zoom-btn" onClick={zoomOut} title="Alejar">
            <span className="zoom-icon">−</span>
          </button>
        </div>
      </div>

      {/* Auto-rotate toggle + reset */}
      <div className="hud-controls">
        <div className="pokemon-box controls-box">
          <button
            className={`control-btn ${autoRotate ? 'active' : ''}`}
            onClick={() => setAutoRotate(v => !v)}
          >
            {autoRotate ? '⏸ PAUSAR' : '▶ ROTAR'}
          </button>
          <button
            className="control-btn"
            onClick={() => {
              if (cameraRef.current && controlsRef.current) {
                cameraRef.current.position.set(0, 0, 2.5)
                controlsRef.current.target.set(0, 0, 0)
                controlsRef.current.update()
              }
            }}
          >
            🌍 RESET
          </button>
        </div>
      </div>

      {/* Floating pin name on hover */}
      {hover && (
        <div className="pin-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.name}
        </div>
      )}

      {/* Destination gallery modal */}
      <DestinationModal
        detail={selected}
        loading={selectedLoading}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

export default GlobeExplorer
