import test from 'node:test';
import assert from 'node:assert/strict';

// Mock de MediaStreamTrack e MediaStream
class MockMediaStreamTrack {
  constructor(kind = 'audio', enabled = true) {
    this.kind = kind;
    this.enabled = enabled;
    this.stopped = false;
  }
  stop() {
    this.stopped = true;
  }
}

class MockMediaStream {
  constructor(tracks = []) {
    this.tracks = tracks;
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
}

// Mock de MediaRecorder
class MockMediaRecorder {
  static supportedMimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/wav'];
  static isTypeSupported(mime) {
    return MockMediaRecorder.supportedMimes.includes(mime);
  }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType || 'audio/webm';
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onerror = null;
    this.onstop = null;
    this.timeslice = 0;
  }

  start(timeslice = 4000) {
    this.state = 'recording';
    this.timeslice = timeslice;
  }

  stop() {
    this.state = 'inactive';
    if (typeof this.onstop === 'function') {
      this.onstop();
    }
  }

  // Simula emissão de chunk
  emitChunk(data = new Uint8Array([1, 2, 3, 4])) {
    if (typeof this.ondataavailable === 'function') {
      this.ondataavailable({ data: { size: data.length, data } });
    }
  }
}

// Simulador de controlador STT do Proton Flow no Frontend
class ProtonSTTController {
  constructor({ meetingId = 'meet_123', initialProvider = 'backend' } = {}) {
    this.meetingId = meetingId;
    this.provider = initialProvider; // 'backend' | 'browser' | 'manual'
    this.backendStatus = { enabled: true, available: true, provider: 'faster_whisper', model: 'small' };
    this.transcription = '';
    this.finalTranscript = '';
    this.chunkSequence = 0;
    this.sessionId = `stt_${meetingId}_${Date.now()}`;
    this.recorder = null;
    this.status = 'idle';
    this.error = null;
    this.uploadedChunks = [];
    this.stats = { chunkCount: 0, lastProcessingTimeMs: 0, lastDuration: 0 };
  }

  selectProvider(newProvider) {
    this.provider = newProvider;
    this.error = null;
    if (newProvider === 'manual') {
      this.stopRecording();
    }
  }

  startRecording(stream, mockApiUpload) {
    if (this.provider !== 'backend') return;

    // Regra estrita: apenas trilha de áudio, nunca vídeo no recorder do STT
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.error = 'Sem trilha de áudio';
      return;
    }

    const audioOnlyStream = new MockMediaStream(audioTracks);
    this.recorder = new MockMediaRecorder(audioOnlyStream, { mimeType: 'audio/webm' });
    this.chunkSequence = 0;
    this.status = 'listening';

    this.recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) return;
      const seq = this.chunkSequence++;
      try {
        this.status = 'receiving_speech';
        const res = await mockApiUpload(this.meetingId, event.data, {
          sessionId: this.sessionId,
          sequence: seq,
        });

        if (res && res.text) {
          const chunkText = res.text.trim();
          if (chunkText) {
            const current = this.transcription.trim();
            if (!current.endsWith(chunkText)) {
              this.transcription = current ? `${current} ${chunkText}` : chunkText;
              this.finalTranscript = `${this.transcription} `;
            }
          }
        }
        this.stats.chunkCount = seq + 1;
        this.stats.lastProcessingTimeMs = res.processing_time_ms || 120;
        this.stats.lastDuration = res.duration || 4.0;
        this.status = 'listening';
      } catch (err) {
        if (err.status === 503) {
          this.status = 'service_unavailable';
          this.backendStatus.available = false;
          this.error = 'STT backend indisponível';
        } else {
          this.error = err.message;
        }
      }
    };

    this.recorder.start(4000);
  }

  stopRecording() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.recorder = null;
    this.status = 'idle';
  }
}

test('1. MediaRecorder do STT grava APENAS áudio (não inclui vídeo)', () => {
  const audioTrack = new MockMediaStreamTrack('audio', true);
  const videoTrack = new MockMediaStreamTrack('video', true);
  const combinedStream = new MockMediaStream([audioTrack, videoTrack]);

  const controller = new ProtonSTTController({ meetingId: 'meet_rh' });
  controller.startRecording(combinedStream, async () => ({ text: 'ok' }));

  assert.ok(controller.recorder);
  const recorderStream = controller.recorder.stream;
  assert.equal(recorderStream.getVideoTracks().length, 0, 'Não deve conter trilhas de vídeo');
  assert.equal(recorderStream.getAudioTracks().length, 1, 'Deve conter apenas trilhas de áudio');
  assert.equal(controller.recorder.timeslice, 4000, 'Timeslice deve ser de 4s');
});

test('2. Alternância entre provedores preserva texto consolidado', () => {
  const controller = new ProtonSTTController({ meetingId: 'meet_ti' });
  controller.transcription = 'Pauta inicial aprovada pela diretoria.';
  controller.finalTranscript = 'Pauta inicial aprovada pela diretoria. ';

  // Alterna para Navegador
  controller.selectProvider('browser');
  assert.equal(controller.provider, 'browser');
  assert.equal(controller.transcription, 'Pauta inicial aprovada pela diretoria.');

  // Alterna para Manual
  controller.selectProvider('manual');
  assert.equal(controller.provider, 'manual');
  assert.equal(controller.transcription, 'Pauta inicial aprovada pela diretoria.');

  // Alterna de volta para Backend
  controller.selectProvider('backend');
  assert.equal(controller.provider, 'backend');
  assert.equal(controller.transcription, 'Pauta inicial aprovada pela diretoria.');
});

test('3. Upload sequencial de chunks e incremento ordenado de sequence', async () => {
  const audioTrack = new MockMediaStreamTrack('audio', true);
  const stream = new MockMediaStream([audioTrack]);
  const controller = new ProtonSTTController({ meetingId: 'meet_order' });

  const uploadedSeqs = [];
  const mockUpload = async (mid, data, meta) => {
    uploadedSeqs.push(meta.sequence);
    return {
      status: 'success',
      sequence: meta.sequence,
      text: `Palavra ${meta.sequence}`,
      processing_time_ms: 110,
      duration: 4.0
    };
  };

  controller.startRecording(stream, mockUpload);

  await controller.recorder.emitChunk();
  await controller.recorder.emitChunk();
  await controller.recorder.emitChunk();

  assert.deepEqual(uploadedSeqs, [0, 1, 2]);
  assert.equal(controller.stats.chunkCount, 3);
  assert.ok(controller.transcription.includes('Palavra 0'));
  assert.ok(controller.transcription.includes('Palavra 1'));
  assert.ok(controller.transcription.includes('Palavra 2'));
});

test('4. Tratamento gracioso de erro HTTP 503 (STT indisponível)', async () => {
  const audioTrack = new MockMediaStreamTrack('audio', true);
  const stream = new MockMediaStream([audioTrack]);
  const controller = new ProtonSTTController({ meetingId: 'meet_503' });

  const mock503 = async () => {
    const err = new Error('Service Unavailable');
    err.status = 503;
    err.reason = 'stt_unavailable';
    throw err;
  };

  controller.startRecording(stream, mock503);
  await controller.recorder.emitChunk();

  assert.equal(controller.status, 'service_unavailable');
  assert.equal(controller.backendStatus.available, false);
  assert.ok(controller.error.includes('indisponível'));
});

test('5. Idempotência no cliente: chunks repetidos não duplicam texto', async () => {
  const audioTrack = new MockMediaStreamTrack('audio', true);
  const stream = new MockMediaStream([audioTrack]);
  const controller = new ProtonSTTController({ meetingId: 'meet_idem' });

  const mockUpload = async () => {
    return {
      status: 'success',
      text: 'Texto do chunk idempotente',
      processing_time_ms: 95
    };
  };

  controller.startRecording(stream, mockUpload);
  await controller.recorder.emitChunk();
  const textOnce = controller.transcription;

  // Emite chunk idêntico
  await controller.recorder.emitChunk();
  assert.equal(controller.transcription, textOnce, 'Não deve duplicar texto se já contiver o mesmo segmento');
});

test('6. Isolamento estrito entre reuniões simultâneas (RH e TI às 10:20)', async () => {
  const audioTrack = new MockMediaStreamTrack('audio', true);
  const streamRH = new MockMediaStream([audioTrack]);
  const streamTI = new MockMediaStream([audioTrack]);

  const ctrlRH = new ProtonSTTController({ meetingId: 'meet_rh_1020' });
  const ctrlTI = new ProtonSTTController({ meetingId: 'meet_ti_1020' });

  assert.notEqual(ctrlRH.meetingId, ctrlTI.meetingId);
  assert.notEqual(ctrlRH.sessionId, ctrlTI.sessionId);

  ctrlRH.startRecording(streamRH, async () => ({ text: 'Transcrição confidencial RH' }));
  ctrlTI.startRecording(streamTI, async () => ({ text: 'Transcrição técnica TI' }));

  await ctrlRH.recorder.emitChunk();
  await ctrlTI.recorder.emitChunk();

  assert.ok(ctrlRH.transcription.includes('RH'));
  assert.ok(!ctrlRH.transcription.includes('TI'));

  assert.ok(ctrlTI.transcription.includes('TI'));
  assert.ok(!ctrlTI.transcription.includes('RH'));
});
