"""Compile every Python cell of the published Colab supported QA v1.5 notebook."""
import ast
import json
import unittest
from pathlib import Path

NOTEBOOK = Path(__file__).resolve().parents[1] / "notebooks" / "noble_ai_colab_qa_integral_v1_5.ipynb"


class ColabIntegralQaTests(unittest.TestCase):
    def test_valid_notebook_and_python(self):
        nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
        self.assertEqual(nb["nbformat"], 4)
        self.assertEqual(nb["metadata"]["accelerator"], "GPU")
        scripts = []
        for index, cell in enumerate(nb["cells"]):
            if cell["cell_type"] == "code":
                script = "".join(cell["source"])
                ast.parse(script, filename=f"notebook-cell-{index}")
                scripts.append(script)
        self.assertGreaterEqual(len(scripts), 8)
        code = "\n".join(scripts)
        for marker in ("command(", "[ACTIVO]", "save_status(", "timeout=",
                       "python_tests", "web_build", "browser_tests",
                       "gpu_benchmark", "llama-server", "MODEL_REPO",
                       "ESTADO_ACTUAL.txt", "NOBLE_E2E_BASE_URL",
                       "Noble_AI_Colab_QA_v1_5.zip", "files.download"):
            self.assertIn(marker, code)


if __name__ == "__main__":
    unittest.main()
