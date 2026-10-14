import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Circle, Square, Upload, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';

const MIN_SECONDS = 5;
const MIN_BYTES = 2048;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return candidates.find((c) => MediaRecorder.isTypeSupported?.(c)) || '';
}

function fmt(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function nowParts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return { data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, horario: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export const JOB_STATUS_LABEL = {
  na_fila: 'Na fila',
  preparando_audio: 'Preparando áudio',
  transcrevendo: 'Transcrevendo',
  gerando_ata: 'Gerando ata',
  concluido: 'Concluído',
  erro: 'Erro',
};

/**
 * Grava a chamada online (áudio da guia + microfone) no navegador e envia para o servidor,
 * que transcreve em segundo plano e gera a ata. Também aceita o envio de um arquivo já gravado.
 */
export default function CallRecorderModal({ onClose, onSent }) {
  const [titulo, setTitulo] = useState('');
  const [departamento, setDepartamento] = useState('Geral');
  const [participantes, setParticipantes] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | requesting | recording | sending | sent | error
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(null); // { blob, filename } aguardando (re)envio

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamsRef = useRef([]);
  const ctxRef = useRef(null);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const fileInputRef = useRef(null);
  const stoppingRef = useRef(false);

  const cleanupMedia = useCallback(() => {
    clearInterval(timerRef.current);
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      try { rec.stop(); } catch { /* ignora */ }
    }
    cleanupMedia();
  }, [cleanupMedia]);

  const sendBlob = useCallback(async (blob, filename) => {
    setPhase('sending');
    setError('');
    try {
      const { data, horario } = nowParts();
      const res = await api.createLiveMeeting({
        titulo: titulo.trim() || `Chamada online ${data} ${horario}`,
        departamento: departamento.trim() || 'Geral',
        data,
        horario,
        participantes: participantes.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean),
        fonte_audio: 'Chamada online (gravação)',
      });
      const meetingId = res?.meeting?.ID_MEETING;
      if (!meetingId) throw new Error('Não foi possível criar a reunião.');
      await api.uploadMeetingRecording(meetingId, blob, filename);
      setPending(null);
      setPhase('sent');
      onSent?.(meetingId);
    } catch (err) {
      setPending({ blob, filename });
      setError(`Falha ao enviar: ${err.message || err}. A gravação foi mantida; tente enviar novamente.`);
      setPhase('error');
    }
  }, [titulo, departamento, participantes, onSent]);

  const finishRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || stoppingRef.current) return;
    stoppingRef.current = true;
    if (rec.state !== 'inactive') rec.stop();
  }, []);

  const startRecording = async () => {
    setError('');
    setNotice('');
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador não suporta captura de guia. Use o Chrome ou o Edge no computador.');
      setPhase('error');
      return;
    }
    setPhase('requesting');
    try {
      // O Chrome só libera o áudio da guia se o pedido incluir vídeo; o vídeo é descartado.
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamsRef.current.push(display);
      const tabAudio = display.getAudioTracks();
      if (tabAudio.length === 0) {
        cleanupMedia();
        setError('A guia foi compartilhada sem áudio. Escolha a guia da reunião e marque "Compartilhar áudio da guia".');
        setPhase('error');
        return;
      }

      let mic = null;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        streamsRef.current.push(mic);
      } catch {
        setNotice('Microfone não liberado: gravando somente o áudio da guia (a sua voz não será captada).');
      }

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      dest.channelCount = 1;
      dest.channelCountMode = 'explicit';
      ctx.createMediaStreamSource(new MediaStream(tabAudio)).connect(dest);
      if (mic) ctx.createMediaStreamSource(mic).connect(dest);

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(dest.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 });
      chunksRef.current = [];
      stoppingRef.current = false;
      rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        cleanupMedia();
        if (elapsed < MIN_SECONDS || blob.size < MIN_BYTES) {
          setError(`Gravação muito curta (mínimo de ${MIN_SECONDS} segundos). Nada foi enviado.`);
          setPhase('error');
          return;
        }
        sendBlob(blob, 'chamada.webm');
      };

      // Parar o compartilhamento pela barra do Chrome encerra e envia.
      display.getVideoTracks().forEach((t) => t.addEventListener('ended', finishRecording));
      tabAudio.forEach((t) => t.addEventListener('ended', finishRecording));

      recorderRef.current = rec;
      rec.start(1000);
      startedAtRef.current = Date.now();
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000)), 500);
      setPhase('recording');
    } catch (err) {
      cleanupMedia();
      const denied = err?.name === 'NotAllowedError';
      setError(denied ? 'Compartilhamento cancelado ou negado.' : `Não foi possível iniciar a gravação: ${err?.message || err}`);
      setPhase('error');
    }
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024 * 1024) {
      setError('Arquivo maior que o limite de 2 GB.');
      setPhase('error');
      return;
    }
    sendBlob(file, file.name);
  };

  const busy = phase === 'requesting' || phase === 'recording' || phase === 'sending';
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color, #d1d5db)', background: 'var(--panel-bg, #fff)', color: 'var(--text-main)', fontSize: '13px' };
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gravar chamada online"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
    >
      <div style={{ background: 'var(--panel-bg, #fff)', color: 'var(--text-main)', borderRadius: '12px', width: '100%', maxWidth: '520px', maxHeight: '92vh', overflow: 'auto', padding: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Gravar chamada online</h2>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={phase === 'recording' || phase === 'sending'} aria-label="Fechar" style={{ padding: '4px 8px' }}>
            <X size={16} />
          </button>
        </div>

        {phase !== 'sent' && (
          <>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Abra a reunião (Teams, Meet ou Zoom) em outra guia, clique em gravar e escolha essa guia marcando
              <strong> “Compartilhar áudio da guia”</strong>. O áudio é enviado ao servidor, que transcreve e monta a ata.
              Avise os participantes que a reunião está sendo gravada (LGPD).
            </p>

            <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle} htmlFor="rec-titulo">Título</label>
                <input id="rec-titulo" style={inputStyle} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Alinhamento semanal RH" disabled={phase === 'sending'} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="rec-depto">Departamento</label>
                <input id="rec-depto" style={inputStyle} value={departamento} onChange={(e) => setDepartamento(e.target.value)} disabled={phase === 'sending'} />
              </div>
              <div>
                <label style={labelStyle} htmlFor="rec-part">Participantes (separe por vírgula)</label>
                <input id="rec-part" style={inputStyle} value={participantes} onChange={(e) => setParticipantes(e.target.value)} placeholder="Ana, Bruno, Carla" disabled={phase === 'sending'} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>A transcrição não identifica quem falou; preencher os participantes ajuda a ata.</span>
              </div>
            </div>
          </>
        )}

        {notice && <p style={{ fontSize: '12px', color: '#b45309', margin: '0 0 10px' }}>{notice}</p>}

        {phase === 'recording' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', fontWeight: 700 }}>
            <Circle size={12} fill="#dc2626" color="#dc2626" />
            <span>Gravando {fmt(seconds)}</span>
          </div>
        )}
        {phase === 'sending' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px' }}>
            <Loader2 size={16} className="spin" /> Enviando gravação para o servidor…
          </div>
        )}
        {phase === 'error' && error && (
          <div role="alert" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '12px', fontSize: '12.5px', color: '#b91c1c' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} /> <span>{error}</span>
          </div>
        )}
        {phase === 'sent' && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '14px', fontSize: '13px' }}>
            <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0 }} />
            <span>
              Gravação enviada. A transcrição roda no servidor em segundo plano — você pode fechar esta janela e até o navegador.
              Quando terminar, a ata aparece na reunião (status acompanhado na tela de reuniões).
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {(phase === 'idle' || phase === 'error') && !pending && (
            <>
              <button type="button" className="btn btn-primary" onClick={startRecording} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Circle size={13} fill="currentColor" /> Gravar chamada online
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Upload size={14} /> Enviar gravação
              </button>
            </>
          )}
          {phase === 'error' && pending && (
            <button type="button" className="btn btn-primary" onClick={() => sendBlob(pending.blob, pending.filename)}>
              Tentar enviar novamente
            </button>
          )}
          {phase === 'requesting' && <span style={{ fontSize: '13px' }}>Aguardando você escolher a guia…</span>}
          {phase === 'recording' && (
            <button type="button" className="btn btn-danger" onClick={finishRecording} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Square size={13} fill="currentColor" /> Encerrar e gerar ata
            </button>
          )}
          {phase === 'sent' && (
            <button type="button" className="btn btn-primary" onClick={onClose}>Fechar</button>
          )}
          <input ref={fileInputRef} type="file" accept="audio/*,video/mp4,video/webm,.mkv,.m4a,.opus" onChange={onPickFile} style={{ display: 'none' }} disabled={busy} />
        </div>
      </div>
    </div>
  );
}
