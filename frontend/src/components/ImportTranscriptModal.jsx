import React, { useState, useRef } from 'react';
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  Calendar,
  User,
  Building,
  FileWarning,
  Loader2
} from 'lucide-react';
import api from '../api/client';

export default function ImportTranscriptModal({ isOpen, onClose, onImportSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewItems, setPreviewItems] = useState([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [unsupportedNotice, setUnsupportedNotice] = useState('');
  const [expandedIndex, setExpandedIndex] = useState(0);
  const [successReport, setSuccessReport] = useState(null);

  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const SUPPORTED_EXTS = ['.txt', '.md', '.srt', '.vtt', '.docx'];

  const validateFiles = (fileList) => {
    const valid = [];
    const unsupported = [];

    Array.from(fileList).forEach((file) => {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (SUPPORTED_EXTS.includes(ext)) {
        valid.push(file);
      } else {
        unsupported.push(file.name);
      }
    });

    if (unsupported.length > 0) {
      setUnsupportedNotice(
        `Os seguintes arquivos possuem formato não suportado e foram ignorados: ${unsupported.join(', ')}. ` +
        `Formatos aceitos: ${SUPPORTED_EXTS.join(', ')}. Arquivos em .pdf ou imagens não são aceitos para extração direta de transcrições.`
      );
    } else {
      setUnsupportedNotice('');
    }

    return valid;
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const valid = validateFiles(e.dataTransfer.files);
      if (valid.length > 0) {
        setSelectedFiles(valid);
        await generatePreviews(valid);
      }
    }
  };

  const handleFileSelect = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const valid = validateFiles(e.target.files);
      if (valid.length > 0) {
        setSelectedFiles(valid);
        await generatePreviews(valid);
      }
    }
  };

  const generatePreviews = async (files) => {
    setIsLoadingPreview(true);
    setErrorMsg('');
    try {
      const result = await api.previewImportedTranscripts(files);
      if (result && Array.isArray(result.items)) {
        const enriched = result.items.map((item, idx) => ({
          ...item,
          id: `preview_${Date.now()}_${idx}`,
          selected: !item.is_duplicate, // Se for duplicado, vem desmarcado por segurança
          allow_duplicate: false,
          editable_title: item.metadata?.title || item.file_name.replace(/\.[^/.]+$/, ''),
          editable_date: item.metadata?.date || new Date().toISOString().slice(0, 10),
          editable_department: item.metadata?.department || 'Geral',
          editable_participants: Array.isArray(item.metadata?.participants)
            ? item.metadata.participants.join(', ')
            : (item.metadata?.participants || ''),
          editable_transcript: item.transcript_normalized || item.transcript_raw || ''
        }));
        setPreviewItems(enriched);
        setExpandedIndex(0);
      } else {
        setErrorMsg('Não foi possível processar a pré-visualização dos arquivos enviados.');
      }
    } catch (err) {
      console.error('Erro ao gerar preview de importação:', err);
      setErrorMsg(err.message || 'Falha ao processar arquivos no servidor.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleFieldChange = (index, field, value) => {
    setPreviewItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveItem = (index) => {
    setPreviewItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirmImport = async () => {
    const itemsToConfirm = previewItems.filter((item) => {
      if (!item.selected) return false;
      if (item.is_duplicate && !item.allow_duplicate) return false;
      return true;
    });

    if (itemsToConfirm.length === 0) {
      setErrorMsg('Nenhuma reunião válida selecionada para importação.');
      return;
    }

    setIsConfirming(true);
    setErrorMsg('');

    try {
      const payload = itemsToConfirm.map((item) => ({
        content_hash: item.content_hash,
        title: item.editable_title.trim() || item.file_name,
        date: item.editable_date,
        department: item.editable_department.trim() || 'Geral',
        participants: item.editable_participants
          ? item.editable_participants.split(',').map((p) => p.trim()).filter(Boolean)
          : [],
        transcript_raw: item.transcript_raw,
        transcript_normalized: item.editable_transcript,
        allow_duplicate: Boolean(item.allow_duplicate),
        original_file_name: item.file_name
      }));

      const res = await api.confirmImportedTranscripts(payload);
      if (res && res.success) {
        setSuccessReport(res);
        if (onImportSuccess) {
          onImportSuccess(res);
        }
      } else {
        setErrorMsg(res?.message || 'Falha ao confirmar importação no servidor.');
      }
    } catch (err) {
      console.error('Erro ao confirmar importação:', err);
      setErrorMsg(err.message || 'Erro inesperado na confirmação.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setPreviewItems([]);
    setErrorMsg('');
    setUnsupportedNotice('');
    setSuccessReport(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCloseModal = () => {
    handleReset();
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1.5rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isConfirming) {
          handleCloseModal();
        }
      }}
    >
      <div
        style={{
          background: 'var(--panel-bg, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border-color, #e2e8f0)',
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid var(--border-color, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--header-bg, #f8fafc)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(2, 132, 199, 0.12)',
                color: 'var(--primary-color, #0284c7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Upload size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                Importar Transcrições de Reuniões Externas
              </h2>
              <p style={{ fontSize: '0.82rem', margin: '2px 0 0 0', color: 'var(--text-secondary, #64748b)' }}>
                Carregue arquivos de reuniões realizadas no Teams, Zoom, Meet ou gravadas externamente (.txt, .md, .srt, .vtt, .docx)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            disabled={isConfirming}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isConfirming ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary, #64748b)',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div
          style={{
            padding: '1.5rem 1.75rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}
        >
          {/* Sucesso Report */}
          {successReport ? (
            <div
              style={{
                textAlign: 'center',
                padding: '2.5rem 1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem'
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <CheckCircle2 size={36} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
                Importação Concluída com Sucesso!
              </h3>
              <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary, #64748b)', maxWidth: '500px', margin: 0 }}>
                {successReport.imported_count} reunião(ões) importada(s) para o histórico como <strong>Concluída</strong> e aguardando análise. Nenhuma reunião existente foi sobrescrita.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{
                    padding: '0.6rem 1.5rem',
                    background: 'var(--primary-color, #0284c7)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Concluir e Ver no Histórico
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    padding: '0.6rem 1.25rem',
                    background: 'transparent',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    color: 'var(--text-primary, #0f172a)',
                    borderRadius: '8px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Importar Mais Arquivos
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Notificação de Formato Não Suportado */}
              {unsupportedNotice && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#b45309',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem'
                  }}
                >
                  <FileWarning size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>{unsupportedNotice}</div>
                </div>
              )}

              {/* Mensagem de Erro Geral */}
              {errorMsg && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#b91c1c',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem'
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>{errorMsg}</div>
                </div>
              )}

              {/* Área de Seleção de Arquivos (Dropzone) se ainda não tiver prévias */}
              {previewItems.length === 0 ? (
                <div>
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragActive ? 'var(--primary-color, #0284c7)' : 'var(--border-color, #cbd5e1)'}`,
                      borderRadius: '12px',
                      padding: '3rem 2rem',
                      textAlign: 'center',
                      background: dragActive ? 'rgba(2, 132, 199, 0.05)' : 'var(--card-bg, #f8fafc)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.85rem'
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".txt,.md,.srt,.vtt,.docx"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                    <div
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '50%',
                        background: 'rgba(2, 132, 199, 0.12)',
                        color: 'var(--primary-color, #0284c7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {isLoadingPreview ? (
                        <Loader2 size={26} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Upload size={26} />
                      )}
                    </div>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: '0.98rem' }}>
                        Clique para selecionar ou arraste arquivos aqui
                      </span>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
                        Suporta múltiplos arquivos em <strong>.txt, .md, .srt, .vtt e .docx</strong> (Word)
                      </p>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary, #64748b)',
                        marginTop: '0.5rem'
                      }}
                    >
                      <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--border-color, #e2e8f0)' }}>Teams (.docx / .vtt)</span>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--border-color, #e2e8f0)' }}>Zoom (.vtt / .txt)</span>
                      <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'var(--border-color, #e2e8f0)' }}>Meet (.txt / .srt)</span>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: '1rem',
                      padding: '0.75rem 1rem',
                      background: 'rgba(100, 116, 139, 0.08)',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary, #64748b)'
                    }}
                  >
                    <strong>Nota de Preservação:</strong> Todas as marcações de falantes (ex: <code>[Maria]:</code> ou <code>João Silva:</code>) e timestamps (ex: <code>[10:14:02]</code>) são preservados fielmente. Nenhuma IA ou STT será executada automaticamente nesta etapa.
                  </div>
                </div>
              ) : (
                /* Pré-visualização e Edição em Lote */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: '0.5rem',
                      borderBottom: '1px solid var(--border-color, #e2e8f0)'
                    }}
                  >
                    <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                      {previewItems.length} arquivo(s) analisado(s) para importação
                    </span>
                    <button
                      type="button"
                      onClick={handleReset}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--primary-color, #0284c7)',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        fontWeight: 500
                      }}
                    >
                      + Adicionar outros arquivos
                    </button>
                  </div>

                  {/* Lista de Prévia */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {previewItems.map((item, idx) => {
                      const isExpanded = expandedIndex === idx;
                      return (
                        <div
                          key={item.id}
                          style={{
                            border: `1px solid ${item.is_duplicate ? '#f59e0b' : 'var(--border-color, #e2e8f0)'}`,
                            borderRadius: '10px',
                            background: item.is_duplicate ? 'rgba(245, 158, 11, 0.03)' : 'var(--card-bg, #ffffff)',
                            overflow: 'hidden'
                          }}
                        >
                          {/* Cabeçalho do Card */}
                          <div
                            style={{
                              padding: '0.75rem 1rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: isExpanded ? 'rgba(0, 0, 0, 0.02)' : 'transparent',
                              cursor: 'pointer'
                            }}
                            onClick={() => setExpandedIndex(isExpanded ? -1 : idx)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                              <input
                                type="checkbox"
                                checked={item.selected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleFieldChange(idx, 'selected', e.target.checked);
                                }}
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                              />
                              <FileText size={18} style={{ color: 'var(--primary-color, #0284c7)', flexShrink: 0 }} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.88rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.editable_title}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                                  Arquivo: {item.file_name} ({Math.round(item.file_size / 1024)} KB) • {item.character_count} caracteres • {item.line_count} linhas
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {item.is_duplicate && (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    color: '#b45309',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <AlertTriangle size={12} />
                                  Duplicado Detectado
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveItem(idx);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--text-secondary, #94a3b8)',
                                  padding: '4px'
                                }}
                                title="Remover item da lista"
                              >
                                <Trash2 size={16} />
                              </button>
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </div>
                          </div>

                          {/* Se for duplicada: Alerta explicativo */}
                          {item.is_duplicate && (
                            <div
                              style={{
                                padding: '0.65rem 1rem',
                                background: 'rgba(245, 158, 11, 0.1)',
                                borderTop: '1px solid rgba(245, 158, 11, 0.25)',
                                borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
                                fontSize: '0.78rem',
                                color: '#92400e',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                                <span>{item.duplicate_reason}. As reuniões originais <strong>nunca são sobrescritas</strong>.</span>
                              </div>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                <input
                                  type="checkbox"
                                  checked={item.allow_duplicate}
                                  onChange={(e) => {
                                    handleFieldChange(idx, 'allow_duplicate', e.target.checked);
                                    if (e.target.checked) {
                                      handleFieldChange(idx, 'selected', true);
                                    }
                                  }}
                                />
                                Importar mesmo assim (cria novo registro)
                              </label>
                            </div>
                          )}

                          {/* Conteúdo Expandido para Edição de Metadados e Transcrição */}
                          {isExpanded && (
                            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                              {/* Grid de Metadados Editáveis */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: '0.75rem' }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary, #64748b)' }}>
                                    Título da Reunião:
                                  </label>
                                  <input
                                    type="text"
                                    value={item.editable_title}
                                    onChange={(e) => handleFieldChange(idx, 'editable_title', e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-color, #cbd5e1)',
                                      fontSize: '0.85rem'
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary, #64748b)' }}>
                                    Data:
                                  </label>
                                  <input
                                    type="date"
                                    value={item.editable_date}
                                    onChange={(e) => handleFieldChange(idx, 'editable_date', e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-color, #cbd5e1)',
                                      fontSize: '0.85rem'
                                    }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary, #64748b)' }}>
                                    Departamento:
                                  </label>
                                  <input
                                    type="text"
                                    value={item.editable_department}
                                    onChange={(e) => handleFieldChange(idx, 'editable_department', e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                      border: '1px solid var(--border-color, #cbd5e1)',
                                      fontSize: '0.85rem'
                                    }}
                                  />
                                </div>
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary, #64748b)' }}>
                                  Participantes Identificados (separados por vírgula):
                                </label>
                                <input
                                  type="text"
                                  value={item.editable_participants}
                                  placeholder="Ex: Ana Souza, Carlos Silva, Mariana Lima"
                                  onChange={(e) => handleFieldChange(idx, 'editable_participants', e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color, #cbd5e1)',
                                    fontSize: '0.85rem'
                                  }}
                                />
                              </div>

                              {/* Visualizador / Editor de Transcrição */}
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>
                                    Conteúdo da Transcrição (Formatado com Falantes e Timestamps):
                                  </label>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #94a3b8)' }}>
                                    Hash SHA-256: {item.content_hash.slice(0, 12)}...
                                  </span>
                                </div>
                                <textarea
                                  value={item.editable_transcript}
                                  onChange={(e) => handleFieldChange(idx, 'editable_transcript', e.target.value)}
                                  rows={6}
                                  style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color, #cbd5e1)',
                                    fontSize: '0.8rem',
                                    fontFamily: 'monospace',
                                    lineHeight: 1.4,
                                    resize: 'vertical',
                                    background: 'var(--input-bg, #f8fafc)'
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé de Ações */}
        {!successReport && (
          <div
            style={{
              padding: '1rem 1.75rem',
              borderTop: '1px solid var(--border-color, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--footer-bg, #f8fafc)'
            }}
          >
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>
              {previewItems.length > 0 && (
                <span>
                  {previewItems.filter((i) => i.selected && (!i.is_duplicate || i.allow_duplicate)).length} de {previewItems.length} selecionada(s) para gravação
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isConfirming}
                style={{
                  padding: '0.55rem 1.25rem',
                  background: 'transparent',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: isConfirming ? 'not-allowed' : 'pointer',
                  color: 'var(--text-primary, #0f172a)'
                }}
              >
                Cancelar
              </button>

              {previewItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={isConfirming || previewItems.filter((i) => i.selected && (!i.is_duplicate || i.allow_duplicate)).length === 0}
                  style={{
                    padding: '0.55rem 1.4rem',
                    background: 'var(--primary-color, #0284c7)',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: (isConfirming || previewItems.filter((i) => i.selected && (!i.is_duplicate || i.allow_duplicate)).length === 0) ? 'not-allowed' : 'pointer',
                    opacity: (isConfirming || previewItems.filter((i) => i.selected && (!i.is_duplicate || i.allow_duplicate)).length === 0) ? 0.6 : 1
                  }}
                >
                  {isConfirming ? (
                    <>
                      <Loader2 size={16} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                      Gravando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Confirmar Importação
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
