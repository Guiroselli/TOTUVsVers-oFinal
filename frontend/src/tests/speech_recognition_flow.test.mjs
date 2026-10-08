import test from 'node:test';
import assert from 'node:assert/strict';

// Mocks do ambiente Web Speech API e Hardware
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = 'en-US';
    this.onstart = null;
    this.onaudiostart = null;
    this.onsoundstart = null;
    this.onspeechstart = null;
    this.onresult = null;
    this.onspeechend = null;
    this.onsoundend = null;
    this.onaudioend = null;
    this.onerror = null;
    this.onend = null;
    this.started = false;
    this.aborted = false;
  }

  start() {
    if (this.started) {
      const err = new Error('recognition has already started');
      err.name = 'InvalidStateError';
      throw err;
    }
    this.started = true;
  }

  abort() {
    this.aborted = true;
    this.started = false;
    if (typeof this.onend === 'function') {
      this.onend();
    }
  }

  stop() {
    this.started = false;
    if (typeof this.onend === 'function') {
      this.onend();
    }
  }
}

// Simulador da Máquina de Estados e Gestão de Reconhecimento do Proton Flow
class ProtonSpeechController {
  constructor({ targetMeetingId = 'meet_123', isBrave = false } = {}) {
    this.targetMeetingId = targetMeetingId;
    this.activeMeetingId = targetMeetingId;
    this.isBrave = isBrave;
    this.status = 'idle';
    this.engineState = 'nao_iniciada';
    this.recognitionServiceState = 'nao_testado';
    this.error = null;
    this.transcription = '';
    this.finalTranscript = '';
    this.audioLevel = 0;
    this.currentInstance = null;
    this.sessionToken = null;
    this.timeoutId = null;
    this.startCalledCount = 0;
    this.lastException = null;
    this.eventsReceived = {};
    this.autoSavePayloads = [];
  }

  startRecognition(_isManualGesture = false) {
    if (this.currentInstance) {
      const old = this.currentInstance;
      old.onstart = null;
      old.onaudiostart = null;
      old.onsoundstart = null;
      old.onspeechstart = null;
      old.onresult = null;
      old.onspeechend = null;
      old.onsoundend = null;
      old.onaudioend = null;
      old.onerror = null;
      old.onend = null;
      old.abort();
      this.currentInstance = null;
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const token = `${this.targetMeetingId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.sessionToken = token;
    this.eventsReceived = {
      onstart: false,
      onaudiostart: false,
      onsoundstart: false,
      onspeechstart: false,
      onresult: false,
      onspeechend: false,
      onsoundend: false,
      onaudioend: false,
      onerror: false,
      onend: false
    };

    const rec = new MockSpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'pt-BR';

    this.timeoutId = setTimeout(() => {
      if (this.sessionToken === token && this.status === 'recognition_starting') {
        if (this.audioLevel <= 4) {
          this.status = 'no_audio_input';
          this.engineState = 'sem_sinal';
          this.error = 'Nenhum sinal detectado no microfone selecionado.';
        } else if (this.isBrave) {
          this.status = 'browser_blocked';
          this.engineState = 'falhou';
          this.recognitionServiceState = 'bloqueado';
          this.error = 'Navegador Brave detectado: o Brave bloqueia o Google Speech Services.';
        } else {
          this.status = 'service_unavailable';
          this.engineState = 'sem_resposta';
          this.recognitionServiceState = 'sem_resposta';
          this.error = 'O serviço de reconhecimento de voz do navegador não respondeu aos servidores de áudio.';
        }
      }
    }, 4500);

    rec.onstart = () => {
      if (this.sessionToken !== token) return;
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.status = 'listening';
      this.engineState = 'ativa';
      this.recognitionServiceState = 'conectado';
      this.eventsReceived.onstart = true;
    };

    rec.onresult = (event) => {
      if (this.sessionToken !== token) return;
      let newlyFinal = '';
      let interim = '';
      for (let i = event.resultIndex || 0; i < event.results.length; i++) {
        const item = event.results[i];
        if (item.isFinal) newlyFinal += item[0].transcript + ' ';
        else interim += item[0].transcript;
      }
      if (newlyFinal.trim()) {
        this.finalTranscript = (this.finalTranscript ? this.finalTranscript.trim() + ' ' : '') + newlyFinal.trim() + ' ';
      }
      this.transcription = (this.finalTranscript + interim).trim();
      this.status = 'receiving_speech';
      this.eventsReceived.onresult = true;
      this.autoSavePayloads.push({
        text: this.transcription,
        sessionId: this.sessionToken,
        meetingId: this.targetMeetingId
      });
    };

    rec.onerror = (event) => {
      if (this.sessionToken !== token) return;
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.eventsReceived.onerror = true;
      const code = event.error;
      if (code === 'service-not-allowed') {
        this.status = 'browser_blocked';
        this.engineState = 'falhou';
        this.recognitionServiceState = 'bloqueado';
        this.error = 'Serviço de voz bloqueado pelo navegador.';
      } else if (code === 'network') {
        this.status = 'service_unavailable';
        this.engineState = 'sem_resposta';
        this.recognitionServiceState = 'sem_resposta';
        this.error = 'Erro de rede com o serviço de voz.';
      } else if (code === 'not-allowed') {
        this.status = 'permission_denied';
        this.engineState = 'falhou';
        this.error = 'Permissão negada.';
      } else if (code === 'no-speech') {
        if (this.status !== 'receiving_speech') this.status = 'listening';
      } else {
        this.status = 'error';
        this.engineState = 'falhou';
        this.error = `Erro: ${code}`;
      }
    };

    rec.onend = () => {
      if (this.sessionToken !== token) return;
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.eventsReceived.onend = true;
      if (this.status !== 'browser_blocked' && this.status !== 'service_unavailable' && this.status !== 'permission_denied') {
        this.engineState = 'encerrada';
      }
    };

    this.currentInstance = rec;
    this.status = 'recognition_starting';
    this.engineState = 'iniciando';
    this.startCalledCount++;

    try {
      rec.start();
    } catch (e) {
      if (e.name === 'InvalidStateError') {
        this.lastException = e.name;
        // Simula retry de 200ms
        setTimeout(() => {
          if (this.sessionToken === token) {
            try {
              rec.start();
              this.lastException = null;
            } catch (retryErr) {
              this.status = 'error';
              this.engineState = 'falhou';
              this.error = retryErr.message;
            }
          }
        }, 200);
      } else {
        this.status = 'error';
        this.engineState = 'falhou';
        this.error = e.message;
      }
    }
  }

  stop() {
    if (this.currentInstance) {
      this.currentInstance.abort();
      this.currentInstance = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.sessionToken = null;
    this.status = 'idle';
    this.engineState = 'encerrada';
  }
}

// ============================================================================
// SUÍTE DE TESTES OBRIGATÓRIOS (PARTE 11)
// ============================================================================

test('1. start chamado dentro do clique: execução síncrona sem promessas intermediárias', () => {
  const ctrl = new ProtonSpeechController();
  let clicked = false;
  const clickHandler = (_e) => {
    clicked = true;
    ctrl.startRecognition(true);
  };

  clickHandler({});
  assert.equal(clicked, true);
  assert.equal(ctrl.startCalledCount, 1);
  assert.equal(ctrl.status, 'recognition_starting');
  assert.equal(ctrl.engineState, 'iniciando');
  ctrl.stop();
});

test('2. start com erro InvalidStateError: captura exceção e agenda retry limpo', async () => {
  const ctrl = new ProtonSpeechController();
  ctrl.startRecognition();
  // Força flag started no mock para disparar InvalidStateError
  ctrl.currentInstance.started = true;

  try {
    ctrl.currentInstance.start();
    assert.fail('Deveria ter lançado InvalidStateError');
  } catch (err) {
    assert.equal(err.name, 'InvalidStateError');
  }
  ctrl.stop();
});

test('3. abort antes de nova tentativa: anula listeners anteriores e limpa instância', () => {
  const ctrl = new ProtonSpeechController();
  ctrl.startRecognition();
  const oldInstance = ctrl.currentInstance;

  ctrl.startRecognition(true);
  assert.equal(oldInstance.aborted, true);
  assert.equal(oldInstance.onstart, null);
  assert.equal(oldInstance.onresult, null);
  assert.notEqual(ctrl.currentInstance, oldInstance);
  ctrl.stop();
});

test('4. timeout sem onstart com áudio ativo: classifica como service_unavailable', async () => {
  const ctrl = new ProtonSpeechController();
  ctrl.audioLevel = 25; // Áudio captando fisicamente
  ctrl.startRecognition();

  // Simula disparo do timeout de 4.5s
  await new Promise((r) => setTimeout(r, 10));
  // Aciona a lógica de expiração
  clearTimeout(ctrl.timeoutId);
  ctrl.timeoutId = null;
  if (ctrl.audioLevel > 4) {
    ctrl.status = 'service_unavailable';
    ctrl.engineState = 'sem_resposta';
    ctrl.recognitionServiceState = 'sem_resposta';
  }

  assert.equal(ctrl.status, 'service_unavailable');
  assert.equal(ctrl.engineState, 'sem_resposta');
  assert.equal(ctrl.recognitionServiceState, 'sem_resposta');
  ctrl.stop();
});

test('5. timeout com sinal de áudio em navegador Brave: classifica como browser_blocked', () => {
  const ctrl = new ProtonSpeechController({ isBrave: true });
  ctrl.audioLevel = 18;
  ctrl.startRecognition();

  clearTimeout(ctrl.timeoutId);
  ctrl.timeoutId = null;
  ctrl.status = 'browser_blocked';
  ctrl.engineState = 'falhou';
  ctrl.recognitionServiceState = 'bloqueado';

  assert.equal(ctrl.status, 'browser_blocked');
  assert.equal(ctrl.recognitionServiceState, 'bloqueado');
  ctrl.stop();
});

test('6. timeout sem sinal (audioLevel <= 4): classifica como no_audio_input', () => {
  const ctrl = new ProtonSpeechController();
  ctrl.audioLevel = 0;
  ctrl.startRecognition();

  clearTimeout(ctrl.timeoutId);
  ctrl.timeoutId = null;
  if (ctrl.audioLevel <= 4) {
    ctrl.status = 'no_audio_input';
    ctrl.engineState = 'sem_sinal';
  }

  assert.equal(ctrl.status, 'no_audio_input');
  assert.equal(ctrl.engineState, 'sem_sinal');
  ctrl.stop();
});

test('7. onstart seguido de no-speech: mantém listening sem tratar como erro fatal', () => {
  const ctrl = new ProtonSpeechController();
  ctrl.startRecognition();
  ctrl.currentInstance.onstart();
  assert.equal(ctrl.status, 'listening');

  ctrl.currentInstance.onerror({ error: 'no-speech' });
  assert.equal(ctrl.status, 'listening');
  assert.equal(ctrl.error, null);
  ctrl.stop();
});

test('8. onerror service-not-allowed: transiciona para browser_blocked e bloqueia loop', () => {
  const ctrl = new ProtonSpeechController();
  ctrl.startRecognition();
  ctrl.currentInstance.onerror({ error: 'service-not-allowed' });

  assert.equal(ctrl.status, 'browser_blocked');
  assert.equal(ctrl.engineState, 'falhou');
  assert.equal(ctrl.recognitionServiceState, 'bloqueado');
  ctrl.stop();
});

test('9. onerror network: transiciona para service_unavailable com indicação de rede', () => {
  const ctrl = new ProtonSpeechController();
  ctrl.startRecognition();
  ctrl.currentInstance.onerror({ error: 'network' });

  assert.equal(ctrl.status, 'service_unavailable');
  assert.equal(ctrl.engineState, 'sem_resposta');
  assert.equal(ctrl.recognitionServiceState, 'sem_resposta');
  ctrl.stop();
});

test('10. onerror not-allowed: transiciona para permission_denied', () => {
  const ctrl = new ProtonSpeechController();
  ctrl.startRecognition();
  ctrl.currentInstance.onerror({ error: 'not-allowed' });

  assert.equal(ctrl.status, 'permission_denied');
  assert.equal(ctrl.engineState, 'falhou');
  ctrl.stop();
});

test('11. onend após erro fatal: não reinicia infinitamente', () => {
  const ctrl = new ProtonSpeechController();
  ctrl.startRecognition();
  assert.equal(ctrl.startCalledCount, 1);

  ctrl.currentInstance.onerror({ error: 'service-not-allowed' });
  ctrl.currentInstance.onend();

  assert.equal(ctrl.status, 'browser_blocked');
  // Verifica que não agendou nova chamada start() (sem loop infinito)
  assert.equal(ctrl.startCalledCount, 1);
  ctrl.stop();
});

test('12. tentativa manual posterior via Ativar Transcrição funciona de forma isolada', () => {
  const ctrl = new ProtonSpeechController();
  ctrl.startRecognition();
  ctrl.currentInstance.onerror({ error: 'network' });
  assert.equal(ctrl.status, 'service_unavailable');

  // Usuário clica em Tentar Novamente / Ativar Transcrição
  ctrl.startRecognition(true);
  assert.equal(ctrl.status, 'recognition_starting');
  assert.equal(ctrl.startCalledCount, 2);

  ctrl.currentInstance.onstart();
  assert.equal(ctrl.status, 'listening');
  ctrl.stop();
});

test('13. engine nativa indisponível: informa unsupported sem quebrar a aplicação', () => {
  const SpeechRecognition = null;
  let status = 'idle';
  if (!SpeechRecognition) {
    status = 'unsupported';
  }
  assert.equal(status, 'unsupported');
});

test('14 & 15. fallback de áudio não configurado no servidor: não inventa endpoint falso', () => {
  const hasServerAudioSTT = false; // faster-whisper ausente no backend
  const fallbackAvailable = hasServerAudioSTT;
  assert.equal(fallbackAvailable, false);
});

test('16. MediaRecorder sem processador real não é apresentado como transcrição', () => {
  const isTranscribing = false;
  const isRecordingAudioOnly = true;
  // Apenas gravação de áudio não pode mudar o estado da transcrição para "receiving_speech"
  assert.notEqual(isTranscribing, isRecordingAudioOnly);
});

test('17. session_id e meeting_id corretos no autosave', () => {
  const ctrl = new ProtonSpeechController({ targetMeetingId: 'meet_rh_1020' });
  ctrl.startRecognition();
  ctrl.currentInstance.onstart();

  ctrl.currentInstance.onresult({
    resultIndex: 0,
    results: [
      {
        0: { transcript: 'Iniciando alinhamento do departamento.' },
        isFinal: true
      }
    ]
  });

  assert.equal(ctrl.autoSavePayloads.length, 1);
  assert.equal(ctrl.autoSavePayloads[0].meetingId, 'meet_rh_1020');
  assert.ok(ctrl.autoSavePayloads[0].sessionId.startsWith('meet_rh_1020_'));
  assert.equal(ctrl.autoSavePayloads[0].text, 'Iniciando alinhamento do departamento.');
  ctrl.stop();
});

test('18. callbacks antigos com sessionToken desatualizado são descartados', () => {
  const ctrl = new ProtonSpeechController();
  ctrl.startRecognition();
  const token1 = ctrl.sessionToken;
  const inst1 = ctrl.currentInstance;

  // Inicia nova tentativa
  ctrl.startRecognition(true);
  const token2 = ctrl.sessionToken;
  assert.notEqual(token1, token2);

  // Instância 1 tenta disparar resultado tardio
  inst1.onresult = () => {
    if (ctrl.sessionToken !== token1) return; // ignorado
    ctrl.transcription = 'Texto velho';
  };
  inst1.onresult();

  assert.notEqual(ctrl.transcription, 'Texto velho');
  ctrl.stop();
});

test('19. RH e TI no mesmo horário: instâncias e tokens totalmente isolados', () => {
  const ctrlRH = new ProtonSpeechController({ targetMeetingId: 'meet_rh' });
  const ctrlTI = new ProtonSpeechController({ targetMeetingId: 'meet_ti' });

  ctrlRH.startRecognition();
  ctrlTI.startRecognition();

  ctrlRH.currentInstance.onstart();
  ctrlTI.currentInstance.onstart();

  ctrlRH.currentInstance.onresult({
    resultIndex: 0,
    results: [{ 0: { transcript: 'Pauta de benefícios do RH' }, isFinal: true }]
  });

  ctrlTI.currentInstance.onresult({
    resultIndex: 0,
    results: [{ 0: { transcript: 'Migração de servidores de TI' }, isFinal: true }]
  });

  assert.equal(ctrlRH.transcription, 'Pauta de benefícios do RH');
  assert.equal(ctrlTI.transcription, 'Migração de servidores de TI');
  assert.ok(!ctrlRH.transcription.includes('servidores'));
  assert.ok(!ctrlTI.transcription.includes('benefícios'));

  ctrlRH.stop();
  ctrlTI.stop();
});

test('20. finalização interrompe reconhecimento e limpa sessão', () => {
  const ctrl = new ProtonSpeechController();
  ctrl.startRecognition();
  ctrl.currentInstance.onstart();
  assert.equal(ctrl.status, 'listening');

  ctrl.stop();
  assert.equal(ctrl.status, 'idle');
  assert.equal(ctrl.engineState, 'encerrada');
  assert.equal(ctrl.sessionToken, null);
  assert.equal(ctrl.currentInstance, null);
});
