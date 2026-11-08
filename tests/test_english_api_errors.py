"""Ensure API-facing exception copy is English without touching user story data.

This checks diagnostic literals in raise expressions only. Spanish narrative
fixtures, persisted compatibility values, and language recognition are allowed.
"""
import ast
from pathlib import Path
import re
import unittest

MODULES = Path(__file__).resolve().parents[1] / "apps" / "api" / "noble_api"
SPANISH_ERROR = re.compile(
    r"[¿¡áéíóúÁÉÍÓÚñÑ]|"
    r"\b(?:No se|Ya existe|Demasiad[oa]s?|Rol desconocido|"
    r"Respuesta binaria|Fuera de|Esquema de|Columnas ajenas|"
    r"Falta|Instala modelos|Testigos duplicados|"
    r"Metadatos de respaldo)\b", re.IGNORECASE,
)


class EnglishApiErrorsTests(unittest.TestCase):
    def test_raised_diagnostics_do_not_contain_spanish_copy(self):
        errors = []
        for source in MODULES.glob("*.py"):
            try:
                module = ast.parse(source.read_text(encoding="utf-8"))
            except SyntaxError as exc:
                self.fail(f"{source.name}: {exc}")
            for node in ast.walk(module):
                if not isinstance(node, ast.Raise) or node.exc is None:
                    continue
                for fragment in ast.walk(node.exc):
                    if (isinstance(fragment, ast.Constant)
                            and isinstance(fragment.value, str)
                            and SPANISH_ERROR.search(fragment.value)):
                        errors.append(
                            f"{source.name}:{fragment.lineno}: {fragment.value}"
                        )
        self.assertEqual(errors, [], "\n".join(errors))


if __name__ == "__main__":
    unittest.main()
