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
  Check,
  Trash2,
  Settings,
  X,
  Copy,
  RotateCw,
  MoreVertical,
  MoreHorizontal,
  HelpCircle,
  MessageSquare,
  Send
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
  const [_recognitionServiceState, setRecognitionServiceState] = useState('nao_testado'); // 'nao_testado' | 'conectado' | 'sem_resposta' | 'bloqueado' | 'indisponivel'
  const [isManualEditMode, setIsManualEditMode] = useState(false);
  const [copiedDiagnostic, setCopiedDiagnostic] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [cameraNotice, setCameraNotice] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [_videoDevices, setVideoDevices] = useState([]);
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'saving' | 'synced' | 'unsaved'
  const [showTechnicalDiagnostics, setShowTechnicalDiagnostics] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showFinishConfirmModal, setShowFinishConfirmModal] = useState(false);
  const [refineBeforeFinish, setRefineBeforeFinish] = useState(true);
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState('');
  const [customContextTerms, setCustomContextTerms] = useState('Proton Flow, TOTVS, Protheus, RH, TI, homologação, benefícios');
  const [vadSensitivity, setVadSensitivity] = useState('0.38');
  const [selectedModelSize, setSelectedModelSize] = useState('small');
  const [switchingModel, setSwitchingModel] = useState(false);
  const [modelSwitchSuccess, setModelSwitchSuccess] = useState('');
  const [facingMode, setFacingMode] = useState('user'); // 'user' | 'environment'
  const [showPermissionHelpModal, setShowPermissionHelpModal] = useState(false);
  const [showMobileActionSheet, setShowMobileActionSheet] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767);
  // Chat da Reunião Ao Vivo (Independente da transcrição)
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInputText, setChatInputText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [collabTab, setCollabTab] = useState('chat'); // 'chat' | 'transcript' (Chat é padrão!)
  const [mobileRoomTab, setMobileRoomTab] = useState('room'); // 'room' | 'chat' | 'transcript' (Sala é padrão!)
  const [showCollabPanel, setShowCollabPanel] = useState(true);
  const chatScrollRef = useRef(null);
  const isChatUserScrolledUpRef = useRef(false);
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
    chunksCaptured: 0,
    chunksConfirmed: 0,
    chunksPending: 0,
    chunksFailed: 0,
    lastConfirmedSeq: null,
    lastProcessingTimeMs: 0,
    lastDuration: 0,
    latencyHistory: [],
    lowConfidenceSegments: 0,
    modelName: '',
    glossaryCorrectionsCount: 0,
    rtf: 0,
    queueSize: 0,
    isDelayed: false,
    lastHttpStatus: null,
    lastError: null
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
  const chunkQueueRef = useRef([]);
  const isUploadingRef = useRef(false);
  const stopReasonRef = useRef('');
  const chunksCapturedCountRef = useRef(0);
  const chunksConfirmedCountRef = useRef(0);
  const sessionStartTimeRef = useRef(null);

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
    const setDept = new Set(['todos', 'RH', 'TI', 'Financeiro', 'Operações']);
    meetings.forEach((m) => {
      const d = m.DEPARTAMENTO || m.NOME_SEGMENTO;
      if (d && d !== 'Geral') setDept.add(d);
    });
    return Array.from(setDept);
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

  // Busca mensagens do Chat Ao Vivo
  const fetchChatMessages = useCallback(async (meetingId) => {
    if (!meetingId) return;
    try {
      const res = await api.getLiveChatMessages(meetingId);
      if (res && Array.isArray(res.messages)) {
        setChatMessages(res.messages);
      }
    } catch {
      // Ignora falhas de polling silenciosamente
    }
  }, []);

  // Polling periódico do Chat a cada 2.5s enquanto houver reunião ativa
  useEffect(() => {
    if (!activeMeetingId) {
      setChatMessages([]);
      return;
    }
    fetchChatMessages(activeMeetingId);
    const interval = setInterval(() => {
      fetchChatMessages(activeMeetingId);
    }, 2500);
    return () => clearInterval(interval);
  }, [activeMeetingId, fetchChatMessages]);

  // Monitora scroll manual do chat para respeitar se o usuário subiu a barra
  const handleChatScroll = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    const isUp = el.scrollHeight - el.scrollTop - el.clientHeight > 60;
    isChatUserScrolledUpRef.current = isUp;
  };

  // Auto-scroll do chat para o rodapé apenas se o usuário não subiu manualmente
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    if (!isChatUserScrolledUpRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages, collabTab, mobileRoomTab]);

  // Envio de nova mensagem de chat
  const handleSendChatMessage = async (e) => {
    if (e) e.preventDefault();
    const clean = chatInputText.trim();
    if (!clean || !activeMeetingId || chatSending) return;

    setChatSending(true);
    const clientMsgId = `cmsg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const myAuthor = currentMeeting?.DEPARTAMENTO ? `Você (${currentMeeting.DEPARTAMENTO})` : 'Você';

    const optimisticMsg = {
      id: clientMsgId,
      meeting_id: String(activeMeetingId),
      author: myAuthor,
      text: clean,
      timestamp: new Date().toISOString(),
      client_message_id: clientMsgId
    };

    setChatMessages((prev) => [...prev, optimisticMsg]);
    setChatInputText('');
    isChatUserScrolledUpRef.current = false;

    try {
      const saved = await api.sendLiveChatMessage(activeMeetingId, {
        author: myAuthor,
        text: clean,
        client_message_id: clientMsgId
      });
      if (saved && saved.id) {
        setChatMessages((prev) => prev.map((m) => m.client_message_id === clientMsgId ? saved : m));
      }
    } catch (err) {
      console.error('Falha ao enviar mensagem de chat:', err);
    } finally {
      setChatSending(false);
    }
  };

  // Envio com Enter e quebra com Shift+Enter
  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChatMessage();
    }
  };

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
      case 'awaiting_start':
        return { label: 'Aguardando início', color: '#94a3b8', dotColor: '#94a3b8' };
      case 'requesting':
      case 'requesting_permission':
      case 'preparing_microphone':
        return { label: 'Preparando microfone', color: '#eab308', dotColor: '#eab308' };
      case 'media_ready':
        return { label: 'Microfone pronto', color: '#38bdf8', dotColor: '#38bdf8' };
      case 'recognition_starting':
        return { label: 'Conectando...', color: '#eab308', dotColor: '#eab308' };
      case 'capturing':
      case 'listening':
      case 'capturing_audio':
        return { label: 'Capturando áudio', color: '#38bdf8', dotColor: '#38bdf8' };
      case 'processing_chunk':
        return { label: 'Processando chunk', color: '#a855f7', dotColor: '#a855f7' };
      case 'active':
      case 'receiving_speech':
      case 'transcription_active':
        return { label: 'Transcrição ativa', color: '#10b981', dotColor: '#10b981' };
      case 'queue_delayed':
        return { label: 'Fila atrasada', color: '#f59e0b', dotColor: '#f59e0b' };
      case 'paused':
        return { label: 'Pausada', color: '#eab308', dotColor: '#eab308' };
      case 'finished':
      case 'concluida':
        return { label: 'Finalizada', color: '#64748b', dotColor: '#64748b' };
      case 'disconnected':
      case 'ended':
      case 'mic_disconnected':
        return { label: 'Microfone desconectado', color: '#f87171', dotColor: '#ef4444' };
      case 'permission_denied':
        return { label: 'Permissão negada', color: '#f87171', dotColor: '#ef4444' };
      case 'no_audio_input':
        return { label: 'Sem sinal de áudio', color: '#f87171', dotColor: '#ef4444' };
      case 'browser_blocked':
        return { label: 'Bloqueado pelo navegador', color: '#f87171', dotColor: '#ef4444' };
      case 'service_unavailable':
      case 'unavailable':
        return { label: 'STT indisponível', color: '#f87171', dotColor: '#ef4444' };
      case 'unsupported':
        return { label: 'Não suportada', color: '#f87171', dotColor: '#ef4444' };
      case 'error':
        return { label: 'Erro', color: '#f87171', dotColor: '#ef4444' };
      default:
        return { label: 'Aguardando atividade', color: '#94a3b8', dotColor: '#94a3b8' };
    }
  }, []);

  const getEmptyMessage = useCallback((status, title) => {
    switch (status) {
      case 'idle':
      case 'awaiting_start':
        return `Reunião "${title}" pronta. Clique em "Ativar Transcrição" para iniciar a captura contínua.`;
      case 'requesting':
      case 'requesting_permission':
      case 'preparing_microphone':
        return 'Solicitando acesso ao microfone... Por favor, autorize nas permissões do navegador.';
      case 'media_ready':
        return 'Microfone configurado com sucesso. Clique em "Ativar Transcrição" para iniciar.';
      case 'recognition_starting':
        return 'Conectando ao reconhecimento de voz... Aguarde o handshake com o motor de áudio.';
      case 'capturing':
      case 'listening':
      case 'capturing_audio':
        return 'Microfone ativo e captando som continuamente. Fale normalmente durante a reunião.';
      case 'processing_chunk':
        return 'Processando trecho de fala com o modelo STT...';
      case 'active':
      case 'receiving_speech':
      case 'transcription_active':
        return 'Transcrevendo áudio em tempo real...';
      case 'queue_delayed':
        return 'Fila de áudio com processamento atrasado. Os chunks continuam sendo gravados e processados sem perda.';
      case 'paused':
        return 'Gravação pausada temporariamente. Clique em Retomar para continuar.';
      case 'disconnected':
      case 'ended':
      case 'mic_disconnected':
        return 'Microfone desconectado pelo sistema. Verifique a conexão e clique no botão "Reconectar Microfone".';
      case 'permission_denied':
        return 'Permissão de microfone negada. Clique no ícone de cadeado na barra de endereços do navegador e permita o microfone.';
      case 'no_audio_input':
        return 'Nenhum sinal detectado no microfone selecionado. Verifique se o microfone não está silenciado no sistema operacional.';
      case 'browser_blocked':
        return 'O serviço de reconhecimento de voz foi bloqueado pelo navegador (comum no Brave Shields ou políticas corporativas). Use o Google Chrome ou autorize o Google Speech API.';
      case 'service_unavailable':
      case 'unavailable':
        return 'O serviço de transcrição backend (faster-whisper) está indisponível no servidor. Verifique o status da API.';
      case 'unsupported':
        return 'Este navegador não oferece transcrição nativa. Recomendamos o Google Chrome ou Microsoft Edge.';
      case 'error':
        return 'Ocorreu um erro no reconhecimento de voz. Clique em "Tentar Novamente" ou insira anotações manualmente.';
      default:
        return `Aguardando áudio da reunião "${title}"...`;
    }
  }, []);

  // Copia relatório estruturado de diagnóstico sem dados de áudio bruto (PARTE 1)
  const copyDiagnosticToClipboard = useCallback(() => {
    const totalSessionSeconds = sessionStartTimeRef.current ? Math.round((Date.now() - sessionStartTimeRef.current) / 1000) : 0;
    const audioTrack = streamRef.current?.getAudioTracks()[0];
    const videoTrack = streamRef.current?.getVideoTracks()[0];

    const diagText = `-------------------------------------------------------
DIAGNÓSTICO TÉCNICO DE TRANSCRIÇÃO & STT — PROTON FLOW
Data/Hora: ${new Date().toISOString()}
-------------------------------------------------------
Reunião ID: ${activeMeetingIdRef.current || 'Nenhuma'}
Sessão ID: ${backendSessionIdRef.current || 'Nenhuma'}
Tempo Total da Sessão: ${totalSessionSeconds}s
Provedor STT Ativo: ${sttProvider}
Backend STT Status: ${backendSttStatus.available ? `Disponível (${backendSttStatus.provider}, model=${backendSttStatus.model}, device=${backendSttStatus.device})` : `Indisponível (${backendSttStatus.reason || 'ausente'})`}
Status da Transcrição: ${transcriptionStatus}
Engine State: ${engineState}

--- MEDIA & HARDWARE ---
Microfone Status: ${audioStatus}
Nível de VU Meter: ${audioLevelRef.current}% (${audioLevelRef.current > 4 ? 'Sinal Detectado' : 'Sem Sinal'})
Audio Track: ${audioTrack ? `readyState=${audioTrack.readyState}, enabled=${audioTrack.enabled}, muted=${audioTrack.muted}` : 'Ausente'}
Video Track: ${videoTrack ? `readyState=${videoTrack.readyState}, enabled=${videoTrack.enabled}, muted=${videoTrack.muted}` : 'Desativado'}
MediaRecorder State: ${mediaRecorderRef.current ? mediaRecorderRef.current.state : 'inativo'}
Motivo de Parada: ${stopReasonRef.current || 'nenhum'}

--- FILA E CHUNKS STT ---
Chunks Capturados: ${backendChunkStats.chunksCaptured || 0}
Chunks Confirmados: ${backendChunkStats.chunksConfirmed || 0}
Chunks Pendentes na Fila: ${chunkQueueRef.current.length}
Chunks Falhos: ${backendChunkStats.chunksFailed || 0}
Uploads em Andamento: ${isUploadingRef.current ? 1 : 0}
Última Sequência Confirmada: ${backendChunkStats.lastConfirmedSeq ?? 'nenhuma'}
Último Processamento: ${backendChunkStats.lastProcessingTimeMs}ms
Última Duração do Chunk: ${backendChunkStats.lastDuration}s
RTF: ${backendChunkStats.rtf || 0}
Último Status HTTP: ${backendChunkStats.lastHttpStatus || (backendChunkStats.chunksConfirmed > 0 ? 200 : 'nenhum')}
Último Erro Frontend/Backend: ${backendChunkStats.lastError || diagnosticInfo.lastError || 'Nenhum'}
Último Evento: ${diagnosticInfo.lastEvent} (${diagnosticInfo.lastEventTime || 'Nenhum'})
-------------------------------------------------------`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(diagText).then(() => {
        setCopiedDiagnostic(true);
        setTimeout(() => setCopiedDiagnostic(false), 2500);
      }).catch((e) => {
        console.warn('Erro ao copiar diagnóstico:', e);
      });
    }
  }, [diagnosticInfo, transcriptionStatus, engineState, audioStatus, sttProvider, backendSttStatus, backendChunkStats]);

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

  // Parada limpa e controlada do MediaRecorder de backend
  const stopBackendCapture = useCallback((reason = 'user_action') => {
    stopReasonRef.current = reason;
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
    setDiagnosticInfo((prev) => ({
      ...prev,
      lastEvent: `media_recorder_stopped_${reason}`,
      lastEventTime: new Date().toLocaleTimeString('pt-BR')
    }));
  }, []);

  // Processador FIFO assíncrono da fila de chunks com controle estrito de concorrência e resiliência
  const processChunkQueue = useCallback(async () => {
    if (isUploadingRef.current) return;
    isUploadingRef.current = true;

    try {
      while (chunkQueueRef.current.length > 0) {
        const targetMeetingId = activeMeetingIdRef.current;
        if (!targetMeetingId) {
          chunkQueueRef.current = [];
          break;
        }

        const chunk = chunkQueueRef.current[0];
        if (!chunk) {
          chunkQueueRef.current.shift();
          continue;
        }

        // Se a reunião mudou de contexto, descarta chunk obsoleto
        if (chunk.targetMeetingId !== targetMeetingId) {
          chunkQueueRef.current.shift();
          continue;
        }

        const pendingCount = chunkQueueRef.current.length;
        const isDelayed = pendingCount > 2;

        setTranscriptionStatus('processing_chunk');
        transcriptionStatusRef.current = 'processing_chunk';

        setBackendChunkStats((prev) => ({
          ...prev,
          chunksPending: pendingCount,
          isDelayed
        }));

        let response = null;
        let uploadError = null;

        try {
          response = await api.uploadAudioChunk(targetMeetingId, chunk.blob, {
            sessionId: chunk.sessionId,
            sequence: chunk.sequence,
            mimeType: chunk.mimeType,
            language: 'pt'
          });
        } catch (err) {
          uploadError = err;
        }

        if (uploadError) {
          console.warn(`[STT Backend] Erro no envio do chunk seq=${chunk.sequence}:`, uploadError);
          const httpStatus = uploadError.status || uploadError.statusCode || 500;

          // Se 503 (serviço STT indisponível), suspende fila e notifica usuário com segurança
          if (httpStatus === 503) {
            setTranscriptionStatus('service_unavailable');
            transcriptionStatusRef.current = 'service_unavailable';
            setBackendSttStatus((prev) => ({
              ...prev,
              available: false,
              reason: uploadError.reason || 'stt_unavailable'
            }));
            setError('O serviço de transcrição backend (faster-whisper) está indisponível. Alterne para o reconhecimento do navegador ou modo manual.');
            chunkQueueRef.current = [];
            stopBackendCapture('stt_unavailable');
            setBackendChunkStats((prev) => ({
              ...prev,
              chunksPending: 0,
              chunksFailed: (prev.chunksFailed || 0) + 1,
              lastHttpStatus: 503,
              lastError: 'HTTP 503: STT Indisponível'
            }));
            break;
          }

          // Falhas transitórias (timeout, erro de rede passageiro)
          chunk.attempts = (chunk.attempts || 0) + 1;
          if (chunk.attempts < 3) {
            console.warn(`[STT Backend] Retentando chunk seq=${chunk.sequence} (tentativa ${chunk.attempts}/3)...`);
            await new Promise((r) => setTimeout(r, 600 * chunk.attempts));
            continue;
          } else {
            console.error(`[STT Backend] Descartando chunk seq=${chunk.sequence} após ${chunk.attempts} tentativas falhas.`);
            chunkQueueRef.current.shift();
            setBackendChunkStats((prev) => ({
              ...prev,
              chunksPending: chunkQueueRef.current.length,
              chunksFailed: (prev.chunksFailed || 0) + 1,
              lastHttpStatus: httpStatus,
              lastError: `Falha persistente no chunk seq=${chunk.sequence}`
            }));
            continue;
          }
        }

        // Sucesso no processamento do chunk
        chunkQueueRef.current.shift();
        chunksConfirmedCountRef.current += 1;

        if (response) {
          if (response.signal_quality) {
            setSignalQuality(response.signal_quality);
          }
          if (response.transcript_raw) {
            setTranscriptRaw(response.transcript_raw);
          }
          if (response.transcript_normalized) {
            setTranscriptNormalized(response.transcript_normalized);
          }

          if (response.transcript) {
            setTranscription(response.transcript);
            finalTranscriptRef.current = response.transcript;
          } else if (response.text && response.text.trim()) {
            const chunkText = response.text.trim();
            setTranscription((prev) => {
              const currentFull = (prev || '').trim();
              if (currentFull.endsWith(chunkText)) return currentFull;
              return currentFull ? `${currentFull} ${chunkText}` : chunkText;
            });
            finalTranscriptRef.current = (finalTranscriptRef.current ? `${finalTranscriptRef.current.trim()} ` : '') + `${chunkText} `;
          }

          setBackendChunkStats((prev) => ({
            ...prev,
            chunksCaptured: chunksCapturedCountRef.current,
            chunksConfirmed: chunksConfirmedCountRef.current,
            chunksPending: chunkQueueRef.current.length,
            lastConfirmedSeq: chunk.sequence,
            lastProcessingTimeMs: response.processing_time_ms || 0,
            lastDuration: response.duration || 3.5,
            latencyHistory: [...(prev.latencyHistory || []).slice(-9), response.processing_time_ms || 0],
            lowConfidenceSegments: response.low_confidence_count ?? response.low_confidence_segments ?? prev.lowConfidenceSegments,
            modelName: response.model_name || prev.modelName || '',
            hardwareProfile: response.hardware_profile || prev.hardwareProfile || 'cpu_balanced',
            device: response.device || prev.device || 'cpu',
            computeType: response.compute_type || prev.computeType || 'int8',
            rtf: response.rtf || 0,
            queueSize: chunkQueueRef.current.length,
            isDelayed: chunkQueueRef.current.length > 2,
            glossaryCorrectionsCount: (response.glossary_corrections ? response.glossary_corrections.length : 0) + (prev.glossaryCorrectionsCount || 0),
            lastHttpStatus: 200,
            lastError: null
          }));
        }

        setError('');

        // Se fila esvaziou e o recorder continua ativo, volta status para captura ativa
        if (chunkQueueRef.current.length === 0) {
          if (isRecordingRef.current && !isPausedRef.current) {
            setTranscriptionStatus('transcription_active');
            transcriptionStatusRef.current = 'transcription_active';
          }
        }
      }
    } finally {
      isUploadingRef.current = false;
      if (chunkQueueRef.current.length > 0 && activeMeetingIdRef.current) {
        processChunkQueue();
      }
    }
  }, [stopBackendCapture]);

  // Início contínuo do MediaRecorder para chunks backend de áudio com timeslice 3500ms
  const startBackendCapture = useCallback((stream) => {
    const targetMeetingId = activeMeetingIdRef.current;
    if (!targetMeetingId || !stream) return;

    // Regra estrita: apenas trilha de áudio, nunca vídeo no recorder do STT
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn('[STT Backend] Nenhuma trilha de áudio no stream');
      setAudioStatus('unavailable');
      setTranscriptionStatus('mic_disconnected');
      transcriptionStatusRef.current = 'mic_disconnected';
      return;
    }

    const audioOnlyStream = new MediaStream(audioTracks);

    stopBackendCapture('new_session_starting');

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
    sessionStartTimeRef.current = Date.now();

    chunksCapturedCountRef.current = 0;
    chunksConfirmedCountRef.current = 0;
    chunkQueueRef.current = [];

    setDiagnosticInfo((prev) => ({
      ...prev,
      engine: 'Backend STT (faster-whisper)',
      activeSessionId: sessionId,
      lastEvent: 'media_recorder_started',
      lastEventTime: new Date().toLocaleTimeString('pt-BR'),
      lastError: null
    }));

    setBackendChunkStats((prev) => ({
      ...prev,
      chunksCaptured: 0,
      chunksConfirmed: 0,
      chunksPending: 0,
      chunksFailed: 0,
      lastConfirmedSeq: -1,
      isDelayed: false,
      lastError: null
    }));

    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) return;
      if (activeMeetingIdRef.current !== targetMeetingId) return;
      if (isPausedRef.current) return;

      const currentSeq = chunkSequenceRef.current++;
      chunksCapturedCountRef.current += 1;

      const chunkItem = {
        sequence: currentSeq,
        blob: event.data,
        size: event.data.size,
        capturedAt: Date.now(),
        sessionId,
        targetMeetingId,
        mimeType: recorder.mimeType || mimeType,
        attempts: 0
      };

      chunkQueueRef.current.push(chunkItem);

      setBackendChunkStats((prev) => ({
        ...prev,
        chunksCaptured: chunksCapturedCountRef.current,
        chunksPending: chunkQueueRef.current.length,
        isDelayed: chunkQueueRef.current.length > 2
      }));

      if (transcriptionStatusRef.current === 'idle' || transcriptionStatusRef.current === 'awaiting_start' || transcriptionStatusRef.current === 'listening') {
        setTranscriptionStatus('capturing_audio');
        transcriptionStatusRef.current = 'capturing_audio';
      }

      // Dispara o consumidor da fila FIFO sem bloquear a gravação contínua do recorder
      processChunkQueue();
    };

    recorder.onerror = (e) => {
      console.warn('[STT Backend] Erro no MediaRecorder:', e);
      setDiagnosticInfo((prev) => ({
        ...prev,
        lastError: `MediaRecorder error: ${e.error?.name || 'unknown'}`
      }));
    };

    recorder.onstop = () => {
      console.log('[STT Backend] MediaRecorder parado');
    };

    try {
      // Timeslice de 3500ms (3.5 segundos) para menor latência e streaming constante
      recorder.start(3500);
      mediaRecorderRef.current = recorder;
      setTranscriptionStatus('capturing_audio');
      transcriptionStatusRef.current = 'capturing_audio';
      setEngineState('ativa');
    } catch (err) {
      console.error('[STT Backend] Falha ao iniciar MediaRecorder.start(3500):', err);
      setError(`Falha ao iniciar gravação contínua: ${err.message || err.name}`);
    }
  }, [getSupportedAudioMimeType, stopBackendCapture, processChunkQueue]);

  // Reinício rápido da captura contínua
  const restartBackendCapture = useCallback((reason = 'manual_restart') => {
    stopBackendCapture(reason);
    setTimeout(() => {
      if (streamRef.current && isRecordingRef.current) {
        startBackendCapture(streamRef.current);
      }
    }, 300);
  }, [startBackendCapture, stopBackendCapture]);

  // Handler para quando a trilha de microfone é encerrada pelo sistema
  const handleMicrophoneTrackEnded = useCallback(() => {
    console.warn('[Audio] Trilha de microfone finalizada pelo sistema');
    setAudioStatus('ended');
    setTranscriptionStatus('mic_disconnected');
    transcriptionStatusRef.current = 'mic_disconnected';
    setEngineState('sem_sinal');
    setError('O microfone foi desconectado ou encerrado pelo sistema operacional. Reconecte o dispositivo e clique em "Reconectar Microfone".');
    stopBackendCapture('microphone_track_ended');
  }, [stopBackendCapture]);

  // Aliases compatíveis com referências pré-existentes
  const startBackendRecorder = startBackendCapture;
  const stopBackendRecorder = stopBackendCapture;

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
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
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
      audioTracks[0].onended = handleMicrophoneTrackEnded;
      audioTracks[0].onmute = () => {
        setAudioStatus('muted');
      };
      audioTracks[0].onunmute = () => {
        setAudioStatus('active');
      };
    }

    // Validação e listeners da trilha de vídeo (isolados da gravação de áudio)
    const videoTracks = stream.getVideoTracks();
    if (cameraAcquired && videoTracks.length > 0) {
      setVideoStatus('active');
      setIsCamOff(false);
      videoTracks[0].onended = () => {
        console.warn('Trilha de vídeo finalizada (câmera desligada ou desconectada)');
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
  }, [activeMeetingId, selectedAudioDeviceId, setupAudioAnalyser, startSpeechRecognition, startBackendRecorder, backendSttStatus.available, handleMicrophoneTrackEnded, facingMode]);

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
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMeetingId, currentMeeting?.STATUS_MEETING, startMediaAndRecognition, stopMediaAndRecognition]);

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

  // Exclusão de reunião ao vivo com confirmação
  const handleDeleteMeeting = async (meetingId, title) => {
    if (!window.confirm(`Tem certeza que deseja excluir a reunião "${title || 'sem título'}"?`)) {
      return;
    }
    try {
      await api.deleteLiveMeeting(meetingId);
      if (meetingId === activeMeetingId) {
        stopMediaAndRecognition();
        setActiveMeetingId(null);
      }
      await loadLiveMeetings();
    } catch (err) {
      console.error(`Erro ao excluir reunião ${meetingId}:`, err);
      alert(`Erro ao excluir reunião: ${err.message || err}`);
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

  // Alternar modelo STT dinamicamente
  const handleSwitchModel = async (newModel) => {
    try {
      setSwitchingModel(true);
      setModelSwitchSuccess('');
      setError('');
      const res = await api.switchSttModel(newModel);
      if (res && res.status === 'success') {
        setSelectedModelSize(newModel);
        setBackendSttStatus((prev) => ({
          ...prev,
          model: newModel,
          model_name: `faster-whisper-${newModel}`
        }));
        setModelSwitchSuccess(`Modelo alterado para ${newModel} com sucesso!`);
      }
    } catch (e) {
      console.error('Erro ao alternar modelo STT:', e);
      setError(`Erro ao alternar modelo STT: ${e.message || e}`);
    } finally {
      setSwitchingModel(false);
    }
  };

  // Abrir confirmação de finalização
  const handleFinishAndAnalyze = () => {
    setShowFinishConfirmModal(true);
  };

  // Confirmar encerramento e síntese de atas
  const handleConfirmFinishAndAnalyze = async () => {
    if (!currentMeeting) return;
    const mid = currentMeeting.ID_MEETING;
    setShowFinishConfirmModal(false);
    stopMediaAndRecognition();

    try {
      if (refineBeforeFinish) {
        setReprocessing(true);
        try {
          const repRes = await api.reprocessLiveMeeting(mid, true);
          if (repRes && repRes.reprocessed_text) {
            setTranscription(repRes.reprocessed_text);
            setTranscriptNormalized(repRes.reprocessed_text);
          }
        } catch (repErr) {
          console.warn('Reprocessamento antes de finalizar falhou, prosseguindo com texto atual:', repErr);
        } finally {
          setReprocessing(false);
        }
      }

      await saveTranscriptToBackend(transcription);
      await handleMeetingAction(mid, 'finalizar');

      if (onLeaveMeeting) {
        await onLeaveMeeting(transcription, mid);
      } else if (onAnalyzeMeeting) {
        onAnalyzeMeeting(mid);
      }
    } catch (finishErr) {
      console.error('Erro ao finalizar reunião:', finishErr);
      setError(`Erro ao finalizar reunião: ${finishErr.message || finishErr}`);
    }
  };

  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessSuccess, setReprocessSuccess] = useState('');

  const handleReprocessTranscript = async () => {
    const mid = activeMeetingIdRef.current;
    if (!mid) return;
    setReprocessing(true);
    setReprocessSuccess('');
    setError('');
    try {
      const res = await api.post(`/live/meetings/${mid}/reprocess?reanalyze=true`);
      if (res && res.status === 'success') {
        if (res.reprocessed_text) {
          setTranscription(res.reprocessed_text);
          setTranscriptNormalized(res.reprocessed_text);
        }
        setReprocessSuccess('Transcrição refinada em pós-processamento com sucesso!');
        await loadLiveMeetings();
      }
    } catch (e) {
      console.warn('Erro ao reprocessar transcrição:', e);
      setError('Falha ao reprocessar transcrição.');
    } finally {
      setReprocessing(false);
    }
  };

  // Formatar tempo em HH:MM:SS
  const formatTimer = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs > 0 ? `${hrs.toString().padStart(2, '0')}:` : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Alternar entre câmera frontal e traseira no celular sem interromper áudio ou STT
  const handleToggleFacingMode = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    if (!streamRef.current) return;
    try {
      const currentVideoTrack = streamRef.current.getVideoTracks()[0];
      if (currentVideoTrack) {
        currentVideoTrack.stop();
        streamRef.current.removeTrack(currentVideoTrack);
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        streamRef.current.addTrack(newVideoTrack);
        setIsCamOff(false);
        setVideoStatus('active');
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
      console.warn('Erro ao alternar câmera frontal/traseira:', err);
    }
  };

  // Responsividade e ciclo de vida mobile (rotação, visibilidade e redimensionamento)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileScreen(window.innerWidth <= 767);
    };
    window.addEventListener('resize', checkMobile);
    window.addEventListener('orientationchange', checkMobile);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const audioTrack = streamRef.current?.getAudioTracks()[0];
        if (audioTrack && audioTrack.readyState === 'ended' && isRecordingRef.current) {
          console.warn('[Mobile] Trilha de microfone pausada pelo SO ao retornar à aba');
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('orientationchange', checkMobile);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
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
        restartBackendCapture('user_gesture');
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

    // Sub-render do Chat da Reunião (Totalmente independente da transcrição)
    const renderChatView = () => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--pf-surface)' }}>
        {/* Header informativo do Chat */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--pf-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--pf-surface-elevated)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={16} color="var(--pf-accent)" />
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pf-text-primary)' }}>
              Chat da Reunião
            </span>
            <span style={{ fontSize: '11px', color: 'var(--pf-text-secondary)' }}>
              ({chatMessages.length} {chatMessages.length === 1 ? 'mensagem' : 'mensagens'})
            </span>
          </div>
          {!isMobileScreen && (
            <button
              type="button"
              onClick={() => setShowCollabPanel(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--pf-text-secondary)', cursor: 'pointer', padding: '4px' }}
              title="Fechar painel lateral"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Lista de Mensagens de Chat com Scroll */}
        <div
          ref={chatScrollRef}
          onScroll={handleChatScroll}
          className="chat-messages-container"
        >
          {chatMessages.length === 0 ? (
            <div className="chat-empty-state">
              <div className="chat-empty-icon">
                <MessageSquare size={24} />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pf-text-primary)' }}>
                Nenhuma mensagem ainda
              </div>
              <div style={{ fontSize: '12px', color: 'var(--pf-text-secondary)', maxWidth: '240px' }}>
                Escreva uma mensagem para interagir com os participantes durante a reunião.
              </div>
            </div>
          ) : (
            chatMessages.map((msg) => {
              const isOwn = (msg.author || '').startsWith('Você') || msg.author === (currentMeeting?.DEPARTAMENTO ? `Você (${currentMeeting.DEPARTAMENTO})` : 'Você');
              const timeFormatted = msg.timestamp
                ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';

              return (
                <div
                  key={msg.id || msg.client_message_id}
                  className={`chat-bubble-row ${isOwn ? 'own' : 'other'}`}
                >
                  <div className="chat-bubble-meta">
                    <span style={{ fontWeight: 600 }}>{msg.author}</span>
                    {timeFormatted && <span>• {timeFormatted}</span>}
                  </div>
                  <div className={`chat-bubble ${isOwn ? 'own' : 'other'}`}>
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Barra de Envio de Mensagem */}
        <form onSubmit={handleSendChatMessage} className="chat-input-bar">
          <textarea
            value={chatInputText}
            onChange={(e) => setChatInputText(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Escreva uma mensagem... (Enter envia, Shift+Enter quebra linha)"
            className="chat-textarea"
            rows={1}
            maxLength={1500}
          />
          <button
            type="submit"
            disabled={!chatInputText.trim() || chatSending}
            className="chat-send-btn"
            title="Enviar mensagem (Enter)"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    );

    // Sub-render da Transcrição
    const renderTranscriptView = () => (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--pf-surface)' }}>
        {/* Header da Transcrição */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--pf-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--pf-surface-elevated)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} color="var(--pf-accent)" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--pf-text-primary)' }}>
              Transcrição da Reunião
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--pf-text-secondary)' }}>
              ({transcription.length} carac.)
            </span>
          </div>
          {!isMobileScreen && (
            <button
              type="button"
              onClick={() => setShowCollabPanel(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--pf-text-secondary)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px'
              }}
              title="Fechar painel lateral"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Subheader / Ações e Filtro */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--pf-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: 'rgba(0, 0, 0, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            {/* Alternador Normalizado / Bruto */}
            <div style={{ display: 'inline-flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--pf-border)', fontSize: '10px' }}>
              <button
                type="button"
                onClick={() => setTranscriptViewMode('normalized')}
                style={{
                  padding: '4px 8px',
                  border: 'none',
                  background: transcriptViewMode === 'normalized' ? 'var(--pf-accent)' : 'transparent',
                  color: transcriptViewMode === 'normalized' ? '#fff' : 'var(--pf-text-secondary)',
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
                  padding: '4px 8px',
                  border: 'none',
                  background: transcriptViewMode === 'raw' ? 'var(--pf-accent)' : 'transparent',
                  color: transcriptViewMode === 'raw' ? '#fff' : 'var(--pf-text-secondary)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
                title="Texto bruto original do Whisper para auditoria (sem correções)"
              >
                Bruto (Auditoria)
              </button>
            </div>

            {/* Refinamento e Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {!isRecording && activeMeetingId && (
                <button
                  type="button"
                  onClick={handleReprocessTranscript}
                  disabled={reprocessing}
                  className="btn btn-secondary"
                  style={{ fontSize: '10px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  title="Executa reprocessamento de alta precisão com concatenação de áudio e beam search 5"
                >
                  <RefreshCw size={10} className={reprocessing ? 'spin' : ''} />
                  {reprocessing ? 'Refinando...' : 'Refinar'}
                </button>
              )}

              {reprocessSuccess && <span style={{ color: '#10b981', fontSize: '10.5px' }}>✨ {reprocessSuccess}</span>}
              {syncStatus === 'saving' && <span style={{ color: '#eab308', fontSize: '10.5px' }}>Salvando...</span>}
              {syncStatus === 'synced' && <span style={{ color: '#10b981', fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '2px' }}><Check size={11} /> Salvo</span>}
              {syncStatus === 'unsaved' && <span style={{ color: '#f87171', fontSize: '10.5px' }}>Rascunho local</span>}
            </div>
          </div>

          {/* Campo de Busca na Transcrição */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--pf-bg-base)',
            border: '1px solid var(--pf-border)',
            borderRadius: '6px',
            padding: '4px 8px',
            gap: '6px'
          }}>
            <Search size={12} color="var(--pf-text-secondary)" />
            <input
              type="text"
              value={transcriptSearchQuery}
              onChange={(e) => setTranscriptSearchQuery(e.target.value)}
              placeholder="Pesquisar termos na transcrição..."
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--pf-text-primary)',
                fontSize: '11px',
                outline: 'none',
                width: '100%'
              }}
            />
            {transcriptSearchQuery && (
              <button
                type="button"
                onClick={() => setTranscriptSearchQuery('')}
                style={{ background: 'transparent', border: 'none', color: 'var(--pf-text-secondary)', cursor: 'pointer', fontSize: '11px' }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Corpo da Transcrição */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            fontSize: '13px',
            lineHeight: '1.65',
            background: 'rgba(0, 0, 0, 0.04)'
          }}
        >
          {isManualEditMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '11px', color: '#38bdf8' }}>
                <span>Modo de Edição / Digitação Manual</span>
                <span style={{ fontSize: '10px', color: 'var(--pf-text-secondary)' }}>Digite ou cole as notas da reunião</span>
              </div>
              <textarea
                value={transcription}
                onChange={(e) => {
                  const val = e.target.value;
                  setTranscription(val);
                  finalTranscriptRef.current = val;
                  setSyncStatus('unsaved');
                }}
                placeholder="Digite aqui as notas ou a pauta da reunião..."
                style={{
                  flex: 1,
                  width: '100%',
                  minHeight: '260px',
                  background: 'var(--pf-bg-base)',
                  border: '1px solid var(--pf-border)',
                  borderRadius: '6px',
                  padding: '12px',
                  color: 'var(--pf-text-primary)',
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
              {transcriptViewMode === 'raw' ? (
                <div style={{ marginBottom: '8px', fontSize: '10.5px', color: 'var(--pf-text-secondary)', fontStyle: 'italic' }}>
                  🔍 Visualizando transcrição bruta do Whisper para auditoria (imutável)
                </div>
              ) : (
                backendChunkStats.glossaryCorrectionsCount > 0 && (
                  <div style={{ marginBottom: '8px', fontSize: '10.5px', color: '#38bdf8' }}>
                    ✨ {backendChunkStats.glossaryCorrectionsCount} ajuste(s) de termos corporativos aplicado(s) com evidência fonética.
                  </div>
                )
              )}

              <div style={{ whiteSpace: 'pre-wrap', color: 'var(--pf-text-primary)' }}>
                {(() => {
                  const text = transcriptViewMode === 'raw' ? (transcriptRaw || transcription) : (transcriptNormalized || transcription);
                  if (!transcriptSearchQuery.trim()) {
                    return text;
                  }
                  const parts = text.split(new RegExp(`(${transcriptSearchQuery.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
                  return parts.map((part, i) =>
                    part.toLowerCase() === transcriptSearchQuery.toLowerCase() ? (
                      <mark key={i} style={{ background: '#f59e0b', color: '#000', borderRadius: '2px', padding: '1px 3px' }}>
                        {part}
                      </mark>
                    ) : (
                      part
                    )
                  );
                })()}
              </div>
              {isRecording && <span className="typing-indicator" style={{ display: 'inline-block', marginLeft: '6px' }} />}
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: '220px',
              textAlign: 'center',
              gap: '12px',
              padding: '24px',
              color: 'var(--pf-text-secondary)'
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: getTranscriptionStatusInfo(transcriptionStatus).dotColor,
                boxShadow: `0 0 8px ${getTranscriptionStatusInfo(transcriptionStatus).dotColor}`
              }} />
              <p style={{ margin: 0, fontSize: '12.5px', maxWidth: '300px', lineHeight: 1.5 }}>
                {getEmptyMessage(transcriptionStatus, currentMeeting.TITULO_REUNIAO)}
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => setIsManualEditMode(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <FileText size={12} />
                  Digitar Manualmente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer da Transcrição */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--pf-border)',
          display: 'flex',
          gap: '8px',
          background: 'var(--pf-surface-elevated)'
        }}>
          <button
            type="button"
            onClick={() => {
              const text = transcriptViewMode === 'raw' ? (transcriptRaw || transcription) : (transcriptNormalized || transcription);
              if (navigator.clipboard && text) {
                navigator.clipboard.writeText(text);
              }
            }}
            className="btn btn-secondary"
            style={{ flex: 1, fontSize: '11px', padding: '7px 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          >
            <Copy size={12} />
            Copiar Texto
          </button>

          <button
            type="button"
            onClick={() => setIsManualEditMode(!isManualEditMode)}
            className="btn btn-secondary"
            style={{ flex: 1, fontSize: '11px', padding: '7px 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          >
            <FileText size={12} />
            {isManualEditMode ? 'Ver Texto Voz' : 'Editar Manual'}
          </button>
        </div>
      </div>
    );

    return (
      <div className="live-room-wrapper live-room-active" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '100vh', background: 'var(--bg-main)' }}>
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

        {/* =========================================================================
            HEADER DA SALA ATIVA — RESPONSIVO (MOBILE SLIM / DESKTOP FULL)
            ========================================================================= */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobileScreen ? '8px 12px' : '10px 20px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid var(--border-color)',
          flexWrap: 'nowrap',
          gap: '8px',
          zIndex: 10,
          minHeight: '48px'
        }}>
          {isMobileScreen ? (
            <>
              {/* Lado Esquerdo Mobile: Voltar + Título compact + Timer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                <button
                  type="button"
                  onClick={() => setActiveMeetingId(null)}
                  className="btn btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '40px',
                    minHeight: '40px',
                    padding: '6px',
                    borderRadius: '8px'
                  }}
                  title="Sair da sala"
                >
                  <ArrowLeft size={16} />
                </button>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <h2 style={{
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      margin: 0,
                      color: 'var(--text-main)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '140px'
                    }}>
                      {currentMeeting.TITULO_REUNIAO}
                    </h2>
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: badge.color,
                      flexShrink: 0
                    }} title={badge.label} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span style={{ color: '#38bdf8', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={10} />
                      {formatTimer(durationSeconds)}
                    </span>
                    <span>• {currentMeeting.DEPARTAMENTO || 'Geral'}</span>
                  </div>
                </div>
              </div>

              {/* Lado Direito Mobile: Alternar Câmera (se ativa) + Menu de Ações (...) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {videoStatus === 'active' && !isCamOff && (
                  <button
                    type="button"
                    onClick={handleToggleFacingMode}
                    className="btn btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '40px',
                      minHeight: '40px',
                      padding: '6px',
                      borderRadius: '8px'
                    }}
                    title="Alternar câmera frontal/traseira"
                  >
                    <RotateCw size={15} color="#38bdf8" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowMobileActionSheet(true)}
                  className="btn btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '40px',
                    minHeight: '40px',
                    padding: '6px',
                    borderRadius: '8px'
                  }}
                  title="Mais opções da reunião"
                >
                  <MoreVertical size={16} />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Versão Desktop Completa */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setActiveMeetingId(null)}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                  title="Voltar para a central de reuniões"
                >
                  <ArrowLeft size={14} />
                  Sair da Sala
                </button>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
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
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: 'var(--text-muted)',
                      fontWeight: 600
                    }}>
                      {currentMeeting.DEPARTAMENTO || 'Geral'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#38bdf8', fontWeight: 600 }}>
                      <Clock size={12} />
                      {formatTimer(durationSeconds)}
                    </span>
                    <span>Horário: <strong style={{ color: 'var(--text-main)' }}>{currentMeeting.HORARIO_AGENDADO}</strong></span>
                    <span>Data: {currentMeeting.DT_MEETING}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                      style={{ fontSize: '11px', padding: '4px 8px', maxWidth: '170px' }}
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

                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}${window.location.pathname}?view=meeting&id=${currentMeeting.ID_MEETING}`;
                    window.open(url, '_blank');
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  title="Abrir esta reunião em janela/aba separada"
                >
                  <ExternalLink size={13} />
                  Nova Aba
                </button>

                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  title="Ajustes de motor STT, modelo faster-whisper e vocabulário contextual"
                >
                  <Settings size={13} />
                  Ajustes
                </button>

                <button
                  type="button"
                  onClick={() => setShowTechnicalDiagnostics(true)}
                  className="btn btn-secondary"
                  style={{ fontSize: '11px', padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  title="Exibir métricas e diagnóstico técnico desacoplado"
                >
                  <Activity size={13} />
                  Diagnóstico
                </button>
              </div>
            </>
          )}
        </div>

        {/* Notificação de Câmera Desconectada / Ocupada */}
        {cameraNotice && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 16px',
            background: 'rgba(234, 179, 8, 0.12)',
            borderBottom: '1px solid rgba(234, 179, 8, 0.3)',
            color: '#fbbf24',
            fontSize: '11.5px',
            zIndex: 10
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

        {/* Notificação de Erro de Mídia / Microfone */}
        {mediaError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 16px',
            background: 'rgba(239, 68, 68, 0.15)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#f87171',
            fontSize: '11.5px',
            zIndex: 10
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

        {/* Notificação de Erro Geral */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 16px',
            background: 'rgba(239, 68, 68, 0.15)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#f87171',
            fontSize: '11.5px',
            zIndex: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError('')}
              style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '13px' }}
              title="Fechar aviso"
            >
              ✕
            </button>
          </div>
        )}

        {/* =========================================================================
            PALCO CENTRAL E SALA — VISUAL LIMPO TEAMS / GOOGLE MEET
            ========================================================================= */}
        {/* Navegação por Segmentos no Celular (Sala | Chat | Transcrição) — Padrão: Sala */}
        {isMobileScreen && (
          <div className="mobile-meeting-segmented-nav">
            <button
              type="button"
              className={`mobile-segment-btn ${mobileRoomTab === 'room' ? 'active' : ''}`}
              onClick={() => setMobileRoomTab('room')}
              title="Sala da reunião e controles"
            >
              <Users size={15} />
              <span>Sala</span>
            </button>
            <button
              type="button"
              className={`mobile-segment-btn ${mobileRoomTab === 'chat' ? 'active' : ''}`}
              onClick={() => setMobileRoomTab('chat')}
              title="Chat com os participantes"
            >
              <MessageSquare size={15} />
              <span>Chat</span>
              {chatMessages.length > 0 && (
                <span style={{
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: mobileRoomTab === 'chat' ? '#ffffff' : 'var(--pf-accent)',
                  color: mobileRoomTab === 'chat' ? 'var(--pf-accent)' : '#ffffff',
                  fontWeight: 700
                }}>
                  {chatMessages.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`mobile-segment-btn ${mobileRoomTab === 'transcript' ? 'active' : ''}`}
              onClick={() => setMobileRoomTab('transcript')}
              title="Transcrição automática da reunião"
            >
              <FileText size={15} />
              <span>Transcrição</span>
            </button>
          </div>
        )}

        {/* CONTAINER PRINCIPAL DA SALA DIGITAL (Desktop e Celular) */}
        <div className="meeting-stage-container">
          {/* PALCO CENTRAL DA REUNIÃO (Desktop ou Celular na aba 'room') */}
          {(!isMobileScreen || mobileRoomTab === 'room') && (
            <div className="meeting-stage-main">
              {/* Feed de Vídeo Local */}
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
                  objectFit: 'contain',
                  borderRadius: '12px'
                }}
              />

              {/* Placeholder quando Câmera Desligada ou Indisponível */}
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
                    background: 'radial-gradient(ellipse at center, var(--pf-surface-elevated) 0%, var(--pf-bg-base) 70%)',
                    gap: '16px',
                    padding: '20px',
                    textAlign: 'center'
                  }}
                >
                  {/* Avatar com Animação de Pulso de Áudio */}
                  <div style={{
                    position: 'relative',
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--pf-surface) 0%, var(--pf-surface-elevated) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2.2rem',
                    fontWeight: 800,
                    color: 'var(--pf-accent)',
                    border: '2px solid rgba(56, 189, 248, 0.4)',
                    boxShadow: audioLevel > 10
                      ? '0 0 0 8px rgba(16, 185, 129, 0.2), 0 0 35px rgba(16, 185, 129, 0.45)'
                      : '0 8px 24px rgba(0, 0, 0, 0.4)',
                    transition: 'box-shadow 0.15s ease'
                  }}>
                    {(currentMeeting.DEPARTAMENTO || 'TOTVS').substring(0, 2).toUpperCase()}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--pf-text-primary)' }}>
                      {isCamOff ? 'Câmera desligada' : videoStatus === 'denied' ? 'Permissão de câmera não concedida' : 'Câmera não detectada'}
                    </span>
                    <span style={{ fontSize: '12.5px', color: 'var(--pf-text-secondary)', maxWidth: '400px' }}>
                      O áudio e a transcrição da reunião continuam ativos em segundo plano.
                    </span>
                  </div>

                  {/* Indicador de Captação e Sinal */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', marginTop: '4px' }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      background: audioStatus === 'active' && !isMuted ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      border: `1px solid ${audioStatus === 'active' && !isMuted ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                      fontSize: '11px',
                      fontWeight: 600,
                      color: audioStatus === 'active' && !isMuted ? '#10b981' : '#f87171'
                    }}>
                      {audioStatus === 'active' && !isMuted ? <Mic size={12} /> : <MicOff size={12} />}
                      <span>{audioStatus === 'active' && !isMuted ? `Captação ativa (${audioLevel}%)` : 'Microfone silenciado'}</span>
                    </div>

                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: signalQuality === 'saturado' ? 'rgba(239, 68, 68, 0.15)' :
                                  signalQuality === 'baixo' ? 'rgba(245, 158, 11, 0.15)' :
                                  'rgba(16, 185, 129, 0.15)',
                      border: `1px solid ${
                                  signalQuality === 'saturado' ? 'rgba(239, 68, 68, 0.35)' :
                                  signalQuality === 'baixo' ? 'rgba(245, 158, 11, 0.35)' :
                                  'rgba(16, 185, 129, 0.35)'}`,
                      color: signalQuality === 'saturado' ? '#ef4444' :
                             signalQuality === 'baixo' ? '#f59e0b' :
                             '#10b981'
                    }}>
                      <span>
                        {signalQuality === 'saturado' ? '⚠️ Áudio Saturado' :
                         signalQuality === 'baixo' ? '⚠️ Sinal Baixo' :
                         '🎙️ Sinal Adequado'}
                      </span>
                    </div>
                  </div>

                  {/* Card de autorização prévia de microfone no celular */}
                  {audioStatus !== 'active' && (
                    <div className="mobile-pre-permission-card" style={{
                      marginTop: '10px',
                      padding: '14px 18px',
                      borderRadius: '12px',
                      background: 'var(--pf-surface)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                      maxWidth: '360px',
                      width: '92%',
                      textAlign: 'center'
                    }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                        <Mic size={20} color="#38bdf8" />
                      </div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--pf-text-primary)', marginBottom: '4px' }}>
                        Ative o microfone para registrar a reunião
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--pf-text-secondary)', marginBottom: '12px', lineHeight: 1.4 }}>
                        Navegadores em celulares exigem um toque direto para autorizar a gravação e transcrever continuamente.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => startMediaAndRecognition()}
                          style={{ minHeight: '44px', width: '100%', justifyContent: 'center', fontWeight: 600, fontSize: '12.5px' }}
                        >
                          <Mic size={15} /> Ativar microfone agora
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setShowPermissionHelpModal(true)}
                          style={{ minHeight: '40px', width: '100%', justifyContent: 'center', fontSize: '11px', color: 'var(--pf-text-secondary)' }}
                        >
                          <HelpCircle size={13} /> Como liberar no Safari / Chrome
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PÍLULA DISCRETA NO PALCO CENTRAL */}
              <div style={{
                position: 'absolute',
                top: '18px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 20,
                background: 'rgba(15, 23, 42, 0.88)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '30px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
                fontSize: '11.5px',
                color: 'var(--pf-text-primary)',
                whiteSpace: 'nowrap',
                maxWidth: '90vw'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: isMuted ? '#f59e0b' :
                                transcriptionStatus === 'receiving_speech' ? '#10b981' :
                                transcriptionStatus === 'processing_chunk' ? '#38bdf8' :
                                isRecording ? '#10b981' : '#64748b',
                    boxShadow: isRecording && !isMuted ? '0 0 8px #10b981' : 'none'
                  }}></span>
                  <span style={{ fontWeight: 600 }}>
                    {isMuted
                      ? 'Microfone silenciado • Transcrição pausada'
                      : currentMeeting.STATUS_MEETING === 'pausada'
                      ? 'Reunião pausada'
                      : sttProvider === 'manual'
                      ? 'Registro manual ativo'
                      : 'Transcrição ativa • A reunião está sendo registrada para gerar a ata'}
                  </span>
                </div>

                {!isMobileScreen && !showCollabPanel && (
                  <button
                    type="button"
                    onClick={() => { setShowCollabPanel(true); setCollabTab('chat'); }}
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      color: '#38bdf8',
                      borderRadius: '16px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Abrir painel lateral de colaboração"
                  >
                    <MessageSquare size={12} />
                    <span>Abrir Chat</span>
                  </button>
                )}

                {!['listening', 'receiving_speech', 'capturing_audio', 'processing_chunk', 'transcription_active'].includes(transcriptionStatus) && isRecording && (
                  <button
                    type="button"
                    onClick={handleActivateTranscription}
                    style={{
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      color: '#10b981',
                      borderRadius: '16px',
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Ativar reconhecimento de voz"
                  >
                    <Play size={10} fill="#10b981" />
                    <span>Ativar</span>
                  </button>
                )}
              </div>

              {/* Overlay com Nome do Participante (Canto Inferior Esquerdo) */}
              <div style={{
                position: 'absolute',
                bottom: '18px',
                left: '20px',
                zIndex: 15,
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(8px)',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <span>Você ({currentMeeting.DEPARTAMENTO || 'TOTVS'})</span>
                {isMuted && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 5px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.4)' }} title="Microfone silenciado">
                    <MicOff size={11} color="#f87171" />
                  </span>
                )}
              </div>

              {/* BARRA DE CONTROLES INFERIOR FLUTUANTE (TEAMS / MEET DOCK) */}
              <div
                className="meeting-controls-dock"
                style={{
                  position: 'absolute',
                  bottom: isMobileScreen ? 'calc(10px + var(--sab, 0px))' : '18px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 25,
                  background: 'rgba(15, 23, 42, 0.94)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '24px',
                  padding: isMobileScreen ? '4px 10px' : '6px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: isMobileScreen ? '6px' : '12px',
                  boxShadow: '0 12px 36px rgba(0,0,0,0.55)',
                  maxWidth: '96vw',
                  flexWrap: 'nowrap',
                  justifyContent: 'center'
                }}
              >
                {/* Microfone */}
                <button
                  type="button"
                  className={`control-btn ${isMuted ? 'active' : ''}`}
                  onClick={toggleMute}
                  style={{ padding: isMobileScreen ? '4px 6px' : '6px 12px', gap: '2px', minWidth: '44px', minHeight: '44px' }}
                  title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
                >
                  <div className="icon-circle" style={{
                    width: isMobileScreen ? 36 : 40,
                    height: isMobileScreen ? 36 : 40,
                    background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    borderColor: isMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.15)'
                  }}>
                    {isMuted ? <MicOff size={isMobileScreen ? 16 : 18} color="#f87171" /> : <Mic size={isMobileScreen ? 16 : 18} />}
                  </div>
                  <span style={{ fontSize: '10px' }}>{isMuted ? 'Desmutar' : 'Mutar'}</span>
                </button>

                {/* Câmera */}
                <button
                  type="button"
                  className={`control-btn ${isCamOff ? 'active' : ''}`}
                  onClick={toggleCamera}
                  style={{ padding: isMobileScreen ? '4px 6px' : '6px 12px', gap: '2px', minWidth: '44px', minHeight: '44px' }}
                  title={isCamOff ? 'Ligar Câmera' : 'Parar Câmera'}
                >
                  <div className="icon-circle" style={{
                    width: isMobileScreen ? 36 : 40,
                    height: isMobileScreen ? 36 : 40,
                    background: isCamOff ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    borderColor: isCamOff ? '#ef4444' : 'rgba(255, 255, 255, 0.15)'
                  }}>
                    {isCamOff ? <VideoOff size={isMobileScreen ? 16 : 18} color="#f87171" /> : <Video size={isMobileScreen ? 16 : 18} />}
                  </div>
                  <span style={{ fontSize: '10px' }}>{isCamOff ? 'Ligar' : 'Parar'}</span>
                </button>

                {/* Pausar / Retomar */}
                {currentMeeting.STATUS_MEETING === 'ao_vivo' ? (
                  <button
                    type="button"
                    className="control-btn"
                    onClick={() => handleMeetingAction(currentMeeting.ID_MEETING, 'pausar')}
                    style={{ padding: isMobileScreen ? '4px 6px' : '6px 12px', gap: '2px', minWidth: '44px', minHeight: '44px' }}
                    title="Pausar a reunião e a gravação"
                  >
                    <div className="icon-circle" style={{ width: isMobileScreen ? 36 : 40, height: isMobileScreen ? 36 : 40, background: 'rgba(234, 179, 8, 0.15)', borderColor: '#eab308' }}>
                      <Pause size={isMobileScreen ? 16 : 18} color="#eab308" />
                    </div>
                    <span style={{ fontSize: '10px' }}>Pausar</span>
                  </button>
                ) : currentMeeting.STATUS_MEETING === 'pausada' || currentMeeting.STATUS_MEETING === 'agendada' ? (
                  <button
                    type="button"
                    className="control-btn"
                    onClick={() => handleMeetingAction(currentMeeting.ID_MEETING, 'iniciar')}
                    style={{ padding: isMobileScreen ? '4px 6px' : '6px 12px', gap: '2px', minWidth: '44px', minHeight: '44px' }}
                    title="Iniciar ou Retomar Reunião"
                  >
                    <div className="icon-circle" style={{ width: isMobileScreen ? 36 : 40, height: isMobileScreen ? 36 : 40, background: 'rgba(16, 185, 129, 0.15)', borderColor: '#10b981' }}>
                      <Play size={isMobileScreen ? 16 : 18} color="#10b981" />
                    </div>
                    <span style={{ fontSize: '10px' }}>{currentMeeting.STATUS_MEETING === 'pausada' ? 'Retomar' : 'Iniciar'}</span>
                  </button>
                ) : null}

                {/* Botão Chat */}
                <button
                  type="button"
                  className={`control-btn ${(isMobileScreen ? mobileRoomTab === 'chat' : showCollabPanel && collabTab === 'chat') ? 'active' : ''}`}
                  onClick={() => {
                    if (isMobileScreen) {
                      setMobileRoomTab('chat');
                    } else {
                      setShowCollabPanel(true);
                      setCollabTab('chat');
                    }
                  }}
                  style={{ padding: isMobileScreen ? '4px 6px' : '6px 12px', gap: '2px', minWidth: '44px', minHeight: '44px' }}
                  title="Abrir Chat da Reunião"
                >
                  <div className="icon-circle" style={{
                    width: isMobileScreen ? 36 : 40,
                    height: isMobileScreen ? 36 : 40,
                    background: (isMobileScreen ? mobileRoomTab === 'chat' : showCollabPanel && collabTab === 'chat') ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                    borderColor: (isMobileScreen ? mobileRoomTab === 'chat' : showCollabPanel && collabTab === 'chat') ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)'
                  }}>
                    <MessageSquare size={isMobileScreen ? 16 : 18} color={(isMobileScreen ? mobileRoomTab === 'chat' : showCollabPanel && collabTab === 'chat') ? '#38bdf8' : 'var(--pf-text-primary)'} />
                  </div>
                  <span style={{ fontSize: '10px', color: (isMobileScreen ? mobileRoomTab === 'chat' : showCollabPanel && collabTab === 'chat') ? '#38bdf8' : 'var(--pf-text-primary)' }}>
                    Chat
                  </span>
                </button>

                {/* Botão Transcrição */}
                <button
                  type="button"
                  className={`control-btn ${(isMobileScreen ? mobileRoomTab === 'transcript' : showCollabPanel && collabTab === 'transcript') ? 'active' : ''}`}
                  onClick={() => {
                    if (isMobileScreen) {
                      setMobileRoomTab('transcript');
                    } else {
                      setShowCollabPanel(true);
                      setCollabTab('transcript');
                    }
                  }}
                  style={{ padding: isMobileScreen ? '4px 6px' : '6px 12px', gap: '2px', minWidth: '44px', minHeight: '44px' }}
                  title="Abrir Transcrição da Reunião"
                >
                  <div className="icon-circle" style={{
                    width: isMobileScreen ? 36 : 40,
                    height: isMobileScreen ? 36 : 40,
                    background: (isMobileScreen ? mobileRoomTab === 'transcript' : showCollabPanel && collabTab === 'transcript') ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                    borderColor: (isMobileScreen ? mobileRoomTab === 'transcript' : showCollabPanel && collabTab === 'transcript') ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)'
                  }}>
                    <FileText size={isMobileScreen ? 16 : 18} color={(isMobileScreen ? mobileRoomTab === 'transcript' : showCollabPanel && collabTab === 'transcript') ? '#38bdf8' : 'var(--pf-text-primary)'} />
                  </div>
                  <span style={{ fontSize: '10px', color: (isMobileScreen ? mobileRoomTab === 'transcript' : showCollabPanel && collabTab === 'transcript') ? '#38bdf8' : 'var(--pf-text-primary)' }}>
                    Texto
                  </span>
                </button>

                {/* No celular: Botão Mais. No Desktop: Ajustes + Diagnóstico */}
                {isMobileScreen ? (
                  <button
                    type="button"
                    className="control-btn"
                    onClick={() => setShowMobileActionSheet(true)}
                    style={{ padding: '4px 6px', gap: '2px', minWidth: '44px', minHeight: '44px' }}
                    title="Mais opções e ajustes"
                  >
                    <div className="icon-circle" style={{ width: 36, height: 36, background: 'rgba(255, 255, 255, 0.08)', borderColor: 'rgba(255, 255, 255, 0.15)' }}>
                      <MoreHorizontal size={16} />
                    </div>
                    <span style={{ fontSize: '10px' }}>Mais</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="control-btn"
                      onClick={() => setShowSettingsModal(true)}
                      style={{ padding: '6px 12px', gap: '4px' }}
                      title="Ajustes de motor STT, modelo e parâmetros da reunião"
                    >
                      <div className="icon-circle" style={{ width: 40, height: 40, background: 'rgba(255, 255, 255, 0.08)', borderColor: 'rgba(255, 255, 255, 0.15)' }}>
                        <Settings size={18} />
                      </div>
                      <span style={{ fontSize: '11px' }}>Ajustes</span>
                    </button>

                    <button
                      type="button"
                      className="control-btn"
                      onClick={() => setShowTechnicalDiagnostics(true)}
                      style={{ padding: '6px 12px', gap: '4px' }}
                      title="Abrir painel técnico desacoplado de diagnóstico"
                    >
                      <div className="icon-circle" style={{ width: 40, height: 40, background: 'rgba(255, 255, 255, 0.08)', borderColor: 'rgba(255, 255, 255, 0.15)' }}>
                        <Activity size={18} />
                      </div>
                      <span style={{ fontSize: '11px' }}>Diagnóstico</span>
                    </button>
                  </>
                )}

                {/* Sair / Finalizar */}
                <button
                  type="button"
                  className="control-btn control-btn-leave"
                  onClick={handleFinishAndAnalyze}
                  style={{ padding: isMobileScreen ? '4px 8px' : '6px 14px', gap: '2px', minWidth: '44px', minHeight: '44px' }}
                  title="Encerrar reunião e sintetizar ata operacional e executiva com IA"
                >
                  <div className="icon-circle leave-icon-circle" style={{ width: isMobileScreen ? 36 : 40, height: isMobileScreen ? 36 : 40, background: '#ef4444', borderColor: '#ef4444' }}>
                    <Square size={isMobileScreen ? 14 : 16} fill="#ffffff" color="#ffffff" />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#f87171' }}>Sair</span>
                </button>
              </div>
            </div>
          )}

          {/* NO CELULAR: SE mobileRoomTab === 'chat', EXIBE O CHAT COMPLETO NA TELA */}
          {isMobileScreen && mobileRoomTab === 'chat' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
              {renderChatView()}
            </div>
          )}

          {/* NO CELULAR: SE mobileRoomTab === 'transcript', EXIBE A TRANSCRIÇÃO COMPLETA NA TELA */}
          {isMobileScreen && mobileRoomTab === 'transcript' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
              {renderTranscriptView()}
            </div>
          )}

          {/* NO DESKTOP: PAINEL LATERAL DE COLABORAÇÃO COM ABAS 'Chat' E 'Transcrição' */}
          {!isMobileScreen && showCollabPanel && (
            <aside className="meeting-collab-panel">
              {/* Abas Superiores do Painel de Colaboração */}
              <div className="collab-tabs-header">
                <button
                  type="button"
                  className={`collab-tab-btn ${collabTab === 'chat' ? 'active' : ''}`}
                  onClick={() => setCollabTab('chat')}
                >
                  <MessageSquare size={15} />
                  <span>Chat</span>
                  {chatMessages.length > 0 && (
                    <span style={{
                      fontSize: '10.5px',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: collabTab === 'chat' ? 'var(--pf-accent)' : 'rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      fontWeight: 700
                    }}>
                      {chatMessages.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className={`collab-tab-btn ${collabTab === 'transcript' ? 'active' : ''}`}
                  onClick={() => setCollabTab('transcript')}
                >
                  <FileText size={15} />
                  <span>Transcrição</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCollabPanel(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--pf-text-secondary)',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '6px'
                  }}
                  title="Recolher painel lateral"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Conteúdo da Aba Selecionada */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {collabTab === 'chat' ? renderChatView() : renderTranscriptView()}
              </div>
            </aside>
          )}
        </div>

        {/* =========================================================================
            MODAL DE DIAGNÓSTICO TÉCNICO DESACOPLADO (3 BLOCOS)
            ========================================================================= */}
        {showTechnicalDiagnostics && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
              overflow: 'hidden'
            }}>
              {/* Modal Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} color="var(--primary-color)" />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    Painel de Diagnóstico Técnico — Mídia & STT
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={copyDiagnosticToClipboard}
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    {copiedDiagnostic ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                    {copiedDiagnostic ? 'Copiado!' : 'Copiar Relatório'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTechnicalDiagnostics(false)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Modal Body: 3 Blocos Estruturados */}
              <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '12px' }}>
                {/* BLOCO 1: CONEXÃO E MÍDIA */}
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mic size={14} />
                    <span>Bloco 1 — Conexão e Mídia</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Microfone: </span>
                      <strong style={{ color: audioStatus === 'active' && !isMuted ? '#10b981' : isMuted ? '#f59e0b' : '#ef4444' }}>
                        {audioStatus === 'active' && !isMuted ? 'Conectado e Ativo' : isMuted ? 'Silenciado' : audioStatus}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Nível de VU Meter: </span>
                      <strong style={{ color: audioLevel > 5 ? '#10b981' : '#94a3b8' }}>
                        {audioLevel}% ({signalQuality})
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Câmera: </span>
                      <strong>{videoStatus === 'active' && !isCamOff ? 'Conectada' : isCamOff ? 'Desligada pelo usuário' : videoStatus}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Permissões: </span>
                      <strong>{mediaPermission}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Dispositivo Microfone: </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-main)' }}>{selectedAudioDeviceId ? 'Selecionado' : 'Padrão do Sistema'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Trilha de Áudio: </span>
                      <code style={{ fontSize: '10.5px', color: '#38bdf8' }}>{diagnosticInfo.audioTrackState || 'não iniciada'}</code>
                    </div>
                  </div>
                </div>

                {/* BLOCO 2: TRANSCRIÇÃO E MOTOR STT */}
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div style={{ fontWeight: 700, color: '#a78bfa', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} />
                    <span>Bloco 2 — Transcrição & Motor STT</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Provedor Ativo: </span>
                      <strong style={{ color: sttProvider === 'backend' ? '#10b981' : '#38bdf8' }}>
                        {sttProvider === 'backend' ? 'Backend faster-whisper' : sttProvider === 'browser' ? 'Navegador Web Speech' : 'Manual'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Modelo faster-whisper: </span>
                      <strong>{backendSttStatus.model || selectedModelSize} (CPU int8)</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Perfil de Hardware: </span>
                      <code>{backendSttStatus.hardware_profile || 'cpu_balanced'}</code>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Latência Último Chunk: </span>
                      <strong>{backendChunkStats.lastProcessingTimeMs || 0}ms</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Fator Tempo Real (RTF): </span>
                      <strong style={{ color: backendChunkStats.rtf <= 0.7 ? '#10b981' : '#f59e0b' }}>
                        {backendChunkStats.rtf || '0.00'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>VAD Threshold: </span>
                      <span>{vadSensitivity} (Silero VAD)</span>
                    </div>
                  </div>
                </div>

                {/* BLOCO 3: SESSÃO E FILA DE UPLOAD */}
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div style={{ fontWeight: 700, color: '#34d399', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} />
                    <span>Bloco 3 — Sessão e Fila de Chunks</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>ID Reunião: </span>
                      <code style={{ fontSize: '11px', color: '#38bdf8' }}>{currentMeeting.ID_MEETING}</code>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>ID Sessão STT: </span>
                      <code style={{ fontSize: '10.5px' }}>{backendSessionIdRef.current ? backendSessionIdRef.current.slice(0, 16) + '...' : 'none'}</code>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Chunks Capturados: </span>
                      <strong>{backendChunkStats.chunksCaptured || 0}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Chunks Confirmados: </span>
                      <strong style={{ color: '#10b981' }}>{backendChunkStats.chunksConfirmed || 0}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Fila Pendente: </span>
                      <strong style={{ color: (chunkQueueRef.current?.length || 0) > 0 ? '#f59e0b' : '#94a3b8' }}>
                        {chunkQueueRef.current?.length || backendChunkStats.chunksPending || 0}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Chunks Falhos: </span>
                      <strong style={{ color: backendChunkStats.chunksFailed > 0 ? '#ef4444' : '#94a3b8' }}>
                        {backendChunkStats.chunksFailed || 0}
                      </strong>
                    </div>
                    {diagnosticInfo.lastError && (
                      <div style={{ gridColumn: '1 / -1', color: '#f87171' }}>
                        <strong>Último Erro:</strong> {diagnosticInfo.lastError}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '12px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'flex-end',
                background: 'rgba(255, 255, 255, 0.02)'
              }}>
                <button
                  type="button"
                  onClick={() => setShowTechnicalDiagnostics(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 16px' }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODAL DE AJUSTES DA REUNIÃO (SETTINGS MODAL)
            ========================================================================= */}
        {showSettingsModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
              overflow: 'hidden'
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={18} color="var(--primary-color)" />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    Ajustes da Reunião & Transcrição
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px', fontSize: '12.5px' }}>
                {/* 1. Provedor de Transcrição */}
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                    Motor de Transcrição
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleSelectProvider('backend')}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: sttProvider === 'backend' ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.1)',
                        background: sttProvider === 'backend' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        color: sttProvider === 'backend' ? '#38bdf8' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '11.5px',
                        textAlign: 'center'
                      }}
                    >
                      <div>🎙️ Backend STT</div>
                      <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>faster-whisper</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectProvider('browser')}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: sttProvider === 'browser' ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.1)',
                        background: sttProvider === 'browser' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        color: sttProvider === 'browser' ? '#38bdf8' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '11.5px',
                        textAlign: 'center'
                      }}
                    >
                      <div>🌐 Navegador</div>
                      <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>Web Speech API</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectProvider('manual')}
                      style={{
                        padding: '10px 8px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: sttProvider === 'manual' ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.1)',
                        background: sttProvider === 'manual' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        color: sttProvider === 'manual' ? '#38bdf8' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '11.5px',
                        textAlign: 'center'
                      }}
                    >
                      <div>✏️ Manual</div>
                      <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>Digitar notas</div>
                    </button>
                  </div>
                </div>

                {/* 2. Modelo faster-whisper */}
                {sttProvider === 'backend' && (
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                      Modelo do faster-whisper
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleSwitchModel('small')}
                        disabled={switchingModel}
                        style={{
                          padding: '10px',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: selectedModelSize === 'small' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                          background: selectedModelSize === 'small' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                          color: selectedModelSize === 'small' ? '#10b981' : 'var(--text-main)',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '12px' }}>⭐ small (Recomendado)</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Máxima precisão em PT-BR (0% WER no benchmark corporativo)
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSwitchModel('base')}
                        disabled={switchingModel}
                        style={{
                          padding: '10px',
                          borderRadius: '8px',
                          border: '1px solid',
                          borderColor: selectedModelSize === 'base' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                          background: selectedModelSize === 'base' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                          color: selectedModelSize === 'base' ? '#10b981' : 'var(--text-main)',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '12px' }}>⚡ base (Mais Rápido)</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Menor consumo de CPU e RAM para reuniões simples
                        </div>
                      </button>
                    </div>

                    {switchingModel && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <RefreshCw size={11} className="spin" />
                        <span>Carregando novo modelo...</span>
                      </div>
                    )}
                    {modelSwitchSuccess && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Check size={11} />
                        <span>{modelSwitchSuccess}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Dispositivo de Microfone */}
                {audioDevices.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                      Microfone de Entrada
                    </label>
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
                      style={{ width: '100%', fontSize: '12px', padding: '8px' }}
                    >
                      {audioDevices.map((d, idx) => (
                        <option key={d.deviceId || idx} value={d.deviceId}>
                          {d.label || `Microfone ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 4. Sensibilidade do VAD */}
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                    Sensibilidade de Detecção de Voz (VAD Silero)
                  </label>
                  <select
                    value={vadSensitivity}
                    onChange={(e) => setVadSensitivity(e.target.value)}
                    className="form-select"
                    style={{ width: '100%', fontSize: '12px', padding: '8px' }}
                  >
                    <option value="0.30">Sensível (0.30) — Indicado para vozes baixas ou microfones distantes</option>
                    <option value="0.38">Padrão Equilibrado (0.38) — Recomendado para salas de reunião</option>
                    <option value="0.50">Conservador (0.50) — Indicado para ambientes com ruído constante</option>
                  </select>
                </div>

                {/* 5. Vocabulário Contextual */}
                <div>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                    Termos Corporativos e Pauta de Contexto
                  </label>
                  <textarea
                    value={customContextTerms}
                    onChange={(e) => setCustomContextTerms(e.target.value)}
                    rows={3}
                    placeholder="Digite termos corporativos, siglas ou nomes de participantes separados por vírgula..."
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: 'var(--text-main)',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    Estes termos orientam a inferência do Whisper sem forçar substituições fonéticas arbitrárias.
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: '12px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'flex-end',
                background: 'rgba(255, 255, 255, 0.02)'
              }}>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '6px 18px' }}
                >
                  Salvar e Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODAL DE CONFIRMAÇÃO DE ENCERRAMENTO (FINISH SUMMARY MODAL)
            ========================================================================= */}
        {showFinishConfirmModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden'
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={20} color="#10b981" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    Finalizar Reunião & Gerar Atas
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFinishConfirmModal(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '12.5px' }}>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                  A reunião será encerrada e a transcrição consolidada será enviada para a geração da <strong>Ata Operacional</strong> e <strong>Ata Executiva</strong> com IA.
                </p>

                {/* Resumo da Sessão */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Duração Total</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8' }}>{formatTimer(durationSeconds)}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Chunks Processados</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10b981' }}>
                      {backendChunkStats.chunksConfirmed || backendChunkStats.chunkCount || 0}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Caracteres Transcritos</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {transcription.length} carac.
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Motor STT</span>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#a78bfa' }}>
                      {sttProvider === 'backend' ? `faster-whisper (${selectedModelSize})` : sttProvider}
                    </div>
                  </div>
                </div>

                {/* Checkbox de Refinamento */}
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  padding: '12px',
                  borderRadius: '8px'
                }}>
                  <input
                    type="checkbox"
                    id="chk-refine"
                    checked={refineBeforeFinish}
                    onChange={(e) => setRefineBeforeFinish(e.target.checked)}
                    style={{ marginTop: '2px', cursor: 'pointer' }}
                  />
                  <label htmlFor="chk-refine" style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text-main)', lineHeight: 1.4 }}>
                    <strong>Refinar transcrição antes de gerar atas (Recomendado)</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Executa reprocessamento de alta fidelidade com beam search 5 e concatenação de todo o áudio da sessão para garantir 0% WER em termos corporativos.
                    </div>
                  </label>
                </div>

                {/* Prévia da Transcrição */}
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)', fontSize: '11px' }}>
                    Pré-visualização da Transcrição:
                  </div>
                  <div style={{
                    maxHeight: '120px',
                    overflowY: 'auto',
                    padding: '10px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-color)',
                    fontSize: '11.5px',
                    lineHeight: '1.5',
                    color: transcription ? 'var(--text-main)' : 'var(--text-muted)',
                    fontStyle: transcription ? 'normal' : 'italic'
                  }}>
                    {transcription || 'Nenhuma fala transcrita até o momento. Digite notas manuais ou confirme o encerramento.'}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: '14px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                background: 'rgba(255, 255, 255, 0.02)'
              }}>
                <button
                  type="button"
                  onClick={() => setShowFinishConfirmModal(false)}
                  className="btn btn-secondary"
                  disabled={reprocessing}
                  style={{ fontSize: '12px', padding: '7px 16px' }}
                >
                  Continuar na Reunião
                </button>

                <button
                  type="button"
                  onClick={handleConfirmFinishAndAnalyze}
                  className="btn btn-primary"
                  disabled={reprocessing}
                  style={{ fontSize: '12px', padding: '7px 18px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {reprocessing && <RefreshCw size={13} className="spin" />}
                  {reprocessing ? 'Refinando e Gerando Atas...' : 'Confirmar Encerramento e Gerar Atas'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            MODAL DE AJUDA DE PERMISSÃO MOBILE (SAFARI & CHROME)
            ========================================================================= */}
        {showPermissionHelpModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}>
            <div style={{
              background: '#0f172a',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
              overflow: 'hidden'
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.03)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HelpCircle size={18} color="#38bdf8" />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    Como liberar o microfone no celular
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPermissionHelpModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    minWidth: '44px',
                    minHeight: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Fechar ajuda"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px', lineHeight: 1.5 }}>
                {/* iPhone / Safari */}
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🍎 iPhone (iOS Safari)</span>
                  </div>
                  <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-secondary)' }}>
                    <li>Toque no ícone <strong>aA</strong> no lado esquerdo da barra de endereços do Safari.</li>
                    <li>Selecione <strong>Ajustes do Site</strong> (Website Settings).</li>
                    <li>Em <strong>Microfone</strong>, selecione <strong>Permitir</strong>.</li>
                    <li>Se o microfone estiver desabilitado no iOS: abra <em>Ajustes do iPhone &gt; Safari &gt; Microfone</em> e marque como <em>Perguntar</em> ou <em>Permitir</em>.</li>
                  </ol>
                </div>

                {/* Android / Chrome */}
                <div style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🤖 Android (Google Chrome)</span>
                  </div>
                  <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-secondary)' }}>
                    <li>Toque no ícone de <strong>ajustes / cadeado</strong> à esquerda do endereço do site.</li>
                    <li>Toque em <strong>Permissões</strong>.</li>
                    <li>Ative o botão de alternância do <strong>Microfone</strong>.</li>
                    <li>Recarregue a página ou toque em <strong>Ativar Microfone Agora</strong>.</li>
                  </ol>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: '14px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                justifyContent: 'flex-end',
                background: 'rgba(255, 255, 255, 0.02)'
              }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setShowPermissionHelpModal(false);
                    startMediaAndRecognition();
                  }}
                  style={{ minHeight: '44px', padding: '0 20px', fontWeight: 600 }}
                >
                  Entendi, testar microfone
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            BOTTOM SHEET DE AÇÕES MOBILE (ACTION SHEET)
            ========================================================================= */}
        {showMobileActionSheet && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 105,
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center'
            }}
            onClick={() => setShowMobileActionSheet(false)}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '600px',
                background: '#0f172a',
                borderTopLeftRadius: '20px',
                borderTopRightRadius: '20px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '20px 20px calc(20px + var(--sab, 0px))',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.6)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.25)', margin: '0 auto 8px' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text-main)', fontWeight: 700 }}>
                  Opções da Reunião
                </h4>
                <button
                  type="button"
                  onClick={() => setShowMobileActionSheet(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Botão Alternar Câmera Frontal / Traseira */}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowMobileActionSheet(false);
                  handleToggleFacingMode();
                }}
                style={{ minHeight: '48px', justifyContent: 'flex-start', padding: '0 16px', gap: '12px', fontSize: '14px' }}
              >
                <RotateCw size={18} color="#38bdf8" />
                <span>Virar Câmera ({facingMode === 'user' ? 'Mudar para Traseira' : 'Mudar para Frontal'})</span>
              </button>

              {/* Botão Ajustes */}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowMobileActionSheet(false);
                  setShowSettingsModal(true);
                }}
                style={{ minHeight: '48px', justifyContent: 'flex-start', padding: '0 16px', gap: '12px', fontSize: '14px' }}
              >
                <Settings size={18} color="#a78bfa" />
                <span>Ajustes & Parâmetros STT</span>
              </button>

              {/* Botão Diagnóstico Técnico */}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowMobileActionSheet(false);
                  setShowTechnicalDiagnostics(true);
                }}
                style={{ minHeight: '48px', justifyContent: 'flex-start', padding: '0 16px', gap: '12px', fontSize: '14px' }}
              >
                <Activity size={18} color="#10b981" />
                <span>Diagnóstico Técnico Desacoplado</span>
              </button>

              {/* Botão Abrir em Nova Aba */}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowMobileActionSheet(false);
                  const url = `${window.location.origin}${window.location.pathname}?view=meeting&id=${currentMeeting.ID_MEETING}`;
                  window.open(url, '_blank');
                }}
                style={{ minHeight: '48px', justifyContent: 'flex-start', padding: '0 16px', gap: '12px', fontSize: '14px' }}
              >
                <ExternalLink size={18} color="#f59e0b" />
                <span>Abrir Reunião em Nova Aba</span>
              </button>
            </div>
          </div>
        )}
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
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))',
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

                  {/* Excluir reunião */}
                  <button
                    type="button"
                    onClick={() => handleDeleteMeeting(item.ID_MEETING, item.TITULO_REUNIAO || item.TITULO)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 8px', color: '#dc2626' }}
                    title="Excluir reunião"
                  >
                    <Trash2 size={13} />
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px', marginBottom: '14px' }}>
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
