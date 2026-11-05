"""Offline contract for fast Colab current notebook's pinned CUDA prebuilt installer.

Checks only notebook syntax and configured behavior, not GPU performance.
"""
import ast
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
NOTEBOOK=ROOT/"notebooks/noble_ai_colab_qa_integral_v1_5.ipynb"

class ColabQaV13Tests(unittest.TestCase):
    def test_cell_syntax_and_intended_setup(self):
        notebook=json.loads(NOTEBOOK.read_text(encoding="utf-8"))
        self.assertEqual(notebook["nbformat"],4)
        scripts=[]
        for index,cell in enumerate(notebook["cells"]):
            if cell["cell_type"]!="code":
                continue
            source="".join(cell["source"])
            compiled=ast.parse(source,filename=f"colab-qa-v13-cell-{index}")
            scripts.append(source)
            for node in ast.walk(compiled):
                if isinstance(node,ast.Assign) and isinstance(node.value,ast.Constant):
                    if any(isinstance(t,ast.Name) and t.id=="installer" for t in node.targets):
                        ast.parse(node.value.value,filename="official-cuda-installer")
        self.assertGreaterEqual(len(scripts),8)
        content="\n".join(scripts)
        for wanted in ("npm\",\"install\",\"--no-audit","llama_prebuilt",
                       "b12119","sha256","LD_LIBRARY_PATH","llama_linker",
                       "Noble_AI_Colab_QA_v1_5.zip","gpu_benchmark",
                       "ACTIVO","ESTADO_ACTUAL.txt","files.download"):
            self.assertIn(wanted,content)
        self.assertNotIn('"npm","ci"',content)
        self.assertNotIn('"llama_build"',content)
        self.assertNotIn('Falta CUDA nvcc o cmake',content)

if __name__=="__main__":
    unittest.main()
