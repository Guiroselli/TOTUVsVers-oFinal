"""
Módulo de extração e validação de transcrições de reuniões externas para o Proton Flow.
Suporta formatos textuais comuns (.txt, .md, .srt, .vtt) e documentos (.docx nativo via zip/xml)
com preservação de nomes de falantes, timestamps de legenda, metadados heurísticos e deduplicação por hash.
Não executa OCR ou chamadas a serviços externos.
"""

import os
import re
import io
import hashlib
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple


SUPPORTED_EXTENSIONS = {".txt", ".md", ".srt", ".vtt", ".docx"}
MAX_FILE_BYTES = 15 * 1024 * 1024  # 15 MB


def compute_content_hash(text: str) -> str:
    """Gera hash SHA-256 estável sobre o texto normalizado para detecção de duplicatas."""
    if not text:
        return ""
    # Normaliza espaços em branco e quebras de linha para comparação justa
    normalized = re.sub(r"\s+", " ", text.strip().lower())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def extract_text_from_plain(file_bytes: bytes) -> str:
    """Decodifica texto puro (.txt ou .md) com fallback de encodings seguros."""
    for enc in ["utf-8", "utf-8-sig", "latin-1", "cp1252"]:
        try:
            return file_bytes.decode(enc).replace("\r\n", "\n").replace("\r", "\n")
        except UnicodeDecodeError:
            continue
    return file_bytes.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")


def parse_srt_subtitles(srt_content: str) -> str:
    """
    Extrai texto de legendas SRT preservando rótulos de falantes e blocos cronológicos.
    Exemplo:
        1
        00:00:01,000 --> 00:00:04,500
        [Carlos]: Bom dia a todos.
    """
    lines = srt_content.splitlines()
    cleaned_blocks: List[str] = []
    current_text_lines: List[str] = []
    current_time = ""

    time_pattern = re.compile(r"^(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})")
    index_pattern = re.compile(r"^\d+$")

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if current_text_lines:
                block_content = " ".join(current_text_lines).strip()
                if block_content:
                    if current_time:
                        cleaned_blocks.append(f"[{current_time}] {block_content}")
                    else:
                        cleaned_blocks.append(block_content)
                current_text_lines = []
                current_time = ""
            continue

        if index_pattern.match(line):
            continue

        time_match = time_pattern.match(line)
        if time_match:
            current_time = time_match.group(1)[:8]
            continue

        current_text_lines.append(line)

    if current_text_lines:
        block_content = " ".join(current_text_lines).strip()
        if block_content:
            if current_time:
                cleaned_blocks.append(f"[{current_time}] {block_content}")
            else:
                cleaned_blocks.append(block_content)

    return "\n\n".join(cleaned_blocks).strip()


def parse_vtt_subtitles(vtt_content: str) -> str:
    """
    Extrai texto de legendas WebVTT preservando rótulos de falantes e marcas de voz.
    Exemplo:
        00:01.000 --> 00:04.500
        <v Mariana>Olá pessoal, tudo bem?</v>
        -> [00:01] [Mariana]: Olá pessoal, tudo bem?
    """
    lines = vtt_content.splitlines()
    cleaned_blocks: List[str] = []
    current_text_lines: List[str] = []
    current_time = ""

    time_pattern = re.compile(r"^((?:\d{2}:)?\d{2}:\d{2}[\.]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[\.]\d{3})")

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if current_text_lines:
                block_content = " ".join(current_text_lines).strip()
                if block_content:
                    if current_time:
                        cleaned_blocks.append(f"[{current_time}] {block_content}")
                    else:
                        cleaned_blocks.append(block_content)
                current_text_lines = []
                current_time = ""
            continue

        if line.upper().startswith("WEBVTT") or line.upper().startswith("NOTE"):
            continue

        time_match = time_pattern.match(line)
        if time_match:
            start_raw = time_match.group(1)
            parts = start_raw.split(".")[0]
            current_time = parts
            continue

        # Transforma tag WebVTT <v Nome> em [Nome]:
        v_tag_match = re.match(r"^<v\s+([^>]+)>(.*)$", line)
        if v_tag_match:
            speaker_name = v_tag_match.group(1).strip()
            rest = v_tag_match.group(2).replace("</v>", "").strip()
            line = f"[{speaker_name}]: {rest}"
        else:
            line = re.sub(r"</?v[^>]*>", "", line).strip()

        # Remove outras tags html/vtt comuns como <c>, <b>, <i>, <00:00:00.000>
        line = re.sub(r"<[^>]+>", "", line).strip()
        if line:
            current_text_lines.append(line)

    if current_text_lines:
        block_content = " ".join(current_text_lines).strip()
        if block_content:
            if current_time:
                cleaned_blocks.append(f"[{current_time}] {block_content}")
            else:
                cleaned_blocks.append(block_content)

    return "\n\n".join(cleaned_blocks).strip()


def extract_docx_text(file_bytes: bytes) -> str:
    """
    Extrai parágrafos de documento .docx usando a biblioteca padrão zipfile e XML ElementTree.
    Não necessita de dependências externas como python-docx.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as docx_zip:
            if "word/document.xml" not in docx_zip.namelist():
                raise ValueError("Estrutura interna do DOCX inválida: word/document.xml não encontrado.")

            xml_content = docx_zip.read("word/document.xml")
            tree = ET.fromstring(xml_content)

            namespaces = {
                "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            }

            paragraphs: List[str] = []
            for p in tree.iterfind(".//w:p", namespaces):
                texts = [node.text for node in p.iterfind(".//w:t", namespaces) if node.text]
                if texts:
                    para_text = "".join(texts).strip()
                    if para_text:
                        paragraphs.append(para_text)

            return "\n\n".join(paragraphs).strip()
    except Exception as e:
        raise ValueError(f"Falha ao ler arquivo .docx: {str(e)}")


def detect_metadata_heuristics(filename: str, text: str) -> Dict[str, Any]:
    """
    Extrai metadados heurísticos a partir do nome do arquivo e do corpo da transcrição:
    - Título da reunião sugerido;
    - Data no formato YYYY-MM-DD;
    - Departamento / Equipe;
    - Participantes explícitos identificados.
    """
    base_name = os.path.splitext(os.path.basename(filename))[0]

    # 1. Sugestão de título
    # Remove datas ou números do início/fim do nome do arquivo
    clean_title = re.sub(r"[\-_]+", " ", base_name)
    clean_title = re.sub(r"^\d{4}\s*\d{2}\s*\d{2}\s*", "", clean_title)
    clean_title = re.sub(r"\s*\d{4}\s*\d{2}\s*\d{2}$", "", clean_title)
    clean_title = clean_title.strip().capitalize()
    if not clean_title or len(clean_title) < 3:
        clean_title = f"Reunião Importada - {base_name}"

    # 2. Sugestão de data
    suggested_date = datetime.now().strftime("%Y-%m-%d")
    date_patterns = [
        r"(\d{4})[_\-](\d{2})[_\-](\d{2})",  # YYYY-MM-DD
        r"(\d{2})[_\-](\d{2})[_\-](\d{4})",  # DD-MM-YYYY
    ]
    for pat in date_patterns:
        m = re.search(pat, base_name)
        if m:
            g = m.groups()
            if len(g[0]) == 4:
                suggested_date = f"{g[0]}-{g[1]}-{g[2]}"
            else:
                suggested_date = f"{g[2]}-{g[1]}-{g[0]}"
            break

    # 3. Sugestão de departamento / área
    suggested_dept = "Geral"
    dept_keywords = {
        "financeiro": "Financeiro",
        "rh": "RH",
        "recursos humanos": "RH",
        "ti": "TI",
        "tecnologia": "TI",
        "comercial": "Comercial",
        "vendas": "Comercial",
        "marketing": "Marketing",
        "operações": "Operações",
        "operacoes": "Operações",
        "produto": "Produto",
        "estudante": "Estudante",
    }
    lower_name = (filename + " " + text[:500]).lower()
    for kw, dept in dept_keywords.items():
        if re.search(r"\b" + re.escape(kw) + r"\b", lower_name):
            suggested_dept = dept
            break

    # 4. Detecção de participantes pelas tags de falante presentes no texto
    # Ex: [Carlos]: ou Carlos: ou [00:01] [Ana]:
    speaker_matches = re.findall(r"(?:\[[\d\:\.]+\]\s*)?\[([^\]]+)\]\s*:", text)
    if not speaker_matches:
        speaker_matches = re.findall(r"^(?:\[[\d\:\.]+\]\s*)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zA-ZáéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]{1,30}):\s+", text, flags=re.MULTILINE)

    participants: List[str] = []
    seen = set()
    for spk in speaker_matches:
        spk_clean = spk.strip()
        if spk_clean and len(spk_clean) >= 2 and spk_clean.lower() not in seen:
            if not any(stop in spk_clean.lower() for stop in ["falante não", "timestamp", "nota", "ruído"]):
                seen.add(spk_clean.lower())
                participants.append(spk_clean)

    return {
        "title": clean_title[:80],
        "date": suggested_date,
        "department": suggested_dept,
        "participants": participants[:10]
    }


def parse_and_validate_transcript_file(
    file_bytes: bytes,
    filename: str,
    existing_meetings: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Processa um arquivo individual enviado, extrai o texto preservando estrutura,
    avalia limites de segurança, detecta metadados e verifica duplicatas contra reuniões existentes.
    """
    if not file_bytes or len(file_bytes) == 0:
        return {
            "ok": False,
            "filename": filename,
            "error": "O arquivo enviado está completamente vazio (0 bytes)."
        }

    if len(file_bytes) > MAX_FILE_BYTES:
        return {
            "ok": False,
            "filename": filename,
            "error": f"O tamanho do arquivo ({round(len(file_bytes) / (1024 * 1024), 2)} MB) excede o limite máximo permitido de 15 MB."
        }

    ext = os.path.splitext(filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        if ext == ".pdf":
            return {
                "ok": False,
                "filename": filename,
                "error": "Extração de arquivos PDF e OCR não está disponível sem bibliotecas adicionais. Exporte o conteúdo como .txt, .md, .docx ou copie o texto da ata."
            }
        return {
            "ok": False,
            "filename": filename,
            "error": f"Formato '{ext}' não suportado. Utilize arquivos com extensão .txt, .md, .srt, .vtt ou .docx."
        }

    extracted_text = ""
    try:
        if ext in (".txt", ".md"):
            extracted_text = extract_text_from_plain(file_bytes)
        elif ext == ".srt":
            raw_str = extract_text_from_plain(file_bytes)
            extracted_text = parse_srt_subtitles(raw_str)
        elif ext == ".vtt":
            raw_str = extract_text_from_plain(file_bytes)
            extracted_text = parse_vtt_subtitles(raw_str)
        elif ext == ".docx":
            extracted_text = extract_docx_text(file_bytes)
    except Exception as parse_err:
        return {
            "ok": False,
            "filename": filename,
            "error": f"Falha na extração de texto do arquivo {filename}: {str(parse_err)}"
        }

    clean_text = extracted_text.strip()
    if not clean_text or len(clean_text) < 10:
        return {
            "ok": False,
            "filename": filename,
            "error": "Não foi possível extrair texto válido do arquivo ou o conteúdo é muito curto (mínimo de 10 caracteres)."
        }

    content_hash = compute_content_hash(clean_text)
    meta = detect_metadata_heuristics(filename, clean_text)

    # Verificação de duplicata contra reuniões existentes
    is_duplicate = False
    conflicting_meeting = None

    if existing_meetings:
        for m in existing_meetings:
            # 1. Checagem direta por hash armazenado
            m_hash = m.get("CONTEUDO_HASH")
            if m_hash and m_hash == content_hash:
                is_duplicate = True
                conflicting_meeting = {
                    "id": m.get("ID_MEETING"),
                    "title": m.get("TITULO_REUNIAO") or m.get("TITULO"),
                    "date": m.get("DT_MEETING"),
                    "match_type": "conteudo_identico_hash"
                }
                break

            # 2. Checagem por texto idêntico no banco
            existing_text = m.get("ANON_TRANSCRICAO") or m.get("transcription") or ""
            if existing_text and len(existing_text) > 20:
                if compute_content_hash(existing_text) == content_hash:
                    is_duplicate = True
                    conflicting_meeting = {
                        "id": m.get("ID_MEETING"),
                        "title": m.get("TITULO_REUNIAO") or m.get("TITULO"),
                        "date": m.get("DT_MEETING"),
                        "match_type": "conteudo_identico_texto"
                    }
                    break

    word_count = len(clean_text.split())

    return {
        "ok": True,
        "filename": filename,
        "format": ext.lstrip("."),
        "transcript": clean_text,
        "char_count": len(clean_text),
        "word_count": word_count,
        "title": meta["title"],
        "date": meta["date"],
        "department": meta["department"],
        "participants": meta["participants"],
        "content_hash": content_hash,
        "is_duplicate": is_duplicate,
        "conflicting_meeting": conflicting_meeting
    }
