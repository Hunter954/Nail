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
  // calibragem mais realista: a unha fica presa entre o DIP e a ponta do dedo.
  // widthRatio usa a largura estimada do dedo; lengthRatio usa a falange distal real.
  { name: 'thumb', label: 'Polegar', tip: 4, dip: 3, pip: 2, mcp: 1, widthRatio: 0.66, lengthRatio: 0.72, forward: 0.03, base: 0.42, min: 0.11, max: 0.31 },
  { name: 'index', label: 'Indicador', tip: 8, dip: 7, pip: 6, mcp: 5, widthRatio: 0.52, lengthRatio: 0.68, forward: 0.025, base: 0.40, min: 0.10, max: 0.29 },
  { name: 'middle', label: 'Médio', tip: 12, dip: 11, pip: 10, mcp: 9, widthRatio: 0.54, lengthRatio: 0.69, forward: 0.025, base: 0.40, min: 0.10, max: 0.30 },
  { name: 'ring', label: 'Anelar', tip: 16, dip: 15, pip: 14, mcp: 13, widthRatio: 0.51, lengthRatio: 0.67, forward: 0.025, base: 0.40, min: 0.095, max: 0.28 },
  { name: 'pinky', label: 'Mindinho', tip: 20, dip: 19, pip: 18, mcp: 17, widthRatio: 0.46, lengthRatio: 0.62, forward: 0.02, base: 0.39, min: 0.08, max: 0.24 }
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
  const settingsRef = useRef({ color: COLORS[1].value, shape: 'oval', design: 'solid', scale: 0.92, fit: 0.88, gloss: 0.78, depth: 1.05 });

  const [status, setStatus] = useState('Carregando IA da câmera...');
  const [cameraOn, setCameraOn] = useState(false);
  const [selectedColor, setSelectedColor] = useState(COLORS[1]);
  const [shape, setShape] = useState('oval');
  const [design, setDesign] = useState('solid');
  const [scale, setScale] = useState(0.92);
  const [fit, setFit] = useState(0.88);
  const [gloss, setGloss] = useState(0.78);
  const [depth, setDepth] = useState(1.05);
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

    const distalAxis = normalize({ x: tip.x - dip.x, y: tip.y - dip.y });
    const longAxis = normalize({ x: tip.x - pip.x, y: tip.y - pip.y });
    const axis = normalize({ x: distalAxis.x * 0.78 + longAxis.x * 0.22, y: distalAxis.y * 0.78 + longAxis.y * 0.22 });
    const side = { x: -axis.y, y: axis.x };

    const distalLen = Math.max(distance(tip, dip), palmSize * 0.095);
    const midLen = Math.max(distance(dip, pip), palmSize * 0.1);
    const proximalLen = Math.max(distance(pip, mcp), palmSize * 0.1);
    const fingerLen = Math.max(distance(tip, mcp), palmSize * 0.22);

    // Width estimate: blend distal and proximal info so the base doesn't get unnaturally thin.
    const widthFromDistal = midLen * 0.48;
    const widthFromProximal = proximalLen * 0.34;
    const widthFromPalm = palmSize * finger.widthRatio * 0.20;
    const rawFingerWidth = widthFromDistal * 0.46 + widthFromProximal * 0.22 + widthFromPalm * 0.32;

    const nailLength = clamp(
      distalLen * finger.lengthRatio * settings.scale,
      palmSize * finger.min,
      palmSize * finger.max
    );

    const bodyWidth = clamp(
      rawFingerWidth * settings.fit,
      nailLength * 0.44,
      nailLength * 0.76
    );

    const profile = getNailProfile(finger.name, settings.shape, bodyWidth, nailLength, settings.fit);

    // Anchor the nail by the cuticle instead of the center. This keeps the base sitting inside the finger better.
    const cuticleAnchor = {
      x: tip.x - axis.x * nailLength * 0.54 + axis.x * nailLength * finger.forward,
      y: tip.y - axis.y * nailLength * 0.54 + axis.y * nailLength * finger.forward
    };

    let center = {
      x: cuticleAnchor.x - axis.x * (nailLength * 0.04),
      y: cuticleAnchor.y - axis.y * (nailLength * 0.04)
    };

    const zTip = landmarks[finger.tip]?.z || 0;
    const zDip = landmarks[finger.dip]?.z || 0;
    const zPip = landmarks[finger.pip]?.z || 0;
    const tilt = clamp((zDip - zTip) * 8 + (zPip - zDip) * 2.5, -0.42, 0.42);

    // Thumb needs much stronger perspective correction because it often points sideways.
    const thumbYaw = finger.name === 'thumb' ? clamp(Math.abs(axis.x) * 1.08 + Math.abs(tilt) * 0.8, 0, 1) : 0;
    const widthPerspective = finger.name === 'thumb'
      ? clamp(1 - thumbYaw * 0.58, 0.46, 1.02)
      : clamp(1 - Math.abs(tilt) * 0.12, 0.84, 1.04);
    const heightPerspective = finger.name === 'thumb'
      ? clamp(1 - Math.abs(tilt) * 0.18 + thumbYaw * 0.06, 0.82, 1.08)
      : clamp(1 - Math.abs(tilt) * 0.34, 0.84, 1.04);
    const shear = finger.name === 'thumb'
      ? -Math.sign(axis.x || 1) * thumbYaw * 0.48 + tilt * 0.10
      : tilt * 0.13;
    const rotationBoost = finger.name === 'thumb' ? Math.sign(axis.x || 1) * thumbYaw * 0.25 : 0;

    if (finger.name === 'thumb') {
      center.x += side.x * profile.baseW * 0.10;
      center.y += side.y * profile.baseW * 0.10;
    } else {
      center.x += side.x * shear * profile.baseW * 0.04;
      center.y += side.y * shear * profile.baseW * 0.04;
    }

    const angle = Math.atan2(axis.x, -axis.y) + rotationBoost;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.transform(widthPerspective, 0, shear, heightPerspective, 0, 0);
    drawRealisticNail(ctx, profile, settings.color, settings.design, settings.gloss, settings.depth, finger.name);
    ctx.restore();
  });
}

function getNailProfile(fingerName, shape, bodyWidth, length, fit) {
  const fitBonus = clamp((fit - 1) * 0.18, -0.04, 0.08);
  const thumbBoost = fingerName === 'thumb' ? 1.04 : 1;
  const maxBase = length * (fingerName === 'thumb' ? 0.92 : 0.88);

  let baseRatio = 1.02 + fitBonus;
  let shoulderRatio = 1.06 + fitBonus * 0.30;
  let tipRatio = 0.72;

  if (shape === 'square') {
    baseRatio = 1.00 + fitBonus;
    shoulderRatio = 1.05 + fitBonus * 0.25;
    tipRatio = 0.92;
  } else if (shape === 'almond') {
    baseRatio = 1.03 + fitBonus;
    shoulderRatio = 1.03 + fitBonus * 0.22;
    tipRatio = 0.52;
  } else if (shape === 'stiletto') {
    baseRatio = 1.04 + fitBonus;
    shoulderRatio = 0.92 + fitBonus * 0.18;
    tipRatio = 0.20;
  }

  const baseW = clamp(bodyWidth * baseRatio * thumbBoost, length * 0.44, maxBase);
  const shoulderW = clamp(bodyWidth * shoulderRatio, length * 0.42, baseW * 1.10);
  const tipW = clamp(baseW * tipRatio, length * 0.12, shape === 'square' ? baseW * 0.98 : baseW * 0.88);

  return { shape, length, baseW, shoulderW, tipW };
}

function drawRealisticNail(ctx, profile, color, design, gloss, depth, fingerName) {
  const { length: h, baseW, shoulderW, tipW } = profile;
  const maxW = Math.max(baseW, shoulderW, tipW);
  const depthStrength = clamp(depth, 0, 1.35);
  const glossStrength = clamp(gloss, 0, 1.25);

  ctx.save();

  // Contact shadow under the cuticle/base.
  ctx.save();
  ctx.globalAlpha = 0.20 + depthStrength * 0.08;
  const baseShadow = ctx.createRadialGradient(0, h * 0.34, 1, 0, h * 0.35, baseW * 0.9);
  baseShadow.addColorStop(0, 'rgba(0,0,0,0.42)');
  baseShadow.addColorStop(0.55, 'rgba(0,0,0,0.12)');
  baseShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = baseShadow;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.35, baseW * 0.54, h * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  makeNailPath(ctx, profile);
  ctx.clip();

  // Primary enamel color.
  const vertical = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  vertical.addColorStop(0, lighten(color, 0.22));
  vertical.addColorStop(0.14, lighten(color, 0.08));
  vertical.addColorStop(0.58, color);
  vertical.addColorStop(0.84, darken(color, 0.08));
  vertical.addColorStop(1, darken(color, 0.2));
  ctx.globalAlpha = 0.90;
  ctx.fillStyle = vertical;
  ctx.fillRect(-maxW, -h / 2, maxW * 2, h);
  ctx.globalAlpha = 1;

  // Curvature from side to side.
  const barrel = ctx.createLinearGradient(-baseW / 2, 0, baseW / 2, 0);
  barrel.addColorStop(0, `rgba(0,0,0,${0.26 * depthStrength})`);
  barrel.addColorStop(0.17, `rgba(0,0,0,${0.08 * depthStrength})`);
  barrel.addColorStop(0.50, `rgba(255,255,255,${0.20 * depthStrength})`);
  barrel.addColorStop(0.73, `rgba(255,255,255,${0.07 * depthStrength})`);
  barrel.addColorStop(1, `rgba(0,0,0,${0.28 * depthStrength})`);
  ctx.fillStyle = barrel;
  ctx.fillRect(-maxW, -h / 2, maxW * 2, h);

  // Dome highlight.
  const gelGlow = ctx.createRadialGradient(-shoulderW * 0.12, -h * 0.24, 1, -shoulderW * 0.08, -h * 0.18, h * 0.72);
  gelGlow.addColorStop(0, `rgba(255,255,255,${0.32 * glossStrength})`);
  gelGlow.addColorStop(0.44, `rgba(255,255,255,${0.09 * glossStrength})`);
  gelGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gelGlow;
  ctx.fillRect(-maxW, -h / 2, maxW * 2, h);

  // Blend the base into the skin a bit more.
  const cuticleFade = ctx.createLinearGradient(0, h * 0.16, 0, h / 2);
  cuticleFade.addColorStop(0, 'rgba(255,255,255,0)');
  cuticleFade.addColorStop(0.36, 'rgba(255,255,255,0.035)');
  cuticleFade.addColorStop(1, 'rgba(255,255,255,0.10)');
  ctx.fillStyle = cuticleFade;
  ctx.fillRect(-maxW, h * 0.12, maxW * 2, h * 0.42);

  drawSpecularStreak(ctx, profile, glossStrength, fingerName);

  if (design === 'french') drawFrench(ctx, profile);
  if (design === 'glitter') drawGlitter(ctx, baseW, h);
  if (design === 'heart') drawHeart(ctx, 0, -h * 0.03, Math.max(4, shoulderW * 0.17));

  ctx.restore();

  makeNailPath(ctx, profile);
  ctx.lineWidth = Math.max(0.55, baseW * 0.016);
  ctx.strokeStyle = `rgba(255,255,255,${0.10 + glossStrength * 0.10})`;
  ctx.stroke();

  makeNailPath(ctx, {
    ...profile,
    baseW: baseW * 0.96,
    shoulderW: shoulderW * 0.97,
    tipW: tipW * 0.96,
    length: h * 0.978
  });
  ctx.lineWidth = Math.max(0.45, baseW * 0.011);
  ctx.strokeStyle = `rgba(0,0,0,${0.12 * depthStrength})`;
  ctx.stroke();

  // Subtle cuticle arc.
  ctx.beginPath();
  ctx.ellipse(0, h * 0.385, baseW * 0.30, h * 0.052, 0, Math.PI * 0.07, Math.PI * 0.93);
  ctx.strokeStyle = `rgba(255,255,255,${0.14 * glossStrength})`;
  ctx.lineWidth = Math.max(0.35, baseW * 0.008);
  ctx.stroke();

  // A touch of underside shadow under the free edge for 3D depth.
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.43, Math.max(2, tipW * 0.34), Math.max(1.2, h * 0.028), 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${0.10 * depthStrength})`;
  ctx.fill();

  ctx.restore();
}

function drawSpecularStreak(ctx, profile, strength, fingerName) {
  if (strength <= 0.05) return;
  const { length: h, shoulderW, baseW } = profile;
  const xShift = fingerName === 'thumb' ? -shoulderW * 0.03 : -shoulderW * 0.13;

  ctx.save();
  ctx.translate(xShift, -h * 0.11);
  ctx.rotate(-0.18);

  const gloss = ctx.createLinearGradient(-shoulderW * 0.08, -h * 0.36, shoulderW * 0.16, h * 0.32);
  gloss.addColorStop(0, 'rgba(255,255,255,0)');
  gloss.addColorStop(0.20, `rgba(255,255,255,${0.46 * strength})`);
  gloss.addColorStop(0.45, `rgba(255,255,255,${0.16 * strength})`);
  gloss.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(2.1, shoulderW * 0.10), Math.max(7, h * 0.40), 0, 0, Math.PI * 2);
  ctx.fillStyle = gloss;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(baseW * 0.09, -h * 0.25, Math.max(1.1, shoulderW * 0.045), Math.max(3.5, h * 0.15), 0.08, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${0.32 * strength})`;
  ctx.fill();
  ctx.restore();
}

function makeNailPath(ctx, profile) {
  const { shape, length: h, baseW, shoulderW, tipW } = profile;
  const baseHalf = baseW / 2;
  const shoulderHalf = shoulderW / 2;
  const tipHalf = Math.max(1.6, tipW / 2);

  ctx.beginPath();

  if (shape === 'square') {
    ctx.moveTo(-tipHalf, -h * 0.48);
    ctx.quadraticCurveTo(0, -h * 0.56, tipHalf, -h * 0.48);
    ctx.lineTo(shoulderHalf, h * 0.12);
    ctx.quadraticCurveTo(baseHalf * 1.03, h * 0.28, baseHalf * 0.76, h * 0.47);
    ctx.quadraticCurveTo(baseHalf * 0.28, h * 0.54, 0, h * 0.5);
    ctx.quadraticCurveTo(-baseHalf * 0.28, h * 0.54, -baseHalf * 0.76, h * 0.47);
    ctx.quadraticCurveTo(-baseHalf * 1.03, h * 0.28, -shoulderHalf, h * 0.12);
    ctx.closePath();
    return;
  }

  if (shape === 'stiletto') {
    ctx.moveTo(0, -h * 0.52);
    ctx.bezierCurveTo(tipHalf * 1.6, -h * 0.34, shoulderHalf * 0.98, -h * 0.08, shoulderHalf, h * 0.14);
    ctx.bezierCurveTo(baseHalf * 0.97, h * 0.32, baseHalf * 0.58, h * 0.49, 0, h * 0.5);
    ctx.bezierCurveTo(-baseHalf * 0.58, h * 0.49, -baseHalf * 0.97, h * 0.32, -shoulderHalf, h * 0.14);
    ctx.bezierCurveTo(-shoulderHalf * 0.98, -h * 0.08, -tipHalf * 1.6, -h * 0.34, 0, -h * 0.52);
    ctx.closePath();
    return;
  }

  if (shape === 'almond') {
    ctx.moveTo(0, -h * 0.50);
    ctx.bezierCurveTo(tipHalf * 1.45, -h * 0.40, shoulderHalf * 1.04, -h * 0.04, shoulderHalf * 0.98, h * 0.18);
    ctx.bezierCurveTo(baseHalf * 0.95, h * 0.35, baseHalf * 0.56, h * 0.49, 0, h * 0.5);
    ctx.bezierCurveTo(-baseHalf * 0.56, h * 0.49, -baseHalf * 0.95, h * 0.35, -shoulderHalf * 0.98, h * 0.18);
    ctx.bezierCurveTo(-shoulderHalf * 1.04, -h * 0.04, -tipHalf * 1.45, -h * 0.40, 0, -h * 0.50);
    ctx.closePath();
    return;
  }

  // oval
  ctx.moveTo(0, -h * 0.49);
  ctx.bezierCurveTo(tipHalf * 1.55, -h * 0.46, shoulderHalf * 1.08, -h * 0.03, shoulderHalf, h * 0.17);
  ctx.bezierCurveTo(baseHalf * 0.96, h * 0.35, baseHalf * 0.54, h * 0.50, 0, h * 0.5);
  ctx.bezierCurveTo(-baseHalf * 0.54, h * 0.50, -baseHalf * 0.96, h * 0.35, -shoulderHalf, h * 0.17);
  ctx.bezierCurveTo(-shoulderHalf * 1.08, -h * 0.03, -tipHalf * 1.55, -h * 0.46, 0, -h * 0.49);
  ctx.closePath();
}

function drawFrench(ctx, profile) {
  const { length: h, shoulderW, tipW } = profile;
  ctx.save();
  makeNailPath(ctx, profile);
  ctx.clip();

  ctx.beginPath();
  ctx.ellipse(0, -h * 0.39, Math.max(tipW * 0.65, shoulderW * 0.42), h * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, -h * 0.29, Math.max(tipW * 0.52, shoulderW * 0.34), h * 0.10, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(0.6, shoulderW * 0.025);
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
