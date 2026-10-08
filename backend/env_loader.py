"""
Utilitário de carregamento automático e seguro de variáveis de ambiente (.env).
Não sobrescreve variáveis já exportadas no ambiente do sistema operacional.
Não introduz dependências externas obrigatórias.
"""

import os
from typing import Dict, Optional


def load_env_file(filepath: Optional[str] = None) -> Dict[str, str]:
    """
    Carrega variáveis de um arquivo .env para os.environ.
    Se filepath não for fornecido, busca em locais padrão:
      1. backend/.env
      2. .env (na raiz do projeto)
    Respeita a precedência: variáveis já definidas em os.environ NÃO são sobrescritas.
    """
    candidates = []
    if filepath:
        candidates.append(filepath)
    else:
        # Caminho relativo ao diretório deste módulo (backend/)
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        candidates.append(os.path.join(backend_dir, ".env"))
        # Caminho na raiz do repositório
        root_dir = os.path.dirname(backend_dir)
        candidates.append(os.path.join(root_dir, ".env"))

    env_path = None
    for cand in candidates:
        if os.path.isfile(cand):
            env_path = cand
            break

    loaded: Dict[str, str] = {}
    if not env_path:
        return loaded

    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                # Remove aspas envolventes se houver
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                if key and key not in os.environ:
                    os.environ[key] = val
                    loaded[key] = val
    except Exception as err:
        # Falha silenciosa com log se não for possível ler
        pass

    return loaded


# Executa o carregamento imediatamente ao importar o módulo
_loaded_vars = load_env_file()
