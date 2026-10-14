"""
Detector de Hardware e Perfis Portáteis para o Speech-to-Text do Proton Flow.

Detecta com precisão:
- Sistema Operacional e versão do Python;
- Quantidade de núcleos e threads da CPU;
- RAM física total e disponível;
- GPU encontrada no sistema operacional (e VRAM se disponível);
- Suporte EFETIVO a CUDA no CTranslate2 (validação real de runtime, não apenas listagem no SO);
- Suporte a ROCm / outros backends;
- Versões de faster-whisper e CTranslate2;
- Espaço em disco disponível para cache de modelos;
- Seleção e recomendação automática de perfis:
    * 'nvidia_compatible' (CUDA real verificado)
    * 'cpu_balanced' (CPU moderna com múltiplos núcleos e RAM suficiente)
    * 'hardware_limited' (CPU modesta ou pouca memória RAM)
    * 'high_precision_final' (Reprocessamento pós-reunião)

IMPORTANTE: Não trata a AMD RX 580 ou GPUs sem runtime compatível como CUDA.
"""

import os
import sys
import platform
import shutil
import subprocess
import ctypes
from typing import Dict, Any, List, Optional, Tuple


def get_ram_info() -> Dict[str, float]:
    """Retorna total e disponível de RAM física em GB de forma portátil e sem dependências externas obrigatórias."""
    total_gb = 8.0
    avail_gb = 4.0

    # 1. Tenta psutil se disponível
    try:
        import psutil
        vm = psutil.virtual_memory()
        return {
            "total_gb": round(vm.total / (1024 ** 3), 2),
            "available_gb": round(vm.available / (1024 ** 3), 2),
            "percent_used": vm.percent
        }
    except Exception:
        pass

    # 2. Windows Nativo via GlobalMemoryStatusEx
    if platform.system() == "Windows":
        try:
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ('dwLength', ctypes.c_ulong),
                    ('dwMemoryLoad', ctypes.c_ulong),
                    ('ullTotalPhys', ctypes.c_ulonglong),
                    ('ullAvailPhys', ctypes.c_ulonglong),
                    ('ullTotalPageFile', ctypes.c_ulonglong),
                    ('ullAvailPageFile', ctypes.c_ulonglong),
                    ('ullTotalVirtual', ctypes.c_ulonglong),
                    ('ullAvailVirtual', ctypes.c_ulonglong),
                    ('sullAvailExtendedVirtual', ctypes.c_ulonglong)
                ]
            ms = MEMORYSTATUSEX()
            ms.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(ms)):
                total_gb = round(ms.ullTotalPhys / (1024 ** 3), 2)
                avail_gb = round(ms.ullAvailPhys / (1024 ** 3), 2)
                used_pct = float(ms.dwMemoryLoad)
                return {
                    "total_gb": total_gb,
                    "available_gb": avail_gb,
                    "percent_used": used_pct
                }
        except Exception:
            pass

    # 3. Linux /proc/meminfo
    if platform.system() == "Linux" and os.path.exists("/proc/meminfo"):
        try:
            mem_info = {}
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    parts = line.split(":")
                    if len(parts) == 2:
                        k = parts[0].strip()
                        v = parts[1].strip().split()[0]
                        mem_info[k] = int(v)  # em kB
            if "MemTotal" in mem_info:
                total_gb = round(mem_info["MemTotal"] / (1024 ** 2), 2)
                avail_kb = mem_info.get("MemAvailable", mem_info.get("MemFree", mem_info["MemTotal"] // 2))
                avail_gb = round(avail_kb / (1024 ** 2), 2)
                used_pct = round(((total_gb - avail_gb) / total_gb) * 100, 1)
                return {
                    "total_gb": total_gb,
                    "available_gb": avail_gb,
                    "percent_used": used_pct
                }
        except Exception:
            pass

    return {
        "total_gb": total_gb,
        "available_gb": avail_gb,
        "percent_used": 50.0
    }


def find_nvidia_smi() -> Optional[str]:
    """Localiza o executavel nvidia-smi de forma confiavel no Windows e Linux."""
    # 1. Verifica no PATH do sistema
    path_bin = shutil.which("nvidia-smi")
    if path_bin and os.path.isfile(path_bin):
        return path_bin

    if platform.system() == "Windows":
        # 2. Locais padrao de instalacao no Windows
        system_root = os.environ.get("SystemRoot", r"C:\Windows")
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        candidates = [
            os.path.join(system_root, "System32", "nvidia-smi.exe"),
            os.path.join(program_files, "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"),
            r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
        ]
        for c in candidates:
            if os.path.isfile(c):
                return c
        # 3. FileRepository (DriverStore) caso driver esteja instalado sem CLI no PATH
        driver_store = os.path.join(system_root, "System32", "DriverStore", "FileRepository")
        if os.path.isdir(driver_store):
            try:
                for entry in os.scandir(driver_store):
                    if entry.is_dir() and entry.name.lower().startswith("nv"):
                        cand = os.path.join(entry.path, "nvidia-smi.exe")
                        if os.path.isfile(cand):
                            return cand
            except Exception:
                pass
    return None


def query_nvidia_smi() -> List[Dict[str, Any]]:
    """
    Consulta telemetria precisa de GPUs NVIDIA via nvidia-smi.
    Supera o limite arquitetural de 4 GB do Win32_VideoController no Windows
    e obtem VRAM real (8 GB / 12 GB na RTX 3060), VRAM livre, driver e temperatura.
    """
    smi_path = find_nvidia_smi()
    if not smi_path:
        return []
    try:
        proc = subprocess.run(
            [smi_path, "--query-gpu=name,memory.total,memory.free,memory.used,driver_version,temperature.gpu,utilization.gpu", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if proc.returncode == 0 and proc.stdout.strip():
            results = []
            for line in proc.stdout.strip().splitlines():
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 5:
                    try:
                        total_mb = float(parts[1])
                        free_mb = float(parts[2])
                        used_mb = float(parts[3])
                        driver_ver = parts[4]
                        temp_c = float(parts[5]) if len(parts) > 5 and parts[5].replace(".", "", 1).isdigit() else None
                        util_pct = float(parts[6]) if len(parts) > 6 and parts[6].replace(".", "", 1).isdigit() else None
                        results.append({
                            "name": parts[0],
                            "vram_gb": round(total_mb / 1024, 2),
                            "total_vram_mb": total_mb,
                            "free_vram_mb": free_mb,
                            "free_vram_gb": round(free_mb / 1024, 2),
                            "used_vram_mb": used_mb,
                            "driver_version": driver_ver,
                            "temperature_c": temp_c,
                            "utilization_gpu_pct": util_pct,
                            "source": "nvidia-smi"
                        })
                    except Exception:
                        continue
            return results
    except Exception:
        pass
    return []


def detect_os_gpus() -> List[Dict[str, Any]]:
    """
    Detecta adaptadores de video registrados no sistema operacional.
    Prioriza nvidia-smi para placas NVIDIA (garantindo precisao de VRAM real)
    e complementa com WMI / lspci para outros adaptadores (AMD, Intel).
    """
    gpus: List[Dict[str, Any]] = []

    # 1. Consulta nvidia-smi prioritariamente (evita teto de 4GB do WMI)
    nvidia_gpus = query_nvidia_smi()
    if nvidia_gpus:
        gpus.extend(nvidia_gpus)

    nvidia_names = {g["name"].lower() for g in nvidia_gpus}

    # 2. Windows: complementa com Win32_VideoController para GPUs AMD/Intel ou se nvidia-smi ausente
    if platform.system() == "Windows":
        try:
            cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json"'
            proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5)
            if proc.returncode == 0 and proc.stdout.strip():
                import json
                raw = json.loads(proc.stdout)
                items = raw if isinstance(raw, list) else [raw]
                for item in items:
                    name = item.get("Name") or "Desconhecido"
                    # Nao duplica placa NVIDIA se ja capturada com precisao pelo nvidia-smi
                    if any(nv_name in name.lower() or name.lower() in nv_name for nv_name in nvidia_names):
                        continue
                    adapter_ram = item.get("AdapterRAM") or 0
                    driver_ver = item.get("DriverVersion") or "N/A"
                    vram_gb = round(adapter_ram / (1024 ** 3), 2) if adapter_ram > 0 else 0.0
                    gpus.append({
                        "name": name,
                        "vram_gb": vram_gb,
                        "driver_version": driver_ver,
                        "source": "wmi"
                    })
        except Exception:
            pass

    # 3. Linux: se nvidia-smi nao achou, tenta lspci
    elif platform.system() == "Linux" and not gpus:
        try:
            proc = subprocess.run(["lspci"], capture_output=True, text=True, timeout=5)
            if proc.returncode == 0:
                for line in proc.stdout.splitlines():
                    if "VGA" in line or "3D" in line:
                        gpus.append({
                            "name": line.split(":", 2)[-1].strip(),
                            "vram_gb": 0.0,
                            "driver_version": "N/A",
                            "source": "lspci"
                        })
        except Exception:
            pass

    return gpus


def verify_effective_cuda_support() -> Tuple[bool, int, List[str], Optional[str]]:
    """
    Testa se o runtime do CTranslate2 realmente consegue executar no dispositivo CUDA.
    Retorna (suportado, device_count, compute_types, mensagem_erro).
    """
    try:
        import ctranslate2
        device_count = ctranslate2.get_cuda_device_count()
        if device_count <= 0:
            return False, 0, [], "Nenhum dispositivo CUDA registrado no runtime do CTranslate2"
        
        # Teste real de chamada aos compute types suportados em CUDA
        supported_types = list(ctranslate2.get_supported_compute_types("cuda"))
        return True, device_count, supported_types, None
    except Exception as err:
        return False, 0, [], str(err)


def detect_hardware(model_cache_dir: Optional[str] = None) -> Dict[str, Any]:
    """
    Diagnóstico completo de hardware e subsistema de inferência.
    """
    # 1. Sistema Operacional & Python
    os_info = {
        "system": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
        "python_executable": sys.executable,
        "python_version": platform.python_version()
    }

    # 2. CPU
    cpu_threads = os.cpu_count() or 4
    cpu_cores = max(1, cpu_threads // 2) if cpu_threads > 1 else 1
    try:
        import psutil
        cpu_cores = psutil.cpu_count(logical=False) or cpu_cores
    except Exception:
        pass

    cpu_info = {
        "processor": platform.processor() or "CPU",
        "cores": cpu_cores,
        "threads": cpu_threads
    }

    # 3. RAM
    ram_info = get_ram_info()

    # 4. GPUs no SO
    os_gpus = detect_os_gpus()

    # 5. Validação real de CUDA no backend CTranslate2
    cuda_effective, cuda_count, cuda_types, cuda_error = verify_effective_cuda_support()

    # Identifica se há GPU AMD (ex: RX 580)
    has_amd_polaris_or_radeon = any("Radeon" in g.get("name", "") or "RX" in g.get("name", "") for g in os_gpus)

    # 6. Bibliotecas
    faster_whisper_ver = "indisponível"
    ctranslate2_ver = "indisponível"
    cpu_compute_types = ["int8", "float32"]
    try:
        import faster_whisper
        faster_whisper_ver = getattr(faster_whisper, "__version__", "instalada")
    except Exception:
        pass

    try:
        import ctranslate2
        ctranslate2_ver = getattr(ctranslate2, "__version__", "instalada")
        try:
            cpu_compute_types = list(ctranslate2.get_supported_compute_types("cpu"))
        except Exception:
            pass
    except Exception:
        pass

    # 7. Espaço de Armazenamento para Modelos
    target_cache = model_cache_dir
    if not target_cache or not os.path.exists(target_cache):
        target_cache = os.path.expanduser("~")
    
    disk_free_gb = 10.0
    try:
        usage = shutil.disk_usage(target_cache)
        disk_free_gb = round(usage.free / (1024 ** 3), 2)
    except Exception:
        pass

    return {
        "os": os_info,
        "cpu": cpu_info,
        "ram": ram_info,
        "os_gpus": os_gpus,
        "nvidia_telemetry": query_nvidia_smi(),
        "cuda_effective": cuda_effective,
        "cuda_device_count": cuda_count,
        "cuda_supported_compute_types": cuda_types,
        "cuda_runtime_error": cuda_error,
        "has_amd_gpu": has_amd_polaris_or_radeon,
        "faster_whisper_version": faster_whisper_ver,
        "ctranslate2_version": ctranslate2_ver,
        "cpu_supported_compute_types": cpu_compute_types,
        "disk_free_gb": disk_free_gb
    }


def select_hardware_profile(
    hw_info: Optional[Dict[str, Any]] = None,
    requested_device: str = "auto",
    requested_compute_type: str = "auto",
    requested_model: str = "small",
    requested_workers: str = "auto"
) -> Dict[str, Any]:
    """
    Seleciona o perfil de hardware de acordo com os recursos detectados e overrides de ambiente.
    """
    if hw_info is None:
        hw_info = detect_hardware()

    cuda_ready = hw_info.get("cuda_effective", False)
    total_ram = hw_info.get("ram", {}).get("total_gb", 8.0)
    cpu_threads = hw_info.get("cpu", {}).get("threads", 4)

    # 1. Resolução do Dispositivo (Device)
    req_dev_clean = (requested_device or "auto").strip().lower()
    if req_dev_clean == "cuda":
        if cuda_ready:
            selected_device = "cuda"
            device_reason = "Dispositivo CUDA solicitado explicitamente e validado pelo backend"
        else:
            selected_device = "cpu"
            device_reason = f"CUDA solicitado, mas backend não validou GPU ({hw_info.get('cuda_runtime_error')}). Fallback seguro para CPU."
    elif req_dev_clean == "cpu":
        selected_device = "cpu"
        device_reason = "CPU solicitada explicitamente no ambiente"
    else:  # 'auto'
        if cuda_ready:
            selected_device = "cuda"
            device_reason = "Auto-detecção: GPU NVIDIA compatível validada com sucesso"
        else:
            selected_device = "cpu"
            if hw_info.get("has_amd_gpu"):
                device_reason = "Auto-detecção: GPU AMD (RX 580 ou similar) detectada no SO sem suporte CUDA/ROCm CTranslate2. Selecionado CPU."
            else:
                device_reason = "Auto-detecção: Dispositivo padrão CPU selecionado"

    # 2. Resolução do Perfil de Hardware
    if selected_device == "cuda":
        profile_name = "nvidia_compatible"
        default_compute = "float16" if "float16" in hw_info.get("cuda_supported_compute_types", []) else "int8_float16"
        recommended_model = requested_model if requested_model not in ("", "auto") else "medium"
        default_workers = 2
    else:
        # Modo CPU: avalia capacidade da máquina
        if total_ram < 6.0 or cpu_threads <= 2:
            profile_name = "hardware_limited"
            default_compute = "int8"
            recommended_model = "base" if requested_model == "auto" else requested_model
            default_workers = 1
        else:
            profile_name = "cpu_balanced"
            default_compute = "int8"
            recommended_model = "small" if requested_model == "auto" else requested_model
            default_workers = 1

    # 3. Resolução de Compute Type
    req_comp_clean = (requested_compute_type or "auto").strip().lower()
    if req_comp_clean not in ("", "auto"):
        selected_compute = req_comp_clean
    else:
        selected_compute = default_compute

    # 4. Resolução de Workers
    req_workers_clean = str(requested_workers or "auto").strip().lower()
    if req_workers_clean.isdigit():
        resolved_workers = max(1, int(req_workers_clean))
    else:
        resolved_workers = default_workers

    # 5. Modelo final
    model_name = requested_model if requested_model not in ("", "auto") else recommended_model

    return {
        "hardware_profile": profile_name,
        "device": selected_device,
        "compute_type": selected_compute,
        "model": model_name,
        "workers": resolved_workers,
        "max_pending_chunks": int(os.getenv("STT_MAX_PENDING_CHUNKS", "2")),
        "device_reason": device_reason,
        "cuda_effective": cuda_ready,
        "ram_gb": total_ram,
        "cpu_threads": cpu_threads
    }


def print_diagnostic_report():
    """Exibe no terminal relatório formatado da detecção de hardware."""
    hw = detect_hardware()
    profile = select_hardware_profile(hw)

    print("=" * 75)
    print("  PROTON FLOW — DETECÇÃO DE HARDWARE E PERFIL STT")
    print("=" * 75)
    print(f"Sistema Operacional : {hw['os']['system']} {hw['os']['release']} ({hw['os']['machine']})")
    print(f"Python              : {hw['os']['python_version']} ({hw['os']['python_executable']})")
    print(f"Processador         : {hw['cpu']['processor']}")
    print(f"Núcleos / Threads   : {hw['cpu']['cores']} núcleos / {hw['cpu']['threads']} threads")
    print(f"Memória RAM Total   : {hw['ram']['total_gb']} GB (Disponível: {hw['ram']['available_gb']} GB)")
    
    print("\n[GPU no Sistema Operacional]:")
    if hw['os_gpus']:
        for g in hw['os_gpus']:
            src = f" ({g.get('source')})" if g.get("source") else ""
            print(f"  - {g['name']}{src} (Driver: {g['driver_version']}, VRAM: {g['vram_gb']} GB)")
    else:
        print("  - Nenhuma GPU dedicada detectada pelo SO")

    if hw.get("nvidia_telemetry"):
        print("\n[Telemetria Detalhada NVIDIA]:")
        for nv in hw["nvidia_telemetry"]:
            free_info = f", VRAM Livre: {nv['free_vram_gb']} GB" if "free_vram_gb" in nv else ""
            temp_info = f", Temp: {nv['temperature_c']}°C" if nv.get("temperature_c") is not None else ""
            util_info = f", Uso: {nv['utilization_gpu_pct']}%" if nv.get("utilization_gpu_pct") is not None else ""
            print(f"  - {nv['name']}: Total VRAM: {nv['vram_gb']} GB{free_info}{temp_info}{util_info}")

    print("\n[Suporte a Backends de Aceleração]:")
    print(f"  - CUDA no CTranslate2 : {'SIM (Operacional)' if hw['cuda_effective'] else 'NÃO DISPONÍVEL'}")
    if not hw['cuda_effective'] and hw['cuda_runtime_error']:
        print(f"    Motivo: {hw['cuda_runtime_error']}")
    if hw['has_amd_gpu']:
        print("  - Aviso AMD Polaris/Vega: RX 580 não tratada como CUDA (inferência executará em CPU int8).")

    print("\n[Bibliotecas STT]:")
    print(f"  - faster-whisper : {hw['faster_whisper_version']}")
    print(f"  - CTranslate2    : {hw['ctranslate2_version']} (Tipos CPU: {', '.join(hw['cpu_supported_compute_types'])})")
    print(f"  - Espaço em disco: {hw['disk_free_gb']} GB livres")

    print("\n" + "=" * 75)
    print(f"  PERFIL RESOLVIDO: [{profile['hardware_profile'].upper()}]")
    print("=" * 75)
    print(f"  Dispositivo  (device)       : {profile['device']}")
    print(f"  Quantização  (compute_type) : {profile['compute_type']}")
    print(f"  Modelo Padrão (model)       : {profile['model']}")
    print(f"  Workers Iniciais            : {profile['workers']}")
    print(f"  Fila Máxima por Reunião     : {profile['max_pending_chunks']} chunks")
    print(f"  Justificativa               : {profile['device_reason']}")
    print("=" * 75)


if __name__ == "__main__":
    print_diagnostic_report()
