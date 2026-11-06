"""Static/isolated acceptance for the Colab one-cell application launcher."""
from __future__ import annotations

import ast
import io
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "tools" / "colab_launch.py"
NOTEBOOK = ROOT / "notebooks" / "noble_ai_colab_play.ipynb"
spec = importlib.util.spec_from_file_location("noble_colab_launch_test", LAUNCHER)
launcher = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = launcher
spec.loader.exec_module(launcher)


class ColabPlayTests(unittest.TestCase):
    def test_notebook_one_code_cell_and_future_revision_bootstrap(self):
        doc = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
        self.assertEqual(doc["nbformat"], 4)
        codes = [cell for cell in doc["cells"] if cell["cell_type"] == "code"]
        self.assertEqual(len(codes), 1)
        source = "".join(codes[0]["source"])
        ast.parse(source)
        self.assertIn('REVISION = "master"', source)
        self.assertIn('PINNED_SHA = REVISION', source)
        self.assertIn('git", "ls-remote', source)
        self.assertIn('revision=PINNED_SHA', source)
        self.assertIn('MODELO = "auto"', source)
        self.assertIn('IMAGENES = "auto"', source)
        self.assertIn('VOZ = "auto"', source)
        self.assertIn('voice=VOZ', source)
        self.assertIn("colab_launch.py", source)
        self.assertIn("launcher.launch", source)
        self.assertIn("spec.loader.exec_module(launcher)", source)
        self.assertIn("COPIA_EN_DRIVE = False", source)
        self.assertNotIn("cloudflared", source)
        self.assertNotIn("ngrok", source)
        self.assertNotIn("0.0.0.0", source)

    def test_launcher_source_is_parseable_and_loopback_only(self):
        source = LAUNCHER.read_text(encoding="utf-8")
        ast.parse(source)
        self.assertIn('127.0.0.1', source)
        self.assertIn("--disable-auto-launch", source)
        self.assertIn("serve_kernel_port_as_iframe", source)
        self.assertIn("NOBLE_DATA_DIR", source)
        self.assertIn("noble_api.main:app", source)
        self.assertIn("COMFY_SHA256", source)
        self.assertLess(
            source.index("    display_colab_ui()\n    # Image provider"),
            source.index("            image_checkpoint = ensure_comfy()"),
            "La UI debe abrirse antes de instalar el ComfyUI opcional")
        self.assertNotIn("cloudflared", source)
        self.assertNotIn("ngrok", source)
        self.assertNotIn("--host\", \"0.0.0.0", source)
        self.assertTrue(launcher.node_adequate("v22.13.1"))
        self.assertTrue(launcher.node_adequate("v24.1.0"))
        self.assertFalse(launcher.node_adequate("v22.1.0"))
        self.assertFalse(launcher.node_adequate("v18.19.0"))

    def test_revision_rejects_untrusted_git_paths(self):
        self.assertEqual(launcher.valid_revision("master"), "master")
        ref = "a" * 40
        self.assertEqual(launcher.valid_revision(ref), ref)
        for bad in ("main", "../master", "master;curl", "refs/heads/master",
                    "a" * 39, "A" * 40, "", "a" * 40 + " /tmp"):
            with self.subTest(value=bad), self.assertRaises(ValueError):
                launcher.valid_revision(bad)

    def test_git_refresh_uses_master_or_pinned_commit_without_touching_data(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "app"
            cmds = launcher.github_fetch_commands("master", root)
            self.assertEqual(cmds[0][:3], ["git", "clone", "--depth"])
            self.assertIn("FETCH_HEAD", cmds[-1])
            self.assertEqual(cmds[-1][-3:], ["--detach", "-f", "FETCH_HEAD"])
            root.mkdir()
            with self.assertRaises(ValueError):
                launcher.github_fetch_commands("master", root)
            (root / ".git").mkdir()
            cmds = launcher.github_fetch_commands("c" * 40, root)
            self.assertEqual(len(cmds), 2)
            self.assertEqual(cmds[0][-1], "c" * 40)
            self.assertNotIn("clean", " ".join(" ".join(x) for x in cmds))
            self.assertNotIn("rm", " ".join(" ".join(x) for x in cmds))

    def test_auto_model_selection_with_realistic_gpu_profiles(self):
        self.assertEqual(launcher.model_for_vram("auto", 15360),
                         "qwen3:4b-instruct")
        self.assertEqual(launcher.model_for_vram("auto", None),
                         "qwen3:1.7b")
        self.assertEqual(launcher.model_for_vram("auto", 8192),
                         "qwen3:1.7b")
        self.assertEqual(launcher.model_for_vram("qwen3.5:2b", 4096),
                         "qwen3.5:2b")
        self.assertEqual(launcher.model_for_vram("futureorg/future-model:Q4", 16000),
                         "futureorg/future-model:Q4")
        with self.assertRaises(ValueError):
            launcher.model_for_vram("any:risky;commands", 16000)

    def test_preserves_existing_narration_user_settings(self):
        updates = []
        def fake_request(url, body=None):
            if url.endswith("/api/v1/narrative/config"):
                if body:
                    updates.append(body)
                    return body
                return {"provider": "openrouter", "model": "some/cloud-model"}
            return {"models": []}
        with patch.object(launcher, "json_request", side_effect=fake_request):
            launcher.configure_narrative("qwen3:4b-instruct")
        self.assertEqual(updates, [])
        def existing_ollama(url, body=None):
            if url.endswith("/api/v1/narrative/config"):
                return {"provider": "ollama", "model": "qwen3:1.7b"}
            return {"models": ["qwen3:1.7b"]}
        with patch.object(launcher, "json_request", side_effect=existing_ollama):
            launcher.configure_narrative("qwen3:4b-instruct")

    def test_ui_is_actually_compiled_and_served_by_same_origin(self):
        class HTTPPayload(io.BytesIO):
            def __init__(self, content, media="text/html; charset=utf-8"):
                super().__init__(content)
                self.headers = {"Content-Type": media}
        valid = HTTPPayload(
            b'<html><body><div id="root"></div>'
            b'<script src="/assets/index-test.js"></script></body></html>')
        with patch.object(launcher.request, "urlopen", return_value=valid):
            launcher.verify_web_bundle()
        for response in (
            HTTPPayload(b'{"status":"ok"}', "application/json"),
            HTTPPayload(b'<html><div id="root"></div></html>'),
        ):
            with patch.object(launcher.request, "urlopen",
                              return_value=response):
                with self.assertRaisesRegex(RuntimeError, "React compilado"):
                    launcher.verify_web_bundle()

    def test_drive_backup_uses_online_sqlite_backup_and_restores_media(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            local = base / "local"
            drive = base / "cloud"
            local.mkdir()
            with sqlite3.connect(local / "noble.sqlite") as conn:
                conn.execute("CREATE TABLE stories(id TEXT PRIMARY KEY, text TEXT)")
                conn.execute("INSERT INTO stories VALUES (?,?)",
                             ("one", "Aventura de prueba"))
            media = local / "story-assets" / "example"
            media.mkdir(parents=True)
            (media / "cover.txt").write_text("png", encoding="utf-8")
            launcher.backup_data_to_drive(local, drive)
            self.assertTrue((drive / "data" / "noble.sqlite").is_file())
            self.assertEqual((drive / "data" / "story-assets" /
                              "example" / "cover.txt").read_text(), "png")
            with sqlite3.connect(drive / "data" / "noble.sqlite") as conn:
                self.assertEqual(conn.execute(
                    "SELECT text FROM stories").fetchone()[0],
                    "Aventura de prueba")
            restored = base / "restored"
            launcher.clone_data_from_drive(restored, drive)
            self.assertTrue((restored / "noble.sqlite").is_file())
            with sqlite3.connect(restored / "noble.sqlite") as conn:
                self.assertEqual(conn.execute(
                    "SELECT COUNT(*) FROM stories").fetchone()[0], 1)

    def test_status_helpers_treat_invalid_payload_as_unavailable(self):
        with patch.object(launcher, "json_request", side_effect=ValueError("bad")):
            self.assertFalse(launcher.ready("http://127.0.0.1:8000"))
        self.assertEqual(launcher.node_version("v22.13.0"), (22, 13))
        self.assertEqual(launcher.node_version(""), (0, 0))
        self.assertIn("Comfy-Org", launcher.COMFY_HF_REPO)

    def test_demo_is_created_only_when_library_empty(self):
        created = []
        def requests(url, body=None, method=None, timeout=8):
            if url.endswith("/api/v1/stories") and method == "POST":
                created.append(body)
                return {"id": "00000000-0000-0000-0000-000000000555"}
            return {"stories": []}
        with patch.object(launcher, "json_request", side_effect=requests):
            self.assertEqual(launcher.ensure_demo_story(),
                             "00000000-0000-0000-0000-000000000555")
        self.assertEqual(len(created), 1)
        self.assertGreater(len(created[0]["premise"]), 100)
        self.assertIn("protagonista", created[0]["premise"])
        with patch.object(launcher, "json_request", return_value={"stories": [
                {"id": "a", "title": "Historia previa"}]}) as mocked:
            self.assertIsNone(launcher.ensure_demo_story())
        self.assertEqual(mocked.call_count, 1)

    def test_inference_warmup_requires_real_model_output(self):
        requests = []
        def respond(url, body=None, method=None, timeout=8):
            requests.append((url, method, body, timeout))
            if url.endswith("/api/v1/narrative/config"):
                return {"provider": "ollama", "model": "qwen3:4b-instruct"}
            if url.endswith("/api/v1/narrative/prepare"):
                return {"ready": True, "duration_ms": 740.0}
            raise ValueError("unexpected")
        with patch.object(launcher, "json_request", side_effect=respond):
            self.assertTrue(launcher.verify_narrator())
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[-1][1], "POST")
        self.assertEqual(requests[-1][2], {})
        self.assertEqual(requests[-1][3], 200)
        self.assertNotIn("/generate", requests[-1][0])
        with patch.object(launcher, "json_request", side_effect=[
                {"provider": "ollama", "model": "qwen3:1.7b"},
                {"ready": False}]):
            self.assertFalse(launcher.verify_narrator())
        with patch.object(launcher, "json_request",
                          return_value={"provider": "openrouter", "model": "gpt"}):
            self.assertFalse(launcher.verify_narrator())

    def test_safe_api_process_matching_does_not_accept_unrelated_services(self):
        appdir = Path("/content/noble-ai-colab/app/apps/api")
        args = [
            "/usr/bin/python", "-m", "uvicorn", "noble_api.main:app",
            "--app-dir", str(appdir), "--host", "127.0.0.1",
            "--port", "8000",
        ]
        command = ("\x00".join(args) + "\x00").encode()
        self.assertTrue(launcher.is_managed_api_commandline(command, appdir))
        self.assertFalse(launcher.is_managed_api_commandline(
            b"python\x00-m\x00uvicorn\x00other.main:app\x00", appdir))
        self.assertFalse(launcher.is_managed_api_commandline(
            command.replace(b"127.0.0.1", b"0.0.0.0"), appdir))
        self.assertFalse(launcher.is_managed_api_commandline(
            command.replace(b"8000", b"8001"), appdir))

    def test_reload_reuses_same_commit_and_refuses_unmanaged_pid(self):
        with tempfile.TemporaryDirectory() as td:
            logs = Path(td)
            (logs / "launch_state.json").write_text(
                json.dumps({"source_revision": "b" * 40}), encoding="utf-8")
            (logs / "noble-api.pid.json").write_text(
                json.dumps({"pid": 321}), encoding="utf-8")
            with patch.object(launcher, "LOG_DIR", logs), patch.object(
                    launcher, "ready", return_value=True), patch(
                    "os.kill") as kill:
                launcher.restart_api_for_revision("b" * 40)
                kill.assert_not_called()
                with patch.object(Path, "read_bytes",
                                  return_value=b"python\x00other-server\x00"):
                    with self.assertRaisesRegex(RuntimeError, "no puedo verificar"):
                        launcher.restart_api_for_revision("c" * 40)
                kill.assert_not_called()

    def test_reload_stops_only_managed_api_pid_on_revision_change(self):
        with tempfile.TemporaryDirectory() as td:
            logs = Path(td)
            appdir = Path(td) / "app" / "apps" / "api"
            (logs / "launch_state.json").write_text(
                json.dumps({"source_revision": "b" * 40}), encoding="utf-8")
            (logs / "noble-api.pid.json").write_text(
                json.dumps({"pid": 654}), encoding="utf-8")
            arguments = [
                "python", "-m", "uvicorn", "noble_api.main:app",
                "--app-dir", str(appdir), "--host", "127.0.0.1",
                "--port", "8000",
            ]
            with patch.object(launcher, "LOG_DIR", logs), patch.object(
                    launcher, "APP_DIR", appdir.parent.parent), patch.object(
                    launcher, "ready", side_effect=[True, False]), patch.object(
                    Path, "read_bytes",
                    return_value=("\x00".join(arguments) + "\x00").encode()), patch(
                    "os.kill") as kill:
                launcher.restart_api_for_revision("c" * 40)
                kill.assert_called_once()
                self.assertEqual(kill.call_args.args[0], 654)

    def test_ui_proxy_uses_session_scoped_colab_port(self):
        source = LAUNCHER.read_text(encoding="utf-8")
        self.assertIn("google.colab.kernel.proxyPort(", source)
        self.assertIn("serve_kernel_port_as_iframe", source)
        self.assertIn("URL de proxy", source)


if __name__ == "__main__":
    unittest.main()
