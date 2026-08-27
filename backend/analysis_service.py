import os
import re
import json
import time
import requests
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from pydantic import ValidationError

from schemas import MeetingAnalysisResult, FieldSuggestion, AnalysisMetadata, TaskSchema, PainSchema, TopicGroupSchema, ContextoSchema
from normalization import normalize_pain_category, get_pain_metadata, normalize_topic_name, normalize_urgency, normalize_date_iso

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
OLLAMA_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "180"))
ANALYSIS_PROMPT_VERSION = os.getenv("ANALYSIS_PROMPT_VERSION", "v2")

PADROES_GATILHO = {
    "aprovacao_pendente": [
        r"[^.?!]*quem\s+aprov\w*[^.?!]*([.?!]|$)",
        r"[^.?!]*precisa\s+(de\s+)?aprova[çc][ãa]o[^.?!]*([.?!]|$)",
        r"[^.?!]*ainda\s+n[ãa]o\s+foi\s+aprovado[^.?!]*([.?!]|$)",
        r"[^.?!]*aguardando\s+aprova[çc][ãa]o[^.?!]*([.?!]|$)",
    ],
    "atraso_prazo": [
        r"[^.?!]*estamos?\s+(com\s+)?(atrasad\w*|atraso)[^.?!]*([.?!]|$)",
        r"[^.?!]*perdemos?\s+o\s+prazo[^.?!]*([.?!]|$)",
        r"[^.?!]*n[ãa]o\s+vai\s+dar\s+tempo[^.?!]*([.?!]|$)",
        r"[^.?!]*fora\s+do\s+prazo[^.?!]*([.?!]|$)",
        r"[^.?!]*prazo\s+vencido[^.?!]*([.?!]|$)",
    ],
    "documento_faltando": [
        r"[^.?!]*n[ãa]o\s+encontr\w+\s+o\s+documento[^.?!]*([.?!]|$)",
        r"[^.?!]*cad[êe]\s+o\s+arquivo[^.?!]*([.?!]|$)",
        r"[^.?!]*falta\s+(o\s+)?documento[^.?!]*([.?!]|$)",
        r"[^.?!]*documento\s+n[ãa]o\s+enviado[^.?!]*([.?!]|$)",
    ],
    "gargalo_operacional": [
        r"[^.?!]*sistema\s+([^.?!]*\s+)?lento[^.?!]*([.?!]|$)",
        r"[^.?!]*trava\w*\s+(o\s+)?processo[^.?!]*([.?!]|$)",
        r"[^.?!]*gargalo[^.?!]*([.?!]|$)",
        r"[^.?!]*retrabalho[^.?!]*([.?!]|$)",
        r"[^.?!]*bloquead\w*[^.?!]*([.?!]|$)",
        r"[^.?!]*produ[çc][ãa]o\s+parada[^.?!]*([.?!]|$)",
    ],
    "insatisfacao_cliente": [
        r"[^.?!]*n[ãa]o\s+ficou\s+satisfeito[^.?!]*([.?!]|$)",
        r"[^.?!]*est[áa]\s+reclamando[^.?!]*([.?!]|$)",
        r"[^.?!]*n[ãa]o\s+gostou[^.?!]*([.?!]|$)",
        r"[^.?!]*cliente\s+insatisfeito[^.?!]*([.?!]|$)",
        r"[^.?!]*risco\s+de\s+perder\s+o\s+cliente[^.?!]*([.?!]|$)",
    ],
    "falta_metricas": [
        r"[^.?!]*falta\s+(de\s+)?relat[óo]rio\w*[^.?!]*([.?!]|$)",
        r"[^.?!]*sem\s+vis[ãa]o[^.?!]*([.?!]|$)",
        r"[^.?!]*dados\s+espalhados[^.?!]*([.?!]|$)",
        r"[^.?!]*n[ãa]o\s+conseguimos\s+medir[^.?!]*([.?!]|$)",
    ],
    "problemas_equipe": [
        r"[^.?!]*equipe\s+sobrecarregada[^.?!]*([.?!]|$)",
        r"[^.?!]*falta\s+(de\s+)?pessoal[^.?!]*([.?!]|$)",
        r"[^.?!]*contrata[çc][ãa]o[^.?!]*([.?!]|$)",
        r"[^.?!]*problema\s+na\s+folha[^.?!]*([.?!]|$)",
    ],
    "gestao_estoque": [
        r"[^.?!]*falta\s+(no\s+)?estoque[^.?!]*([.?!]|$)",
        r"[^.?!]*problema\s+na\s+entrega[^.?!]*([.?!]|$)",
        r"[^.?!]*log[íi]stica[^.?!]*([.?!]|$)",
        r"[^.?!]*armazenamento[^.?!]*([.?!]|$)",
    ],
}

TERMOS_URGENCIA_ALTA = [
    "bloqueado", "bloqueada", "bloqueio",
    "prazo vencido", "fora do prazo", "atraso crítico",
    "produção parada", "producao parada", "sistema fora",
    "risco de perder o cliente", "cliente insatisfeito",
    "reclamação grave", "paralisação", "crítico"
]


def detectar_gatilhos(transcricao: str) -> List[Dict[str, Any]]:
    """Varre a transcrição procurando frases-gatilho antes de mandar pro LLM."""
    if not transcricao:
        return []
    encontrados = []
    for categoria, padroes in PADROES_GATILHO.items():
        meta = get_pain_metadata(categoria)
        for padrao in padroes:
            for m in re.finditer(padrao, transcricao, re.IGNORECASE):
                frase = transcricao[m.start():m.end()].strip()
                if len(frase) >= 8:
                    encontrados.append({
                        "categoria": categoria,
                        "label": meta["label"],
                        "frase": frase[:250],
                        "posicao": m.start(),
                        "severidade": meta["severidade_padrao"],
                        "sistema_totvs": meta["sistema_totvs"]
                    })
    encontrados.sort(key=lambda x: x["posicao"])
    filtrados, ultima = [], -1000
    for g in encontrados:
        if g["posicao"] - ultima >= 15:
            filtrados.append(g)
            ultima = g["posicao"]
    return filtrados[:15]


def aplicar_regras_deterministas_seguranca(
    raw_result: Dict[str, Any], 
    transcricao: str, 
    gatilhos: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Aplica regras determinísticas de negócio e segurança sobre a resposta da IA.
    """
    transcricao_lower = transcricao.lower()
    
    # 1. Regra de Urgência: Elevação determinística por palavras-chave críticas
    urgencia_atual = normalize_urgency(raw_result.get("nivel_urgencia", "Média"))
    justificativa_urgencia = raw_result.get("justificativa_urgencia", "")
    termos_encontrados = [t for t in TERMOS_URGENCIA_ALTA if t in transcricao_lower]
    
    if any("produção parada" in t or "producao parada" in t or "risco de perder" in t for t in termos_encontrados):
        urgencia_final = "Crítica"
        justificativa_urgencia = f"Urgência elevada para Crítica por regra determinística: detectados termos críticos ({', '.join(termos_encontrados[:2])})."
        confianca_urgencia = 0.95
    elif termos_encontrados and urgencia_atual in ["Baixa", "Média", "Não Definido"]:
        urgencia_final = "Alta"
        justificativa_urgencia = f"Urgência elevada para Alta por regra determinística: detectados termos críticos ({', '.join(termos_encontrados[:3])})."
        confianca_urgencia = 0.90
    else:
        urgencia_final = urgencia_atual
        confianca_urgencia = float(raw_result.get("confianca_urgencia", 0.85))

    raw_result["nivel_urgencia"] = urgencia_final
    raw_result["justificativa_urgencia"] = justificativa_urgencia or "Avaliação baseada no contexto da reunião."
    raw_result["confianca_urgencia"] = min(1.0, max(0.1, confianca_urgencia))

    # 2. Regra de Responsável Geral: Não inventar se não houver evidência clara
    responsavel_sugerido = str(raw_result.get("responsavel_reuniao", "")).strip()
    evidencia_responsavel = raw_result.get("evidencia_responsavel", "")
    
    # Se o nome não aparece na transcrição nem em tarefas, neutraliza
    nomes_em_tarefas = [t.get("responsavel", "") for t in raw_result.get("tarefas", []) if t.get("responsavel") and t.get("responsavel") not in ["Não identificado", "Não mencionado", "Nenhum", "-"]]
    
    if not responsavel_sugerido or responsavel_sugerido.lower() in ["none", "null", "não identificado", "nao identificado", "desconhecido", "nenhum", "-", ""]:
        if nomes_em_tarefas:
            responsavel_sugerido = nomes_em_tarefas[0]
            confianca_responsavel = 0.65
            evidencia_responsavel = f"Inferido a partir da lista de tarefas: {responsavel_sugerido}."
        else:
            responsavel_sugerido = "Não identificado"
            confianca_responsavel = 0.0
            evidencia_responsavel = "Nenhum nome de facilitador ou responsável claro identificado na transcrição."
    else:
        # Se foi sugerido um nome mas ele nem sequer está na transcrição ou tarefas
        if responsavel_sugerido.lower() not in transcricao_lower and responsavel_sugerido not in nomes_em_tarefas:
            responsavel_sugerido = "Não identificado"
            confianca_responsavel = 0.0
            evidencia_responsavel = "Nome sugerido não localizado textualmente na transcrição."
        else:
            confianca_responsavel = float(raw_result.get("confianca_responsavel", 0.82))
            if not evidencia_responsavel:
                evidencia_responsavel = f"Identificado na condução e nas tarefas da reunião: {responsavel_sugerido}."

    raw_result["responsavel_reuniao"] = responsavel_sugerido

    # 3. Regra de Tarefas e Prazos: Não inventar prazos se não houver menção
    tarefas_processadas = []
    for t in raw_result.get("tarefas", []):
        if not isinstance(t, dict):
            continue
        nome_resp = str(t.get("responsavel", "")).strip()
        if not nome_resp or nome_resp.lower() in ["", "none", "null", "nenhum", "-"]:
            nome_resp = "Não identificado"
            
        prazo_raw = str(t.get("prazo", "")).strip()
        if not prazo_raw or prazo_raw.lower() in ["", "none", "null", "nenhum", "sem prazo", "-", "não informado"]:
            prazo_raw = "Não mencionado"
            prazo_iso = None
        else:
            prazo_iso = normalize_date_iso(prazo_raw)
            
        tarefas_processadas.append({
            "responsavel": nome_resp,
            "tarefa": str(t.get("tarefa", "")).strip() or "Ação pendente",
            "prazo": prazo_raw,
            "prazo_iso": prazo_iso,
            "status": t.get("status", "Não Inicializado") or "Não Inicializado",
            "confidence": float(t.get("confidence", 0.85)),
            "evidence": str(t.get("evidence", "")).strip() or t.get("tarefa", "")
        })
    raw_result["tarefas"] = tarefas_processadas

    # 4. Regra de Dores: Categorização canônica e injeção de gatilhos pré-detectados
    dores_processadas = []
    descricoes_existentes = set()
    
    for d in raw_result.get("dores", []):
        if isinstance(d, dict):
            cat = normalize_pain_category(d.get("categoria", "outro"))
            meta = get_pain_metadata(cat)
            desc = str(d.get("descricao", "")).strip() or meta["label"]
            trecho = str(d.get("trecho", "")).strip()
            sev = d.get("severidade") or meta["severidade_padrao"]
            sis = d.get("sistema_totvs") or meta["sistema_totvs"]
            dores_processadas.append({
                "categoria": cat,
                "label": meta["label"],
                "descricao": desc,
                "trecho": trecho,
                "severidade": sev,
                "sistema_totvs": sis
            })
            if trecho:
                descricoes_existentes.add(trecho)
        elif isinstance(d, str) and d.strip():
            cat = normalize_pain_category(d)
            meta = get_pain_metadata(cat)
            dores_processadas.append({
                "categoria": cat,
                "label": meta["label"],
                "descricao": d.strip(),
                "trecho": "",
                "severidade": meta["severidade_padrao"],
                "sistema_totvs": meta["sistema_totvs"]
            })

    # Injeta gatilhos pré-detectados que o modelo possa ter ignorado
    for g in gatilhos:
        if g["frase"] not in descricoes_existentes:
            dores_processadas.append({
                "categoria": g["categoria"],
                "label": g["label"],
                "descricao": g["label"],
                "trecho": g["frase"],
                "severidade": g["severidade"],
                "sistema_totvs": g["sistema_totvs"]
            })

    raw_result["dores"] = dores_processadas

    # 5. Normalização de Temas Organizacionais
    temas_organizados = []
    for grupo in raw_result.get("organizacao_por_temas", []):
        if isinstance(grupo, dict):
            tema_nome = grupo.get("tema", "Geral")
            canon_key, formatted_label = normalize_topic_name(tema_nome)
            temas_organizados.append({
                "tema": formatted_label,
                "tema_canonico": canon_key,
                "topicos": [str(topico).strip() for topico in grupo.get("topicos", []) if str(topico).strip()]
            })
            
    if not temas_organizados:
        tema_geral_key, tema_geral_label = normalize_topic_name(raw_result.get("tema", "Alinhamento Geral"))
        temas_organizados = [{
            "tema": tema_geral_label,
            "tema_canonico": tema_geral_key,
            "topicos": ["Discussão geral e alinhamentos operacionais"]
        }]
    raw_result["organizacao_por_temas"] = temas_organizados

    # 6. Geração de Field Suggestions
    tema_principal = str(raw_result.get("tema", "Reunião de Alinhamento")).strip()
    evidencia_tema = raw_result.get("evidencia_tema", f"Resumo dos tópicos principais abordados.")
    
    field_suggestions = {
        "responsavel_reuniao": {
            "field_name": "responsavel_reuniao",
            "label": "Responsável Geral",
            "suggested_value": responsavel_sugerido,
            "confidence": confianca_responsavel,
            "evidence": evidencia_responsavel,
            "review_status": "pending",
            "confirmed_value": None
        },
        "nivel_urgencia": {
            "field_name": "nivel_urgencia",
            "label": "Nível de Urgência",
            "suggested_value": urgencia_final,
            "confidence": confianca_urgencia,
            "evidence": justificativa_urgencia,
            "review_status": "pending",
            "confirmed_value": None
        },
        "tema": {
            "field_name": "tema",
            "label": "Tema Principal",
            "suggested_value": tema_principal,
            "confidence": 0.90,
            "evidence": evidencia_tema,
            "review_status": "pending",
            "confirmed_value": None
        }
    }
    raw_result["field_suggestions"] = field_suggestions

    return raw_result


SYSTEM_PROMPT_V2 = """
Você é o motor de Inteligência Artificial do Proton Flow (Plataforma TOTVS).
Analise a transcrição da reunião corporativa recebida com rigor executivo e precisão analítica.

Extraia as informações e retorne EXCLUSIVAMENTE um objeto JSON estrito com a seguinte estrutura:
{
    "tema": "Título curto e descritivo da reunião (ex: Alinhamento de Implantação e Prazos)",
    "evidencia_tema": "Frase ou contexto da transcrição que sintetiza o tema",
    "responsavel_reuniao": "Nome do facilitador/líder da reunião ou 'Não identificado'",
    "evidencia_responsavel": "Trecho da transcrição com o nome ou atribuição do responsável",
    "confianca_responsavel": 0.85,
    "participantes": ["Nome 1", "Nome 2"],
    "nivel_urgencia": "Baixa" ou "Média" ou "Alta" ou "Crítica",
    "justificativa_urgencia": "Motivo objetivo da classificação de urgência com base em fatos citados",
    "confianca_urgencia": 0.90,
    "contexto": {
        "problema": "O problema central ou objetivo da reunião",
        "decisao": "Decisão tomada ou encaminhamento deliberado"
    },
    "organizacao_por_temas": [
        {
            "tema": "Nome do Tema (ex: Financeiro, Desenvolvimento TI, Comercial, RH, Operações, Suporte)",
            "topicos": [
                "Tópico 1 discutido",
                "Tópico 2 discutido"
            ]
        }
    ],
    "tarefas": [
        {
            "responsavel": "Nome da pessoa encarregada ou 'Não identificado'",
            "tarefa": "Ação clara e executável a ser realizada",
            "prazo": "Data/prazo textual citado (ex: 'até sexta-feira', '2026-03-25') ou 'Não mencionado'",
            "confidence": 0.85,
            "evidence": "Trecho da transcrição onde a tarefa foi delegada"
        }
    ],
    "dores": [
        {
            "categoria": "uma de: aprovacao_pendente, atraso_prazo, documento_faltando, gargalo_operacional, insatisfacao_cliente, falta_metricas, problemas_equipe, gestao_estoque, outro",
            "descricao": "Explicação objetiva do ponto crítico",
            "trecho": "Frase exata da transcrição que evidencia a dor",
            "severidade": "Baixa, Média, Alta ou Crítica"
        }
    ]
}

REGRAS DE VALIDAÇÃO:
1. Retorne APENAS o JSON válido. Não use blocos de código ```json ou comentários.
2. NUNCA invente responsáveis ou prazos. Se não houver nome claro, preencha 'Não identificado'. Se não houver prazo, preencha 'Não mencionado'.
3. Termos que indicam bloqueio operacional, atraso crítico, risco de perder cliente ou produção parada DEVEM ter urgência classificada como Alta ou Crítica.
4. Se o texto contiver GATILHOS PRÉ-DETECTADOS, inclua-os obrigatoriamente no array 'dores'.
"""


class AnalysisService:
    """Serviço de análise de reuniões com Ollama, validação Pydantic e segurança."""
    def __init__(self, 
                 ollama_url: str = OLLAMA_URL, 
                 model_name: str = OLLAMA_MODEL, 
                 timeout_seconds: int = OLLAMA_TIMEOUT_SECONDS,
                 prompt_version: str = ANALYSIS_PROMPT_VERSION):
        self.ollama_url = ollama_url
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds
        self.prompt_version = prompt_version

    def analyze(self, transcript: str, client_context: str = "") -> MeetingAnalysisResult:
        start_time = time.time()
        char_count = len(transcript)
        
        # 1. Pré-detecção determinística de gatilhos
        gatilhos = detectar_gatilhos(transcript)
        bloco_gatilhos = ""
        if gatilhos:
            linhas = [f'- [{g["label"]}] "{g["frase"]}"' for g in gatilhos]
            bloco_gatilhos = "\n\nGATILHOS PRÉ-DETECTADOS (inclua todos em 'dores'):\n" + "\n".join(linhas)

        bloco_perfil = f"\n\n{client_context}\n" if client_context else ""
        texto_enriquecido = f"{bloco_perfil}{transcript[:15000]}{bloco_gatilhos}"

        # 2. Montagem do payload para Ollama
        payload = {
            "model": self.model_name,
            "prompt": texto_enriquecido,
            "system": SYSTEM_PROMPT_V2,
            "stream": False,
            "format": "json",
            "options": {
                "num_ctx": 8192,
                "temperature": 0.1
            }
        }

        try:
            response = requests.post(self.ollama_url, json=payload, timeout=self.timeout_seconds)
            response.raise_for_status()
            data = response.json()
            raw_response_text = data.get("response", "{}")
            
            # Limpa possíveis formatações markdown residuais
            clean_text = raw_response_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()
            
            raw_dict = json.loads(clean_text)
            
        except requests.exceptions.RequestException as e:
            # Fallback seguro determinístico em caso de indisponibilidade do Ollama
            duration = round(time.time() - start_time, 2)
            meta = AnalysisMetadata(
                model=self.model_name,
                prompt_version=self.prompt_version,
                analyzed_at=datetime.now().isoformat(),
                duration_seconds=duration,
                transcript_char_count=char_count,
                status="ollama_offline",
                parsing_error=f"Falha de conexão com Ollama: {str(e)}"
            )
            fallback_dict = self._build_deterministic_fallback(transcript, gatilhos, meta)
            return MeetingAnalysisResult.model_validate(fallback_dict)

        except json.JSONDecodeError as e:
            duration = round(time.time() - start_time, 2)
            meta = AnalysisMetadata(
                model=self.model_name,
                prompt_version=self.prompt_version,
                analyzed_at=datetime.now().isoformat(),
                duration_seconds=duration,
                transcript_char_count=char_count,
                status="json_decode_error",
                parsing_error=f"Ollama retornou JSON inválido: {str(e)}"
            )
            fallback_dict = self._build_deterministic_fallback(transcript, gatilhos, meta)
            return MeetingAnalysisResult.model_validate(fallback_dict)

        # 3. Aplica regras determinísticas de negócio
        processed_dict = aplicar_regras_deterministas_seguranca(raw_dict, transcript, gatilhos)
        
        duration = round(time.time() - start_time, 2)
        processed_dict["analise_metadados"] = {
            "model": self.model_name,
            "prompt_version": self.prompt_version,
            "analyzed_at": datetime.now().isoformat(),
            "duration_seconds": duration,
            "transcript_char_count": char_count,
            "status": "success",
            "parsing_error": None
        }

        # 4. Validação estrita via Pydantic
        try:
            validated_result = MeetingAnalysisResult.model_validate(processed_dict)
            return validated_result
        except ValidationError as e:
            meta = AnalysisMetadata(
                model=self.model_name,
                prompt_version=self.prompt_version,
                analyzed_at=datetime.now().isoformat(),
                duration_seconds=duration,
                transcript_char_count=char_count,
                status="pydantic_validation_error",
                parsing_error=f"Erro de validação do schema: {str(e)}"
            )
            fallback_dict = self._build_deterministic_fallback(transcript, gatilhos, meta)
            return MeetingAnalysisResult.model_validate(fallback_dict)

    def _build_deterministic_fallback(self, transcript: str, gatilhos: List[Dict[str, Any]], meta: AnalysisMetadata) -> Dict[str, Any]:
        """Cria análise baseada exclusivamente nos gatilhos regex e heurísticas se a IA falhar."""
        dores = []
        for g in gatilhos:
            dores.append({
                "categoria": g["categoria"],
                "label": g["label"],
                "descricao": g["label"],
                "trecho": g["frase"],
                "severidade": g["severidade"],
                "sistema_totvs": g["sistema_totvs"]
            })

        # Avaliação determinística de urgência
        transcript_lower = transcript.lower()
        termos_urg = [t for t in TERMOS_URGENCIA_ALTA if t in transcript_lower]
        if any("produção parada" in t or "producao parada" in t or "risco de perder" in t for t in termos_urg):
            urgencia = "Crítica"
            justificativa = f"Urgência Crítica identificada por palavras-chave críticas na transcrição ({', '.join(termos_urg[:2])})."
        elif termos_urg:
            urgencia = "Alta"
            justificativa = f"Urgência Alta identificada por alertas operacionais ({', '.join(termos_urg[:3])})."
        else:
            urgencia = "Média"
            justificativa = "Classificação padrão de alinhamento."

        tema_sugerido = "Reunião de Alinhamento Operacional"
        canon_key, formatted_label = normalize_topic_name("Operações")

        return {
            "tema": tema_sugerido,
            "contexto": {
                "problema": "Alinhamento e revisão de processos em andamento.",
                "decisao": "Acompanhamento das tarefas e resolução dos pontos identificados."
            },
            "organizacao_por_temas": [
                {
                    "tema": formatted_label,
                    "tema_canonico": canon_key,
                    "topicos": ["Revisão operacional e acompanhamento de dores mapeadas"]
                }
            ],
            "tarefas": [
                {
                    "responsavel": "Não identificado",
                    "tarefa": "Revisar pontos de atenção destacados na reunião",
                    "prazo": "Não mencionado",
                    "prazo_iso": None,
                    "status": "Não Inicializado",
                    "confidence": 0.5,
                    "evidence": "Ação recomendada a partir dos alertas mapeados."
                }
            ],
            "dores": dores,
            "responsavel_reuniao": "Não identificado",
            "participantes": [],
            "nivel_urgencia": urgencia,
            "justificativa_urgencia": justificativa,
            "confianca_urgencia": 0.75,
            "field_suggestions": {
                "responsavel_reuniao": {
                    "field_name": "responsavel_reuniao",
                    "label": "Responsável Geral",
                    "suggested_value": "Não identificado",
                    "confidence": 0.0,
                    "evidence": "Nenhum responsável evidente na transcrição.",
                    "review_status": "pending",
                    "confirmed_value": None
                },
                "nivel_urgencia": {
                    "field_name": "nivel_urgencia",
                    "label": "Nível de Urgência",
                    "suggested_value": urgencia,
                    "confidence": 0.75,
                    "evidence": justificativa,
                    "review_status": "pending",
                    "confirmed_value": None
                },
                "tema": {
                    "field_name": "tema",
                    "label": "Tema Principal",
                    "suggested_value": tema_sugerido,
                    "confidence": 0.70,
                    "evidence": "Tema inferido a partir dos tópicos discutidos.",
                    "review_status": "pending",
                    "confirmed_value": None
                }
            },
            "analise_metadados": meta.model_dump(),
            "perfil_cliente": None,
            "codigo_cliente": None
        }
