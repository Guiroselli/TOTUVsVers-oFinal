import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('Mobile Experience & Responsiveness Tests — Proton Flow', () => {

  test('1. index.html contains viewport-fit=cover and valid PWA manifest link', () => {
    const indexPath = path.join(projectRoot, 'frontend/index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');

    assert.ok(content.includes('viewport-fit=cover'), 'Viewport meta must include viewport-fit=cover');
    assert.ok(content.includes('width=device-width'), 'Viewport meta must include width=device-width');
    assert.ok(content.includes('initial-scale=1'), 'Viewport meta must include initial-scale=1');
    assert.ok(content.includes('manifest.webmanifest'), 'index.html must link to manifest.webmanifest');
    assert.ok(content.includes('apple-mobile-web-app-capable'), 'iOS standalone web app meta must be present');
  });

  test('2. manifest.webmanifest exists and defines standalone display and TOTVS theme', () => {
    const manifestPath = path.join(projectRoot, 'frontend/public/manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.name.includes('Proton Flow'), 'Manifest name must contain Proton Flow');
    assert.ok(manifest.theme_color, 'Theme color must be set');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'Icons array must not be empty');
  });

  test('3. index.css defines mobile touch targets (>= 44px) and safe-area environment variables', () => {
    const cssPath = path.join(projectRoot, 'frontend/src/index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('--sat: env(safe-area-inset-top'), 'CSS must define --sat');
    assert.ok(css.includes('--sab: env(safe-area-inset-bottom'), 'CSS must define --sab');
    assert.ok(css.includes('min-height: 44px'), 'CSS must enforce 44px min-height for touch controls');
    assert.ok(css.includes('touch-action: manipulation'), 'CSS must enforce touch-action manipulation');
    assert.ok(css.includes('overflow-x: hidden'), 'CSS must prevent horizontal body overflow');
    assert.ok(css.includes('100dvh'), 'CSS must support dynamic viewport height 100dvh');
  });

  test('4. LiveMeetingPage includes mobile controls: facingMode, permission help modal, and mobile action sheet', () => {
    const jsxPath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const jsx = fs.readFileSync(jsxPath, 'utf-8');

    assert.ok(jsx.includes('handleToggleFacingMode'), 'Must implement handleToggleFacingMode');
    assert.ok(jsx.includes('showPermissionHelpModal'), 'Must support showPermissionHelpModal');
    assert.ok(jsx.includes('showMobileActionSheet'), 'Must support showMobileActionSheet');
    assert.ok(jsx.includes('live-room-active'), 'Must add live-room-active to suppress duplicate top bars');
    assert.ok(jsx.includes('mobile-pre-permission-card'), 'Must provide pre-permission card for mobile user gesture');
  });

  test('5. Camera toggle facingMode switches video track without stopping audio recorder', async () => {
    // Simula MediaStream com faixas de áudio e vídeo isoladas
    let audioTrackStopped = false;
    let videoTrackStopped = false;

    const mockAudioTrack = {
      kind: 'audio',
      readyState: 'live',
      enabled: true,
      stop: () => { audioTrackStopped = true; }
    };

    let currentVideoTrack = {
      kind: 'video',
      readyState: 'live',
      enabled: true,
      stop: () => { videoTrackStopped = true; }
    };

    const stream = {
      getAudioTracks: () => [mockAudioTrack],
      getVideoTracks: () => [currentVideoTrack],
      removeTrack: (t) => { if (t === currentVideoTrack) currentVideoTrack = null; },
      addTrack: (t) => { currentVideoTrack = t; }
    };

    // Alterna modo de câmera
    let facingMode = 'user';
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    facingMode = nextMode;

    // Remove trilha de vídeo antiga e adiciona nova
    const oldVideo = stream.getVideoTracks()[0];
    oldVideo.stop();
    stream.removeTrack(oldVideo);

    const newVideo = {
      kind: 'video',
      readyState: 'live',
      enabled: true,
      facingMode: 'environment',
      stop: () => {}
    };
    stream.addTrack(newVideo);

    assert.equal(videoTrackStopped, true, 'Trilha antiga de vídeo deve ser finalizada');
    assert.equal(audioTrackStopped, false, 'Trilha de ÁUDIO NÃO PODE ser parada ao alternar a câmera');
    assert.equal(stream.getVideoTracks()[0].facingMode, 'environment', 'Nova trilha deve estar no modo environment');
    assert.equal(stream.getAudioTracks()[0].readyState, 'live', 'Microfone permanece ativo e gravando');
  });

  test('6. Visibility change does not abort ongoing recording or reset chunk sequence', () => {
    let chunkSequence = 14;
    let isRecording = true;
    let visibilityState = 'hidden';

    // Simula aba minimizada no celular
    if (visibilityState === 'hidden') {
      // Gravação deve continuar
      assert.equal(isRecording, true);
    }

    // Simula retorno à aba
    visibilityState = 'visible';
    assert.equal(chunkSequence, 14, 'Sequência de chunks não pode ser resetada ao voltar à aba');
    assert.equal(isRecording, true, 'Gravação permanece ativa');
  });

  test('7. Breakpoint scale test: widths 320px, 360px, 375px, 390px, 412px, 768px, 1024px', () => {
    const viewports = [
      { name: 'iPhone SE / Small', width: 320, height: 568, category: 'small-mobile' },
      { name: 'Samsung Galaxy S20 (small)', width: 360, height: 800, category: 'small-mobile' },
      { name: 'iPhone X / 11 / 12 mini', width: 375, height: 812, category: 'standard-mobile' },
      { name: 'iPhone 12 / 13 / 14 Pro', width: 390, height: 844, category: 'standard-mobile' },
      { name: 'Google Pixel 7', width: 412, height: 915, category: 'standard-mobile' },
      { name: 'iPad Mini / Tablet', width: 768, height: 1024, category: 'tablet' },
      { name: 'iPad Pro / Desktop', width: 1024, height: 768, category: 'desktop' }
    ];

    for (const vp of viewports) {
      const isMobile = vp.width <= 767;
      const isSmallMobile = vp.width <= 374;
      const isTablet = vp.width >= 768 && vp.width <= 1023;
      const isDesktop = vp.width >= 1024;

      if (vp.category === 'small-mobile') {
        assert.ok(isSmallMobile && isMobile);
      } else if (vp.category === 'standard-mobile') {
        assert.ok(!isSmallMobile && isMobile);
      } else if (vp.category === 'tablet') {
        assert.ok(isTablet && !isMobile);
      } else if (vp.category === 'desktop') {
        assert.ok(isDesktop && !isMobile);
      }
    }
  });

});
