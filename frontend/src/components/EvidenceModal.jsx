import React, { useState, useMemo } from 'react';
import {
  X,
  Check,
  ArrowRight,
  Calendar,
  AlertCircle,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Building2,
  Search,
  FileText,
  Copy
} from 'lucide-react';

/**
 * Mapeia os identificadores técnicos e enums em títulos e badges executivos.
 */
function getMetricDisplayInfo(metricType, metricKey) {
  const type = (metricType || '').toLowerCase();
  const key = (metricKey || '').toLowerCase();

  if (type === 'open_actions') {
    return {
      badge: 'Plano de Ação',
      title: 'Ações e Tarefas em Aberto',
      description: 'Reuniões com planos de ação pendentes de conclusão mapeados pela IA.',
      badgeVariant: 'primary'
    };
  }

  if (type === 'overdue_actions') {
    return {
      badge: 'SLA Crítico',
      title: 'Ações Vencidas fora do Prazo',
      description: 'Compromissos e entregas que ultrapassaram a data limite estipulada.',
      badgeVariant: 'danger'
    };
  }

  if (type === 'pain') {
    const formattedKey = (metricKey || 'Gargalos').replace(/_/g, ' ');
    return {
      badge: 'Gargalo Operacional',
      title: `Impedimentos: ${formattedKey.charAt(0).toUpperCase() + formattedKey.slice(1)}`,
      description: 'Reuniões onde dores recorrentes ou bloqueios de processos foram apontados.',
      badgeVariant: 'warning'
    };
  }

  if (type === 'topic') {
    return {
      badge: 'Tópico Estratégico',
      title: `Evidências de ${metricKey || 'Tema'}`,
      description: 'Reuniões com discussões e deliberações sobre este tema.',
      badgeVariant: 'primary'
    };
  }

  if (type === 'urgency') {
    const isCrit = key === 'crítica' || key === 'critica' || key === 'alta';
    return {
      badge: 'Nível de Urgência',
      title: `Reuniões com Prioridade ${metricKey || 'Definida'}`,
      description: 'Atas categorizadas sob esta faixa de criticidade executiva.',
      badgeVariant: isCrit ? 'danger' : 'warning'
    };
  }

  if (type === 'client') {
    return {
      badge: 'Conta / Segmento',
      title: `Histórico do Cliente: ${metricKey || 'Geral'}`,
      description: 'Atas e reuniões catalogadas para esta conta corporativa.',
      badgeVariant: 'primary'
    };
  }

  // Fallback humanizado
  const humanType = (metricType || 'Indicador').replace(/_/g, ' ').toUpperCase();
  const humanKey = (metricKey || 'Evidências').replace(/_/g, ' ');
  return {
    badge: humanType,
    title: humanKey.charAt(0).toUpperCase() + humanKey.slice(1),
    description: 'Evidências textuais consolidadas a partir das atas e análises.',
    badgeVariant: 'primary'
  };
}

/**
 * Formata datas ISO (YYYY-MM-DD) para padrão brasileiro (DD/MM/YYYY).
 */
function formatDateBR(dateStr) {
  if (!dateStr || dateStr === 'Data não informada') return 'Data não informada';
  try {
    const cleanStr = String(dateStr).split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return cleanStr;
  } catch {
    return dateStr;
  }
}

/**
 * Retorna configurações de estilo para os níveis de urgência.
 */
function getUrgencyConfig(urgencia) {
  const norm = (urgencia || '').toLowerCase();
  if (norm === 'crítica' || norm === 'critica') {
    return {
      label: 'Crítica',
      color: 'var(--danger)',
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.25)',
      icon: AlertCircle
    };
  }
  if (norm === 'alta') {
    return {
      label: 'Alta',
      color: 'var(--danger)',
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.25)',
      icon: AlertTriangle
    };
  }
  if (norm === 'média' || norm === 'media') {
    return {
      label: 'Média',
      color: 'var(--warning)',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.25)',
      icon: Clock
    };
  }
  return {
    label: norm ? (urgencia.charAt(0).toUpperCase() + urgencia.slice(1)) : 'Baixa',
    color: 'var(--primary-color)',
    bg: 'rgba(2, 132, 199, 0.1)',
    border: 'rgba(2, 132, 199, 0.2)',
    icon: CheckCircle2
  };
}

/**
 * Analisa e desmembra a string de evidência bruta gerada pelo backend em partes legíveis.
 */
function parseEvidenceItem(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return null;

  // Formato Tarefa / Ação
  const isTask = rawStr.includes('📋 Pendente:') || rawStr.includes('⚠️ Vencida:');
  if (isTask) {
    const isOverdue = rawStr.includes('⚠️ Vencida:');
    let str = rawStr.replace(/^(?:📋|⚠️)\s*(Pendente|Vencida):\s*/u, '').trim();

    // Extrair responsável entre colchetes
    let responsavel = null;
    const respMatch = str.match(/^\[(.*?)\]\s*/);
    if (respMatch) {
      const respVal = respMatch[1].trim();
      if (respVal && !respVal.toLowerCase().includes('não identificado') && !respVal.toLowerCase().includes('n/a')) {
        responsavel = respVal;
      }
      str = str.substring(respMatch[0].length).trim();
    }

    // Extrair meta final: (Status: ...) ou (Prazo: ...)
    let metaTag = null;
    let isPrazo = false;
    const metaMatch = str.match(/\((Status|Prazo):\s*(.*?)\)$/);
    if (metaMatch) {
      metaTag = metaMatch[2].trim();
      isPrazo = metaMatch[1] === 'Prazo';
      str = str.replace(/\((Status|Prazo):\s*(.*?)\)$/, '').trim();
    }

    return {
      type: 'task',
      isOverdue,
      badgeText: isOverdue ? 'Prazo Excedido' : (metaTag || 'Pendente'),
      responsavel,
      description: str,
      prazo: isPrazo ? formatDateBR(metaTag) : null,
      raw: rawStr
    };
  }

  // Formato Dor / Impedimento: 🚨 [Categoria]: "trecho"
  if (rawStr.startsWith('🚨')) {
    const withoutEmoji = rawStr.replace(/^🚨\s*/, '').trim();
    const colonIdx = withoutEmoji.indexOf(':');
    let category = 'Gargalo';
    let text = withoutEmoji;
    if (colonIdx > -1) {
      category = withoutEmoji.substring(0, colonIdx).trim();
      text = withoutEmoji.substring(colonIdx + 1).trim();
    }
    text = text.replace(/^"|"$/g, '');

    return {
      type: 'pain',
      category,
      description: text,
      raw: rawStr
    };
  }

  // Formato Tópico / Alinhamento
  if (rawStr.startsWith('Tema Principal:') || rawStr.startsWith('[')) {
    return {
      type: 'topic',
      description: rawStr,
      raw: rawStr
    };
  }

  // Fallback geral
  return {
    type: 'general',
    description: rawStr,
    raw: rawStr
  };
}

export default function EvidenceModal({ isOpen, onClose, drilldownData, onOpenMeeting }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Filtragem rápida dentro do modal (Hooks chamados incondicionalmente no topo)
  const items = drilldownData?.items;
  const filteredItems = useMemo(() => {
    const list = items || [];
    if (list.length === 0) return [];
    if (!searchTerm.trim()) return list;

    const term = searchTerm.toLowerCase();
    return list.filter((item) => {
      const idMatch = (item.meeting_id || '').toLowerCase().includes(term);
      const clientMatch = (item.cliente || '').toLowerCase().includes(term);
      const temaMatch = (item.tema || '').toLowerCase().includes(term);
      const evMatch = (item.evidencias || []).some((ev) => ev.toLowerCase().includes(term));
      return idMatch || clientMatch || temaMatch || evMatch;
    });
  }, [items, searchTerm]);

  if (!isOpen || !drilldownData) return null;

  const metricInfo = getMetricDisplayInfo(drilldownData.metric_type, drilldownData.metric_key);

  const handleCopyId = (fullId) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(fullId);
      setCopiedId(fullId);
      setTimeout(() => setCopiedId(null), 1800);
    }
  };

  return (
    <div className="evidence-modal-backdrop" onClick={onClose}>
      <div className="evidence-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header Executivo */}
        <div className="evidence-modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`evidence-tag ${metricInfo.badgeVariant}`}>
                {metricInfo.badge}
              </span>
            </div>
            <h3 className="evidence-modal-title">
              {metricInfo.title}
            </h3>
            <p className="evidence-modal-subtitle">
              {metricInfo.description}{' '}
              <span>
                (<strong>{drilldownData.total || 0}</strong> {drilldownData.total === 1 ? 'reunião encontrada' : 'reuniões encontradas'})
              </span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="btn-pf btn-pf-ghost btn-pf-sm"
            style={{ width: '32px', height: '32px', padding: 0, borderRadius: '6px' }}
            title="Fechar (Esc)"
          >
            <X size={17} />
          </button>
        </div>

        {/* Barra de Pesquisa Rápida (quando houver múltiplos itens) */}
        {drilldownData.items && drilldownData.items.length > 2 && (
          <div style={{
            padding: '0.75rem 1.75rem',
            background: 'var(--panel-bg)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Pesquisar por cliente, tema ou trecho..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '13px',
                color: 'var(--text-main)'
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="btn-pf btn-pf-ghost btn-pf-sm"
                style={{ padding: '2px 6px', fontSize: '11px', height: '22px' }}
              >
                Limpar
              </button>
            )}
          </div>
        )}

        {/* Corpo do Modal com os Cards de Reunião */}
        <div className="evidence-modal-body">
          {filteredItems.length > 0 ? (
            filteredItems.map((item, idx) => {
              const shortId = item.meeting_id ? item.meeting_id.substring(0, 8) : `Item ${idx + 1}`;
              const fullId = item.meeting_id || '';
              const dateFormatted = formatDateBR(item.data);
              const urgencyConfig = getUrgencyConfig(item.urgencia);
              const UrgencyIcon = urgencyConfig.icon;

              return (
                <div key={idx} className="evidence-item-card">
                  {/* Linha Superior: Identificadores e Ação */}
                  <div className="evidence-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {/* ID Curto com Tooltip e Cópia */}
                      <span
                        className="evidence-id-tag"
                        title={`ID Completo: ${fullId} (Clique para copiar)`}
                        onClick={() => handleCopyId(fullId)}
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <span>#{shortId}</span>
                        {copiedId === fullId ? <Check size={11} color="var(--success)" /> : <Copy size={10} opacity={0.6} />}
                      </span>

                      {/* Segmento / Cliente */}
                      <span className="evidence-pill">
                        <Building2 size={12} style={{ color: 'var(--text-muted)' }} />
                        <span>{item.cliente || 'Geral'}</span>
                      </span>

                      {/* Data */}
                      <span className="evidence-pill">
                        <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                        <span>{dateFormatted}</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Badge de Urgência */}
                      {item.urgencia && (
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '3px 9px',
                            borderRadius: '12px',
                            fontWeight: 600,
                            background: urgencyConfig.bg,
                            color: urgencyConfig.color,
                            border: `1px solid ${urgencyConfig.border}`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <UrgencyIcon size={12} />
                          <span>Urgência {urgencyConfig.label}</span>
                        </span>
                      )}

                      {/* Botão Ver no Histórico */}
                      {onOpenMeeting && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenMeeting(item.meeting_id || item.id_meeting);
                          }}
                          className="btn-pf btn-pf-outline-blue btn-pf-sm"
                          style={{
                            padding: '3px 10px',
                            fontSize: '11.5px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontWeight: 600
                          }}
                          title="Abrir detalhes completos e ata no Histórico"
                        >
                          <span>Ver Ata</span>
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tema / Assunto Principal */}
                  <div className="evidence-meeting-title">
                    {item.tema || 'Reunião de Alinhamento Corporativo'}
                  </div>

                  {/* Evidências Textuais Estruturadas */}
                  {item.evidencias && item.evidencias.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {item.evidencias.map((evStr, eIdx) => {
                        const parsed = parseEvidenceItem(evStr);
                        if (!parsed) return null;

                        const isOverdue = parsed.isOverdue;
                        const isPain = parsed.type === 'pain';

                        return (
                          <div
                            key={eIdx}
                            className={`evidence-box ${isOverdue ? 'overdue' : (isPain ? 'warning' : '')}`}
                          >
                            <div className="evidence-box-header">
                              {/* Tag de Status da Tarefa ou Categoria de Dor */}
                              {parsed.type === 'task' && (
                                <span className={`evidence-tag ${isOverdue ? 'danger' : 'amber'}`}>
                                  {isOverdue ? <AlertCircle size={11} /> : <Clock size={11} />}
                                  <span>{parsed.badgeText}</span>
                                </span>
                              )}

                              {parsed.type === 'pain' && (
                                <span className="evidence-tag amber">
                                  <AlertTriangle size={11} />
                                  <span>{parsed.category}</span>
                                </span>
                              )}

                              {/* Responsável se houver */}
                              {parsed.responsavel && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  Responsável: <strong>{parsed.responsavel}</strong>
                                </span>
                              )}

                              {/* Prazo */}
                              {parsed.prazo && (
                                <span style={{ fontSize: '11px', color: isOverdue ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isOverdue ? 600 : 400 }}>
                                  Prazo: {parsed.prazo}
                                </span>
                              )}
                            </div>

                            {/* Descrição Limpa */}
                            <div className="evidence-text">
                              {parsed.description}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <FileText size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p style={{ margin: 0, fontSize: '13px' }}>
                {searchTerm ? 'Nenhuma reunião corresponde ao filtro digitado.' : 'Nenhuma evidência textual direta encontrada para esta métrica.'}
              </p>
            </div>
          )}
        </div>

        {/* Rodapé Executivo */}
        <div className="evidence-modal-footer">
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Exibindo <strong>{filteredItems.length}</strong> de <strong>{drilldownData.total || 0}</strong> {drilldownData.total === 1 ? 'registro' : 'registros'}
          </div>

          <button
            onClick={onClose}
            className="btn-pf btn-pf-primary btn-pf-sm"
            style={{ padding: '6px 18px', fontSize: '12.5px', fontWeight: 600 }}
          >
            <Check size={14} />
            <span>Fechar Detalhes</span>
          </button>
        </div>
      </div>
    </div>
  );
}
