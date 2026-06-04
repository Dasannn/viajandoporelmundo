import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export const Route = createFileRoute('/')({
  component: GlobeExplorer,
})

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

  const [coords, setCoords] = useState({ lat: 0, lng: 0 })
  const [zoom, setZoom] = useState(2.5)
  const [isLoading, setIsLoading] = useState(true)
  const [autoRotate, setAutoRotate] = useState(true)

  useEffect(() => {
    if (!mountRef.current || isInitializedRef.current) return
    isInitializedRef.current = true

    const W = mountRef.current.clientWidth
    const H = mountRef.current.clientHeight

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene
    scene.background = new THREE.Color(0x050a14)

    // Stars
    const starGeo = new THREE.BufferGeometry()
    const starCount = 8000
    const starPositions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount * 3; i++) {
      starPositions[i] = (Math.random() - 0.5) * 300
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15 })
    scene.add(new THREE.Points(starGeo, starMat))

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

    // Pokemon-style globe
    const loader = new THREE.TextureLoader()
    const earthRadius = 1.0
    const sphereGeo = new THREE.SphereGeometry(earthRadius, 64, 64)

    const earthMat = new THREE.MeshLambertMaterial({
      map: loader.load('/pokemon-map.png', () => setIsLoading(false)),
    })

    const globe = new THREE.Mesh(sphereGeo, earthMat)
    scene.add(globe)
    globeRef.current = globe

    // Teal atmosphere glow matching Pokemon map ocean color
    const atmGeo = new THREE.SphereGeometry(earthRadius + 0.022, 64, 64)
    const atmMat = new THREE.MeshPhongMaterial({
      color: 0x30b8c8,
      transparent: true,
      opacity: 0.10,
      side: THREE.FrontSide,
      depthWrite: false,
    })
    scene.add(new THREE.Mesh(atmGeo, atmMat))

    // Outer glow
    const glowGeo = new THREE.SphereGeometry(earthRadius + 0.06, 64, 64)
    const glowMat = new THREE.MeshPhongMaterial({
      color: 0x20a0b0,
      transparent: true,
      opacity: 0.05,
      side: THREE.BackSide,
      depthWrite: false,
    })
    scene.add(new THREE.Mesh(glowGeo, glowMat))

    // Animation loop
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate)
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
        className="globe-canvas"
        onMouseMove={handleMouseMove}
      />

      {/* Header HUD */}
      <div className="hud-header">
        <div className="pokemon-box title-box">
          <span className="pokemon-star">★</span>
          <span className="hud-title">POKÉGLOBE</span>
          <span className="pokemon-star">★</span>
        </div>
      </div>

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
    </div>
  )
}
