import React, { useState, useEffect } from 'react';
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
  User,
  CheckCircle2,
  Edit3,
  XCircle,
  VolumeX,
  Check,
  X
} from 'lucide-react';
import { api } from '../api/client';

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
  const [localDores, setLocalDores] = useState([]);
  const [editingPainIndex, setEditingPainIndex] = useState(null);
  const [editingPainForm, setEditingPainForm] = useState({ label: '', severidade: 'Média', reason: '' });

  useEffect(() => {
    if (meeting?.RESUMO_IA?.dores) {
      setLocalDores(meeting.RESUMO_IA.dores);
    } else {
      setLocalDores([]);
    }
  }, [meeting]);

  if (!meeting) return null;

  const resumo = meeting.RESUMO_IA;
  const _execSummary = meeting.RESUMO_EXECUTIVO || (resumo && resumo.resumo_executivo) || {};
  const suggestions = meeting.field_suggestions || (resumo && resumo.field_suggestions) || {};
  const recomendacoes = meeting.recomendacoes_totvs || resumo?.recomendacoes_totvs || [];
  const tarefas = resumo?.tarefas || [];
  const dores = localDores.length > 0 ? localDores : (resumo?.dores || []);

  const tarefasCount = tarefas.length;
  const totvsCount = recomendacoes.length;
  const doresCount = dores.length;
  const sugestoesCount = Object.keys(suggestions).length;

  return (
    <div className="meeting-detail-root">
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
              <span>Atas & Síntese</span>
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

          {/* ABA 1: ATAS & SÍNTESE */}
          {activeSubTab === 'resumo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Síntese Executiva & Decisões Principais */}
              {(resumo.tema || _execSummary.situacao || _execSummary.decisoes?.length > 0 || resumo.decisoes?.length > 0) && (
                <div style={{
                  background: 'var(--panel-hover)',
                  border: '1px solid var(--border-color)',
                  borderLeft: '4px solid var(--primary-color)',
                  borderRadius: '8px',
                  padding: '12px 14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={14} color="var(--primary-color)" />
                      <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>
                        Síntese da Reunião
                      </strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>{tarefasCount} tarefas</span>
                      <span>•</span>
                      <span>{doresCount} dores</span>
                      <span>•</span>
                      <span>{totvsCount} TOTVS</span>
                    </div>
                  </div>

                  {resumo.tema && (
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                      {resumo.tema}
                    </div>
                  )}

                  {(_execSummary.situacao || resumo.resumo_executivo?.situacao) && (
                    <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                      {_execSummary.situacao || resumo.resumo_executivo?.situacao}
                    </p>
                  )}

                  {((_execSummary.decisoes && _execSummary.decisoes.length > 0) || (resumo.decisoes && resumo.decisoes.length > 0)) && (
                    <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary-color)', textTransform: 'uppercase' }}>
                        Decisões Tomadas:
                      </span>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '12px', color: 'var(--text-main)' }}>
                        {(_execSummary.decisoes || resumo.decisoes || []).slice(0, 3).map((d, dIdx) => (
                          <li key={dIdx} style={{ marginBottom: '2px' }}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Grid dos Cards de Ata */}
              <div className="meeting-atas-grid" style={{ marginBottom: resumo.perfil_cliente ? '4px' : '0' }}>
                {/* Card 1: Ata Executiva */}
                <div className="meeting-ata-card">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={16} color="var(--primary-color)" />
                        <strong style={{ fontSize: '13px', color: 'var(--text-main)' }}>Ata Executiva</strong>
                      </div>
                      <span style={{ fontSize: '10px', background: 'rgba(2, 132, 199, 0.12)', color: 'var(--primary-light)', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, border: '1px solid var(--primary-color)' }}>
                        1-2 Páginas • Liderança
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                      Síntese de alto nível para tomada de decisão: situação, impacto, riscos e decisões.
                    </p>
                  </div>

                  <div className="meeting-ata-actions">
                    <button
                      onClick={() => onOpenDocumentViewer && onOpenDocumentViewer(meeting, 'executive', 'pdf')}
                      className="btn-pf btn-pf-primary btn-pf-sm btn-ata-open"
                      title="Abrir Ata Executiva no visualizador integrado"
                    >
                      <Eye size={13} />
                      <span>Abrir Executiva</span>
                    </button>
                    <button
                      onClick={() => onDownloadExecutivePdf && onDownloadExecutivePdf(meeting)}
                      className="btn-pf btn-pf-secondary btn-pf-sm btn-ata-dl"
                      title="Baixar arquivo PDF da Ata Executiva"
                    >
                      <FileDown size={13} />
                      <span>PDF</span>
                    </button>
                    <button
                      onClick={() => onDownloadExecutiveDocx && onDownloadExecutiveDocx(meeting)}
                      className="btn-pf btn-pf-secondary btn-pf-sm btn-ata-dl"
                      title="Baixar arquivo Word (DOCX) da Ata Executiva"
                    >
                      <Download size={13} />
                      <span>DOCX</span>
                    </button>
                  </div>
                </div>

                {/* Card 2: Ata Operacional */}
                <div className="meeting-ata-card">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
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

                  <div className="meeting-ata-actions">
                    <button
                      onClick={() => onOpenDocumentViewer && onOpenDocumentViewer(meeting, 'operational', 'pdf')}
                      className="btn-pf btn-pf-executive btn-pf-sm btn-ata-open"
                      title="Abrir Ata Operacional no visualizador integrado"
                    >
                      <Eye size={13} />
                      <span>Abrir Operacional</span>
                    </button>
                    <button
                      onClick={() => onDownloadOperationalPdf && onDownloadOperationalPdf(meeting)}
                      className="btn-pf btn-pf-secondary btn-pf-sm btn-ata-dl"
                      title="Baixar arquivo PDF da Ata Operacional"
                    >
                      <FileDown size={13} />
                      <span>PDF</span>
                    </button>
                    <button
                      onClick={() => onDownloadOperationalDocx && onDownloadOperationalDocx(meeting)}
                      className="btn-pf btn-pf-secondary btn-pf-sm btn-ata-dl"
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
                  const reviewStatus = isObj ? d.review_status : null;
                  const isEditing = editingPainIndex === idx;

                  const handleSavePainEdit = async () => {
                    await handleReviewPain(idx, 'edited', {
                      label: editingPainForm.label || label,
                      severidade: editingPainForm.severidade || sev
                    }, editingPainForm.reason || 'Edição manual de dor');
                    setEditingPainIndex(null);
                  };

                  return (
                    <div key={idx} style={{
                      background: reviewStatus === 'rejected' ? 'rgba(239, 68, 68, 0.04)' :
                                  reviewStatus === 'marked_noise' ? 'rgba(245, 158, 11, 0.04)' :
                                  reviewStatus === 'confirmed' ? 'rgba(16, 185, 129, 0.04)' :
                                  'rgba(239, 68, 68, 0.06)',
                      border: `1px solid ${
                                  reviewStatus === 'rejected' ? 'rgba(239, 68, 68, 0.3)' :
                                  reviewStatus === 'marked_noise' ? 'rgba(245, 158, 11, 0.3)' :
                                  reviewStatus === 'confirmed' ? 'rgba(16, 185, 129, 0.3)' :
                                  'rgba(239, 68, 68, 0.2)'}`,
                      borderRadius: '6px',
                      padding: '10px 14px',
                      fontSize: '0.85rem',
                      opacity: reviewStatus === 'rejected' ? 0.6 : 1
                    }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <input
                            type="text"
                            value={editingPainForm.label}
                            onChange={(e) => setEditingPainForm({ ...editingPainForm, label: e.target.value })}
                            placeholder="Descrição da dor ou gargalo"
                            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '12px' }}
                          />
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <select
                              value={editingPainForm.severidade}
                              onChange={(e) => setEditingPainForm({ ...editingPainForm, severidade: e.target.value })}
                              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '12px' }}
                            >
                              <option value="Crítica">Crítica</option>
                              <option value="Alta">Alta</option>
                              <option value="Média">Média</option>
                              <option value="Baixa">Baixa</option>
                            </select>
                            <input
                              type="text"
                              value={editingPainForm.reason}
                              onChange={(e) => setEditingPainForm({ ...editingPainForm, reason: e.target.value })}
                              placeholder="Motivo da alteração"
                              style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-muted)', fontSize: '11px' }}
                            />
                            <button
                              type="button"
                              onClick={handleSavePainEdit}
                              className="btn-pf btn-pf-primary btn-pf-sm"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                            >
                              <Check size={12} /> Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPainIndex(null)}
                              className="btn-pf btn-pf-secondary btn-pf-sm"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <strong style={{ color: 'var(--danger)', textDecoration: reviewStatus === 'rejected' ? 'line-through' : 'none' }}>{label}</strong>
                              {reviewStatus === 'confirmed' && (
                                <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)' }}>
                                  ✓ Confirmada
                                </span>
                              )}
                              {reviewStatus === 'edited' && (
                                <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--primary-color)' }}>
                                  ✏️ Editada
                                </span>
                              )}
                              {reviewStatus === 'rejected' && (
                                <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)' }}>
                                  ✗ Rejeitada
                                </span>
                              )}
                              {reviewStatus === 'marked_noise' && (
                                <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)' }}>
                                  🔇 Ruído
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Severidade: {sev}</span>
                              <div style={{ display: 'inline-flex', gap: '3px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleReviewPain(idx, 'confirmed')}
                                  className="btn-pf btn-pf-secondary btn-pf-sm"
                                  style={{ padding: '2px 5px', fontSize: '10px' }}
                                  title="Confirmar dor"
                                >
                                  <CheckCircle2 size={12} color={reviewStatus === 'confirmed' ? '#10b981' : undefined} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingPainIndex(idx);
                                    setEditingPainForm({ label, severidade: sev, reason: '' });
                                  }}
                                  className="btn-pf btn-pf-secondary btn-pf-sm"
                                  style={{ padding: '2px 5px', fontSize: '10px' }}
                                  title="Editar dor"
                                >
                                  <Edit3 size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewPain(idx, 'rejected')}
                                  className="btn-pf btn-pf-secondary btn-pf-sm"
                                  style={{ padding: '2px 5px', fontSize: '10px' }}
                                  title="Rejeitar dor"
                                >
                                  <XCircle size={12} color={reviewStatus === 'rejected' ? '#ef4444' : undefined} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewPain(idx, 'marked_noise')}
                                  className="btn-pf btn-pf-secondary btn-pf-sm"
                                  style={{ padding: '2px 5px', fontSize: '10px' }}
                                  title="Marcar como ruído"
                                >
                                  <VolumeX size={12} color={reviewStatus === 'marked_noise' ? '#f59e0b' : undefined} />
                                </button>
                              </div>
                            </div>
                          </div>
                          {trecho && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '11.5px', marginTop: '2px' }}>"{trecho}"</div>}
                        </div>
                      )}
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
