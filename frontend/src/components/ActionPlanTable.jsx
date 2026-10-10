import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, AlertCircle, Clock, CheckCircle2, Edit3, XCircle, VolumeX, Check, X, Quote } from 'lucide-react';
import { api } from '../api/client';

export default function ActionPlanTable({
  meetingId,
  tarefas = [],
  _dores = [],
  onTaskStatusChange
}) {
  const [sortField, setSortField] = useState('prazo');
  const [sortAsc, setSortAsc] = useState(true);
  const [localTarefas, setLocalTarefas] = useState(tarefas);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editForm, setEditForm] = useState({
    tarefa: '',
    responsavel: '',
    prazo: '',
    prioridade: 'Média',
    reason: ''
  });

  useEffect(() => {
    setLocalTarefas(tarefas);
  }, [tarefas]);

  const todayStr = new Date().toISOString().split('T')[0];

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleReview = async (index, action, payload = null, reason = '') => {
    try {
      const res = await api.reviewTask(meetingId, {
        item_index: index,
        action,
        edited_payload: payload,
        reason: reason || (action === 'confirmed' ? 'Confirmado pelo usuário' : action === 'rejected' ? 'Rejeitado pelo usuário' : action === 'marked_noise' ? 'Marcado como ruído' : ''),
        reviewer: 'human_reviewer'
      });
      if (res && res.task) {
        setLocalTarefas((prev) =>
          prev.map((t, i) => (i === index ? { ...t, ...res.task, review_status: action } : t))
        );
      } else {
        setLocalTarefas((prev) =>
          prev.map((t, i) => (i === index ? { ...t, review_status: action, ...(payload || {}) } : t))
        );
      }
    } catch (err) {
      console.warn('Erro ao registrar revisão de tarefa:', err);
    }
  };

  const startEdit = (t, origIndex) => {
    setEditingIndex(origIndex);
    setEditForm({
      tarefa: t.tarefa || '',
      responsavel: t.responsavel || '',
      prazo: t.prazo || '',
      prioridade: t.prioridade || 'Média',
      reason: ''
    });
  };

  const saveEdit = async (origIndex) => {
    await handleReview(
      origIndex,
      'edited',
      {
        tarefa: editForm.tarefa,
        responsavel: editForm.responsavel,
        prazo: editForm.prazo,
        prioridade: editForm.prioridade
      },
      editForm.reason || 'Edição manual de tarefa'
    );
    setEditingIndex(null);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
  };

  const sortedTarefas = useMemo(() => {
    if (!localTarefas || localTarefas.length === 0) return [];
    const list = localTarefas.map((t, origIdx) => ({ ...t, _origIndex: origIdx }));

    list.sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortField === 'prazo') {
        valA = a.prazo_iso || a.prazo || '9999-99-99';
        valB = b.prazo_iso || b.prazo || '9999-99-99';
      } else if (sortField === 'prioridade') {
        const pOrder = { 'Crítica': 4, 'Alta': 3, 'Média': 2, 'Baixa': 1 };
        valA = pOrder[a.prioridade] || 2;
        valB = pOrder[b.prioridade] || 2;
        return sortAsc ? valB - valA : valA - valB;
      } else if (sortField === 'status') {
        const sOrder = { 'Não Inicializado': 1, 'Em Andamento': 2, 'Concluído': 3 };
        valA = sOrder[a.status] || 1;
        valB = sOrder[b.status] || 1;
        return sortAsc ? valA - valB : valB - valA;
      } else if (sortField === 'responsavel') {
        valA = (a.responsavel || '').toLowerCase();
        valB = (b.responsavel || '').toLowerCase();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [localTarefas, sortField, sortAsc]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <h4 style={{ margin: 0, color: 'var(--primary-color)' }}>Plano de Ação e Tarefas</h4>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {localTarefas.length} {localTarefas.length === 1 ? 'ação mapeada' : 'ações mapeadas'}
        </div>
      </div>

      {localTarefas && localTarefas.length > 0 ? (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <table style={{ width: '100%', minWidth: '780px', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{
                position: 'sticky',
                top: 0,
                background: 'var(--panel-bg)',
                borderBottom: '1px solid var(--border-color)',
                textAlign: 'left',
                color: 'var(--text-muted)',
                zIndex: 2
              }}>
                <th style={{ padding: '10px 12px' }}>Ação / Tarefa & Evidência</th>
                <th
                  onClick={() => handleSort('responsavel')}
                  style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por responsável"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    Responsável
                    {sortField === 'responsavel' && (
                      <span style={{ color: 'var(--primary-color)', fontSize: '10px', fontWeight: 700 }}>{sortAsc ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('prazo')}
                  style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por prazo"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    Prazo & SLA
                    {sortField === 'prazo' && (
                      <span style={{ color: 'var(--primary-color)', fontSize: '10px', fontWeight: 700 }}>{sortAsc ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('prioridade')}
                  style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por prioridade"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    Prioridade
                    {sortField === 'prioridade' && (
                      <span style={{ color: 'var(--primary-color)', fontSize: '10px', fontWeight: 700 }}>{sortAsc ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por status"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    Status
                    {sortField === 'status' && (
                      <span style={{ color: 'var(--primary-color)', fontSize: '10px', fontWeight: 700 }}>{sortAsc ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
                <th style={{ padding: '10px 12px', minWidth: '170px' }}>Revisão Humana (Feedback)</th>
              </tr>
            </thead>
            <tbody>
              {sortedTarefas.map((tarefa) => {
                const origIdx = tarefa._origIndex;
                const isEditing = editingIndex === origIdx;
                const parseStatus = tarefa.prazo_parse_status || (tarefa.prazo_iso ? 'parsed' : (tarefa.prazo && tarefa.prazo !== 'Não mencionado' ? 'ambiguous' : 'not_mentioned'));
                const prazoIso = tarefa.prazo_iso;
                const prioridade = tarefa.prioridade || 'Média';
                const isOverdue = Boolean(prazoIso && prazoIso.substring(0, 10) < todayStr && tarefa.status !== 'Concluído');
                const reviewStatus = tarefa.review_status || tarefa.task_validation_status;

                return (
                  <tr
                    key={origIdx}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: reviewStatus === 'rejected' ? 'rgba(239, 68, 68, 0.08)' :
                                  reviewStatus === 'marked_noise' ? 'rgba(245, 158, 11, 0.08)' :
                                  reviewStatus === 'confirmed' ? 'rgba(16, 185, 129, 0.05)' :
                                  isOverdue ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                      opacity: reviewStatus === 'rejected' ? 0.6 : 1
                    }}
                  >
                    <td style={{ padding: '10px 12px', color: 'var(--text-main)', maxWidth: '320px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <input
                            type="text"
                            value={editForm.tarefa}
                            onChange={(e) => setEditForm({ ...editForm, tarefa: e.target.value })}
                            placeholder="Descrição da tarefa"
                            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '12px' }}
                          />
                          <input
                            type="text"
                            value={editForm.reason}
                            onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                            placeholder="Motivo da alteração (opcional)"
                            style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-muted)', fontSize: '11px' }}
                          />
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ textDecoration: reviewStatus === 'rejected' ? 'line-through' : 'none' }}>
                              {tarefa.tarefa}
                            </span>
                            {reviewStatus === 'confirmed' && (
                              <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                ✓ Confirmado
                              </span>
                            )}
                            {reviewStatus === 'edited' && (
                              <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--primary-color)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                                ✏️ Editado
                              </span>
                            )}
                            {reviewStatus === 'rejected' && (
                              <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                ✗ Rejeitado
                              </span>
                            )}
                            {reviewStatus === 'marked_noise' && (
                              <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                🔇 Ruído
                              </span>
                            )}
                            {(!reviewStatus || reviewStatus === 'pending_review') && (
                              <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                Sugestão pendente
                              </span>
                            )}
                          </div>
                          {(tarefa.evidence || tarefa.evidence_quote) && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Quote size={10} style={{ flexShrink: 0 }} />
                              <span>"{tarefa.evidence || tarefa.evidence_quote}"</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.responsavel}
                          onChange={(e) => setEditForm({ ...editForm, responsavel: e.target.value })}
                          placeholder="Responsável"
                          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '12px' }}
                        />
                      ) : tarefa.responsavel === 'Não identificado' ? (
                        <span style={{ color: 'var(--warning)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertCircle size={12} />
                          <span>Não identificado</span>
                        </span>
                      ) : (
                        tarefa.responsavel || 'Não identificado'
                      )}
                    </td>

                    <td style={{ padding: '10px 12px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.prazo}
                          onChange={(e) => setEditForm({ ...editForm, prazo: e.target.value })}
                          placeholder="Prazo"
                          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '12px' }}
                        />
                      ) : (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{tarefa.prazo || 'Não mencionado'}</span>
                            {isOverdue && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '3px',
                                background: 'rgba(239, 68, 68, 0.2)',
                                color: 'var(--danger)',
                                border: '1px solid var(--danger)'
                              }}>
                                VENCIDA
                              </span>
                            )}
                          </div>

                          {prazoIso && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: isOverdue ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: isOverdue ? 'var(--danger)' : 'var(--success)',
                              marginTop: '2px'
                            }}>
                              <Calendar size={10} />
                              <span>{prazoIso}</span>
                            </div>
                          )}
                          {parseStatus === 'ambiguous' && !prazoIso && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: 'var(--warning)',
                              marginTop: '2px'
                            }}>
                              <AlertCircle size={10} />
                              <span>Prazo textual relativo</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <select
                          value={editForm.prioridade}
                          onChange={(e) => setEditForm({ ...editForm, prioridade: e.target.value })}
                          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '12px' }}
                        >
                          <option value="Crítica">Crítica</option>
                          <option value="Alta">Alta</option>
                          <option value="Média">Média</option>
                          <option value="Baixa">Baixa</option>
                        </select>
                      ) : (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: prioridade === 'Crítica' ? 'rgba(239, 68, 68, 0.15)' : prioridade === 'Alta' ? 'rgba(245, 158, 11, 0.15)' : 'var(--panel-hover)',
                          border: `1px solid ${prioridade === 'Crítica' ? 'rgba(239, 68, 68, 0.3)' : prioridade === 'Alta' ? 'rgba(245, 158, 11, 0.3)' : 'var(--border-color)'}`,
                          color: prioridade === 'Crítica' ? 'var(--danger)' : prioridade === 'Alta' ? 'var(--warning)' : 'var(--text-main)'
                        }}>
                          {prioridade}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <select
                        className={`table-select-pf ${
                          tarefa.status === 'Concluído' ? 'task-concluido' :
                          tarefa.status === 'Em Andamento' ? 'task-andamento' :
                          'task-pendente'
                        }`}
                        value={tarefa.status || 'Não Inicializado'}
                        onChange={(e) => onTaskStatusChange && onTaskStatusChange(meetingId, origIdx, e.target.value)}
                        title="Alterar status da tarefa"
                      >
                        <option value="Não Inicializado">Não Inicializado</option>
                        <option value="Em Andamento">Em Andamento</option>
                        <option value="Concluído">Concluído</option>
                      </select>
                    </td>

                    {/* Coluna de Revisão Humana (Feedback Auditável) */}
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => saveEdit(origIdx)}
                            className="btn-pf btn-pf-primary btn-pf-sm"
                            style={{ fontSize: '11px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Salvar alterações"
                          >
                            <Check size={12} /> Salvar
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="btn-pf btn-pf-secondary btn-pf-sm"
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                            title="Cancelar edição"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => handleReview(origIdx, 'confirmed')}
                            className="btn-pf btn-pf-secondary btn-pf-sm"
                            style={{
                              fontSize: '11px',
                              padding: '3px 6px',
                              borderColor: reviewStatus === 'confirmed' ? 'var(--success)' : 'var(--border-color)',
                              color: reviewStatus === 'confirmed' ? 'var(--success)' : 'var(--text-main)'
                            }}
                            title="Confirmar sugestão da IA"
                          >
                            <CheckCircle2 size={13} color={reviewStatus === 'confirmed' ? '#10b981' : undefined} />
                          </button>

                          <button
                            type="button"
                            onClick={() => startEdit(tarefa, origIdx)}
                            className="btn-pf btn-pf-secondary btn-pf-sm"
                            style={{ fontSize: '11px', padding: '3px 6px' }}
                            title="Editar sugestão"
                          >
                            <Edit3 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleReview(origIdx, 'rejected')}
                            className="btn-pf btn-pf-secondary btn-pf-sm"
                            style={{
                              fontSize: '11px',
                              padding: '3px 6px',
                              borderColor: reviewStatus === 'rejected' ? 'var(--danger)' : 'var(--border-color)',
                              color: reviewStatus === 'rejected' ? 'var(--danger)' : 'var(--text-main)'
                            }}
                            title="Rejeitar sugestão"
                          >
                            <XCircle size={13} color={reviewStatus === 'rejected' ? '#ef4444' : undefined} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleReview(origIdx, 'marked_noise')}
                            className="btn-pf btn-pf-secondary btn-pf-sm"
                            style={{
                              fontSize: '11px',
                              padding: '3px 6px',
                              borderColor: reviewStatus === 'marked_noise' ? 'var(--warning)' : 'var(--border-color)',
                              color: reviewStatus === 'marked_noise' ? 'var(--warning)' : 'var(--text-main)'
                            }}
                            title="Marcar como ruído de fala"
                          >
                            <VolumeX size={13} color={reviewStatus === 'marked_noise' ? '#f59e0b' : undefined} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Nenhuma tarefa gerada para este plano de ação.
        </p>
      )}
    </div>
  );
}
