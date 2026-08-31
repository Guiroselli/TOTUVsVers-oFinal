import os
import shutil
import tempfile
import pytest

FILES_TO_PRESERVE = [
    "dataset_limpo.json",
    "config_integracoes.json",
    "integracoes_totvs.json",
    "audit_events.json",
    "perfis_clientes.json"
]

@pytest.fixture(autouse=True, scope="function")
def preserve_data_files():
    """
    Garante que nenhum teste altere permanentemente os arquivos de dados do projeto.
    Faz snapshot antes do teste e restaura o conteúdo original ao finalizar.
    """
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    snapshots = {}

    for fname in FILES_TO_PRESERVE:
        fpath = os.path.join(backend_dir, fname)
        if os.path.exists(fpath):
            with open(fpath, "rb") as f:
                snapshots[fname] = f.read()

    yield

    # Restaura arquivos originais
    for fname, content in snapshots.items():
        fpath = os.path.join(backend_dir, fname)
        try:
            with open(fpath, "wb") as f:
                f.write(content)
        except Exception as e:
            print(f"Erro ao restaurar {fname}: {e}")
