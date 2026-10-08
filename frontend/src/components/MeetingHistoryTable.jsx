import React, { useState } from 'react';
import MeetingDetail from './MeetingDetail';
import {
  Zap,
  FileText,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

export default function MeetingHistoryTable({
  meetings,
  loading,
  expandedMeetingId,
  onToggleExpand,
  onResponsibleChange,
  onUrgencyChange,
  onSynthesize,
  onGenerateDocx,
  onAnalyzeMeeting,
  onOpenDocumentViewer,
  onDownloadExecutivePdf,
  onDownloadExecutiveDocx,
  onDownloadOperationalPdf,
  onDownloadOperationalDocx,
  sistemasTotvs,
  enviosPorReuniao,
  onConfirmSuggestion,
  onConfirmRecommendation,
  onTaskStatusChange,
  onEnviarIntegracao,
  onOpenConfig,
  pagination,
  onPageChange,
  onPageSizeChange
}) {
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'

  const getStatusBadge = (item) => {
    const meta = item.RESUMO_IA?.analise_metadados || {};
    const stAnalise = item.STATUS_ANALISE || meta.analysis_status || (item.RESUMO_IA ? 'analise_concluida' : 'aguardando_analise');
    const stRevisao = item.STATUS_REVISAO;
    const isFallback = meta.analysis_engine === 'deterministic_fallback' || stAnalise === 'fallback_deterministico';
    const isInsufficient = meta.status === 'insufficient_data' || stAnalise === 'analise_concluida_dados_insuficientes';

    if (item.STATUS_MEETING === 'erro_na_analise' || stAnalise === 'erro_na_analise' || stAnalise === 'analise_com_erro') {
      return { label: 'Falha na Análise', bg: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)' };
    }
    if (item.STATUS_MEETING === 'analise_em_andamento' || stAnalise === 'analise_em_andamento') {
      return { label: 'Analisando...', bg: 'rgba(2, 132, 199, 0.2)', color: 'var(--primary-light)' };
    }
    if (!item.RESUMO_IA || stAnalise === 'aguardando_analise') {
      return { label: 'Aguardando Análise', bg: 'rgba(107, 114, 128, 0.2)', color: 'var(--text-secondary)' };
    }
    if (stRevisao === 'revisao_concluida' || stRevisao === 'concluida') {
      return { label: 'Revisão Concluída', bg: 'rgba(16, 185, 129, 0.25)', color: 'var(--success)' };
    }
    if (isFallback) {
      return { label: 'Fallback Determinístico', bg: 'rgba(245, 158, 11, 0.25)', color: 'var(--warning)' };
    }
    if (isInsufficient) {
      return { label: 'Dados Insuficientes', bg: 'rgba(148, 163, 184, 0.25)', color: '#64748b' };
    }
    return { label: 'Revisão Pendente', bg: 'rgba(245, 158, 11, 0.2)', color: 'var(--warning)' };
  };

  const getUrgencyBadge = (urgency) => {
    switch (urgency) {
      case 'Crítica':
        return { label: 'Crítica', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)' };
      case 'Alta':
        return { label: 'Alta', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.4)' };
      case 'Média':
        return { label: 'Média', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)', border: 'rgba(234, 179, 8, 0.4)' };
      case 'Baixa':
        return { label: 'Baixa', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.4)' };
      default:
        return { label: 'Não Definida', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Sem data';
    try {
      const parts = String(dateStr).split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    } catch {}
    return String(dateStr);
  };

  return (
    <div style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
      {/* Top Header com Seletor de Modo de Exibição */}
      <div className="meeting-header-controls">
        <div className="meeting-count-badge-wrap">
          <span className="meeting-count-title">
            Exibindo {meetings?.length || 0} reuniões
          </span>
          {pagination?.total > 0 && (
            <span className="meeting-total-pill">
              Total: {pagination.total}
            </span>
          )}
        </div>

        {/* View Toggle (Cards Executivos vs Tabela) */}
        <div className="view-toggle-bar">
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Visualizar reuniões no formato de Cards Executivos"
          >
            <LayoutGrid size={13} />
            <span>Cards Executivos</span>
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Visualizar reuniões no formato de Tabela Estruturada"
          >
            <List size={13} />
            <span>Tabela Estruturada</span>
          </button>
        </div>
      </div>

      {loading && (!meetings || meetings.length === 0) ? (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid var(--border-color)',
            borderTopColor: 'var(--primary-color)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem auto'
          }}></div>
          Carregando reuniões da base de dados...
        </div>
      ) : !loading && (!meetings || meetings.length === 0) ? (
        <div style={{ padding: '3.5rem 2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          Nenhuma reunião encontrada com os filtros selecionados.
        </div>
      ) : (
        <div style={{ position: 'relative', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s ease', pointerEvents: loading ? 'none' : 'auto' }}>
          {viewMode === 'cards' ? (
            /* ================= MODO CARDS EXECUTIVOS ================= */
            <div className="meeting-cards-grid">
              {meetings.map((item) => {
                const isExpanded = expandedMeetingId === item.ID_MEETING;
                const hasAnalysis = Boolean(item.RESUMO_IA && (item.RESUMO_IA.tema || (item.RESUMO_IA.dores && item.RESUMO_IA.dores.length > 0) || (item.RESUMO_IA.tarefas && item.RESUMO_IA.tarefas.length > 0)));
                const stBadge = getStatusBadge(item);
                const urgBadge = getUrgencyBadge(item.NIVEL_URGENCIA);
                const segmentName = item.segment || item.NOME_SEGMENTO || (item.STATUS_MEETING === 'ao_vivo' ? 'Ao Vivo' : 'Corporativo');
                const isLive = item.STATUS_MEETING === 'ao_vivo' || segmentName.toLowerCase().includes('ao vivo');
                const hasClientCode = item.client_code && item.client_code !== 'Não identificado' && item.client_code !== 'Geral' && item.client_code !== 'Ao Vivo' && item.client_code !== segmentName;
                const shortId = item.ID_MEETING ? (item.ID_MEETING.length > 8 ? item.ID_MEETING.substring(0, 8) : item.ID_MEETING) : '';

                const themeTitle = item.RESUMO_IA?.tema || (item.ANON_TRANSCRICAO ? (item.ANON_TRANSCRICAO.length > 120 ? `${item.ANON_TRANSCRICAO.substring(0, 120)}...` : item.ANON_TRANSCRICAO) : null);
                const taskCount = item.RESUMO_IA?.tarefas?.length || 0;
                const painCount = item.RESUMO_IA?.dores?.length || 0;

                return (
                  <div key={item.ID_MEETING} className={`meeting-card ${isExpanded ? 'expanded' : ''}`}>
                    {/* Header do Card: Segmento & ID à esquerda | Urgência & Data à direita */}
                    <div className="meeting-card-header">
                      <div className="meeting-card-tags-left">
                        <span className={`segment-tag-pill ${isLive ? 'live-pill' : ''}`}>
                          {isLive && <span className="live-dot" />}
                          {segmentName}
                        </span>
                        {hasClientCode ? (
                          <span className="client-code-tag" title={`Código do Cliente: ${item.client_code}`}>
                            {item.client_code}
                          </span>
                        ) : shortId ? (
                          <span className="meeting-id-tag" title={`ID da Reunião: #${item.ID_MEETING}`}>
                            #{shortId}
                          </span>
                        ) : null}
                      </div>

                      <div className="meeting-card-meta-right">
                        {urgBadge.label !== 'Não Definida' && (
                          <span className="urgency-badge-pill" style={{
                            background: urgBadge.bg,
                            color: urgBadge.color,
                            borderColor: urgBadge.border
                          }}>
                            <span className="urgency-dot" style={{ backgroundColor: urgBadge.color }} />
                            {urgBadge.label}
                          </span>
                        )}
                        <span className="meeting-card-date">
                          <Calendar size={12} />
                          <span>{formatDate(item.DT_MEETING)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Tema Principal / Foco Executivo da Reunião */}
                    <div className="meeting-card-body">
                      {themeTitle ? (
                        <h3 className="meeting-card-title" title={themeTitle}>
                          {themeTitle}
                        </h3>
                      ) : (
                        <h3 className="meeting-card-title empty-title">
                          Reunião sem transcrição capturada
                        </h3>
                      )}

                      {/* Métricas e Indicadores Chave */}
                      <div className="meeting-card-indicators-row">
                        <span className="status-indicator-badge" style={{
                          background: stBadge.bg,
                          color: stBadge.color
                        }}>
                          {stBadge.label}
                        </span>

                        {hasAnalysis && (
                          <div className="meeting-stats-group">
                            <span className="meeting-stat-chip" title={`${taskCount} tarefas identificadas no plano de ação`}>
                              <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
                              <span>{taskCount} {taskCount === 1 ? 'tarefa' : 'tarefas'}</span>
                            </span>
                            {painCount > 0 && (
                              <span className="meeting-stat-chip" title={`${painCount} dores ou gargalos reportados`}>
                                <AlertTriangle size={12} style={{ color: 'var(--warning)' }} />
                                <span>{painCount} {painCount === 1 ? 'dor' : 'dores'}</span>
                              </span>
                            )}
                          </div>
                        )}

                        {item.NOTA_NPS !== undefined && item.NOTA_NPS !== null && item.NOTA_NPS !== '' && (
                          <span className="meeting-nps-chip" title={`NPS Avaliado: ${item.NOTA_NPS}`}>
                            <span>NPS</span>
                            <strong style={{
                              color: parseInt(item.NOTA_NPS, 10) >= 8 ? 'var(--success)' : parseInt(item.NOTA_NPS, 10) >= 7 ? 'var(--warning)' : 'var(--danger)'
                            }}>
                              {item.NOTA_NPS}
                            </strong>
                          </span>
                        )}
                      </div>

                      {/* Responsável */}
                      <div className="meeting-responsible-row">
                        <User size={13} style={{ color: 'var(--primary-color)' }} />
                        <span className="responsible-label">Responsável:</span>
                        <strong className="responsible-name">{item.RESPONSAVEL_REUNIAO || 'Não atribuído'}</strong>
                      </div>
                    </div>

                    {/* Footer com Ações */}
                    <div className="meeting-card-footer">
                      <button
                        type="button"
                        className={`btn-pf btn-pf-sm ${isExpanded ? 'btn-pf-primary' : 'btn-pf-secondary'}`}
                        onClick={() => onToggleExpand(item.ID_MEETING)}
                        title={isExpanded ? 'Recolher detalhes da reunião' : 'Abrir detalhes e plano de ação'}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span>{isExpanded ? 'Fechar Detalhes' : 'Ver Detalhes'}</span>
                      </button>

                      <div className="meeting-card-actions">
                        {!hasAnalysis ? (
                          <button
                            type="button"
                            className="btn-pf btn-pf-primary btn-pf-sm"
                            onClick={() => onAnalyzeMeeting && onAnalyzeMeeting(item.ID_MEETING)}
                            title="Analisar reunião com IA e extrair plano de ação"
                          >
                            <Zap size={13} />
                            <span>Analisar IA</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn-pf btn-pf-executive btn-pf-sm"
                              onClick={() => onOpenDocumentViewer ? onOpenDocumentViewer(item, 'executive', 'pdf') : (onDownloadExecutivePdf ? onDownloadExecutivePdf(item) : onSynthesize(item))}
                              title="Abrir Ata Executiva no visualizador"
                            >
                              <FileText size={12} />
                              <span>Executiva</span>
                            </button>
                            <button
                              type="button"
                              className="btn-pf btn-pf-secondary btn-pf-sm"
                              onClick={() => onOpenDocumentViewer ? onOpenDocumentViewer(item, 'operational', 'pdf') : (onDownloadOperationalPdf ? onDownloadOperationalPdf(item) : onSynthesize(item))}
                              title="Abrir Ata Operacional no visualizador"
                            >
                              <FileSpreadsheet size={12} />
                              <span>Operacional</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Seção Expandida Dentro do Card */}
                    {isExpanded && (
                      <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
                        <MeetingDetail
                          meeting={item}
                          sistemasTotvs={sistemasTotvs}
                          enviosPorReuniao={enviosPorReuniao}
                          onConfirmSuggestion={onConfirmSuggestion}
                          onConfirmRecommendation={onConfirmRecommendation}
                          onTaskStatusChange={onTaskStatusChange}
                          onEnviarIntegracao={onEnviarIntegracao}
                          onOpenConfig={onOpenConfig}
                          onOpenDocumentViewer={onOpenDocumentViewer}
                          onDownloadExecutivePdf={onDownloadExecutivePdf || onSynthesize}
                          onDownloadExecutiveDocx={onDownloadExecutiveDocx || onGenerateDocx}
                          onDownloadOperationalPdf={onDownloadOperationalPdf || onSynthesize}
                          onDownloadOperationalDocx={onDownloadOperationalDocx || onGenerateDocx}
                          onDownloadPdf={onDownloadOperationalPdf || onSynthesize}
                          onDownloadDocx={onDownloadOperationalDocx || onGenerateDocx}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
        /* ================= MODO TABELA ESTRUTURADA ================= */
        <div className="table-container-wrapper" style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}>
          <div className="table-scroll-hint">
            <span>↔ Deslize para o lado para ver todas as 8 colunas da tabela</span>
          </div>
          <div className="table-container">
            <table className="totvs-table" style={{ minWidth: '860px' }}>
              <thead>
                <tr>
                  <th style={{ width: '130px', whiteSpace: 'nowrap' }}>ID Reunião</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Data</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Segmento Cliente</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                  <th style={{ whiteSpace: 'nowrap' }}>NPS</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Responsável</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Urgência</th>
                  <th style={{ minWidth: '220px', whiteSpace: 'nowrap' }}>Ações (IA / Documentos)</th>
                </tr>
              </thead>
            <tbody>
              {meetings.map((item) => {
                const isExpanded = expandedMeetingId === item.ID_MEETING;
                const hasAnalysis = Boolean(item.RESUMO_IA && (item.RESUMO_IA.tema || (item.RESUMO_IA.dores && item.RESUMO_IA.dores.length > 0) || (item.RESUMO_IA.tarefas && item.RESUMO_IA.tarefas.length > 0)));
                const stBadge = getStatusBadge(item);

                return (
                  <React.Fragment key={item.ID_MEETING}>
                    <tr>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => onToggleExpand(item.ID_MEETING)}
                            style={{
                              background: isExpanded ? 'var(--primary-color)' : 'var(--panel-hover)',
                              color: isExpanded ? '#ffffff' : 'var(--text-main)',
                              border: `1px solid ${isExpanded ? 'var(--primary-color)' : 'var(--border-color)'}`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              padding: '4px',
                              width: '26px',
                              height: '26px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'background-color 0.15s ease, border-color 0.15s ease',
                              boxShadow: 'none'
                            }}
                            title={isExpanded ? 'Ocultar Detalhes da Reunião' : 'Ver Detalhes da Reunião'}
                          >
                            {isExpanded ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <polyline points="18 15 12 9 6 15"></polyline>
                              </svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                              </svg>
                            )}
                          </button>
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>
                            {item.ID_MEETING ? (item.ID_MEETING.length > 12 ? `${item.ID_MEETING.substring(0, 8)}...` : item.ID_MEETING) : 'N/A'}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: '13px' }}>
                          {item.DT_MEETING || 'Data não informada'}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {item.client_code && item.client_code !== 'Não identificado' && item.client_code !== 'Geral' && item.client_code !== 'Ao Vivo' && (
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary-color)' }}>
                              {item.client_code}
                            </span>
                          )}
                          <span className="badge" style={{ fontSize: '11px', alignSelf: 'flex-start' }}>
                            {item.segment || item.NOME_SEGMENTO || 'Geral'}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: stBadge.bg,
                          color: stBadge.color,
                          whiteSpace: 'nowrap'
                        }}>
                          {stBadge.label}
                        </span>
                      </td>

                      <td>
                        {item.NOTA_NPS !== undefined && item.NOTA_NPS !== null && item.NOTA_NPS !== '' ? (
                          <span style={{
                            color: parseInt(item.NOTA_NPS, 10) >= 8 ? 'var(--success)' : parseInt(item.NOTA_NPS, 10) >= 7 ? 'var(--warning)' : 'var(--danger)',
                            fontWeight: 'bold',
                            fontSize: '13px'
                          }}>
                            {item.NOTA_NPS}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      <td>
                        <input
                          type="text"
                          className="table-input-pf"
                          key={`${item.ID_MEETING}_${item.RESPONSAVEL_REUNIAO || ''}`}
                          defaultValue={item.RESPONSAVEL_REUNIAO || ''}
                          onBlur={(e) => onResponsibleChange(item.ID_MEETING, e.target.value)}
                          placeholder="Nome..."
                          title="Editar responsável pela reunião"
                        />
                      </td>

                      <td>
                        <select
                          className={`table-select-pf ${
                            item.NIVEL_URGENCIA === 'Crítica' ? 'urgency-critica' :
                            item.NIVEL_URGENCIA === 'Alta' ? 'urgency-alta' :
                            item.NIVEL_URGENCIA === 'Média' ? 'urgency-media' :
                            item.NIVEL_URGENCIA === 'Baixa' ? 'urgency-baixa' :
                            'urgency-indefinido'
                          }`}
                          value={item.NIVEL_URGENCIA || 'Não Definido'}
                          onChange={(e) => onUrgencyChange(item.ID_MEETING, e.target.value)}
                          title="Alterar nível de urgência"
                        >
                          <option value="Não Definido">Não Definido</option>
                          <option value="Baixa">Baixa</option>
                          <option value="Média">Média</option>
                          <option value="Alta">Alta</option>
                          <option value="Crítica">Crítica</option>
                        </select>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {!hasAnalysis ? (
                            <button
                              className="btn-pf btn-pf-primary btn-pf-sm"
                              style={{ flex: 1, padding: '5px 10px', fontSize: '11px', fontWeight: 600 }}
                              onClick={() => onAnalyzeMeeting && onAnalyzeMeeting(item.ID_MEETING)}
                              title="Analisar reunião com IA e extrair plano de ação"
                            >
                              <Zap size={13} />
                              <span>Analisar</span>
                            </button>
                          ) : (
                            <>
                              <button
                                className="btn-pf btn-pf-executive btn-pf-sm"
                                style={{ padding: '5px 9px', fontSize: '11px', fontWeight: 600 }}
                                onClick={() => onOpenDocumentViewer ? onOpenDocumentViewer(item, 'executive', 'pdf') : (onDownloadExecutivePdf ? onDownloadExecutivePdf(item) : onSynthesize(item))}
                                title="Abrir Ata Executiva (Visão Liderança / Decisão)"
                              >
                                <FileText size={13} />
                                <span>Executiva</span>
                              </button>

                              <button
                                className="btn-pf btn-pf-secondary btn-pf-sm"
                                style={{ padding: '5px 9px', fontSize: '11px', fontWeight: 600 }}
                                onClick={() => onOpenDocumentViewer ? onOpenDocumentViewer(item, 'operational', 'pdf') : (onDownloadOperationalPdf ? onDownloadOperationalPdf(item) : onSynthesize(item))}
                                title="Abrir Ata Operacional (Tarefas, Prazos & Evidências)"
                              >
                                <FileSpreadsheet size={13} />
                                <span>Operacional</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr style={{ background: 'var(--bg-main)' }}>
                        <td colSpan="8" style={{ padding: '1rem' }}>
                          <MeetingDetail
                            meeting={item}
                            sistemasTotvs={sistemasTotvs}
                            enviosPorReuniao={enviosPorReuniao}
                            onConfirmSuggestion={onConfirmSuggestion}
                            onConfirmRecommendation={onConfirmRecommendation}
                            onTaskStatusChange={onTaskStatusChange}
                            onEnviarIntegracao={onEnviarIntegracao}
                            onOpenConfig={onOpenConfig}
                            onOpenDocumentViewer={onOpenDocumentViewer}
                            onDownloadExecutivePdf={onDownloadExecutivePdf || onSynthesize}
                            onDownloadExecutiveDocx={onDownloadExecutiveDocx || onGenerateDocx}
                            onDownloadOperationalPdf={onDownloadOperationalPdf || onSynthesize}
                            onDownloadOperationalDocx={onDownloadOperationalDocx || onGenerateDocx}
                            onDownloadPdf={onDownloadOperationalPdf || onSynthesize}
                            onDownloadDocx={onDownloadOperationalDocx || onGenerateDocx}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}
        </div>
      )}

      {/* Paginação Inteligente e Totalmente Responsiva */}
      {pagination && pagination.total_pages > 1 && (
        <div className="pagination-bar-root">
          <div className="pagination-info">
            Exibindo <strong>{meetings.length}</strong> de <strong>{pagination.total}</strong> reuniões <span className="pagination-page-hint">(Página {pagination.page} de {pagination.total_pages})</span>
          </div>

          <div className="pagination-controls-wrap">
            <div className="pagination-nav-group">
              <button
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="btn-pf btn-pf-secondary btn-pf-sm"
                title="Ir para a página anterior"
              >
                <ChevronLeft size={14} />
                <span>Anterior</span>
              </button>

              <span className="pagination-page-badge">
                {pagination.page} / {pagination.total_pages}
              </span>

              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className="btn-pf btn-pf-secondary btn-pf-sm"
                title="Ir para a próxima página"
              >
                <span>Próxima</span>
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="pagination-pagesize-group">
              <span className="pagination-pagesize-label">Por pág:</span>
              {[10, 20, 50].map((sz) => (
                <button
                  key={sz}
                  onClick={() => onPageSizeChange(sz)}
                  className={`btn-pf btn-pf-sm ${pagination.page_size === sz ? 'btn-pf-primary' : 'btn-pf-secondary'}`}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: pagination.page_size === sz ? 700 : 500,
                    minWidth: '28px',
                    height: '26px'
                  }}
                  title={`Exibir ${sz} reuniões por página`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
