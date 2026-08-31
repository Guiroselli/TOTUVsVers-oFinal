import React, { useState, useEffect } from 'react';

export default function DocumentViewerModal({
  isOpen,
  onClose,
  meeting,
  pdfBlobUrl,
  isLoadingPdf = false,
  initialTab = 'pdf',
  onDownloadPdf,
  onDownloadDocx,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  if (!isOpen || !meeting) return null;

  const analysisData = meeting.RESUMO_IA || {};
  const meta = analysisData.analise_metadados || {};
  const dores = analysisData.dores || [];
  const tarefas = analysisData.tarefas || [];
  const confirmedTasks = tarefas.filter(t => (t.task_validation_status || 'valid') === 'valid');
  const pendingTasks = tarefas.filter(t => t.task_validation_status === 'pending_review');
  const recs = analysisData.recomendacoes_totvs || meeting.recomendacoes_totvs || [];

  const isFallback = (
    meta.analysis_engine === 'deterministic_fallback' ||
    meta.analysis_status === 'fallback_deterministico' ||
    meta.analysis_status === 'analise_contingencia_tarefas_pendentes' ||
    meta.analysis_status === 'reuniao_sem_conteudo_estruturado' ||
    meeting.STATUS_ANALISE === 'fallback_deterministico'
  );

  const clientName = meeting.client_code && meeting.client_code !== 'Não identificado' 
    ? meeting.client_code 
    : (meeting.NOME_SEGMENTO || 'Não identificado');
  const segmentName = meeting.segment || meeting.NOME_SEGMENTO || 'Geral';
  const dateStr = meeting.DT_MEETING || new Date().toISOString().substring(0, 10);
  const respStr = meeting.RESPONSAVEL_REUNIAO || analysisData.responsavel_reuniao || 'Não identificado';
  const urgencyStr = meeting.NIVEL_URGENCIA || analysisData.nivel_urgencia || 'Não Definido';

  const handleOpenNewTab = () => {
    if (pdfBlobUrl) {
      window.open(pdfBlobUrl, '_blank');
    } else if (meeting.ID_MEETING && meeting.TEM_PDF) {
      window.open(`http://localhost:8000/pdfs/${meeting.ID_MEETING}.pdf`, '_blank');
    }
  };

  const handlePrint = () => {
    if (activeTab === 'pdf' && pdfBlobUrl) {
      const iframe = document.getElementById('pdf-preview-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.print();
        return;
      }
    }
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 500,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--panel-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          maxWidth: '1150px',
          width: '100%',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Toolbar */}
        <div
          style={{
            padding: '1rem 1.5rem',
            background: 'var(--bg-main)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Title & Metadata */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  background: 'rgba(0, 210, 255, 0.15)',
                  color: 'var(--primary-color)',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Visualizador de Ata
              </span>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-main)', fontWeight: 600 }}>
                Reunião #{meeting.ID_MEETING} — {analysisData.tema || 'Alinhamento Geral'}
              </h3>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Cliente: <strong style={{ color: 'var(--text-main)' }}>{clientName}</strong> • Data: <strong>{dateStr}</strong> • Responsável: <strong>{respStr}</strong>
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: 'flex',
              background: 'var(--panel-bg)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
            }}
          >
            <button
              onClick={() => setActiveTab('pdf')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'pdf' ? 'var(--primary-color)' : 'transparent',
                color: activeTab === 'pdf' ? '#000' : 'var(--text-main)',
                fontWeight: activeTab === 'pdf' ? 700 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              Visualização PDF
            </button>
            <button
              onClick={() => setActiveTab('docx')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'docx' ? 'var(--primary-color)' : 'transparent',
                color: activeTab === 'docx' ? '#000' : 'var(--text-main)',
                fontWeight: activeTab === 'docx' ? 700 : 500,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              Ata Executiva (DOCX)
            </button>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => onDownloadPdf && onDownloadPdf(meeting)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Baixar arquivo PDF localmente"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Baixar PDF
            </button>

            <button
              onClick={() => onDownloadDocx && onDownloadDocx(meeting)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#3b82f6',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Baixar arquivo DOCX localmente"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Baixar DOCX
            </button>

            <button
              onClick={handleOpenNewTab}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'var(--panel-bg)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Abrir PDF em nova aba do navegador"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              Nova Aba
            </button>

            <button
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'var(--panel-bg)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Imprimir documento"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '4px',
                marginLeft: '6px',
              }}
              title="Fechar visualizador"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#0b1120', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'pdf' ? (
            <div style={{ flex: 1, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              {isLoadingPdf ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    border: '3px solid rgba(255,255,255,0.1)',
                    borderTopColor: 'var(--primary-color)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '1rem'
                  }}></div>
                  <p>Renderizando pré-visualização do PDF no frontend...</p>
                </div>
              ) : pdfBlobUrl ? (
                <iframe
                  id="pdf-preview-iframe"
                  src={pdfBlobUrl}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    background: '#525659',
                  }}
                  title="Pré-visualização do PDF"
                />
              ) : meeting.TEM_PDF ? (
                <iframe
                  id="pdf-preview-iframe"
                  src={`http://localhost:8000/pdfs/${meeting.ID_MEETING}.pdf`}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    background: '#525659',
                  }}
                  title="Pré-visualização do PDF"
                />
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    O arquivo PDF desta reunião ainda não foi renderizado em memória.
                  </p>
                  <button
                    className="btn-primary"
                    onClick={() => onDownloadPdf && onDownloadPdf(meeting)}
                  >
                    Gerar PDF Agora
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Document Executive Preview (DOCX HTML Mode) */
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', justifyContent: 'center', background: '#1e293b' }}>
              <div
                style={{
                  maxWidth: '850px',
                  width: '100%',
                  background: '#ffffff',
                  color: '#1e293b',
                  padding: '3rem 3.5rem',
                  borderRadius: '6px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  lineHeight: '1.6',
                }}
              >
                {/* Header Banner */}
                <div style={{ background: '#0f172a', color: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '6px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, letterSpacing: '-0.01em', color: '#ffffff' }}>
                      ATA FORMAL DE REUNIÃO EXECUTIVA
                    </h2>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                      Proton Flow v2.1 • Inteligência Estruturante & Ecossistema TOTVS
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '11px', color: '#cbd5e1' }}>
                    <div><strong>ID:</strong> #{meeting.ID_MEETING}</div>
                    <div>{dateStr}</div>
                  </div>
                </div>

                {isFallback && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderLeft: '4px solid #f59e0b', padding: '10px 14px', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '12px', color: '#92400e' }}>
                    <strong>MODO CONTINGÊNCIA ATIVO:</strong> Esta análise foi processada por regras determinísticas de contingência. As ações identificadas requerem validação humana obrigatória.
                  </div>
                )}

                {/* 1. Metadados */}
                <div style={{ marginBottom: '1.75rem' }}>
                  <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '4px', marginBottom: '10px' }}>
                    1. Metadados da Sessão
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '12.5px' }}>
                    <div><strong>Tema Principal:</strong> {analysisData.tema || 'Alinhamento Geral'}</div>
                    <div><strong>Responsável Geral:</strong> {respStr}</div>
                    <div><strong>Cliente:</strong> {clientName}</div>
                    <div><strong>Segmento:</strong> {segmentName}</div>
                    <div><strong>Nível de Urgência:</strong> <span style={{ color: urgencyStr === 'Crítica' || urgencyStr === 'Alta' ? '#dc2626' : '#2563eb', fontWeight: 600 }}>{urgencyStr}</span></div>
                    <div><strong>Data da Reunião:</strong> {dateStr}</div>
                  </div>
                </div>

                {/* 2. Resumo Executivo & Contexto */}
                <div style={{ marginBottom: '1.75rem' }}>
                  <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '4px', marginBottom: '10px' }}>
                    2. Resumo Executivo & Contexto
                  </h3>
                  {analysisData.contexto ? (
                    <div style={{ fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {analysisData.contexto.problema && (
                        <div><strong>Problema Discutido:</strong> {analysisData.contexto.problema}</div>
                      )}
                      {analysisData.contexto.decisao && (
                        <div><strong>Decisões / Encaminhamentos:</strong> {analysisData.contexto.decisao}</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12.5px', color: '#64748b', fontStyle: 'italic' }}>
                      Resumo da sessão consolidado nos tópicos e ações operacionais abaixo.
                    </div>
                  )}
                </div>

                {/* 3. Dores Identificadas */}
                <div style={{ marginBottom: '1.75rem' }}>
                  <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#ef4444', borderBottom: '2px solid #fee2e2', paddingBottom: '4px', marginBottom: '10px' }}>
                    3. Mapeamento de Dores & Gargalos Operacionais
                  </h3>
                  {dores.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {dores.map((d, idx) => {
                        const isObj = typeof d === 'object' && d !== null;
                        const label = isObj ? (d.label || d.categoria) : d;
                        const sev = isObj ? (d.severidade || 'Média') : 'Média';
                        const trecho = isObj ? (d.trecho || d.descricao || '') : '';
                        return (
                          <div key={idx} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '8px 12px', fontSize: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                              <strong style={{ color: '#991b1b' }}>{label}</strong>
                              <span style={{ fontSize: '10px', background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>
                                Severidade: {sev}
                              </span>
                            </div>
                            {trecho && <div style={{ color: '#475569', fontStyle: 'italic' }}>"{trecho}"</div>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                      • Nenhuma dor ou gargalo operacional crítico identificado na transcrição.
                    </div>
                  )}
                </div>

                {/* 4. Plano de Ação (Confirmados) */}
                <div style={{ marginBottom: '1.75rem' }}>
                  <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#059669', borderBottom: '2px solid #d1fae5', paddingBottom: '4px', marginBottom: '10px' }}>
                    4. Plano de Ação & Prazos Operacionais (Confirmados)
                  </h3>
                  {confirmedTasks.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1' }}>Responsável</th>
                          <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1' }}>Ação Operacional</th>
                          <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1' }}>Prazo</th>
                          <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {confirmedTasks.map((t, idx) => (
                          <tr key={idx} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 600 }}>{t.responsavel || 'Não identificado'}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{t.tarefa}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{t.prazo || 'Não mencionado'}</td>
                            <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>
                              <span style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                background: t.status === 'Concluído' ? '#dcfce7' : t.status === 'Em Andamento' ? '#fef3c7' : '#f1f5f9',
                                color: t.status === 'Concluído' ? '#166534' : t.status === 'Em Andamento' ? '#92400e' : '#475569',
                                fontWeight: 600,
                              }}>
                                {t.status || 'Não Inicializado'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                      • Nenhuma ação operacional confirmada identificada na transcrição.
                    </div>
                  )}
                </div>

                {/* 4.1 Itens Pendentes de Validação Humana */}
                {pendingTasks.length > 0 && (
                  <div style={{ marginBottom: '1.75rem' }}>
                    <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#d97706', borderBottom: '2px solid #fde68a', paddingBottom: '4px', marginBottom: '8px' }}>
                      4.1 Itens Pendentes de Validação Humana (Escopo Resumido / Contingência)
                    </h4>
                    <p style={{ fontSize: '11px', color: '#78350f', margin: '0 0 8px 0' }}>
                      * Estas ações foram extraídas com escopo resumido e requerem validação humana prévia.
                    </p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ background: '#d97706', color: '#ffffff', textAlign: 'left' }}>
                          <th style={{ padding: '5px 8px', border: '1px solid #fde68a' }}>Responsável Sugerido</th>
                          <th style={{ padding: '5px 8px', border: '1px solid #fde68a' }}>Ação / Sugestão</th>
                          <th style={{ padding: '5px 8px', border: '1px solid #fde68a' }}>Prazo Sugerido</th>
                          <th style={{ padding: '5px 8px', border: '1px solid #fde68a' }}>Validação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingTasks.map((t, idx) => (
                          <tr key={idx} style={{ background: idx % 2 === 0 ? '#fffbeb' : '#ffffff' }}>
                            <td style={{ padding: '5px 8px', border: '1px solid #fef3c7' }}>{t.responsavel || 'Não identificado'}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #fef3c7' }}>{t.tarefa}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #fef3c7' }}>{t.prazo || 'Não mencionado'}</td>
                            <td style={{ padding: '5px 8px', border: '1px solid #fef3c7', color: '#b45309', fontWeight: 600 }}>Pendente de Revisão</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 5. Recomendações TOTVS */}
                <div style={{ marginBottom: '1.75rem' }}>
                  <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#0284c7', borderBottom: '2px solid #e0f2fe', paddingBottom: '4px', marginBottom: '10px' }}>
                    5. Recomendações TOTVS & Ecossistema
                  </h3>
                  {recs.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
                      {recs.map((r, idx) => (
                        <div key={idx} style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '4px', padding: '10px 12px', fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <strong style={{ color: '#0369a1' }}>{r.product_name || 'TOTVS'}</strong>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7' }}>
                              {Math.round((r.fit_score || 0) * 100)}% Match
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#475569' }}>{r.why_recommended}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                      • Nenhuma recomendação específica mapeada para esta reunião.
                    </div>
                  )}
                </div>

                {/* 6. Qualidade & Parâmetros */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 16px', fontSize: '11.5px', color: '#475569' }}>
                  <div style={{ fontWeight: 600, color: '#334155', marginBottom: '6px', textTransform: 'uppercase' }}>
                    6. Parâmetros de Auditoria & Qualidade da IA
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                    <div><strong>Método:</strong> {isFallback ? 'Fallback determinístico' : 'Ollama / Llama 3'}</div>
                    <div><strong>Modelo:</strong> {meta.model_name || meta.model || (isFallback ? 'Regras Determinísticas' : 'llama3:latest')}</div>
                    <div><strong>Confiança Semântica:</strong> {meta.semantic_confidence || (isFallback ? 'Média (65%)' : 'Alta (85%)')}</div>
                    <div><strong>Ações Mapeadas:</strong> {confirmedTasks.length} confirmada(s) {pendingTasks.length > 0 ? `+ ${pendingTasks.length} pendente(s)` : ''}</div>
                  </div>
                </div>

                {/* Footer disclaimer */}
                <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', fontSize: '10.5px', color: '#94a3b8', textAlign: 'center' }}>
                  Documento gerado pelo Proton Flow v2.1 • TOTVS Reuniões Inteligentes
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
