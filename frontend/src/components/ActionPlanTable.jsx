import React, { useState, useMemo } from 'react';
import { Calendar, AlertCircle, Clock } from 'lucide-react';

export default function ActionPlanTable({
  meetingId,
  tarefas = [],
  _dores = [],
  onTaskStatusChange
}) {
  const [sortField, setSortField] = useState('prazo');
  const [sortAsc, setSortAsc] = useState(true);

  const todayStr = new Date().toISOString().split('T')[0];

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedTarefas = useMemo(() => {
    if (!tarefas || tarefas.length === 0) return [];
    const list = [...tarefas];

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
  }, [tarefas, sortField, sortAsc]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
        <h4 style={{ margin: 0, color: 'var(--primary-color)' }}>Plano de Ação e Tarefas</h4>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {tarefas.length} ação(ões) mapeada(s)
        </div>
      </div>

      {tarefas && tarefas.length > 0 ? (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
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
                <th style={{ padding: '10px 12px' }}>Ação / Tarefa</th>
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
              </tr>
            </thead>
            <tbody>
              {sortedTarefas.map((tarefa, tIndex) => {
                const parseStatus = tarefa.prazo_parse_status || (tarefa.prazo_iso ? 'parsed' : (tarefa.prazo && tarefa.prazo !== 'Não mencionado' ? 'ambiguous' : 'not_mentioned'));
                const prazoIso = tarefa.prazo_iso;
                const prioridade = tarefa.prioridade || 'Média';
                const isOverdue = Boolean(prazoIso && prazoIso.substring(0, 10) < todayStr && tarefa.status !== 'Concluído');

                return (
                  <tr
                    key={tIndex}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: isOverdue ? 'rgba(239, 68, 68, 0.04)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '10px 12px', color: 'var(--text-main)', maxWidth: '350px' }}>
                      <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span>{tarefa.tarefa}</span>
                        {tarefa.task_validation_status === 'pending_review' && (
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: 'var(--warning)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }} title="Sugestão pendente de revisão humana (não confirmada)">
                            <Clock size={10} />
                            <span>Sugestão pendente</span>
                          </span>
                        )}
                      </div>
                      {tarefa.evidence && tarefa.evidence !== tarefa.tarefa && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                          "{tarefa.evidence}"
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                      {tarefa.responsavel === 'Não identificado' ? (
                        <span style={{ color: 'var(--warning)', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertCircle size={12} />
                          <span>Não identificado</span>
                        </span>
                      ) : (
                        tarefa.responsavel || 'Não identificado'
                      )}
                    </td>

                    <td style={{ padding: '10px 12px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
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
                    </td>

                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
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
                    </td>

                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <select
                        className={`table-select-pf ${
                          tarefa.status === 'Concluído' ? 'task-concluido' :
                          tarefa.status === 'Em Andamento' ? 'task-andamento' :
                          'task-pendente'
                        }`}
                        value={tarefa.status || 'Não Inicializado'}
                        onChange={(e) => onTaskStatusChange && onTaskStatusChange(meetingId, tIndex, e.target.value)}
                        title="Alterar status da tarefa"
                      >
                        <option value="Não Inicializado">Não Inicializado</option>
                        <option value="Em Andamento">Em Andamento</option>
                        <option value="Concluído">Concluído</option>
                      </select>
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
