"""Managed KoboldCpp tests — mock process and health response (no executable/GPU run)."""
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from noble_api.main import create_app  # noqa: E402


class FakeProcess:
    pid = 98765

    def __init__(self):
        self.returncode = None

    def poll(self):
        return self.returncode

    def terminate(self):
        self.returncode = -15

    def wait(self, timeout=None):
        return self.returncode

    def kill(self):
        self.returncode = -9


class UnoccupiedPort:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def settimeout(self, value):
        return None

    def connect_ex(self, endpoint):
        return 111


class MockHealthResponse:
    status_code = 200

    def json(self):
        return {"data": [{"id": "tiny.Q4.gguf"}]}

    def raise_for_status(self):
        return None


class FakeHealthClient:
    def __init__(self, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None

    def get(self, url, **kwargs):
        return MockHealthResponse()


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="noble-runtime-")
        self.root = Path(self.temp.name)
        self.app = create_app(self.root)
        self.manager = self.app.state.kobold
        self.gguf = self.root / "models" / "tiny.Q4.gguf"
        self.gguf.write_bytes(b"GGUF" + bytes(range(64)))
        digest = hashlib.sha256(self.gguf.read_bytes()).hexdigest()
        self.installed_id = self.app.state.store.register_model(
            {"repo_id": "test/tiny", "revision": "a"*40, "filename": self.gguf.name},
            self.gguf, digest, "sha256_verified")
        self.exe = self.root / "tools" / "koboldcpp.exe"
        self.exe.parent.mkdir(exist_ok=True)
        self.exe.write_bytes(b"not-run-in-test")

    def tearDown(self):
        self.manager.stop()
        self.temp.cleanup()

    def launch_body(self, **changed):
        body = {
            "executable": str(self.exe), "installed_id": self.installed_id,
            "gpu_layers": 0, "contextsize": 4096, "port": 5001,
        }
        body.update(changed)
        return body

    def test_rejects_untrusted_executable_and_noninstalled_model(self):
        with TestClient(self.app) as c:
            res = c.post("/api/v1/runtime/kobold/start",
                         json=self.launch_body(executable=str(self.gguf)))
            self.assertEqual(res.status_code, 422)
            res = c.post("/api/v1/runtime/kobold/start",
                         json=self.launch_body(installed_id="not-a-model"))
            self.assertEqual(res.status_code, 422)
            self.assertEqual(c.get("/api/v1/runtime/kobold/status").json()["status"], "stopped")

    def test_launch_with_cpu_only_and_stop_owned_process(self):
        fake = FakeProcess()
        with patch("noble_api.runtime.subprocess.Popen", return_value=fake) as popen, patch(
            "noble_api.runtime.socket.socket", return_value=UnoccupiedPort()
        ):
            with TestClient(self.app) as c:
                candidates = c.get("/api/v1/runtime/kobold/installed").json()
                self.assertEqual(len(candidates["models"]), 1)
                res = c.post("/api/v1/runtime/kobold/start", json=self.launch_body())
                self.assertEqual(res.status_code, 202, res.text)
                cmd = popen.call_args.args[0]
                self.assertEqual(cmd[:3], [str(self.exe), "--model", str(self.gguf)])
                self.assertIn("--host", cmd)
                self.assertEqual(cmd[cmd.index("--host")+1], "127.0.0.1")
                self.assertEqual(cmd[cmd.index("--gpulayers")+1], "0")
                self.assertEqual(cmd[cmd.index("--contextsize")+1], "4096")
                again = c.post("/api/v1/runtime/kobold/start", json=self.launch_body())
                self.assertEqual(again.status_code, 422)
                stopped = c.post("/api/v1/runtime/kobold/stop")
                self.assertEqual(stopped.json()["status"], "stopped")
                self.assertEqual(fake.returncode, -15)

    def test_ready_model_can_activate_narrator(self):
        fake = FakeProcess()
        with patch("noble_api.runtime.subprocess.Popen", return_value=fake), patch(
            "noble_api.runtime.socket.socket", return_value=UnoccupiedPort()
        ), patch("noble_api.runtime.httpx.Client", FakeHealthClient):
            with TestClient(self.app) as c:
                started = c.post("/api/v1/runtime/kobold/start",
                                 json=self.launch_body(gpu_layers=24))
                self.assertEqual(started.json()["status"], "ready")
                result = c.post("/api/v1/runtime/kobold/activate")
                self.assertEqual(result.status_code, 200, result.text)
                self.assertEqual(result.json()["provider"], "koboldcpp")
                self.assertEqual(result.json()["model"], "tiny.Q4.gguf")
                self.assertEqual(result.json()["base_url"], "http://127.0.0.1:5001")
                c.post("/api/v1/runtime/kobold/stop")


if __name__ == "__main__":
    unittest.main()
