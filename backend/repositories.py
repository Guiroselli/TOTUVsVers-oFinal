import os
import json
import uuid
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

from normalization import normalize_date_iso, normalize_client_code, normalize_urgency, normalize_pain_category

DATASET_PATH = os.path.join(os.path.dirname(__file__), "dataset_limpo.json")
PERFIS_PATH = os.path.join(os.path.dirname(__file__), "perfis_clientes.json")
INTEGRACOES_LOG_PATH = os.path.join(os.path.dirname(__file__), "integracoes_totvs.json")
INTEGRACOES_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config_integracoes.json")
AUDIT_LOG_PATH = os.path.join(os.path.dirname(__file__), "audit_events.json")


def _atomic_write_json(path: str, data: Any):
    """Grava JSON de forma atômica usando arquivo temporário + replace."""
    dir_name = os.path.dirname(os.path.abspath(path))
    os.makedirs(dir_name, exist_ok=True)
    temp_path = f"{path}.tmp.{uuid.uuid4().hex}"
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, path)
    except Exception:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        raise


def _read_json(path: str, default: Any) -> Any:
    """Lê arquivo JSON de forma segura com fallback."""
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


class MeetingRepository:
    """
    Camada de persistência para reuniões, análises, sugestões e auditoria.
    Thread-safe com locks de leitura/escrita e operações atômicas.
    """
    def __init__(self, dataset_path: str = DATASET_PATH):
        self.dataset_path = dataset_path
        self._lock = threading.RLock()

    def get_all(self, 
                start_date: Optional[str] = None, 
                end_date: Optional[str] = None,
                client_code: Optional[str] = None,
                format_filter: Optional[str] = None,
                status_filter: Optional[str] = None,
                search: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            data = _read_json(self.dataset_path, [])
            filtered = []

            # Normalização de filtros de data para comparação lexicográfica YYYY-MM-DD
            norm_start = normalize_date_iso(start_date)
            if norm_start and len(norm_start) >= 10:
                norm_start = norm_start[:10]
            else:
                norm_start = None

            norm_end = normalize_date_iso(end_date)
            if norm_end and len(norm_end) >= 10:
                norm_end = norm_end[:10]
            else:
                norm_end = None

            norm_client = normalize_client_code(client_code) if client_code else None
            
            for item in data:
                # 1. Filtro de data
                item_date_norm = normalize_date_iso(item.get("DT_MEETING", ""))
                item_date_prefix = item_date_norm[:10] if item_date_norm and len(item_date_norm) >= 10 else None
                
                if norm_start and item_date_prefix and item_date_prefix < norm_start:
                    continue
                if norm_end and item_date_prefix and item_date_prefix > norm_end:
                    continue

                # 2. Filtro de cliente
                if norm_client:
                    item_client = normalize_client_code(item.get("NOME_SEGMENTO", ""))
                    if norm_client.lower() != item_client.lower():
                        continue

                # 3. Filtro de formato
                if format_filter:
                    item_fmt = (item.get("FORMATO_MEETING") or "").upper()
                    if format_filter.upper() not in item_fmt:
                        continue

                # 4. Filtro de status
                if status_filter:
                    item_status = (item.get("STATUS_MEETING") or "").upper()
                    if status_filter.upper() not in item_status:
                        continue

                # 5. Busca textual
                if search:
                    search_lower = search.lower()
                    transcript = str(item.get("ANON_TRANSCRICAO", "")).lower()
                    client_str = str(item.get("NOME_SEGMENTO", "")).lower()
                    resp_str = str(item.get("RESPONSAVEL_REUNIAO", "")).lower()
                    tema_str = ""
                    if isinstance(item.get("RESUMO_IA"), dict):
                        tema_str = str(item.get("RESUMO_IA", {}).get("tema", "")).lower()
                    
                    if not (search_lower in transcript or search_lower in client_str or search_lower in resp_str or search_lower in tema_str):
                        continue

                filtered.append(item)

            return filtered

    def get_paginated(self, page: int = 1, page_size: int = 10, **filters) -> Tuple[List[Dict[str, Any]], int, int]:
        """Retorna (itens_pagina, total, total_paginas)."""
        all_items = self.get_all(**filters)
        total = len(all_items)
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 10
            
        total_pages = max(1, (total + page_size - 1) // page_size)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        
        return all_items[start_idx:end_idx], total, total_pages

    def get_by_id(self, meeting_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            data = _read_json(self.dataset_path, [])
            for item in data:
                if str(item.get("ID_MEETING")) == str(meeting_id):
                    return item
            return None

    def save_meeting(self, meeting_dict: Dict[str, Any]) -> str:
        """Cria ou atualiza uma reunião no topo da lista."""
        with self._lock:
            data = _read_json(self.dataset_path, [])
            meeting_id = str(meeting_dict.get("ID_MEETING") or uuid.uuid4())
            meeting_dict["ID_MEETING"] = meeting_id
            
            # Normalizações padrão
            if "DT_MEETING" in meeting_dict and meeting_dict["DT_MEETING"]:
                meeting_dict["DT_MEETING"] = normalize_date_iso(meeting_dict["DT_MEETING"])
            else:
                meeting_dict["DT_MEETING"] = datetime.now().strftime("%Y-%m-%d")
                
            meeting_dict["NOME_SEGMENTO"] = normalize_client_code(meeting_dict.get("NOME_SEGMENTO"))
            meeting_dict["NIVEL_URGENCIA"] = normalize_urgency(meeting_dict.get("NIVEL_URGENCIA"))

            # Verifica se já existe
            idx_found = -1
            for i, item in enumerate(data):
                if str(item.get("ID_MEETING")) == meeting_id:
                    idx_found = i
                    break

            if idx_found >= 0:
                data[idx_found].update(meeting_dict)
            else:
                data.insert(0, meeting_dict)

            _atomic_write_json(self.dataset_path, data)
            return meeting_id

    def update_analysis(self, meeting_id: str, analysis_data: Dict[str, Any]) -> bool:
        with self._lock:
            data = _read_json(self.dataset_path, [])
            updated = False
            for item in data:
                if str(item.get("ID_MEETING")) == str(meeting_id):
                    item["RESUMO_IA"] = analysis_data
                    # Se vier sugestões, sincroniza no nível da reunião
                    if "field_suggestions" in analysis_data:
                        item["field_suggestions"] = analysis_data["field_suggestions"]
                    # Sincroniza urgência e responsável se não preenchidos manualmente
                    if analysis_data.get("nivel_urgencia") and not item.get("NIVEL_URGENCIA"):
                        item["NIVEL_URGENCIA"] = normalize_urgency(analysis_data["nivel_urgencia"])
                    if analysis_data.get("responsavel_reuniao") and not item.get("RESPONSAVEL_REUNIAO"):
                        item["RESPONSAVEL_REUNIAO"] = analysis_data["responsavel_reuniao"]
                    updated = True
                    break
            if updated:
                _atomic_write_json(self.dataset_path, data)
            return updated

    def update_metadata(self, meeting_id: str, fields: Dict[str, Any], author: str = "user") -> bool:
        with self._lock:
            data = _read_json(self.dataset_path, [])
            updated = False
            for item in data:
                if str(item.get("ID_MEETING")) == str(meeting_id):
                    for k, v in fields.items():
                        old_val = item.get(k)
                        if k == "NIVEL_URGENCIA" or k == "nivel_urgencia":
                            item["NIVEL_URGENCIA"] = normalize_urgency(v)
                            self._add_audit_event_unlocked(meeting_id, "update_metadata", "NIVEL_URGENCIA", old_val, item["NIVEL_URGENCIA"], author)
                        elif k == "RESPONSAVEL_REUNIAO" or k == "responsavel_reuniao":
                            item["RESPONSAVEL_REUNIAO"] = str(v).strip()
                            self._add_audit_event_unlocked(meeting_id, "update_metadata", "RESPONSAVEL_REUNIAO", old_val, item["RESPONSAVEL_REUNIAO"], author)
                        elif k == "NOME_SEGMENTO" or k == "nome_segmento":
                            item["NOME_SEGMENTO"] = normalize_client_code(v)
                            self._add_audit_event_unlocked(meeting_id, "update_metadata", "NOME_SEGMENTO", old_val, item["NOME_SEGMENTO"], author)
                        elif k == "STATUS_MEETING" or k == "status_meeting":
                            item["STATUS_MEETING"] = str(v).strip().upper()
                            self._add_audit_event_unlocked(meeting_id, "update_metadata", "STATUS_MEETING", old_val, item["STATUS_MEETING"], author)
                        elif k == "tema" and isinstance(item.get("RESUMO_IA"), dict):
                            item["RESUMO_IA"]["tema"] = str(v).strip()
                            self._add_audit_event_unlocked(meeting_id, "update_metadata", "tema", old_val, v, author)
                        else:
                            item[k] = v
                    updated = True
                    break
            if updated:
                _atomic_write_json(self.dataset_path, data)
            return updated

    def update_task_status(self, meeting_id: str, task_index: int, new_status: str, author: str = "user") -> bool:
        with self._lock:
            data = _read_json(self.dataset_path, [])
            updated = False
            for item in data:
                if str(item.get("ID_MEETING")) == str(meeting_id):
                    resumo = item.get("RESUMO_IA")
                    if isinstance(resumo, dict) and "tarefas" in resumo:
                        tarefas = resumo["tarefas"]
                        if 0 <= task_index < len(tarefas):
                            old_status = tarefas[task_index].get("status", "Não Inicializado")
                            tarefas[task_index]["status"] = new_status
                            self._add_audit_event_unlocked(meeting_id, "update_task_status", f"tarefas[{task_index}].status", old_status, new_status, author)
                            updated = True
                    break
            if updated:
                _atomic_write_json(self.dataset_path, data)
            return updated

    def update_suggestion(self, meeting_id: str, field_name: str, action: str, custom_value: Any = None, author: str = "user") -> Dict[str, Any]:
        """
        Confirma, edita ou rejeita uma sugestão de campo.
        Aplica o valor confirmado no registro oficial da reunião.
        """
        with self._lock:
            data = _read_json(self.dataset_path, [])
            result_info = {"status": "not_found"}
            for item in data:
                if str(item.get("ID_MEETING")) == str(meeting_id):
                    resumo = item.get("RESUMO_IA")
                    suggestions = item.get("field_suggestions")
                    if not suggestions and isinstance(resumo, dict):
                        suggestions = resumo.get("field_suggestions", {})
                    if not suggestions:
                        suggestions = {}
                        
                    if field_name in suggestions:
                        sug = suggestions[field_name]
                        old_status = sug.get("review_status", "pending")
                        old_conf = sug.get("confirmed_value")
                        
                        if action == "confirm":
                            sug["review_status"] = "confirmed"
                            sug["confirmed_value"] = sug.get("suggested_value")
                        elif action == "edit":
                            sug["review_status"] = "confirmed"
                            sug["confirmed_value"] = custom_value
                        elif action == "reject":
                            sug["review_status"] = "rejected"
                            sug["confirmed_value"] = None
                            
                        # Aplica valor no campo real da reunião se confirmado
                        if sug["review_status"] == "confirmed":
                            val = sug["confirmed_value"]
                            if field_name == "responsavel_reuniao":
                                item["RESPONSAVEL_REUNIAO"] = str(val).strip()
                            elif field_name == "nivel_urgencia":
                                item["NIVEL_URGENCIA"] = normalize_urgency(val)
                            elif field_name == "tema" and isinstance(resumo, dict):
                                resumo["tema"] = str(val).strip()

                        # Salva de volta
                        item["field_suggestions"] = suggestions
                        if isinstance(resumo, dict):
                            resumo["field_suggestions"] = suggestions
                            
                        self._add_audit_event_unlocked(
                            meeting_id, 
                            f"suggestion_{action}", 
                            field_name, 
                            {"status": old_status, "val": old_conf}, 
                            {"status": sug["review_status"], "val": sug.get("confirmed_value")}, 
                            author
                        )
                        result_info = {"status": "success", "field": field_name, "suggestion": sug}
                        break
            if result_info["status"] == "success":
                _atomic_write_json(self.dataset_path, data)
            return result_info

    def get_suggestions(self, meeting_id: str) -> Dict[str, Any]:
        with self._lock:
            meeting = self.get_by_id(meeting_id)
            if not meeting:
                return {}
            sug = meeting.get("field_suggestions")
            if not sug and isinstance(meeting.get("RESUMO_IA"), dict):
                sug = meeting["RESUMO_IA"].get("field_suggestions", {})
            return sug or {}

    def _add_audit_event_unlocked(self, meeting_id: str, action: str, field_name: str, old_val: Any, new_val: Any, author: str = "user"):
        event = {
            "id": uuid.uuid4().hex,
            "timestamp": datetime.now().isoformat(),
            "meeting_id": str(meeting_id),
            "action": action,
            "field_name": field_name,
            "old_value": old_val,
            "new_value": new_val,
            "author": author,
        }
        events = _read_json(AUDIT_LOG_PATH, [])
        events.insert(0, event)
        _atomic_write_json(AUDIT_LOG_PATH, events[:1000])

    def get_audit_events(self, meeting_id: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            events = _read_json(AUDIT_LOG_PATH, [])
            if meeting_id:
                return [e for e in events if str(e.get("meeting_id")) == str(meeting_id)]
            return events


# Repositórios auxiliares de Perfil e Integrações
class ProfileRepository:
    def __init__(self, path: str = PERFIS_PATH):
        self.path = path
        self._lock = threading.RLock()

    def get_profile(self, client_code: str) -> Dict[str, Any]:
        with self._lock:
            perfis = _read_json(self.path, {})
            norm_code = normalize_client_code(client_code)
            return perfis.get(norm_code, {"codigo": norm_code, "reunioes": [], "dores_recorrentes": {}})

    def register_meeting(self, client_code: str, meeting_id: str, date_str: str, tema: str, dores: list):
        if not client_code:
            return
        norm_code = normalize_client_code(client_code)
        with self._lock:
            perfis = _read_json(self.path, {})
            if norm_code not in perfis:
                perfis[norm_code] = {"codigo": norm_code, "reunioes": [], "dores_recorrentes": {}}

            # Atualiza lista de reuniões evitando duplicatas
            reunioes = [r for r in perfis[norm_code].get("reunioes", []) if str(r.get("meeting_id")) != str(meeting_id)]
            reunioes.insert(0, {"meeting_id": meeting_id, "data": date_str, "tema": tema})
            perfis[norm_code]["reunioes"] = reunioes[:30]

            # Contabiliza dores canônicas
            dores_rec = perfis[norm_code].setdefault("dores_recorrentes", {})
            for d in dores:
                if isinstance(d, dict):
                    cat = normalize_pain_category(d.get("categoria", "outro"))
                else:
                    cat = normalize_pain_category(str(d))
                dores_rec[cat] = dores_rec.get(cat, 0) + 1

            _atomic_write_json(self.path, perfis)


class IntegrationsRepository:
    def __init__(self, config_path: str = INTEGRACOES_CONFIG_PATH, log_path: str = INTEGRACOES_LOG_PATH):
        self.config_path = config_path
        self.log_path = log_path
        self._lock = threading.RLock()

    def get_config(self) -> Dict[str, Any]:
        with self._lock:
            return _read_json(self.config_path, {})

    def save_config(self, sistema: str, webhook_url: str):
        with self._lock:
            cfg = _read_json(self.config_path, {})
            cfg[sistema] = {"webhook_url": webhook_url}
            _atomic_write_json(self.config_path, cfg)

    def log_event(self, event_dict: Dict[str, Any]):
        with self._lock:
            logs = _read_json(self.log_path, [])
            logs.insert(0, event_dict)
            _atomic_write_json(self.log_path, logs[:300])

    def get_logs(self) -> List[Dict[str, Any]]:
        with self._lock:
            return _read_json(self.log_path, [])
