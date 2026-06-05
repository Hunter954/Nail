# Nail AR Studio

MVP de provador virtual de unhas em tempo real para manicures e salões.

O projeto roda direto no navegador do celular usando câmera + MediaPipe Hand Landmarker. Ele detecta landmarks da mão e desenha uma simulação de unha por cima dos dedos em tempo real.

## Funções incluídas

- Câmera em tempo real no celular
- Detecção de mão com MediaPipe
- Simulação de cores de esmalte
- Formatos: oval, quadrada, amendoada e stiletto
- Desenhos: lisa, francesinha, glitter e coração
- Controle de tamanho
- Captura de prévia em imagem PNG
- Botão de agendamento pelo WhatsApp
- PWA simples para adicionar à tela inicial
- Configuração pronta para Railway

## Como rodar localmente

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal.

> Observação: no celular, câmera geralmente exige HTTPS. Localhost funciona no computador, mas em produção use Railway/Vercel/Netlify com HTTPS.

## Onde trocar o WhatsApp

Abra `src/main.jsx` e altere:

```js
const WHATSAPP_NUMBER = '5545999999999';
```

Use o número com DDI e DDD, sem espaços e sem símbolos.

Exemplo para Foz do Iguaçu:

```js
const WHATSAPP_NUMBER = '5545991234567';
```

## Como subir no GitHub

```bash
git init
git add .
git commit -m "MVP Nail AR Studio"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/nail-ar-studio.git
git push -u origin main
```

## Como subir no Railway

1. Crie um novo projeto no Railway.
2. Escolha **Deploy from GitHub repo**.
3. Selecione o repositório `nail-ar-studio`.
4. O Railway vai detectar Node/Vite pelo `package.json`.
5. O arquivo `railway.json` já define o start command:

```bash
npm run preview
```

## Build manual

```bash
npm run build
npm run preview
```

## Limitação importante do MVP

Este MVP não detecta o contorno real da unha com precisão clínica. Ele usa os pontos da mão/dedos para posicionar unhas artificiais por cima. Para uma versão premium, o próximo passo é criar uma segmentação específica de unhas ou um ajuste manual fino por dedo.

## Próximas melhorias recomendadas

- Painel admin para cadastrar cores e artes por manicure
- Upload de desenhos personalizados
- Catálogo por salão
- Link público individual por manicure
- Ajuste manual de posição da unha
- Segmentação real da unha com IA treinada
- Login e agendamento integrado
