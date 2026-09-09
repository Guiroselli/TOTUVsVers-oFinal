import React from 'react';
import ActionPlanTable from './ActionPlanTable';
import TotvsProductRecommendations from './TotvsProductRecommendations';
import MeetingFieldSuggestions from './MeetingFieldSuggestions';

export default function MeetingDetail({
  meeting,
  sistemasTotvs,
  enviosPorReuniao,
  onConfirmSuggestion,
  onConfirmRecommendation,
  onTaskStatusChange,
  onEnviarIntegracao,
  onOpenConfig,
  onOpenDocumentViewer,
  onDownloadOperationalPdf,
  onDownloadOperationalDocx,
  onDownloadExecutivePdf,
  onDownloadExecutiveDocx
}) {
  if (!meeting) return null;

  const resumo = meeting.RESUMO_IA;
  const _execSummary = meeting.RESUMO_EXECUTIVO || (resumo && resumo.resumo_executivo) || {};
  const suggestions = meeting.field_suggestions || (resumo && resumo.field_suggestions) || {};

  return (
    <div style={{ background: 'var(--panel-bg)', borderRadius: '8px', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
      {resumo ? (
        <>
          {/* Barra de Ações de Documentos (Executiva vs Operacional) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: '12px',
            marginBottom: '1.5rem'
          }}>
            {/* Card 1: Ata Executiva */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0, 210, 255, 0.08), rgba(0, 210, 255, 0.02))',
              border: '1px solid rgba(0, 210, 255, 0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px' }}>👔</span>
                    <strong style={{ fontSize: '13px', color: 'var(--primary-color)' }}>Ata Executiva de Reunião</strong>
                  </div>
                  <span style={{ fontSize: '10.5px', background: 'rgba(0, 210, 255, 0.15)', color: 'var(--primary-color)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                    1-2 Páginas • Liderança
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Síntese de alto nível para tomada de decisão: situação, impacto, riscos, decisões e próximos passos.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => onOpenDocumentViewer && onOpenDocumentViewer(meeting, 'executive', 'pdf')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'var(--primary-color)',
                    color: '#000',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  👁️ Abrir Executiva
                </button>
                <button
                  onClick={() => onDownloadExecutivePdf && onDownloadExecutivePdf(meeting)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(0, 210, 255, 0.15)',
                    border: '1px solid rgba(0, 210, 255, 0.35)',
                    color: 'var(--primary-color)',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  📥 PDF
                </button>
                <button
                  onClick={() => onDownloadExecutiveDocx && onDownloadExecutiveDocx(meeting)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    color: '#3b82f6',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  📥 DOCX
                </button>
              </div>
            </div>

            {/* Card 2: Ata Operacional */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02))',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px' }}>📋</span>
                    <strong style={{ fontSize: '13px', color: 'var(--success)' }}>Ata Operacional Detalhada</strong>
                  </div>
                  <span style={{ fontSize: '10.5px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                    Completa • Execução
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Detalhamento técnico com tarefas, responsáveis, prazos, evidências literais e catálogo TOTVS.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => onOpenDocumentViewer && onOpenDocumentViewer(meeting, 'operational', 'pdf')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: 'var(--success)',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  👁️ Abrir Operacional
                </button>
                <button
                  onClick={() => onDownloadOperationalPdf && onDownloadOperationalPdf(meeting)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#ef4444',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  📥 PDF
                </button>
                <button
                  onClick={() => onDownloadOperationalDocx && onDownloadOperationalDocx(meeting)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    color: '#10b981',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  📥 DOCX
                </button>
              </div>
            </div>
          </div>

          {/* SLIDE 11 — Perfil do Cliente */}
          {resumo.perfil_cliente && resumo.perfil_cliente.reunioes?.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,210,255,0.08), rgba(0,210,255,0.02))',
              border: '1px solid rgba(0,210,255,0.25)',
              borderRadius: '8px',
              padding: '1.2rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <h4 style={{ margin: 0, color: 'var(--primary-color)', fontSize: '0.95rem' }}>
                  Perfil do Cliente — Histórico e Contexto (Slide 11)
                </h4>
              </div>
              <div style={{ display: 'flex', gap: '20px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <span>Reuniões Anteriores: <strong style={{ color: 'var(--text-main)' }}>{resumo.perfil_cliente.total_reunioes || 0}</strong></span>
                <span>Dores Recorrentes: <strong style={{ color: 'var(--text-main)' }}>{Object.keys(resumo.perfil_cliente.dores_recorrentes || {}).length} mapeadas</strong></span>
              </div>
            </div>
          )}

          {/* SLIDE 1 — Sugestões de Campos Inteligentes */}
          {Object.keys(suggestions).length > 0 && (
            <MeetingFieldSuggestions
              meetingId={meeting.ID_MEETING}
              suggestions={suggestions}
              onConfirmSuggestion={onConfirmSuggestion}
            />
          )}

          {/* SLIDE 12 — Mapeamento de Dores Estruturadas */}
          {resumo.dores && resumo.dores.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.8rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <h4 style={{ margin: 0, color: '#ef4444', fontSize: '0.95rem' }}>
                  Gargalos e Dores Mapeadas pela IA (Slide 12)
                </h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {resumo.dores.map((d, idx) => {
                  const isObj = typeof d === 'object' && d !== null;
                  const label = isObj ? (d.label || d.categoria) : d;
                  const trecho = isObj ? (d.trecho || d.descricao || '') : '';
                  const sev = isObj ? (d.severidade || 'Média') : 'Média';
                  return (
                    <div key={idx} style={{
                      background: 'rgba(239, 68, 68, 0.06)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      fontSize: '0.85rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <strong style={{ color: '#ef4444' }}>{label}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Severidade: {sev}</span>
                      </div>
                      {trecho && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>"{trecho}"</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SLIDE 4 & 5 — Plano de Ação Operacional */}
          {resumo.tarefas && resumo.tarefas.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <ActionPlanTable
                meetingId={meeting.ID_MEETING}
                tarefas={resumo.tarefas}
                onTaskStatusChange={onTaskStatusChange}
              />
            </div>
          )}

          {/* SLIDE 13, 8, 9 & 10 — Recomendações e Integrações TOTVS */}
          <div style={{ marginTop: '1.5rem' }}>
            <TotvsProductRecommendations
              meetingId={meeting.ID_MEETING}
              recommendations={meeting.recomendacoes_totvs || resumo.recomendacoes_totvs || []}
              sistemasTotvs={sistemasTotvs}
              enviosPorReuniao={enviosPorReuniao}
              onConfirmRecommendation={onConfirmRecommendation}
              onEnviarIntegracao={onEnviarIntegracao}
              onOpenConfig={onOpenConfig}
            />
          </div>
        </>
      ) : (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Esta reunião ainda não foi analisada. Clique em "⚡ Analisar" na tabela para processar com IA.
        </div>
      )}
    </div>
  );
}
