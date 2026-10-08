import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Radio,
  Plus,
  Search,
  Filter,
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
  ChevronRight,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  Trash2,
  Sparkles,
  Info,
  Layers,
  Volume2
} from 'lucide-react';
import { api } from '../api/client';

export default function LiveMeetingPage({
  onLeaveMeeting,
  onOpenDocumentViewer,
  onAnalyzeMeeting,
  onNavigateToDashboard,
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

  // Refs de mídia e timers
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const durationTimerRef = useRef(null);

  // 1. Carrega lista de dispositivos de áudio disponíveis
  const loadAudioDevices = useCallback(async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === 'audioinput');
        setAudioDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedAudioDeviceId) {
          setSelectedAudioDeviceId(audioInputs[0].deviceId || 'default');
        }
      }
    } catch (e) {
      console.warn('Erro ao listar dispositivos de áudio:', e);
    }
  }, [selectedAudioDeviceId]);

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

  // Efeito inicial
  useEffect(() => {
    loadLiveMeetings();
    loadAudioDevices();

    // Se tiver initialMeetingId pela URL, seleciona
    const urlParams = new URLSearchParams(window.location.search);
    const pId = urlParams.get('id') || urlParams.get('meeting_id') || initialMeetingId;
    if (pId) {
      setActiveMeetingId(pId);
    }
  }, [loadLiveMeetings, loadAudioDevices, initialMeetingId]);

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

  // Atualiza transcrição local quando carrega a reunião selecionada
  useEffect(() => {
    if (currentMeeting) {
      setTranscription(currentMeeting.ANON_TRANSCRICAO || '');
      // Se a reunião estiver ao vivo, inicia o contador
      if (currentMeeting.STATUS_MEETING === 'ao_vivo') {
        setIsRecording(true);
      } else {
        setIsRecording(false);
      }
    } else {
      setTranscription('');
      setIsRecording(false);
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

  // Salvamento automático da transcrição no backend (a cada 4s se houver alterações)
  const saveTranscriptToBackend = useCallback(
    async (text) => {
      if (!activeMeetingId || !text) return;
      try {
        await api.updateLiveTranscript(activeMeetingId, text, false);
      } catch (e) {
        console.warn('Erro ao salvar transcrição incremental no backend:', e);
      }
    },
    [activeMeetingId]
  );

  // Iniciar reconhecimento de voz e mídia na sala ativa
  const startMediaAndRecognition = useCallback(async () => {
    if (!activeMeetingId) return;
    try {
      setError('');
      const audioConstraints = selectedAudioDeviceId
        ? { deviceId: { exact: selectedAudioDeviceId } }
        : true;

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: audioConstraints });
      } catch (camErr) {
        // Se a câmera falhar ou não estiver disponível, tenta apenas áudio
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        setIsCamOff(true);
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {}
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'pt-BR';

        let accumulated = transcription || '';

        recognition.onresult = (event) => {
          let interim = '';
          let finalPiece = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalPiece += event.results[i][0].transcript + ' ';
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          if (finalPiece) {
            accumulated += finalPiece;
          }
          const fullText = accumulated + interim;
          setTranscription(fullText);

          // Dispara salvamento com debounce
          if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = setTimeout(() => {
            saveTranscriptToBackend(fullText);
          }, 3000);
        };

        recognition.onerror = (event) => {
          console.warn('SpeechRecognition erro:', event.error);
          if (event.error === 'not-allowed') {
            setError('Permissão de microfone negada pelo navegador.');
          }
        };

        recognition.onend = () => {
          if (isRecording && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {}
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
      } else {
        setError('Navegador não possui suporte ao Web Speech API nativo. Conecte microfone com Whisper.');
      }
    } catch (err) {
      console.error('Erro de permissão de mídia:', err);
      setError('Permissão de microfone ou câmera negada.');
    }
  }, [activeMeetingId, transcription, selectedAudioDeviceId, isRecording, saveTranscriptToBackend]);

  // Parar mídia e reconhecimento
  const stopMediaAndRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // Limpeza ao trocar de reunião ou desmontar
  useEffect(() => {
    return () => {
      stopMediaAndRecognition();
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [activeMeetingId, stopMediaAndRecognition]);

  // Controles de áudio e vídeo
  const toggleMute = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleCamera = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isCamOff;
        setIsCamOff(!isCamOff);
      }
    }
  };

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

        {/* Layout da Sala de Reunião (Palco de Vídeo + Transcrição Lateral) */}
        <div className="meeting-layout" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
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
                style={{ display: isCamOff ? 'none' : 'block' }}
              ></video>

              {isCamOff && (
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
                    gap: '12px'
                  }}
                >
                  <div style={{
                    width: 90,
                    height: 90,
                    borderRadius: '50%',
                    background: 'var(--panel-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '2rem',
                    fontWeight: 700,
                    color: 'var(--primary-color)',
                    border: '2px solid var(--border-color)'
                  }}>
                    {(currentMeeting.DEPARTAMENTO || 'TOTVS').substring(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Câmera desligada • Transcrição ativa
                  </span>
                </div>
              )}

              <div className="video-overlay-name" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span>Você ({currentMeeting.DEPARTAMENTO})</span>
                {isMuted && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 4px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                    <MicOff size={11} color="#f87171" />
                  </span>
                )}
                {isRecording && (
                  <span style={{ fontSize: '11px', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8' }}>
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
              {isRecording && (
                <span
                  className="badge"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: 'var(--danger)',
                    borderColor: 'var(--danger)',
                    fontSize: '11px'
                  }}
                >
                  <span className="typing-indicator" style={{ background: 'var(--danger)', margin: 0, marginRight: 4 }}></span>
                  Gravando {currentMeeting.DEPARTAMENTO}
                </span>
              )}
            </div>

            <div className="sidebar-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {error && (
                <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', borderRadius: '6px', fontSize: '12px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    Transcrição em Tempo Real ({transcription.length} caracteres)
                  </h3>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    Auto-salvo por ID
                  </span>
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
                  {transcription || (
                    <span style={{ color: 'var(--text-muted)' }}>
                      Aguardando áudio da reunião {currentMeeting.TITULO_REUNIAO}... Fale algo para iniciar a transcrição.
                    </span>
                  )}
                  {isRecording && <span className="typing-indicator"></span>}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(2, 132, 199, 0.2) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444'
            }}>
              <Radio size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                Central de Reuniões Ao Vivo
              </h1>
              <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted)' }}>
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}
            title="Atualizar lista de reuniões"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Atualizar
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}
          >
            <Plus size={16} />
            Nova Reunião Ao Vivo
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
