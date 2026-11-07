"""Offline contract tests for the Noble-owned ComfyUI launcher."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))
from noble_api.main import create_app


class DummyProcess:
    pid = 13579
    def __init__(self):
        self.code = None
        self.stopped = False
    def poll(self):
        return self.code
    def terminate(self):
        self.stopped = True
        self.code = 0
    def wait(self, timeout=None):
        return self.code
    def kill(self):
        self.code = -9


class ComfyProcessTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.comfy = self.root / "ComfyUI"
        for name in ["main.py", "server.py", "folder_paths.py", "comfy/cli_args.py"]:
            path = self.comfy / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("# mock\n")
        self.app = create_app(self.root)
        self.ctx = TestClient(self.app)
        self.client = self.ctx.__enter__()
        self.cfg = {"install_dir": str(self.comfy), "python_executable": sys.executable,
                    "port": 18888, "memory_mode": "lowvram"}

    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        self.tmp.cleanup()

    def test_validation_and_save_do_not_launch(self):
        with patch("noble_api.comfy_process.subprocess.Popen") as spawn:
            self.assertEqual(self.client.get("/api/v1/images/runtime/status").json()["status"], "stopped")
            result = self.client.post("/api/v1/images/runtime/validate", json=self.cfg)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()["base_url"], "http://127.0.0.1:18888")
            self.assertTrue(Path(result.json()["model_paths_config"]).is_file())
            response = self.client.put("/api/v1/images/runtime/config", json=self.cfg)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(self.client.get("/api/v1/images/runtime/config").json(), self.cfg)
            spawn.assert_not_called()

    def test_exact_loopback_command_and_owned_stop(self):
        self.client.put("/api/v1/images/runtime/config", json=self.cfg)
        previous = self.client.get("/api/v1/images/config").json()
        spawned = DummyProcess()
        runtime = self.app.state.comfy_process
        with (patch.object(runtime, "_port_unused", return_value=True),
              patch.object(runtime, "_probe", return_value={
                  "comfyui_version": "v-test", "python_version": "3.11", "devices": []}),
              patch("noble_api.comfy_process.subprocess.Popen", return_value=spawned) as popen):
            response = self.client.post("/api/v1/images/runtime/start")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["status"], "ready")
            argv = popen.call_args.args[0]
            self.assertEqual(argv[2:6], ["--listen", "127.0.0.1", "--port", "18888"])
            self.assertEqual(argv[-1], "--lowvram")
            self.assertIn("--extra-model-paths-config", argv)
            self.assertIn("--disable-auto-launch", argv)
            self.assertIs(popen.call_args.kwargs["shell"], False)
            self.assertEqual(self.client.get("/api/v1/images/config").json()["base_url"],
                             "http://127.0.0.1:18888")
            self.assertEqual(self.client.get("/api/v1/images/config").json()["checkpoint"],
                             previous["checkpoint"])
            self.assertEqual(self.client.post("/api/v1/images/runtime/start").status_code, 409)
            self.assertEqual(self.client.put("/api/v1/images/runtime/config",
                                             json=self.cfg).status_code, 409)
            self.assertEqual(self.client.post("/api/v1/images/runtime/stop").status_code, 200)
            self.assertTrue(spawned.stopped)
            self.assertEqual(self.client.post("/api/v1/images/runtime/stop").status_code, 409)

    def test_invalid_paths_ports_and_spawn_errors_do_not_overwrite_settings(self):
        for change in ({"install_dir": "../relative"}, {"install_dir": str(self.root / "absent")},
                       {"python_executable": str(self.root / "malware.sh")},
                       {"port": 8000}, {"port": 99999}, {"memory_mode": "unknown"}):
            response = self.client.post("/api/v1/images/runtime/validate",
                                        json={**self.cfg, **change})
            self.assertEqual(response.status_code, 422, response.text)
        self.client.put("/api/v1/images/runtime/config", json=self.cfg)
        old = self.client.get("/api/v1/images/config").json()
        runtime = self.app.state.comfy_process
        with patch.object(runtime, "_port_unused", return_value=False):
            self.assertEqual(self.client.post("/api/v1/images/runtime/start").status_code, 409)
        with (patch.object(runtime, "_port_unused", return_value=True),
              patch("noble_api.comfy_process.subprocess.Popen", side_effect=OSError("denied"))):
            self.assertEqual(self.client.post("/api/v1/images/runtime/start").status_code, 502)
        self.assertEqual(self.client.get("/api/v1/images/config").json(), old)

    def test_symlinks_and_bounded_logs(self):
        alias = self.root / "alias"
        try:
            alias.symlink_to(self.comfy, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("Symlinks unavailable")
        response = self.client.post("/api/v1/images/runtime/validate",
                                    json={**self.cfg, "install_dir": str(alias)})
        self.assertEqual(response.status_code, 422)
        path = self.root / "logs" / "comfyui.log"
        path.parent.mkdir(exist_ok=True)
        path.write_text("A" * 20_000)
        logs = self.client.get("/api/v1/images/runtime/logs").json()
        self.assertTrue(logs["truncated"])
        self.assertEqual(len(logs["text"]), 16_384)


if __name__ == "__main__":
    unittest.main()
