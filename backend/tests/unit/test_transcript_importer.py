import io
import os
import zipfile
import pytest
from transcript_importer import (
    parse_and_validate_transcript_file,
    parse_srt_subtitles,
    parse_vtt_subtitles,
    extract_docx_text,
    compute_content_hash,
    SUPPORTED_EXTENSIONS
)


def test_supported_extensions():
    assert ".txt" in SUPPORTED_EXTENSIONS
    assert ".md" in SUPPORTED_EXTENSIONS
    assert ".srt" in SUPPORTED_EXTENSIONS
    assert ".vtt" in SUPPORTED_EXTENSIONS
    assert ".docx" in SUPPORTED_EXTENSIONS


def test_srt_parsing_with_speakers_and_timestamps():
    srt_content = """1
00:00:01,000 --> 00:00:04,500
[Carlos Silva]: Olá equipe, bom dia a todos.

2
00:00:05,200 --> 00:00:09,000
[Mariana]: Bom dia, Carlos. Vamos revisar o fechamento do financeiro.
"""
    res = parse_and_validate_transcript_file(
        srt_content.encode("utf-8"),
        "reuniao_financeiro_2026_10_14.srt"
    )
    assert res["ok"] is True
    assert "[Carlos Silva]" in res["transcript"]
    assert "[Mariana]" in res["transcript"]
    assert "[00:00:01]" in res["transcript"]
    assert res["department"] == "Financeiro"
    assert "Carlos Silva" in res["participants"]
    assert "Mariana" in res["participants"]
    assert res["format"] == "srt"


def test_vtt_parsing_with_speaker_tags():
    vtt_content = """WEBVTT

00:01.000 --> 00:04.500
<v Roberto>Apresentação do novo módulo de RH da empresa.</v>

00:05.000 --> 00:08.000
<v Lucas>Confirmado, o homologação está agendada.</v>
"""
    res = parse_and_validate_transcript_file(
        vtt_content.encode("utf-8"),
        "alinhamento_rh.vtt"
    )
    assert res["ok"] is True
    assert "[Roberto]: Apresentação do novo módulo" in res["transcript"]
    assert "[Lucas]: Confirmado" in res["transcript"]
    assert res["department"] == "RH"
    assert "Roberto" in res["participants"]
    assert "Lucas" in res["participants"]
    assert res["format"] == "vtt"


def test_plain_text_and_markdown():
    txt_content = "[Ana]: Definido o orçamento para o Q4 do setor de TI."
    res = parse_and_validate_transcript_file(
        txt_content.encode("utf-8"),
        "orcamento_ti.txt"
    )
    assert res["ok"] is True
    assert "[Ana]: Definido o orçamento" in res["transcript"]
    assert res["department"] == "TI"
    assert "Ana" in res["participants"]

    md_content = """# Reunião de Marketing

[Juliana]: Lançamento da nova campanha programado para segunda-feira.
"""
    res_md = parse_and_validate_transcript_file(
        md_content.encode("utf-8"),
        "campanha_marketing.md"
    )
    assert res_md["ok"] is True
    assert "Lançamento da nova campanha" in res_md["transcript"]
    assert res_md["department"] == "Marketing"


def test_docx_native_extraction():
    xml_content = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:body>'
        '<w:p><w:r><w:t>Ata de alinhamento estratégico de Operações.</w:t></w:r></w:p>'
        '<w:p><w:r><w:t>[Felipe]: Todos os prazos de entrega foram validados.</w:t></w:r></w:p>'
        '</w:body>'
        '</w:document>'
    )
    docx_buf = io.BytesIO()
    with zipfile.ZipFile(docx_buf, "w") as z:
        z.writestr("word/document.xml", xml_content.encode("utf-8"))

    res = parse_and_validate_transcript_file(
        docx_buf.getvalue(),
        "alinhamento_operacoes.docx"
    )
    assert res["ok"] is True
    assert "Ata de alinhamento estratégico de Operações" in res["transcript"]
    assert "[Felipe]: Todos os prazos de entrega" in res["transcript"]
    assert res["department"] == "Operações"
    assert "Felipe" in res["participants"]


def test_duplicate_detection():
    transcript_text = "Esta é uma transcrição para teste de deduplicação por hash de conteúdo."
    h = compute_content_hash(transcript_text)

    mock_existing = [
        {
            "ID_MEETING": "meeting-uuid-1234",
            "TITULO_REUNIAO": "Reunião Original Teste",
            "DT_MEETING": "2026-10-10",
            "CONTEUDO_HASH": h,
            "ANON_TRANSCRICAO": transcript_text
        }
    ]

    res = parse_and_validate_transcript_file(
        transcript_text.encode("utf-8"),
        "nova_reuniao.txt",
        existing_meetings=mock_existing
    )
    assert res["ok"] is True
    assert res["is_duplicate"] is True
    assert res["conflicting_meeting"]["id"] == "meeting-uuid-1234"
    assert res["conflicting_meeting"]["title"] == "Reunião Original Teste"


def test_unsupported_and_empty_file_handling():
    # Arquivo vazio
    res_empty = parse_and_validate_transcript_file(b"", "vazio.txt")
    assert res_empty["ok"] is False
    assert "vazio" in res_empty["error"].lower()

    # Formato não suportado (.exe)
    res_exe = parse_and_validate_transcript_file(b"MZ.........", "malware.exe")
    assert res_exe["ok"] is False
    assert "não suportado" in res_exe["error"].lower()

    # Formato PDF (informa que requer biblioteca)
    res_pdf = parse_and_validate_transcript_file(b"%PDF-1.4...", "ata.pdf")
    assert res_pdf["ok"] is False
    assert "pdf" in res_pdf["error"].lower()
