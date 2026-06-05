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
  { name: 'thumb', label: 'Polegar', tip: 4, dip: 3, pip: 2, mcp: 1, widthRatio: 0.72, lengthRatio: 0.82, forward: 0.05, base: 0.42, min: 0.13, max: 0.36 },
  { name: 'index', label: 'Indicador', tip: 8, dip: 7, pip: 6, mcp: 5, widthRatio: 0.58, lengthRatio: 0.78, forward: 0.06, base: 0.40, min: 0.12, max: 0.34 },
  { name: 'middle', label: 'Médio', tip: 12, dip: 11, pip: 10, mcp: 9, widthRatio: 0.60, lengthRatio: 0.80, forward: 0.06, base: 0.40, min: 0.12, max: 0.35 },
  { name: 'ring', label: 'Anelar', tip: 16, dip: 15, pip: 14, mcp: 13, widthRatio: 0.57, lengthRatio: 0.77, forward: 0.06, base: 0.40, min: 0.11, max: 0.33 },
  { name: 'pinky', label: 'Mindinho', tip: 20, dip: 19, pip: 18, mcp: 17, widthRatio: 0.52, lengthRatio: 0.72, forward: 0.05, base: 0.39, min: 0.095, max: 0.29 }
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
  const handednessMirror = 1;

  FINGERS.forEach((finger) => {
    const tip = points[finger.tip];
    const dip = points[finger.dip];
    const pip = points[finger.pip];
    const mcp = points[finger.mcp];

    // Direção real da ponta do dedo. Mistura DIP->TIP com PIP->TIP para evitar unha torta quando o landmark treme.
    const distalAxis = normalize({ x: tip.x - dip.x, y: tip.y - dip.y });
    const longAxis = normalize({ x: tip.x - pip.x, y: tip.y - pip.y });
    const axis = normalize({ x: distalAxis.x * 0.72 + longAxis.x * 0.28, y: distalAxis.y * 0.72 + longAxis.y * 0.28 });
    const side = { x: -axis.y * handednessMirror, y: axis.x * handednessMirror };

    const distalLen = Math.max(distance(tip, dip), palmSize * 0.095);
    const midLen = Math.max(distance(dip, pip), palmSize * 0.1);
    const fingerLen = Math.max(distance(tip, mcp), palmSize * 0.22);

    // Largura estimada pelo tamanho do dedo e palm scale. Isso encaixa melhor que usar só palmSize.
    const widthFromJoints = Math.min(midLen * 0.54, fingerLen * 0.14);
    const widthFromPalm = palmSize * finger.widthRatio * 0.22;
    const rawFingerWidth = (widthFromJoints * 0.64 + widthFromPalm * 0.36);

    const nailLength = clamp(
      distalLen * finger.lengthRatio * settings.scale,
      palmSize * finger.min,
      palmSize * finger.max
    );
    const nailWidth = clamp(
      rawFingerWidth * settings.fit,
      nailLength * 0.42,
      nailLength * 0.72
    );

    // Posição: a ponta da unha passa só um pouco da ponta do dedo; a base entra na cutícula.
    const center = {
      x: tip.x + axis.x * nailLength * finger.forward - axis.x * nailLength * finger.base,
      y: tip.y + axis.y * nailLength * finger.forward - axis.y * nailLength * finger.base
    };

    // Ajuste do polegar: polegar tem perspectiva bem diferente e costuma ficar rotacionado.
    if (finger.name === 'thumb') {
      center.x += side.x * nailWidth * 0.08;
      center.y += side.y * nailWidth * 0.08;
    }

    const angle = Math.atan2(axis.x, -axis.y);
    const zTip = landmarks[finger.tip]?.z || 0;
    const zDip = landmarks[finger.dip]?.z || 0;
    const zPip = landmarks[finger.pip]?.z || 0;
    const tilt = clamp((zDip - zTip) * 8 + (zPip - zDip) * 3, -0.38, 0.38);
    const foreshorten = clamp(1 - Math.abs(tilt) * 0.42, 0.82, 1.04);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.transform(1 + Math.abs(tilt) * 0.06, tilt * 0.12, 0, foreshorten, 0, 0);
    drawRealisticNail(ctx, nailWidth, nailLength, settings.shape, settings.color, settings.design, settings.gloss, settings.depth, finger.name);
    ctx.restore();
  });
}

function drawRealisticNail(ctx, w, h, shape, color, design, gloss, depth, fingerName) {
  const depthStrength = clamp(depth, 0, 1.35);
  const glossStrength = clamp(gloss, 0, 1.25);

  ctx.save();

  // Sombra embaixo da base, pequena e macia: prende a unha no dedo sem parecer adesivo flutuante.
  ctx.save();
  ctx.globalAlpha = 0.22 + depthStrength * 0.08;
  const baseShadow = ctx.createRadialGradient(0, h * 0.36, 1, 0, h * 0.38, w * 0.75);
  baseShadow.addColorStop(0, 'rgba(0,0,0,0.38)');
  baseShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = baseShadow;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.36, w * 0.55, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  makeNailPath(ctx, w, h, shape);
  ctx.clip();

  // Cor principal com variação vertical de esmalte real.
  const vertical = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  vertical.addColorStop(0, lighten(color, 0.22));
  vertical.addColorStop(0.16, lighten(color, 0.08));
  vertical.addColorStop(0.55, color);
  vertical.addColorStop(0.82, darken(color, 0.08));
  vertical.addColorStop(1, darken(color, 0.2));
  ctx.globalAlpha = 0.965;
  ctx.fillStyle = vertical;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.globalAlpha = 1;

  // Curvatura transversal: laterais mais escuras, centro mais claro.
  const barrel = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  barrel.addColorStop(0, `rgba(0,0,0,${0.24 * depthStrength})`);
  barrel.addColorStop(0.18, `rgba(0,0,0,${0.06 * depthStrength})`);
  barrel.addColorStop(0.48, `rgba(255,255,255,${0.18 * depthStrength})`);
  barrel.addColorStop(0.64, `rgba(255,255,255,${0.10 * depthStrength})`);
  barrel.addColorStop(1, `rgba(0,0,0,${0.26 * depthStrength})`);
  ctx.fillStyle = barrel;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  // Luz ambiente e hotspot superior, para parecer esmalte gel.
  const gelGlow = ctx.createRadialGradient(-w * 0.18, -h * 0.24, 1, -w * 0.18, -h * 0.22, h * 0.68);
  gelGlow.addColorStop(0, `rgba(255,255,255,${0.30 * glossStrength})`);
  gelGlow.addColorStop(0.42, `rgba(255,255,255,${0.08 * glossStrength})`);
  gelGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gelGlow;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  // Base/cutícula com fade transparente, deixa menos aparência de figurinha colada.
  const cuticleFade = ctx.createLinearGradient(0, h * 0.22, 0, h / 2);
  cuticleFade.addColorStop(0, 'rgba(255,255,255,0)');
  cuticleFade.addColorStop(1, 'rgba(255,255,255,0.18)');
  ctx.fillStyle = cuticleFade;
  ctx.fillRect(-w / 2, h * 0.18, w, h * 0.36);

  drawSpecularStreak(ctx, w, h, glossStrength, fingerName);

  if (design === 'french') drawFrench(ctx, w, h, shape);
  if (design === 'glitter') drawGlitter(ctx, w, h);
  if (design === 'heart') drawHeart(ctx, 0, -h * 0.03, Math.max(4, w * 0.17));

  ctx.restore();

  // Contorno fino, com menos branco. Antes a borda clara denunciava o recorte.
  makeNailPath(ctx, w, h, shape);
  ctx.lineWidth = Math.max(0.55, w * 0.018);
  ctx.strokeStyle = `rgba(255,255,255,${0.12 + glossStrength * 0.12})`;
  ctx.stroke();

  makeNailPath(ctx, w * 0.96, h * 0.975, shape);
  ctx.lineWidth = Math.max(0.45, w * 0.014);
  ctx.strokeStyle = `rgba(0,0,0,${0.10 * depthStrength})`;
  ctx.stroke();

  // Linha sutil de cutícula na base.
  ctx.beginPath();
  ctx.ellipse(0, h * 0.39, w * 0.31, h * 0.055, 0, Math.PI * 0.08, Math.PI * 0.92);
  ctx.strokeStyle = `rgba(255,255,255,${0.16 * glossStrength})`;
  ctx.lineWidth = Math.max(0.35, w * 0.01);
  ctx.stroke();

  ctx.restore();
}

function drawSpecularStreak(ctx, w, h, strength, fingerName) {
  if (strength <= 0.05) return;

  const xShift = fingerName === 'thumb' ? -w * 0.03 : -w * 0.13;
  ctx.save();
  ctx.translate(xShift, -h * 0.11);
  ctx.rotate(-0.18);

  const gloss = ctx.createLinearGradient(-w * 0.08, -h * 0.36, w * 0.16, h * 0.32);
  gloss.addColorStop(0, 'rgba(255,255,255,0)');
  gloss.addColorStop(0.22, `rgba(255,255,255,${0.42 * strength})`);
  gloss.addColorStop(0.46, `rgba(255,255,255,${0.15 * strength})`);
  gloss.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(2.1, w * 0.085), Math.max(7, h * 0.39), 0, 0, Math.PI * 2);
  ctx.fillStyle = gloss;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(w * 0.15, -h * 0.24, Math.max(1.2, w * 0.04), Math.max(3.5, h * 0.14), 0.08, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${0.32 * strength})`;
  ctx.fill();
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
