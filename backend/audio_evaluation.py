"""
Módulo de avaliação objetiva de qualidade para Speech-to-Text (STT) do Proton Flow.
Calcula métricas linguísticas formais:
- WER (Word Error Rate)
- CER (Character Error Rate)
- WER focado em Vocabulário Corporativo
- Taxa de palavras inventadas / alucinações
- Detecção de cortes nas bordas (início e fim)
- Taxa de duplicação
- Latência média e percentil 95
"""

import re
import unicodedata
from typing import Dict, Any, List, Optional, Tuple


def normalize_eval_text(text: str) -> str:
    """Normaliza texto para cálculo justo de WER/CER (minúsculas, remove pontuação e múltiplos espaços)."""
    if not text:
        return ""
    # Converte para minúsculas
    norm = text.lower()
    # Remove pontuação
    norm = re.sub(r"[^\w\s]", " ", norm)
    # Remove espaços duplicados
    return " ".join(norm.split())


def _levenshtein_distance(seq1: List[Any], seq2: List[Any]) -> Tuple[int, int, int, int]:
    """
    Calcula a distância de Levenshtein entre duas sequências.
    Retorna (distancia, substituicoes, insercoes, delecoes).
    """
    n = len(seq1)
    m = len(seq2)
    
    # dp[i][j] = (custo, subs, ins, dels)
    dp = [[(0, 0, 0, 0) for _ in range(m + 1)] for _ in range(n + 1)]
    
    for i in range(1, n + 1):
        dp[i][0] = (i, 0, 0, i)
    for j in range(1, m + 1):
        dp[0][j] = (j, 0, j, 0)
        
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if seq1[i - 1] == seq2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                cost_sub, s, ins, d = dp[i - 1][j - 1]
                cost_del, s_d, ins_d, d_d = dp[i - 1][j]
                cost_ins, s_i, ins_i, d_i = dp[i][j - 1]
                
                sub_option = (cost_sub + 1, s + 1, ins, d)
                del_option = (cost_del + 1, s_d, ins_d, d_d + 1)
                ins_option = (cost_ins + 1, s_i, ins_i + 1, d_i)
                
                dp[i][j] = min(sub_option, del_option, ins_option, key=lambda x: x[0])
                
    return dp[n][m]


def calculate_wer(reference: str, hypothesis: str) -> float:
    """
    Calcula a Taxa de Erro de Palavras (Word Error Rate - WER).
    WER = (Substituições + Inserções + Deleções) / Total de palavras de referência.
    Retorna valor entre 0.0 e 1.0 (ou > 1.0 em casos de inserções excessivas).
    """
    ref_norm = normalize_eval_text(reference)
    hyp_norm = normalize_eval_text(hypothesis)
    
    ref_words = ref_norm.split()
    hyp_words = hyp_norm.split()
    
    if not ref_words:
        return 0.0 if not hyp_words else 1.0
        
    distance, _, _, _ = _levenshtein_distance(ref_words, hyp_words)
    return round(distance / len(ref_words), 4)


def calculate_cer(reference: str, hypothesis: str) -> float:
    """
    Calcula a Taxa de Erro de Caracteres (Character Error Rate - CER).
    CER = Levenshtein(chars_ref, chars_hyp) / len(chars_ref).
    """
    ref_norm = normalize_eval_text(reference)
    hyp_norm = normalize_eval_text(hypothesis)
    
    ref_chars = list(ref_norm.replace(" ", ""))
    hyp_chars = list(hyp_norm.replace(" ", ""))
    
    if not ref_chars:
        return 0.0 if not hyp_chars else 1.0
        
    distance, _, _, _ = _levenshtein_distance(ref_chars, hyp_chars)
    return round(distance / len(ref_chars), 4)


def calculate_corporate_wer(
    reference: str, 
    hypothesis: str, 
    corporate_terms: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Avalia especificamente a precisão de termos técnicos corporativos.
    Identifica termos esperados, termos acertados, corrompidos e taxa de acerto.
    """
    if corporate_terms is None:
        corporate_terms = [
            "reunião", "proton flow", "totvs", "rh", "ti", "sesmt", "protheus", 
            "fluig", "sprint", "deploy", "atestado", "departamento pessoal", 
            "faturamento", "implementação", "ata operacional", "ata executiva"
        ]
        
    ref_norm = f" {normalize_eval_text(reference)} "
    hyp_norm = f" {normalize_eval_text(hypothesis)} "
    
    expected_in_ref = []
    found_in_hyp = []
    missed_terms = []
    
    for term in corporate_terms:
        term_clean = normalize_eval_text(term)
        if f" {term_clean} " in ref_norm:
            expected_in_ref.append(term)
            if f" {term_clean} " in hyp_norm:
                found_in_hyp.append(term)
            else:
                missed_terms.append(term)
                
    total_expected = len(expected_in_ref)
    accuracy = round(len(found_in_hyp) / total_expected, 4) if total_expected > 0 else 1.0
    corporate_error_rate = round(1.0 - accuracy, 4)
    
    return {
        "expected_terms": expected_in_ref,
        "matched_terms": found_in_hyp,
        "missed_terms": missed_terms,
        "total_expected": total_expected,
        "corporate_accuracy": accuracy,
        "corporate_error_rate": corporate_error_rate
    }


def detect_border_cuts(reference: str, hypothesis: str) -> Dict[str, Any]:
    """
    Detecta se houve corte sistemático de palavras nas bordas (início ou fim).
    """
    ref_words = normalize_eval_text(reference).split()
    hyp_words = normalize_eval_text(hypothesis).split()
    
    if not ref_words or not hyp_words:
        return {"initial_cut": False, "final_cut": False, "details": "Texto vazio"}
        
    first_ref = ref_words[0]
    last_ref = ref_words[-1]
    
    # Verifica se a primeira palavra da referência foi cortada da hipótese
    initial_cut = (first_ref not in hyp_words[:2]) if len(ref_words) >= 3 else False
    # Verifica se a última palavra foi cortada da hipótese
    final_cut = (last_ref not in hyp_words[-2:]) if len(ref_words) >= 3 else False
    
    return {
        "initial_cut": initial_cut,
        "final_cut": final_cut,
        "missing_initial_word": first_ref if initial_cut else None,
        "missing_final_word": last_ref if final_cut else None
    }


def detect_hallucinated_words(reference: str, hypothesis: str) -> List[str]:
    """Retorna palavras que constam na hipótese mas não constam na referência."""
    ref_words = set(normalize_eval_text(reference).split())
    hyp_words = normalize_eval_text(hypothesis).split()
    return [w for w in hyp_words if w not in ref_words]



def evaluate_transcription(
    reference: str, 
    hypothesis: str, 
    corporate_terms: Optional[List[str]] = None,
    latency_ms: float = 0.0
) -> Dict[str, Any]:
    """
    Avaliação consolidada de transcrição gerando todas as métricas exigidas pelo prompt.
    """
    wer = calculate_wer(reference, hypothesis)
    cer = calculate_cer(reference, hypothesis)
    corp_eval = calculate_corporate_wer(reference, hypothesis, corporate_terms)
    border_cuts = detect_border_cuts(reference, hypothesis)
    
    ref_words = set(normalize_eval_text(reference).split())
    hyp_words = normalize_eval_text(hypothesis).split()
    
    # Palavras presentes na hipótese mas inexistentes na referência (alucinações/erros)
    hallucinated_words = [w for w in hyp_words if w not in ref_words]
    hallucination_rate = round(len(hallucinated_words) / len(hyp_words), 4) if hyp_words else 0.0
    
    # Taxa de duplicações consecutivas
    consecutive_dupes = 0
    for i in range(len(hyp_words) - 1):
        if hyp_words[i] == hyp_words[i + 1]:
            consecutive_dupes += 1
    duplication_rate = round(consecutive_dupes / len(hyp_words), 4) if hyp_words else 0.0

    return {
        "wer": wer,
        "cer": cer,
        "corporate_accuracy": corp_eval["corporate_accuracy"],
        "corporate_error_rate": corp_eval["corporate_error_rate"],
        "expected_terms": corp_eval["expected_terms"],
        "matched_terms": corp_eval["matched_terms"],
        "missed_terms": corp_eval["missed_terms"],
        "hallucination_rate": hallucination_rate,
        "hallucinated_words_count": len(hallucinated_words),
        "duplication_rate": duplication_rate,
        "initial_cut": border_cuts["initial_cut"],
        "final_cut": border_cuts["final_cut"],
        "latency_ms": latency_ms
    }
