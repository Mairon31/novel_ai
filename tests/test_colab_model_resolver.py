"""Regression tests for real GGUF discovery and Colab QA v1.4.

No network call or GPU allocation is needed. Hugging Face API responses are
synthetic, but match the prefix discrepancy observed in the v1.3 ZIP.
"""
import ast
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"tools"))
from colab_hf_model import select_gguf_file, fetch_model  # noqa: E402

ACTUAL="Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
WRONG="Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
REPO="bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF"


class GGUFModelResolverTests(unittest.TestCase):
    def test_existing_file_selected_exactly(self):
        self.assertEqual(select_gguf_file([ACTUAL],ACTUAL),ACTUAL)

    def test_missing_prefix_finds_only_matching_quant(self):
        files=[ACTUAL,"Qwen_Qwen3-4B-Instruct-2507-Q5_K_M.gguf"]
        self.assertEqual(select_gguf_file(files,WRONG),ACTUAL)

    def test_refuses_missing_or_ambiguous_quant(self):
        with self.assertRaises(FileNotFoundError):
            select_gguf_file(["test-Q5_K_M.gguf"], WRONG)
        with self.assertRaises(ValueError):
            select_gguf_file(["first-Q4_K_M.gguf","second-Q4_K_M.gguf"], WRONG)

    def test_metadata_download_is_pinned_and_hashes_file(self):
        with tempfile.TemporaryDirectory() as temp:
            calls=[]
            class StubApi:
                def model_info(self,repo,files_metadata=False):
                    self_repo=types.SimpleNamespace(
                        sha="1234abcd"*5,
                        siblings=[types.SimpleNamespace(rfilename=ACTUAL),
                                  types.SimpleNamespace(rfilename="README.md")])
                    return self_repo
            def fake_download(repo_id,filename,revision,local_dir):
                calls.append((repo_id,filename,revision))
                model=Path(local_dir)/filename
                model.parent.mkdir(parents=True,exist_ok=True)
                model.write_bytes(b"GGUF"+b"0"*1048576)
                return str(model)
            fake=types.SimpleNamespace(HfApi=StubApi,hf_hub_download=fake_download)
            with patch.dict(sys.modules,{"huggingface_hub":fake}):
                data=fetch_model(REPO,WRONG,temp,str(Path(temp)/"model.json"))
            self.assertEqual(data["filename"],ACTUAL)
            self.assertEqual(data["requested_filename"],WRONG)
            self.assertEqual(data["revision"],"1234abcd"*5)
            self.assertEqual(calls,[(REPO,ACTUAL,"1234abcd"*5)])
            self.assertEqual(len(data["sha256"]),64)
            saved=json.loads((Path(temp)/"model.json").read_text())
            self.assertEqual(saved["filename"],ACTUAL)

    def test_notebook_compiles_and_references_real_resolver(self):
        nb=json.loads((ROOT/"notebooks/noble_ai_colab_qa_integral_v1_4.ipynb").read_text())
        code=[]
        for i,cell in enumerate(nb["cells"]):
            if cell["cell_type"]=="code":
                source="".join(cell["source"])
                ast.parse(source,filename=f"notebook-v14-cell-{i}")
                code.append(source)
                # Validate embedded binary installer, too.
                tree=ast.parse(source)
                for node in ast.walk(tree):
                    if isinstance(node,ast.Assign) and isinstance(node.value,ast.Constant):
                        if any(isinstance(t,ast.Name) and t.id=="installer" for t in node.targets):
                            ast.parse(node.value.value,filename="cuda-installer-v14")
        combined="\n".join(code)
        for target in ("MODEL_FILE = \""+ACTUAL+"\"","colab_hf_model.py",
                       "Noble_AI_Colab_QA_v1_4.zip","noble_qa_v14",
                       "gpu_benchmark","model_download","files.download"):
            self.assertIn(target,combined)
        self.assertNotIn("MODEL_FILE = \""+WRONG+"\"",combined)

if __name__=="__main__":
    unittest.main()
