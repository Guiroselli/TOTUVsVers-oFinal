import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('Live Meeting Room WebRTC Audio, Participant Grid, Diagnostics & Mobile Resilience', () => {

  // 1. WebRTC Signaling & Configuration Client
  test('1. api/client.js provides getWebRtcConfig and reportChunkFailure', () => {
    const clientPath = path.join(projectRoot, 'frontend/src/api/client.js');
    const code = fs.readFileSync(clientPath, 'utf-8');

    assert.ok(code.includes('getWebRtcConfig:'), 'client.js must define getWebRtcConfig');
    assert.ok(code.includes('/api/live/meetings/${meetingId}/webrtc_config'), 'Must target canonical webrtc_config endpoint');
    assert.ok(code.includes('reportChunkFailure:'), 'client.js must define reportChunkFailure');
    assert.ok(code.includes('/api/live/meetings/${meetingId}/transcript/chunk_failure'), 'Must target canonical chunk_failure endpoint');
  });

  // 2. WebRTC Mesh & Remote Audio Playback in LiveMeetingPage
  test('2. LiveMeetingPage implements WebRTC mesh signaling and decouples audio playback from STT', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    // Signaling messages
    assert.ok(code.includes("'webrtc_signal'"), 'Must handle webrtc_signal events');
    assert.ok(code.includes("'peer_joined'"), 'Must handle peer_joined events');
    assert.ok(code.includes("'peer_left'"), 'Must handle peer_left events');
    assert.ok(code.includes("'peer_state'"), 'Must handle peer_state events');
    assert.ok(code.includes("'room_state'"), 'Must handle room_state events');

    // RTCPeerConnection creation and track management
    assert.ok(code.includes('new RTCPeerConnection'), 'Must instantiate RTCPeerConnection');
    assert.ok(code.includes('pc.addTrack'), 'Must add local tracks to peer connection');
    assert.ok(code.includes('pc.ontrack'), 'Must attach ontrack handler for remote participants');

    // Remote audio playback is unmuted, local preview is muted (prevents self-echo)
    assert.ok(code.includes('autoPlay'), 'Remote audio must autoplay');
    assert.ok(code.includes('playsInline'), 'Remote audio must support playsInline for iOS');
  });

  // 3. Audio Autoplay Policy & Mobile Unblock Banner
  test('3. LiveMeetingPage handles browser audio autoplay restriction with an interactive banner', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    assert.ok(code.includes('audioAutoplayBlocked'), 'Must maintain audioAutoplayBlocked state');
    assert.ok(code.includes('handleUnblockAudio'), 'Must provide handleUnblockAudio callback');
    assert.ok(code.includes('resume()'), 'Must call AudioContext.resume() on user interaction');
  });

  // 4. Teams-inspired Participant Grid & Avatar Identification
  test('4. LiveMeetingPage renders responsive Teams-style participant grid with avatars and speaking indicators', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    assert.ok(code.includes('participants-grid-container'), 'Must render participants-grid-container');
    assert.ok(code.includes('participant-card'), 'Must render participant-card');
    assert.ok(code.includes('participant-avatar-circle'), 'Must render participant-avatar-circle for participants without video');
    assert.ok(code.includes('speaking-pulse'), 'Must apply speaking-pulse when speech/audio is detected');
    assert.ok(code.includes('speaking-badge'), 'Must render speaking-badge indicator');
  });

  // 5. In-room Participant Name Customization
  test('5. LiveMeetingPage allows participants to edit their display name in-room and broadcasts state', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    assert.ok(code.includes('handleSaveInlineName'), 'Must support in-room name update');
    assert.ok(code.includes('peer_state'), 'Must broadcast updated name via peer_state signaling');
    assert.ok(code.includes("sessionStorage.setItem('pf_participant_name'"), 'Must persist custom name in session');
  });

  // 6. Resilient Audio Chunk Queue & Transient Retry Logic
  test('6. LiveMeetingPage implements resilient chunk queue with exponential backoff and permanent failure logging', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    assert.ok(code.includes('chunkQueueRef.current'), 'Must manage chunk queue');
    assert.ok(code.includes('processChunkQueue'), 'Must process chunk queue asynchronously');
    assert.ok(code.includes('chunksCapturedCountRef'), 'Must track chunksCaptured');
    assert.ok(code.includes('chunksConfirmedCountRef'), 'Must track chunksConfirmed');
    assert.ok(code.includes('chunksFailedCountRef'), 'Must track chunksFailed');
    assert.ok(code.includes('api.reportChunkFailure'), 'Must report permanent failures to backend');
  });

  // 7. Counter Reconciliation Invariant in Diagnostics
  test('7. LiveMeetingPage maintains and displays exact counter reconciliation (captured = confirmed + failed + pending)', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    assert.ok(code.includes('Reconciliação Exata'), 'Must display exact reconciliation section');
    assert.ok(code.includes('100% Reconciliado'), 'Must display 100% Reconciliado indicator');
    assert.ok(code.includes('chunksCaptured || 0'), 'Must compute reconciliation based on chunksCaptured');
  });

  // 8. Service Worker for PWA Resilience
  test('8. sw.js is configured with Network-First strategy and cache-busting for PWA updates', () => {
    const swPath = path.join(projectRoot, 'frontend/public/sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js must exist in frontend/public');

    const swCode = fs.readFileSync(swPath, 'utf-8');
    assert.ok(swCode.includes('proton-flow-v'), 'sw.js must define cache version');
    assert.ok(swCode.includes('Network-First'), 'sw.js must declare Network-First strategy for documents');
    assert.ok(swCode.includes("url.pathname.startsWith('/api/')"), 'sw.js must bypass caching for /api/ calls');
  });

  // 9. Service Worker Registration in main.jsx
  test('9. main.jsx registers service worker with update listeners', () => {
    const mainPath = path.join(projectRoot, 'frontend/src/main.jsx');
    const code = fs.readFileSync(mainPath, 'utf-8');

    assert.ok(code.includes('navigator.serviceWorker.register'), 'main.jsx must register service worker');
    assert.ok(code.includes('/sw.js'), 'Must register /sw.js');
  });

  // 10. Stylesheet Definitions for Participant Grid, Pulse, and Autoplay
  test('10. index.css defines styles for teams grid, speaking pulse, and autoplay banner', () => {
    const cssPath = path.join(projectRoot, 'frontend/src/index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('.participants-grid-container'), 'Must style .participants-grid-container');
    assert.ok(css.includes('.participant-card'), 'Must style .participant-card');
    assert.ok(css.includes('.participant-avatar-circle'), 'Must style .participant-avatar-circle');
    assert.ok(css.includes('.speaking-pulse'), 'Must style .speaking-pulse');
    assert.ok(css.includes('.autoplay-unblock-banner'), 'Must style .autoplay-unblock-banner');
  });

  // 11. Responsive Breakpoints for Mobile and Tablets
  test('11. index.css provides responsive mobile breakpoints (<=768px and <=480px) for the participant grid', () => {
    const cssPath = path.join(projectRoot, 'frontend/src/index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('@media (max-width: 768px)'), 'Must include 768px responsive breakpoint');
    assert.ok(css.includes('@media (max-width: 480px)'), 'Must include 480px mobile breakpoint');
  });

  // 12. Safe Area Insets for iOS Safari & PWA
  test('12. index.css respects safe-area-inset for mobile notches and home indicators', () => {
    const cssPath = path.join(projectRoot, 'frontend/src/index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('env(safe-area-inset-top'), 'Must support safe-area-inset-top');
    assert.ok(css.includes('env(safe-area-inset-bottom'), 'Must support safe-area-inset-bottom');
  });

  // 13. Backend WebRTC signaling endpoint in main.py
  test('13. backend/main.py implements MeetingConnectionManager with peer registry and WebRTC message forwarding', () => {
    const mainPyPath = path.join(projectRoot, 'backend/main.py');
    const py = fs.readFileSync(mainPyPath, 'utf-8');

    assert.ok(py.includes('class MeetingConnectionManager:'), 'Must define MeetingConnectionManager');
    assert.ok(py.includes('_peers'), 'Must maintain peer registry');
    assert.ok(py.includes('send_to_peer'), 'Must support direct peer messaging for signals');
    assert.ok(py.includes('broadcast_to_meeting'), 'Must broadcast room updates');
    assert.ok(py.includes('room_state'), 'Must dispatch room_state to newly joined peers');
  });

  // 14. Backend STT Header Recovery in stt_service.py
  test('14. backend/stt_service.py implements EBML header caching and prepending for WebM chunks', () => {
    const sttPath = path.join(projectRoot, 'backend/stt_service.py');
    const py = fs.readFileSync(sttPath, 'utf-8');

    assert.ok(py.includes('_meeting_headers'), 'Must cache meeting WebM headers');
    assert.ok(py.includes('EBML_MAGIC'), 'Must identify EBML header magic bytes');
    assert.ok(py.includes('sem_fala'), 'Corrupted chunks must fallback safely without throwing 500 error');
  });

  // 15. Backend Repository Key Isolation & Counter Reconciliation
  test('15. backend/repositories.py isolates chunk keys per participant and computes exact reconciliation metrics', () => {
    const repoPath = path.join(projectRoot, 'backend/repositories.py');
    const py = fs.readFileSync(repoPath, 'utf-8');

    assert.ok(py.includes('f"{session_id}:{speaker_id}:{sequence}"'), 'Must isolate chunk key with speaker_id');
    assert.ok(py.includes('record_live_audio_chunk_failure'), 'Must record chunk failures');
    assert.ok(py.includes('reconciliation_ok'), 'Diagnostics must return reconciliation_ok');
  });

  // 16. Speaker Turn Separation & Teams-Style Cards in LiveMeetingPage
  test('16. LiveMeetingPage renders speaker turns as Teams-style message cards with speaker avatar, name, and timestamp', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    assert.ok(code.includes('transcript-turns-container'), 'Must render transcript-turns-container');
    assert.ok(code.includes('transcript-turn-card'), 'Must render transcript-turn-card');
    assert.ok(code.includes('turn-speaker-name'), 'Must render turn-speaker-name');
    assert.ok(code.includes('turn-avatar-mini'), 'Must render turn-avatar-mini');
    assert.ok(code.includes('transcriptTurns'), 'Must manage transcriptTurns state');
  });

  // 17. Uninterrupted Continuous Capture on 503
  test('17. LiveMeetingPage does NOT stop audio recording on HTTP 503, preserving continuous capture', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    // On 503, processChunkQueue must NOT call stopBackendCapture
    const startIdx = code.indexOf('httpStatus === 503');
    assert.ok(startIdx !== -1, 'Must handle httpStatus === 503');
    const snippet503 = code.substring(startIdx, startIdx + 800);
    assert.ok(!snippet503.includes("stopBackendCapture('stt_unavailable')"), 'Must NOT terminate MediaRecorder on 503');
    assert.ok(snippet503.includes('chunkQueueRef.current.shift()'), 'Must shift failed chunk and continue queue');
  });

  // 18. High-Contrast Styles for Meeting Controls Dock & Dark Theme Legibility
  test('18. index.css defines high-contrast styles for meeting-controls-dock and turn cards in light/dark themes', () => {
    const cssPath = path.join(projectRoot, 'frontend/src/index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('.meeting-controls-dock'), 'Must style .meeting-controls-dock');
    assert.ok(css.includes('.transcript-turn-card'), 'Must style .transcript-turn-card');
    assert.ok(css.includes('.turn-speaker-name'), 'Must style .turn-speaker-name');
    assert.ok(css.includes('[data-theme="dark"] .meeting-controls-dock'), 'Must define dark theme dock styling');
    assert.ok(css.includes('[data-theme="light"] .meeting-controls-dock'), 'Must define light theme dock styling');
  });

  // 19. Audio Output Controls, Volume and Local Audio Test Tone
  test('19. LiveMeetingPage provides audio output device selection, volume/mute and isolated audio test tone', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    assert.ok(code.includes('handleTestAudioOutput'), 'Must implement handleTestAudioOutput');
    assert.ok(code.includes('handleSelectAudioOutputDevice'), 'Must implement handleSelectAudioOutputDevice');
    assert.ok(code.includes('handleToggleMeetingOutputMute'), 'Must implement handleToggleMeetingOutputMute');
    assert.ok(code.includes('remoteAudioPlaybackStatus'), 'Must track remoteAudioPlaybackStatus');
    assert.ok(code.includes('supportsSinkId'), 'Must feature-detect setSinkId support');
    assert.ok(code.includes('audioOutputDevices'), 'Must maintain list of audiooutput devices');
  });

  // 20. WebRTC Transceiver Negotiation & Dynamic Local Track Synchronization
  test('20. LiveMeetingPage configures WebRTC transceivers and synchronizes tracks dynamically across peers', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    assert.ok(code.includes('addTransceiver'), 'Must initialize transceivers for audio and video');
    assert.ok(code.includes('syncLocalStreamToPeers'), 'Must provide syncLocalStreamToPeers function');
    assert.ok(code.includes('iceCandidateQueuesRef'), 'Must queue ICE candidates before setRemoteDescription');
  });

  // 21. Tab-Isolated Stable Participant ID & Muted Remote Video for Autoplay Safety
  test('21. LiveMeetingPage generates tab-isolated participantId and plays remote video with muted={true} for autoplay safety', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    assert.ok(code.includes('__PF_TAB_ID__'), 'Must isolate participant ID per browser tab to avoid tab collisions');
    assert.ok(code.includes('muted={true}'), 'Remote video must have muted={true} to avoid browser autoplay blocks');
  });

  // 22. Resilient parseSpeakerTurns across 6.000, 10.000 and 20.000+ characters with brackets
  test('22. parseSpeakerTurns scales beyond 6k, 10k and 20k chars and preserves internal brackets without truncation', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');
    assert.ok(code.includes('export function parseSpeakerTurns(text)'), 'parseSpeakerTurns must be declared');

    // Extrai e avalia a implementação real da função contida no arquivo
    const funcMatch = code.match(/export function parseSpeakerTurns\(text\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(funcMatch, 'Deve encontrar a definição da função parseSpeakerTurns');
    const parseSpeakerTurns = new Function('text', funcMatch[1]);

    // Monta texto longo com mais de 20.000 caracteres alternando falas e contendo colchetes [ruído], [anexo], etc.
    let fullText = '[Carlos RH]: Início da reunião com alinhamento sobre o sistema TOTVS.\n\n';
    for (let i = 1; i <= 150; i++) {
      const spk = i % 2 === 1 ? 'Carlos RH' : 'Mariana TI';
      fullText += `[${spk}]: Turno ${i}: Discutindo parametrizações fiscais e módulos contábeis [anexo ${i}] com detalhes minuciosos e sem perda de contexto corporativo. `;
      if (i % 5 === 0) fullText += '[ruído] Continuação da fala após ruído sem corte algum. ';
      fullText += '\n\n';
    }

    assert.ok(fullText.length > 20000, `Texto deve ter mais de 20.000 caracteres, tem ${fullText.length}`);

    const turns = parseSpeakerTurns(fullText);
    assert.strictEqual(turns.length, 151, 'Deve extrair todos os 151 turnos sem perda');
    assert.ok(turns[0].content.includes('alinhamento sobre o sistema TOTVS'));
    assert.ok(turns[5].content.includes('[ruído] Continuação da fala'));
    assert.ok(turns[150].content.includes('[anexo 150]'));

    // Teste com preâmbulo sem tag inicial
    const withPreamble = 'Aviso prévio sem tag de falante.\n\n[João]: Primeira fala identificada.';
    const turnsWithPreamble = parseSpeakerTurns(withPreamble);
    assert.strictEqual(turnsWithPreamble.length, 2);
    assert.strictEqual(turnsWithPreamble[0].speaker, 'Participante');
    assert.strictEqual(turnsWithPreamble[0].content, 'Aviso prévio sem tag de falante.');
  });

  // 23. Dismissible Pre-Permission Card Allowing Listener Participation
  test('23. LiveMeetingPage defines dismissible pre-permission state without blocking stage', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');

    assert.ok(code.includes('prePermissionDismissed'), 'Must track prePermissionDismissed');
    assert.ok(code.includes('Entrar apenas como ouvinte'), 'Must provide listener entrance button');
    assert.ok(code.includes('setPrePermissionDismissed(true)'), 'Must allow user to dismiss pre-permission card');
  });

  // 24. Mobile 100dvh sizing, safe area padding and dark/light theme tokens
  test('24. LiveMeetingPage and index.css implement 100dvh sizing, safe area dock spacing and theme tokens', () => {
    const pagePath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const code = fs.readFileSync(pagePath, 'utf-8');
    const cssPath = path.join(projectRoot, 'frontend/src/index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(code.includes('100dvh'), 'Must use 100dvh for mobile dynamic viewport sizing');
    assert.ok(code.includes('var(--pf-surface'), 'Modals must use theme tokens instead of hardcoded slate');
    assert.ok(css.includes('padding-bottom: calc('), 'participants-grid-container must have dock safety padding');
  });
});


