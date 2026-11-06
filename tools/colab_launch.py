"""One-cell Colab launcher for the current Noble AI master (or pinned commit).

Installs the full Noble React/FastAPI app, a usable Ollama narrator and, when
selected and GPU is available, a ComfyUI image provider with an SD1.5 demo
checkpoint. Services stay on 127.0.0.1; Colab's session-authenticated kernel
proxy is the only browser path. Does NOT create a public Cloudflare tunnel.

Notebook: notebooks/noble_ai_colab_play.ipynb.
The launcher is versioned alongside the project and contains all installer
logic, so opening the notebook later uses the launcher from the selected ref.
"""
from __future__ import annotations

import argparse
import atexit
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from urllib import request
import urllib.error

GITHUB = "https://github.com/Mairon31/novel_ai.git"
COMFY_REPO = "https://github.com/Comfy-Org/ComfyUI.git"
OLLAMA_INSTALL_URL = "https://ollama.com/install.sh"
COMFY_HF_REPO = "Comfy-Org/stable-diffusion-1.5"
COMFY_HF_FILE = "v1-5-pruned-emaonly-fp16.safetensors"
COMFY_SHA256 = "e9476a13728cd75d8279f6ec8bad753a66a1957ca375a1464dc63b37db6e3916"
BASE = Path("/content/noble-ai-colab")
APP_DIR = BASE / "app"
DATA_DIR = BASE / "data"
LOG_DIR = BASE / "logs"
COMFY_DIR = BASE / "ComfyUI"
NOBLE_PORT = 8000
OLLAMA_PORT = 11434
COMFY_PORT = 8188

MODEL_OPTIONS = ("auto", "qwen3:4b-instruct", "qwen3:1.7b",
                 "qwen3.5:4b", "qwen3.5:2b")


def say(stage: str, message: str) -> None:
    print("[" + time.strftime("%H:%M:%S") + "] " + stage + " · " +
          message, flush=True)


def valid_revision(value: str) -> str:
    if not isinstance(value, str) or not (
            value == "master" or re.fullmatch(r"[a-f0-9]{40}", value)):
        raise ValueError("Usa master o SHA completo (40 caracteres) del repositorio")
    return value


def valid_model_tag(profile: str) -> str:
    """Accept future Ollama model tags without allowing URL, shell or path syntax."""
    if profile == "auto":
        return profile
    if (not isinstance(profile, str) or len(profile) > 180 or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9_.-]*"
            r"(?:/[A-Za-z0-9][A-Za-z0-9_.-]*){0,2}"
            r"(?::[A-Za-z0-9][A-Za-z0-9_.-]*)?", profile)):
        raise ValueError("Modelo Ollama inválido; usa un tag como qwen3:4b-instruct")
    return profile


def model_for_vram(profile: str, vram_mb: int | None) -> str:
    valid_model_tag(profile)
    if profile != "auto":
        return profile
    return "qwen3:4b-instruct" if vram_mb is not None and vram_mb >= 11000 \
        else "qwen3:1.7b"


def github_fetch_commands(revision: str, destination: Path) -> list[list[str]]:
    valid_revision(revision)
    if not destination.is_dir():
        return [["git", "clone", "--depth", "1", "--no-single-branch",
                 GITHUB, str(destination)],
                ["git", "-C", str(destination), "fetch", "--depth", "1",
                 "origin", revision],
                ["git", "-C", str(destination), "checkout", "--detach", "-f",
                 "FETCH_HEAD"]]
    if not (destination / ".git").exists():
        raise ValueError("La carpeta de aplicación no es un clon Git válido")
    return [["git", "-C", str(destination), "fetch", "--depth", "1",
             "origin", revision],
            ["git", "-C", str(destination), "checkout", "--detach", "-f",
             "FETCH_HEAD"]]


def git_revision(root: Path) -> str:
    return subprocess.check_output(
        ["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()


def node_version(text: str) -> tuple[int, int]:
    match = re.search(r"v?(\d+)\.(\d+)\.", text)
    return (int(match.group(1)), int(match.group(2))) if match else (0, 0)


def node_adequate(text: str) -> bool:
    major, minor = node_version(text)
    return (major > 22 or major == 22 and minor >= 12 or
            major == 20 and minor >= 19)


def shell(cmd: list[str], *, cwd: Path | None = None,
          env: dict | None = None, log_name: str = "installer",
          timeout: int = 3600, reporter=say) -> None:
    """Stream real subprocess output to Colab and a per-stage logfile."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    reporter("INSTALAR", "Ejecutando: " + " ".join(cmd[:3]) + " …")
    logfile = LOG_DIR / (log_name + ".log")
    with logfile.open("a", encoding="utf-8") as log:
        proc = subprocess.Popen(cmd, cwd=cwd, env=env,
                                stdout=log, stderr=subprocess.STDOUT,
                                stdin=subprocess.DEVNULL)
        started = time.monotonic()
        last_heartbeat = started
        offset = logfile.stat().st_size
        try:
            while proc.poll() is None:
                time.sleep(1)
                now = time.monotonic()
                # Keep reporting progress even when downloads are silent.
                with logfile.open("rb") as stream:
                    stream.seek(offset)
                    new = stream.read(100_000)
                    offset = stream.tell()
                if new:
                    output = new.decode("utf-8", errors="replace")
                    for line in output.splitlines()[-12:]:
                        if line.strip():
                            print("  " + line.strip()[-300:], flush=True)
                    last_heartbeat = now
                elif now - last_heartbeat >= 20:
                    reporter("ESTADO", log_name + " sigue activo; " +
                             str(int(now-started)) + " s · " + str(logfile))
                    last_heartbeat = now
                if now - started > timeout:
                    raise TimeoutError(
                        "Instalación excedió el tiempo máximo: " + log_name)
            code = proc.returncode
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        if code:
            raise RuntimeError(log_name + " falló con código " + str(code) +
                               "; revisa " + str(logfile))


def json_request(url: str, body: dict | None = None,
                 timeout: int = 8, method: str | None = None) -> dict:
    payload = json.dumps(body).encode() if body is not None else None
    req = request.Request(url, data=payload,
                          headers={"Content-Type": "application/json"}
                          if payload else {},
                          method=method or ("PUT" if payload is not None else "GET"))
    with request.urlopen(req, timeout=timeout) as response:
        data = json.load(response)
    if not isinstance(data, dict):
        raise ValueError("Respuesta JSON inesperada desde " + url)
    return data


def ready(url: str, check=None) -> bool:
    try:
        data = json_request(url, timeout=2)
        return check(data) if check else True
    except (OSError, ValueError, urllib.error.URLError):
        return False


def wait_ready(url: str, check=None, timeout: int = 90,
               process: subprocess.Popen | None = None) -> None:
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        if process is not None and process.poll() is not None:
            raise RuntimeError("El servicio terminó antes de iniciar: " + url)
        if ready(url, check):
            return
        time.sleep(2)
    raise TimeoutError("No respondió el servicio local: " + url)


def spawn(label: str, cmd: list[str], *, cwd: Path | None = None,
          env: dict | None = None) -> subprocess.Popen:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logfile = (LOG_DIR / (label + ".log")).open("a", buffering=1)
    try:
        proc = subprocess.Popen(cmd, cwd=cwd, env=env,
                                stdin=subprocess.DEVNULL, stdout=logfile,
                                stderr=subprocess.STDOUT, start_new_session=True)
    finally:
        logfile.close()
    say("SERVICIO", label + " iniciado. PID " + str(proc.pid) +
        " · logs/" + label + ".log")
    return proc


def gpu_info() -> tuple[str | None, int | None]:
    if shutil.which("nvidia-smi") is None:
        return None, None
    try:
        out = subprocess.check_output([
            "nvidia-smi", "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits"], text=True, timeout=8)
        line = out.splitlines()[0]
        name, size = line.rsplit(",", 1)
        return name.strip(), int(size.strip())
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        return None, None


def ensure_git(revision: str) -> str:
    BASE.mkdir(parents=True, exist_ok=True)
    say("FUENTE", "Obteniendo Noble AI " + revision)
    for command in github_fetch_commands(revision, APP_DIR):
        shell(command, log_name="git")
    sha = git_revision(APP_DIR)
    say("VERSIÓN", sha)
    return sha


def ensure_node() -> None:
    try:
        current = subprocess.check_output(["node", "--version"],
                                          text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        current = ""
    if node_adequate(current):
        say("NODE", current + " compatible con Vite.")
        return
    say("NODE", "Instalando Node.js 22 para la interfaz React.")
    # Official NodeSource packaging; no dependency on the Colab base image.
    setup = BASE / "nodesource_setup.sh"
    with request.urlopen("https://deb.nodesource.com/setup_22.x",
                         timeout=30) as response:
        setup.write_bytes(response.read(1_000_001))
    if setup.stat().st_size > 1_000_000:
        raise ValueError("Script NodeSource inesperadamente grande")
    shell(["bash", str(setup)], log_name="nodesource")
    shell(["apt-get", "install", "-y", "nodejs"], log_name="node")
    actual = subprocess.check_output(["node", "--version"],
                                     text=True).strip()
    if not node_adequate(actual):
        raise RuntimeError("Node.js instalado no satisface Vite: " + actual)


def ensure_app() -> None:
    say("API", "Instalando dependencias de la revisión actual.")
    shell([sys.executable, "-m", "pip", "install", "-r",
           str(APP_DIR / "apps/api/requirements.txt")],
          log_name="python-deps")
    ensure_node()
    web = APP_DIR / "apps/web"
    if (web / "package-lock.json").exists():
        shell(["npm", "ci", "--no-audit", "--no-fund"],
              cwd=web, log_name="npm-ci")
    else:
        shell(["npm", "install", "--no-audit", "--no-fund"],
              cwd=web, log_name="npm-install")
    shell(["npm", "run", "build"], cwd=web, log_name="vite-build")
    if not (web / "dist/index.html").is_file():
        raise RuntimeError("La compilación no creó apps/web/dist/index.html")
    say("WEB", "React compilado; API y UI usarán el mismo origen.")


def ensure_ollama(data_root: Path, requested: str,
                  vram_mb: int | None) -> str | None:
    model = model_for_vram(requested, vram_mb)
    if not shutil.which("ollama"):
        say("OLLAMA", "Instalando el runtime desde el instalador oficial.")
        # Current official Linux archives prefer zstd; a fresh Colab image may
        # not ship the decompressor and the upstream installer then exits.
        if not shutil.which("zstd"):
            shell(["apt-get", "update", "-qq"], log_name="ollama-apt-update",
                  timeout=420)
            shell(["apt-get", "install", "-y", "zstd"],
                  log_name="ollama-zstd", timeout=420)
        script = BASE / "ollama-install.sh"
        with request.urlopen(OLLAMA_INSTALL_URL, timeout=30) as response:
            script.write_bytes(response.read(90_000))
        if script.stat().st_size >= 90_000:
            raise ValueError("Instalador de Ollama inesperadamente grande")
        shell(["sh", str(script)], log_name="ollama-install")
    endpoint = "http://127.0.0.1:11434/api/tags"
    if not ready(endpoint, lambda d: isinstance(d.get("models"), list)):
        env = dict(os.environ)
        env["OLLAMA_HOST"] = "127.0.0.1:11434"
        env["OLLAMA_MODELS"] = str(data_root / "ollama-models")
        env["OLLAMA_KEEP_ALIVE"] = "20m"
        proc = spawn("ollama", ["ollama", "serve"], env=env)
        wait_ready(endpoint, lambda d: isinstance(d.get("models"), list),
                   timeout=120, process=proc)
    tags = json_request(endpoint).get("models", [])
    known = {entry.get("name") for entry in tags if isinstance(entry, dict)}
    if model not in known:
        say("MODELO", "Descargando " + model + " (primera ejecución).")
        try:
            shell(["ollama", "pull", model], log_name="ollama-pull",
                  timeout=3600)
        except (RuntimeError, TimeoutError):
            if requested != "auto" or model == "qwen3:1.7b":
                raise
            model = "qwen3:1.7b"
            say("MODELO", "Probando alternativa más pequeña: " + model)
            shell(["ollama", "pull", model], log_name="ollama-pull-fallback",
                  timeout=3600)
    tags = json_request(endpoint).get("models", [])
    if model not in {x.get("name") for x in tags if isinstance(x, dict)}:
        raise RuntimeError("Ollama no anunció el modelo recién descargado")
    return model


def configure_narrative(model: str) -> None:
    root = "http://127.0.0.1:8000"
    config = json_request(root + "/api/v1/narrative/config")
    existing = config.get("model")
    if existing and config.get("provider") != "ollama":
        say("NARRADOR", "Se conserva el proveedor configurado previamente.")
        return
    models = json_request(root + "/api/v1/narrative/models")
    if existing and existing in models.get("models", []):
        say("NARRADOR", "Se conserva el modelo ya configurado: " + existing)
        return
    config.update({"provider": "ollama", "base_url": "http://127.0.0.1:11434",
                   "model": model, "reasoning_mode": "off"})
    result = json_request(root + "/api/v1/narrative/config", config)
    if result.get("model") != model:
        raise RuntimeError("Noble AI no confirmó el modelo narrativo")
    say("NARRADOR", "Configurado: " + model)


def ensure_demo_story() -> str | None:
    """Provide one immediately playable example only in a new, empty library."""
    base = "http://127.0.0.1:8000"
    stories = json_request(base + "/api/v1/stories").get("stories")
    if not isinstance(stories, list):
        raise ValueError("La biblioteca no devolvió una lista de historias")
    if stories:
        say("BIBLIOTECA", "Se conservan " + str(len(stories)) +
            " historias existentes; no se añade una demo.")
        return None
    story = json_request(base + "/api/v1/stories", method="POST", body={
        "title": "La estación de la última luna",
        "premise": (
            "En una ciudad costera, una estación de tren abandonada vuelve a "
            "encender sus luces cada medianoche. Los pasajeros recuerdan "
            "fragmentos de futuros que todavía no han ocurrido. Una joven "
            "llamada Mara busca a su hermano desaparecido, mientras el "
            "protagonista recibe un boleto con su propio nombre y una fecha "
            "que nadie conoce. El jugador decide qué investiga, a quién "
            "confía sus secretos y si sube al tren. Los personajes toman "
            "decisiones propias sin controlar al protagonista."),
        "protagonist_name": "Alex",
    })
    ident = story.get("id")
    if not isinstance(ident, str):
        raise ValueError("Noble no devolvió el UUID de la historia de demostración")
    say("BIBLIOTECA", "Creé una historia inicial opcional para probar el lector.")
    return ident


def verify_narrator() -> bool:
    """Real 24-token warm-up without persisting or generating any story turn."""
    root = "http://127.0.0.1:8000"
    config = json_request(root + "/api/v1/narrative/config")
    if config.get("provider") != "ollama" or not config.get("model"):
        return False
    say("INFERENCIA", "Probando realmente el modelo de Ollama (sin guardar turnos).")
    try:
        warmed = json_request(root + "/api/v1/narrative/prepare",
                              method="POST", body={}, timeout=200)
        if warmed.get("ready") is not True:
            raise ValueError("La inferencia no confirmó contenido")
        say("INFERENCIA", "Respuesta real verificada · " +
            str(warmed.get("duration_ms")) + " ms.")
        return True
    except (OSError, ValueError, urllib.error.URLError) as exc:
        say("INFERENCIA", "No se pudo verificar la generación: " +
            type(exc).__name__ + ". Se mantiene la aplicación disponible.")
        return False


def checksum_file(path: Path) -> str:
    dig = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            dig.update(block)
    return dig.hexdigest()


def ensure_comfy() -> str:
    if not (COMFY_DIR / ".git").is_dir():
        say("IMÁGENES", "Clonando ComfyUI desde el repositorio oficial.")
        shell(["git", "clone", "--depth", "1", COMFY_REPO,
               str(COMFY_DIR)], log_name="comfy-git")
    say("IMÁGENES", "Instalando dependencias de ComfyUI.")
    shell([sys.executable, "-m", "pip", "install", "-r",
           str(COMFY_DIR / "requirements.txt")], log_name="comfy-deps")
    shell([sys.executable, "-m", "pip", "install", "huggingface_hub", "hf_xet"],
          log_name="hf-deps")
    checkpoint_dir = COMFY_DIR / "models/checkpoints"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    target = checkpoint_dir / COMFY_HF_FILE
    if not target.is_file() or checksum_file(target) != COMFY_SHA256:
        say("IMÁGENES", "Descargando checkpoint SD1.5 FP16 de ~2.1 GB.")
        from huggingface_hub import hf_hub_download
        downloaded = Path(hf_hub_download(
            repo_id=COMFY_HF_REPO, filename=COMFY_HF_FILE,
            revision="main", local_dir=str(checkpoint_dir)))
        if checksum_file(downloaded) != COMFY_SHA256:
            downloaded.unlink(missing_ok=True)
            raise RuntimeError("El checkpoint no coincide con su SHA256 publicado")
    endpoint = "http://127.0.0.1:8188/models/checkpoints"
    def checkpoint_ready() -> bool:
        try:
            with request.urlopen(endpoint, timeout=5) as response:
                models = json.load(response)
            return isinstance(models, list) and COMFY_HF_FILE in models
        except (OSError, ValueError):
            return False
    if not checkpoint_ready():
        proc = spawn("comfyui", [
            sys.executable, "main.py", "--listen", "127.0.0.1",
            "--port", "8188", "--disable-auto-launch",
        ], cwd=COMFY_DIR)
        start = time.monotonic()
        while time.monotonic() - start < 180:
            if proc.poll() is not None:
                raise RuntimeError("ComfyUI terminó; revisa logs/comfyui.log")
            if checkpoint_ready():
                break
            time.sleep(3)
        else:
            raise TimeoutError("ComfyUI no anunció los checkpoints a tiempo")
    current = json_request("http://127.0.0.1:8000/api/v1/images/config")
    if not current.get("checkpoint"):
        current.update({
            "provider": "comfyui", "base_url": "http://127.0.0.1:8188",
            "checkpoint": COMFY_HF_FILE,
            "width": 512, "height": 512, "steps": 18, "cfg": 7.0,
        })
        result = json_request(
            "http://127.0.0.1:8000/api/v1/images/config", current)
        if result.get("checkpoint") != COMFY_HF_FILE:
            raise RuntimeError("No se pudo guardar el checkpoint")
    say("IMÁGENES", "ComfyUI listo; checkpoint: " + COMFY_HF_FILE)
    return COMFY_HF_FILE


def clone_data_from_drive(local: Path, cloud: Path) -> None:
    if (local / "noble.sqlite").exists():
        say("DRIVE", "Conservo los datos locales de esta sesión.")
        return
    saved = cloud / "data"
    if saved.is_dir():
        shutil.copytree(saved, local, dirs_exist_ok=True)
        say("DRIVE", "Historias y archivos restaurados al disco local.")


def backup_data_to_drive(local: Path, cloud: Path) -> None:
    """Online SQLite backup + media copy. Not a global filesystem transaction."""
    saved = cloud / "data"
    saved.mkdir(parents=True, exist_ok=True)
    for source in local.rglob("*"):
        if not source.is_file() or source.is_symlink():
            continue
        if any(p in ("__pycache__",) for p in source.relative_to(local).parts):
            continue
        if source.suffix in (".sqlite", ".db") or source.name.endswith(
                (".sqlite-wal", ".sqlite-shm", ".db-wal", ".db-shm")):
            continue
        relative = source.relative_to(local)
        dest = saved / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists() or (source.stat().st_size != dest.stat().st_size
                                  or source.stat().st_mtime > dest.stat().st_mtime):
            shutil.copy2(source, dest)
    for sqlite_path in local.glob("*.sqlite"):
        target = saved / sqlite_path.name
        temporary = saved / (sqlite_path.name + ".pending")
        try:
            with sqlite3.connect(sqlite_path) as source:
                with sqlite3.connect(temporary) as dest:
                    source.backup(dest)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)


def activate_drive(local: Path, *, interval_minutes: int = 10,
                   cloud_root: Path = Path("/content/drive/MyDrive/NobleAI-Colab")):
    from google.colab import drive
    drive.mount("/content/drive", force_remount=False)
    clone_data_from_drive(local, cloud_root)
    flag = threading.Event()

    def sync_loop() -> None:
        while not flag.wait(interval_minutes * 60):
            try:
                backup_data_to_drive(local, cloud_root)
                say("DRIVE", "Copia periódica de datos completada.")
            except (OSError, sqlite3.Error) as exc:
                say("DRIVE", "No se pudo respaldar: " + type(exc).__name__)
    thread = threading.Thread(target=sync_loop, daemon=True, name="noble-drive-backup")
    thread.start()
    atexit.register(lambda: (flag.set(), backup_data_to_drive(local, cloud_root)))
    say("DRIVE", "Respaldo periódico activado; no guarda modelos pesados.")
    return flag


def display_colab_ui(port: int = NOBLE_PORT) -> None:
    try:
        from google.colab import output
        from IPython.display import HTML, display
        from html import escape
    except ImportError:
        say("ACCESO", "Abre este notebook en Google Colab para acceder a la UI.")
        return
    try:
        # A top-level link uses the notebook-authenticated kernel proxy and
        # can work when third-party cookies block embedded frames.
        url = output.eval_js("google.colab.kernel.proxyPort(" + str(port) + ")")
        if not isinstance(url, str) or not url.startswith("https://"):
            raise ValueError("Colab no devolvió una URL de proxy")
        display(HTML(
            '<p style="font-size:1.15rem"><a target="_blank" rel="noopener" href="' +
            escape(url, quote=True) +
            '">Abrir Noble AI en una pestaña</a></p>'
            '<p>También puedes usar la aplicación dentro del notebook:</p>'))
    except Exception as exc:
        say("ACCESO", "Enlace en pestaña no disponible: " +
            type(exc).__name__ + ". Intentando vista incrustada.")
    # The iframe is independent: an unavailable top-level proxy link must
    # not prevent using the application inside the same Colab notebook.
    try:
        output.serve_kernel_port_as_iframe(port, height="840px")
        say("ACCESO", "Vista del lector disponible mientras Colab esté conectado.")
    except Exception as exc:
        say("ACCESO", "No se pudo abrir el iframe: " + type(exc).__name__)
        say("ACCESO", "Revisa los permisos de cookies de Colab y vuelve a abrir el notebook.")


def launch(args) -> dict:
    valid_revision(args.revision)
    valid_model_tag(args.model)
    if args.images not in ("auto", "on", "off"):
        raise ValueError("Perfil de imágenes inválido")
    BASE.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    sha = ensure_git(args.revision)
    if args.drive_backup:
        activate_drive(DATA_DIR)
    ensure_app()
    gpu, vram = gpu_info()
    say("HARDWARE", (gpu + " (" + str(vram) + " MiB)" if gpu else
                     "Sin GPU NVIDIA detectada; se usará CPU para narración"))
    # Import FastAPI only after the frontend build exists. The same-origin
    # static mount is registered at module import time.
    env = dict(os.environ)
    env["NOBLE_DATA_DIR"] = str(DATA_DIR)
    health = "http://127.0.0.1:8000/api/v1/health"
    if not ready(health, lambda d: d.get("model_hub") == "available"):
        proc = spawn("noble-api", [
            sys.executable, "-m", "uvicorn", "noble_api.main:app",
            "--app-dir", str(APP_DIR / "apps/api"),
            "--host", "127.0.0.1", "--port", str(NOBLE_PORT),
        ], cwd=APP_DIR, env=env)
        wait_ready(health, lambda d: d.get("model_hub") == "available",
                   process=proc, timeout=120)
    say("API", "Servicio FastAPI y frontend React disponibles.")
    model = None
    try:
        model = ensure_ollama(BASE, args.model, vram)
        configure_narrative(model)
    except (RuntimeError, TimeoutError, OSError, ValueError,
            urllib.error.URLError) as exc:
        say("NARRADOR", "No se pudo configurar Ollama: " + str(exc)[:250])
        say("NARRADOR", "La interfaz sigue accesible; revisa logs/ollama*.log")
    image_checkpoint = None
    if args.images == "on" or args.images == "auto" and vram is not None:
        try:
            image_checkpoint = ensure_comfy()
        except (RuntimeError, TimeoutError, OSError, ValueError,
                urllib.error.URLError, ImportError) as exc:
            say("IMÁGENES", "Instalación opcional no completada: " + str(exc)[:220])
            say("IMÁGENES", "El lector y el narrador siguen disponibles.")
    else:
        say("IMÁGENES", "ComfyUI desactivado para esta sesión.")
    state = {
        "source_revision": sha, "model": model,
        "image_checkpoint": image_checkpoint,
        "data_dir": str(DATA_DIR), "logs_dir": str(LOG_DIR),
        "gpu_name": gpu, "gpu_total_mb": vram,
        "backend": "http://127.0.0.1:8000",
        "browser_access": "colab_kernel_proxy",
    }
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    (LOG_DIR / "launch_state.json").write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        ensure_demo_story()
    except (OSError, ValueError, urllib.error.URLError) as exc:
        say("BIBLIOTECA", "No se pudo preparar la historia inicial: " +
            type(exc).__name__)
    infer_ready = verify_narrator() if model else False
    state["narrator_smoke_ok"] = infer_ready
    (LOG_DIR / "launch_state.json").write_text(
        json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.drive_backup:
        try:
            backup_data_to_drive(DATA_DIR,
                                 Path("/content/drive/MyDrive/NobleAI-Colab"))
        except (OSError, sqlite3.Error) as exc:
            say("DRIVE", "Respaldo inicial pendiente: " + type(exc).__name__)
    say("LISTO", "Noble AI commit " + sha[:10])
    say("LISTO", "Narración: " + (model or "requiere configuración"))
    say("LISTO", "Imágenes: " + (image_checkpoint or "sin checkpoint autoinstalado"))
    display_colab_ui()
    return state


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Noble AI · todo en uno Google Colab")
    parser.add_argument("--revision", default="master")
    parser.add_argument("--model", default="auto",
                        help="auto o cualquier tag de Ollama válido")
    parser.add_argument("--images", choices=("auto", "on", "off"), default="auto")
    parser.add_argument("--drive-backup", action="store_true")
    args = parser.parse_args(argv)
    try:
        launch(args)
        return 0
    except (RuntimeError, ValueError, OSError, TimeoutError,
            subprocess.SubprocessError) as exc:
        say("ERROR", str(exc)[:450])
        say("LOGS", str(LOG_DIR))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
