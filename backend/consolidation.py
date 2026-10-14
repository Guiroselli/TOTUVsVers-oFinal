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

    # Partículas curtas ou conectores que NÃO devem ser removidos se overlap_len == 1
    SHORT_STOPWORDS = {"de", "e", "a", "o", "da", "do", "em", "um", "uma", "não", "que", "se", "no", "na"}

    for k in range(max_check, 0, -1):
        prev_slice = prev_norm[-k:]
        next_slice = next_norm[:k]
        if prev_slice == next_slice:
            # Se for apenas 1 palavra, não remove se for palavra curta/artigo/preposição comum
            if k == 1 and (len(next_slice[0]) <= 3 or next_slice[0] in SHORT_STOPWORDS):
                continue
            overlap_len = k
            break

    if overlap_len > 0:
        # Descarta as primeiras `overlap_len` palavras do next_words
        remaining_words = next_words[overlap_len:]
        return " ".join(remaining_words).strip()

    return next_chunk.strip()


def collapse_repetitive_loops(text: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Detecta e colapsa loops patológicos de repetição de 1 a 4 palavras repetidas
    3 ou mais vezes consecutivamente (ex: 'que é que é que é que é' -> 'que é').
    Preserva repetições conversacionais legítimas de até 2 repetições (ex: 'não, não pode').
    """
    if not text:
        return "", []

    audits = []
    cleaned = text
    # Expressão regular para sequências de 1 a 4 palavras repetidas 3+ vezes consecutivamente
    pattern = r"\b([a-zA-Z0-9áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+(?:\s+[a-zA-Z0-9áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+){0,3})(?:[\s,]+\1){2,}\b"

    for _ in range(3):  # até 3 passagens para loops aninhados
        matches = list(re.finditer(pattern, cleaned, flags=re.IGNORECASE))
        if not matches:
            break
        for m in matches:
            audits.append({
                "rule": "repeticao_patologica",
                "matched_text": m.group(0),
                "collapsed_to": m.group(1),
                "position": m.start()
            })
        cleaned = re.sub(pattern, r"\1", cleaned, flags=re.IGNORECASE)

    return cleaned, audits


def filter_conversational_noise(text: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Filtra ruídos conversacionais evidentes e loops de repetição patológica sem destruir vocabulário de negócio.
    Mantém registro auditável de cada filtro aplicado.
    """
    if not text:
        return "", []

    audit_filters = []
    clean = text

    # 1. Colapso de repetições patológicas (ex: loops de 'que é que é que é')
    clean, rep_audits = collapse_repetitive_loops(clean)
    if rep_audits:
        audit_filters.extend(rep_audits)

    # 2. Padrões explícitos de ruído conversacional / artefatos de microfone
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

        chunk_processed_records: List[Dict[str, Any]] = []

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
                # Aplica filtro de ruído auditável e colapso de loops repetitivos
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
                    chunk_processed_records.append({
                        "chunk_info": chunk_info,
                        "raw": chunk_text,
                        "normalized": corrected_chunk
                    })

        # Atribuição de falantes: se houver falante especificado em algum chunk
        has_any_speaker = any(bool((c.get("speaker_name") or "").strip()) for c in sorted_chunks)

        if has_any_speaker and chunk_processed_records:
            dialogue_raw: List[str] = []
            dialogue_norm: List[str] = []
            curr_spk = None
            curr_raw_group: List[str] = []
            curr_norm_group: List[str] = []

            for rec in chunk_processed_records:
                spk = (rec["chunk_info"].get("speaker_name") or "").strip() or "Falante não identificado"
                raw_t = rec["raw"]
                norm_t = rec["normalized"]

                if spk != curr_spk:
                    if curr_spk is not None:
                        if curr_raw_group:
                            dialogue_raw.append(f"[{curr_spk}]: " + " ".join(curr_raw_group))
                        if curr_norm_group:
                            dialogue_norm.append(f"[{curr_spk}]: " + " ".join(curr_norm_group))
                    curr_spk = spk
                    curr_raw_group = [raw_t]
                    curr_norm_group = [norm_t]
                else:
                    curr_raw_group.append(raw_t)
                    curr_norm_group.append(norm_t)

            if curr_spk is not None:
                if curr_raw_group:
                    dialogue_raw.append(f"[{curr_spk}]: " + " ".join(curr_raw_group))
                if curr_norm_group:
                    dialogue_norm.append(f"[{curr_spk}]: " + " ".join(curr_norm_group))

            transcript_raw = "\n\n".join(dialogue_raw).strip()
            transcript_normalized = "\n\n".join(dialogue_norm).strip()
        else:
            transcript_raw = " ".join(raw_parts).strip()
            transcript_normalized = " ".join(normalized_parts).strip()

        # transcript_final: aplica correções manuais se houver, ou reflete o normalizado
        corrections = existing_corrections or []
        transcript_final = transcript_normalized
        if corrections:
            last_corr = corrections[-1]
            last_corr_time = last_corr.get("timestamp") or ""
            # Chunks recebidos estritamente após a última correção manual
            new_chunks_after = [
                c for c in sorted_chunks
                if (c.get("processed_at") or "") > last_corr_time
            ]
            if not new_chunks_after and last_corr.get("corrected_text"):
                transcript_final = last_corr["corrected_text"]
            elif new_chunks_after and last_corr.get("corrected_text"):
                new_texts = [c.get("text", "").strip() for c in new_chunks_after if c.get("text")]
                if new_texts:
                    transcript_final = f"{last_corr['corrected_text']} {' '.join(new_texts)}".strip()
                else:
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

