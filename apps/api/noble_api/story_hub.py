"""Bundled original, playable interactive story packages (offline catalog v1).

Not a remote community service. Only public fields leave GET routes; secrets,
NPC instructions and Lorebooks are copied into independent SQLite story rows
after explicit installation. No untrusted URLs, archives, model downloads or
media bytes are executed. Each install is one SQLite transaction.
"""
from __future__ import annotations

import json
import time
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .creator import CreatorBlueprint, CreatorCharacter
from .lorebook import LorebookEntryInput, LorebookService


PACKS = [
    {
        "id": "ultima-luna", "version": "1.0.0", "author": "Noble AI",
        "title": "La estación de la última luna",
        "genre": "Misterio sobrenatural", "tags": ["misterio", "fantasía urbana", "decisiones"],
        "synopsis": ("Cada medianoche un tren imposible se detiene en la estación abandonada "
                     "de Puerto Niebla. Sus billetes llevan fechas que aún no han ocurrido."),
        "protagonist": "Alex", "language": "es-419",
        "player_plot": ("Puerto Niebla vive de la pesca y de historias que nadie quiere contar. "
                        "Desde hace trece años la estación está clausurada. Esta noche alguien "
                        "ha dejado un billete con tu nombre bajo la puerta."),
        "ai_plot": ("La estación no viaja al pasado: conecta futuros alternativos. Cada boleto "
                    "permite ver una posibilidad, pero usarlo borra un recuerdo asociado a esa "
                    "decisión. El jefe de estación, Elías, fue quien selló los andenes después "
                    "de que su hija desapareciera. Mara busca a su hermano Ivo, que está vivo "
                    "en una línea temporal que se colapsará al amanecer. La revisora Vega "
                    "recuerda ramificaciones previas, pero no puede revelar el coste sin que "
                    "el jugador haga preguntas específicas. Ningún NPC puede decidir por "
                    "{{user}}; no afirmar qué piensa ni qué hace el protagonista. Las "
                    "revelaciones se construyen por pistas y elecciones reales."),
        "guidelines": ("Narración de misterio con causalidad consistente. Ofrece consecuencias "
                       "y pistas comprobables, nunca tres opciones obligatorias. Cada escena "
                       "debe terminar antes de la decisión de {{user}}. Mantén nombres y "
                       "hechos; los secretos no se revelan antes de encontrar pistas."),
        "reminder": ("El tren solo llega a medianoche. El billete tiene el nombre de {{user}}. "
                     "El costo de viajar es un recuerdo; los NPC no conocen todas las ramas."),
        "openings": [
            ("La lluvia ha vaciado el muelle. {{user}} encuentra un boleto plateado bajo "
             "la puerta de su apartamento: destino «Última Luna», salida 00:00. En la "
             "calle, Mara sostiene una linterna y pregunta si también oyó el silbato."),
            ("Las puertas de la estación clausurada están abiertas por primera vez en "
             "trece años. {{user}} ve a Elías limpiando un reloj detenido a las 23:59. "
             "En el tablón aparece un destino escrito con la letra de alguien conocido."),
            ("En el mercado nocturno, Vega deja una maleta frente a {{user}} y se "
             "marcha. Dentro hay tres fotografías de la misma estación en décadas "
             "distintas. Una muestra al protagonista entre los pasajeros."),
        ],
        "characters": [
            ("Mara Salcedo", "Archivista del puerto que investiga la desaparición de "
             "su hermano Ivo. Conserva notas fechadas por acontecimientos que aún "
             "no suceden.", "Determinada, irónica bajo presión, desconfiada de promesas.",
             "Mara: No te pido que me creas. Mira la fecha y luego dime qué harías."),
            ("Elías Arce", "Antiguo jefe de estación, responsable de sellar los "
             "andenes trece años atrás. Guarda las llaves de los vagones.",
             "Cortés, culpable y protector; evita hablar de su hija.",
             "Elías: Un tren siempre cobra el trayecto. Lo difícil es saber el precio."),
            ("Vega", "Revisora de uniforme gris que aparece cuando las agujas "
             "del reloj marcan medianoche. Conoce rutas descartadas.",
             "Enigmática, paciente, incapaz de mentir directamente.",
             "Vega: Puede preguntar una vez más, pero escuche la respuesta entera."),
            ("Ivo Salcedo", "Hermano menor de Mara, desaparecido cerca de la "
             "estación. Su voz aparece en grabaciones antiguas.",
             "Ingenioso, optimista, dispuesto a proteger a Mara.",
             "Ivo: Si encuentras la segunda llave, no la uses todavía."),
        ],
        "lore": [
            ("El billete plateado", "El billete no es dinero: muestra una ruta posible. "
             "Sellarlo dentro del tren altera recuerdos de una decisión futura.",
             ["billete", "boleto", "pasaje"]),
            ("El reloj de medianoche", "El reloj central está detenido a las 23:59 "
             "porque la estación existe en un intervalo entre posibilidades.",
             ["reloj", "medianoche", "estación"]),
            ("El archivo Salcedo", "Mara tiene un archivo cronológico de los días "
             "anteriores a la desaparición de Ivo, con una página arrancada.",
             ["mara", "ivo", "archivo"]),
        ],
    },
    {
        "id": "mareas-de-vidrio", "version": "1.0.0", "author": "Noble AI",
        "title": "Las mareas de vidrio", "genre": "Ciencia ficción costera",
        "tags": ["ciencia ficción", "exploración", "ecología"],
        "synopsis": ("Tras una tormenta luminosa, el mar devuelve fragmentos de vidrio "
                     "que contienen recuerdos ajenos. Una ciudad pesquera está cambiando."),
        "protagonist": "Noa", "language": "es-419",
        "player_plot": ("El faro de Santa Bruma se apaga cuando aparecen cristales "
                        "transparentes sobre la arena. Las autoridades ordenan cerrar "
                        "la costa, pero voces conocidas llaman desde las olas."),
        "ai_plot": ("Los cristales son soportes biológicos de memoria creados por una "
                    "red submarina que se alimenta de patrones eléctricos. El faro "
                    "emitía una frecuencia para mantener a la red dormida. La capitana "
                    "Lía sabe que su tripulación rompió el transmisor accidentalmente "
                    "pero teme que culpen al puerto. Tomás, biólogo, reconoce la red "
                    "como una forma de vida, no un arma. Abril quiere vender los "
                    "cristales para salvar la economía del muelle y oculta a quién "
                    "se los ha entregado. Nadie determina las acciones de {{user}}. "
                    "Una decisión que protege vidas hoy puede alterar la costa mañana."),
        "guidelines": ("Ciencia ficción de misterio humano: consecuencias materiales y "
                       "emocionales, investigación, pistas técnicas entendibles y "
                       "conversaciones creíbles. Permite negociar, investigar, "
                       "explorar o ignorar el faro sin decidir por {{user}}."),
        "reminder": ("La red es una criatura colectiva; el faro es un transmisor, "
                     "no una luz sobrenatural. Cada cristal contiene recuerdos "
                     "fragmentarios y no garantiza la verdad completa."),
        "openings": [
            ("El amanecer dibuja líneas azules en el agua. {{user}} recoge un "
             "fragmento de vidrio que reproduce la voz de alguien desaparecido. "
             "El faro parpadea y Lía llega corriendo desde el muelle."),
            ("Durante una guardia nocturna, {{user}} observa cómo una barca "
             "regresa sin tripulación. Entre sus redes hay cristales tibios "
             "y una libreta con el nombre de Tomás tachado."),
            ("Abril invita a {{user}} a una subasta clandestina. El objeto "
             "principal parece un espejo común, salvo que refleja la playa "
             "como estará dentro de tres días."),
        ],
        "characters": [
            ("Lía Monterroso", "Capitana de rescate del puerto de Santa Bruma. "
             "Su embarcación estuvo cerca del faro durante la tormenta.",
             "Directa y responsable; protege a su tripulación por encima de su reputación.",
             "Lía: Necesito una respuesta práctica. ¿Hay alguien todavía en el agua?"),
            ("Tomás Ureña", "Biólogo marino que estudia la fauna bajo el arrecife. "
             "Sus cuadernos describen pulsos eléctricos de origen desconocido.",
             "Metódico, compasivo y prudente con sus conclusiones.",
             "Tomás: Una señal repetida no demuestra intención. Todavía."),
            ("Abril Solano", "Comerciante del mercado pesquero cuya familia depende "
             "de la actividad del muelle. Tiene contactos con compradores externos.",
             "Persuasiva, ambiciosa, afectuosa con los vecinos.",
             "Abril: Salvar el pueblo y hacer negocios no siempre son cosas opuestas."),
            ("Nereo", "Buzo veterano que conoce cuevas submarinas donde otros "
             "no se atreven a entrar y oye vibraciones antes de las tormentas.",
             "Reservado y observador; cuenta historias solo si hay confianza.",
             "Nereo: El agua lleva avisándonos años. Nadie quiso escucharla."),
        ],
        "lore": [
            ("Los cristales de memoria", "Son depósitos de una red biológica "
             "marina y reproducen fragmentos sin contexto fiable.",
             ["cristal", "vidrio", "fragmento"]),
            ("El faro de Santa Bruma", "Emite una frecuencia de baja potencia "
             "que regula la actividad de la red submarina.",
             ["faro", "transmisor", "frecuencia"]),
            ("Las cuevas del arrecife", "Las cuevas comunican con un organismo "
             "colectivo bajo el arrecife, accesible durante marea baja.",
             ["cueva", "arrecife", "marea"]),
        ],
    },
    {
        "id": "jardin-mecanico", "version": "1.0.0", "author": "Noble AI",
        "title": "El jardín de las horas rotas", "genre": "Fantasía de relojería",
        "tags": ["fantasía", "intriga", "steampunk"],
        "synopsis": ("En una ciudad donde las flores dan la hora, alguien ha robado "
                     "los segundos de sus habitantes. El jardín central está muriendo."),
        "protagonist": "Ari", "language": "es-419",
        "player_plot": ("La capital de Bronceval depende de relojes que florecen "
                        "al amanecer. Esta semana varios habitantes han envejecido "
                        "en una noche y el Consejo acusa a los jardineros."),
        "ai_plot": ("La energía temporal de Bronceval proviene de semillas "
                    "construidas hace un siglo. El Consejo ha aumentado su consumo "
                    "para prolongar la vida de la élite. Ada, relojera, descubre "
                    "fallas en el mecanismo y busca pruebas. Simón, jardinero, "
                    "conoce el precio de las semillas: cada cosecha acorta el "
                    "tiempo de otra persona. Celeste, consejera, intenta "
                    "encubrir la causa para evitar disturbios, pero no es una "
                    "villana simple. Lucio transporta segundos robados en relojes "
                    "de bolsillo. {{user}} puede descubrir y alterar alianzas "
                    "sin que el narrador decida en su lugar."),
        "guidelines": ("Fantasía de intriga con detalles sensoriales mecánicos. "
                       "Presenta pistas sobre el coste temporal gradualmente. "
                       "Las alianzas dependen de acciones concretas, no de "
                       "juicios del narrador. NPC tienen metas independientes."),
        "reminder": ("Las semillas son máquinas y plantas a la vez. Los relojes "
                     "no permiten viajes temporales ilimitados; cada ajuste "
                     "redistribuye tiempo entre personas."),
        "openings": [
            ("A {{user}} le entregan una flor metálica que ha dejado de "
             "marcar los segundos. Ada observa que las agujas apuntan "
             "hacia el invernadero del Consejo, cerrado desde ayer."),
            ("Simón pide ayuda a {{user}} antes de que los guardias sellen "
             "el jardín. Dentro, las flores se han abierto a medianoche "
             "y una sombra camina entre los péndulos."),
            ("En una recepción del Consejo, Celeste invita a {{user}} a "
             "examinar un reloj que atrasa siempre la misma hora. "
             "Lucio desaparece con una caja bajo el brazo."),
        ],
        "characters": [
            ("Ada Ferrel", "Relojera que diseña mecanismos para el Consejo "
             "y ha descubierto inconsistencias en los registros de tiempo.",
             "Inventiva, impaciente y solidaria con sus aprendices.",
             "Ada: Si escuchas ese tic, ya es demasiado tarde para mentir."),
            ("Simón Rojas", "Jardinero responsable de las semillas mecánicas, "
             "acusado de sabotear el jardín central.",
             "Paciente, fiel a los trabajadores y hostil a la arrogancia.",
             "Simón: Ninguna flor roba el tiempo por gusto."),
            ("Celeste Varela", "Miembro del Consejo de Bronceval que intenta "
             "evitar el colapso de los relojes y una rebelión civil.",
             "Elegante, calculadora, preocupada por las consecuencias públicas.",
             "Celeste: La verdad puede salvarnos, pero también puede hundirnos."),
            ("Lucio Valen", "Mensajero y tratante de relojes antiguos que "
             "conoce túneles ocultos bajo el distrito de manufacturas.",
             "Encantador, oportunista y leal a sus propias promesas.",
             "Lucio: No vendo minutos. Vendo oportunidades para usarlos."),
        ],
        "lore": [
            ("Las semillas de tiempo", "Dispositivos orgánicos fabricados "
             "hace un siglo que redistribuyen segundos entre habitantes.",
             ["semilla", "flor", "jardín"]),
            ("El Consejo de Bronceval", "Controla la distribución de los "
             "relojes públicos y oculta el coste del mecanismo.",
             ["consejo", "bronceval", "celeste"]),
            ("Los túneles de manufacturas", "Conectan talleres, depósitos y "
             "salones del Consejo sin pasar por plazas públicas.",
             ["túnel", "reloj", "taller"]),
        ],
    },
]


def _validate_pack(pack: dict) -> tuple[CreatorBlueprint, list[CreatorCharacter],
                                        list[dict]]:
    blueprint = CreatorBlueprint.model_validate({
        "synopsis": pack["synopsis"], "player_plot": pack["player_plot"],
        "ai_plot": pack["ai_plot"], "guidelines": pack["guidelines"],
        "reminder": pack["reminder"], "opening_scenarios": pack["openings"],
        "genre": pack["genre"], "tags": pack["tags"], "language": pack["language"],
    })
    if not 1 <= len(blueprint.opening_scenarios) <= 6 or any(
            not 15 <= len(item) <= 3000 for item in blueprint.opening_scenarios):
        raise ValueError("Inicios de paquete inválidos")
    characters = [CreatorCharacter.model_validate({
        "name": name, "description": description,
        "personality": personality, "dialogue_examples": dialogue,
    }) for name, description, personality, dialogue in pack["characters"]]
    if len(characters) < 3:
        raise ValueError("La historia necesita personajes reales")
    lore = [LorebookService._clean(LorebookEntryInput(
        title=title, content=content, keys=keys,
        priority=55,
    )) for title, content, keys in pack["lore"]]
    if len(lore) < 2:
        raise ValueError("La historia necesita mundo documentado")
    return blueprint, characters, lore


PACK_BY_ID = {entry["id"]: entry for entry in PACKS}
if len(PACK_BY_ID) != len(PACKS):
    raise ValueError("Identificadores de historias duplicados")
for _pack in PACKS:
    _validate_pack(_pack)


class InstallStoryPack(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protagonist_name: str | None = Field(default=None, min_length=1, max_length=60)


def public_pack(pack: dict) -> dict:
    """Never leak AI-only plot, NPC hidden prompts or Lorebook into public GET."""
    return {
        "id": pack["id"], "version": pack["version"], "author": pack["author"],
        "source": "bundled-original", "license": "Texto original incluido",
        "title": pack["title"], "genre": pack["genre"],
        "tags": list(pack["tags"]), "language": pack["language"],
        "synopsis": pack["synopsis"], "player_plot": pack["player_plot"],
        "protagonist": pack["protagonist"],
        "character_names": [name for name, *_ in pack["characters"]],
        "opening_previews": list(pack["openings"]),
        "character_count": len(pack["characters"]),
        "lore_count": len(pack["lore"]),
        "has_images": False,
    }


class StoryHubService:
    def __init__(self, narrative):
        self.narrative = narrative
        self.store = narrative.store

    def list(self) -> list[dict]:
        return [public_pack(pack) for pack in PACKS]

    def detail(self, pack_id: str) -> dict:
        try:
            return public_pack(PACK_BY_ID[pack_id])
        except KeyError as exc:
            raise HTTPException(404, "Historia del catálogo inexistente") from exc

    def install(self, pack_id: str, request: InstallStoryPack) -> dict:
        pack = PACK_BY_ID.get(pack_id)
        if pack is None:
            raise HTTPException(404, "Historia del catálogo inexistente")
        blueprint, chars, lore = _validate_pack(pack)
        actor = (request.protagonist_name or pack["protagonist"]).strip()
        if not actor or len(actor) > 60:
            raise HTTPException(422, "Nombre del protagonista inválido")
        new_id = str(uuid.uuid4())
        now = time.time()
        # Build the package in one transaction. If any row or validation fails,
        # SQLite rolls back the story and all author/lore subdocuments.
        with self.store._conn() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "INSERT INTO stories "
                "(id,title,premise,created_at,updated_at,protagonist_name) "
                "VALUES (?,?,?,?,?,?)",
                (new_id, pack["title"], pack["player_plot"], now, now, actor))
            conn.execute("INSERT INTO creator_blueprints VALUES (?,?,?)",
                         (new_id, blueprint.model_dump_json(), now))
            for index, char in enumerate(chars):
                conn.execute("INSERT INTO creator_characters VALUES (?,?,?,?,?)",
                             (str(uuid.uuid4()), new_id, char.model_dump_json(),
                              now + index * 0.000001, now))
            for index, entry in enumerate(lore):
                conn.execute("INSERT INTO lorebook_entries VALUES (?,?,?,?,?)",
                             (str(uuid.uuid4()), new_id,
                              json.dumps(entry, ensure_ascii=False),
                              now + index * 0.000001, now))
        return {
            "story": self.narrative.get_story(new_id),
            "package_id": pack_id,
            "version": pack["version"],
            "characters_installed": len(chars),
            "lore_installed": len(lore),
            "openings_installed": len(blueprint.opening_scenarios),
        }


def mount_story_hub_routes(app, narrative) -> None:
    service = StoryHubService(narrative)

    @app.get("/api/v1/story-hub")
    def bundled_stories():
        return {"packs": service.list(), "source": "bundled-original",
                "community_online": False}

    @app.get("/api/v1/story-hub/{pack_id}")
    def bundled_story_detail(pack_id: str):
        return service.detail(pack_id)

    @app.post("/api/v1/story-hub/{pack_id}/install", status_code=201)
    def install_bundled_story(pack_id: str, request: InstallStoryPack):
        return service.install(pack_id, request)
