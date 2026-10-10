import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Radio,
  Plus,
  Search,
  Calendar,
  Clock,
  Users,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Play,
  Pause,
  Square,
  AlertCircle,
  ExternalLink,
  FileText,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Info,
  Volume2,
  Activity,
  Check
} from 'lucide-react';
import { api } from '../api/client';

export default function LiveMeetingPage({
  onLeaveMeeting,
  onOpenDocumentViewer,
  onAnalyzeMeeting,
  _onNavigateToDashboard,
  initialMeetingId = null
}) {
  // Lista de reuniões e estado geral
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMeetingId, setActiveMeetingId] = useState(initialMeetingId);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');

  // Filtros da central de reuniões
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos'); // 'todos' | 'ao_vivo' | 'agendada' | 'pausada' | 'concluida'
  const [deptFilter, setDeptFilter] = useState('todos');

  // Modal de criação de nova reunião (Campos iniciam estritamente vazios)
  const initialFormState = {
    titulo: '',
    departamento: '',
    data: '',
    horario: '',
    participantes: '',
    fonte_audio: 'Microfone Padrão',
    iniciar_agora: false
  };
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeetingForm, setNewMeetingForm] = useState(initialFormState);
  const [formErrors, setFormErrors] = useState({});
  const [creatingMeeting, setCreatingMeeting] = useState(false);

  // Estado da sala de reunião ativa
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  // Estados granulares de diagnóstico de mídia e hardware (PART 2, 4, 6, 7)
  const [mediaPermission, setMediaPermission] = useState('idle'); // 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable'
  const [audioStatus, setAudioStatus] = useState('unavailable'); // 'unavailable' | 'requesting' | 'active' | 'muted' | 'denied' | 'ended'
  const [videoStatus, setVideoStatus] = useState('unavailable'); // 'unavailable' | 'requesting' | 'active' | 'disabled' | 'denied' | 'ended'
  // PARTE 2, 3, 4: Estados explícitos e observáveis de transcrição e diagnóstico
  const [transcriptionStatus, setTranscriptionStatus] = useState('idle'); // 'idle' | 'requesting_permission' | 'media_ready' | 'recognition_starting' | 'listening' | 'receiving_speech' | 'paused' | 'unsupported' | 'permission_denied' | 'no_audio_input' | 'browser_blocked' | 'service_unavailable' | 'error'
  const [engineState, setEngineState] = useState('nao_iniciada'); // 'nao_iniciada' | 'iniciando' | 'ativa' | 'sem_sinal' | 'falhou' | 'sem_resposta' | 'encerrada'
  const [recognitionServiceState, setRecognitionServiceState] = useState('nao_testado'); // 'nao_testado' | 'conectado' | 'sem_resposta' | 'bloqueado' | 'indisponivel'
  const [isManualEditMode, setIsManualEditMode] = useState(false);
  const [copiedDiagnostic, setCopiedDiagnostic] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [cameraNotice, setCameraNotice] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [_videoDevices, setVideoDevices] = useState([]);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'saving' | 'synced' | 'unsaved'
  const [showTechnicalDiagnostics, setShowTechnicalDiagnostics] = useState(false);
  // STT Provider (PARTE 7, 8, 11)
  const [sttProvider, setSttProvider] = useState('backend'); // 'backend' | 'browser' | 'manual'
  const [backendSttStatus, setBackendSttStatus] = useState({
    enabled: true,
    available: false,
    provider: 'faster_whisper',
    model: 'small',
    device: 'cpu',
    language: 'pt',
    reason: null
  });
  const [backendChunkStats, setBackendChunkStats] = useState({
    chunkCount: 0,
    lastProcessingTimeMs: 0,
    lastDuration: 0,
    latencyHistory: []
  });
  const [signalQuality, setSignalQuality] = useState('suficiente'); // 'suficiente' | 'baixo' | 'sem_fala' | 'saturado'
  const [transcriptRaw, setTranscriptRaw] = useState('');
  const [transcriptNormalized, setTranscriptNormalized] = useState('');
  const [transcriptViewMode, setTranscriptViewMode] = useState('normalized'); // 'normalized' | 'raw'
  const [diagnosticInfo, setDiagnosticInfo] = useState({
    engine: 'Não inicializado',
    lang: 'pt-BR',
    browser: typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Edg') ? 'Microsoft Edge' : navigator.userAgent.includes('Chrome') ? 'Google Chrome' : navigator.userAgent) : 'Desconhecido',
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    activeSessionId: null,
    startCalledCount: 0,
    lastException: null,
    eventsReceived: {
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
    },
    lastEvent: 'none',
    lastEventTime: null,
    resultsCount: 0,
    finalCharsCount: 0,
    lastError: null,
    audioTrackState: 'Desconhecido'
  });

  // Refs de mídia, transcrição e timers com isolamento estrito
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const activeMeetingIdRef = useRef(activeMeetingId);
  const isRecordingRef = useRef(false);
  const isListeningRef = useRef(false);
  const isRequestingMediaRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const startingTimeoutRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const consecutiveErrorsRef = useRef(0);
  const audioLevelRef = useRef(0);
  const transcriptionStatusRef = useRef('idle');
  const currentMeetingRef = useRef(null);
  const isPausedRef = useRef(false);
  const sttProviderRef = useRef('backend');
  const mediaRecorderRef = useRef(null);
  const chunkSequenceRef = useRef(0);
  const backendSessionIdRef = useRef(null);

  // 1. Carrega lista de dispositivos de áudio e vídeo disponíveis
  const loadAudioDevices = useCallback(async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setAudioDevices(audioInputs);
        setVideoDevices(videoInputs);
        if (audioInputs.length > 0) {
          setSelectedAudioDeviceId((prev) => {
            const exists = audioInputs.some((d) => d.deviceId === prev);
            if (exists && prev && prev !== 'default') return prev;
            const valid = audioInputs.find((d) => d.deviceId && d.deviceId !== 'default');
            return valid ? valid.deviceId : (audioInputs[0].deviceId || 'default');
          });
        }
      }
    } catch (e) {
      console.warn('Erro ao listar dispositivos de áudio:', e);
    }
  }, []);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', loadAudioDevices);
      };
    }
  }, [loadAudioDevices]);

  // 2. Carrega lista de reuniões ao vivo do backend
  const loadLiveMeetings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getLiveMeetings();
      setMeetings(res || []);
    } catch (err) {
      console.error('Erro ao carregar reuniões ao vivo:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 3. Carrega status do serviço STT backend
  const loadSttStatus = useCallback(async () => {
    try {
      const res = await api.getSttStatus();
      if (res) {
        setBackendSttStatus(res);
        if (res.available) {
          setSttProvider('backend');
          sttProviderRef.current = 'backend';
        } else {
          setSttProvider('browser');
          sttProviderRef.current = 'browser';
        }
      }
    } catch (err) {
      console.warn('Erro ao consultar /api/stt/status:', err);
      setBackendSttStatus((prev) => ({ ...prev, available: false, reason: 'error_fetching_status' }));
      setSttProvider('browser');
      sttProviderRef.current = 'browser';
    }
  }, []);

  // Efeito inicial
  useEffect(() => {
    loadLiveMeetings();
    loadAudioDevices();
    loadSttStatus();

    // Se tiver initialMeetingId pela URL, seleciona
    const urlParams = new URLSearchParams(window.location.search);
    const pId = urlParams.get('id') || urlParams.get('meeting_id') || initialMeetingId;
    if (pId) {
      setActiveMeetingId(pId);
    }
  }, [loadLiveMeetings, loadAudioDevices, loadSttStatus, initialMeetingId]);

  // Reunião atualmente selecionada para a sala
  const currentMeeting = useMemo(() => {
    if (!activeMeetingId) return null;
    return meetings.find((m) => String(m.ID_MEETING) === String(activeMeetingId)) || null;
  }, [activeMeetingId, meetings]);

  // Lista de outras reuniões ao vivo no mesmo momento
  const otherLiveMeetings = useMemo(() => {
    return meetings.filter(
      (m) => m.STATUS_MEETING === 'ao_vivo' && String(m.ID_MEETING) !== String(activeMeetingId)
    );
  }, [meetings, activeMeetingId]);

  // Contadores de status para o topo
  const metrics = useMemo(() => {
    const liveCount = meetings.filter((m) => m.STATUS_MEETING === 'ao_vivo').length;
    const scheduledCount = meetings.filter((m) => m.STATUS_MEETING === 'agendada').length;
    const pausedCount = meetings.filter((m) => m.STATUS_MEETING === 'pausada').length;
    const finishedCount = meetings.filter((m) => m.STATUS_MEETING === 'concluida').length;
    return { liveCount, scheduledCount, pausedCount, finishedCount, total: meetings.length };
  }, [meetings]);

  // Departamentos únicos para filtro
  const departmentsList = useMemo(() => {
    const setDept = new Set();
    meetings.forEach((m) => {
      const d = m.DEPARTAMENTO || m.NOME_SEGMENTO;
      if (d && d !== 'Geral') setDept.add(d);
    });
    return ['todos', 'RH', 'TI', 'Financeiro', 'Operações', ...Array.from(setDept)];
  }, [meetings]);

  // Lista filtrada
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      // Filtro de status
      if (statusFilter !== 'todos' && m.STATUS_MEETING !== statusFilter) {
        return false;
      }
      // Filtro de departamento
      const d = (m.DEPARTAMENTO || m.NOME_SEGMENTO || '').toLowerCase();
      if (deptFilter !== 'todos' && !d.includes(deptFilter.toLowerCase())) {
        return false;
      }
      // Busca textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const t = (m.TITULO_REUNIAO || '').toLowerCase();
        const c = (m.ANON_TRANSCRICAO || '').toLowerCase();
        const p = Array.isArray(m.PARTICIPANTES) ? m.PARTICIPANTES.join(' ').toLowerCase() : String(m.PARTICIPANTES || '').toLowerCase();
        const h = (m.HORARIO_AGENDADO || '').toLowerCase();
        if (!t.includes(q) && !c.includes(q) && !p.includes(q) && !d.includes(q) && !h.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [meetings, statusFilter, deptFilter, searchQuery]);

  // Sincroniza referências de reunião e texto inicial ao carregar ou trocar de reunião
  useEffect(() => {
    activeMeetingIdRef.current = activeMeetingId;
    if (currentMeeting) {
      const initialText = currentMeeting.ANON_TRANSCRICAO || '';
      setTranscription(initialText);
      finalTranscriptRef.current = initialText;
    } else {
      setTranscription('');
      finalTranscriptRef.current = '';
    }
  }, [activeMeetingId, currentMeeting]);

  // Auto-scroll da transcrição
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcription]);

  // Cronômetro da reunião em tempo real
  useEffect(() => {
    if (isRecording) {
      durationTimerRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    }
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    };
  }, [isRecording]);

  // Helpers visuais de diagnóstico de transcrição (PARTE 2, 3, 4, 9)
  const getTranscriptionStatusInfo = useCallback((status) => {
    switch (status) {
      case 'idle':
        return { label: 'Aguardando Início', color: '#94a3b8', dotColor: '#94a3b8' };
      case 'requesting_permission':
        return { label: 'Solicitando Permissão...', color: '#eab308', dotColor: '#eab308' };
      case 'media_ready':
        return { label: 'Microfone Pronto', color: '#38bdf8', dotColor: '#38bdf8' };
      case 'recognition_starting':
        return { label: 'Conectando...', color: '#eab308', dotColor: '#eab308' };
      case 'listening':
        return { label: 'Aguardando Fala', color: '#38bdf8', dotColor: '#38bdf8' };
      case 'receiving_speech':
        return { label: 'Transcrevendo...', color: '#10b981', dotColor: '#10b981' };
      case 'paused':
        return { label: 'Pausada', color: '#eab308', dotColor: '#eab308' };
      case 'unsupported':
        return { label: 'Não Suportada', color: '#f87171', dotColor: '#ef4444' };
      case 'permission_denied':
        return { label: 'Permissão Negada', color: '#f87171', dotColor: '#ef4444' };
      case 'no_audio_input':
        return { label: 'Sem Sinal de Áudio', color: '#f87171', dotColor: '#ef4444' };
      case 'browser_blocked':
        return { label: 'Bloqueado pelo Navegador', color: '#f87171', dotColor: '#ef4444' };
      case 'service_unavailable':
        return { label: 'Serviço Sem Resposta', color: '#f87171', dotColor: '#ef4444' };
      case 'error':
        return { label: 'Erro', color: '#f87171', dotColor: '#ef4444' };
      default:
        return { label: 'Desconhecido', color: '#94a3b8', dotColor: '#94a3b8' };
    }
  }, []);

  const getEmptyMessage = useCallback((status, title) => {
    switch (status) {
      case 'idle':
        return `Reunião "${title}" pronta. Clique em "Ativar Transcrição" e fale uma frase curta.`;
      case 'requesting_permission':
        return 'Solicitando acesso ao microfone... Por favor, autorize nas permissões do navegador.';
      case 'media_ready':
        return 'Microfone configurado com sucesso. Clique em "Ativar Transcrição" para iniciar o reconhecimento de voz.';
      case 'recognition_starting':
        return 'Conectando ao reconhecimento de voz do navegador... Aguarde o handshake com o motor de áudio.';
      case 'listening':
        return 'Microfone ativo e captando som. Ainda não detectamos fala. Fale uma frase clara próximo ao microfone.';
      case 'receiving_speech':
        return 'Transcrevendo áudio em tempo real...';
      case 'paused':
        return 'Gravação pausada temporariamente. Clique em Retomar para continuar.';
      case 'unsupported':
        return 'Este navegador não oferece transcrição nativa (Web Speech API). Recomendamos o Google Chrome ou Microsoft Edge em desktop.';
      case 'permission_denied':
        return 'Permissão de microfone negada. Clique no ícone de cadeado na barra de endereços do navegador e permita o microfone.';
      case 'no_audio_input':
        return 'Nenhum sinal detectado no microfone selecionado. Verifique se o microfone não está silenciado no sistema ou selecione outro dispositivo no cabeçalho.';
      case 'browser_blocked':
        return 'O serviço de reconhecimento de voz foi bloqueado pelo navegador (comum no Brave Shields ou políticas corporativas). Use o Google Chrome ou autorize o Google Speech API.';
      case 'service_unavailable':
        return 'O serviço de reconhecimento de voz do navegador não respondeu aos servidores de áudio. O microfone está captando normalmente, mas a rede/servidor não retornou dados. Você pode tentar novamente ou usar o botão "Digitar Manualmente" para não perder anotações.';
      case 'error':
        return 'Ocorreu um erro no reconhecimento de voz. Clique em "Tentar Novamente" ou insira anotações manualmente.';
      default:
        return `Aguardando áudio da reunião "${title}"...`;
    }
  }, []);

  // Copia relatório estruturado de diagnóstico sem dados de áudio bruto (PARTE 1)
  const copyDiagnosticToClipboard = useCallback(() => {
    const diagText = `--- RELATÓRIO TÉCNICO DE DIAGNÓSTICO (PROTON FLOW) ---
Data/Hora: ${new Date().toLocaleString('pt-BR')}
Reunião ID: ${activeMeetingIdRef.current || 'Nenhum'}
Sessão Ativa: ${diagnosticInfo.activeSessionId || 'Nenhuma'}
Navegador: ${diagnosticInfo.browser}
Origem/Host: ${diagnosticInfo.origin || (typeof window !== 'undefined' ? window.location.origin : '')}
Engine Web Speech: ${diagnosticInfo.engine}
Idioma: ${diagnosticInfo.lang}
Status da Transcrição: ${transcriptionStatus}
Engine State: ${engineState}
Serviço de Voz: ${recognitionServiceState}
Microfone Status: ${audioStatus}
Nível de Sinal: ${audioLevelRef.current}% (${audioLevelRef.current > 4 ? 'Sinal Detectado' : 'Sem Sinal'})
Audio Track State: ${diagnosticInfo.audioTrackState}
Chamadas start(): ${diagnosticInfo.startCalledCount}
Última Exceção de start(): ${diagnosticInfo.lastException || 'Nenhuma'}
Último Evento: ${diagnosticInfo.lastEvent} (${diagnosticInfo.lastEventTime || 'Nenhum'})
Último Erro: ${diagnosticInfo.lastError || 'Nenhum'}
Resultados Recebidos: ${diagnosticInfo.resultsCount}
Caracteres Acumulados: ${diagnosticInfo.finalCharsCount}
Provedor STT Ativo: ${sttProvider}
Backend STT (faster-whisper): ${backendSttStatus.available ? `Disponível (${backendSttStatus.provider}, model=${backendSttStatus.model}, device=${backendSttStatus.device})` : `Indisponível (${backendSttStatus.reason || 'ausente'})`}
Chunks de Áudio Processados: ${backendChunkStats.chunkCount} (último: ${backendChunkStats.lastProcessingTimeMs}ms)
-------------------------------------------------------`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(diagText).then(() => {
        setCopiedDiagnostic(true);
        setTimeout(() => setCopiedDiagnostic(false), 2500);
      }).catch((e) => {
        console.warn('Erro ao copiar diagnóstico:', e);
      });
    }
  }, [diagnosticInfo, transcriptionStatus, engineState, recognitionServiceState, audioStatus, sttProvider, backendSttStatus, backendChunkStats]);

  // Salvamento automático da transcrição no backend (com debounce e sessão)
  const saveTranscriptToBackend = useCallback(
    async (text, isIncremental = false) => {
      const targetId = activeMeetingIdRef.current;
      if (!targetId || !text) return;
      setSyncStatus('saving');
      try {
        await api.updateLiveTranscript(targetId, text, isIncremental, sessionTokenRef.current);
        setSyncStatus('synced');
      } catch (e) {
        console.warn('Erro ao salvar transcrição incremental no backend:', e);
        setSyncStatus('unsaved');
      }
    },
    []
  );

  // VU Meter & Analyser de Áudio para diagnóstico visual de captação
  const setupAudioAnalyser = useCallback((stream) => {
    try {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
        audioContextRef.current = null;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioTracks = stream ? stream.getAudioTracks() : [];
      if (audioTracks.length > 0) {
        const t = audioTracks[0];
        setDiagnosticInfo((prev) => ({
          ...prev,
          audioTrackState: `${t.label || 'Microfone'} (readyState: ${t.readyState}, enabled: ${t.enabled}, muted: ${t.muted})`
        }));
      }
      if (!AudioCtx || audioTracks.length === 0) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      // NUNCA conectar ao audioCtx.destination para evitar eco/microfonia local no alto-falante
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current || !isRecordingRef.current) {
          audioLevelRef.current = 0;
          setAudioLevel(0);
          return;
        }
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        // Normaliza valor de 0 a 100
        const level = Math.min(100, Math.round((avg / 128) * 100));
        audioLevelRef.current = level;
        setAudioLevel(level);
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      animFrameRef.current = requestAnimationFrame(updateVolume);
    } catch (err) {
      console.warn('Não foi possível iniciar AudioAnalyser:', err);
    }
  }, []);

  // Suporte a formatos de áudio do MediaRecorder (PARTE 8)
  const getSupportedAudioMimeType = useCallback(() => {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/wav'
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return '';
  }, []);

  // Parada limpa do MediaRecorder de backend
  const stopBackendRecorder = useCallback(() => {
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (err) {
        console.warn('Erro ao parar MediaRecorder:', err);
      }
      mediaRecorderRef.current = null;
    }
  }, []);

  // Início do MediaRecorder para chunks backend de áudio (PARTE 8, 9, 10)
  const startBackendRecorder = useCallback((stream) => {
    const targetMeetingId = activeMeetingIdRef.current;
    if (!targetMeetingId || !stream) return;

    // Regra estrita: apenas trilha de áudio, nunca vídeo no recorder do STT
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn('[STT Backend] Nenhuma trilha de áudio no stream');
      return;
    }

    const audioOnlyStream = new MediaStream(audioTracks);

    stopBackendRecorder();

    const mimeType = getSupportedAudioMimeType();
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(audioOnlyStream, { mimeType }) : new MediaRecorder(audioOnlyStream);
    } catch (e) {
      console.warn('[STT Backend] Falha com mimeType, tentando padrão:', e);
      try {
        recorder = new MediaRecorder(audioOnlyStream);
      } catch (e2) {
        console.error('[STT Backend] MediaRecorder indisponível:', e2);
        setError('MediaRecorder de áudio não suportado no navegador.');
        return;
      }
    }

    const sessionId = `stt_${targetMeetingId.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    backendSessionIdRef.current = sessionId;
    chunkSequenceRef.current = 0;
    isPausedRef.current = false;

    setDiagnosticInfo((prev) => ({
      ...prev,
      engine: 'Backend STT (faster-whisper)',
      activeSessionId: sessionId,
      lastEvent: 'media_recorder_started',
      lastEventTime: new Date().toLocaleTimeString('pt-BR'),
      lastError: null
    }));

    recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) return;
      if (activeMeetingIdRef.current !== targetMeetingId) return;
      if (isPausedRef.current) return;

      const currentSeq = chunkSequenceRef.current++;
      const blob = event.data;

      const uploadChunk = async (attemptsLeft = 2) => {
        try {
          setTranscriptionStatus('receiving_speech');
          transcriptionStatusRef.current = 'receiving_speech';

          const res = await api.uploadAudioChunk(targetMeetingId, blob, {
            sessionId,
            sequence: currentSeq,
            mimeType: recorder.mimeType || mimeType,
            language: 'pt'
          });

          if (activeMeetingIdRef.current !== targetMeetingId) return;

          if (res) {
            if (res.signal_quality) {
              setSignalQuality(res.signal_quality);
            }
            if (res.transcript_raw) {
              setTranscriptRaw(res.transcript_raw);
            }
            if (res.transcript_normalized) {
              setTranscriptNormalized(res.transcript_normalized);
            }
            if (res.transcript) {
              setTranscription(res.transcript);
              finalTranscriptRef.current = res.transcript;
            } else if (res.text && res.text.trim()) {
              const chunkText = res.text.trim();
              setTranscription((prev) => {
                const currentFull = (prev || '').trim();
                if (currentFull.endsWith(chunkText)) return currentFull;
                return currentFull ? `${currentFull} ${chunkText}` : chunkText;
              });
              finalTranscriptRef.current = (finalTranscriptRef.current ? `${finalTranscriptRef.current.trim()} ` : '') + `${chunkText} `;
            }
          }

          setBackendChunkStats((prev) => ({
            chunkCount: currentSeq + 1,
            lastProcessingTimeMs: res.processing_time_ms || 0,
            lastDuration: res.duration || 4.0,
            latencyHistory: [...(prev.latencyHistory || []).slice(-9), res.processing_time_ms || 0]
          }));

          setTranscriptionStatus('listening');
          transcriptionStatusRef.current = 'listening';
          setError('');
        } catch (err) {
          console.warn(`[STT Backend] Falha no chunk seq=${currentSeq}:`, err);
          if (err.status === 503) {
            setTranscriptionStatus('service_unavailable');
            transcriptionStatusRef.current = 'service_unavailable';
            setBackendSttStatus((prev) => ({ ...prev, available: false, reason: err.reason || 'stt_unavailable' }));
            setError('O serviço de transcrição backend (faster-whisper) está indisponível. Alterne para o reconhecimento do navegador ou modo manual.');
            return;
          }

          if (attemptsLeft > 0) {
            await new Promise((r) => setTimeout(r, 600));
            return uploadChunk(attemptsLeft - 1);
          }
        }
      };

      uploadChunk();
    };

    recorder.onerror = (e) => {
      console.warn('[STT Backend] Erro no MediaRecorder:', e);
    };

    try {
      recorder.start(4000); // Envia chunk a cada 4 segundos
      mediaRecorderRef.current = recorder;
      setTranscriptionStatus('listening');
      transcriptionStatusRef.current = 'listening';
      setEngineState('ativa');
    } catch (err) {
      console.error('[STT Backend] Falha ao iniciar MediaRecorder.start(4000):', err);
    }
  }, [getSupportedAudioMimeType, stopBackendRecorder]);

  // Inicia o motor Web Speech API de forma resiliente e instrumentada (PARTES 3, 4, 5, 6, 7)
  const startSpeechRecognition = useCallback((_isManualGesture = false) => {
    const targetMeetingId = activeMeetingIdRef.current;
    if (!targetMeetingId) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[SpeechRecognition] API não disponível no navegador.');
      setTranscriptionStatus('unsupported');
      transcriptionStatusRef.current = 'unsupported';
      setError('Este navegador não oferece suporte nativo ao reconhecimento de voz (Web Speech API). Recomendamos o Google Chrome ou Microsoft Edge.');
      setDiagnosticInfo((prev) => ({ ...prev, engine: 'Indisponível', lastError: 'API não suportada' }));
      return;
    }

    // Limpa instância anterior de forma imediata com abort() para liberar recurso
    if (recognitionRef.current) {
      try {
        const old = recognitionRef.current;
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
      } catch (err) {
        console.warn('Erro ao abortar reconhecimento prévio:', err);
      }
      recognitionRef.current = null;
    }

    if (startingTimeoutRef.current) {
      clearTimeout(startingTimeoutRef.current);
      startingTimeoutRef.current = null;
    }

    const sessionToken = `${targetMeetingId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    sessionTokenRef.current = sessionToken;
    isPausedRef.current = false;
    consecutiveErrorsRef.current = 0;

    const engineName = window.SpeechRecognition ? 'SpeechRecognition' : 'webkitSpeechRecognition';
    console.log(`[SpeechRecognition] Inicializando motor (${engineName}) para reunião ${targetMeetingId.slice(0, 8)}...`);

    setDiagnosticInfo((prev) => ({
      ...prev,
      engine: engineName,
      lang: 'pt-BR',
      activeSessionId: sessionToken,
      lastEvent: 'iniciando_instancia',
      lastEventTime: new Date().toLocaleTimeString('pt-BR'),
      lastError: null,
      lastException: null,
      eventsReceived: {
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
      }
    }));

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';
    recognition.maxAlternatives = 1;

    // PARTE 2 & 3: Timeout de segurança (4.5s) com classificação precisa de falha
    startingTimeoutRef.current = setTimeout(() => {
      if (sessionTokenRef.current === sessionToken && transcriptionStatusRef.current === 'recognition_starting') {
        console.warn('[SpeechRecognition] Timeout de 4.5s expirou sem evento onstart');
        const isBrave = (typeof navigator !== 'undefined') && (Boolean(navigator.brave) || navigator.userAgent.includes('Brave'));
        if (audioLevelRef.current <= 4) {
          setTranscriptionStatus('no_audio_input');
          transcriptionStatusRef.current = 'no_audio_input';
          setEngineState('sem_sinal');
          setRecognitionServiceState('nao_testado');
          setError('Nenhum sinal detectado no microfone selecionado. Verifique se o microfone não está mudo no sistema ou selecione outro dispositivo.');
        } else if (isBrave) {
          setTranscriptionStatus('browser_blocked');
          transcriptionStatusRef.current = 'browser_blocked';
          setEngineState('falhou');
          setRecognitionServiceState('bloqueado');
          setError('Navegador Brave detectado: o Brave bloqueia o Google Speech Services por padrão nas configurações de privacidade (Brave Shields). Habilite o serviço ou use Google Chrome/Edge.');
        } else {
          setTranscriptionStatus('service_unavailable');
          transcriptionStatusRef.current = 'service_unavailable';
          setEngineState('sem_resposta');
          setRecognitionServiceState('sem_resposta');
          setError('O serviço de reconhecimento de voz do navegador não respondeu aos servidores de áudio. O microfone local está funcionando com captação ativa, mas os servidores de voz não retornaram resposta.');
        }
      }
    }, 4500);

    // PARTE 5: Instrumentação de todos os eventos
    recognition.onstart = () => {
      if (sessionTokenRef.current !== sessionToken || activeMeetingIdRef.current !== targetMeetingId) return;
      if (startingTimeoutRef.current) {
        clearTimeout(startingTimeoutRef.current);
        startingTimeoutRef.current = null;
      }
      console.log('[SpeechRecognition] Evento onstart disparado com sucesso');
      isListeningRef.current = true;
      setTranscriptionStatus('listening');
      transcriptionStatusRef.current = 'listening';
      setEngineState('ativa');
      setRecognitionServiceState('conectado');
      setError('');
      setDiagnosticInfo((prev) => ({
        ...prev,
        lastEvent: 'onstart',
        lastEventTime: new Date().toLocaleTimeString('pt-BR'),
        lastError: null,
        eventsReceived: { ...(prev.eventsReceived || {}), onstart: true }
      }));
    };

    recognition.onaudiostart = () => {
      if (sessionTokenRef.current !== sessionToken || activeMeetingIdRef.current !== targetMeetingId) return;
      if (startingTimeoutRef.current) {
        clearTimeout(startingTimeoutRef.current);
        startingTimeoutRef.current = null;
      }
      setDiagnosticInfo((prev) => ({
        ...prev,
        lastEvent: 'onaudiostart',
        lastEventTime: new Date().toLocaleTimeString('pt-BR'),
        eventsReceived: { ...(prev.eventsReceived || {}), onaudiostart: true }
      }));
    };

    recognition.onsoundstart = () => {
      if (sessionTokenRef.current !== sessionToken || activeMeetingIdRef.current !== targetMeetingId) return;
      setDiagnosticInfo((prev) => ({
        ...prev,
        lastEvent: 'onsoundstart',
        lastEventTime: new Date().toLocaleTimeString('pt-BR'),
        eventsReceived: { ...(prev.eventsReceived || {}), onsoundstart: true }
      }));
    };

    recognition.onspeechstart = () => {
      if (sessionTokenRef.current !== sessionToken || activeMeetingIdRef.current !== targetMeetingId) return;
      setTranscriptionStatus('receiving_speech');
      transcriptionStatusRef.current = 'receiving_speech';
      setDiagnosticInfo((prev) => ({
        ...prev,
        lastEvent: 'onspeechstart',
        lastEventTime: new Date().toLocaleTimeString('pt-BR'),
        eventsReceived: { ...(prev.eventsReceived || {}), onspeechstart: true }
      }));
    };

    // PARTE 6: Processamento de onresult sem duplicatas e com isolamento estrito
    recognition.onresult = (event) => {
      if (sessionTokenRef.current !== sessionToken || activeMeetingIdRef.current !== targetMeetingId) return;

      let interim = '';
      let newlyFinal = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        if (res.isFinal) {
          newlyFinal += res[0].transcript + ' ';
        } else {
          interim += res[0].transcript;
        }
      }

      if (newlyFinal) {
        const cleanFinal = newlyFinal.trim();
        if (cleanFinal) {
          finalTranscriptRef.current = (finalTranscriptRef.current ? finalTranscriptRef.current.trim() + ' ' : '') + cleanFinal + ' ';
        }
      }

      const fullDisplay = (finalTranscriptRef.current + interim).trim();
      setTranscription(fullDisplay);
      setTranscriptionStatus('receiving_speech');
      transcriptionStatusRef.current = 'receiving_speech';

      setDiagnosticInfo((prev) => ({
        ...prev,
        lastEvent: 'onresult',
        lastEventTime: new Date().toLocaleTimeString('pt-BR'),
        resultsCount: prev.resultsCount + 1,
        finalCharsCount: finalTranscriptRef.current.length,
        eventsReceived: { ...(prev.eventsReceived || {}), onresult: true }
      }));

      // Auto-save com debounce de 3s
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(async () => {
        if (activeMeetingIdRef.current === targetMeetingId && fullDisplay) {
          saveTranscriptToBackend(fullDisplay, false);
        }
      }, 3000);
    };

    recognition.onspeechend = () => {
      if (sessionTokenRef.current !== sessionToken || activeMeetingIdRef.current !== targetMeetingId) return;
      if (transcriptionStatusRef.current === 'receiving_speech') {
        setTranscriptionStatus('listening');
        transcriptionStatusRef.current = 'listening';
      }
      setDiagnosticInfo((prev) => ({
        ...prev,
        lastEvent: 'onspeechend',
        lastEventTime: new Date().toLocaleTimeString('pt-BR'),
        eventsReceived: { ...(prev.eventsReceived || {}), onspeechend: true }
      }));
    };

    recognition.onsoundend = () => {
      if (sessionTokenRef.current !== sessionToken || activeMeetingIdRef.current !== targetMeetingId) return;
      setDiagnosticInfo((prev) => ({
        ...prev,
        lastEvent: 'onsoundend',
        lastEventTime: new Date().toLocaleTimeString('pt-BR'),
        eventsReceived: { ...(prev.eventsReceived || {}), onsoundend: true }
      }));
    };

    recognition.onaudioend = () => {
      if (sessionTokenRef.current !== sessionToken || activeMeetingIdRef.current !== targetMeetingId) return;
      setDiagnosticInfo((prev) => ({
        ...prev,
        lastEvent: 'onaudioend',
        lastEventTime: new Date().toLocaleTimeString('pt-BR'),
        eventsReceived: { ...(prev.eventsReceived || {}), onaudioend: true }
      }));
    };

    // Classificação de erros com mensagens explícitas em português (PARTE 8)
    recognition.onerror = (event) => {
      if (sessionTokenRef.current !== sessionToken || activeMeetingIdRef.current !== targetMeetingId) return;
      console.warn('[SpeechRecognition] Evento onerror:', event.error);
      if (startingTimeoutRef.current) {
        clearTimeout(startingTimeoutRef.current);
        startingTimeoutRef.current = null;
      }

      const errType = event.error;
      setDiagnosticInfo((prev) => ({
        ...prev,
        lastEvent: 'onerror',
        lastEventTime: new Date().toLocaleTimeString('pt-BR'),
        lastError: `${errType} - ${event.message || 'Sem detalhes'}`,
        eventsReceived: { ...(prev.eventsReceived || {}), onerror: true }
      }));

      if (errType === 'not-allowed') {
        consecutiveErrorsRef.current += 10;
        setTranscriptionStatus('permission_denied');
        transcriptionStatusRef.current = 'permission_denied';
        setEngineState('falhou');
        setError('O navegador não autorizou o microfone ou o reconhecimento de voz. Libere no ícone de cadeado do navegador.');
      } else if (errType === 'service-not-allowed') {
        consecutiveErrorsRef.current += 10;
        setTranscriptionStatus('browser_blocked');
        transcriptionStatusRef.current = 'browser_blocked';
        setEngineState('falhou');
        setRecognitionServiceState('bloqueado');
        setError('Serviço de voz bloqueado pelo navegador (comum no Brave Shields ou políticas corporativas). Use Google Chrome/Edge ou desative proteções de reconhecimento de voz.');
      } else if (errType === 'audio-capture') {
        consecutiveErrorsRef.current += 2;
        setTranscriptionStatus('no_audio_input');
        transcriptionStatusRef.current = 'no_audio_input';
        setEngineState('sem_sinal');
        setError('Nenhum microfone capturado. Confirme o dispositivo de áudio selecionado.');
      } else if (errType === 'network') {
        consecutiveErrorsRef.current += 2;
        setTranscriptionStatus('service_unavailable');
        transcriptionStatusRef.current = 'service_unavailable';
        setEngineState('sem_resposta');
        setRecognitionServiceState('sem_resposta');
        setError('Erro de conexão com os servidores de voz (Google Speech API inacessível). Verifique sua conexão com a internet ou firewall.');
      } else if (errType === 'language-not-supported') {
        consecutiveErrorsRef.current += 10;
        setTranscriptionStatus('unsupported');
        transcriptionStatusRef.current = 'unsupported';
        setEngineState('falhou');
        setError('O idioma pt-BR não é suportado pelo motor do navegador.');
      } else if (errType === 'no-speech') {
        // Silêncio momentâneo normal do usuário
        if (transcriptionStatusRef.current !== 'listening' && transcriptionStatusRef.current !== 'receiving_speech') {
          setTranscriptionStatus('listening');
          transcriptionStatusRef.current = 'listening';
        }
      } else if (errType === 'aborted') {
        isListeningRef.current = false;
      } else {
        consecutiveErrorsRef.current += 1;
        setTranscriptionStatus('error');
        transcriptionStatusRef.current = 'error';
        setEngineState('falhou');
        setError(`Erro no reconhecimento de voz (${errType}).`);
      }
    };

    // PARTE 7: Reinício controlado com backoff após onend
    recognition.onend = () => {
      if (sessionTokenRef.current !== sessionToken || activeMeetingIdRef.current !== targetMeetingId) return;
      isListeningRef.current = false;
      if (startingTimeoutRef.current) {
        clearTimeout(startingTimeoutRef.current);
        startingTimeoutRef.current = null;
      }
      setDiagnosticInfo((prev) => ({
        ...prev,
        lastEvent: 'onend',
        lastEventTime: new Date().toLocaleTimeString('pt-BR'),
        eventsReceived: { ...(prev.eventsReceived || {}), onend: true }
      }));

      const isFatalError =
        transcriptionStatusRef.current === 'browser_blocked' ||
        transcriptionStatusRef.current === 'service_unavailable' ||
        transcriptionStatusRef.current === 'permission_denied' ||
        transcriptionStatusRef.current === 'unsupported';

      const shouldRestart =
        !isFatalError &&
        isRecordingRef.current &&
        currentMeetingRef.current?.STATUS_MEETING === 'ao_vivo' &&
        !isPausedRef.current &&
        consecutiveErrorsRef.current < 4;

      if (shouldRestart) {
        setTimeout(() => {
          if (sessionTokenRef.current === sessionToken && isRecordingRef.current) {
            try {
              if (recognitionRef.current) {
                recognitionRef.current.start();
              }
            } catch (e) {
              console.warn('[SpeechRecognition] Erro ao reiniciar:', e);
            }
          }
        }, 350);
      } else {
        if (consecutiveErrorsRef.current >= 4) {
          setTranscriptionStatus('service_unavailable');
          transcriptionStatusRef.current = 'service_unavailable';
          setEngineState('falhou');
          setRecognitionServiceState('sem_resposta');
          setError('O serviço de reconhecimento de voz falhou repetidamente. Verifique sua rede ou use "Digitar Manualmente".');
        } else if (isPausedRef.current) {
          setTranscriptionStatus('paused');
          transcriptionStatusRef.current = 'paused';
        } else if (!isFatalError) {
          setEngineState('encerrada');
        }
      }
    };

    recognitionRef.current = recognition;

    // Executa start() sincronamente no mesmo call stack (PARTE 2)
    setTranscriptionStatus('recognition_starting');
    transcriptionStatusRef.current = 'recognition_starting';
    setEngineState('iniciando');

    try {
      recognition.start();
      setDiagnosticInfo((prev) => ({
        ...prev,
        startCalledCount: prev.startCalledCount + 1,
        lastException: null
      }));
    } catch (e) {
      console.warn('[SpeechRecognition] Exceção ao chamar recognition.start():', e);
      if (e.name === 'InvalidStateError') {
        // Chromium liberando sessão anterior: retenta após 200ms
        setTimeout(() => {
          if (sessionTokenRef.current === sessionToken && activeMeetingIdRef.current === targetMeetingId) {
            try {
              recognition.start();
              setDiagnosticInfo((prev) => ({
                ...prev,
                startCalledCount: prev.startCalledCount + 1,
                lastException: null
              }));
            } catch (retryErr) {
              if (startingTimeoutRef.current) clearTimeout(startingTimeoutRef.current);
              setTranscriptionStatus('error');
              transcriptionStatusRef.current = 'error';
              setEngineState('falhou');
              setError(`Falha ao iniciar reconhecimento: ${retryErr.message || retryErr.name}`);
              setDiagnosticInfo((prev) => ({ ...prev, lastException: retryErr.name || retryErr.message }));
            }
          }
        }, 200);
      } else {
        if (startingTimeoutRef.current) clearTimeout(startingTimeoutRef.current);
        setTranscriptionStatus('error');
        transcriptionStatusRef.current = 'error';
        setEngineState('falhou');
        setError(`Falha ao iniciar reconhecimento: ${e.message || e.name}`);
        setDiagnosticInfo((prev) => ({ ...prev, lastException: e.name || e.message }));
      }
    }
  }, [saveTranscriptToBackend]);

  // Alternância transparente entre provedores de transcrição (PARTE 7, 11)
  const handleSelectProvider = useCallback((newProvider) => {
    setSttProvider(newProvider);
    sttProviderRef.current = newProvider;
    setError('');

    if (newProvider === 'backend') {
      setIsManualEditMode(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
      if (streamRef.current && isRecordingRef.current) {
        startBackendRecorder(streamRef.current);
      }
    } else if (newProvider === 'browser') {
      setIsManualEditMode(false);
      stopBackendRecorder();
      if (streamRef.current && isRecordingRef.current) {
        startSpeechRecognition(true);
      }
    } else if (newProvider === 'manual') {
      stopBackendRecorder();
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }
      setIsManualEditMode(true);
    }
  }, [startBackendRecorder, stopBackendRecorder, startSpeechRecognition]);

  // Parar mídia e reconhecimento de forma estrita e segura
  const stopMediaAndRecognition = useCallback(() => {
    isRecordingRef.current = false;
    isListeningRef.current = false;
    isRequestingMediaRef.current = false;
    isPausedRef.current = true;

    stopBackendRecorder();

    if (startingTimeoutRef.current) {
      clearTimeout(startingTimeoutRef.current);
      startingTimeoutRef.current = null;
    }

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    audioLevelRef.current = 0;
    setAudioLevel(0);

    if (recognitionRef.current) {
      try {
        const old = recognitionRef.current;
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
      } catch {}
      recognitionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsRecording(false);
    setAudioStatus('unavailable');
    setVideoStatus('unavailable');
    setTranscriptionStatus('idle');
    transcriptionStatusRef.current = 'idle';
    sessionTokenRef.current = null;
    setEngineState('encerrada');
    setIsManualEditMode(false);
  }, [stopBackendRecorder]);

  // Iniciar reconhecimento de voz e mídia na sala ativa com resiliência total
  const startMediaAndRecognition = useCallback(async () => {
    if (!activeMeetingId) return;
    if (isRequestingMediaRef.current) return;
    isRequestingMediaRef.current = true;
    isPausedRef.current = false;

    setMediaPermission('requesting');
    setAudioStatus('requesting');
    setVideoStatus('requesting');
    setMediaError('');
    setCameraNotice('');

    // Validação de contexto seguro e suporte nativo a mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errMsg = 'Seu navegador não suporta captura de mídia via navigator.mediaDevices.getUserMedia. Utilize HTTPS ou localhost.';
      setMediaError(errMsg);
      setMediaPermission('unavailable');
      setAudioStatus('unavailable');
      setVideoStatus('unavailable');
      setTranscriptionStatus('unsupported');
      transcriptionStatusRef.current = 'unsupported';
      isRequestingMediaRef.current = false;
      return;
    }

    // Constraints de áudio seguras (evita OverconstrainedError com 'default')
    let audioConstraints = true;
    if (selectedAudioDeviceId && selectedAudioDeviceId !== 'default') {
      audioConstraints = { deviceId: { ideal: selectedAudioDeviceId } };
    }

    let stream = null;
    let cameraAcquired = false;

    // Tentativa 1: Obter Áudio e Vídeo conjuntamente
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      cameraAcquired = true;
    } catch (primaryErr) {
      console.warn('Não foi possível obter vídeo e áudio juntos:', primaryErr);
      // Tentativa 2: Fallback gracioso para apenas Áudio
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false
        });
        cameraAcquired = false;
        setCameraNotice('Câmera não detectada ou ocupada por outro aplicativo. A reunião prosseguirá normalmente apenas com áudio.');
      } catch (audioErr) {
        console.error('Falha crítica ao obter áudio:', audioErr);
        isRequestingMediaRef.current = false;
        let translatedError = 'Não foi possível acessar o microfone.';
        if (audioErr.name === 'NotAllowedError' || audioErr.name === 'PermissionDeniedError') {
          translatedError = 'Permissão de microfone negada no navegador. Permita o acesso ao microfone nas configurações da página para que sua voz seja capturada e transcrita.';
          setMediaPermission('denied');
          setAudioStatus('denied');
        } else if (audioErr.name === 'NotFoundError' || audioErr.name === 'DevicesNotFoundError') {
          translatedError = 'Nenhum microfone encontrado. Conecte um microfone para participar da reunião.';
          setMediaPermission('unavailable');
          setAudioStatus('unavailable');
        } else if (audioErr.name === 'NotReadableError' || audioErr.name === 'TrackStartError') {
          translatedError = 'O microfone está em uso exclusivo por outro programa ou pelo sistema operacional.';
          setMediaPermission('unavailable');
          setAudioStatus('unavailable');
        } else {
          translatedError = `Erro ao capturar microfone: ${audioErr.message || audioErr.name}`;
          setMediaPermission('unavailable');
          setAudioStatus('unavailable');
        }
        setVideoStatus('unavailable');
        setMediaError(translatedError);
        setError(translatedError);
        return;
      }
    }

    isRequestingMediaRef.current = false;
    setMediaPermission('granted');

    // Validação e listeners da trilha de áudio
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setAudioStatus('unavailable');
      setMediaError('O fluxo de áudio foi aberto, mas nenhuma trilha ativa foi retornada.');
    } else {
      setAudioStatus(audioTracks[0].enabled ? 'active' : 'muted');
      setIsMuted(!audioTracks[0].enabled);
      audioTracks[0].onended = () => {
        console.warn('Trilha de áudio finalizada pelo sistema');
        setAudioStatus('ended');
      };
      audioTracks[0].onmute = () => {
        setAudioStatus('muted');
      };
      audioTracks[0].onunmute = () => {
        setAudioStatus('active');
      };
    }

    // Validação e listeners da trilha de vídeo
    const videoTracks = stream.getVideoTracks();
    if (cameraAcquired && videoTracks.length > 0) {
      setVideoStatus('active');
      setIsCamOff(false);
      videoTracks[0].onended = () => {
        console.warn('Trilha de vídeo finalizada');
        setVideoStatus('ended');
        setIsCamOff(true);
      };
    } else {
      setVideoStatus('disabled');
      setIsCamOff(true);
    }

    streamRef.current = stream;
    isRecordingRef.current = true;
    setIsRecording(true);

    // Conecta stream ao elemento <video>
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          videoRef.current.play().catch((e) => console.warn('Erro ao reproduzir vídeo:', e));
        }
      };
    }

    // Inicia VU meter
    setupAudioAnalyser(stream);

    // Inicia reconhecimento de voz com base no provedor ativo
    if (sttProviderRef.current === 'backend' && backendSttStatus.available) {
      startBackendRecorder(stream);
    } else if (sttProviderRef.current === 'browser') {
      startSpeechRecognition(false);
    } else if (sttProviderRef.current === 'manual') {
      setIsManualEditMode(true);
    } else {
      if (backendSttStatus.available) {
        startBackendRecorder(stream);
      } else {
        startSpeechRecognition(false);
      }
    }
  }, [activeMeetingId, selectedAudioDeviceId, setupAudioAnalyser, startSpeechRecognition, startBackendRecorder, backendSttStatus.available]);

  // Controles de áudio e vídeo
  const toggleMute = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const nextState = !audioTrack.enabled;
        audioTrack.enabled = nextState;
        setIsMuted(!nextState);
        setAudioStatus(nextState ? 'active' : 'muted');
      }
    }
  };

  const toggleCamera = async () => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      const nextState = !videoTrack.enabled;
      videoTrack.enabled = nextState;
      setIsCamOff(!nextState);
      setVideoStatus(nextState ? 'active' : 'disabled');
      if (nextState && videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
    } else {
      // Se a reunião começou sem vídeo, tenta adquirir câmera dinamicamente agora
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        if (newVideoTrack) {
          streamRef.current.addTrack(newVideoTrack);
          setIsCamOff(false);
          setVideoStatus('active');
          setCameraNotice('');
          if (videoRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => {});
          }
          newVideoTrack.onended = () => {
            setIsCamOff(true);
            setVideoStatus('ended');
          };
        }
      } catch (err) {
        console.warn('Não foi possível ativar câmera sob demanda:', err);
        setCameraNotice('Não foi possível ativar a câmera: verifique permissões ou se o dispositivo está em uso.');
      }
    }
  };

  // Gerencia ciclo de vida da reunião (iniciar automaticamente se ao vivo ao entrar na sala)
  useEffect(() => {
    currentMeetingRef.current = currentMeeting;
    if (currentMeeting) {
      if (currentMeeting.STATUS_MEETING === 'ao_vivo') {
        setIsRecording(true);
        isRecordingRef.current = true;
        isPausedRef.current = false;
        if (!streamRef.current) {
          startMediaAndRecognition();
        }
      } else {
        setIsRecording(false);
        isRecordingRef.current = false;
        isPausedRef.current = currentMeeting.STATUS_MEETING === 'pausada';
        stopMediaAndRecognition();
      }
    } else {
      setIsRecording(false);
      isRecordingRef.current = false;
      isPausedRef.current = false;
      stopMediaAndRecognition();
    }
  }, [activeMeetingId, currentMeeting, startMediaAndRecognition, stopMediaAndRecognition]);

  // Limpeza estrita ao desmontar o componente
  useEffect(() => {
    return () => {
      stopMediaAndRecognition();
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [stopMediaAndRecognition]);

  // Transição de status da reunião
  const handleMeetingAction = async (meetingId, action) => {
    try {
      const res = await api.updateLiveMeetingStatus(meetingId, action);
      if (res && res.status === 'success') {
        // Atualiza estado local
        setMeetings((prev) =>
          prev.map((m) => (String(m.ID_MEETING) === String(meetingId) ? res.meeting : m))
        );

        if (meetingId === activeMeetingId) {
          if (action === 'iniciar' || action === 'retomar') {
            startMediaAndRecognition();
          } else if (action === 'pausar') {
            stopMediaAndRecognition();
          } else if (action === 'finalizar') {
            stopMediaAndRecognition();
            // Salva texto final
            await saveTranscriptToBackend(transcription);
            setActiveMeetingId(null);
            await loadLiveMeetings();
          }
        }
      }
    } catch (err) {
      console.error(`Erro ao executar ${action} na reunião ${meetingId}:`, err);
      alert(`Erro na transição da reunião: ${err.message || err}`);
    }
  };

  // Validação e criação de nova reunião (manual, sem criação automática)
  const handleCreateMeetingSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const errors = {};
    const cleanTitle = (newMeetingForm.titulo || '').trim();
    const cleanDept = (newMeetingForm.departamento || '').trim();
    const cleanData = (newMeetingForm.data || '').trim();
    const cleanHorario = (newMeetingForm.horario || '').trim();

    if (!cleanTitle) {
      errors.titulo = 'O nome/título da reunião é obrigatório.';
    } else if (cleanTitle.length < 2) {
      errors.titulo = 'O título deve conter ao menos 2 caracteres.';
    }

    if (!cleanDept) {
      errors.departamento = 'Selecione ou informe a área/equipe.';
    }

    if (!cleanData) {
      errors.data = 'A data da reunião é obrigatória.';
    }

    if (!cleanHorario) {
      errors.horario = 'O horário da reunião é obrigatório.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    try {
      setCreatingMeeting(true);
      const res = await api.createLiveMeeting({
        titulo: cleanTitle,
        departamento: cleanDept,
        data: cleanData,
        horario: cleanHorario,
        participantes: (newMeetingForm.participantes || '').trim(),
        fonte_audio: newMeetingForm.fonte_audio || 'Microfone Padrão',
        iniciar_agora: Boolean(newMeetingForm.iniciar_agora)
      });
      if (res && res.meeting) {
        await loadLiveMeetings();
        setShowCreateModal(false);
        setNewMeetingForm(initialFormState);
        setFormErrors({});
        if (newMeetingForm.iniciar_agora) {
          setActiveMeetingId(res.meeting.ID_MEETING);
        }
      }
    } catch (err) {
      console.error('Erro ao criar reunião ao vivo:', err);
      alert(`Erro ao criar reunião: ${err.message || err}`);
    } finally {
      setCreatingMeeting(false);
    }
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setNewMeetingForm(initialFormState);
    setFormErrors({});
  };

  // Controle de sugestões de título pela IA pós-análise
  const [dismissedAiSuggestions, setDismissedAiSuggestions] = useState({});

  const handleApplyAiTitle = async (meetingId, suggestedTitle) => {
    try {
      await api.updateMetadata(meetingId, { TITULO_REUNIAO: suggestedTitle });
      await loadLiveMeetings();
    } catch (e) {
      console.error('Erro ao aplicar título sugerido:', e);
      alert('Não foi possível aplicar o título sugerido.');
    }
  };

  const handleDismissAiTitle = (meetingId) => {
    setDismissedAiSuggestions((prev) => ({ ...prev, [meetingId]: true }));
  };

  // Finalizar e ir para análise
  const handleFinishAndAnalyze = async () => {
    if (!currentMeeting) return;
    const mid = currentMeeting.ID_MEETING;
    stopMediaAndRecognition();
    await saveTranscriptToBackend(transcription);
    await handleMeetingAction(mid, 'finalizar');

    if (onLeaveMeeting) {
      await onLeaveMeeting(transcription, mid);
    } else if (onAnalyzeMeeting) {
      onAnalyzeMeeting(mid);
    }
  };

  // Formatar tempo em HH:MM:SS
  const formatTimer = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs > 0 ? `${hrs.toString().padStart(2, '0')}:` : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Badge visual de status
  const getStatusBadge = (status) => {
    switch (status) {
      case 'ao_vivo':
        return { label: 'Ao Vivo', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', icon: true };
      case 'agendada':
        return { label: 'Agendada', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.15)', border: 'rgba(2, 132, 199, 0.4)' };
      case 'pausada':
        return { label: 'Pausada', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.4)' };
      case 'concluida':
        return { label: 'Concluída', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)' };
      case 'cancelada':
        return { label: 'Cancelada', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', border: 'rgba(100, 116, 139, 0.4)' };
      default:
        return { label: status || 'Desconhecido', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', border: 'rgba(100, 116, 139, 0.3)' };
    }
  };

  const handleActivateTranscription = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    if (sttProvider === 'backend') {
      if (streamRef.current) {
        startBackendRecorder(streamRef.current);
      } else {
        startMediaAndRecognition();
      }
    } else if (sttProvider === 'browser') {
      startSpeechRecognition(true);
    } else {
      setIsManualEditMode(true);
    }
  };

  // =========================================================================
  // VIEW 1: SALA DE REUNIÃO ATIVA (ROOM VIEW)
  // =========================================================================
  if (currentMeeting) {
    const badge = getStatusBadge(currentMeeting.STATUS_MEETING);

    return (
      <div className="live-room-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100vh', background: 'var(--bg-main)' }}>
        {/* Barra superior de alternância entre múltiplas reuniões ao vivo simultâneas */}
        {otherLiveMeetings.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 16px',
            background: 'var(--panel-hover)',
            borderBottom: '1px solid var(--border-color)',
            overflowX: 'auto',
            fontSize: '12px'
          }}>
            <span style={{ fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Radio size={14} color="#ef4444" />
              Outras reuniões ao vivo agora:
            </span>
            {otherLiveMeetings.map((om) => (
              <button
                key={om.ID_MEETING}
                type="button"
                onClick={() => setActiveMeetingId(om.ID_MEETING)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '11px',
                  whiteSpace: 'nowrap'
                }}
                title={`Alternar para ${om.TITULO_REUNIAO} (${om.DEPARTAMENTO}) às ${om.HORARIO_AGENDADO}`}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }}></span>
                <span>{om.TITULO_REUNIAO}</span>
                <span style={{ color: 'var(--text-muted)' }}>({om.DEPARTAMENTO} • {om.HORARIO_AGENDADO})</span>
              </button>
            ))}
          </div>
        )}

        {/* Header da Sala Ativa */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'var(--panel-bg)',
          borderBottom: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setActiveMeetingId(null)}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
              title="Voltar para a central de reuniões"
            >
              <ArrowLeft size={14} />
              Central de Reuniões
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  {currentMeeting.TITULO_REUNIAO}
                </h2>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: badge.bg,
                  color: badge.color,
                  border: `1px solid ${badge.border}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {badge.icon && <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color }}></span>}
                  {badge.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                <span>Equipe: <strong style={{ color: 'var(--text-main)' }}>{currentMeeting.DEPARTAMENTO || 'Geral'}</strong></span>
                <span>Horário: <strong style={{ color: 'var(--text-main)' }}>{currentMeeting.HORARIO_AGENDADO}</strong></span>
                <span>Data: {currentMeeting.DT_MEETING}</span>
                <span>Fonte: {currentMeeting.FONTE_AUDIO || 'Padrão'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Seletor de dispositivo de microfone */}
            {audioDevices.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                <Volume2 size={14} color="var(--text-muted)" />
                <select
                  value={selectedAudioDeviceId}
                  onChange={(e) => {
                    setSelectedAudioDeviceId(e.target.value);
                    if (isRecording) {
                      stopMediaAndRecognition();
                      setTimeout(() => startMediaAndRecognition(), 300);
                    }
                  }}
                  className="form-select"
                  style={{ fontSize: '11px', padding: '4px 8px', maxWidth: '180px' }}
                  title="Selecionar dispositivo de entrada de áudio desta reunião"
                >
                  {audioDevices.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Microfone ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Botão de abrir em nova aba para isolar salas */}
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}?view=meeting&id=${currentMeeting.ID_MEETING}`;
                window.open(url, '_blank');
              }}
              className="btn btn-secondary"
              style={{ fontSize: '11px', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              title="Abrir esta reunião em janela/aba separada para gravação paralela"
            >
              <ExternalLink size={13} />
              Abrir em Nova Aba
            </button>
          </div>
        </div>

        {/* Barra de Diagnóstico em Tempo Real (PARTE 4 & 9) */}
        <div className="live-diagnostic-bar" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 20px',
          background: 'rgba(15, 23, 42, 0.92)',
          borderBottom: '1px solid var(--border-color)',
          fontSize: '11px',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          {/* Indicadores Separados (PARTE 4) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {/* 1. Microfone */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Microfone:</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
                color: audioStatus === 'active' && !isMuted ? '#10b981' : isMuted ? '#eab308' : audioStatus === 'requesting' ? '#38bdf8' : '#ef4444'
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: audioStatus === 'active' && !isMuted ? '#10b981' : isMuted ? '#eab308' : audioStatus === 'requesting' ? '#38bdf8' : '#ef4444'
                }}></span>
                {audioStatus === 'active' && !isMuted ? 'Conectado' : isMuted ? 'Silenciado' : audioStatus === 'denied' ? 'Permissão Negada' : audioStatus === 'requesting' ? 'Conectando...' : 'Desconectado'}
              </span>
            </div>

            {/* 2. Sinal Físico */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Sinal:</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
                color: audioLevel > 4 ? '#10b981' : '#94a3b8'
              }}>
                {audioLevel > 4 ? 'Detectado' : 'Sem sinal'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }} title={`Nível de sinal físico: ${audioLevel}%`}>
                <div style={{ width: '36px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${audioLevel}%`,
                    height: '100%',
                    background: audioLevel > 60 ? '#ef4444' : audioLevel > 20 ? '#10b981' : '#38bdf8',
                    transition: 'width 0.08s ease'
                  }}></div>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: '20px' }}>{audioLevel}%</span>
              </div>
            </div>

            {/* 3. Câmera */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Câmera:</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
                color: videoStatus === 'active' && !isCamOff ? '#10b981' : isCamOff || videoStatus === 'disabled' ? '#94a3b8' : '#ef4444'
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: videoStatus === 'active' && !isCamOff ? '#10b981' : isCamOff || videoStatus === 'disabled' ? '#94a3b8' : '#ef4444'
                }}></span>
                {videoStatus === 'active' && !isCamOff ? 'Conectada' : isCamOff || videoStatus === 'disabled' ? 'Desligada' : videoStatus === 'denied' ? 'Sem Permissão' : 'Indisponível'}
              </span>
            </div>

            {/* 4. Transcrição / Serviço */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Transcrição:</span>
              {(() => {
                const sInfo = getTranscriptionStatusInfo(transcriptionStatus);
                return (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600,
                    color: sInfo.color
                  }}>
                    <span style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: sInfo.dotColor
                    }}></span>
                    {sInfo.label}
                  </span>
                );
              })()}
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({transcription.length} carac.)</span>
            </div>
          </div>

          {/* Botões de Ação na Barra */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Seletor Rápido de Provedor STT */}
            <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px', gap: '2px' }} title="Alternar motor de transcrição">
              <button
                type="button"
                onClick={() => handleSelectProvider('backend')}
                style={{
                  fontSize: '10.5px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  background: sttProvider === 'backend' ? 'var(--primary-color)' : 'transparent',
                  color: sttProvider === 'backend' ? '#ffffff' : 'var(--text-muted)'
                }}
                title="STT Backend via faster-whisper com chunks de áudio"
              >
                STT Backend {backendSttStatus.available ? '●' : '○'}
              </button>
              <button
                type="button"
                onClick={() => handleSelectProvider('browser')}
                style={{
                  fontSize: '10.5px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  background: sttProvider === 'browser' ? 'var(--primary-color)' : 'transparent',
                  color: sttProvider === 'browser' ? '#ffffff' : 'var(--text-muted)'
                }}
                title="Reconhecimento de voz nativo do navegador (Web Speech API)"
              >
                Navegador
              </button>
              <button
                type="button"
                onClick={() => handleSelectProvider('manual')}
                style={{
                  fontSize: '10.5px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  background: sttProvider === 'manual' ? 'var(--primary-color)' : 'transparent',
                  color: sttProvider === 'manual' ? '#ffffff' : 'var(--text-muted)'
                }}
                title="Digitação e edição manual de texto"
              >
                Manual
              </button>
            </div>

            {/* Ativar ou Tentar Novamente */}
            {(transcriptionStatus === 'service_unavailable' || transcriptionStatus === 'browser_blocked' || transcriptionStatus === 'error') ? (
              <button
                type="button"
                onClick={handleActivateTranscription}
                className="btn btn-secondary"
                style={{ fontSize: '10.5px', padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: 'var(--primary-color)', color: 'var(--primary-color)', fontWeight: 600 }}
                title="Tentar reiniciar o reconhecimento de voz"
              >
                <RefreshCw size={11} />
                Tentar Novamente
              </button>
            ) : transcriptionStatus !== 'listening' && transcriptionStatus !== 'receiving_speech' ? (
              <button
                type="button"
                onClick={handleActivateTranscription}
                className="btn btn-primary"
                style={{ fontSize: '10.5px', padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                title="Iniciar reconhecimento de voz com gesto explícito de clique"
              >
                <Play size={10} fill="#ffffff" />
                Ativar Transcrição
              </button>
            ) : null}

            {/* Alternar Digitação Manual */}
            <button
              type="button"
              onClick={() => handleSelectProvider(isManualEditMode ? (backendSttStatus.available ? 'backend' : 'browser') : 'manual')}
              className="btn btn-secondary"
              style={{ fontSize: '10.5px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              title="Permite digitar notas e transcrição manualmente sem depender da Web Speech API"
            >
              <FileText size={11} />
              {isManualEditMode ? 'Ver Texto' : 'Digitar Manualmente'}
            </button>

            {/* Alternar Painel de Diagnóstico Técnico */}
            <button
              type="button"
              onClick={() => setShowTechnicalDiagnostics(!showTechnicalDiagnostics)}
              className="btn btn-secondary"
              style={{ fontSize: '10.5px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              title="Exibir métricas e diagnóstico técnico da transcrição"
            >
              <Activity size={11} />
              Diagnóstico
            </button>

            {/* Ação de Reconexão se necessário */}
            {(mediaPermission === 'denied' || mediaPermission === 'unavailable' || audioStatus === 'denied' || audioStatus === 'unavailable' || mediaError) && (
              <button
                type="button"
                onClick={startMediaAndRecognition}
                className="btn btn-secondary"
                style={{ fontSize: '10.5px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                <RefreshCw size={11} />
                Reconectar Mídia
              </button>
            )}
          </div>
        </div>

        {/* Card Expansível de Diagnóstico Técnico (PARTE 1, 9, 10) */}
        {showTechnicalDiagnostics && (
          <div style={{
            padding: '12px 20px',
            background: '#090e1a',
            borderBottom: '1px solid var(--border-color)',
            fontSize: '11px',
            color: 'var(--text-muted)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-main)' }}>
                <Activity size={13} color="var(--primary-color)" />
                <span>Painel de Diagnóstico Técnico da Transcrição & Mídia</span>
              </div>
              <button
                type="button"
                onClick={copyDiagnosticToClipboard}
                className="btn btn-secondary"
                style={{ fontSize: '10.5px', padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                title="Copiar relatório completo de diagnóstico para a área de transferência sem áudio bruto"
              >
                {copiedDiagnostic ? <Check size={11} color="#10b981" /> : <Activity size={11} />}
                {copiedDiagnostic ? 'Diagnóstico Copiado!' : 'Copiar Diagnóstico'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
              <div><strong>Navegador:</strong> <span style={{ color: 'var(--text-main)' }}>{diagnosticInfo.browser}</span></div>
              <div><strong>Origem / Host:</strong> <code style={{ color: '#38bdf8' }}>{diagnosticInfo.origin || 'localhost'}</code></div>
              <div><strong>Engine:</strong> <span style={{ color: 'var(--text-main)' }}>{diagnosticInfo.engine}</span></div>
              <div><strong>Idioma:</strong> <span style={{ color: 'var(--text-main)' }}>{diagnosticInfo.lang}</span></div>
              <div><strong>Sessão ID:</strong> <code style={{ color: '#38bdf8', fontSize: '10px' }}>{diagnosticInfo.activeSessionId ? diagnosticInfo.activeSessionId.slice(0, 18) + '...' : 'none'}</code></div>
              <div><strong>start() Chamadas:</strong> <span style={{ color: 'var(--text-main)' }}>{diagnosticInfo.startCalledCount}</span></div>
              <div><strong>Último Evento:</strong> <span style={{ color: '#10b981', fontWeight: 600 }}>{diagnosticInfo.lastEvent}</span> ({diagnosticInfo.lastEventTime || 'nenhum'})</div>
              <div><strong>Sinal Microfone:</strong> <span style={{ color: audioLevel > 4 ? '#10b981' : '#f87171' }}>{audioLevel}% ({audioLevel > 4 ? 'Sinal detectado' : 'Sem sinal'})</span></div>
              <div><strong>Trilha de Áudio:</strong> <span style={{ color: 'var(--text-main)', fontSize: '10px' }}>{diagnosticInfo.audioTrackState}</span></div>
              <div>
                <strong>STT Backend (faster-whisper):</strong>{' '}
                <span style={{ color: backendSttStatus.available ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                  {backendSttStatus.available
                    ? `Disponível (${backendSttStatus.provider}, ${backendSttStatus.model})`
                    : `Indisponível (${backendSttStatus.reason || 'ausente'})`}
                </span>
              </div>
              <div>
                <strong>Chunks Enviados:</strong>{' '}
                <span style={{ color: 'var(--text-main)' }}>
                  {backendChunkStats.chunkCount} {backendChunkStats.lastProcessingTimeMs ? `(${backendChunkStats.lastProcessingTimeMs}ms)` : ''}
                </span>
              </div>
              {diagnosticInfo.lastException && (
                <div style={{ color: '#f87171', gridColumn: '1 / -1' }}><strong>Exceção em start():</strong> {diagnosticInfo.lastException}</div>
              )}
              {diagnosticInfo.lastError && (
                <div style={{ color: '#f87171', gridColumn: '1 / -1' }}><strong>Último Erro:</strong> {diagnosticInfo.lastError}</div>
              )}
            </div>

            {/* Eventos da Web Speech API */}
            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', fontWeight: 600 }}>Eventos da Web Speech API:</span>
              {Object.entries(diagnosticInfo.eventsReceived || {}).map(([evtName, fired]) => (
                <span
                  key={evtName}
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: fired ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    color: fired ? '#10b981' : '#64748b',
                    border: `1px solid ${fired ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`
                  }}
                >
                  {evtName} {fired ? '✓' : '—'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notificação de Câmera Desconectada / Ocupada (Fallback Gracioso) */}
        {cameraNotice && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 16px',
            background: 'rgba(234, 179, 8, 0.12)',
            borderBottom: '1px solid rgba(234, 179, 8, 0.3)',
            color: '#fbbf24',
            fontSize: '11.5px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={14} />
              <span>{cameraNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setCameraNotice('')}
              style={{ background: 'transparent', border: 'none', color: '#fbbf24', cursor: 'pointer', fontSize: '13px' }}
              title="Fechar aviso"
            >
              ✕
            </button>
          </div>
        )}

        {/* Notificação de Erro Crítico de Mídia / Microfone */}
        {mediaError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 16px',
            background: 'rgba(239, 68, 68, 0.15)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#f87171',
            fontSize: '11.5px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} />
              <span>{mediaError}</span>
            </div>
            <button
              type="button"
              onClick={() => setMediaError('')}
              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '13px' }}
              title="Fechar aviso"
            >
              ✕
            </button>
          </div>
        )}

        {/* Layout da Sala de Reunião (Palco de Vídeo + Transcrição Lateral) */}
        <div className="meeting-layout">
          {/* Palco Principal */}
          <div className="main-stage">
            <div className="video-container">
              <video
                id="local-video"
                ref={videoRef}
                className="local-video"
                autoPlay
                playsInline
                muted
                style={{
                  display: isCamOff || videoStatus !== 'active' ? 'none' : 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain'
                }}
              ></video>

              {(isCamOff || videoStatus !== 'active') && (
                <div
                  id="cam-placeholder"
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#090d16',
                    borderRadius: '12px',
                    gap: '14px',
                    padding: '20px',
                    textAlign: 'center'
                  }}
                >
                  <div style={{
                    position: 'relative',
                    width: 90,
                    height: 90,
                    borderRadius: '50%',
                    background: 'rgba(30, 41, 59, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    fontWeight: 700,
                    color: 'var(--primary-color)',
                    border: '2px solid rgba(56, 189, 248, 0.3)',
                    boxShadow: '0 0 24px rgba(56, 189, 248, 0.1)'
                  }}>
                    {(currentMeeting.DEPARTAMENTO || 'TOTVS').substring(0, 2).toUpperCase()}
                    {audioStatus === 'active' && audioLevel > 15 && (
                      <div style={{
                        position: 'absolute',
                        inset: -4,
                        borderRadius: '50%',
                        border: '2px solid #10b981',
                        pointerEvents: 'none'
                      }}></div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>
                      {isCamOff ? 'Câmera desativada' : videoStatus === 'denied' ? 'Permissão de câmera não concedida' : 'Câmera não detectada'}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {audioStatus === 'active'
                        ? 'Reunião em modo de voz • Microfone e transcrição funcionando normalmente'
                        : audioStatus === 'muted'
                        ? 'Microfone mutado'
                        : 'Aguardando conexão do microfone...'}
                    </span>
                  </div>

                  {audioStatus === 'active' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        fontSize: '11px',
                        color: '#10b981'
                      }}>
                        <Mic size={12} />
                        <span>Captação de voz ativa ({audioLevel}%)</span>
                      </div>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: signalQuality === 'saturado' ? 'rgba(239, 68, 68, 0.15)' :
                                    signalQuality === 'baixo' ? 'rgba(245, 158, 11, 0.15)' :
                                    signalQuality === 'sem_fala' ? 'rgba(100, 116, 139, 0.15)' :
                                    'rgba(16, 185, 129, 0.15)',
                        border: `1px solid ${
                                    signalQuality === 'saturado' ? 'rgba(239, 68, 68, 0.35)' :
                                    signalQuality === 'baixo' ? 'rgba(245, 158, 11, 0.35)' :
                                    signalQuality === 'sem_fala' ? 'rgba(100, 116, 139, 0.35)' :
                                    'rgba(16, 185, 129, 0.35)'}`,
                        color: signalQuality === 'saturado' ? '#ef4444' :
                               signalQuality === 'baixo' ? '#f59e0b' :
                               signalQuality === 'sem_fala' ? '#94a3b8' :
                               '#10b981'
                      }}>
                        <span>
                          {signalQuality === 'saturado' ? '⚠️ Áudio Saturado' :
                           signalQuality === 'baixo' ? '⚠️ Sinal Insuficiente' :
                           signalQuality === 'sem_fala' ? '🔇 Sem Fala Detectada' :
                           '🎙️ Sinal Adequado'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="video-overlay-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span>Você ({currentMeeting.DEPARTAMENTO || 'TOTVS'})</span>
                {isMuted && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 4px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.4)' }} title="Microfone mutado">
                    <MicOff size={11} color="#f87171" />
                  </span>
                )}
                {isRecording && (
                  <span style={{ fontSize: '11px', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8', fontWeight: 600 }}>
                    {formatTimer(durationSeconds)}
                  </span>
                )}
              </div>
            </div>

            {/* Barra de Controles da Reunião */}
            <div className="control-bar">
              <button
                className={`control-btn ${isMuted ? 'active' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
              >
                <div className="icon-circle">
                  {isMuted ? <MicOff size={20} color="#f87171" /> : <Mic size={20} />}
                </div>
                <span>{isMuted ? 'Desmutar' : 'Mutar'}</span>
              </button>

              <button
                className={`control-btn ${isCamOff ? 'active' : ''}`}
                onClick={toggleCamera}
                title={isCamOff ? 'Ligar Câmera' : 'Parar Câmera'}
              >
                <div className="icon-circle">
                  {isCamOff ? <VideoOff size={20} color="#f87171" /> : <Video size={20} />}
                </div>
                <span>{isCamOff ? 'Ligar Câmera' : 'Parar Câmera'}</span>
              </button>

              {/* Botão de Pausar ou Retomar */}
              {currentMeeting.STATUS_MEETING === 'ao_vivo' ? (
                <button
                  className="control-btn"
                  onClick={() => handleMeetingAction(currentMeeting.ID_MEETING, 'pausar')}
                  title="Pausar a reunião e gravação temporariamente"
                >
                  <div className="icon-circle" style={{ background: 'rgba(234, 179, 8, 0.15)', borderColor: '#eab308' }}>
                    <Pause size={20} color="#eab308" />
                  </div>
                  <span>Pausar</span>
                </button>
              ) : currentMeeting.STATUS_MEETING === 'pausada' || currentMeeting.STATUS_MEETING === 'agendada' ? (
                <button
                  className="control-btn"
                  onClick={() => handleMeetingAction(currentMeeting.ID_MEETING, 'iniciar')}
                  title="Iniciar ou Retomar Reunião"
                >
                  <div className="icon-circle" style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: '#10b981' }}>
                    <Play size={20} color="#10b981" />
                  </div>
                  <span>{currentMeeting.STATUS_MEETING === 'pausada' ? 'Retomar' : 'Iniciar'}</span>
                </button>
              ) : null}

              {/* Botão de Encerrar e Analisar */}
              <button
                className="control-btn control-btn-leave"
                onClick={handleFinishAndAnalyze}
                title="Encerrar reunião e sintetizar plano de ação e ata com IA"
              >
                <div className="icon-circle leave-icon-circle">
                  <Square size={18} fill="#ffffff" color="#ffffff" />
                </div>
                <span style={{ fontWeight: 600 }}>Finalizar & Gerar Atas</span>
              </button>
            </div>
          </div>

          {/* Painel Lateral com Transcrição Isolada */}
          <div className="ai-sidebar">
            <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="var(--primary-color)" />
                <h2 style={{ fontSize: '1rem', margin: 0 }}>Proton Flow AI</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {(() => {
                  const statusInfo = getTranscriptionStatusInfo(transcriptionStatus);
                  return (
                    <span
                      className="badge"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderColor: statusInfo.dotColor,
                        color: statusInfo.color,
                        fontSize: '11px',
                        padding: '2px 8px'
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: statusInfo.dotColor,
                          boxShadow: isRecording ? `0 0 6px ${statusInfo.dotColor}` : 'none'
                        }}
                      />
                      {statusInfo.label}
                    </span>
                  );
                })()}
                {isRecording && currentMeeting.DEPARTAMENTO && (
                  <span
                    className="badge"
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: 'var(--danger)',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      fontSize: '10.5px'
                    }}
                  >
                    {currentMeeting.DEPARTAMENTO}
                  </span>
                )}
              </div>
            </div>

            <div className="sidebar-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {error && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', borderRadius: '6px', fontSize: '12px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              {/* Seletor de Provedor de Transcrição (PARTE 7, 11) */}
              <div style={{
                marginBottom: '10px',
                padding: '8px',
                background: 'var(--panel-hover)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  <span>Provedor de Transcrição:</span>
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 700,
                    background: sttProvider === 'backend' ? (backendSttStatus.available ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)') : sttProvider === 'browser' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                    color: sttProvider === 'backend' ? (backendSttStatus.available ? '#10b981' : '#eab308') : sttProvider === 'browser' ? '#38bdf8' : '#c084fc',
                    border: `1px solid ${sttProvider === 'backend' ? (backendSttStatus.available ? '#10b981' : '#eab308') : sttProvider === 'browser' ? '#38bdf8' : '#c084fc'}`
                  }}>
                    {sttProvider === 'backend' ? (backendSttStatus.available ? 'STT Backend Ativo (faster-whisper)' : 'STT Backend Indisponível') : sttProvider === 'browser' ? 'STT Navegador Ativo' : 'Digitação Manual'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => handleSelectProvider('backend')}
                    style={{
                      fontSize: '11px',
                      padding: '5px 4px',
                      borderRadius: '6px',
                      border: '1px solid',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                      background: sttProvider === 'backend' ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.04)',
                      borderColor: sttProvider === 'backend' ? 'var(--primary-color)' : 'var(--border-color)',
                      color: sttProvider === 'backend' ? '#ffffff' : 'var(--text-muted)'
                    }}
                    title="Processamento no servidor com modelo faster-whisper"
                  >
                    <span>🎙️ STT Backend</span>
                    <span style={{ fontSize: '9px', opacity: 0.85 }}>faster-whisper</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectProvider('browser')}
                    style={{
                      fontSize: '11px',
                      padding: '5px 4px',
                      borderRadius: '6px',
                      border: '1px solid',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                      background: sttProvider === 'browser' ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.04)',
                      borderColor: sttProvider === 'browser' ? 'var(--primary-color)' : 'var(--border-color)',
                      color: sttProvider === 'browser' ? '#ffffff' : 'var(--text-muted)'
                    }}
                    title="Reconhecimento de voz do navegador (Web Speech API)"
                  >
                    <span>🌐 Navegador</span>
                    <span style={{ fontSize: '9px', opacity: 0.85 }}>Web Speech</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectProvider('manual')}
                    style={{
                      fontSize: '11px',
                      padding: '5px 4px',
                      borderRadius: '6px',
                      border: '1px solid',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                      background: sttProvider === 'manual' ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.04)',
                      borderColor: sttProvider === 'manual' ? 'var(--primary-color)' : 'var(--border-color)',
                      color: sttProvider === 'manual' ? '#ffffff' : 'var(--text-muted)'
                    }}
                    title="Digitação manual sem motores de voz"
                  >
                    <span>✏️ Manual</span>
                    <span style={{ fontSize: '9px', opacity: 0.85 }}>Digitar Notas</span>
                  </button>
                </div>

                {/* Status específico do modo ativo */}
                {sttProvider === 'backend' && (
                  <div style={{
                    fontSize: '10.5px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: backendSttStatus.available ? 'rgba(16, 185, 129, 0.08)' : 'rgba(234, 179, 8, 0.1)',
                    border: `1px solid ${backendSttStatus.available ? 'rgba(16, 185, 129, 0.25)' : 'rgba(234, 179, 8, 0.3)'}`,
                    color: backendSttStatus.available ? '#34d399' : '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '4px'
                  }}>
                    {backendSttStatus.available ? (
                      <>
                        <span>Gravando áudio • Chunks via faster-whisper (chunk #{backendChunkStats.chunkCount})</span>
                        {backendChunkStats.lastProcessingTimeMs > 0 && (
                          <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>
                            Último: {backendChunkStats.lastProcessingTimeMs}ms • {backendChunkStats.lastDuration}s
                          </span>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                        <span>Fallback Backend STT: faster-whisper indisponível ({backendSttStatus.reason || 'não instalado'}).</span>
                        <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                          <button
                            type="button"
                            onClick={() => handleSelectProvider('browser')}
                            className="btn btn-secondary"
                            style={{ fontSize: '10px', padding: '2px 6px', color: '#38bdf8', borderColor: '#38bdf8' }}
                          >
                            Usar Navegador
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectProvider('manual')}
                            className="btn btn-secondary"
                            style={{ fontSize: '10px', padding: '2px 6px' }}
                          >
                            Digitar Manualmente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {sttProvider === 'browser' && (
                  <div style={{
                    fontSize: '10.5px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span>Ouvindo microfone • Reconhecimento nativo do navegador</span>
                    {backendSttStatus.available && (
                      <button
                        type="button"
                        onClick={() => handleSelectProvider('backend')}
                        style={{ background: 'transparent', border: 'none', color: '#34d399', fontSize: '10px', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Alternar para STT Backend
                      </button>
                    )}
                  </div>
                )}

                {sttProvider === 'manual' && (
                  <div style={{
                    fontSize: '10.5px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: 'rgba(168, 85, 247, 0.08)',
                    border: '1px solid rgba(168, 85, 247, 0.25)',
                    color: '#c084fc'
                  }}>
                    <span>Modo manual ativo • Digite e edite o texto da ata diretamente</span>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      Transcrição ({transcription.length} carac.)
                    </h3>
                    <div style={{ display: 'inline-flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)', fontSize: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setTranscriptViewMode('normalized')}
                        style={{
                          padding: '2px 6px',
                          border: 'none',
                          background: transcriptViewMode === 'normalized' ? 'var(--primary-color)' : 'transparent',
                          color: transcriptViewMode === 'normalized' ? '#fff' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                        title="Texto consolidado, deduplicado e limpo"
                      >
                        Normalizado
                      </button>
                      <button
                        type="button"
                        onClick={() => setTranscriptViewMode('raw')}
                        style={{
                          padding: '2px 6px',
                          border: 'none',
                          background: transcriptViewMode === 'raw' ? 'var(--primary-color)' : 'transparent',
                          color: transcriptViewMode === 'raw' ? '#fff' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                        title="Texto bruto original do Whisper para auditoria"
                      >
                        Bruto (Auditoria)
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {syncStatus === 'saving' && (
                      <span style={{ color: '#eab308' }}>Salvando...</span>
                    )}
                    {syncStatus === 'synced' && (
                      <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Check size={11} /> Salvo no servidor
                      </span>
                    )}
                    {syncStatus === 'unsaved' && (
                      <span style={{ color: '#f87171' }}>Rascunho local</span>
                    )}
                  </div>
                </div>

                <div
                  className="transcription-live"
                  ref={scrollRef}
                  style={{
                    flex: 1,
                    maxHeight: 'none',
                    height: 'auto',
                    overflowY: 'auto',
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--panel-hover)',
                    border: '1px solid var(--border-color)',
                    fontSize: '13px',
                    lineHeight: '1.6'
                  }}
                >
                  {isManualEditMode ? (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '200px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '11px', color: '#38bdf8' }}>
                        <span>Modo de Digitação / Edição Manual</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Digite ou cole as notas da reunião</span>
                      </div>
                      <textarea
                        value={transcription}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTranscription(val);
                          finalTranscriptRef.current = val;
                          setSyncStatus('unsaved');
                        }}
                        placeholder="Digite aqui as notas, falas ou pauta da reunião..."
                        style={{
                          flex: 1,
                          width: '100%',
                          minHeight: '180px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          padding: '10px',
                          color: 'var(--text-main)',
                          fontSize: '13px',
                          lineHeight: '1.6',
                          resize: 'none',
                          outline: 'none',
                          fontFamily: 'inherit'
                        }}
                      />
                    </div>
                  ) : (transcription.trim() || transcriptRaw.trim()) ? (
                    <div>
                      {transcriptViewMode === 'raw' && (
                        <div style={{ marginBottom: '6px', fontSize: '10.5px', color: '#94a3b8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>🔍 Visualizando transcrição bruta do STT para auditoria</span>
                        </div>
                      )}
                      <span style={{ whiteSpace: 'pre-wrap' }}>
                        {transcriptViewMode === 'raw' ? (transcriptRaw || transcription) : (transcriptNormalized || transcription)}
                      </span>
                      {isRecording && <span className="typing-indicator" style={{ display: 'inline-block', marginLeft: '6px' }} />}
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      minHeight: '180px',
                      textAlign: 'center',
                      gap: '12px',
                      padding: '20px',
                      color: 'var(--text-muted)'
                    }}>
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: getTranscriptionStatusInfo(transcriptionStatus).dotColor,
                        boxShadow: `0 0 8px ${getTranscriptionStatusInfo(transcriptionStatus).dotColor}`
                      }} />
                      <p style={{ margin: 0, fontSize: '12px', maxWidth: '320px', lineHeight: 1.5 }}>
                        {getEmptyMessage(transcriptionStatus, currentMeeting.TITULO_REUNIAO)}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {(transcriptionStatus === 'service_unavailable' || transcriptionStatus === 'browser_blocked' || transcriptionStatus === 'error') ? (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); startSpeechRecognition(true); }}
                            className="btn btn-secondary"
                            style={{
                              fontSize: '11px',
                              padding: '6px 12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              borderColor: 'var(--primary-color)',
                              color: 'var(--primary-color)'
                            }}
                          >
                            <RefreshCw size={12} />
                            Tentar Novamente
                          </button>
                        ) : transcriptionStatus !== 'listening' && transcriptionStatus !== 'receiving_speech' ? (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); startSpeechRecognition(true); }}
                            className="btn btn-secondary"
                            style={{
                              fontSize: '11px',
                              padding: '6px 12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              borderColor: 'var(--primary-color)',
                              color: 'var(--primary-color)'
                            }}
                          >
                            <Play size={12} />
                            Ativar Transcrição
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setIsManualEditMode(true)}
                          className="btn btn-secondary"
                          style={{
                            fontSize: '11px',
                            padding: '6px 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <FileText size={12} />
                          Digitar Manualmente
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Ações da Transcrição */}
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => saveTranscriptToBackend(transcription)}
                  className="btn btn-secondary"
                  style={{ flex: 1, fontSize: '11.5px', padding: '6px' }}
                >
                  Salvar Rascunho
                </button>
                <button
                  type="button"
                  onClick={handleFinishAndAnalyze}
                  className="btn btn-primary"
                  style={{ flex: 2, fontSize: '11.5px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <FileText size={13} />
                  Sair e Gerar Resumo IA
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: CENTRAL DE REUNIÕES AO VIVO (HUB VIEW)
  // =========================================================================
  return (
    <div className="live-hub-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(2, 132, 199, 0.12) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
              boxShadow: '0 2px 10px rgba(239, 68, 68, 0.15)',
              flexShrink: 0
            }}>
              <Radio size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-main)', letterSpacing: '-0.02em', fontFamily: "'Outfit', sans-serif" }}>
                Central de Reuniões Ao Vivo
              </h1>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                Gerencie múltiplas salas simultâneas com transcrição e isolamento completo de áudio.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={loadLiveMeetings}
            className="btn btn-secondary"
            title="Atualizar lista de reuniões ao vivo"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} style={{ color: 'var(--primary-color)' }} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
            title="Criar nova sala de reunião ao vivo"
          >
            <Plus size={16} />
            <span>Nova Reunião Ao Vivo</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas e Status Rápido */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        marginBottom: '20px'
      }}>
        <div style={{ padding: '14px 18px', background: 'var(--panel-bg)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            <Radio size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)' }}>{metrics.liveCount}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Reuniões Ao Vivo Agora</div>
          </div>
        </div>

        <div style={{ padding: '14px 18px', background: 'var(--panel-bg)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(2, 132, 199, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
            <Calendar size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)' }}>{metrics.scheduledCount}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Agendadas / Prontas</div>
          </div>
        </div>

        <div style={{ padding: '14px 18px', background: 'var(--panel-bg)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(234, 179, 8, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308' }}>
            <Pause size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)' }}>{metrics.pausedCount}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Pausadas</div>
          </div>
        </div>

        <div style={{ padding: '14px 18px', background: 'var(--panel-bg)', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)' }}>{metrics.finishedCount}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Concluídas</div>
          </div>
        </div>
      </div>

      {/* Banner Informativo sobre Fontes Físicas de Áudio */}
      <div style={{
        padding: '12px 18px',
        background: 'rgba(2, 132, 199, 0.08)',
        borderRadius: '10px',
        border: '1px solid rgba(2, 132, 199, 0.25)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <Info size={18} color="var(--primary-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          <strong style={{ color: 'var(--text-main)' }}>Arquitetura de Áudio Independente:</strong> Cada reunião captura áudio isoladamente por dispositivo ou janela.
          Para processar reuniões simultâneas no mesmo horário (por exemplo, <em>Reunião do RH às 10h20</em> e <em>Reunião do time de TI às 10h20</em>), utilize microfones de entrada distintos ou abra cada reunião em uma aba/janela separada do navegador para que os fluxos de voz permaneçam 100% segregados sem interferência acústica.
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--panel-bg)',
        padding: '12px 18px',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Campo de Busca */}
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Buscar por título, equipe, horário ou participantes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ width: '100%', paddingLeft: '32px', fontSize: '12.5px' }}
          />
        </div>

        {/* Filtro por Departamento / Equipe */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Equipe:</span>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="form-select"
            style={{ fontSize: '12px', padding: '6px 10px' }}
          >
            {departmentsList.map((d) => (
              <option key={d} value={d}>
                {d === 'todos' ? 'Todas as Áreas' : d}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro por Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-select"
            style={{ fontSize: '12px', padding: '6px 10px' }}
          >
            <option value="todos">Todos os Status</option>
            <option value="ao_vivo">🔴 Ao Vivo Agora</option>
            <option value="agendada">📅 Agendadas</option>
            <option value="pausada">⏸️ Pausadas</option>
            <option value="concluida">✅ Concluídas</option>
          </select>
        </div>
      </div>

      {/* Grid de Reuniões */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px auto' }} />
          Carregando salas de reunião...
        </div>
      ) : meetings.length === 0 ? (
        <div style={{
          padding: '70px 20px',
          textAlign: 'center',
          background: 'var(--panel-bg)',
          borderRadius: '12px',
          border: '1px dashed var(--border-color)'
        }}>
          <Radio size={42} color="var(--primary-color)" style={{ margin: '0 auto 14px auto', opacity: 0.6 }} />
          <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '8px', fontWeight: 700 }}>
            Nenhuma reunião criada
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 20px auto', lineHeight: '1.5' }}>
            Nenhuma reunião criada. Clique em <strong>Nova Reunião Ao Vivo</strong> para começar.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '10px 18px', fontWeight: 600 }}
          >
            <Plus size={16} />
            Nova Reunião Ao Vivo
          </button>
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div style={{
          padding: '50px 20px',
          textAlign: 'center',
          background: 'var(--panel-bg)',
          borderRadius: '12px',
          border: '1px dashed var(--border-color)'
        }}>
          <Radio size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '6px' }}>
            Nenhuma reunião coincide com os filtros aplicados
          </h3>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 16px auto' }}>
            Ajuste os filtros de status ou departamento acima para visualizar reuniões cadastradas.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px'
        }}>
          {filteredMeetings.map((item) => {
            const isLive = item.STATUS_MEETING === 'ao_vivo';
            const badge = getStatusBadge(item.STATUS_MEETING);
            const participantsCount = Array.isArray(item.PARTICIPANTES) ? item.PARTICIPANTES.length : 0;

            return (
              <div
                key={item.ID_MEETING}
                style={{
                  background: 'var(--panel-bg)',
                  borderRadius: '12px',
                  border: isLive ? '2px solid rgba(239, 68, 68, 0.6)' : '1px solid var(--border-color)',
                  boxShadow: isLive ? '0 0 14px rgba(239, 68, 68, 0.2)' : 'none',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Header do Card */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '5px',
                      background: badge.bg,
                      color: badge.color,
                      border: `1px solid ${badge.border}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}>
                      {badge.icon && <span style={{ width: 6, height: 6, borderRadius: '50%', background: badge.color }}></span>}
                      {badge.label}
                    </span>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'var(--panel-hover)',
                      color: 'var(--primary-color)',
                      border: '1px solid var(--border-color)'
                    }}>
                      {item.DEPARTAMENTO || item.NOME_SEGMENTO || 'Geral'}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-main)', lineHeight: '1.3' }}>
                    {item.TITULO_REUNIAO}
                  </h3>

                  {/* Sugestão de Título pela IA (auditável e opcional; nunca substitui automaticamente) */}
                  {item.RESUMO_IA && item.RESUMO_IA.tema && item.RESUMO_IA.tema !== item.TITULO_REUNIAO && !dismissedAiSuggestions[item.ID_MEETING] && (
                    <div style={{
                      margin: '6px 0 10px 0',
                      padding: '8px 10px',
                      background: 'rgba(2, 132, 199, 0.08)',
                      border: '1px solid rgba(2, 132, 199, 0.25)',
                      borderRadius: '6px',
                      fontSize: '11px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '3px' }}>
                        <Sparkles size={12} />
                        <span>Sugestão da IA — não aplicada</span>
                      </div>
                      <div style={{ fontStyle: 'italic', color: 'var(--text-main)', marginBottom: '6px' }}>
                        "{item.RESUMO_IA.tema}"
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleApplyAiTitle(item.ID_MEETING, item.RESUMO_IA.tema)}
                          style={{
                            fontSize: '10px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'var(--primary-color)',
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          Aplicar sugestão
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDismissAiTitle(item.ID_MEETING)}
                          style={{
                            fontSize: '10px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border-color)',
                            cursor: 'pointer'
                          }}
                        >
                          Manter nome informado
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      <strong style={{ color: 'var(--text-main)' }}>{item.HORARIO_AGENDADO || 'Não informado'}</strong>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} />
                      {item.DT_MEETING || 'Sem data'}
                    </span>
                    {participantsCount > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={12} />
                        {participantsCount} part.
                      </span>
                    )}
                  </div>
                </div>

                {/* Transcrição prévia / Resumo de status */}
                <div style={{
                  padding: '8px 12px',
                  background: 'var(--panel-hover)',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  color: 'var(--text-secondary)',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  {item.ANON_TRANSCRICAO ? (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {item.ANON_TRANSCRICAO}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {isLive ? 'Gravando áudio... aguardando falas.' : 'Reunião pronta para início. Transcrição vazia.'}
                    </span>
                  )}
                </div>

                {/* Botões de Ação do Card */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                  {/* Se estiver Ao Vivo */}
                  {isLive ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveMeetingId(item.ID_MEETING)}
                        className="btn btn-primary"
                        style={{ flex: 1, fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Radio size={14} />
                        Entrar na Sala
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMeetingAction(item.ID_MEETING, 'pausar')}
                        className="btn btn-secondary"
                        style={{ fontSize: '12px', padding: '6px 10px' }}
                        title="Pausar gravação"
                      >
                        <Pause size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMeetingAction(item.ID_MEETING, 'finalizar')}
                        className="btn btn-danger"
                        style={{ fontSize: '12px', padding: '6px 10px' }}
                        title="Finalizar reunião"
                      >
                        <Square size={13} fill="currentColor" />
                      </button>
                    </>
                  ) : item.STATUS_MEETING === 'pausada' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveMeetingId(item.ID_MEETING)}
                        className="btn btn-primary"
                        style={{ flex: 1, fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Play size={14} />
                        Retomar Sala
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMeetingAction(item.ID_MEETING, 'finalizar')}
                        className="btn btn-secondary"
                        style={{ fontSize: '12px', padding: '6px 10px' }}
                        title="Finalizar reunião"
                      >
                        Finalizar
                      </button>
                    </>
                  ) : item.STATUS_MEETING === 'agendada' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          handleMeetingAction(item.ID_MEETING, 'iniciar');
                          setActiveMeetingId(item.ID_MEETING);
                        }}
                        className="btn btn-primary"
                        style={{ flex: 1, fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Play size={14} />
                        Iniciar Reunião
                      </button>
                    </>
                  ) : (
                    // Concluída
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenDocumentViewer) {
                            onOpenDocumentViewer(item, 'executive', 'pdf');
                          } else {
                            setActiveMeetingId(item.ID_MEETING);
                          }
                        }}
                        className="btn btn-secondary"
                        style={{ flex: 1, fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <FileText size={14} />
                        Ver Ata Executiva
                      </button>
                      {onAnalyzeMeeting && (!item.RESUMO_IA || Object.keys(item.RESUMO_IA).length === 0) && (
                        <button
                          type="button"
                          onClick={() => onAnalyzeMeeting(item.ID_MEETING)}
                          className="btn btn-primary"
                          style={{ fontSize: '12px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          title="Analisar reunião com IA"
                        >
                          <Sparkles size={13} />
                          Analisar
                        </button>
                      )}
                    </>
                  )}

                  {/* Abrir em nova aba */}
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}${window.location.pathname}?view=meeting&id=${item.ID_MEETING}`;
                      window.open(url, '_blank');
                    }}
                    className="btn btn-secondary"
                    style={{ padding: '6px 8px' }}
                    title="Abrir em aba independente"
                  >
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: CRIAR NOVA REUNIÃO AO VIVO */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--panel-bg)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={18} color="var(--primary-color)" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Nova Reunião Ao Vivo
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMeetingSubmit} style={{ padding: '20px 22px' }}>
              {/* Título da Reunião */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Título / Nome da Reunião *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Reunião de Planejamento do RH"
                  value={newMeetingForm.titulo}
                  onChange={(e) => {
                    setNewMeetingForm({ ...newMeetingForm, titulo: e.target.value });
                    if (formErrors.titulo) setFormErrors({ ...formErrors, titulo: null });
                  }}
                  className="form-input"
                  style={{ width: '100%', fontSize: '13px', borderColor: formErrors.titulo ? '#ef4444' : undefined }}
                />
                {formErrors.titulo && (
                  <span style={{ color: '#ef4444', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                    {formErrors.titulo}
                  </span>
                )}
              </div>

              {/* Equipe / Área e Horário */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    Área / Equipe *
                  </label>
                  <select
                    required
                    value={newMeetingForm.departamento}
                    onChange={(e) => {
                      setNewMeetingForm({ ...newMeetingForm, departamento: e.target.value });
                      if (formErrors.departamento) setFormErrors({ ...formErrors, departamento: null });
                    }}
                    className="form-select"
                    style={{ width: '100%', fontSize: '13px', borderColor: formErrors.departamento ? '#ef4444' : undefined }}
                  >
                    <option value="">Selecione a área / equipe...</option>
                    <option value="RH">RH (Recursos Humanos)</option>
                    <option value="TI">TI (Tecnologia da Informação)</option>
                    <option value="Financeiro">Financeiro / Controladoria</option>
                    <option value="Operações">Operações / Produção</option>
                    <option value="Serviços">Serviços / Consultoria</option>
                    <option value="Comercial">Comercial / Vendas</option>
                    <option value="Geral">Geral</option>
                  </select>
                  {formErrors.departamento && (
                    <span style={{ color: '#ef4444', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                      {formErrors.departamento}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    Horário Agendado *
                  </label>
                  <input
                    type="time"
                    required
                    value={newMeetingForm.horario}
                    onChange={(e) => {
                      setNewMeetingForm({ ...newMeetingForm, horario: e.target.value });
                      if (formErrors.horario) setFormErrors({ ...formErrors, horario: null });
                    }}
                    className="form-input"
                    style={{ width: '100%', fontSize: '13px', borderColor: formErrors.horario ? '#ef4444' : undefined }}
                  />
                  {formErrors.horario && (
                    <span style={{ color: '#ef4444', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                      {formErrors.horario}
                    </span>
                  )}
                </div>
              </div>

              {/* Data da Reunião */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Data da Sessão *
                </label>
                <input
                  type="date"
                  required
                  value={newMeetingForm.data}
                  onChange={(e) => {
                    setNewMeetingForm({ ...newMeetingForm, data: e.target.value });
                    if (formErrors.data) setFormErrors({ ...formErrors, data: null });
                  }}
                  className="form-input"
                  style={{ width: '100%', fontSize: '13px', borderColor: formErrors.data ? '#ef4444' : undefined }}
                />
                {formErrors.data && (
                  <span style={{ color: '#ef4444', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                    {formErrors.data}
                  </span>
                )}
              </div>

              {/* Participantes */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Participantes (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Mariana, Carlos, Amanda..."
                  value={newMeetingForm.participantes}
                  onChange={(e) => setNewMeetingForm({ ...newMeetingForm, participantes: e.target.value })}
                  className="form-input"
                  style={{ width: '100%', fontSize: '13px' }}
                />
              </div>

              {/* Fonte de Áudio / Microfone */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '5px' }}>
                  Dispositivo de Entrada de Áudio
                </label>
                <select
                  value={newMeetingForm.fonte_audio}
                  onChange={(e) => setNewMeetingForm({ ...newMeetingForm, fonte_audio: e.target.value })}
                  className="form-select"
                  style={{ width: '100%', fontSize: '13px' }}
                >
                  <option value="Microfone Padrão">Microfone Padrão do Sistema</option>
                  {audioDevices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.label || `Dispositivo de Áudio ${i + 1}`}>
                      {d.label || `Microfone ${i + 1}`}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  Para salas simultâneas, selecione dispositivos distintos ou abra cada reunião em uma aba separada.
                </span>
              </div>

              {/* Checkbox Iniciar Imediatamente */}
              <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="iniciar_agora"
                  checked={newMeetingForm.iniciar_agora}
                  onChange={(e) => setNewMeetingForm({ ...newMeetingForm, iniciar_agora: e.target.checked })}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="iniciar_agora" style={{ fontSize: '12.5px', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600 }}>
                  Iniciar gravação e abrir sala imediatamente
                </label>
              </div>

              {/* Ações do Modal */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="btn btn-secondary"
                  style={{ fontSize: '12.5px' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingMeeting}
                  className="btn btn-primary"
                  style={{ fontSize: '12.5px', fontWeight: 600, minWidth: '120px' }}
                >
                  {creatingMeeting ? 'Criando...' : 'Confirmar Criação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
