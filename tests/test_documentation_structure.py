"""P0: verifica solo integridad del scaffold/documentación; NO proveedores ni GPU."""
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
REQUIRED = [
    "README.md", "AGENTS.md", "docs/GDD_TECNICO.md",
    "docs/ARQUITECTURA.md", "docs/CONTRATOS_API.md",
    "docs/REPOSITORIOS_OPEN_SOURCE.md", "docs/PROGRESO.md",
    "docs/ROADMAP.md", "docs/IMAGENES.md", "docs/TTS.md",
    "docs/PERFILES_GPU.md", "docs/COLAB_A_LOCAL.md",
    "docs/QA_Y_ACEPTACION.md", "docs/SEGURIDAD_Y_LICENCIAS.md",
    "docs/ESTADO_Y_MEMORIA.md", "docs/adr/0001-stack-modular.md",
    "notebooks/noble_ai_colab_smoke.ipynb",
    "config/gpu_profiles.json", "config/model_manifest.example.json",
]

class DocumentationStructureTests(unittest.TestCase):
    def test_required_files_exist_and_not_empty(self):
        for path in REQUIRED:
            with self.subTest(path=path):
                file_path = ROOT / path
                self.assertTrue(file_path.is_file(), path)
                self.assertGreater(file_path.stat().st_size, 40, path)

    def test_profiles_json_and_unverified_status(self):
        profiles = json.loads((ROOT / "config/gpu_profiles.json").read_text(encoding="utf-8"))
        for key in ("minimum_12gb", "recommended_16gb", "colab_probe"):
            self.assertIn(key, profiles["profiles"])
            self.assertFalse(profiles["profiles"][key]["verified"], key)

    def test_manifest_no_fabricated_hashes(self):
        manifest = json.loads((ROOT / "config/model_manifest.example.json").read_text(encoding="utf-8"))
        self.assertTrue(all(not model["verified"] for model in manifest["models"]))
        self.assertTrue(all(model["sha256"] is None for model in manifest["models"]))

    def test_colab_notebook_schema(self):
        notebook = json.loads((ROOT / "notebooks/noble_ai_colab_smoke.ipynb").read_text(encoding="utf-8"))
        self.assertEqual(notebook["nbformat"], 4)
        self.assertTrue(any(c["cell_type"] == "code" for c in notebook["cells"]))

    def test_media_policies_are_documented(self):
        image_doc = (ROOT / "docs/IMAGENES.md").read_text(encoding="utf-8")
        tts_doc = (ROOT / "docs/TTS.md").read_text(encoding="utf-8")
        self.assertIn("No generar imagen", image_doc)
        self.assertIn("solo", tts_doc.lower())
        self.assertIn("por defecto", tts_doc.lower())

if __name__ == "__main__":
    unittest.main()
