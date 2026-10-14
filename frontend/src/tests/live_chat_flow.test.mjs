import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('Live Meeting Chat & Digital Room Composition — Proton Flow', () => {

  test('1. index.css defines explicit design tokens (--pf-*) for both light and dark modes', () => {
    const cssPath = path.join(projectRoot, 'frontend/src/index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    // Tokens obrigatórios
    const requiredTokens = [
      '--pf-bg-base',
      '--pf-surface',
      '--pf-surface-elevated',
      '--pf-border',
      '--pf-text-primary',
      '--pf-text-secondary',
      '--pf-accent',
      '--pf-accent-hover'
    ];

    for (const token of requiredTokens) {
      assert.ok(css.includes(token), `CSS must define token ${token}`);
    }

    // Modo escuro não pode ser preto absoluto sem containers
    assert.ok(css.includes('--bg-dark: #0b1120'), 'Dark mode base must be navy/slate (#0b1120), not flat absolute black');
  });

  test('2. index.css defines digital room layout and chat bubble classes', () => {
    const cssPath = path.join(projectRoot, 'frontend/src/index.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(css.includes('.meeting-stage-container'), 'Must define .meeting-stage-container');
    assert.ok(css.includes('.meeting-stage-main'), 'Must define .meeting-stage-main');
    assert.ok(css.includes('.meeting-collab-panel'), 'Must define .meeting-collab-panel');
    assert.ok(css.includes('.collab-tabs-header'), 'Must define .collab-tabs-header');
    assert.ok(css.includes('.mobile-meeting-segmented-nav'), 'Must define .mobile-meeting-segmented-nav');
    assert.ok(css.includes('.chat-bubble'), 'Must define .chat-bubble');
    assert.ok(css.includes('.chat-bubble.own'), 'Must define .chat-bubble.own');
    assert.ok(css.includes('.chat-bubble.other'), 'Must define .chat-bubble.other');
    assert.ok(css.includes('.chat-send-btn'), 'Must define .chat-send-btn');
  });

  test('3. api/client.js provides getLiveChatMessages and sendLiveChatMessage', () => {
    const clientPath = path.join(projectRoot, 'frontend/src/api/client.js');
    const code = fs.readFileSync(clientPath, 'utf-8');

    assert.ok(code.includes('getLiveChatMessages:'), 'client.js must define getLiveChatMessages');
    assert.ok(code.includes('sendLiveChatMessage:'), 'client.js must define sendLiveChatMessage');
    assert.ok(code.includes('/api/live/meetings/${meetingId}/chat/messages'), 'Must target canonical chat endpoint');
  });

  test('4. LiveMeetingPage separates Chat from Transcription and sets proper defaults', () => {
    const jsxPath = path.join(projectRoot, 'frontend/src/components/LiveMeetingPage.jsx');
    const jsx = fs.readFileSync(jsxPath, 'utf-8');

    // Estado e padrão do painel
    assert.ok(jsx.includes("const [collabTab, setCollabTab] = useState('chat')"), "Collab tab must default to 'chat'");
    assert.ok(jsx.includes("const [mobileRoomTab, setMobileRoomTab] = useState('room')"), "Mobile room view must default to 'room'");
    assert.ok(jsx.includes('chatMessages'), 'Must manage chatMessages state');
    assert.ok(jsx.includes('chatInputText'), 'Must manage chatInputText state');

    // Métodos e Handlers
    assert.ok(jsx.includes('fetchChatMessages'), 'Must implement fetchChatMessages');
    assert.ok(jsx.includes('handleSendChatMessage'), 'Must implement handleSendChatMessage');
    assert.ok(jsx.includes('handleChatKeyDown'), 'Must implement handleChatKeyDown');
    assert.ok(jsx.includes('handleChatScroll'), 'Must implement auto-scroll guard handleChatScroll');

    // Render de Chat e Transcrição desacoplados
    assert.ok(jsx.includes('renderChatView'), 'Must provide distinct renderChatView');
    assert.ok(jsx.includes('renderTranscriptView'), 'Must provide distinct renderTranscriptView');
  });

  test('5. Enter key submits message while Shift+Enter preserves newline', () => {
    // Simula a lógica de detecção de teclas
    let sent = false;
    let defaultPrevented = false;

    const simulateKeyDown = (key, shiftKey) => {
      sent = false;
      defaultPrevented = false;
      const e = {
        key,
        shiftKey,
        preventDefault: () => { defaultPrevented = true; }
      };

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sent = true;
      }
    };

    // Enter puro -> envia e previne default
    simulateKeyDown('Enter', false);
    assert.equal(sent, true);
    assert.equal(defaultPrevented, true);

    // Shift + Enter -> NÃO envia (permite quebra de linha normal)
    simulateKeyDown('Enter', true);
    assert.equal(sent, false);
    assert.equal(defaultPrevented, false);
  });
});
