import React, { useState, useEffect } from 'react';
import { FileText, FileSpreadsheet, FileDown, FileCode, Download, ExternalLink, Printer, X } from 'lucide-react';

export default function DocumentViewerModal({
  isOpen,
  onClose,
  meeting,
  pdfBlobUrl,
  isLoadingPdf = false,
  initialDocType = 'executive', // 'executive' | 'operational'
  initialFormat = 'pdf', // 'pdf' | 'docx'
  onDownloadOperationalPdf,
  onDownloadOperationalDocx,
  onDownloadExecutivePdf,
  onDownloadExecutiveDocx,
  onSwitchDocType,
}) {
  const [docType, setDocType] = useState(initialDocType || 'executive');
  const [format, setFormat] = useState(initialFormat || 'pdf');

  useEffect(() => {
    if (initialDocType) {
      setDocType(initialDocType);
    }
  }, [initialDocType]);

  useEffect(() => {
    if (initialFormat) {
      setFormat(initialFormat);
    }
  }, [initialFormat]);

  if (!isOpen || !meeting) return null;

  const analysisData = meeting.RESUMO_IA || {};
  const meta = analysisData.analise_metadados || {};
  const dores = analysisData.dores || [];
  const tarefas = analysisData.tarefas || [];
  const confirmedTasks = tarefas.filter(t => (t.task_validation_status || 'valid') === 'valid');
  const pendingTasks = tarefas.filter(t => t.task_validation_status === 'pending_review');
  const recs = analysisData.recomendacoes_totvs || meeting.recomendacoes_totvs || [];

  // Dados da Ata Executiva
  const execSummary = meeting.RESUMO_EXECUTIVO || analysisData.resumo_executivo || {};
  const mainRisks = execSummary.main_risks || [];
  const decisionsMade = execSummary.decisions_made || [];
  const decisionsRequired = execSummary.decisions_required || [];
  const strategicNextSteps = execSummary.strategic_next_steps || [];
  const execRec = execSummary.executive_recommendation;
  const missingInfo = execSummary.missing_information || [];

  const isFallback = (
    meta.analysis_engine === 'deterministic_fallback' ||
    meta.analysis_status === 'fallback_deterministico' ||
    meta.analysis_status === 'analise_contingencia_tarefas_pendentes' ||
    meta.analysis_status === 'reuniao_sem_conteudo_estruturado' ||
    meeting.STATUS_ANALISE === 'fallback_deterministico' ||
    execSummary.generation_method === 'fallback_generated'
  );

  const clientName = meeting.client_code && meeting.client_code !== 'Não identificado' 
    ? meeting.client_code 
    : (meeting.NOME_SEGMENTO || 'Não identificado');
  const segmentName = meeting.segment || meeting.NOME_SEGMENTO || 'Geral';
  const dateStr = meeting.DT_MEETING || new Date().toISOString().substring(0, 10);
  const respStr = meeting.RESPONSAVEL_REUNIAO || analysisData.responsavel_reuniao || 'Não identificado';
  const urgencyStr = meeting.NIVEL_URGENCIA || analysisData.nivel_urgencia || execSummary.urgency || 'Não Definido';

  const handleDocTypeToggle = (type) => {
    setDocType(type);
    if (onSwitchDocType) {
      onSwitchDocType(type, format);
    }
  };

  const handleFormatToggle = (fmt) => {
    setFormat(fmt);
  };

  const handleOpenNewTab = () => {
    if (pdfBlobUrl) {
      window.open(pdfBlobUrl, '_blank');
    } else if (meeting.ID_MEETING && meeting.TEM_PDF) {
      window.open(`http://localhost:8000/pdfs/${meeting.ID_MEETING}.pdf`, '_blank');
    }
  };

  const handlePrint = () => {
    if (format === 'pdf' && pdfBlobUrl) {
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
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
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
          maxWidth: '1200px',
          width: '100%',
          height: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
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
                  background: docType === 'executive' ? 'rgba(2, 132, 199, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  color: docType === 'executive' ? 'var(--primary-light)' : 'var(--success)',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  border: `1px solid ${docType === 'executive' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {docType === 'executive' ? <FileText size={12} /> : <FileSpreadsheet size={12} />}
                <span>{docType === 'executive' ? 'ATA EXECUTIVA' : 'ATA OPERACIONAL'}</span>
              </span>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)', fontWeight: 600 }}>
                Reunião #{meeting.ID_MEETING} — {analysisData.tema || 'Alinhamento Estratégico'}
              </h3>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Cliente: <strong style={{ color: 'var(--text-main)' }}>{clientName}</strong> • Data: <strong>{dateStr}</strong> • Urgência: <strong style={{ color: urgencyStr === 'Crítica' || urgencyStr === 'Alta' ? '#ef4444' : 'var(--primary-color)' }}>{urgencyStr}</strong>
            </p>
          </div>

          {/* Selectors: Document Type & Format */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* 1. Escolha do Tipo de Ata */}
            <div
              style={{
                display: 'flex',
                background: 'var(--panel-hover)',
                padding: '3px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                gap: '2px'
              }}
            >
              <button
                onClick={() => handleDocTypeToggle('executive')}
                className={`btn-pf btn-pf-sm ${docType === 'executive' ? 'btn-pf-primary' : 'btn-pf-ghost'}`}
                title="Ata Executiva: Síntese de 1-2 páginas para tomada de decisão da liderança"
              >
                <FileText size={13} />
                <span>Ata Executiva</span>
              </button>
              <button
                onClick={() => handleDocTypeToggle('operational')}
                className={`btn-pf btn-pf-sm ${docType === 'operational' ? 'btn-pf-primary' : 'btn-pf-ghost'}`}
                title="Ata Operacional: Detalhamento completo de tarefas, evidências e catálogo"
              >
                <FileSpreadsheet size={13} />
                <span>Ata Operacional</span>
              </button>
            </div>

            {/* 2. Escolha do Formato (PDF vs DOCX) */}
            <div
              style={{
                display: 'flex',
                background: 'var(--panel-hover)',
                padding: '3px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                gap: '2px'
              }}
            >
              <button
                onClick={() => handleFormatToggle('pdf')}
                className={`btn-pf btn-pf-sm ${format === 'pdf' ? 'btn-pf-secondary' : 'btn-pf-ghost'}`}
                style={{ fontWeight: format === 'pdf' ? 700 : 400 }}
              >
                <FileDown size={13} />
                <span>PDF</span>
              </button>
              <button
                onClick={() => handleFormatToggle('docx')}
                className={`btn-pf btn-pf-sm ${format === 'docx' ? 'btn-pf-secondary' : 'btn-pf-ghost'}`}
                style={{ fontWeight: format === 'docx' ? 700 : 400 }}
              >
                <FileCode size={13} />
                <span>DOCX</span>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {docType === 'executive' ? (
              <>
                <button
                  onClick={() => onDownloadExecutivePdf && onDownloadExecutivePdf(meeting)}
                  className="btn-pf btn-pf-primary btn-pf-sm"
                  title="Baixar PDF da Ata Executiva"
                >
                  <Download size={13} />
                  <span>Baixar PDF</span>
                </button>
                <button
                  onClick={() => onDownloadExecutiveDocx && onDownloadExecutiveDocx(meeting)}
                  className="btn-pf btn-pf-secondary btn-pf-sm"
                  title="Baixar DOCX da Ata Executiva"
                >
                  <Download size={13} />
                  <span>Baixar DOCX</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onDownloadOperationalPdf && onDownloadOperationalPdf(meeting)}
                  className="btn-pf btn-pf-primary btn-pf-sm"
                  title="Baixar PDF da Ata Operacional"
                >
                  <Download size={13} />
                  <span>Baixar PDF</span>
                </button>
                <button
                  onClick={() => onDownloadOperationalDocx && onDownloadOperationalDocx(meeting)}
                  className="btn-pf btn-pf-secondary btn-pf-sm"
                  title="Baixar DOCX da Ata Operacional"
                >
                  <Download size={13} />
                  <span>Baixar DOCX</span>
                </button>
              </>
            )}

            <button
              onClick={handleOpenNewTab}
              className="btn-pf btn-pf-secondary btn-pf-sm"
              title="Abrir documento em nova aba"
            >
              <ExternalLink size={13} />
              <span>Nova Aba</span>
            </button>

            <button
              onClick={handlePrint}
              className="btn-pf btn-pf-secondary btn-pf-sm"
              style={{ width: '32px', height: '28px', padding: 0 }}
              title="Imprimir"
            >
              <Printer size={14} />
            </button>

            <button
              onClick={onClose}
              className="btn-pf btn-pf-ghost btn-pf-sm"
              style={{ width: '32px', height: '28px', padding: 0 }}
              title="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#0b1120', display: 'flex', flexDirection: 'column' }}>
          {format === 'pdf' ? (
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
                  <p>Renderizando pré-visualização do PDF ({docType === 'executive' ? 'Ata Executiva' : 'Ata Operacional'})...</p>
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
                  title={`Pré-visualização do PDF (${docType === 'executive' ? 'Executiva' : 'Operacional'})`}
                />
              ) : meeting.TEM_PDF && docType === 'operational' ? (
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
                    O arquivo PDF desta ata ({docType === 'executive' ? 'Ata Executiva' : 'Ata Operacional'}) ainda não foi gerado em memória.
                  </p>
                  <button
                    className="btn-primary"
                    onClick={() => docType === 'executive' ? onDownloadExecutivePdf(meeting) : onDownloadOperationalPdf(meeting)}
                  >
                    Gerar PDF Agora
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Format: DOCX / HTML Paper Preview */
            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem', display: 'flex', justifyContent: 'center', background: 'var(--bg-dark)' }}>
              {docType === 'executive' ? (
                /* ==================== 1. ATA EXECUTIVA (LIDERANÇA) ==================== */
                <div
                  style={{
                    maxWidth: '850px',
                    width: '100%',
                    background: '#ffffff',
                    color: '#0f172a',
                    padding: '3rem 3.5rem',
                    borderRadius: '6px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    lineHeight: '1.6',
                  }}
                >
                  {/* Header Banner */}
                  <div style={{ background: '#0f172a', color: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '6px', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, letterSpacing: '-0.01em', color: '#ffffff' }}>
                        ATA EXECUTIVA DE REUNIÃO
                      </h2>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                        Proton Flow v2.1 • Síntese Estratégica & Apoio à Decisão da Liderança
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '11px', color: '#cbd5e1' }}>
                      <div><strong>ID:</strong> #{meeting.ID_MEETING}</div>
                      <div>{dateStr}</div>
                    </div>
                  </div>

                  {isFallback && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderLeft: '4px solid #f59e0b', padding: '10px 14px', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '12px', color: '#92400e' }}>
                      <strong>AVISO DE CONTINGÊNCIA:</strong> Esta síntese executiva foi gerada a partir de regras de contingência. Recomenda-se validação humana antes da tomada de decisão formal.
                    </div>
                  )}

                  {/* Metadados da Sessão */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: '#f8fafc', padding: '12px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1.5rem', fontSize: '12px' }}>
                    <div><span style={{ color: '#64748b' }}>Tema Principal:</span> <strong style={{ color: '#0f172a' }}>{analysisData.tema || 'Alinhamento Geral'}</strong></div>
                    <div><span style={{ color: '#64748b' }}>Cliente / Segmento:</span> <strong style={{ color: '#0f172a' }}>{clientName} ({segmentName})</strong></div>
                    <div><span style={{ color: '#64748b' }}>Nível de Urgência:</span> <strong style={{ color: urgencyStr === 'Crítica' || urgencyStr === 'Alta' ? '#dc2626' : '#2563eb' }}>{urgencyStr}</strong></div>
                  </div>

                  {/* 1. Resumo para Tomada de Decisão */}
                  <div style={{ marginBottom: '1.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '4px solid #16a34a', padding: '14px 16px', borderRadius: '4px' }}>
                    <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#166534', margin: '0 0 6px 0', fontWeight: 700 }}>
                      1. Resumo para Tomada de Decisão
                    </h3>
                    <p style={{ fontSize: '12.5px', color: '#14532d', margin: 0, lineHeight: '1.6' }}>
                      {execSummary.summary_for_decision || 'A sessão deliberou sobre os direcionamentos estratégicos e alinhamentos operacionais prioritários.'}
                    </p>
                  </div>

                  {/* 2 & 3: Situação Atual e Impacto para o Negócio (2 Colunas) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '1.5rem' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 14px', borderRadius: '6px' }}>
                      <h4 style={{ fontSize: '12.5px', textTransform: 'uppercase', color: '#334155', margin: '0 0 6px 0', fontWeight: 700 }}>
                        2. Situação Atual
                      </h4>
                      <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>
                        {execSummary.current_situation || 'Operação em andamento regular sem ocorrências de bloqueios críticos na sessão.'}
                      </p>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 14px', borderRadius: '6px' }}>
                      <h4 style={{ fontSize: '12.5px', textTransform: 'uppercase', color: '#334155', margin: '0 0 6px 0', fontWeight: 700 }}>
                        3. Impacto para o Negócio
                      </h4>
                      <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>
                        {execSummary.business_impact || 'Impacto operacional controlado dentro dos parâmetros regulares da operação.'}
                      </p>
                    </div>
                  </div>

                  {/* 4. Riscos Principais */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#b91c1c', borderBottom: '2px solid #fee2e2', paddingBottom: '4px', marginBottom: '10px', fontWeight: 700 }}>
                      4. Riscos Principais & Pontos Críticos
                    </h3>
                    {mainRisks.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {mainRisks.map((r, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '8px 12px', fontSize: '12px' }}>
                            <div style={{ color: '#991b1b', flex: 1, paddingRight: '10px' }}>
                              • {r.text}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px', background: r.severity === 'Crítica' || r.severity === 'Alta' ? '#fee2e2' : '#f1f5f9', color: r.severity === 'Crítica' || r.severity === 'Alta' ? '#991b1b' : '#475569' }}>
                                {r.severity}
                              </span>
                              {r.source_refs?.length > 0 && (
                                <span style={{ fontSize: '9.5px', color: '#94a3b8' }}>[{r.source_refs.join(', ')}]</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                        • Nenhum risco crítico identificado na sessão.
                      </div>
                    )}
                  </div>

                  {/* 5 & 6: Decisões Tomadas vs Decisões Necessárias (2 Colunas) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '1.5rem' }}>
                    {/* 5. Decisões Tomadas */}
                    <div style={{ background: '#f0fdf4', border: '1px solid #dcfce7', padding: '12px 14px', borderRadius: '6px' }}>
                      <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#166534', margin: '0 0 8px 0', fontWeight: 700 }}>
                        5. Decisões Tomadas na Sessão
                      </h4>
                      {decisionsMade.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#14532d' }}>
                          {decisionsMade.map((d, idx) => (
                            <li key={idx} style={{ marginBottom: '4px' }}>{d.text}</li>
                          ))}
                        </ul>
                      ) : (
                        <div style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic' }}>
                          Nenhuma decisão final formalizada na sessão.
                        </div>
                      )}
                    </div>

                    {/* 6. Decisões Necessárias da Liderança */}
                    <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px 14px', borderRadius: '6px' }}>
                      <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: '#92400e', margin: '0 0 8px 0', fontWeight: 700 }}>
                        6. Decisões Necessárias da Liderança
                      </h4>
                      {decisionsRequired.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#78350f' }}>
                          {decisionsRequired.map((dr, idx) => (
                            <li key={idx} style={{ marginBottom: '6px' }}>
                              <strong>[{dr.owner_level || 'Liderança'}]:</strong> {dr.text}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div style={{ fontSize: '11.5px', color: '#64748b', fontStyle: 'italic' }}>
                          Nenhuma decisão pendente de escalonamento.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 7. Próximos Passos Estratégicos */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '13px', textTransform: 'uppercase', color: '#0284c7', borderBottom: '2px solid #e0f2fe', paddingBottom: '4px', marginBottom: '10px', fontWeight: 700 }}>
                      7. Próximos Passos Estratégicos
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {strategicNextSteps.map((sns, idx) => (
                        <div key={idx} style={{ fontSize: '12px', color: '#0369a1', background: '#f0f9ff', padding: '7px 12px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                          <strong>{idx + 1}.</strong> {sns.text}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 8. Recomendação TOTVS & Ecossistema */}
                  {execRec && (
                    <div style={{ marginBottom: '1.5rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <h4 style={{ fontSize: '12.5px', textTransform: 'uppercase', color: '#0f172a', margin: 0, fontWeight: 700 }}>
                          8. Recomendação TOTVS: {execRec.product_name}
                        </h4>
                        <span style={{ fontSize: '10.5px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: execRec.status.includes('Confirmado') ? '#dcfce7' : '#fef3c7', color: execRec.status.includes('Confirmado') ? '#166534' : '#92400e' }}>
                          {execRec.status}
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 6px 0' }}>{execRec.reason}</p>
                      {execRec.expected_benefits?.length > 0 && (
                        <div style={{ fontSize: '11.5px', color: '#334155' }}>
                          <strong>Benefícios esperados:</strong> {execRec.expected_benefits.join(' • ')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 9. Informações Faltantes / Pendências */}
                  {missingInfo.length > 0 && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '4px', padding: '8px 12px', fontSize: '11px', color: '#991b1b', marginBottom: '1.5rem' }}>
                      <strong>Pontos Não Identificados na Sessão:</strong> {missingInfo.join(' • ')}
                    </div>
                  )}

                  {/* Traceability Footer */}
                  <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                    Documento gerado pelo Proton Flow v2.1 • O plano operacional detalhado com todas as tarefas, prazos e evidências técnicas está disponível na <strong>Ata Operacional</strong>.
                  </div>
                </div>
              ) : (
                /* ==================== 2. ATA OPERACIONAL (EXECUÇÃO) ==================== */
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
                        ATA OPERACIONAL DE REUNIÃO
                      </h2>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                        Proton Flow v2.1 • Detalhamento Operacional, Tarefas & Ecossistema TOTVS
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
                      2. Contexto Operacional da Sessão
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
                      <div><strong>Ações Mapeadas:</strong> {confirmedTasks.length} {confirmedTasks.length === 1 ? 'confirmada' : 'confirmadas'}{pendingTasks.length > 0 ? ` + ${pendingTasks.length} ${pendingTasks.length === 1 ? 'pendente' : 'pendentes'}` : ''}</div>
                    </div>
                  </div>

                  {/* Footer disclaimer */}
                  <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', fontSize: '10.5px', color: '#64748b', textAlign: 'center' }}>
                    Documento gerado pelo Proton Flow v2.1 • TOTVS Reuniões Inteligentes (Ata Operacional)
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
