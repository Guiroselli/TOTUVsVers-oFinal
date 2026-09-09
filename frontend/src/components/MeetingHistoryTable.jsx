import React from 'react';
import MeetingDetail from './MeetingDetail';

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
      return { label: 'Analisando...', bg: 'rgba(0, 210, 255, 0.2)', color: 'var(--primary-color)' };
    }
    if (!item.RESUMO_IA || stAnalise === 'aguardando_analise') {
      return { label: 'Aguardando Análise', bg: 'rgba(107, 114, 128, 0.2)', color: '#9ca3af' };
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

  return (
    <div>
      <div className="table-container">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
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
        ) : (
          <table className="totvs-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>ID Reunião</th>
                <th>Data</th>
                <th>Segmento Cliente</th>
                <th>Status</th>
                <th>NPS</th>
                <th>Responsável</th>
                <th>Urgência</th>
                <th style={{ minWidth: '220px' }}>Ações (IA / Documentos)</th>
              </tr>
            </thead>
            <tbody>
              {meetings && meetings.length > 0 ? (
                meetings.map((item) => {
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
                                background: isExpanded ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
                                color: 'var(--primary-color)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title={isExpanded ? 'Ocultar Detalhes' : 'Ver Detalhes'}
                            >
                              {isExpanded ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="18 15 12 9 6 15"></polyline>
                                </svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                            key={`${item.ID_MEETING}_${item.RESPONSAVEL_REUNIAO || ''}`}
                            defaultValue={item.RESPONSAVEL_REUNIAO || ''}
                            onBlur={(e) => onResponsibleChange(item.ID_MEETING, e.target.value)}
                            placeholder="Nome..."
                            style={{
                              padding: '5px 8px',
                              borderRadius: '4px',
                              background: 'var(--panel-bg)',
                              color: 'var(--text-main)',
                              border: '1px solid var(--border-color)',
                              outline: 'none',
                              width: '130px',
                              fontSize: '12px'
                            }}
                          />
                        </td>

                        <td>
                          <select
                            value={item.NIVEL_URGENCIA || 'Não Definido'}
                            onChange={(e) => onUrgencyChange(item.ID_MEETING, e.target.value)}
                            style={{
                              padding: '5px 8px',
                              borderRadius: '4px',
                              background: 'var(--panel-bg)',
                              color: item.NIVEL_URGENCIA === 'Crítica' || item.NIVEL_URGENCIA === 'Alta' ? 'var(--danger)' : item.NIVEL_URGENCIA === 'Média' ? 'var(--warning)' : 'var(--text-main)',
                              border: '1px solid var(--border-color)',
                              outline: 'none',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 500
                            }}
                          >
                            <option value="Não Definido">Não Definido</option>
                            <option value="Baixa">Baixa</option>
                            <option value="Média">Média</option>
                            <option value="Alta">Alta</option>
                            <option value="Crítica">Crítica</option>
                          </select>
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                            {!hasAnalysis ? (
                              <button
                                className="btn-synth"
                                style={{
                                  background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.2), rgba(59, 130, 246, 0.3))',
                                  border: '1px solid var(--primary-color)',
                                  color: 'var(--primary-color)',
                                  flex: 1,
                                  padding: '5px 8px',
                                  fontSize: '12px',
                                  fontWeight: 600
                                }}
                                onClick={() => onAnalyzeMeeting && onAnalyzeMeeting(item.ID_MEETING)}
                                title="Analisar reunião com IA e extrair plano de ação"
                              >
                                ⚡ Analisar
                              </button>
                            ) : (
                              <>
                                <button
                                  className="btn-synth"
                                  style={{
                                    background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.22), rgba(59, 130, 246, 0.32))',
                                    border: '1px solid var(--primary-color)',
                                    color: 'var(--primary-color)',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  onClick={() => onOpenDocumentViewer ? onOpenDocumentViewer(item, 'executive', 'pdf') : (onDownloadExecutivePdf ? onDownloadExecutivePdf(item) : onSynthesize(item))}
                                  title="Abrir Ata Executiva (Visão Liderança / Decisão)"
                                >
                                  👔 Executiva
                                </button>

                                <button
                                  className="btn-synth"
                                  style={{
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    border: '1px solid rgba(16, 185, 129, 0.4)',
                                    color: 'var(--success)',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  onClick={() => onOpenDocumentViewer ? onOpenDocumentViewer(item, 'operational', 'pdf') : (onDownloadOperationalPdf ? onDownloadOperationalPdf(item) : onSynthesize(item))}
                                  title="Abrir Ata Operacional (Tarefas, Prazos & Evidências)"
                                >
                                  📋 Operacional
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
                })
              ) : (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Nenhuma reunião encontrada com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {pagination && pagination.total_pages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '1rem',
          padding: '0.8rem 1rem',
          background: 'var(--panel-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Exibindo <strong>{meetings.length}</strong> de <strong>{pagination.total}</strong> reuniões (Página {pagination.page} de {pagination.total_pages})
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                color: pagination.page <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                fontSize: '12px'
              }}
            >
              Anterior
            </button>

            <span style={{ fontSize: '13px', color: 'var(--primary-color)', fontWeight: 600, padding: '0 4px' }}>
              {pagination.page} / {pagination.total_pages}
            </span>

            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                color: pagination.page >= pagination.total_pages ? 'var(--text-muted)' : 'var(--text-main)',
                cursor: pagination.page >= pagination.total_pages ? 'not-allowed' : 'pointer',
                fontSize: '12px'
              }}
            >
              Próxima
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '2px' }}>Por pág:</span>
              {[10, 20, 50].map((sz) => (
                <button
                  key={sz}
                  onClick={() => onPageSizeChange(sz)}
                  style={{
                    padding: '4px 9px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: pagination.page_size === sz ? 600 : 400,
                    background: pagination.page_size === sz ? 'rgba(0, 210, 255, 0.2)' : 'var(--bg-main)',
                    border: `1px solid ${pagination.page_size === sz ? 'var(--primary-color)' : 'var(--border-color)'}`,
                    color: pagination.page_size === sz ? 'var(--primary-color)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
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
