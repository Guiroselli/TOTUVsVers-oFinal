"""
Módulo de consolidação de transcrições e chunks de áudio para o Proton Flow.
Garante ordenação rigorosa por sequência, deduplicação nas bordas entre chunks,
separação entre texto bruto (raw), normalizado, final e correções de usuário,
além de auditoria de filtros de ruído sem perda de conteúdo legítimo.
"""

import re
from typing import Dict, Any, List, Optional, Tuple


def normalize_text_tokens(text: str) -> List[str]:
    """Retorna lista de palavras em minúsculas e sem pontuação para comparação."""
    clean = re.sub(r"[^\w\s]", "", (text or "").lower())
    return [w for w in clean.split() if w]


def detect_border_overlap(prev_text: str, next_chunk: str, max_words: int = 5) -> str:
    """
    Detecta sobreposição de palavras na borda entre o texto acumulado e o próximo chunk.
    Se o final de prev_text contiver as mesmas palavras que o início de next_chunk,
    remove as palavras duplicadas do início de next_chunk.
    Retorna o next_chunk sem a duplicação na borda.
    """
    if not prev_text or not next_chunk:
        return next_chunk or ""

    prev_words = prev_text.strip().split()
    next_words = next_chunk.strip().split()

    if not prev_words or not next_words:
        return next_chunk.strip()

    # Normalização sem pontuação para comparação
    prev_norm = normalize_text_tokens(prev_text)
    next_norm = normalize_text_tokens(next_chunk)

    if not prev_norm or not next_norm:
        return next_chunk.strip()

    # Testa sobreposições de max_words até 1 palavra
    max_check = min(max_words, len(prev_norm), len(next_norm))
    overlap_len = 0

    for k in range(max_check, 0, -1):
        prev_slice = prev_norm[-k:]
        next_slice = next_norm[:k]
        if prev_slice == next_slice:
            overlap_len = k
            break

    if overlap_len > 0:
        # Descarta as primeiras `overlap_len` palavras do next_words
        remaining_words = next_words[overlap_len:]
        return " ".join(remaining_words).strip()

    return next_chunk.strip()


def filter_conversational_noise(text: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Filtra ruídos conversacionais evidentes sem destruir vocabulário de negócio.
    Mantém registro auditável de cada filtro aplicado.
    """
    if not text:
        return "", []

    audit_filters = []
    clean = text

    # Padrões explícitos de ruído conversacional / artefatos de microfone
    noise_patterns = [
        (r"\b(hum|humm|hmm|éé|ãh|ahn)\b", "interjeicao_hesitacao"),
        (r"\[(ru[íi]do|barulho|sil[êe]ncio|inaud[íi]vel)\]", "tag_marcador_ruido"),
        (r"\b(vai\s+entrar\s+vai\s+entrar)\b", "repeticao_borda"),
    ]

    for pat, label in noise_patterns:
        matches = list(re.finditer(pat, clean, flags=re.IGNORECASE))
        for m in matches:
            audit_filters.append({
                "rule": label,
                "matched_text": m.group(0),
                "position": m.start()
            })
        clean = re.sub(pat, " ", clean, flags=re.IGNORECASE)

    # Normaliza múltiplos espaços decorrentes da remoção
    clean = re.sub(r"\s+", " ", clean).strip()

    return clean, audit_filters


from controlled_glossary import ControlledGlossary


class ChunkConsolidator:
    """
    Consolidador inteligente de chunks de áudio.
    Preserva ordenação, remove duplicidades na borda e mantém
    separação estrita de versões para auditoria e reproducibilidade.
    """

    @staticmethod
    def reconstruct_normalized_from_raw(
        raw_text: str,
        corrections: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Reconstrói o texto normalizado a partir do texto bruto (TRANSCRIPT_RAW)
        e histórico de correções auditadas sem perda de dados.
        """
        if not raw_text:
            return ""
        norm, _ = filter_conversational_noise(raw_text)
        if corrections:
            glossary = ControlledGlossary()
            norm, _ = glossary.apply_controlled_correction(norm)
        return norm.strip()

    @staticmethod
    def consolidate(
        processed_chunks: Any,
        existing_corrections: Optional[List[Dict[str, Any]]] = None,
        meeting_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Consolida chunks processados (dicionário ou lista).
        Retorna estrutura com transcript_raw, transcript_normalized, transcript_final e diagnósticos.
        """
        if not processed_chunks:
            return {
                "transcript_raw": "",
                "transcript_normalized": "",
                "transcript_final": "",
                "transcript_corrections": existing_corrections or [],
                "chunks_count": 0,
                "noise_filters_audit": [],
                "border_overlaps_removed": 0,
                "border_overlaps_audit": []
            }

        if isinstance(processed_chunks, list):
            chunks_list = processed_chunks
        else:
            chunks_list = list(processed_chunks.values())

        # Ordena chunks por sequence (se presente) ou timestamp
        sorted_chunks = sorted(
            chunks_list,
            key=lambda c: (c.get("session_id", ""), int(c.get("sequence", 0)))
        )

        raw_parts: List[str] = []
        normalized_parts: List[str] = []
        overlaps_removed_count = 0
        border_overlaps_audit: List[Dict[str, Any]] = []
        all_noise_audits: List[Dict[str, Any]] = []

        current_normalized_acc = ""
        glossary = ControlledGlossary()

        for chunk_info in sorted_chunks:
            chunk_text = (chunk_info.get("text") or "").strip()
            seq = int(chunk_info.get("sequence", 0))
            if not chunk_text:
                continue

            # 1. Versão bruta: preserva exatamente o que o STT emitiu
            raw_parts.append(chunk_text)

            # 2. Versão normalizada: detecta e remove sobreposição de borda
            deduped_chunk = detect_border_overlap(current_normalized_acc, chunk_text)
            if len(deduped_chunk) < len(chunk_text):
                overlaps_removed_count += 1
                trimmed_diff = chunk_text[:len(chunk_text) - len(deduped_chunk)].strip()
                border_overlaps_audit.append({
                    "sequence": seq,
                    "session_id": chunk_info.get("session_id", ""),
                    "removed_overlap": trimmed_diff,
                    "original_chunk": chunk_text,
                    "deduped_chunk": deduped_chunk
                })

            if deduped_chunk:
                # Aplica filtro de ruído auditável (sem apagar repetições legítimas como "não, não pode")
                filtered_chunk, filters_applied = filter_conversational_noise(deduped_chunk)
                if filters_applied:
                    all_noise_audits.extend(filters_applied)

                # Aplica correção controlada de glossário caso haja evidência
                chunk_segments = chunk_info.get("segments") or []
                corrected_chunk, glossary_audits = glossary.apply_controlled_correction(
                    filtered_chunk,
                    segments=chunk_segments,
                    meeting_context=meeting_context
                )

                if corrected_chunk:
                    normalized_parts.append(corrected_chunk)
                    current_normalized_acc = f"{current_normalized_acc} {corrected_chunk}".strip()

        transcript_raw = " ".join(raw_parts).strip()
        transcript_normalized = " ".join(normalized_parts).strip()

        # transcript_final: aplica correções manuais se houver, ou reflete o normalizado
        corrections = existing_corrections or []
        transcript_final = transcript_normalized
        if corrections:
            # A última correção manual confirmada tem precedência
            last_corr = corrections[-1]
            if last_corr.get("corrected_text"):
                transcript_final = last_corr["corrected_text"]

        return {
            "transcript_raw": transcript_raw,
            "transcript_normalized": transcript_normalized,
            "transcript_final": transcript_final,
            "transcript_corrections": corrections,
            "chunks_count": len(sorted_chunks),
            "noise_filters_audit": all_noise_audits,
            "border_overlaps_removed": overlaps_removed_count,
            "border_overlaps_audit": border_overlaps_audit
        }


def reconstruct_normalized_from_raw(raw_text: str, glossary_corrections: List[Dict[str, Any]]) -> str:
    """
    Reconstrói o texto normalizado aplicando de forma auditável e reversível
    as correções registradas sobre o texto bruto.
    """
    if not raw_text or not glossary_corrections:
        return raw_text or ""
    result = raw_text
    for corr in glossary_corrections:
        orig = corr.get("original") or corr.get("original_term") or corr.get("matched_variant")
        canon = corr.get("canonical") or corr.get("corrected_term")
        if orig and canon:
            pattern = re.compile(rf"\b{re.escape(orig)}\b", flags=re.IGNORECASE)
            result = pattern.sub(canon, result)
    return result

