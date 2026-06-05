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
  { name: 'thumb', tip: 4, dip: 3, pip: 2, width: 0.9 },
  { name: 'index', tip: 8, dip: 7, pip: 6, width: 0.72 },
  { name: 'middle', tip: 12, dip: 11, pip: 10, width: 0.74 },
  { name: 'ring', tip: 16, dip: 15, pip: 14, width: 0.7 },
  { name: 'pinky', tip: 20, dip: 19, pip: 18, width: 0.62 }
];

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const detectorRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  const [status, setStatus] = useState('Carregando IA da câmera...');
  const [cameraOn, setCameraOn] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[1]);
  const [shape, setShape] = useState('oval');
  const [design, setDesign] = useState('solid');
  const [scale, setScale] = useState(1);
  const [facingMode, setFacingMode] = useState('environment');
  const [photoUrl, setPhotoUrl] = useState(null);

  const selectedShape = useMemo(() => SHAPES.find((item) => item.id === shape), [shape]);
  const selectedDesign = useMemo(() => DESIGNS.find((item) => item.id === design), [design]);

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
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55
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
      setStatus('Abrindo câmera...');

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
      setStatus('Coloque a mão aberta na frente da câmera.');
      renderLoop();
    } catch (error) {
      console.error(error);
      setStatus('Permita o acesso à câmera para usar o provador. No celular precisa estar em HTTPS.');
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
        setStatus('Mão detectada. Escolha cor, formato e desenho.');
        result.landmarks.forEach((landmarks) => {
          drawNails(ctx, landmarks, width, height, selectedColor.value, shape, design, scale);
        });
      } else {
        setStatus('Aproxime a mão da câmera e deixe os dedos visíveis.');
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

        <div className="panel">
          <h2>Tamanho</h2>
          <input type="range" min="0.75" max="1.35" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} />
          <small>{Math.round(scale * 100)}%</small>
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

function drawNails(ctx, landmarks, width, height, color, shape, design, scale) {
  FINGERS.forEach((finger) => {
    const tip = point(landmarks[finger.tip], width, height);
    const dip = point(landmarks[finger.dip], width, height);
    const pip = point(landmarks[finger.pip], width, height);

    const vx = tip.x - dip.x;
    const vy = tip.y - dip.y;
    const angle = Math.atan2(vy, vx) + Math.PI / 2;
    const lengthBase = distance(pip, tip);
    const nailLength = clamp(lengthBase * 0.54 * scale, 22, 76);
    const nailWidth = clamp(lengthBase * 0.28 * finger.width * scale, 13, 35);

    const center = {
      x: tip.x + vx * 0.18,
      y: tip.y + vy * 0.18
    };

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    drawNailShape(ctx, nailWidth, nailLength, shape, color, design);
    ctx.restore();
  });
}

function drawNailShape(ctx, w, h, shape, color, design) {
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  const gradient = ctx.createLinearGradient(-w, -h, w, h);
  gradient.addColorStop(0, lighten(color, 0.34));
  gradient.addColorStop(0.42, color);
  gradient.addColorStop(1, darken(color, 0.24));

  ctx.beginPath();

  if (shape === 'square') {
    roundedRect(ctx, -w / 2, -h / 2, w, h, Math.max(5, w * 0.22));
  } else if (shape === 'stiletto') {
    ctx.moveTo(0, -h / 2);
    ctx.bezierCurveTo(w * 0.55, -h * 0.22, w * 0.44, h * 0.36, w * 0.12, h / 2);
    ctx.bezierCurveTo(-w * 0.12, h / 2, -w * 0.44, h * 0.36, -w * 0.55, -h * 0.22);
    ctx.closePath();
  } else if (shape === 'almond') {
    ctx.moveTo(0, -h / 2);
    ctx.bezierCurveTo(w * 0.62, -h * 0.18, w * 0.46, h * 0.42, 0, h / 2);
    ctx.bezierCurveTo(-w * 0.46, h * 0.42, -w * 0.62, -h * 0.18, 0, -h / 2);
  } else {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  }

  ctx.fillStyle = gradient;
  ctx.globalAlpha = 0.88;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-w * 0.15, -h * 0.18, Math.max(2, w * 0.08), Math.max(8, h * 0.26), -0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.fill();

  if (design === 'french') {
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.32, w * 0.48, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }

  if (design === 'glitter') {
    for (let i = 0; i < 14; i += 1) {
      const x = (Math.random() - 0.5) * w * 0.75;
      const y = (Math.random() - 0.5) * h * 0.75;
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 1.7 + 0.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
    }
  }

  if (design === 'heart') {
    drawHeart(ctx, 0, -h * 0.05, Math.max(4, w * 0.16));
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHeart(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.4);
  ctx.bezierCurveTo(-size, -size * 0.25, -size * 0.55, -size, 0, -size * 0.4);
  ctx.bezierCurveTo(size * 0.55, -size, size, -size * 0.25, 0, size * 0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fill();
  ctx.restore();
}

function point(landmark, width, height) {
  return { x: landmark.x * width, y: landmark.y * height };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

createRoot(document.getElementById('root')).render(<App />);
