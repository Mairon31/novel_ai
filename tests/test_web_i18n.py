"""Static locale key and interpolation-parity gate for the shipped web UI."""
import json
from pathlib import Path
import re
import unittest

BASE = Path(__file__).resolve().parents[1] / "apps" / "web" / "src" / "locales"
LANGUAGES = ("en", "es-419", "pt-BR", "zh-CN")
PLACEHOLDERS = re.compile(r"{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}")


class InterfaceLocaleTests(unittest.TestCase):
    def test_catalogs_have_matching_keys_and_interpolation_variables(self):
        catalogs = {lang: json.loads((BASE / (lang + ".json")).read_text("utf-8"))
                    for lang in LANGUAGES}
        expected = set(catalogs["en"])
        self.assertGreaterEqual(len(expected), 150)
        for lang, catalog in catalogs.items():
            with self.subTest(language=lang):
                self.assertEqual(set(catalog), expected)
                self.assertEqual(len(catalog), len(expected))
                for key, source in catalogs["en"].items():
                    value = catalog[key]
                    self.assertIsInstance(value, str)
                    self.assertTrue(value.strip(), key)
                    self.assertEqual(set(PLACEHOLDERS.findall(source)),
                                     set(PLACEHOLDERS.findall(value)), key)


if __name__ == "__main__":
    unittest.main()
