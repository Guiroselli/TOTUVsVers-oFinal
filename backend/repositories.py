import os
import json
import math
import uuid
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

from normalization import normalize_date_iso, normalize_client_code, normalize_urgency, normalize_pain_category, classify_client_identity

DATASET_PATH = os.path.join(os.path.dirname(__file__), "dataset_limpo.json")
PERFIS_PATH = os.path.join(os.path.dirname(__file__), "perfis_clientes.json")
INTEGRACOES_LOG_PATH = os.path.join(os.path.dirname(__file__), "integracoes_totvs.json")
INTEGRACOES_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config_integracoes.json")
AUDIT_LOG_PATH = os.path.join(os.path.dirname(__file__), "audit_events.json")
PDF_DIR = os.path.join(os.path.dirname(__file__), "pdfs")


def pdf_path_for(meeting_id: Any) -> str:
    """Caminho absoluto do PDF de uma reunião (independente do CWD)."""
    return os.path.join(PDF_DIR, f"{meeting_id}.pdf")


def has_pdf_on_disk(meeting_id: Any) -> bool:
    """Fonte da verdade: o PDF só existe se o arquivo existir em disco."""
    return os.path.isfile(pdf_path_for(meeting_id))


def _apply_pdf_state(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Reconcilia TEM_PDF com o disco na leitura.

    A pasta backend/pdfs/ está no .gitignore, então um colaborador que clona o
    repositório recebe o dataset com TEM_PDF=true mas sem nenhum arquivo. Sem
    esta reconciliação o frontend mostra "Ver PDF" e o StaticFiles devolve
    {"detail":"Not Found"}. Derivar do disco mantém o botão coerente para todos.
    """
    item["TEM_PDF"] = has_pdf_on_disk(item.get("ID_MEETING"))
    return item


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
                segment_filter: Optional[str] = None,
                format_filter: Optional[str] = None,
                status_filter: Optional[str] = None,
                only_unanalyzed: bool = False,
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
                    identity = classify_client_identity(item.get("NOME_SEGMENTO", ""))
                    if norm_client.lower() != identity["client_code"].lower():
                        continue

                # 3. Filtro de segmento independente
                if segment_filter:
                    identity = classify_client_identity(item.get("NOME_SEGMENTO", ""))
                    if segment_filter.lower() not in identity["segment"].lower() and segment_filter.lower() not in str(item.get("NOME_SEGMENTO", "")).lower():
                        continue

                # 4. Filtro de somente sem análise
                has_resumo = isinstance(item.get("RESUMO_IA"), dict) and bool(item.get("RESUMO_IA"))
                if only_unanalyzed and has_resumo:
                    continue

                # 5. Filtro de formato
                if format_filter:
                    item_fmt = (item.get("FORMATO_MEETING") or "").upper()
                    if format_filter.upper() not in item_fmt:
                        continue

                # 6. Filtro de status
                if status_filter:
                    item_status = (item.get("STATUS_MEETING") or "").upper()
                    if status_filter.upper() not in item_status:
                        continue

                # 7. Busca textual
                if search:
                    search_lower = search.lower()
                    transcript = str(item.get("ANON_TRANSCRICAO", "")).lower()
                    client_str = str(item.get("NOME_SEGMENTO", "")).lower()
                    resp_str = str(item.get("RESPONSAVEL_REUNIAO", "")).lower()
                    tema_str = ""
                    if isinstance(item.get("RESUMO_IA"), dict):
                        tema_str = str(item.get("RESUMO_IA", {}).get("tema", "")).lower()
                    
                    if (search_lower not in transcript and 
                        search_lower not in client_str and 
                        search_lower not in resp_str and 
                        search_lower not in tema_str):
                        continue

                filtered.append(_apply_pdf_state(item))

            return filtered

    def get_paginated(self, 
                      page: int = 1, 
                      page_size: int = 10,
                      start_date: Optional[str] = None, 
                      end_date: Optional[str] = None,
                      client_code: Optional[str] = None,
                      segment_filter: Optional[str] = None,
                      format_filter: Optional[str] = None,
                      status_filter: Optional[str] = None,
                      only_unanalyzed: bool = False,
                      search: Optional[str] = None) -> Tuple[List[Dict[str, Any]], int, int]:
        all_filtered = self.get_all(
            start_date=start_date,
            end_date=end_date,
            client_code=client_code,
            segment_filter=segment_filter,
            format_filter=format_filter,
            status_filter=status_filter,
            only_unanalyzed=only_unanalyzed,
            search=search
        )
        total = len(all_filtered)
        total_pages = max(1, math.ceil(total / page_size))
        
        # Garante página válida
        page = max(1, min(page, total_pages))
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        
        items = all_filtered[start_idx:end_idx]
        return items, total, total_pages

    def get_by_id(self, meeting_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            data = _read_json(self.dataset_path, [])
            for item in data:
                if str(item.get("ID_MEETING")) == str(meeting_id):
                    return _apply_pdf_state(item)
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
                    # Preserva status de recomendações já confirmadas ou rejeitadas pelo usuário
                    existing_recs = item.get("recomendacoes_totvs") or (item.get("RESUMO_IA") or {}).get("recomendacoes_totvs") or []
                    persisted_status_map = {r.get("product_key"): r for r in existing_recs if isinstance(r, dict)}
                    
                    new_recs = analysis_data.get("recomendacoes_totvs") or []
                    for nr in new_recs:
                        if isinstance(nr, dict):
                            pkey = nr.get("product_key")
                            if pkey in persisted_status_map:
                                old_r = persisted_status_map[pkey]
                                if old_r.get("review_status") in ["confirmed", "rejected"]:
                                    nr["review_status"] = old_r.get("review_status")
                                    nr["confirmed_by"] = old_r.get("confirmed_by")
                                    nr["confirmed_at"] = old_r.get("confirmed_at")
                                    nr["history"] = old_r.get("history", [])
                            if not nr.get("id"):
                                nr["id"] = f"rec_{uuid.uuid4().hex[:12]}"
                                nr["recommendation_id"] = nr["id"]
                                nr["created_at"] = datetime.now().isoformat()

                    item["RESUMO_IA"] = analysis_data
                    item["recomendacoes_totvs"] = new_recs
                    # Se vier sugestões, sincroniza no nível da reunião
                    if "field_suggestions" in analysis_data:
                        item["field_suggestions"] = analysis_data["field_suggestions"]
                    # Sincroniza status canônico de análise
                    meta = analysis_data.get("analise_metadados") or {}
                    canon_status = meta.get("analysis_status") or "analise_concluida"
                    item["STATUS_ANALISE"] = canon_status
                    item["STATUS_MEETING"] = canon_status
                    # Sincroniza urgência e responsável automaticamente a partir da análise da IA
                    if analysis_data.get("nivel_urgencia"):
                        item["NIVEL_URGENCIA"] = normalize_urgency(analysis_data["nivel_urgencia"])
                    if analysis_data.get("responsavel_reuniao") and (not item.get("RESPONSAVEL_REUNIAO") or item.get("RESPONSAVEL_REUNIAO") in ["Não identificado", "Não informado", "", None]):
                        item["RESPONSAVEL_REUNIAO"] = str(analysis_data["responsavel_reuniao"]).strip()
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

    def update_recommendation_status(self, meeting_id: str, product_key: str, action: str, author: str = "user") -> Dict[str, Any]:
        """
        Confirma ou rejeita uma recomendação de produto TOTVS para a reunião.
        """
        with self._lock:
            data = _read_json(self.dataset_path, [])
            result = {"status": "not_found"}
            for item in data:
                if str(item.get("ID_MEETING")) == str(meeting_id):
                    resumo = item.get("RESUMO_IA")
                    recs = item.get("recomendacoes_totvs")
                    if not recs and isinstance(resumo, dict):
                        recs = resumo.get("recomendacoes_totvs", [])
                    if not recs:
                        recs = []
                    
                    found = False
                    new_status = "confirmed" if action == "confirm" else "rejected"
                    now_iso = datetime.now().isoformat()
                    for r in recs:
                        if r.get("product_key") == product_key:
                            old_status = r.get("review_status", "pending")
                            r["review_status"] = new_status
                            if action == "confirm":
                                r["confirmed_by"] = author
                                r["confirmed_at"] = now_iso
                            if not r.get("id"):
                                r["id"] = f"rec_{uuid.uuid4().hex[:12]}"
                                r["recommendation_id"] = r["id"]
                            
                            history = r.setdefault("history", [])
                            history.append({
                                "action": action,
                                "timestamp": now_iso,
                                "author": author,
                                "from_status": old_status,
                                "to_status": new_status
                            })
                            found = True
                            self._add_audit_event_unlocked(
                                meeting_id,
                                f"recommendation_{action}",
                                f"recomendacoes_totvs[{product_key}]",
                                old_status,
                                new_status,
                                author
                            )
                            result = {"status": "success", "product_key": product_key, "review_status": new_status, "recommendation": r}
                            break
                            
                    if found:
                        item["recomendacoes_totvs"] = recs
                        if isinstance(resumo, dict):
                            resumo["recomendacoes_totvs"] = recs
                        break
            if result["status"] == "success":
                _atomic_write_json(self.dataset_path, data)
            return result

    def get_recommendations(
        self, 
        meeting_id: str, 
        integrations_config: Optional[Dict[str, Any]] = None,
        meeting_data: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        with self._lock:
            meeting = meeting_data if meeting_data is not None else self.get_by_id(meeting_id)
            if not meeting:
                return []
            resumo = meeting.get("RESUMO_IA")
            if not isinstance(resumo, dict):
                return []
            
            recs = meeting.get("recomendacoes_totvs") or resumo.get("recomendacoes_totvs")
            if recs:
                if integrations_config:
                    for r in recs:
                        pkey = r.get("product_key")
                        if pkey in integrations_config and integrations_config[pkey].get("webhook_url"):
                            r["integration_status"] = "real"
                        else:
                            r["integration_status"] = "simulated"
                return recs
            
            from totvs_catalog import compute_recommendations
            return compute_recommendations(
                dores=resumo.get("dores", []),
                tarefas=resumo.get("tarefas", []),
                tema=resumo.get("tema", ""),
                urgencia=resumo.get("nivel_urgencia", meeting.get("NIVEL_URGENCIA", "Média")),
                client_code=meeting.get("NOME_SEGMENTO", ""),
                integracoes_config=integrations_config
            )

    def find_duplicate_and_recurring_tasks(self, meetings_list: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        """
        Analisa todas as tarefas das reuniões e identifica tarefas duplicadas ou recorrentes.
        Não remove automaticamente; sugere agrupamento com pontuação de similaridade e histórico.
        """
        with self._lock:
            data = meetings_list if meetings_list is not None else _read_json(self.dataset_path, [])
            all_tasks = []
            for item in data:
                mid = str(item.get("ID_MEETING", ""))
                dt = str(item.get("DT_MEETING", ""))
                client = str(item.get("NOME_SEGMENTO", ""))
                resumo = item.get("RESUMO_IA")
                if isinstance(resumo, dict):
                    for idx, t in enumerate(resumo.get("tarefas", [])):
                        if isinstance(t, dict):
                            desc = str(t.get("tarefa", "")).strip()
                            if desc:
                                all_tasks.append({
                                    "meeting_id": mid,
                                    "meeting_date": dt,
                                    "client_code": client,
                                    "task_index": idx,
                                    "tarefa": desc,
                                    "responsavel": t.get("responsavel", "Não identificado"),
                                    "prazo": t.get("prazo", "Não mencionado"),
                                    "prazo_iso": t.get("prazo_iso"),
                                    "status": t.get("status", "Não Inicializado")
                                })

            # Agrupamento por similaridade
            grupos: List[Dict[str, Any]] = []
            processados = set()

            for i, t1 in enumerate(all_tasks):
                if i in processados:
                    continue
                grupo_itens = [t1]
                processados.add(i)

                for j, t2 in enumerate(all_tasks):
                    if j in processados:
                        continue
                    sim, motivo = self._similaridade_tarefas(t1["tarefa"], t2["tarefa"])
                    if sim >= 0.70:
                        grupo_itens.append(t2)
                        processados.add(j)

                if len(grupo_itens) > 1:
                    reunioes_origem = list(dict.fromkeys(item["meeting_id"] for item in grupo_itens))
                    datas_origem = sorted(list(dict.fromkeys(item["meeting_date"] for item in grupo_itens if item["meeting_date"])))
                    has_pending = any(item["status"] != "Concluído" for item in grupo_itens)
                    
                    grupos.append({
                        "id": f"group_{uuid.uuid4().hex[:8]}",
                        "tarefa_normalizada": grupo_itens[0]["tarefa"],
                        "total_ocorrencias": len(grupo_itens),
                        "reunioes_origem": reunioes_origem,
                        "primeira_ocorrencia": datas_origem[0] if datas_origem else None,
                        "ultima_ocorrencia": datas_origem[-1] if datas_origem else None,
                        "ocorrencias": grupo_itens,
                        "motivo_similaridade": f"Tarefa repetida em {len(reunioes_origem)} reunião(ões) distintas ({'com pendências ativas' if has_pending else 'todas concluídas'}).",
                        "is_duplicate": True,
                        "has_pending_actions": has_pending
                    })

            return grupos

    def _similaridade_tarefas(self, t1: str, t2: str) -> Tuple[float, str]:
        t1_clean = str(t1).strip().lower()
        t2_clean = str(t2).strip().lower()
        if t1_clean == t2_clean:
            return 1.0, "Texto idêntico"
        words1 = set(re.findall(r"\w{3,}", t1_clean))
        words2 = set(re.findall(r"\w{3,}", t2_clean))
        if not words1 or not words2:
            return 0.0, ""
        jaccard = len(words1 & words2) / len(words1 | words2)
        if jaccard >= 0.60:
            return jaccard, f"Similaridade léxica de {int(jaccard*100)}%"
        return jaccard, ""

    def log_audit_event(self, meeting_id: str, action: str, details: Any, author: str = "user"):
        with self._lock:
            self._add_audit_event_unlocked(meeting_id, action, "details", None, details, author)

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

    def get_audit_log(self, meeting_id: Optional[str] = None) -> List[Dict[str, Any]]:
        return self.get_audit_events(meeting_id)

    def reset_all_analyses(self) -> int:
        """
        Reseta todas as reuniões para o estado não analisado ('aguardando_analise'),
        limpando resumos de IA, PDFs associados, responsáveis e urgência para o padrão.
        """
        with self._lock:
            data = _read_json(self.dataset_path, [])
            count = 0
            for item in data:
                item["RESUMO_IA"] = None
                item["STATUS_MEETING"] = "aguardando_analise"
                item["STATUS_ANALISE"] = "aguardando_analise"
                item["STATUS_REVISAO"] = "revisao_pendente"
                item["TEM_PDF"] = False
                item["RESPONSAVEL_REUNIAO"] = ""
                item["NIVEL_URGENCIA"] = "Não Definido"
                item.pop("field_suggestions", None)
                item.pop("recomendacoes_totvs", None)
                item.pop("alertas", None)
                count += 1
            _atomic_write_json(self.dataset_path, data)
            self._add_audit_event_unlocked("ALL", "reset_all_analyses", "status", None, "aguardando_analise", "user")
            return count


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

    def delete_config(self, sistema: str):
        with self._lock:
            cfg = _read_json(self.config_path, {})
            if sistema in cfg:
                del cfg[sistema]
                _atomic_write_json(self.config_path, cfg)

    def log_event(self, event_dict: Dict[str, Any]):
        with self._lock:
            logs = _read_json(self.log_path, [])
            logs.insert(0, event_dict)
            _atomic_write_json(self.log_path, logs[:300])

    def get_logs(self) -> List[Dict[str, Any]]:
        with self._lock:
            return _read_json(self.log_path, [])

    def get_by_request_hash(self, request_hash: str) -> Optional[Dict[str, Any]]:
        """Busca recibo de integração por chave de idempotência."""
        with self._lock:
            logs = _read_json(self.log_path, [])
            for log in logs:
                if log.get("request_hash") == request_hash:
                    return log
            return None

    def record_idempotent_event(self, event_dict: Dict[str, Any]):
        """Registra ou atualiza evento idempotente."""
        with self._lock:
            logs = _read_json(self.log_path, [])
            req_hash = event_dict.get("request_hash")
            if req_hash:
                # Se já existia, atualiza no mesmo slot
                updated = False
                for i, l in enumerate(logs):
                    if l.get("request_hash") == req_hash:
                        logs[i] = event_dict
                        updated = True
                        break
                if not updated:
                    logs.insert(0, event_dict)
            else:
                logs.insert(0, event_dict)
            _atomic_write_json(self.log_path, logs[:500])


def sync_json_to_sqlite(json_path: str = DATASET_PATH, sqlite_path: str = "backend/proton_flow.db") -> Dict[str, Any]:
    """
    Migração e sincronização incremental e não destrutiva do JSON para SQLite.
    Cria tabelas com índices em: data, cliente, status, urgência, tema e produto recomendado.
    """
    import sqlite3
    
    os.makedirs(os.path.dirname(os.path.abspath(sqlite_path)), exist_ok=True)
    conn = sqlite3.connect(sqlite_path)
    cur = conn.cursor()

    # Criação do schema estruturado
    cur.execute("""
        CREATE TABLE IF NOT EXISTS meetings (
            id_meeting TEXT PRIMARY KEY,
            dt_meeting TEXT,
            client_code TEXT,
            status_meeting TEXT,
            nivel_urgencia TEXT,
            tema TEXT,
            responsavel TEXT,
            formato TEXT,
            raw_json TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS recommendations (
            id TEXT PRIMARY KEY,
            meeting_id TEXT,
            product_key TEXT,
            product_name TEXT,
            fit_score REAL,
            confidence REAL,
            review_status TEXT,
            confirmed_by TEXT,
            confirmed_at TEXT,
            FOREIGN KEY (meeting_id) REFERENCES meetings (id_meeting)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            meeting_id TEXT,
            tarefa TEXT,
            responsavel TEXT,
            prazo TEXT,
            prazo_iso TEXT,
            status TEXT,
            prioridade TEXT,
            FOREIGN KEY (meeting_id) REFERENCES meetings (id_meeting)
        )
    """)

    # Índices essenciais para consultas rápidas
    cur.execute("CREATE INDEX IF NOT EXISTS idx_meetings_dt ON meetings(dt_meeting)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_meetings_client ON meetings(client_code)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status_meeting)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_meetings_urgency ON meetings(nivel_urgencia)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_meetings_tema ON meetings(tema)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_recs_prod ON recommendations(product_key)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_recs_status ON recommendations(review_status)")

    meetings_data = _read_json(json_path, [])
    inserted_meetings = 0
    inserted_tasks = 0
    inserted_recs = 0

    for m in meetings_data:
        mid = str(m.get("ID_MEETING", ""))
        if not mid:
            continue
        dt = str(m.get("DT_MEETING", ""))
        client = str(m.get("NOME_SEGMENTO", ""))
        status = str(m.get("STATUS_MEETING", "COMPLETED"))
        urg = str(m.get("NIVEL_URGENCIA", ""))
        resp = str(m.get("RESPONSAVEL_REUNIAO", ""))
        formato = str(m.get("FORMATO_MEETING", "VIDEO"))
        resumo = m.get("RESUMO_IA") or {}
        tema = resumo.get("tema", "") if isinstance(resumo, dict) else ""

        cur.execute("""
            INSERT OR REPLACE INTO meetings (id_meeting, dt_meeting, client_code, status_meeting, nivel_urgencia, tema, responsavel, formato, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (mid, dt, client, status, urg, tema, resp, formato, json.dumps(m, ensure_ascii=False)))
        inserted_meetings += 1

        if isinstance(resumo, dict):
            # Tarefas
            for idx, t in enumerate(resumo.get("tarefas", [])):
                if isinstance(t, dict):
                    tid = f"{mid}_task_{idx}"
                    cur.execute("""
                        INSERT OR REPLACE INTO tasks (id, meeting_id, tarefa, responsavel, prazo, prazo_iso, status, prioridade)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (tid, mid, t.get("tarefa", ""), t.get("responsavel", ""), t.get("prazo", ""), t.get("prazo_iso"), t.get("status", "Não Inicializado"), t.get("prioridade", "Média")))
                    inserted_tasks += 1

            # Recomendações
            recs = m.get("recomendacoes_totvs") or resumo.get("recomendacoes_totvs") or []
            for r in recs:
                if isinstance(r, dict):
                    rid = r.get("id") or f"{mid}_{r.get('product_key', 'rec')}"
                    cur.execute("""
                        INSERT OR REPLACE INTO recommendations (id, meeting_id, product_key, product_name, fit_score, confidence, review_status, confirmed_by, confirmed_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (rid, mid, r.get("product_key", ""), r.get("product_name", ""), float(r.get("fit_score", 0.0)), float(r.get("confidence", 0.0)), r.get("review_status", "pending"), r.get("confirmed_by"), r.get("confirmed_at")))
                    inserted_recs += 1

    conn.commit()
    conn.close()
    return {
        "status": "success",
        "sqlite_path": sqlite_path,
        "meetings_synced": inserted_meetings,
        "tasks_synced": inserted_tasks,
        "recommendations_synced": inserted_recs
    }
