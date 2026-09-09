import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';

import api from './api/client';
import Sidebar from './components/Sidebar';
import MeetingHistoryTable from './components/MeetingHistoryTable';
import TotvsIntegrationModal from './components/TotvsIntegrationModal';
import DocumentViewerModal from './components/DocumentViewerModal';

// Code Splitting / Lazy Loading de páginas pesadas
const QuarterlyAnalyticsPage = lazy(() => import('./components/QuarterlyAnalyticsPage'));
const LiveMeetingPage = lazy(() => import('./components/LiveMeetingPage'));

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
  const [segmentFilter, setSegmentFilter] = useState('');
  const [onlyUnanalyzed, setOnlyUnanalyzed] = useState(false);

  // TOTVS Systems State
  const [sistemasTotvs, setSistemasTotvs] = useState({});
  const [enviosPorReuniao, setEnviosPorReuniao] = useState({});
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Loading indicator for PDF / Analysis
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState('');

  // In-App Document Viewer State (Visualização no Frontend sem forçar download)
  const [viewerState, setViewerState] = useState({
    isOpen: false,
    meeting: null,
    pdfBlobUrl: null,
    isLoadingPdf: false,
    initialDocType: 'executive',
    initialFormat: 'pdf'
  });

  // 1. Carrega sistemas TOTVS
  const loadSistemasTotvs = async () => {
    try {
      const data = await api.getSistemasTotvs();
      setSistemasTotvs(data || {});
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
        segment: segmentFilter,
        only_unanalyzed: onlyUnanalyzed,
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
  }, [searchQuery, clientFilter, segmentFilter, onlyUnanalyzed]);

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
            const existingSuggestions = m.field_suggestions || m.RESUMO_IA?.field_suggestions;
            const updatedSuggestions = existingSuggestions ? { ...existingSuggestions } : {};
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

  // Helper unificado de detecção de fallback
  const isFallbackAnalysis = (meta, status) => {
    const engine = String(meta?.analysis_engine || '').toLowerCase();
    const st = String(status || meta?.analysis_status || '').toLowerCase();
    return (
      engine === 'deterministic_fallback' ||
      st === 'fallback_deterministico' ||
      st === 'analise_contingencia_tarefas_pendentes' ||
      st === 'reuniao_sem_conteudo_estruturado' ||
      st === 'deterministic_fallback'
    );
  };

  // Handler de envio para TOTVS
  const handleEnviarIntegracao = async (meetingId, sistema, tarefas, modoSimulado = false) => {
    const chave = `${meetingId}_${sistema}`;
    setEnviosPorReuniao(prev => ({ ...prev, [chave]: 'enviando' }));
    try {
      const data = await api.enviarIntegracao(meetingId, sistema, tarefas || [], modoSimulado);
      setEnviosPorReuniao(prev => ({
        ...prev,
        [chave]: data.status === 'enviado_real' ? 'ok_real' : 'ok_simulado'
      }));
    } catch (err) {
      console.error('Erro ao enviar para TOTVS:', err);
      setEnviosPorReuniao(prev => ({ ...prev, [chave]: 'erro' }));
    }
  };

  // Handler de confirmação de recomendação TOTVS
  const handleConfirmRecommendation = async (meetingId, productKey, action) => {
    try {
      const res = await api.confirmRecommendation(meetingId, productKey, action);
      if (res.status === 'success') {
        setMeetings(prev => prev.map(m => {
          if (m.ID_MEETING === meetingId) {
            const recs = m.recomendacoes_totvs || m.RESUMO_IA?.recomendacoes_totvs || [];
            const updatedRecs = recs.map(r => r.product_key === productKey ? { ...r, review_status: res.review_status } : r);
            return {
              ...m,
              recomendacoes_totvs: updatedRecs,
              RESUMO_IA: m.RESUMO_IA ? { ...m.RESUMO_IA, recomendacoes_totvs: updatedRecs } : m.RESUMO_IA
            };
          }
          return m;
        }));
      }
    } catch (err) {
      console.error('Erro ao confirmar recomendação:', err);
    }
  };

  // Handler de análise de reunião desacoplada
  const handleAnalyzeMeeting = async (meetingId) => {
    try {
      setIsGeneratingPDF(true);
      setGeneratingMessage('Analisando reunião com Inteligência Artificial...');
      const res = await api.analyzeExistingMeeting(meetingId);
      if (res.status === 'success') {
        await loadMeetings(pagination.page, pagination.page_size);
      }
    } catch (err) {
      console.error('Erro ao analisar reunião:', err);
      alert(`Erro ao processar análise da reunião: ${err.message || err}`);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Handler de reset geral de análises
  const handleResetAllAnalyses = async () => {
    if (!window.confirm('Deseja realmente resetar todas as reuniões para o estado "Aguardando Análise"? Isso permitirá analisar todas as atas novamente pela Inteligência Artificial.')) {
      return;
    }
    try {
      setIsGeneratingPDF(true);
      setGeneratingMessage('Resetando reuniões para nova análise...');
      const res = await api.resetAllAnalyses();
      alert(res.message || 'Todas as reuniões foram resetadas com sucesso!');
      await loadMeetings(1, pagination.page_size);
    } catch (err) {
      console.error('Erro ao resetar reuniões:', err);
      alert('Erro ao resetar reuniões.');
    } finally {
      setIsGeneratingPDF(false);
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

  // Handler de remover webhook TOTVS
  const handleDeleteWebhook = async (sistema) => {
    try {
      await api.deleteIntegracaoConfig(sistema);
      await loadSistemasTotvs();
    } catch (err) {
      console.error('Erro ao remover webhook:', err);
    }
  };

  // DOCX Generation (Executive Minutes — Síntese Estratégica)
  const generateExecutiveDocx = async (rawText, isHistorical = false, meetingId = null, existingData = null, shouldDownload = true) => {
    if (isHistorical && !existingData) {
      alert('Esta reunião ainda não foi analisada pela Inteligência Artificial. Analise a reunião antes de exportar o documento.');
      return null;
    }

    try {
      if (shouldDownload) {
        setIsGeneratingPDF(true);
        setGeneratingMessage('Gerando Ata Executiva em DOCX...');
      }
      const meetingObj = meetings.find(m => String(m.ID_MEETING) === String(meetingId)) || {};
      const analysisData = existingData || meetingObj.RESUMO_IA || {};
      const execSummary = meetingObj.RESUMO_EXECUTIVO || analysisData.resumo_executivo || {};
      const meta = analysisData.analise_metadados || {};

      const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, HeadingLevel } = await import('docx');
      const { saveAs } = await import('file-saver');

      const isFallback = (
        meta.analysis_engine === 'deterministic_fallback' ||
        meta.analysis_status === 'fallback_deterministico' ||
        execSummary.generation_method === 'fallback_generated'
      );

      const children = [];

      children.push(new Paragraph({ text: 'ATA EXECUTIVA DE REUNIÃO', heading: HeadingLevel.TITLE }));
      children.push(new Paragraph('Proton Flow v2.1 • Síntese Estratégica & Apoio à Decisão da Liderança'));
      children.push(new Paragraph(''));

      const dateStr = meetingObj.DT_MEETING || 'Não informada';
      const clientName = meetingObj.client_code && meetingObj.client_code !== 'Não identificado' ? meetingObj.client_code : (meetingObj.NOME_SEGMENTO || 'Não identificado');
      const segmentName = meetingObj.segment || meetingObj.NOME_SEGMENTO || 'Geral';
      const respStr = meetingObj.RESPONSAVEL_REUNIAO || analysisData.responsavel_reuniao || 'Não identificado';
      const urgencyStr = meetingObj.NIVEL_URGENCIA || execSummary.urgency || 'Não Definido';

      const metaTableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(`ID da Reunião: ${meetingId || 'N/A'}`)] }),
            new TableCell({ children: [new Paragraph(`Data: ${dateStr}`)] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(`Cliente: ${clientName}`)] }),
            new TableCell({ children: [new Paragraph(`Segmento: ${segmentName}`)] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(`Facilitador: ${respStr}`)] }),
            new TableCell({ children: [new Paragraph(`Urgência: ${urgencyStr}`)] }),
          ],
        }),
      ];

      children.push(new Table({ rows: metaTableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      children.push(new Paragraph(''));

      if (isFallback) {
        children.push(new Paragraph('AVISO DE CONTINGÊNCIA: Esta síntese foi gerada a partir de regras determinísticas de contingência e requer validação humana antes da tomada de decisão.'));
        children.push(new Paragraph(''));
      }

      // 1. Resumo para Tomada de Decisão
      children.push(new Paragraph({ text: '1. Resumo para Tomada de Decisão', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph(execSummary.summary_for_decision || 'A sessão deliberou sobre direcionamento estratégico e alinhamentos operacionais.'));
      children.push(new Paragraph(''));

      // 2. Situação Atual
      children.push(new Paragraph({ text: '2. Situação Atual', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph(execSummary.current_situation || 'Operação em andamento regular conforme discutido na sessão.'));
      children.push(new Paragraph(''));

      // 3. Impacto para o Negócio
      children.push(new Paragraph({ text: '3. Impacto para o Negócio', heading: HeadingLevel.HEADING_1 }));
      children.push(new Paragraph(execSummary.business_impact || 'Impacto operacional monitorado dentro do planejamento regular.'));
      children.push(new Paragraph(''));

      // 4. Riscos Principais
      children.push(new Paragraph({ text: '4. Riscos Principais & Pontos Críticos', heading: HeadingLevel.HEADING_1 }));
      const risks = execSummary.main_risks || [];
      if (risks.length > 0) {
        risks.forEach(r => {
          children.push(new Paragraph(`• [Severidade: ${r.severity}] ${r.text}`));
        });
      } else {
        children.push(new Paragraph('• Nenhum risco crítico identificado na sessão.'));
      }
      children.push(new Paragraph(''));

      // 5. Decisões Tomadas
      children.push(new Paragraph({ text: '5. Decisões Tomadas na Sessão', heading: HeadingLevel.HEADING_1 }));
      const decisions = execSummary.decisions_made || [];
      if (decisions.length > 0) {
        decisions.forEach(d => {
          children.push(new Paragraph(`• ${d.text}`));
        });
      } else {
        children.push(new Paragraph('• Nenhuma decisão final formalizada na sessão.'));
      }
      children.push(new Paragraph(''));

      // 6. Decisões Necessárias da Liderança
      children.push(new Paragraph({ text: '6. Decisões Necessárias da Liderança', heading: HeadingLevel.HEADING_1 }));
      const required = execSummary.decisions_required || [];
      if (required.length > 0) {
        required.forEach(dr => {
          children.push(new Paragraph(`• [${dr.owner_level || 'Liderança'}]: ${dr.text}`));
        });
      } else {
        children.push(new Paragraph('• Nenhuma decisão pendente de escalonamento.'));
      }
      children.push(new Paragraph(''));

      // 7. Próximos Passos Estratégicos
      children.push(new Paragraph({ text: '7. Próximos Passos Estratégicos', heading: HeadingLevel.HEADING_1 }));
      const steps = execSummary.strategic_next_steps || [];
      if (steps.length > 0) {
        steps.forEach((s, idx) => {
          children.push(new Paragraph(`${idx + 1}. ${s.text} (${s.target_milestone || 'Alinhamento'})`));
        });
      } else {
        children.push(new Paragraph('• Próximos passos operacionais disponíveis na Ata Operacional.'));
      }
      children.push(new Paragraph(''));

      // 8. Recomendação TOTVS
      const rec = execSummary.executive_recommendation;
      if (rec) {
        children.push(new Paragraph({ text: '8. Recomendação TOTVS & Ecossistema', heading: HeadingLevel.HEADING_1 }));
        children.push(new Paragraph(`Produto: ${rec.product_name} (${rec.status})`));
        children.push(new Paragraph(`Justificativa: ${rec.reason}`));
        if (rec.expected_benefits?.length) {
          children.push(new Paragraph(`Benefícios esperados: ${rec.expected_benefits.join(', ')}`));
        }
        children.push(new Paragraph(''));
      }

      // Footer
      children.push(new Paragraph(''));
      children.push(new Paragraph('Documento gerado pelo Proton Flow v2.1 • O plano operacional detalhado com todas as tarefas, prazos e evidências técnicas está disponível na Ata Operacional.'));

      const doc = new Document({
        sections: [{ properties: {}, children }]
      });

      const blob = await Packer.toBlob(doc);
      if (shouldDownload) {
        saveAs(blob, `Ata_Executiva_${meetingId || 'ProtonFlow'}.docx`);
      }
      return { doc, blob };

    } catch (err) {
      console.error('Erro ao gerar DOCX Executivo:', err);
      alert('Ocorreu um erro ao gerar o DOCX Executivo.');
      return null;
    } finally {
      if (shouldDownload) {
        setIsGeneratingPDF(false);
      }
    }
  };

  // PDF Generation (Executive Minutes — 1-2 Páginas Síntese Decisória)
  const generateExecutivePDF = async (rawText, isHistorical = false, meetingId = null, existingData = null, shouldDownload = true) => {
    if (isHistorical && !existingData) {
      alert('Esta reunião ainda não foi analisada pela Inteligência Artificial. Analise a reunião antes de exportar o documento.');
      return null;
    }

    if (shouldDownload) {
      setIsGeneratingPDF(true);
      setGeneratingMessage('Gerando Ata Executiva em PDF a partir dos dados estruturados...');
    }

    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const meetingObj = meetings.find(m => String(m.ID_MEETING) === String(meetingId)) || {};
      const analysisData = existingData || meetingObj.RESUMO_IA || {};
      const execSummary = meetingObj.RESUMO_EXECUTIVO || analysisData.resumo_executivo || {};
      const meta = analysisData.analise_metadados || {};

      // Ordena riscos por severidade: quem le este documento precisa ver o
      // mais grave primeiro, nao a ordem em que a IA devolveu.
      const severityRank = (s) => {
        const v = String(s || '').toLowerCase();
        if (v.includes('crít') || v.includes('crit')) return 0;
        if (v.includes('alta')) return 1;
        if (v.includes('méd') || v.includes('med')) return 2;
        return 3;
      };

      // Uma acao sem dono ou sem prazo nao vai acontecer. Sinalizar isso e
      // acionavel para a lideranca: e o que ela consegue resolver na hora.
      const semDefinicao = (v) => !v || /não\s+(identificado|mencionado|definido)/i.test(String(v));

      const doc = new jsPDF();

      // Cabeçalho TOTVS Azul Escuro Corporativo
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 36, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(17);
      doc.setFont('helvetica', 'bold');
      doc.text('Proton Flow — Ata Executiva de Reunião', 15, 17);
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.text('Síntese Estratégica & Apoio à Decisão da Liderança', 15, 26);

      // Identidade e Metadados
      const idStatus = meetingObj.client_identity_status || 'unknown';
      const rawSeg = meetingObj.NOME_SEGMENTO || '';
      const rawSegClean = rawSeg.trim().toUpperCase();

      let clientName = 'Não identificado (Sem cliente específico)';
      let segmentName = meetingObj.segment || 'Geral';
      let meetingSourceDisplay = meetingObj.meeting_source === 'ao_vivo' || rawSegClean === 'AO VIVO' ? 'Ao Vivo' : 'Reunião Gravada';

      if (idStatus === 'segment_only' || ['SERVICOS', 'SERVIÇOS', 'FINANCEIRO', 'LOGISTICA', 'LOGÍSTICA', 'VAREJO', 'SAUDE', 'SAÚDE', 'EDUCACAO', 'EDUCAÇÃO', 'AGRO', 'TECNOLOGIA'].includes(rawSegClean)) {
        clientName = 'Não identificado (Somente segmento)';
        segmentName = rawSegClean === 'SERVICOS' || rawSegClean === 'SERVIÇOS' ? 'Serviços' : (rawSeg ? rawSeg.charAt(0).toUpperCase() + rawSeg.slice(1).toLowerCase() : 'Serviços');
      } else if (idStatus === 'live_meeting' || rawSegClean === 'AO VIVO') {
        clientName = 'Não identificado (Reunião ao vivo)';
        segmentName = meetingObj.segment || 'Geral';
        meetingSourceDisplay = 'Ao Vivo';
      } else if (idStatus === 'valid_client' && meetingObj.client_code && meetingObj.client_code !== 'Não identificado') {
        clientName = meetingObj.client_code;
        segmentName = meetingObj.segment || 'Geral';
      } else if (meetingObj.client_code && !['SERVICOS', 'SERVIÇOS', 'AO VIVO', 'Ao Vivo', 'GERAL', 'Geral', 'Não identificado'].includes(meetingObj.client_code.trim())) {
        clientName = meetingObj.client_code;
        segmentName = meetingObj.segment || 'Geral';
      }

      const dateStr = meetingObj.DT_MEETING || 'Não informada';
      const respStr = meetingObj.RESPONSAVEL_REUNIAO || analysisData.responsavel_reuniao || 'Não identificado';
      const urgencyStr = meetingObj.NIVEL_URGENCIA || execSummary.urgency || 'Não Definido';

      const isFallback = (
        meta.analysis_engine === 'deterministic_fallback' ||
        meta.analysis_status === 'fallback_deterministico' ||
        meta.analysis_status === 'analise_contingencia_tarefas_pendentes' ||
        meetingObj.STATUS_ANALISE === 'fallback_deterministico' ||
        execSummary.generation_method === 'fallback_generated'
      );

      const isUnanalyzed = !analysisData || Object.keys(analysisData).length === 0;

      // 1. Grid de Metadados
      const meetingIdDisplay = meetingId ? (meetingId.length > 12 ? `${meetingId.substring(0, 12)}...` : meetingId) : 'N/A';
      const metaRows = [
        [
          `ID: ${meetingIdDisplay}`,
          `Data: ${dateStr}`
        ],
        [
          `Cliente: ${clientName}`,
          `Segmento: ${segmentName}`
        ],
        [
          `Origem: ${meetingSourceDisplay}`,
          `Facilitador: ${respStr}`
        ],
        [
          `Nível de Urgência: ${urgencyStr}`,
          `Status: ${isFallback ? 'Contingência' : 'Análise Concluída'}`
        ]
      ];

      autoTable(doc, {
        startY: 40,
        body: metaRows,
        theme: 'plain',
        styles: {
          fontSize: 8.5,
          cellPadding: 1.8,
          textColor: [51, 65, 85],
          overflow: 'linebreak'
        },
        columnStyles: {
          0: { cellWidth: 95, fontStyle: 'bold' },
          1: { cellWidth: 85, fontStyle: 'normal' }
        },
        margin: { left: 15, right: 15 },
        tableLineColor: [226, 232, 240],
        tableLineWidth: 0.5
      });

      let currentY = doc.lastAutoTable.finalY + 4;

      if (isFallback) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        const bannerText = 'AVISO DE CONTINGÊNCIA: Esta síntese executiva foi gerada a partir de regras determinísticas de contingência. Recomenda-se validação humana antes da tomada de decisão formal.';
        const splitBanner = doc.splitTextToSize(bannerText, 172);
        const bannerH = (splitBanner.length * 3.8) + 4;

        doc.setFillColor(254, 243, 199);
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.4);
        doc.roundedRect(15, currentY, 180, bannerH, 2, 2, 'FD');

        doc.setTextColor(180, 83, 9);
        doc.text(splitBanner, 19, currentY + 3.8);
        currentY += bannerH + 4;
      }

      if (isUnanalyzed) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 38, 38);
        doc.text('Reunião ainda não analisada. Analise a reunião antes de exportar a Ata Executiva.', 15, currentY + 5);
        currentY += 15;
      } else {
        // 1. Resumo para Tomada de Decisão
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('1. Resumo para Tomada de Decisão', 15, currentY);
        currentY += 4.5;

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 41, 59);
        const summaryText = execSummary.summary_for_decision || (analysisData.tema ? `A sessão deliberou sobre ${analysisData.tema}.` : 'Alinhamento geral sobre direcionamento operacional.');
        const splitSummary = doc.splitTextToSize(summaryText, 180);
        
        doc.setFillColor(240, 253, 244);
        doc.setDrawColor(187, 247, 208);
        doc.setLineWidth(0.3);
        const summaryBoxH = (splitSummary.length * 3.8) + 5;
        doc.roundedRect(15, currentY, 180, summaryBoxH, 2, 2, 'FD');
        doc.setTextColor(20, 83, 45);
        doc.text(splitSummary, 18, currentY + 4);
        currentY += summaryBoxH + 4.5;

        // 2 & 3. Situação Atual e Impacto para o Negócio
        const sitText = execSummary.current_situation || 'Operação em andamento regular conforme discutido na sessão.';
        const impText = execSummary.business_impact || 'Impacto operacional monitorado dentro do planejamento regular.';

        const splitSit = doc.splitTextToSize(sitText, 82);
        const splitImp = doc.splitTextToSize(impText, 82);
        const maxLines = Math.max(splitSit.length, splitImp.length);
        const gridH = (maxLines * 3.8) + 10;

        if (currentY + gridH > 270) {
          doc.addPage();
          currentY = 20;
        }

        autoTable(doc, {
          startY: currentY,
          head: [['2. Situação Atual', '3. Impacto para o Negócio']],
          body: [[sitText, impText]],
          theme: 'grid',
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
          bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 2.5 },
          columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } },
          margin: { left: 15, right: 15 }
        });
        currentY = doc.lastAutoTable.finalY + 4.5;

        // 4. Riscos Principais & Pontos Críticos
        const risks = execSummary.main_risks || [];
        if (currentY + (risks.length * 6) + 15 > 270) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(185, 28, 28);
        doc.text('4. Riscos Principais & Pontos Críticos', 15, currentY);
        currentY += 4.5;

        if (risks.length > 0) {
          const riskRows = [...risks]
            .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
            .map(r => [
              r.text,
              r.severity || 'Média',
              r.source_refs?.length ? r.source_refs.join(', ') : 'Sessão'
            ]);

          autoTable(doc, {
            startY: currentY,
            head: [['Risco / Ponto de Atenção', 'Severidade', 'Evidência / Ref']],
            body: riskRows,
            theme: 'grid',
            headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 7.8, textColor: [51, 65, 85], cellPadding: 1.8 },
            columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 35 }, 2: { cellWidth: 35 } },
            margin: { left: 15, right: 15 }
          });
          currentY = doc.lastAutoTable.finalY + 4.5;
        } else {
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(148, 163, 184);
          doc.text('• Nenhum risco crítico identificado na sessão.', 15, currentY);
          currentY += 5;
        }

        // 5 & 6. Decisões Tomadas vs Decisões Necessárias
        const decisions = execSummary.decisions_made || [];
        const required = execSummary.decisions_required || [];

        const decTextList = decisions.length > 0
          ? decisions.map(d => `• ${d.text}`).join('\n')
          : 'Nenhuma decisão final formalizada na sessão.';
        const reqTextList = required.length > 0
          ? required.map(dr => `• [${dr.owner_level || 'Liderança'}]: ${dr.text}`).join('\n')
          : 'Nenhuma decisão pendente de escalonamento.';

        if (currentY + 25 > 270) {
          doc.addPage();
          currentY = 20;
        }

        autoTable(doc, {
          startY: currentY,
          head: [['5. Decisões Tomadas na Sessão', '6. Decisões Necessárias da Liderança']],
          body: [[decTextList, reqTextList]],
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 7.8, textColor: [51, 65, 85], cellPadding: 2.2 },
          columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } },
          margin: { left: 15, right: 15 }
        });
        currentY = doc.lastAutoTable.finalY + 4.5;

        // 7. Próximos Passos Estratégicos (max 3)
        const nextSteps = execSummary.strategic_next_steps || [];
        if (nextSteps.length > 0) {
          if (currentY + (nextSteps.length * 6) + 12 > 270) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFontSize(10.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(2, 132, 199);
          doc.text('7. Próximos Passos Estratégicos', 15, currentY);
          currentY += 4.5;

          const stepRows = nextSteps.map((s, idx) => [
            `${idx + 1}`,
            s.text,
            s.target_milestone || 'Alinhamento'
          ]);

          autoTable(doc, {
            startY: currentY,
            head: [['#', 'Marco Estratégico', 'Referência / Meta']],
            body: stepRows,
            theme: 'grid',
            headStyles: { fillColor: [2, 132, 199], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 7.8, textColor: [51, 65, 85], cellPadding: 1.8 },
            columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 125 }, 2: { cellWidth: 45 } },
            margin: { left: 15, right: 15 }
          });
          currentY = doc.lastAutoTable.finalY + 4.5;
        }

        // 7.1 Lacunas de Execução (acoes sem dono ou sem prazo)
        const tarefasValidas = (analysisData.tarefas || []).filter(
          t => (t.task_validation_status || 'valid') === 'valid'
        );
        const lacunas = tarefasValidas.filter(
          t => semDefinicao(t.responsavel) || semDefinicao(t.prazo)
        );

        if (lacunas.length > 0) {
          if (currentY + (lacunas.length * 6) + 15 > 270) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFontSize(10.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(217, 119, 6);
          doc.text(
            `7.1 Lacunas de Execução (${lacunas.length} de ${tarefasValidas.length} ações)`,
            15,
            currentY
          );
          currentY += 4.5;

          autoTable(doc, {
            startY: currentY,
            head: [['Ação Acordada', 'Responsável', 'Prazo']],
            body: lacunas.map(t => [
              t.tarefa || 'Não mencionado',
              semDefinicao(t.responsavel) ? 'SEM DONO' : t.responsavel,
              semDefinicao(t.prazo) ? 'SEM PRAZO' : t.prazo
            ]),
            theme: 'grid',
            headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 7.8, textColor: [51, 65, 85], cellPadding: 1.8 },
            columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 35 }, 2: { cellWidth: 35 } },
            margin: { left: 15, right: 15 },
            didParseCell: (data) => {
              if (data.section === 'body' && data.column.index > 0 && String(data.cell.raw).indexOf('SEM ') === 0) {
                data.cell.styles.textColor = [217, 119, 6];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          });
          currentY = doc.lastAutoTable.finalY + 4.5;
        }

        // 8. Recomendação TOTVS & Ecossistema
        const execRec = execSummary.executive_recommendation;
        if (execRec) {
          if (currentY + 20 > 270) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFontSize(10.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(0, 160, 230);
          doc.text(`8. Recomendação TOTVS: ${execRec.product_name} (${execRec.status})`, 15, currentY);
          currentY += 4.5;

          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(51, 65, 85);
          const recText = `${execRec.reason}${execRec.expected_benefits?.length ? ` Benefícios: ${execRec.expected_benefits.join(', ')}` : ''}`;
          const splitRec = doc.splitTextToSize(recText, 180);
          doc.text(splitRec, 15, currentY);
          currentY += (splitRec.length * 3.8) + 4;
        }

        // 9. Informações Faltantes (se houver)
        const missing = execSummary.missing_information || [];
        if (missing.length > 0) {
          if (currentY + 15 > 270) {
            doc.addPage();
            currentY = 20;
          }
          doc.setFontSize(7.8);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(185, 28, 28);
          doc.text(`• Pontos não identificados na sessão: ${missing.join('; ')}`, 15, currentY);
          currentY += 4.5;
        }
      }

      // Rodapé em todas as páginas
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);

        const footerText = 'Proton Flow v2.1 • Ata Executiva • Detalhamento de tarefas e evidências disponível na Ata Operacional.';
        doc.text(footerText, 15, 290);
        doc.text(`Página ${i} de ${pageCount}`, 180, 290);
      }

      const pdfBlob = doc.output('blob');
      const pdfBlobUrl = URL.createObjectURL(pdfBlob);

      if (shouldDownload) {
        doc.save(`Ata_Executiva_${meetingId || 'ProtonFlow'}.pdf`);
      }

      return { doc, blob: pdfBlob, blobUrl: pdfBlobUrl };

    } catch (err) {
      console.error('Erro ao gerar PDF Executivo:', err);
      alert('Ocorreu um erro ao gerar o PDF Executivo.');
      return null;
    } finally {
      if (shouldDownload) {
        setIsGeneratingPDF(false);
      }
    }
  };

  // DOCX Generation (Dynamic import, Table Metadata, Zero Placeholders & Zero AI Calls)
  const generateDocx = async (rawText, isHistorical = false, meetingId = null, existingData = null, shouldDownload = true) => {
    if (isHistorical && !existingData) {
      alert('Esta reunião ainda não foi analisada pela Inteligência Artificial. Analise a reunião antes de exportar o documento.');
      return null;
    }

    try {
      if (shouldDownload) {
        setIsGeneratingPDF(true);
        setGeneratingMessage('Gerando Documento DOCX...');
      }
      const meetingObj = meetings.find(m => String(m.ID_MEETING) === String(meetingId)) || {};
      const analysisData = existingData || meetingObj.RESUMO_IA || {};
      const meta = analysisData.analise_metadados || {};

      const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType, HeadingLevel } = await import('docx');
      const { saveAs } = await import('file-saver');

      const isFallback = isFallbackAnalysis(meta, meetingObj.STATUS_ANALISE);
      const isInsufficient = (meta.analysis_status === 'analise_concluida_dados_insuficientes' || meta.analysis_status === 'reuniao_sem_conteudo_estruturado');

      const children = [];

      children.push(new Paragraph(''));

      // Identidade e Metadados
      const idStatus = meetingObj.client_identity_status || 'unknown';
      const rawSeg = meetingObj.NOME_SEGMENTO || '';
      const rawSegClean = rawSeg.trim().toUpperCase();

      let clientName = 'Não identificado (Sem cliente específico)';
      let segmentName = meetingObj.segment || 'Geral';
      let meetingSourceDisplay = meetingObj.meeting_source === 'ao_vivo' || rawSegClean === 'AO VIVO' ? 'Ao Vivo' : 'Reunião Gravada';

      if (idStatus === 'segment_only' || ['SERVICOS', 'SERVIÇOS', 'FINANCEIRO', 'LOGISTICA', 'LOGÍSTICA', 'VAREJO', 'SAUDE', 'SAÚDE', 'EDUCACAO', 'EDUCAÇÃO', 'AGRO', 'TECNOLOGIA'].includes(rawSegClean)) {
        clientName = 'Não identificado (Somente segmento)';
        if (!meetingObj.segment || meetingObj.segment === 'Geral') {
          segmentName = rawSegClean === 'SERVICOS' || rawSegClean === 'SERVIÇOS' ? 'Serviços' : (rawSeg ? rawSeg.charAt(0).toUpperCase() + rawSeg.slice(1).toLowerCase() : 'Serviços');
        } else {
          segmentName = meetingObj.segment;
        }
      } else if (idStatus === 'live_meeting' || rawSegClean === 'AO VIVO') {
        clientName = 'Não identificado (Reunião ao vivo)';
        segmentName = meetingObj.segment || 'Geral';
        meetingSourceDisplay = 'Ao Vivo';
      } else if (idStatus === 'valid_client' && meetingObj.client_code && meetingObj.client_code !== 'Não identificado') {
        clientName = meetingObj.client_code;
        segmentName = meetingObj.segment || 'Geral';
      } else if (meetingObj.client_code && !['SERVICOS', 'SERVIÇOS', 'AO VIVO', 'Ao Vivo', 'GERAL', 'Geral', 'Não identificado'].includes(meetingObj.client_code.trim())) {
        clientName = meetingObj.client_code;
        segmentName = meetingObj.segment || 'Geral';
      } else {
        clientName = 'Não identificado (Sem cliente específico)';
        segmentName = meetingObj.segment || 'Geral';
      }

      const dateStr = meetingObj.DT_MEETING || 'Não informada';
      const respStr = meetingObj.RESPONSAVEL_REUNIAO || (analysisData ? analysisData.responsavel_reuniao : 'Não identificado');

      const isUnanalyzed = !analysisData || Object.keys(analysisData).length === 0;

      let statusAnaliseDisplay = 'Análise de IA concluída (Ollama/Llama)';
      if (isUnanalyzed) {
        statusAnaliseDisplay = 'Aguardando Análise de IA';
      } else if (isFallback) {
        statusAnaliseDisplay = 'Fallback determinístico de contingência';
      } else if (isInsufficient) {
        statusAnaliseDisplay = 'Análise concluída com dados insuficientes';
      }

      const isReviewed = meetingObj.STATUS_REVISAO === 'revisao_concluida';
      const reviewStatusDisplay = isReviewed ? 'Revisão humana concluída' : 'Revisão humana pendente';

      // Tabela de Metadados em DOCX (2 Colunas)
      const metaTableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(`ID da Reunião: ${meetingId || 'N/A'}`)] }),
            new TableCell({ children: [new Paragraph(`Data: ${dateStr}`)] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(`Cliente: ${clientName}`)] }),
            new TableCell({ children: [new Paragraph(`Segmento: ${segmentName}`)] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(`Origem: ${meetingSourceDisplay}`)] }),
            new TableCell({ children: [new Paragraph(`Facilitador / Responsável: ${respStr}`)] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(`Status da Análise: ${statusAnaliseDisplay}`)] }),
            new TableCell({ children: [new Paragraph(`Status da Revisão: ${reviewStatusDisplay}`)] }),
          ],
        }),
      ];

      children.push(new Table({ rows: metaTableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      children.push(new Paragraph(''));

      if (isFallback) {
        children.push(new Paragraph('ATENÇÃO: Análise automática indisponível. Este documento contém apenas a classificação determinística de contingência e requer revisão humana obrigatória antes da tomada de decisão.'));
        children.push(new Paragraph(''));
      }

      if (isInsufficient) {
        children.push(new Paragraph('NOTA: Análise concluída com dados insuficientes para extração estruturada de temas, dores ou tarefas. Recomenda-se revisão humana dos tópicos discutidos.'));
        children.push(new Paragraph(''));
      }

      if (isUnanalyzed) {
        children.push(new Paragraph({ text: 'Status da Análise:', heading: HeadingLevel.HEADING_1 }));
        children.push(new Paragraph('Esta reunião ainda não foi analisada. Analise a reunião antes de exportar o documento.'));
      } else {
        // 1. Resumo Executivo & Contexto
        children.push(new Paragraph({ text: '1. Resumo Executivo & Contexto', heading: HeadingLevel.HEADING_1 }));
        children.push(new Paragraph(`Tema Principal: ${analysisData.tema || 'Não identificado'}`));
        if (analysisData.contexto) {
          if (analysisData.contexto.problema) children.push(new Paragraph(`Problema/Pauta: ${analysisData.contexto.problema}`));
          if (analysisData.contexto.decisao) children.push(new Paragraph(`Decisões Registradas: ${analysisData.contexto.decisao}`));
        }
        children.push(new Paragraph(''));

        // Organização por Temas (se houver)
        if (analysisData.organizacao_por_temas && analysisData.organizacao_por_temas.length > 0) {
          children.push(new Paragraph({ text: 'Temas Discutidos', heading: HeadingLevel.HEADING_2 }));
          analysisData.organizacao_por_temas.forEach(t => {
            const tName = t.tema || t.tema_canonico || 'Geral';
            children.push(new Paragraph(`• ${tName.toUpperCase()}`));
            if (t.topicos) {
              t.topicos.forEach(topico => {
                children.push(new Paragraph(`    - ${topico}`));
              });
            }
          });
          children.push(new Paragraph(''));
        }

        // 2. Dores & Alertas Mapeados
        children.push(new Paragraph({ text: '2. Dores & Gargalos Identificados', heading: HeadingLevel.HEADING_1 }));
        if (analysisData.dores && analysisData.dores.length > 0) {
          analysisData.dores.forEach(dor => {
            const isObj = typeof dor === 'object' && dor !== null;
            const textoDor = isObj ? `${dor.label || dor.categoria} (${dor.severidade || 'Alta'}): ${dor.trecho || dor.descricao}` : dor;
            children.push(new Paragraph(`• ${textoDor}`));
          });
        } else {
          children.push(new Paragraph('• Dados insuficientes: nenhuma dor ou gargalo operacional identificado na transcrição disponível.'));
        }
        children.push(new Paragraph(''));

        // 3. Plano de Ação & Prazos
        children.push(new Paragraph({ text: '3. Plano de Ação & Prazos Operacionais', heading: HeadingLevel.HEADING_1 }));
        const confirmedDocxTasks = (analysisData.tarefas || []).filter(t => (t.task_validation_status || 'valid') === 'valid');
        const pendingDocxTasks = (analysisData.tarefas || []).filter(t => t.task_validation_status === 'pending_review');

        if (confirmedDocxTasks.length > 0) {
          const rows = [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('Responsável')] }),
                new TableCell({ children: [new Paragraph('Ação Operacional')] }),
                new TableCell({ children: [new Paragraph('Prazo')] }),
                new TableCell({ children: [new Paragraph('Status')] }),
              ],
            })
          ];
          confirmedDocxTasks.forEach(t => {
            rows.push(new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(t.responsavel || 'Não identificado')] }),
                new TableCell({ children: [new Paragraph(t.tarefa || 'Não mencionado')] }),
                new TableCell({ children: [new Paragraph(t.prazo || 'Não mencionado')] }),
                new TableCell({ children: [new Paragraph(t.status || 'Não Inicializado')] }),
              ],
            }));
          });
          children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        } else {
          children.push(new Paragraph('• Nenhuma ação operacional confirmada identificada na transcrição disponível.'));
        }
        children.push(new Paragraph(''));

        if (pendingDocxTasks.length > 0) {
          children.push(new Paragraph({ text: '3.1 Itens Pendentes de Validação Humana', heading: HeadingLevel.HEADING_2 }));
          children.push(new Paragraph('Nota: As ações abaixo foram extraídas com escopo resumido e requerem confirmação humana antes da execução.'));
          const pendingRows = [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph('Responsável Sugerido')] }),
                new TableCell({ children: [new Paragraph('Ação / Sugestão Preliminar')] }),
                new TableCell({ children: [new Paragraph('Prazo Sugerido')] }),
                new TableCell({ children: [new Paragraph('Validação')] }),
              ],
            })
          ];
          pendingDocxTasks.forEach(t => {
            pendingRows.push(new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(t.responsavel || 'Não identificado')] }),
                new TableCell({ children: [new Paragraph(t.tarefa || 'Não mencionado')] }),
                new TableCell({ children: [new Paragraph(t.prazo || 'Não mencionado')] }),
                new TableCell({ children: [new Paragraph('Pendente de Revisão')] }),
              ],
            }));
          });
          children.push(new Table({ rows: pendingRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
          children.push(new Paragraph(''));
        }

        // 4. Recomendações TOTVS
        const recs = analysisData.recomendacoes_totvs || meetingObj.recomendacoes_totvs || [];
        if (recs && recs.length > 0) {
          children.push(new Paragraph({ text: '4. Recomendações TOTVS & Ecossistema', heading: HeadingLevel.HEADING_1 }));
          recs.forEach(r => {
            const fitPct = Math.round((r.fit_score || 0) * 100);
            children.push(new Paragraph(`• ${r.product_name} (Adequação: ${fitPct}%, Status: ${r.review_status || 'Pendente'})`));
            if (r.why_recommended) children.push(new Paragraph(`    Justificativa preliminar: ${r.why_recommended}`));
          });
          children.push(new Paragraph(''));
        } else {
          children.push(new Paragraph({ text: '4. Recomendações TOTVS & Ecossistema', heading: HeadingLevel.HEADING_1 }));
          children.push(new Paragraph('• Nenhuma recomendação confiável encontrada com base nos dados disponíveis.'));
          children.push(new Paragraph(''));
        }

        // 5. Qualidade da Análise
        children.push(new Paragraph({ text: '5. Qualidade & Parâmetros da Análise', heading: HeadingLevel.HEADING_1 }));
        const totalTemas = (analysisData.organizacao_por_temas?.length || (analysisData.tema && analysisData.tema !== 'Não identificado' ? 1 : 0));
        const totalDores = analysisData.dores?.length || 0;
        const totalTarefas = analysisData.tarefas?.length || 0;
        const confTecnica = isFallback ? 'Execução determinística de contingência' : 'Processamento concluído com sucesso';
        const confSemantica = isInsufficient ? 'Dados insuficientes / Baixa' : (isFallback ? 'Média (65%) — Palavras-chave' : (totalTemas === 0 ? 'Parcial (55%) — Pendente de validação' : 'Alta (85%) — Evidências mapeadas'));
        let diagnostico = 'Análise estruturada completa realizada com sucesso.';
        if (isInsufficient) {
          diagnostico = 'Nenhuma informação estruturada foi extraída com segurança (revisão humana necessária).';
        } else if (isFallback) {
          diagnostico = totalTarefas > 0 ? 'Análise de contingência concluída com dados parciais. As tarefas identificadas dependem de validação humana.' : 'Classificação de contingência preliminar — requer validação humana obrigatória.';
        } else if (totalTemas === 0 && (totalDores > 0 || totalTarefas > 0)) {
          diagnostico = 'Análise parcial: tópicos extraídos sem tema central consolidado; dores e tarefas pendentes de validação humana.';
        }

        children.push(new Paragraph(`- Método de Síntese: ${isFallback ? 'Fallback determinístico de contingência' : 'Ollama / Llama (Inteligência Artificial)'}`));
        children.push(new Paragraph(`- Modelo / Versão: ${meta.model_name || meta.model || (isFallback ? 'Regras Determinísticas' : 'llama3:latest')} (Prompt v${meta.prompt_version || '2.1.0'})`));
        children.push(new Paragraph(`- Confiança Técnica: ${confTecnica} | Confiança Semântica: ${confSemantica}`));
        children.push(new Paragraph(`- Mapeamento Quantitativo: ${totalTemas} tema(s) | ${totalDores} dor(es) | ${totalTarefas} tarefa(s)`));
        children.push(new Paragraph(`- Diagnóstico de Qualidade: ${diagnostico}`));
        children.push(new Paragraph(''));
      }

      children.push(new Paragraph(''));
      let footerText = 'Documento gerado pelo Proton Flow v2.1 • Conteúdo gerado por IA — revisão humana pendente.';
      if (isUnanalyzed) {
        footerText = 'Documento gerado pelo Proton Flow v2.1 • Reunião ainda não analisada.';
      } else if (isReviewed) {
        footerText = 'Documento gerado pelo Proton Flow v2.1 • Revisão humana concluída.';
      } else if (isFallback) {
        footerText = 'Documento gerado pelo Proton Flow v2.1 • Fallback determinístico — revisão obrigatória.';
      } else if (isInsufficient) {
        footerText = 'Documento gerado pelo Proton Flow v2.1 • Análise concluída com dados insuficientes.';
      }
      children.push(new Paragraph(footerText));

      const doc = new Document({
        sections: [{ properties: {}, children }]
      });

      const blob = await Packer.toBlob(doc);
      if (shouldDownload) {
        saveAs(blob, `Ata_Reuniao_${meetingId || 'ProtonFlow'}.docx`);
      }
      return { doc, blob };

    } catch (err) {
      console.error('Erro ao gerar DOCX:', err);
      alert('Ocorreu um erro ao gerar o DOCX.');
      return null;
    } finally {
      if (shouldDownload) {
        setIsGeneratingPDF(false);
      }
    }
  };

  // PDF Generation (Dynamic import, Table Metadata Grid, Zero Placeholders & Zero AI Calls)
  const generatePDF = async (rawText, isHistorical = false, meetingId = null, existingData = null, shouldDownload = true) => {
    if (isHistorical && !existingData) {
      alert('Esta reunião ainda não foi analisada pela Inteligência Artificial. Analise a reunião antes de exportar o documento.');
      return null;
    }

    if (shouldDownload) {
      setIsGeneratingPDF(true);
      setGeneratingMessage('Gerando ata operacional em PDF a partir dos dados persistidos...');
    }

    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const analysisData = existingData;
      const doc = new jsPDF();
      
      // Cabeçalho TOTVS Azul Escuro Corporativo
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 36, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Proton Flow — Ata Executiva de Reunião', 15, 18);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Inteligência Estruturante de Reuniões & Ecossistema TOTVS', 15, 27);
      
      doc.setTextColor(30, 41, 59);

      // Identidade e Metadados Estruturados
      const meetingObj = meetings.find(m => m.ID_MEETING === meetingId) || {};
      const idStatus = meetingObj.client_identity_status || 'unknown';
      const rawSeg = meetingObj.NOME_SEGMENTO || '';
      const rawSegClean = rawSeg.trim().toUpperCase();

      let clientName = 'Não identificado (Sem cliente específico)';
      let segmentName = meetingObj.segment || 'Geral';
      let meetingSourceDisplay = meetingObj.meeting_source === 'ao_vivo' || rawSegClean === 'AO VIVO' ? 'Ao Vivo' : 'Reunião Gravada';

      if (idStatus === 'segment_only' || ['SERVICOS', 'SERVIÇOS', 'FINANCEIRO', 'LOGISTICA', 'LOGÍSTICA', 'VAREJO', 'SAUDE', 'SAÚDE', 'EDUCACAO', 'EDUCAÇÃO', 'AGRO', 'TECNOLOGIA'].includes(rawSegClean)) {
        clientName = 'Não identificado (Somente segmento)';
        if (!meetingObj.segment || meetingObj.segment === 'Geral') {
          segmentName = rawSegClean === 'SERVICOS' || rawSegClean === 'SERVIÇOS' ? 'Serviços' : (rawSeg ? rawSeg.charAt(0).toUpperCase() + rawSeg.slice(1).toLowerCase() : 'Serviços');
        } else {
          segmentName = meetingObj.segment;
        }
      } else if (idStatus === 'live_meeting' || rawSegClean === 'AO VIVO') {
        clientName = 'Não identificado (Reunião ao vivo)';
        segmentName = meetingObj.segment || 'Geral';
        meetingSourceDisplay = 'Ao Vivo';
      } else if (idStatus === 'valid_client' && meetingObj.client_code && meetingObj.client_code !== 'Não identificado') {
        clientName = meetingObj.client_code;
        segmentName = meetingObj.segment || 'Geral';
      } else if (meetingObj.client_code && !['SERVICOS', 'SERVIÇOS', 'AO VIVO', 'Ao Vivo', 'GERAL', 'Geral', 'Não identificado'].includes(meetingObj.client_code.trim())) {
        clientName = meetingObj.client_code;
        segmentName = meetingObj.segment || 'Geral';
      } else {
        clientName = 'Não identificado (Sem cliente específico)';
        segmentName = meetingObj.segment || 'Geral';
      }

      const dateStr = meetingObj.DT_MEETING || 'Não informada';
      const respStr = meetingObj.RESPONSAVEL_REUNIAO || (analysisData ? analysisData.responsavel_reuniao : 'Não identificado');

      const isUnanalyzed = !analysisData;
      const meta = analysisData?.analise_metadados || {};
      const isFallback = meta.analysis_engine === 'deterministic_fallback' || meta.engine === 'deterministic_fallback' || meetingObj.STATUS_ANALISE === 'fallback_deterministico' || meetingObj.STATUS_ANALISE === 'analise_contingencia_tarefas_pendentes';
      const isInsufficient = meta.status === 'insufficient_data' || meta.analysis_status === 'analise_concluida_dados_insuficientes' || meetingObj.STATUS_ANALISE === 'analise_concluida_dados_insuficientes';

      let statusAnaliseDisplay = 'Análise de IA concluída (Ollama/Llama)';
      if (isUnanalyzed) {
        statusAnaliseDisplay = 'Aguardando Análise de IA';
      } else if (isFallback) {
        statusAnaliseDisplay = meta.analysis_status === 'analise_contingencia_tarefas_pendentes' ? 'Análise de contingência (tarefas pendentes)' : 'Fallback determinístico de contingência';
      } else if (isInsufficient) {
        statusAnaliseDisplay = 'Análise concluída com dados insuficientes';
      }

      const isReviewed = meetingObj.STATUS_REVISAO === 'revisao_concluida';
      const reviewStatusDisplay = isReviewed ? 'Revisão humana concluída' : 'Revisão humana pendente';

      // Visual abreviado do ID se for longo
      const meetingIdDisplay = meetingId ? (meetingId.length > 12 ? `${meetingId.substring(0, 12)}...` : meetingId) : 'N/A';

      // 1. Grid Estruturado de Metadados via autoTable (Zero Sobreposição / Auto-wrap seguro)
      const metaDataRows = [
        [
          `ID: ${meetingIdDisplay}`,
          `Data: ${dateStr}`
        ],
        [
          `Cliente: ${clientName}`,
          `Segmento: ${segmentName}`
        ],
        [
          `Origem: ${meetingSourceDisplay}`,
          `Facilitador / Responsável: ${respStr}`
        ],
        [
          `Status da Análise: ${statusAnaliseDisplay}`,
          `Status da Revisão: ${reviewStatusDisplay}`
        ]
      ];

      autoTable(doc, {
        startY: 40,
        body: metaDataRows,
        theme: 'plain',
        styles: {
          fontSize: 8.5,
          cellPadding: 2.0,
          textColor: [51, 65, 85],
          overflow: 'linebreak'
        },
        columnStyles: {
          0: { cellWidth: 95, fontStyle: 'bold' },
          1: { cellWidth: 85, fontStyle: 'normal' }
        },
        margin: { left: 15, right: 15 },
        tableLineColor: [226, 232, 240],
        tableLineWidth: 0.5
      });

      let currentY = doc.lastAutoTable.finalY + 5;

      // 2. Banner de Fallback de Contingência (Sem emojis incompatíveis)
      if (isFallback) {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        const bannerText = 'ATENÇÃO: Análise automática indisponível. Este documento contém apenas classificação determinística de contingência e requer revisão humana obrigatória antes da tomada de decisão.';
        const splitBanner = doc.splitTextToSize(bannerText, 172); // 180mm útil - 8mm padding interno
        const bannerH = (splitBanner.length * 4.0) + 5;

        doc.setFillColor(254, 243, 199);
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.4);
        doc.roundedRect(15, currentY, 180, bannerH, 2, 2, 'FD');

        doc.setTextColor(180, 83, 9);
        doc.text(splitBanner, 19, currentY + 4.2);
        currentY += bannerH + 5;
      }

      // 3. Banner de Dados Insuficientes (Sem emojis incompatíveis)
      if (isInsufficient) {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        const infoText = 'NOTA: Análise concluída com dados insuficientes para extração estruturada de temas, dores ou tarefas. Recomenda-se revisão humana dos tópicos discutidos.';
        const splitInfo = doc.splitTextToSize(infoText, 172);
        const infoH = (splitInfo.length * 4.0) + 5;

        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.roundedRect(15, currentY, 180, infoH, 2, 2, 'FD');

        doc.setTextColor(71, 85, 105);
        doc.text(splitInfo, 19, currentY + 4.2);
        currentY += infoH + 5;
      }

      // 4. Status de Reunião Não Analisada
      if (isUnanalyzed) {
        doc.setFontSize(8.5);
        const unHeader = 'Status: Reunião ainda não analisada';
        const unMsg = 'Esta reunião ainda não foi analisada. Analise a reunião antes de exportar o documento.\nClique no botão "Analisar" na listagem de reuniões para processar a ata executiva.';
        const splitUn = doc.splitTextToSize(unMsg, 172);
        const unH = (splitUn.length * 4.0) + 10;

        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(239, 68, 68);
        doc.setLineWidth(0.4);
        doc.roundedRect(15, currentY, 180, unH, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 38, 38);
        doc.text(unHeader, 19, currentY + 5.0);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(splitUn, 19, currentY + 9.5);
        currentY += unH + 5;
      } else {
        // 1. Resumo Executivo & Contexto
        if (currentY > 260) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('1. Resumo Executivo & Contexto', 15, currentY);
        currentY += 5.5;

        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`Tema Principal: ${analysisData.tema || 'Não identificado'}`, 15, currentY);
        currentY += 5;

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        
        const probText = analysisData.contexto?.problema || 'Não identificado';
        const decText = analysisData.contexto?.decisao || 'Não mencionado';
        
        const splitProb = doc.splitTextToSize(`Problema/Pauta: ${probText}`, 180);
        doc.text(splitProb, 15, currentY);
        currentY += (splitProb.length * 4.0) + 2;
        
        const splitDec = doc.splitTextToSize(`Decisões Registradas: ${decText}`, 180);
        doc.text(splitDec, 15, currentY);
        currentY += (splitDec.length * 4.0) + 4;

        // Organização por Temas (se houver)
        if (analysisData.organizacao_por_temas && analysisData.organizacao_por_temas.length > 0) {
          if (currentY > 255) {
            doc.addPage();
            currentY = 20;
          }
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 41, 59);
          doc.text('Temas e Pautas Discutidas', 15, currentY);
          currentY += 4.5;

          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          analysisData.organizacao_por_temas.forEach(t => {
            const tName = t.tema || t.tema_canonico || 'Geral';
            doc.text(`• ${tName.toUpperCase()}`, 18, currentY);
            currentY += 4.0;
            if (t.topicos) {
              t.topicos.forEach(topico => {
                const splitTop = doc.splitTextToSize(`- ${topico}`, 170);
                doc.text(splitTop, 24, currentY);
                currentY += (splitTop.length * 3.8) + 1;
              });
            }
          });
          currentY += 3;
        }

        // 2. Dores & Gargalos Identificados
        const totalPains = analysisData.dores?.length || 0;
        const estimatedPainsH = totalPains > 0 ? (totalPains * 8) + 18 : 12;
        if (currentY + estimatedPainsH > 275) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(239, 68, 68);
        doc.text('2. Dores & Gargalos Identificados', 15, currentY);
        currentY += 5.5;

        if (totalPains > 0) {
          const dorRows = analysisData.dores.map(d => {
            const isObj = typeof d === 'object' && d !== null;
            return [
              isObj ? (d.label || d.categoria || 'Geral') : String(d),
              isObj ? (d.severidade || 'Alta') : 'Média',
              isObj ? (d.trecho || d.descricao || 'Evidência textual mapeada') : '-'
            ];
          });
          autoTable(doc, {
            startY: currentY,
            head: [['Categoria', 'Severidade', 'Evidência Citada']],
            body: dorRows,
            theme: 'grid',
            showHead: 'everyPage',
            headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
            bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 1.8 },
            columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 25 }, 2: { cellWidth: 110 } },
            margin: { left: 15, right: 15 }
          });
          currentY = doc.lastAutoTable.finalY + 6;
        } else {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(148, 163, 184);
          doc.text('• Dados insuficientes: nenhuma dor ou gargalo operacional identificado na transcrição disponível.', 15, currentY);
          currentY += 6;
        }

        // 3. Plano de Ação & Prazos
        const confirmedPdfTasks = (analysisData.tarefas || []).filter(t => (t.task_validation_status || 'valid') === 'valid');
        const pendingPdfTasks = (analysisData.tarefas || []).filter(t => t.task_validation_status === 'pending_review');
        const totalConfirmed = confirmedPdfTasks.length;
        const totalPending = pendingPdfTasks.length;
        const estimatedTasksH = totalConfirmed > 0 ? (totalConfirmed * 8) + 18 : 12;
        if (currentY + estimatedTasksH > 275) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(16, 185, 129);
        doc.text('3. Plano de Ação & Prazos Operacionais', 15, currentY);
        currentY += 5.5;

        if (totalConfirmed > 0) {
          const taskRows = confirmedPdfTasks.map(t => [
            t.responsavel || 'Não identificado',
            t.tarefa || 'Não mencionado',
            t.prazo || 'Não mencionado',
            t.status || 'Não Inicializado',
            t.prioridade || 'Média'
          ]);
          autoTable(doc, {
            startY: currentY,
            head: [['Responsável', 'Ação Operacional', 'Prazo', 'Status', 'Prioridade']],
            body: taskRows,
            theme: 'grid',
            showHead: 'everyPage',
            headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
            bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 1.8 },
            columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 70 }, 2: { cellWidth: 30 }, 3: { cellWidth: 25 }, 4: { cellWidth: 20 } },
            margin: { left: 15, right: 15 }
          });
          currentY = doc.lastAutoTable.finalY + 6;
        } else {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(148, 163, 184);
          doc.text('• Nenhuma ação operacional confirmada identificada na transcrição disponível.', 15, currentY);
          currentY += 6;
        }

        // 3.1 Itens Pendentes de Validação Humana (se houver)
        if (totalPending > 0) {
          const estimatedPendingH = (totalPending * 8) + 18;
          if (currentY + estimatedPendingH > 275) {
            doc.addPage();
            currentY = 20;
          }
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(217, 119, 6);
          doc.text('3.1 Itens Pendentes de Validação Humana (Escopo Resumido / Contingência)', 15, currentY);
          currentY += 4.5;

          const pendingRows = pendingPdfTasks.map(t => [
            t.responsavel || 'Não identificado',
            t.tarefa || 'Não mencionado',
            t.prazo || 'Não mencionado',
            'Pendente de Validação'
          ]);

          autoTable(doc, {
            startY: currentY,
            head: [['Responsável Sugerido', 'Ação / Sugestão Preliminar', 'Prazo Sugerido', 'Validação']],
            body: pendingRows,
            theme: 'grid',
            showHead: 'everyPage',
            headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            bodyStyles: { fontSize: 7.8, textColor: [71, 85, 105], cellPadding: 1.6 },
            columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 80 }, 2: { cellWidth: 30 }, 3: { cellWidth: 30 } },
            margin: { left: 15, right: 15 }
          });
          currentY = doc.lastAutoTable.finalY + 6;
        }

        // 4. Recomendações TOTVS
        const recs = analysisData.recomendacoes_totvs || meetingObj.recomendacoes_totvs || [];
        const totalRecs = recs.length;
        const estimatedRecsH = totalRecs > 0 ? (totalRecs * 10) + 18 : 12;
        if (currentY + estimatedRecsH > 275) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 160, 230);
        doc.text('4. Recomendações TOTVS & Ecossistema', 15, currentY);
        currentY += 5.5;

        if (totalRecs > 0) {
          const recRows = recs.map(r => [
            r.product_name || 'TOTVS',
            `Adequação: ${Math.round((r.fit_score || 0) * 100)}%`,
            r.review_status === 'confirmed' ? 'Confirmada' : (r.review_status === 'rejected' ? 'Rejeitada' : 'Pendente'),
            r.why_recommended || 'Não mencionado'
          ]);

          autoTable(doc, {
            startY: currentY,
            head: [['Produto TOTVS', 'Adequação', 'Status', 'Justificativa Preliminar']],
            body: recRows,
            theme: 'grid',
            showHead: 'everyPage',
            headStyles: { fillColor: [0, 160, 230], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
            bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 1.8 },
            columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 25 }, 2: { cellWidth: 25 }, 3: { cellWidth: 90 } },
            margin: { left: 15, right: 15 }
          });
          currentY = doc.lastAutoTable.finalY + 6;
        } else {
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(148, 163, 184);
          doc.text('• Nenhuma recomendação confiável encontrada com base nos dados disponíveis.', 15, currentY);
          currentY += 6;
        }

        // 5. Qualidade da Análise & Metadados Estruturados (Confiança Técnica vs Semântica)
        const estimatedQualityH = 30;
        if (currentY + estimatedQualityH > 275) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('5. Qualidade & Parâmetros da Análise', 15, currentY);
        currentY += 5;

        const isFallbackPdf = isFallbackAnalysis(meta, meetingObj.STATUS_ANALISE);
        const totalTemas = (analysisData.organizacao_por_temas?.length || (analysisData.tema && analysisData.tema !== 'Não identificado' ? 1 : 0));
        const totalDores = analysisData.dores?.length || 0;
        const descartadosRuido = meta.items_discarded_noise || 0;
        const confTecnica = isFallbackPdf ? 'Execução determinística de contingência' : 'Processamento concluído com sucesso';
        const confSemantica = isInsufficient ? 'Dados insuficientes / Baixa' : (isFallbackPdf ? (totalConfirmed > 0 || totalPending > 0 ? 'Média (65%) — Palavras-chave' : 'Dados insuficientes / Baixa') : (totalTemas === 0 ? 'Parcial (55%) — Pendente de validação' : 'Alta (85%) — Evidências mapeadas'));
        
        let diagnostico = 'Análise estruturada completa realizada com sucesso.';
        if (isInsufficient) {
          diagnostico = 'Nenhuma informação estruturada foi extraída com segurança (revisão humana necessária).';
        } else if (isFallbackPdf) {
          diagnostico = (totalConfirmed > 0 || totalPending > 0) ? 'Análise de contingência concluída com dados parciais. As tarefas identificadas dependem de validação humana.' : 'Classificação de contingência preliminar — requer validação humana obrigatória.';
        } else if (totalTemas === 0 && (totalDores > 0 || totalConfirmed > 0 || totalPending > 0)) {
          diagnostico = 'Análise parcial: tópicos extraídos sem tema central consolidado; dores e tarefas pendentes de validação humana.';
        }

        const promptVer = String(meta.prompt_version || '2.1.0').replace(/^v+/i, '');
        const qualityRows = [
          [
            `Método de Síntese: ${isFallbackPdf ? 'Fallback determinístico de contingência' : 'Ollama / Llama (Inteligência Artificial)'}`,
            `Modelo / Versão: ${meta.model_name || meta.model || (isFallbackPdf ? 'Regras Determinísticas' : 'llama3:latest')} (Prompt v${promptVer})`
          ],
          [
            `Confiança Técnica: ${confTecnica}`,
            `Confiança Semântica: ${confSemantica}`
          ],
          [
            `Mapeamento: ${totalTemas} tema(s) | ${totalDores} dor(es) | ${totalConfirmed} tarefa(s) confirmada(s)${totalPending > 0 ? ` + ${totalPending} pendente(s)` : ''}${descartadosRuido > 0 ? ` (${descartadosRuido} descartado(s))` : ''}`,
            `Status de Revisão Humana: ${reviewStatusDisplay}`
          ],
          [
            { content: `Diagnóstico Geral: ${diagnostico}`, colSpan: 2, styles: { fontStyle: 'italic', textColor: [71, 85, 105] } }
          ]
        ];

        autoTable(doc, {
          startY: currentY,
          body: qualityRows,
          theme: 'grid',
          styles: { fontSize: 7.8, cellPadding: 1.8, textColor: [71, 85, 105], overflow: 'linebreak' },
          columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } },
          margin: { left: 15, right: 15 },
          tableLineColor: [226, 232, 240],
          tableLineWidth: 0.3
        });
        currentY = doc.lastAutoTable.finalY + 6;
      }

      // Rodapé em todas as páginas com status coerente
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);

        let footerStatusText = 'Proton Flow v2.1 • Conteúdo gerado por IA — revisão humana pendente';
        if (isUnanalyzed) {
          footerStatusText = 'Proton Flow v2.1 • Reunião ainda não analisada';
        } else if (isReviewed) {
          footerStatusText = 'Proton Flow v2.1 • Revisão humana concluída';
        } else if (isFallback) {
          footerStatusText = 'Proton Flow v2.1 • Fallback determinístico — revisão obrigatória';
        } else if (isInsufficient) {
          footerStatusText = 'Proton Flow v2.1 • Análise concluída com dados insuficientes';
        }

        doc.text(footerStatusText, 15, 290);
        doc.text(`Página ${i} de ${pageCount}`, 180, 290);
      }

      // Upload do PDF gerado para o servidor
      const pdfBlob = doc.output('blob');
      const pdfBlobUrl = URL.createObjectURL(pdfBlob);

      if (meetingId) {
        const formData = new FormData();
        formData.append('meeting_id', String(meetingId));
        formData.append('file', pdfBlob, `meeting_${meetingId}.pdf`);
        
        try {
          await api.uploadPdf(formData);
          setMeetings(prev => prev.map(m => m.ID_MEETING === meetingId ? { ...m, TEM_PDF: true, RESUMO_IA: analysisData } : m));
        } catch (e) {
          console.error('Erro ao fazer upload do PDF:', e);
        }
      }

      if (shouldDownload) {
        if (!meetingId) {
          doc.save('Ata_Reuniao_ProtonFlow.pdf');
        } else if (isHistorical) {
          doc.save(`Ata_Reuniao_${meetingId}.pdf`);
        }
      }

      return { doc, blob: pdfBlob, blobUrl: pdfBlobUrl };

    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Ocorreu um erro ao gerar o PDF.');
      return null;
    } finally {
      if (shouldDownload) {
        setIsGeneratingPDF(false);
      }
    }
  };

  // Handler de encerramento da Reunião Ao Vivo (Salva e volta ao dashboard de forma desacoplada)
  const handleLeaveLiveMeeting = async (transcript) => {
    try {
      await api.saveMeeting(transcript || 'Reunião sem transcrição capturada.');
      setCurrentView('dashboard');
      await loadMeetings(1, pagination.page_size);
    } catch (err) {
      console.error('Erro ao encerrar reunião ao vivo:', err);
      setCurrentView('dashboard');
    }
  };

  // Handler de abertura e pré-visualização de ata/documento no frontend (sem forçar download)
  const handleOpenDocumentViewer = async (meeting, docType = 'executive', format = 'pdf') => {
    if (!meeting.RESUMO_IA) {
      alert('Esta reunião ainda não foi analisada pela Inteligência Artificial. Analise a reunião antes de abrir a ata.');
      return;
    }

    setViewerState({
      isOpen: true,
      meeting,
      pdfBlobUrl: null,
      isLoadingPdf: true,
      initialDocType: docType,
      initialFormat: format
    });

    try {
      const res = docType === 'executive'
        ? await generateExecutivePDF(meeting.ANON_TRANSCRICAO, true, meeting.ID_MEETING, meeting.RESUMO_IA, false)
        : await generatePDF(meeting.ANON_TRANSCRICAO, true, meeting.ID_MEETING, meeting.RESUMO_IA, false);

      if (res && res.blobUrl) {
        setViewerState(prev => ({
          ...prev,
          pdfBlobUrl: res.blobUrl,
          isLoadingPdf: false
        }));
      } else {
        setViewerState(prev => ({ ...prev, isLoadingPdf: false }));
      }
    } catch (err) {
      console.error('Erro ao gerar preview de PDF:', err);
      setViewerState(prev => ({ ...prev, isLoadingPdf: false }));
    }
  };

  // Handler para troca dinâmica de tipo de ata dentro do DocumentViewerModal
  const handleSwitchDocTypeInViewer = async (newDocType, _format) => {
    if (!viewerState.meeting) return;
    setViewerState(prev => ({
      ...prev,
      initialDocType: newDocType,
      isLoadingPdf: true
    }));
    try {
      const res = newDocType === 'executive'
        ? await generateExecutivePDF(viewerState.meeting.ANON_TRANSCRICAO, true, viewerState.meeting.ID_MEETING, viewerState.meeting.RESUMO_IA, false)
        : await generatePDF(viewerState.meeting.ANON_TRANSCRICAO, true, viewerState.meeting.ID_MEETING, viewerState.meeting.RESUMO_IA, false);

      if (res && res.blobUrl) {
        setViewerState(prev => ({
          ...prev,
          initialDocType: newDocType,
          pdfBlobUrl: res.blobUrl,
          isLoadingPdf: false
        }));
      } else {
        setViewerState(prev => ({ ...prev, initialDocType: newDocType, isLoadingPdf: false }));
      }
    } catch (err) {
      console.error('Erro ao alternar tipo de documento:', err);
      setViewerState(prev => ({ ...prev, initialDocType: newDocType, isLoadingPdf: false }));
    }
  };

  if (isGeneratingPDF) {
    return (
      <div className="lobby" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{
          width: 50,
          height: 50,
          border: '3px solid var(--border-color)',
          borderTopColor: 'var(--primary-color)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '1.5rem'
        }}></div>
        <style>
          {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
        </style>
        <h3 style={{ fontSize: '1.4rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
          {generatingMessage || 'Processando com Inteligência Artificial...'}
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          O Proton Flow está organizando os insights e estruturando a ata.
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
                📊 Visão Executiva
              </button>
              <button
                className="btn-primary"
                style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)' }}
                onClick={handleResetAllAnalyses}
                title="Resetar todas as reuniões para permitir analisar novamente pela IA"
              >
                🔄 Resetar Análises
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
              <div style={{ flex: 1, minWidth: '200px' }}>
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
                    width: '110px'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Segmento:</span>
                <input
                  type="text"
                  placeholder="Ex: Serviços"
                  value={segmentFilter}
                  onChange={(e) => setSegmentFilter(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    background: 'var(--bg-main)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    outline: 'none',
                    fontSize: '12px',
                    width: '110px'
                  }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={onlyUnanalyzed}
                  onChange={(e) => setOnlyUnanalyzed(e.target.checked)}
                />
                Somente sem análise
              </label>

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
              onSynthesize={(item) => generateExecutivePDF(item.ANON_TRANSCRICAO, true, item.ID_MEETING, item.RESUMO_IA)}
              onGenerateDocx={(item) => generateExecutiveDocx(item.ANON_TRANSCRICAO, true, item.ID_MEETING, item.RESUMO_IA)}
              onDownloadExecutivePdf={(item) => generateExecutivePDF(item.ANON_TRANSCRICAO, true, item.ID_MEETING, item.RESUMO_IA, true)}
              onDownloadExecutiveDocx={(item) => generateExecutiveDocx(item.ANON_TRANSCRICAO, true, item.ID_MEETING, item.RESUMO_IA, true)}
              onDownloadOperationalPdf={(item) => generatePDF(item.ANON_TRANSCRICAO, true, item.ID_MEETING, item.RESUMO_IA, true)}
              onDownloadOperationalDocx={(item) => generateDocx(item.ANON_TRANSCRICAO, true, item.ID_MEETING, item.RESUMO_IA, true)}
              onAnalyzeMeeting={handleAnalyzeMeeting}
              onOpenDocumentViewer={handleOpenDocumentViewer}
              sistemasTotvs={sistemasTotvs}
              enviosPorReuniao={enviosPorReuniao}
              onConfirmSuggestion={handleConfirmSuggestion}
              onConfirmRecommendation={handleConfirmRecommendation}
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
          <Suspense fallback={
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Carregando Visão Executiva & Analytics...
            </div>
          }>
            <QuarterlyAnalyticsPage
              onOpenMeeting={(meetingId) => {
                setExpandedMeetingId(meetingId);
                setCurrentView('dashboard');
              }}
            />
          </Suspense>
        </main>
      )}

      {currentView === 'meeting' && (
        <Suspense fallback={
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Iniciando módulo de gravação ao vivo...
          </div>
        }>
          <LiveMeetingPage
            onLeaveMeeting={handleLeaveLiveMeeting}
          />
        </Suspense>
      )}

      {/* Modal de Integrações TOTVS */}
      <TotvsIntegrationModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        sistemasTotvs={sistemasTotvs}
        onSaveWebhook={handleSalvarWebhook}
        onDeleteWebhook={handleDeleteWebhook}
      />

      {/* Modal de Visualização de Documentos (PDF e DOCX no Frontend) */}
      <DocumentViewerModal
        isOpen={viewerState.isOpen}
        onClose={() => setViewerState(prev => ({ ...prev, isOpen: false }))}
        meeting={viewerState.meeting}
        pdfBlobUrl={viewerState.pdfBlobUrl}
        isLoadingPdf={viewerState.isLoadingPdf}
        initialDocType={viewerState.initialDocType}
        initialFormat={viewerState.initialFormat}
        onSwitchDocType={handleSwitchDocTypeInViewer}
        onDownloadExecutivePdf={(m) => generateExecutivePDF(m.ANON_TRANSCRICAO, true, m.ID_MEETING, m.RESUMO_IA, true)}
        onDownloadExecutiveDocx={(m) => generateExecutiveDocx(m.ANON_TRANSCRICAO, true, m.ID_MEETING, m.RESUMO_IA, true)}
        onDownloadOperationalPdf={(m) => generatePDF(m.ANON_TRANSCRICAO, true, m.ID_MEETING, m.RESUMO_IA, true)}
        onDownloadOperationalDocx={(m) => generateDocx(m.ANON_TRANSCRICAO, true, m.ID_MEETING, m.RESUMO_IA, true)}
      />
    </div>
  );
}
