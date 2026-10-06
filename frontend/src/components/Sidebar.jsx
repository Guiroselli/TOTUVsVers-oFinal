import {
  FileText,
  Radio,
  Layers,
  Sun,
  Moon,
  Building2,
  ChevronLeft,
  ChevronRight,
  Settings,
  X
} from 'lucide-react';

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
      <div className="logo-area">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: '10px',
          width: '100%'
        }}>
          <div
            onClick={isCollapsed ? onToggleCollapse : undefined}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #0284c7 0%, #004b87 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '14px',
              boxShadow: '0 3px 10px rgba(2, 132, 199, 0.3)',
              flexShrink: 0,
              cursor: isCollapsed ? 'pointer' : 'default'
            }}
            title={isCollapsed ? 'Clique para expandir o menu lateral' : 'Proton Flow - TOTVS Ready'}
          >
            PF
          </div>
          {!isCollapsed && (
            <div className="logo-text-wrapper" style={{ overflow: 'hidden' }}>
              <h1 className="logo-title" style={{ margin: 0, fontSize: '1.05rem', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                Proton Flow
              </h1>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary-color)', fontWeight: 700, whiteSpace: 'nowrap', display: 'block' }}>
                TOTVS Ready
              </span>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <span className="logo-subtitle">Inteligência Gerencial Corporativa</span>
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
            title="Histórico de Reuniões e Atas Corporativas"
          >
            <FileText size={18} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span className="nav-btn-text">Histórico de Reuniões</span>}
          </button>

          <button
            className={`nav-btn ${currentView === 'meeting' ? 'active' : ''}`}
            onClick={() => handleNavClick('meeting')}
            title="Reunião Ao Vivo com Transcrição Inteligente"
          >
            <Radio size={18} style={{ flexShrink: 0 }} />
            {!isCollapsed && (
              <>
                <span className="nav-btn-text">Reunião Ao Vivo</span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '9px',
                  padding: '1px 6px',
                  borderRadius: '4px',
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
          title="Ollama IA Ativo • Llama 3 • Conexão Local Estável"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: '7px', fontWeight: 600 }}>
            <span className="status-pulse-dot" />
            {!isCollapsed && <span>Ollama IA Ativo</span>}
          </div>
          {!isCollapsed && (
            <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', marginTop: '2px' }}>
              Llama 3 • Conexão Local Estável
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
