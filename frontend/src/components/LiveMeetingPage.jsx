import React, { useState, useRef, useEffect, useCallback } from 'react';

export default function LiveMeetingPage({ onLeaveMeeting }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    // Auto scroll transcription
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcription]);

  const startMediaAndRecognition = useCallback(async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'pt-BR';

        let finalTranscript = '';

        recognitionRef.current.onresult = (event) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          setTranscription(finalTranscript + interimTranscript);
        };

        recognitionRef.current.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
        };

        recognitionRef.current.onend = () => {
          if (isRecording && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.warn('SpeechRecognition restart error:', e);
            }
          }
        };

        recognitionRef.current.start();
        setIsRecording(true);
      } else {
        setError('Seu navegador não suporta reconhecimento de voz nativo Web Speech API.');
      }
    } catch (err) {
      console.error('Erro de permissão de mídia:', err);
      setError('Permissão de câmera ou microfone negada pelo navegador.');
    }
  }, [isRecording]);

  useEffect(() => {
    startMediaAndRecognition();

    return () => {
      stopMediaAndRecognition();
    };
  }, [startMediaAndRecognition]);

  const stopMediaAndRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn('Stop recognition error:', e);
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  };

  const toggleMute = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const willMute = !isMuted;
        audioTrack.enabled = !willMute;
        setIsMuted(willMute);
      }
    }
  };

  const toggleCamera = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        const willTurnOff = !isCamOff;
        videoTrack.enabled = !willTurnOff;
        setIsCamOff(willTurnOff);
      }
    }
  };

  const handleLeave = async () => {
    stopMediaAndRecognition();
    if (onLeaveMeeting) {
      await onLeaveMeeting(transcription);
    }
  };

  return (
    <div className="meeting-layout">
      {/* Main Video Area */}
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
                alignItems: 'center',
                justifyContent: 'center',
                background: '#111',
                borderRadius: '12px'
              }}
            >
              <div style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: 'var(--panel-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
                color: 'var(--text-muted)'
              }}>
                U
              </div>
            </div>
          )}

          <div className="video-overlay-name">
            Você (Apresentador TOTVS) {isMuted ? '🔇 Mutado' : ''}
          </div>
        </div>

        {/* Control Bar */}
        <div className="control-bar">
          <button
            id="mute-btn"
            className={`control-btn ${isMuted ? 'active' : ''}`}
            onClick={toggleMute}
          >
            <div className="icon-circle" style={{ background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'transparent' }}>
              <span id="mute-text">
                {isMuted ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                )}
              </span>
            </div>
            <span>{isMuted ? 'Desmutar' : 'Mutar'}</span>
          </button>

          <button
            id="cam-btn"
            className={`control-btn ${isCamOff ? 'active' : ''}`}
            onClick={toggleCamera}
          >
            <div className="icon-circle" style={{ background: isCamOff ? 'rgba(239, 68, 68, 0.2)' : 'transparent' }}>
              <span id="cam-text">
                {isCamOff ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="23 7 16 12 23 17 23 7"></polygon>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                  </svg>
                )}
              </span>
            </div>
            <span>{isCamOff ? 'Ligar Câmera' : 'Parar Câmera'}</span>
          </button>

          <button className="control-btn danger" onClick={handleLeave}>
            <div className="icon-circle" style={{ background: 'var(--danger)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                <line x1="23" y1="1" x2="1" y2="23"></line>
              </svg>
            </div>
            Sair e Gerar Resumo IA
          </button>
        </div>
      </div>

      {/* AI Sidebar */}
      <div className="ai-sidebar">
        <div className="sidebar-header">
          <h2>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2">
              <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
              <path d="M12 12 2.1 7.1"></path>
              <path d="M12 12l9.9 4.9"></path>
            </svg>
            Proton Flow AI
          </h2>
          {isRecording && (
            <span
              className="badge"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(239, 68, 68, 0.2)',
                color: 'var(--danger)',
                borderColor: 'var(--danger)'
              }}
            >
              <span className="typing-indicator" style={{ background: 'var(--danger)', margin: 0, marginRight: 4 }}></span>
              Escutando
            </span>
          )}
        </div>

        <div className="sidebar-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {error && (
            <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', borderRadius: '6px', fontSize: '12px', marginBottom: '10px' }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Transcrição em Tempo Real</h3>
            <div className="transcription-live" ref={scrollRef} style={{ flex: 1, maxHeight: 'none', height: 'auto' }}>
              {transcription || 'Aguardando áudio da reunião... Fale algo para iniciar a transcrição.'}
              {isRecording && <span className="typing-indicator"></span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
