"""
Utilitários centralizados de resolução de caminhos para o Proton Flow.
Garante que caminhos relativos de modelos, uploads e artefatos sejam
resolvidos invariavelmente em relação à raiz do projeto.
"""

import os
from typing import Optional


def get_project_root() -> str:
    """
    Retorna o caminho absoluto canônico da raiz do projeto Proton Flow.
    Localiza a raiz subindo a partir deste arquivo ou verificando marcadores característicos
    do repositório (diretórios 'backend' e 'frontend').
    """
    current_dir = os.path.dirname(os.path.abspath(__file__))

    # Se este arquivo estiver dentro de 'backend', a raiz imediata é o diretório pai
    if os.path.basename(current_dir).lower() == "backend":
        candidate = os.path.dirname(current_dir)
        if os.path.exists(os.path.join(candidate, "backend")):
            return os.path.abspath(candidate)

    # Varredura ascendente procurando diretórios raiz característicos
    check_dir = current_dir
    while True:
        if (
            os.path.exists(os.path.join(check_dir, "backend"))
            and os.path.exists(os.path.join(check_dir, "frontend"))
        ):
            return os.path.abspath(check_dir)
        parent = os.path.dirname(check_dir)
        if parent == check_dir:
            break
        check_dir = parent

    # Fallback seguro
    return os.path.abspath(os.path.join(current_dir, ".."))


def resolve_model_cache_dir(cache_dir: Optional[str] = None) -> str:
    """
    Resolve o diretório de cache do modelo Whisper para um caminho absoluto canônico:
    1. Se cache_dir for vazio ou None, obtém de STT_MODEL_CACHE_DIR ou usa './models'.
    2. Expande o caractere '~' (home do usuário).
    3. Preserva caminhos que já são absolutos.
    4. Converte caminhos relativos (ex: './models', 'models', '../models') para caminhos
       absolutos baseados estritamente na RAIZ DO PROJETO, nunca no working directory (cwd)
       do processo.
    """
    raw = cache_dir
    if raw is None or not str(raw).strip():
        raw = os.getenv("STT_MODEL_CACHE_DIR", "./models")
    raw = str(raw).strip()
    if not raw:
        raw = "./models"

    # Expande '~' (home do usuário)
    expanded = os.path.expanduser(raw)

    # Se for caminho absoluto, normaliza e retorna diretamente
    if os.path.isabs(expanded):
        return os.path.abspath(os.path.normpath(expanded))

    # Caminho relativo: resolve obrigatoriamente a partir da raiz do projeto
    root = get_project_root()
    return os.path.abspath(os.path.normpath(os.path.join(root, expanded)))
