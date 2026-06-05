import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, Download, MessageCircle, Palette, RefreshCcw, Sparkles } from 'lucide-react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import './styles.css';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const WHATSAPP_NUMBER = '5545999999999'; // troque pelo WhatsApp da manicure/salão, ex: 5545999999999

const COLORS = [
  { name: 'Rubi', value: '#b5123a' },
  { name: 'Cereja', value: '#e21d48' },
  { name: 'Nude Rosé', value: '#d9a18f' },
  { name: 'Branco', value: '#f8f2ec' },
  { name: 'Preto Luxo', value: '#111111' },
  { name: 'Lavanda', value: '#9d7be8' },
  { name: 'Azul Royal', value: '#1e4ed8' },
  { name: 'Verde Jade', value: '#14946b' },
  { name: 'Dourado', value: '#d49b27' },
  { name: 'Chocolate', value: '#6b3528' }
];

const SHAPES = [
  { id: 'oval', label: 'Oval' },
  { id: 'square', label: 'Quadrada' },
  { id: 'almond', label: 'Amendoada' },
  { id: 'stiletto', label: 'Stiletto' }
];

const DESIGNS = [
  { id: 'solid', label: 'Lisa' },
  { id: 'french', label: 'Francesinha' },
  { id: 'glitter', label: 'Glitter' },
  { id: 'heart', label: 'Coração' }
];

const FINGERS = [
  { name: 'thumb', tip: 4, dip: 3, pip: 2, mcp: 1, width: 1.02, length: 0.86, offset: 0.31 },
  { name: 'index', tip: 8, dip: 7, pip: 6, mcp: 5, width: 0.78, length: 1.0, offset: 0.34 },
  { name: 'middle', tip: 12, dip: 11, pip: 10, mcp: 9, width: 0.82, length: 1.04, offset: 0.34 },
  { name: 'ring', tip: 16, dip: 15, pip: 14, mcp: 13, width: 0.77, length: 0.98, offset: 0.34 },
  { name: 'pinky', tip: 20, dip: 19, pip: 18, mcp: 17, width: 0.66, length: 0.9, offset: 0.34 }
];

const GLITTER_POINTS = Array.from({ length: 18 }, (_, index) => ({
  x: pseudoRandom(index * 31 + 3) - 0.5,
  y: pseudoRandom(index * 47 + 9) - 0.5,
  r: 0.7 + pseudoRandom(index * 19 + 11) * 1.4,
  a: 0.45 + pseudoRandom(index * 13 + 4) * 0.45
}));

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const detectorRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const smoothedLandmarksRef = useRef(null);
  const statusRef = useRef({ text: '', at: 0 });
  const settingsRef = useRef({ color: COLORS[1].value, shape: 'oval', design: 'solid', scale: 1, fit: 1, gloss: 0.85, depth: 0.75 });

  const [status, setStatus] = useState('Carregando IA da câmera...');
  const [cameraOn, setCameraOn] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[1]);
  const [shape, setShape] = useState('oval');
  const [design, setDesign] = useState('solid');
  const [scale, setScale] = useState(1);
  const [fit, setFit] = useState(1);
  const [gloss, setGloss] = useState(0.85);
  const [depth, setDepth] = useState(0.75);
  const [facingMode, setFacingMode] = useState('environment');
  const [photoUrl, setPhotoUrl] = useState(null);

  const selectedShape = useMemo(() => SHAPES.find((item) => item.id === shape), [shape]);
  const selectedDesign = useMemo(() => DESIGNS.find((item) => item.id === design), [design]);

  useEffect(() => {
    settingsRef.current = { color: selectedColor.value, shape, design, scale, fit, gloss, depth };
  }, [selectedColor, shape, design, scale, fit, gloss, depth]);

  useEffect(() => {
    let mounted = true;

    async function setupDetector() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const detector = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.62,
          minHandPresenceConfidence: 0.62,
          minTrackingConfidence: 0.62
        });

        if (!mounted) return;
        detectorRef.current = detector;
        setStatus('IA pronta. Toque em iniciar câmera.');
      } catch (error) {
        console.error(error);
        setStatus('Não consegui carregar a IA. Verifique internet/HTTPS e recarregue.');
      }
    }

    setupDetector();

    return () => {
      mounted = false;
      stopCamera();
      detectorRef.current?.close?.();
    };
  }, []);

  async function startCamera(nextFacing = facingMode) {
    try {
      stopCamera(false);
      smoothedLandmarksRef.current = null;
      setSmartStatus('Abrindo câmera...', true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      setCameraOn(true);
      setSmartStatus('Coloque a mão aberta na frente da câmera.', true);
      renderLoop();
    } catch (error) {
      console.error(error);
      setSmartStatus('Permita o acesso à câmera para usar o provador. No celular precisa estar em HTTPS.', true);
    }
  }

  function stopCamera(clear = true) {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    if (clear) setCameraOn(false);
  }

  async function switchCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    await startCamera(next);
  }

  function setSmartStatus(text, force = false) {
    const now = performance.now();
    if (force || (statusRef.current.text !== text && now - statusRef.current.at > 650)) {
      statusRef.current = { text, at: now };
      setStatus(text);
    }
  }

  function renderLoop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;

    if (!video || !canvas || !detector) {
      animationRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const ctx = canvas.getContext('2d');
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const result = detector.detectForVideo(video, performance.now());

      if (result.landmarks?.length) {
        setSmartStatus('Mão detectada. Ajuste tamanho, encaixe, brilho e 3D.');
        const rawLandmarks = result.landmarks[0];
        const smooth = smoothLandmarks(smoothedLandmarksRef.current, rawLandmarks, 0.58);
        smoothedLandmarksRef.current = smooth;
        drawNails(ctx, smooth, width, height, settingsRef.current);
      } else {
        smoothedLandmarksRef.current = null;
        setSmartStatus('Aproxime a mão da câmera e deixe os dedos visíveis.');
      }
    }

    animationRef.current = requestAnimationFrame(renderLoop);
  }

  function capturePhoto() {
    const video = videoRef.current;
    const overlay = canvasRef.current;
    if (!video || !overlay) return;

    const out = document.createElement('canvas');
    out.width = overlay.width;
    out.height = overlay.height;
    const ctx = out.getContext('2d');

    if (facingMode === 'user') {
      ctx.translate(out.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, out.width, out.height);
    if (facingMode === 'user') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(out.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(overlay, 0, 0);
    setPhotoUrl(out.toDataURL('image/png'));
  }

  const whatsappText = encodeURIComponent(
    `Olá! Gostei do modelo: cor ${selectedColor.name}, formato ${selectedShape?.label}, desenho ${selectedDesign?.label}. Quero agendar.`
  );

  return (
    <main className="app">
      <section className="hero">
        <div>
          <span className="badge"><Sparkles size={16} /> Nail AR Studio</span>
          <h1>Provador virtual de unhas em tempo real</h1>
          <p>Abra no celular, aponte para a mão da cliente e teste cores, formatos e desenhos antes de agendar.</p>
        </div>
      </section>

      <section className="studio-card">
        <div className="camera-wrap">
          <video ref={videoRef} className={facingMode === 'user' ? 'mirror' : ''} playsInline muted />
          <canvas ref={canvasRef} className={facingMode === 'user' ? 'mirror overlay' : 'overlay'} />
          {!cameraOn && (
            <div className="camera-placeholder">
              <Camera size={46} />
              <p>Toque para iniciar a câmera</p>
              <button onClick={() => startCamera()} className="primary">Iniciar câmera</button>
            </div>
          )}
        </div>

        <div className="status">{status}</div>

        <div className="toolbar">
          <button onClick={() => startCamera()} className="primary"><Camera size={18} /> {cameraOn ? 'Reiniciar' : 'Iniciar'}</button>
          <button onClick={switchCamera}><RefreshCcw size={18} /> Virar câmera</button>
          <button onClick={capturePhoto}><Download size={18} /> Salvar prévia</button>
        </div>
      </section>

      <section className="controls">
        <div className="panel">
          <h2><Palette size={20} /> Cores</h2>
          <div className="colors">
            {COLORS.map((color) => (
              <button
                key={color.name}
                className={selectedColor.name === color.name ? 'color selected' : 'color'}
                style={{ background: color.value }}
                aria-label={color.name}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>
          <strong>{selectedColor.name}</strong>
        </div>

        <div className="panel">
          <h2>Formato</h2>
          <div className="chips">
            {SHAPES.map((item) => (
              <button key={item.id} onClick={() => setShape(item.id)} className={shape === item.id ? 'chip active' : 'chip'}>{item.label}</button>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Desenho</h2>
          <div className="chips">
            {DESIGNS.map((item) => (
              <button key={item.id} onClick={() => setDesign(item.id)} className={design === item.id ? 'chip active' : 'chip'}>{item.label}</button>
            ))}
          </div>
        </div>

        <div className="panel sliders-panel">
          <h2>Ajuste fino</h2>
          <label>Tamanho <strong>{Math.round(scale * 100)}%</strong></label>
          <input type="range" min="0.72" max="1.45" step="0.01" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
          <label>Encaixe <strong>{Math.round(fit * 100)}%</strong></label>
          <input type="range" min="0.75" max="1.28" step="0.01" value={fit} onChange={(event) => setFit(Number(event.target.value))} />
          <label>Brilho <strong>{Math.round(gloss * 100)}%</strong></label>
          <input type="range" min="0.15" max="1.15" step="0.01" value={gloss} onChange={(event) => setGloss(Number(event.target.value))} />
          <label>3D <strong>{Math.round(depth * 100)}%</strong></label>
          <input type="range" min="0.1" max="1.25" step="0.01" value={depth} onChange={(event) => setDepth(Number(event.target.value))} />
        </div>
      </section>

      {photoUrl && (
        <section className="preview">
          <h2>Prévia salva</h2>
          <img src={photoUrl} alt="Prévia da unha simulada" />
          <a href={photoUrl} download="nail-ar-preview.png" className="primary download">Baixar imagem</a>
        </section>
      )}

      <a className="whatsapp" target="_blank" rel="noreferrer" href={`https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappText}`}>
        <MessageCircle size={22} /> Agendar no WhatsApp
      </a>
    </main>
  );
}

function drawNails(ctx, landmarks, width, height, settings) {
  const points = landmarks.map((landmark) => point(landmark, width, height));
  const palmSize = Math.max(40, distance(points[0], points[9]));

  FINGERS.forEach((finger) => {
    const tip = points[finger.tip];
    const dip = points[finger.dip];
    const pip = points[finger.pip];
    const mcp = points[finger.mcp];

    const axis = normalize({ x: tip.x - dip.x, y: tip.y - dip.y });
    const segment = Math.max(distance(tip, dip), distance(dip, pip) * 0.74, palmSize * 0.17);
    const fingerThickness = clamp(distance(pip, mcp) * 0.24, palmSize * 0.065, palmSize * 0.16);

    const nailLength = clamp(segment * 1.18 * finger.length * settings.scale, palmSize * 0.18, palmSize * 0.48);
    const nailWidth = clamp(fingerThickness * finger.width * settings.fit, palmSize * 0.072, palmSize * 0.19);

    // Posiciona a unha sobre a falange distal: uma parte fica no dedo, outra passa suavemente da ponta.
    const center = {
      x: tip.x - axis.x * nailLength * finger.offset,
      y: tip.y - axis.y * nailLength * finger.offset
    };

    const angle = Math.atan2(axis.x, -axis.y);
    const zTip = landmarks[finger.tip]?.z || 0;
    const zDip = landmarks[finger.dip]?.z || 0;
    const tilt = clamp((zDip - zTip) * 9, -0.42, 0.42);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.transform(1 + Math.abs(tilt) * 0.08, tilt * 0.16, 0, 1, 0, 0);
    drawNailShape(ctx, nailWidth, nailLength, settings.shape, settings.color, settings.design, settings.gloss, settings.depth, finger.name);
    ctx.restore();
  });
}

function drawNailShape(ctx, w, h, shape, color, design, gloss, depth, fingerName) {
  const depthStrength = clamp(depth, 0, 1.35);
  const glossStrength = clamp(gloss, 0, 1.25);

  ctx.save();

  // sombra de contato: dá sensação de a unha estar colada na mão, não flutuando.
  ctx.shadowColor = `rgba(0,0,0,${0.18 + depthStrength * 0.18})`;
  ctx.shadowBlur = 7 + depthStrength * 8;
  ctx.shadowOffsetY = 1.5 + depthStrength * 3;

  makeNailPath(ctx, w, h, shape);

  const vertical = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  vertical.addColorStop(0, lighten(color, 0.24));
  vertical.addColorStop(0.2, lighten(color, 0.08));
  vertical.addColorStop(0.58, color);
  vertical.addColorStop(1, darken(color, 0.18));

  ctx.globalAlpha = 0.94;
  ctx.fillStyle = vertical;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.shadowColor = 'transparent';

  // volume lateral em 3D, simulando curvatura de unha com centro mais iluminado.
  ctx.save();
  makeNailPath(ctx, w, h, shape);
  ctx.clip();

  const sideShade = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  sideShade.addColorStop(0, `rgba(0,0,0,${0.18 * depthStrength})`);
  sideShade.addColorStop(0.22, `rgba(255,255,255,${0.08 * depthStrength})`);
  sideShade.addColorStop(0.5, `rgba(255,255,255,${0.19 * depthStrength})`);
  sideShade.addColorStop(0.78, `rgba(255,255,255,${0.06 * depthStrength})`);
  sideShade.addColorStop(1, `rgba(0,0,0,${0.22 * depthStrength})`);
  ctx.fillStyle = sideShade;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  const topGlow = ctx.createRadialGradient(-w * 0.18, -h * 0.24, 1, -w * 0.18, -h * 0.24, h * 0.7);
  topGlow.addColorStop(0, `rgba(255,255,255,${0.28 * glossStrength})`);
  topGlow.addColorStop(0.42, `rgba(255,255,255,${0.08 * glossStrength})`);
  topGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  drawGloss(ctx, w, h, glossStrength, fingerName);

  if (design === 'french') drawFrench(ctx, w, h, shape);
  if (design === 'glitter') drawGlitter(ctx, w, h);
  if (design === 'heart') drawHeart(ctx, 0, -h * 0.03, Math.max(4, w * 0.17));

  ctx.restore();

  // borda inferior mais escura e borda superior suave, como esmalte real.
  makeNailPath(ctx, w, h, shape);
  ctx.lineWidth = Math.max(0.9, w * 0.045);
  ctx.strokeStyle = `rgba(255,255,255,${0.2 + glossStrength * 0.18})`;
  ctx.stroke();

  makeNailPath(ctx, w * 0.94, h * 0.96, shape);
  ctx.lineWidth = Math.max(0.6, w * 0.018);
  ctx.strokeStyle = `rgba(0,0,0,${0.12 * depthStrength})`;
  ctx.stroke();

  ctx.restore();
}

function makeNailPath(ctx, w, h, shape) {
  ctx.beginPath();

  if (shape === 'square') {
    roundedRect(ctx, -w / 2, -h / 2, w, h, Math.max(4, w * 0.24));
  } else if (shape === 'stiletto') {
    ctx.moveTo(0, -h / 2);
    ctx.bezierCurveTo(w * 0.58, -h * 0.26, w * 0.5, h * 0.32, w * 0.18, h / 2);
    ctx.bezierCurveTo(w * 0.05, h * 0.56, -w * 0.05, h * 0.56, -w * 0.18, h / 2);
    ctx.bezierCurveTo(-w * 0.5, h * 0.32, -w * 0.58, -h * 0.26, 0, -h / 2);
    ctx.closePath();
  } else if (shape === 'almond') {
    ctx.moveTo(0, -h / 2);
    ctx.bezierCurveTo(w * 0.55, -h * 0.2, w * 0.48, h * 0.34, w * 0.12, h / 2);
    ctx.bezierCurveTo(w * 0.04, h * 0.54, -w * 0.04, h * 0.54, -w * 0.12, h / 2);
    ctx.bezierCurveTo(-w * 0.48, h * 0.34, -w * 0.55, -h * 0.2, 0, -h / 2);
    ctx.closePath();
  } else {
    ctx.moveTo(0, -h / 2);
    ctx.bezierCurveTo(w * 0.45, -h * 0.48, w * 0.56, -h * 0.1, w * 0.45, h * 0.26);
    ctx.bezierCurveTo(w * 0.34, h * 0.5, -w * 0.34, h * 0.5, -w * 0.45, h * 0.26);
    ctx.bezierCurveTo(-w * 0.56, -h * 0.1, -w * 0.45, -h * 0.48, 0, -h / 2);
    ctx.closePath();
  }
}

function drawGloss(ctx, w, h, strength, fingerName) {
  if (strength <= 0.05) return;

  const xShift = fingerName === 'thumb' ? -w * 0.02 : -w * 0.14;
  ctx.save();
  ctx.translate(xShift, -h * 0.08);
  ctx.rotate(-0.18);

  const gloss = ctx.createLinearGradient(-w * 0.1, -h * 0.35, w * 0.18, h * 0.34);
  gloss.addColorStop(0, 'rgba(255,255,255,0)');
  gloss.addColorStop(0.22, `rgba(255,255,255,${0.38 * strength})`);
  gloss.addColorStop(0.52, `rgba(255,255,255,${0.12 * strength})`);
  gloss.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(2.5, w * 0.105), Math.max(8, h * 0.42), 0, 0, Math.PI * 2);
  ctx.fillStyle = gloss;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(w * 0.16, -h * 0.22, Math.max(1.3, w * 0.045), Math.max(4, h * 0.16), 0.08, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${0.28 * strength})`;
  ctx.fill();
  ctx.restore();
}

function drawFrench(ctx, w, h, shape) {
  ctx.save();
  makeNailPath(ctx, w, h, shape);
  ctx.clip();

  ctx.beginPath();
  ctx.ellipse(0, -h * 0.39, w * 0.52, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, -h * 0.29, w * 0.44, h * 0.1, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.36)';
  ctx.lineWidth = Math.max(0.6, w * 0.025);
  ctx.stroke();
  ctx.restore();
}

function drawGlitter(ctx, w, h) {
  GLITTER_POINTS.forEach((dot) => {
    const x = dot.x * w * 0.72;
    const y = dot.y * h * 0.72;
    ctx.beginPath();
    ctx.arc(x, y, dot.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${dot.a})`;
    ctx.fill();
  });
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawHeart(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.4);
  ctx.bezierCurveTo(-size, -size * 0.25, -size * 0.55, -size, 0, -size * 0.4);
  ctx.bezierCurveTo(size * 0.55, -size, size, -size * 0.25, 0, size * 0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.restore();
}

function point(landmark, width, height) {
  return { x: landmark.x * width, y: landmark.y * height, z: landmark.z || 0 };
}

function smoothLandmarks(previous, current, alpha = 0.58) {
  if (!previous) return current.map((item) => ({ ...item }));
  return current.map((item, index) => ({
    x: previous[index].x * (1 - alpha) + item.x * alpha,
    y: previous[index].y * (1 - alpha) + item.y * alpha,
    z: (previous[index].z || 0) * (1 - alpha) + (item.z || 0) * alpha
  }));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(vector) {
  const len = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / len, y: vector.y / len };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = parseInt(normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')}`;
}

function lighten(hex, amount) {
  const rgb = hexToRgb(hex);
  return rgbToHex({ r: rgb.r + (255 - rgb.r) * amount, g: rgb.g + (255 - rgb.g) * amount, b: rgb.b + (255 - rgb.b) * amount });
}

function darken(hex, amount) {
  const rgb = hexToRgb(hex);
  return rgbToHex({ r: rgb.r * (1 - amount), g: rgb.g * (1 - amount), b: rgb.b * (1 - amount) });
}

function pseudoRandom(seed) {
  const x = Math.sin(seed * 999.17) * 10000;
  return x - Math.floor(x);
}

createRoot(document.getElementById('root')).render(<App />);
