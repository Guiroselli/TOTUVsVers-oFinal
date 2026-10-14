import { useState, useEffect } from 'react';
import {
  FileText,
  Radio,
  Sun,
  Moon,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Settings,
  X,
  RefreshCw
} from 'lucide-react';
import { api } from '../api/client';

export default function Sidebar({
  currentView,
  onSelectView,
  onOpenConfig,
  theme = 'light',
  onToggleTheme,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile
}) {
  const [ollamaStatus, setOllamaStatus] = useState({
    connected: true,
    target_model: 'llama3',
    gpu_available: true
  });
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const res = await api.getOllamaStatus();
        if (mounted && res && typeof res.connected === 'boolean') {
          setOllamaStatus(res);
        }
      } catch (e) {
        // Ignora silenciosamente se o backend ainda estiver subindo
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleReconnectOllama = async (e) => {
    e.stopPropagation();
    if (isReconnecting) return;
    setIsReconnecting(true);
    try {
      const res = await api.startOllama();
      if (res) {
        setOllamaStatus(res);
      }
    } catch (err) {
      console.warn('Erro ao conectar ao Ollama:', err);
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleNavClick = (view) => {
    onSelectView(view);
    if (onCloseMobile) onCloseMobile();
  };

  const handleConfigClick = () => {
    if (onOpenConfig) onOpenConfig();
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside className={`dashboard-sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
      {/* Botão de Fechar Mobile */}
      {onCloseMobile && (
        <button
          onClick={onCloseMobile}
          className="mobile-sidebar-close-btn"
          title="Fechar menu lateral"
          aria-label="Fechar menu lateral"
        >
          <X size={18} />
        </button>
      )}

      {/* Botão de Recolher/Expandir Flutuante na Borda (Desktop) */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="sidebar-collapse-btn"
          title={isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          aria-label={isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      )}

      {/* Header com Logo */}
      <div className="logo-area" style={{ padding: isCollapsed ? '0.75rem 0.5rem' : '0.85rem 1rem' }}>
        <div
          onClick={isCollapsed ? onToggleCollapse : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            gap: '10px',
            width: '100%',
            cursor: isCollapsed ? 'pointer' : 'default',
            borderRadius: '8px',
            padding: isCollapsed ? '0' : '4px',
            transition: 'background-color 0.15s ease'
          }}
          title={isCollapsed ? 'Clique para expandir o menu lateral' : 'Proton Flow - TOTVS Enterprise'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Ícone Vetorial Geométrico Moderno */}
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                display: 'grid',
                placeContent: 'center',
                boxShadow: '0 3px 12px rgba(2, 132, 199, 0.35)',
                flexShrink: 0
              }}
            >
              <svg
                width="20"
                height="16"
                viewBox="0 0 50 39"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M16.4992 2H37.5808L22.0816 24.9729H1L16.4992 2Z"
                  fill="#ffffff"
                />
                <path
                  d="M17.4224 27.102L11.4192 36H33.5008L49 13.0271H32.7024L23.2064 27.102H17.4224Z"
                  fill="#ffffff"
                />
              </svg>
            </div>

            {!isCollapsed && (
              <div className="logo-text-wrapper" style={{ overflow: 'hidden' }}>
                <h1 className="logo-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                  Proton Flow
                </h1>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary-color)', fontWeight: 700, whiteSpace: 'nowrap', display: 'block' }}>
                  TOTVS Ready
                </span>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          )}
        </div>
        {!isCollapsed && (
          <span className="logo-subtitle" style={{ marginTop: '6px' }}>Inteligência Gerencial Corporativa</span>
        )}
      </div>

      {/* Navegação Principal */}
      <nav className="dashboard-nav">
        {/* SEÇÃO 1: GESTÃO ESTRATÉGICA */}
        <div className="sidebar-section">
          {!isCollapsed && <span className="sidebar-section-title">Gestão Estratégica</span>}
          {isCollapsed && <div className="sidebar-section-divider" />}

          <button
            className={`nav-btn nav-btn-enterprise ${currentView === 'analytics' ? 'active' : ''}`}
            onClick={() => handleNavClick('analytics')}
            title="Área Empresarial: Visão Executiva, Matriz de Gargalos e Indicadores"
          >
            <Building2 size={18} style={{ flexShrink: 0 }} />
            {!isCollapsed && (
              <>
                <span className="nav-btn-text" style={{ fontWeight: 600 }}>Área Empresarial</span>
                <span className="nav-pill-badge">DESTAQUE</span>
              </>
            )}
          </button>
        </div>

        {/* SEÇÃO 2: OPERAÇÃO DE REUNIÕES */}
        <div className="sidebar-section">
          {!isCollapsed && <span className="sidebar-section-title">Operação de Reuniões</span>}
          {isCollapsed && <div className="sidebar-section-divider" />}

          <button
            className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNavClick('dashboard')}
            title="Histórico de Reuniões e Atas Geradas"
          >
            <FileText size={18} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span className="nav-btn-text">Histórico de Reuniões</span>}
          </button>

          <button
            className={`nav-btn ${currentView === 'meeting' ? 'active' : ''}`}
            onClick={() => handleNavClick('meeting')}
            title="Reunião Ao Vivo: Gravação, Transcrição Whisper e Síntese em Tempo Real"
          >
            <Radio size={18} style={{ flexShrink: 0 }} />
            {!isCollapsed && (
              <>
                <span className="nav-btn-text">Reunião Ao Vivo</span>
                <span className="nav-pill-badge" style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  fontWeight: 700,
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }}>
                  LIVE
                </span>
              </>
            )}
          </button>
        </div>
      </nav>

      {/* FOOTER & STATUS */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-actions">
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className="btn-theme-toggle"
              title={theme === 'dark' ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
            >
              {theme === 'dark' ? (
                <Sun size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
              ) : (
                <Moon size={15} style={{ color: '#0284c7', flexShrink: 0 }} />
              )}
              {!isCollapsed && (
                <span className="theme-toggle-label">
                  {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                </span>
              )}
            </button>
          )}

          {onOpenConfig && (
            <button
              onClick={handleConfigClick}
              className="btn-settings-toggle"
              title="Configurações do Ecossistema TOTVS (Fluig, Protheus e RM)"
              aria-label="Configurações do Ecossistema TOTVS"
            >
              <Settings size={16} />
            </button>
          )}
        </div>

        <div
          className="sidebar-status-card"
          title={
            ollamaStatus.connected
              ? `Ollama IA Conectado • ${ollamaStatus.target_model || 'Llama 3'} • ${ollamaStatus.gpu_available ? 'GPU Acelerada (RTX)' : 'Modo CPU'}`
              : `Ollama Desconectado • Clique para tentar inicializar o serviço`
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', gap: '7px', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span
                className={`status-pulse-dot ${
                  isReconnecting ? 'loading' : !ollamaStatus.connected ? 'offline' : ''
                }`}
              />
              {!isCollapsed && (
                <span>
                  {isReconnecting
                    ? 'Conectando...'
                    : ollamaStatus.connected
                    ? 'Ollama IA Ativo'
                    : 'Ollama Desconectado'}
                </span>
              )}
            </div>

            {!isCollapsed && !ollamaStatus.connected && (
              <button
                onClick={handleReconnectOllama}
                disabled={isReconnecting}
                className="btn-reconnect-ollama"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px'
                }}
                title="Inicializar / Conectar ao Ollama"
              >
                <RefreshCw size={12} className={isReconnecting ? 'spin' : ''} />
              </button>
            )}
          </div>
          {!isCollapsed && (
            <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', marginTop: '2px' }}>
              {isReconnecting
                ? 'Iniciando processo local...'
                : ollamaStatus.connected
                ? `${(ollamaStatus.target_model || 'Llama 3').toUpperCase()} • ${
                    ollamaStatus.gpu_available ? 'GPU Acelerada' : 'Modo CPU'
                  }`
                : 'Clique no ícone para iniciar'}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
