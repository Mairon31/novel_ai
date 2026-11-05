"""Colab QA v1.5: offline verification of cold/warm summary and synthetic sample opt-in."""
import ast
import json
import unittest
from pathlib import Path

NOTEBOOK=Path(__file__).resolve().parents[1]/"notebooks/noble_ai_colab_qa_integral_v1_5.ipynb"

class ColabV15RegressionTests(unittest.TestCase):
    def test_valid_cells_and_cold_warm_separation(self):
        notebook=json.loads(NOTEBOOK.read_text(encoding="utf-8"))
        scripts=[]
        for index,cell in enumerate(notebook["cells"]):
            if cell["cell_type"]=="code":
                code="".join(cell["source"])
                ast.parse(code,filename=f"v15-cell-{index}")
                scripts.append(code)
        joined="\n".join(scripts)
        for phrase in (
            '"version": "1.5"', 'RUNS = 6', 'CAPTURE_SYNTHETIC_TEXT = True',
            '"phase":"cold" if n==0 else "warm"', "steady_state",
            "cold_first_generation", "vram_peak_observed_mib",
            "story_persistence", "synthetic_narrative_sample",
            "Noble_AI_Colab_QA_v1_5.zip", "model_ready_seconds",
            "ttft_p95_exploratory_ms",
        ):
            self.assertIn(phrase,joined)
        self.assertNotIn('"version": "1.3"',joined)
        self.assertNotIn("vram_peak_observed_mb",joined)
        self.assertNotIn("llama_build",joined)
        self.assertGreaterEqual(len(scripts),8)

if __name__=="__main__":
    unittest.main()
