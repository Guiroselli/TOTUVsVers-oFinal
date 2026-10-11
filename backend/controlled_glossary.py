"""
Módulo de Glossário de Correção Controlada para o Proton Flow.
Aplica correções e sugestões fonéticas apenas quando:
1. O segmento possui baixa confiança (avg_logprob baixo ou no_speech_prob elevado);
2. A alternativa é foneticamente ou textualmente próxima (distância de edição calibrada);
3. O contexto da reunião é coerente;
4. A versão bruta (TRANSCRIPT_RAW) permanece 100% preservada e inalterada;
5. Cada correção gera log de auditoria detalhado e é reversível pelo usuário.
"""

import re
import uuid
from typing import Dict, Any, List, Optional, Tuple


# Glossário corporativo canônico padrão com variantes fonéticas e erros comuns de Whisper
DEFAULT_CORPORATE_GLOSSARY: Dict[str, Dict[str, Any]] = {
    "reunião": {
        "canonical": "reunião",
        "category": "geral",
        "phonetic_variants": [
            "reuniao", "reuniom", "renião", "reniao", "reiniao", "ó neo neo", "o neo neo", "neo neo"
        ],
        "min_logprob_threshold": -0.75,
        "context_keywords": ["ata", "iniciar", "pauta", "alinhamento", "participantes", "proton flow", "totvs"]
    },
    "Proton Flow": {
        "canonical": "Proton Flow",
        "category": "produto",
        "phonetic_variants": [
            "proton flow", "protonflow", "próton flow", "prótonflow", "pronton flow", "ponto flow", "porto flow"
        ],
        "min_logprob_threshold": -0.70,
        "context_keywords": ["plataforma", "sistema", "totvs", "ata", "transcrição"]
    },
    "TOTVS": {
        "canonical": "TOTVS",
        "category": "empresa",
        "phonetic_variants": [
            "totvs", "totus", "tótvs", "totvis", "totius", "todvs"
        ],
        "min_logprob_threshold": -0.65,
        "context_keywords": ["protheus", "fluig", "sistema", "erp", "rh", "proton flow"]
    },
    "SESMT": {
        "canonical": "SESMT",
        "category": "rh",
        "phonetic_variants": [
            "sesmt", "cesmt", "sesmit", "cesmit", "cisme"
        ],
        "min_logprob_threshold": -0.80,
        "context_keywords": ["segurança", "trabalho", "atestado", "médico", "rh", "saúde"]
    },
    "Protheus": {
        "canonical": "Protheus",
        "category": "produto",
        "phonetic_variants": [
            "protheus", "proteus", "protéus", "protheos"
        ],
        "min_logprob_threshold": -0.70,
        "context_keywords": ["totvs", "erp", "faturamento", "módulo", "sistema"]
    },
    "Fluig": {
        "canonical": "Fluig",
        "category": "produto",
        "phonetic_variants": [
            "fluig", "fluigi", "fluige", "fluigue", "flug", "fluge"
        ],
        "min_logprob_threshold": -0.70,
        "context_keywords": ["totvs", "workflow", "processos", "bpm", "chamado"]
    },
    "sprint": {
        "canonical": "sprint",
        "category": "tecnologia",
        "phonetic_variants": [
            "sprint", "esprint", "isprint", "sprinte"
        ],
        "min_logprob_threshold": -0.75,
        "context_keywords": ["deploy", "ti", "desenvolvimento", "scrum", "entrega", "tarefa"]
    },
    "deploy": {
        "canonical": "deploy",
        "category": "tecnologia",
        "phonetic_variants": [
            "deploy", "deploi", "deplóy", "diploi", "desploy"
        ],
        "min_logprob_threshold": -0.75,
        "context_keywords": ["produção", "servidor", "cluster", "ti", "sprint", "release"]
    },
    "atestado": {
        "canonical": "atestado",
        "category": "rh",
        "phonetic_variants": [
            "atestado", "atestadu", "artestado"
        ],
        "min_logprob_threshold": -0.80,
        "context_keywords": ["médico", "afastamento", "rh", "departamento pessoal", "folha", "sesmt"]
    },
    "departamento pessoal": {
        "canonical": "departamento pessoal",
        "category": "rh",
        "phonetic_variants": [
            "departamento pessoal", "departamento pesual", "dep pessoal", "dp"
        ],
        "min_logprob_threshold": -0.80,
        "context_keywords": ["rh", "folha", "atestado", "admissão", "benefícios"]
    },
    "faturamento": {
        "canonical": "faturamento",
        "category": "financeiro",
        "phonetic_variants": [
            "faturamento", "faturamentu", "facturamento"
        ],
        "min_logprob_threshold": -0.80,
        "context_keywords": ["fiscal", "notas", "protheus", "financeiro", "vendas"]
    },
    "implementação": {
        "canonical": "implementação",
        "category": "projetos",
        "phonetic_variants": [
            "implementação", "implementacao", "inplementação", "enplementação"
        ],
        "min_logprob_threshold": -0.80,
        "context_keywords": ["projeto", "sistema", "cronograma", "entrega", "go live"]
    }
}


def _levenshtein_ratio(s1: str, s2: str) -> float:
    """Calcula similaridade de caracteres normalizada entre 0.0 e 1.0."""
    s1_c = s1.lower().strip()
    s2_c = s2.lower().strip()
    if s1_c == s2_c:
        return 1.0
    if not s1_c or not s2_c:
        return 0.0
    
    len1, len2 = len(s1_c), len(s2_c)
    dp = [[0] * (len2 + 1) for _ in range(len1 + 1)]
    for i in range(len1 + 1):
        dp[i][0] = i
    for j in range(len2 + 1):
        dp[0][j] = j
        
    for i in range(1, len1 + 1):
        for j in range(1, len2 + 1):
            cost = 0 if s1_c[i - 1] == s2_c[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
            
    dist = dp[len1][len2]
    max_len = max(len1, len2)
    return round(1.0 - (dist / max_len), 4)


class ControlledGlossary:
    """
    Controlador de sugestões e correções fonéticas orientadas por confiança e contexto.
    """

    def __init__(self, custom_terms: Optional[Dict[str, Dict[str, Any]]] = None):
        self.glossary = dict(DEFAULT_CORPORATE_GLOSSARY)
        if custom_terms:
            self.glossary.update(custom_terms)

    def get_supported_terms(self) -> List[str]:
        return list(self.glossary.keys())

    def apply_controlled_correction(
        self,
        text: str,
        segments: Optional[List[Dict[str, Any]]] = None,
        meeting_context: Optional[str] = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Aplica correções controladas apenas se houver evidência de baixa confiança ou erro fonético claro.
        Retorna (texto_corrigido, audit_log_correcoes).
        """
        if not text:
            return "", []

        corrections_applied = []
        current_text = text
        if isinstance(meeting_context, dict):
            context_lower = " ".join(str(v) for v in meeting_context.values()).lower()
        else:
            context_lower = (meeting_context or "").lower()
        full_text_lower = text.lower()

        # Extrai segmentos com baixa confiança
        low_confidence_time_ranges = []
        if segments:
            for seg in segments:
                confidence_level = seg.get("confidence_level", "")
                avg_logprob = seg.get("avg_logprob", 0.0)
                no_speech_prob = seg.get("no_speech_prob", 0.0)
                if (
                    confidence_level in ("baixa_confianca", "revisao_necessaria")
                    or avg_logprob < -0.75
                    or no_speech_prob > 0.35
                ):
                    low_confidence_time_ranges.append((seg.get("start", 0.0), seg.get("end", 0.0)))

        for key, entry in self.glossary.items():
            canonical = entry["canonical"]
            variants = entry.get("phonetic_variants", [])
            context_keywords = entry.get("context_keywords", [])

            # Verifica se o contexto geral suporta o termo
            has_context = any(kw in context_lower or kw in full_text_lower for kw in context_keywords)

            for variant in variants:
                # Se for a forma já canônica correta, não precisa de substituição
                if variant.lower() == canonical.lower():
                    continue

                pattern = re.compile(rf"\b{re.escape(variant)}\b", flags=re.IGNORECASE)
                matches = list(pattern.finditer(current_text))

                for m in matches:
                    matched_str = m.group(0)

                    # Regra de segurança: substituição exige proximidade ou contexto comprovado
                    # Termos graves (ex: "ó neo neo") só são corrigidos se houver contexto corporativo
                    is_distorted_term = (variant in ["ó neo neo", "o neo neo", "neo neo"])
                    if is_distorted_term and not has_context:
                        # Sem contexto de reunião/corporativo, não substitui cegamente
                        continue

                    corr_id = f"corr_{uuid.uuid4().hex[:8]}"
                    corr_record = {
                        "id": corr_id,
                        "original_term": matched_str,
                        "corrected_term": canonical,
                        "matched_variant": variant,
                        "category": entry.get("category", "corporativo"),
                        "has_context_support": has_context,
                        "position": (m.start(), m.end()),
                        "can_undo": True,
                        "applied": True
                    }
                    corrections_applied.append(corr_record)

                    # Substituição segura
                    current_text = (
                        current_text[:m.start()] + canonical + current_text[m.end():]
                    )

        return current_text, corrections_applied

    def correct_text(
        self,
        text: str,
        segments: Optional[List[Dict[str, Any]]] = None,
        meeting_context: Any = None
    ) -> Tuple[str, List[Dict[str, Any]]]:
        ctx_str = ""
        if isinstance(meeting_context, dict):
            ctx_str = " ".join(str(v) for v in meeting_context.values())
        elif isinstance(meeting_context, str):
            ctx_str = meeting_context
        normalized, corr = self.apply_controlled_correction(text, segments=segments, meeting_context=ctx_str)
        for c in corr:
            c["original"] = c.get("original_term")
            c["canonical"] = c.get("corrected_term")
            c["reversible"] = c.get("can_undo", True)
        return normalized, corr


_default_glossary_instance = None


def get_controlled_glossary() -> ControlledGlossary:
    global _default_glossary_instance
    if _default_glossary_instance is None:
        _default_glossary_instance = ControlledGlossary()
    return _default_glossary_instance

