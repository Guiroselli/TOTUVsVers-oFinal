import React, { useState, useEffect, useCallback } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx';
import { saveAs } from 'file-saver';

import api from './api/client';
import Sidebar from './components/Sidebar';
import MeetingHistoryTable from './components/MeetingHistoryTable';
import QuarterlyAnalyticsPage from './components/QuarterlyAnalyticsPage';
import LiveMeetingPage from './components/LiveMeetingPage';
import TotvsIntegrationModal from './components/TotvsIntegrationModal';

export default function MeetingApp() {
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'analytics' | 'meeting'
  
  // States for Meeting List / History
  const [meetings, setMeetings] = useState([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, page_size: 10, total: 0, total_pages: 1 });
  const [expandedMeetingId, setExpandedMeetingId] = useState(null);

  // Search & Filter state for History
  const [searchQuery, setSearchQuery] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  // TOTVS Systems State
  const [sistemasTotvs, setSistemasTotvs] = useState({});
  const [enviosPorReuniao, setEnviosPorReuniao] = useState({});
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Loading indicator for PDF / Analysis
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState('');

  // 1. Carrega sistemas TOTVS
  const loadSistemasTotvs = async () => {
    try {
      const data = await api.getSistemasTotvs();
      setSistemasTotvs(data);
    } catch (err) {
      console.error('Erro ao carregar sistemas TOTVS:', err);
    }
  };

  // 2. Carrega lista paginada de reuniões
  const loadMeetings = useCallback(async (page = 1, pageSize = 10) => {
    setLoadingMeetings(true);
    try {
      const res = await api.getMeetings({
        page,
        page_size: pageSize,
        search: searchQuery,
        client_code: clientFilter,
        status: '',
      });
      setMeetings(res.items || []);
      setPagination({
        page: res.page,
        page_size: res.page_size,
        total: res.total,
        total_pages: res.total_pages
      });
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    } finally {
      setLoadingMeetings(false);
    }
  }, [searchQuery, clientFilter]);

  useEffect(() => {
    loadSistemasTotvs();
  }, []);

  useEffect(() => {
    if (currentView === 'dashboard') {
      loadMeetings(pagination.page, pagination.page_size);
    }
  }, [currentView, loadMeetings, pagination.page, pagination.page_size]);

  // Handler de mudança de responsável
  const handleResponsibleChange = async (meetingId, newResponsible) => {
    try {
      await api.updateResponsible(meetingId, newResponsible);
      setMeetings(prev => prev.map(m => m.ID_MEETING === meetingId ? { ...m, RESPONSAVEL_REUNIAO: newResponsible } : m));
    } catch (err) {
      console.error('Erro ao salvar responsável:', err);
    }
  };

  // Handler de mudança de urgência
  const handleUrgencyChange = async (meetingId, newUrgency) => {
    try {
      await api.updateUrgency(meetingId, newUrgency);
      setMeetings(prev => prev.map(m => m.ID_MEETING === meetingId ? { ...m, NIVEL_URGENCIA: newUrgency } : m));
    } catch (err) {
      console.error('Erro ao salvar urgência:', err);
    }
  };

  // Handler de mudança de status da tarefa
  const handleTaskStatusChange = async (meetingId, taskIndex, newStatus) => {
    try {
      await api.updateTaskStatus(meetingId, taskIndex, newStatus);
      setMeetings(prev => prev.map(m => {
        if (m.ID_MEETING === meetingId && m.RESUMO_IA?.tarefas) {
          const updatedTarefas = [...m.RESUMO_IA.tarefas];
          updatedTarefas[taskIndex] = { ...updatedTarefas[taskIndex], status: newStatus };
          return { ...m, RESUMO_IA: { ...m.RESUMO_IA, tarefas: updatedTarefas } };
        }
        return m;
      }));
    } catch (err) {
      console.error('Erro ao salvar status da tarefa:', err);
    }
  };

  // Handler de confirmação/edição/rejeição de sugestão da IA
  const handleConfirmSuggestion = async (meetingId, fieldName, action, value = null) => {
    try {
      const res = await api.confirmSuggestion(meetingId, fieldName, action, value);
      if (res.status === 'success') {
        // Atualiza a reunião no estado local
        setMeetings(prev => prev.map(m => {
          if (m.ID_MEETING === meetingId) {
            const updatedSuggestions = { ...(m.field_suggestions || m.RESUMO_IA?.field_suggestions || {}) };
            updatedSuggestions[fieldName] = res.suggestion;
            
            const updatedMeeting = { ...m, field_suggestions: updatedSuggestions };
            if (res.suggestion.review_status === 'confirmed') {
              if (fieldName === 'responsavel_reuniao') {
                updatedMeeting.RESPONSAVEL_REUNIAO = res.suggestion.confirmed_value;
              } else if (fieldName === 'nivel_urgencia') {
                updatedMeeting.NIVEL_URGENCIA = res.suggestion.confirmed_value;
              }
            }
            return updatedMeeting;
          }
          return m;
        }));
      }
    } catch (err) {
      console.error('Erro ao processar sugestão:', err);
    }
  };

  // Handler de envio para TOTVS
  const handleEnviarIntegracao = async (meetingId, sistema, tarefas) => {
    const chave = `${meetingId}_${sistema}`;
    setEnviosPorReuniao(prev => ({ ...prev, [chave]: 'enviando' }));
    try {
      const data = await api.enviarIntegracao(meetingId, sistema, tarefas || []);
      setEnviosPorReuniao(prev => ({
        ...prev,
        [chave]: data.status === 'enviado_real' ? 'ok_real' : 'ok_simulado'
      }));
    } catch (err) {
      console.error('Erro ao enviar para TOTVS:', err);
      setEnviosPorReuniao(prev => ({ ...prev, [chave]: 'erro' }));
    }
  };

  // Handler de salvar webhook TOTVS
  const handleSalvarWebhook = async (sistema, url) => {
    try {
      await api.saveIntegracaoConfig(sistema, url);
      await loadSistemasTotvs();
    } catch (err) {
      console.error('Erro ao salvar webhook:', err);
    }
  };

  // DOCX Generation (Reutiliza análise existente e evita re-processamento)
  const generateDocx = async (rawText, isHistorical = false, meetingId = null, existingData = null) => {
    setIsGeneratingPDF(true);
    setGeneratingMessage('Gerando documento DOCX formal...');

    try {
      if (!rawText) rawText = 'Nenhuma transcrição de áudio capturada.';
      
      let analysisData = existingData;
      // Se não houver análise prévia e houver texto, analisa uma vez
      if (!analysisData && rawText.length > 10) {
        try {
          analysisData = await api.analyzeText(rawText.substring(0, 10000), meetingId || null);
        } catch (e) {
          console.error('Backend offline ou falha na análise para DOCX:', e);
        }
      }

      const children = [];
      children.push(new Paragraph({
        text: 'Proton Flow — Resumo Executivo da Reunião',
        heading: HeadingLevel.TITLE,
      }));
      children.push(new Paragraph({
        text: isHistorical ? 'IA de Inteligência Gerencial TOTVS (Modo Histórico)' : 'IA de Inteligência Gerencial TOTVS',
        heading: HeadingLevel.HEADING_2,
      }));
      children.push(new Paragraph(''));

      if (analysisData) {
        children.push(new Paragraph({ text: 'Resumo Executivo da IA', heading: HeadingLevel.HEADING_1 }));
        children.push(new Paragraph(`Tema: ${analysisData.tema || 'Não identificado'}`));
        if (analysisData.contexto) {
          if (analysisData.contexto.problema) children.push(new Paragraph(`Problema Principal: ${analysisData.contexto.problema}`));
          if (analysisData.contexto.decisao) children.push(new Paragraph(`Decisão/Encaminhamento: ${analysisData.contexto.decisao}`));
        }
        children.push(new Paragraph(''));

        if (analysisData.organizacao_por_temas && analysisData.organizacao_por_temas.length > 0) {
          children.push(new Paragraph({ text: 'Organização por Temas', heading: HeadingLevel.HEADING_1 }));
          analysisData.organizacao_por_temas.forEach(t => {
            children.push(new Paragraph({ text: (t.tema || '').toUpperCase(), heading: HeadingLevel.HEADING_2 }));
            if (t.topicos) {
              t.topicos.forEach(topico => {
                children.push(new Paragraph(`• ${topico}`));
              });
            }
          });
          children.push(new Paragraph(''));
        }

        if (analysisData.dores && analysisData.dores.length > 0) {
          children.push(new Paragraph({ text: 'Dores & Alertas Mapeados', heading: HeadingLevel.HEADING_1 }));
          analysisData.dores.forEach(dor => {
            const isObj = typeof dor === 'object' && dor !== null;
            const textoDor = isObj ? `${dor.label || dor.categoria}: ${dor.descricao || dor.trecho}` : dor;
            children.push(new Paragraph(`• ${textoDor}`));
          });
          children.push(new Paragraph(''));
        }

        if (analysisData.tarefas && analysisData.tarefas.length > 0) {
          children.push(new Paragraph({ text: 'Plano de Ação', heading: HeadingLevel.HEADING_1 }));
          const rows = [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: 'Responsável', style: 'bold' })] }),
                new TableCell({ children: [new Paragraph({ text: 'Tarefa', style: 'bold' })] }),
                new TableCell({ children: [new Paragraph({ text: 'Prazo', style: 'bold' })] }),
              ],
            })
          ];
          analysisData.tarefas.forEach(t => {
            rows.push(new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(t.responsavel || '-')] }),
                new TableCell({ children: [new Paragraph(t.tarefa || '-')] }),
                new TableCell({ children: [new Paragraph(t.prazo || '-')] }),
              ],
            }));
          });
          children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
          children.push(new Paragraph(''));
        }
      }

      const doc = new Document({
        sections: [{ properties: {}, children }]
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, isHistorical ? `Ata_Reuniao_${meetingId || 'Historico'}.docx` : 'Ata_Reuniao_ProtonFlow.docx');

    } catch (err) {
      console.error('Erro ao gerar DOCX:', err);
      alert('Ocorreu um erro ao gerar o DOCX.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // PDF Generation (Reutiliza análise existente e persiste no servidor)
  const generatePDF = async (rawText, isHistorical = false, meetingId = null, existingData = null) => {
    setIsGeneratingPDF(true);
    setGeneratingMessage('Sintetizando ata executiva em PDF...');

    try {
      if (!rawText) rawText = 'Nenhuma transcrição de áudio capturada.';
      
      let analysisData = existingData;
      // Reutiliza se já existir; só chama a IA se ainda não tiver sido analisada
      if (!analysisData && rawText.length > 10) {
        try {
          analysisData = await api.analyzeText(rawText.substring(0, 10000), meetingId || null);
        } catch (e) {
          console.error('Erro ao sintetizar via Ollama:', e);
        }
      }

      const doc = new jsPDF();
      
      // Cabeçalho TOTVS Azul Escuro
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.text('Proton Flow — Resumo Executivo da Reunião', 15, 20);
      doc.setFontSize(11);
      doc.text(isHistorical ? 'IA de Inteligência Gerencial TOTVS (Modo Histórico)' : 'IA de Inteligência Gerencial TOTVS', 15, 28);
      
      doc.setTextColor(0, 0, 0);
      let currentY = 55;

      if (analysisData) {
        // Tema e Contexto
        doc.setFontSize(16);
        doc.setTextColor(0, 210, 255);
        doc.text('Resumo Executivo da IA', 15, currentY);
        
        doc.setFontSize(11);
        doc.setTextColor(50, 50, 50);
        currentY += 8;
        const linesTema = doc.splitTextToSize(`Tema: ${analysisData.tema || 'Não identificado'}`, 180);
        doc.text(linesTema, 15, currentY);
        currentY += linesTema.length * 6 + 1;
        
        if (analysisData.contexto) {
          const ctx = analysisData.contexto;
          if (ctx.problema) {
            const linesProb = doc.splitTextToSize(`Problema Principal: ${ctx.problema}`, 180);
            doc.text(linesProb, 15, currentY);
            currentY += linesProb.length * 6 + 1;
          }
          if (ctx.decisao) {
            const linesDec = doc.splitTextToSize(`Decisão/Encaminhamento: ${ctx.decisao}`, 180);
            doc.text(linesDec, 15, currentY);
            currentY += linesDec.length * 6 + 1;
          }
        }
        currentY += 5;

        // Organização por Temas
        if (analysisData.organizacao_por_temas && analysisData.organizacao_por_temas.length > 0) {
          doc.setFontSize(14);
          doc.setTextColor(0, 210, 255);
          doc.text('Organização por Temas', 15, currentY);
          currentY += 8;

          analysisData.organizacao_por_temas.forEach(grupo => {
            if (currentY > 270) {
              doc.addPage();
              currentY = 20;
            }
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            const tituloTema = grupo.tema ? grupo.tema.toUpperCase() : 'TEMA GERAL';
            doc.text(tituloTema, 15, currentY);
            currentY += 6;

            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(50, 50, 50);
            if (grupo.topicos && grupo.topicos.length > 0) {
              grupo.topicos.forEach(topico => {
                const lines = doc.splitTextToSize(`• ${topico}`, 175);
                doc.text(lines, 20, currentY);
                currentY += lines.length * 6;
              });
            }
            currentY += 4;
          });
          currentY += 5;
        }

        // Dores Mapeadas
        if (analysisData.dores && analysisData.dores.length > 0) {
          doc.setFontSize(14);
          doc.setTextColor(239, 68, 68);
          doc.text('Dores & Alertas Mapeados', 15, currentY);
          currentY += 8;

          doc.setFontSize(11);
          doc.setTextColor(50, 50, 50);
          analysisData.dores.forEach(dor => {
            const isObj = typeof dor === 'object' && dor !== null;
            const textoDor = isObj ? `${dor.label || dor.categoria}: ${dor.descricao || dor.trecho}` : dor;
            const lines = doc.splitTextToSize(`• ${textoDor}`, 180);
            doc.text(lines, 15, currentY);
            currentY += lines.length * 6;
          });
          currentY += 5;
        }

        // Tarefas
        if (analysisData.tarefas && analysisData.tarefas.length > 0) {
          doc.setFontSize(14);
          doc.setTextColor(16, 185, 129);
          doc.text('Plano de Ação', 15, currentY);
          
          const bodyRows = analysisData.tarefas.map(t => [t.responsavel || '-', t.tarefa || '-', t.prazo || '-']);
          autoTable(doc, {
            startY: currentY + 5,
            head: [['Responsável', 'Tarefa', 'Prazo']],
            body: bodyRows,
            headStyles: { fillColor: [15, 23, 42] }
          });
          currentY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 10 : currentY + 30;
        }
      }

      // Salva PDF no Servidor se tiver meetingId
      if (meetingId) {
        const pdfBlob = doc.output('blob');
        const formData = new FormData();
        formData.append('meeting_id', String(meetingId));
        formData.append('file', pdfBlob, `meeting_${meetingId}.pdf`);
        
        try {
          await api.uploadPdf(formData);
          setMeetings(prev => prev.map(m => m.ID_MEETING === meetingId ? { ...m, TEM_PDF: true, RESUMO_IA: analysisData } : m));
        } catch (e) {
          console.error('Erro ao fazer upload do PDF:', e);
        }
      } else {
        doc.save(isHistorical ? 'Resumo_Retroativo_ProtonFlow.pdf' : 'Resumo_Reuniao_ProtonFlow.pdf');
      }

    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Ocorreu um erro ao gerar o PDF.');
    } finally {
      setIsGeneratingPDF(false);
      if (!isHistorical) {
        setCurrentView('dashboard');
        loadMeetings(1, pagination.page_size);
      }
    }
  };

  // Handler de encerramento da Reunião Ao Vivo
  const handleLeaveLiveMeeting = async (transcript) => {
    try {
      const res = await api.saveMeeting(transcript || 'Reunião sem transcrição capturada.');
      if (res.meeting_id) {
        await generatePDF(transcript, false, res.meeting_id);
      } else {
        await generatePDF(transcript, false);
      }
    } catch (err) {
      console.error('Erro ao encerrar reunião ao vivo:', err);
      await generatePDF(transcript, false);
    }
  };

  if (isGeneratingPDF) {
    return (
      <div className="lobby" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{
          width: 60,
          height: 60,
          border: '4px solid var(--panel-bg)',
          borderTopColor: 'var(--primary-color)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '2rem'
        }}></div>
        <style>
          {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
        </style>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: 'var(--text-main)' }}>
          {generatingMessage || 'Processando com Inteligência Artificial...'}
        </h2>
        <p style={{ color: 'var(--primary-color)', fontSize: '1.1rem' }}>
          O Ollama está validando os metadados e organizando os insights.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <Sidebar
        currentView={currentView}
        onSelectView={(view) => setCurrentView(view)}
        onOpenConfig={() => setShowConfigModal(true)}
      />

      {/* Main View Area */}
      {currentView === 'dashboard' && (
        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <h2 style={{ fontSize: '1.8rem', margin: '0 0 4px 0' }}>Histórico de Reuniões</h2>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                Consulte, filtre e gerencie as atas das reuniões corporativas da TOTVS.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn-primary"
                style={{ background: 'var(--panel-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}
                onClick={() => setCurrentView('analytics')}
              >
                📊 Visão Anual
              </button>
              <button className="btn-primary" onClick={() => setCurrentView('meeting')}>
                + Iniciar Reunião Ao Vivo
              </button>
            </div>
          </header>

          <div style={{ padding: '2rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Quick Filters */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              background: 'var(--panel-bg)',
              padding: '0.8rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <input
                  type="text"
                  placeholder="🔍 Buscar por transcrição, tema ou facilitador..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 12px',
                    borderRadius: '6px',
                    background: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    outline: 'none',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Cliente:</span>
                <input
                  type="text"
                  placeholder="Ex: T27261"
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    outline: 'none',
                    fontSize: '12px',
                    width: '120px'
                  }}
                />
              </div>

              <button
                onClick={() => loadMeetings(1, pagination.page_size)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: 'var(--primary-color)',
                  color: '#000',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Filtrar
              </button>
            </div>

            {/* Table */}
            <MeetingHistoryTable
              meetings={meetings}
              loading={loadingMeetings}
              expandedMeetingId={expandedMeetingId}
              onToggleExpand={(id) => setExpandedMeetingId(expandedMeetingId === id ? null : id)}
              onResponsibleChange={handleResponsibleChange}
              onUrgencyChange={handleUrgencyChange}
              onSynthesize={(item) => generatePDF(item.ANON_TRANSCRICAO, true, item.ID_MEETING, item.RESUMO_IA)}
              onGenerateDocx={(item) => generateDocx(item.ANON_TRANSCRICAO, true, item.ID_MEETING, item.RESUMO_IA)}
              sistemasTotvs={sistemasTotvs}
              enviosPorReuniao={enviosPorReuniao}
              onConfirmSuggestion={handleConfirmSuggestion}
              onTaskStatusChange={handleTaskStatusChange}
              onEnviarIntegracao={handleEnviarIntegracao}
              onOpenConfig={() => setShowConfigModal(true)}
              pagination={pagination}
              onPageChange={(p) => loadMeetings(p, pagination.page_size)}
              onPageSizeChange={(sz) => loadMeetings(1, sz)}
            />
          </div>
        </main>
      )}

      {currentView === 'analytics' && (
        <main className="dashboard-main">
          <QuarterlyAnalyticsPage
            onOpenMeeting={(meetingId) => {
              setExpandedMeetingId(meetingId);
              setCurrentView('dashboard');
            }}
          />
        </main>
      )}

      {currentView === 'meeting' && (
        <LiveMeetingPage
          onLeaveMeeting={handleLeaveLiveMeeting}
        />
      )}

      {/* Modal de Integrações TOTVS */}
      <TotvsIntegrationModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        sistemasTotvs={sistemasTotvs}
        onSaveWebhook={handleSalvarWebhook}
      />
    </div>
  );
}
