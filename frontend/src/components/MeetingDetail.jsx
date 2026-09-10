import React, { useState } from 'react';
import ActionPlanTable from './ActionPlanTable';
import TotvsProductRecommendations from './TotvsProductRecommendations';
import MeetingFieldSuggestions from './MeetingFieldSuggestions';
import {
  FileText,
  FileSpreadsheet,
  Eye,
  FileDown,
  Download,
  CheckSquare,
  Layers,
  AlertTriangle,
  Zap,
  User
} from 'lucide-react';

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
  const [activeSubTab, setActiveSubTab] = useState('resumo');

  if (!meeting) return null;

  const resumo = meeting.RESUMO_IA;
  const _execSummary = meeting.RESUMO_EXECUTIVO || (resumo && resumo.resumo_executivo) || {};
  const suggestions = meeting.field_suggestions || (resumo && resumo.field_suggestions) || {};
  const recomendacoes = meeting.recomendacoes_totvs || resumo?.recomendacoes_totvs || [];
  const tarefas = resumo?.tarefas || [];
  const dores = resumo?.dores || [];

  const tarefasCount = tarefas.length;
  const totvsCount = recomendacoes.length;
  const doresCount = dores.length;
  const sugestoesCount = Object.keys(suggestions).length;

  return (
    <div style={{ background: 'var(--panel-bg)', borderRadius: '8px', padding: '1.25rem', border: '1px solid var(--border-color)' }}>
      {resumo ? (
        <>
          {/* Barra de Sub-Navegação por Abas Executivas (Progressive Disclosure) */}
          <div className="subtabs-bar">
            <button
              onClick={() => setActiveSubTab('resumo')}
              className={`subtab-pill ${activeSubTab === 'resumo' ? 'active' : ''}`}
              title="Atas de Reunião e Síntese Executiva"
            >
              <FileText size={13} />
              <span>Atas & Resumo</span>
            </button>

            {tarefasCount > 0 && (
              <button
                onClick={() => setActiveSubTab('tarefas')}
                className={`subtab-pill ${activeSubTab === 'tarefas' ? 'active' : ''}`}
                title="Plano de Ação Operacional"
              >
                <CheckSquare size={13} />
                <span>Plano de Ação</span>
                <span className="subtab-badge">{tarefasCount}</span>
              </button>
            )}

            {totvsCount > 0 && (
              <button
                onClick={() => setActiveSubTab('totvs')}
                className={`subtab-pill ${activeSubTab === 'totvs' ? 'active' : ''}`}
                title="Recomendações e Integrações TOTVS"
              >
                <Layers size={13} />
                <span>Produtos TOTVS</span>
                <span className="subtab-badge">{totvsCount}</span>
              </button>
            )}

            {doresCount > 0 && (
              <button
                onClick={() => setActiveSubTab('dores')}
                className={`subtab-pill ${activeSubTab === 'dores' ? 'active' : ''}`}
                title="Gargalos e Dores Mapeadas pela IA"
              >
                <AlertTriangle size={13} />
                <span>Dores & Gargalos</span>
                <span className="subtab-badge">{doresCount}</span>
              </button>
            )}

            {sugestoesCount > 0 && (
              <button
                onClick={() => setActiveSubTab('sugestoes')}
                className={`subtab-pill ${activeSubTab === 'sugestoes' ? 'active' : ''}`}
                title="Sugestões de Campos e Metadados Inteligentes"
              >
                <Zap size={13} />
                <span>Metadados IA</span>
                <span className="subtab-badge">{sugestoesCount}</span>
              </button>
            )}
          </div>

          {/* ABA 1: ATAS & RESUMO */}
          {activeSubTab === 'resumo' && (
            <div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: '12px',
                marginBottom: resumo.perfil_cliente ? '1.25rem' : '0'
              }}>
                {/* Card 1: Ata Executiva */}
                <div style={{
                  background: 'var(--panel-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                  boxShadow: 'var(--glass-shadow)'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={16} color="var(--primary-color)" />
                        <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>Ata Executiva de Reunião</strong>
                      </div>
                      <span style={{ fontSize: '10.5px', background: 'rgba(2, 132, 199, 0.12)', color: 'var(--primary-light)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, border: '1px solid var(--primary-color)' }}>
                        1-2 Páginas • Liderança
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      Síntese de alto nível para tomada de decisão: situação, impacto, riscos, decisões e próximos passos.
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => onOpenDocumentViewer && onOpenDocumentViewer(meeting, 'executive', 'pdf')}
                      className="btn-pf btn-pf-primary btn-pf-sm"
                      title="Abrir Ata Executiva no visualizador integrado"
                    >
                      <Eye size={13} />
                      <span>Abrir Executiva</span>
                    </button>
                    <button
                      onClick={() => onDownloadExecutivePdf && onDownloadExecutivePdf(meeting)}
                      className="btn-pf btn-pf-secondary btn-pf-sm"
                      title="Baixar arquivo PDF da Ata Executiva"
                    >
                      <FileDown size={13} />
                      <span>PDF</span>
                    </button>
                    <button
                      onClick={() => onDownloadExecutiveDocx && onDownloadExecutiveDocx(meeting)}
                      className="btn-pf btn-pf-secondary btn-pf-sm"
                      title="Baixar arquivo Word (DOCX) da Ata Executiva"
                    >
                      <Download size={13} />
                      <span>DOCX</span>
                    </button>
                  </div>
                </div>

                {/* Card 2: Ata Operacional */}
                <div style={{
                  background: 'var(--panel-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                  boxShadow: 'var(--glass-shadow)'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileSpreadsheet size={16} color="var(--text-secondary)" />
                        <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>Ata Operacional Detalhada</strong>
                      </div>
                      <span style={{ fontSize: '10.5px', background: 'rgba(100, 116, 139, 0.15)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, border: '1px solid var(--border-color)' }}>
                        Completa • Execução
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      Detalhamento técnico com tarefas, responsáveis, prazos, evidências literais e catálogo TOTVS.
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => onOpenDocumentViewer && onOpenDocumentViewer(meeting, 'operational', 'pdf')}
                      className="btn-pf btn-pf-executive btn-pf-sm"
                      title="Abrir Ata Operacional no visualizador integrado"
                    >
                      <Eye size={13} />
                      <span>Abrir Operacional</span>
                    </button>
                    <button
                      onClick={() => onDownloadOperationalPdf && onDownloadOperationalPdf(meeting)}
                      className="btn-pf btn-pf-secondary btn-pf-sm"
                      title="Baixar arquivo PDF da Ata Operacional"
                    >
                      <FileDown size={13} />
                      <span>PDF</span>
                    </button>
                    <button
                      onClick={() => onDownloadOperationalDocx && onDownloadOperationalDocx(meeting)}
                      className="btn-pf btn-pf-secondary btn-pf-sm"
                      title="Baixar arquivo Word (DOCX) da Ata Operacional"
                    >
                      <Download size={13} />
                      <span>DOCX</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Perfil do Cliente */}
              {resumo.perfil_cliente && resumo.perfil_cliente.reunioes?.length > 0 && (
                <div style={{
                  background: 'var(--panel-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '1.2rem',
                  boxShadow: 'var(--glass-shadow)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <User size={18} color="var(--primary-color)" />
                    <h4 style={{ margin: 0, color: 'var(--primary-color)', fontSize: '0.95rem' }}>
                      Perfil do Cliente — Histórico e Contexto
                    </h4>
                  </div>
                  <div style={{ display: 'flex', gap: '20px', fontSize: '0.85rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                    <span>Reuniões Anteriores: <strong style={{ color: 'var(--text-main)' }}>{resumo.perfil_cliente.total_reunioes || 0}</strong></span>
                    <span>Dores Recorrentes: <strong style={{ color: 'var(--text-main)' }}>{Object.keys(resumo.perfil_cliente.dores_recorrentes || {}).length} mapeadas</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA 2: PLANO DE AÇÃO */}
          {activeSubTab === 'tarefas' && (
            <div>
              <ActionPlanTable
                meetingId={meeting.ID_MEETING}
                tarefas={tarefas}
                onTaskStatusChange={onTaskStatusChange}
              />
            </div>
          )}

          {/* ABA 3: PRODUTOS TOTVS */}
          {activeSubTab === 'totvs' && (
            <div>
              <TotvsProductRecommendations
                meetingId={meeting.ID_MEETING}
                recommendations={recomendacoes}
                sistemasTotvs={sistemasTotvs}
                enviosPorReuniao={enviosPorReuniao}
                onConfirmRecommendation={onConfirmRecommendation}
                onEnviarIntegracao={onEnviarIntegracao}
                onOpenConfig={onOpenConfig}
                tarefas={tarefas}
              />
            </div>
          )}

          {/* ABA 4: DORES & GARGALOS */}
          {activeSubTab === 'dores' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.8rem' }}>
                <AlertTriangle size={18} color="var(--danger)" />
                <h4 style={{ margin: 0, color: 'var(--danger)', fontSize: '0.95rem' }}>
                  Gargalos e Dores Mapeadas pela IA ({doresCount})
                </h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {dores.map((d, idx) => {
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
                        <strong style={{ color: 'var(--danger)' }}>{label}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Severidade: {sev}</span>
                      </div>
                      {trecho && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>"{trecho}"</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ABA 5: METADADOS IA */}
          {activeSubTab === 'sugestoes' && (
            <div>
              <MeetingFieldSuggestions
                meetingId={meeting.ID_MEETING}
                suggestions={suggestions}
                onConfirmSuggestion={onConfirmSuggestion}
              />
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Esta reunião ainda não foi analisada. Clique no botão Analisar na tabela acima para processar com IA.
        </div>
      )}
    </div>
  );
}
