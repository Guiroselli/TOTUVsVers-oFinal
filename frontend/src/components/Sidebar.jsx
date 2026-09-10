import React from 'react';
import { FileText, Radio, Layers, Sun, Moon, TrendingUp, Building2, ShieldCheck } from 'lucide-react';

export default function Sidebar({ currentView, onSelectView, onOpenConfig, theme = 'dark', onToggleTheme }) {
  return (
    <aside className="dashboard-sidebar">
      <div className="logo-area">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--primary-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '14px',
            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
          }}>
            PF
          </div>
          <div>
            <h1 className="logo-title" style={{ margin: 0, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>Proton Flow</h1>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--primary-color)', fontWeight: 700 }}>
              TOTVS Ready
            </span>
          </div>
        </div>
        <span className="logo-subtitle">Inteligência Gerencial Corporativa</span>
      </div>

      <nav className="dashboard-nav">
        {/* SEÇÃO 1: GESTÃO ESTRATÉGICA (Área Empresarial em Destaque) */}
        <div className="sidebar-section">
          <span className="sidebar-section-title">Gestão Estratégica</span>
          
          <button
            className={`nav-btn nav-btn-enterprise ${currentView === 'analytics' ? 'active' : ''}`}
            onClick={() => onSelectView('analytics')}
            title="Visão Executiva, Matriz de Gargalos e Indicadores de Clientes"
          >
            <Building2 size={17} style={{ flexShrink: 0, color: currentView === 'analytics' ? 'var(--primary-color)' : '#38bdf8' }} />
            <span style={{ fontWeight: 600 }}>Área Empresarial</span>
            <span className="nav-pill-badge">DESTAQUE</span>
          </button>
        </div>

        {/* SEÇÃO 2: OPERAÇÃO DE REUNIÕES */}
        <div className="sidebar-section">
          <span className="sidebar-section-title">Operação de Reuniões</span>

          <button
            className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => onSelectView('dashboard')}
            title="Histórico de Reuniões e Atas Corporativas"
          >
            <FileText size={17} style={{ flexShrink: 0, color: currentView === 'dashboard' ? 'var(--primary-color)' : 'inherit' }} />
            <span>Histórico de Reuniões</span>
          </button>

          <button
            className={`nav-btn ${currentView === 'meeting' ? 'active' : ''}`}
            onClick={() => onSelectView('meeting')}
            title="Iniciar Reunião Ao Vivo com Transcrição"
          >
            <Radio size={17} style={{ flexShrink: 0, color: currentView === 'meeting' ? 'var(--primary-color)' : 'inherit' }} />
            <span>Reunião Ao Vivo</span>
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
          </button>
        </div>

        {/* SEÇÃO 3: INTEGRAÇÕES */}
        <div className="sidebar-section">
          <span className="sidebar-section-title">Sistema & Dados</span>

          <button
            className="nav-btn"
            onClick={onOpenConfig}
            title="Configurar Integrações e Webhooks TOTVS"
          >
            <Layers size={17} style={{ flexShrink: 0 }} />
            <span>Ecossistema TOTVS</span>
          </button>
        </div>
      </nav>

      {/* FOOTER & STATUS */}
      <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="btn-theme-toggle"
            style={{ width: '100%', marginBottom: '12px', padding: '7px 10px', fontSize: '11.5px' }}
            title={theme === 'dark' ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
          >
            {theme === 'dark' ? <Sun size={14} style={{ color: '#f59e0b' }} /> : <Moon size={14} style={{ color: '#0284c7' }} />}
            <span>{theme === 'dark' ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}</span>
          </button>
        )}

        <div className="sidebar-status-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px', fontWeight: 600 }}>
            <span className="status-pulse-dot"></span>
            <span>Ollama IA Ativo</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>
            Llama 3 • Conexão Local Estável
          </div>
        </div>
      </div>
    </aside>
  );
}
