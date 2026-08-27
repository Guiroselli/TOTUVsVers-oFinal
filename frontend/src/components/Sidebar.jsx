import React from 'react';

export default function Sidebar({ currentView, onSelectView, onOpenConfig }) {
  return (
    <aside className="dashboard-sidebar">
      <div className="logo-area">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, var(--primary-color), #0ea5e9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0f172a',
            fontWeight: 'bold',
            fontSize: '14px'
          }}>
            PF
          </div>
          <h1 className="logo-title" style={{ margin: 0 }}>Proton Flow</h1>
        </div>
        <span className="logo-subtitle">Inteligência Gerencial TOTVS</span>
      </div>

      <nav className="dashboard-nav">
        <button
          className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onSelectView('dashboard')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          Histórico de Reuniões
        </button>

        <button
          className={`nav-btn ${currentView === 'analytics' ? 'active' : ''}`}
          onClick={() => onSelectView('analytics')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10"></line>
            <line x1="12" y1="20" x2="12" y2="4"></line>
            <line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
          Visão Trimestral (Analytics)
        </button>

        <button
          className={`nav-btn ${currentView === 'meeting' ? 'active' : ''}`}
          onClick={() => onSelectView('meeting')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
          Reunião Ao Vivo
        </button>

        <button
          className="nav-btn"
          onClick={onOpenConfig}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          Ecossistema TOTVS
        </button>
      </nav>

      <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></span>
          <span>Ollama Llama 3 Conectado</span>
        </div>
        <div>v2.0 • IA Executiva</div>
      </div>
    </aside>
  );
}
