"""Narrator agency contract: deterministic prompt constraints, no AI calls.

Separate the player's input (an attempt/statement) from the world's outcome.
Model compliance cannot be certified by presence of this prompt alone.
"""
from __future__ import annotations


COMMON = (
    "Narrative agency and causal contract:\n"
    "- Player agency: describe the protagonist's stated attempt or dialogue, "
    "but never invent additional decisions, consent, beliefs, inner feelings, "
    "or speech for the player-controlled character.\n"
    "- NPC agency: each non-player character may have distinct motivations, "
    "knowledge, loyalties, preferences and constraints. They may disagree, "
    "refuse, bargain, mistrust or act independently. Do not make NPCs flatter "
    "or automatically validate the protagonist.\n"
    "- Causal continuity: respect recorded facts, location, inventory, "
    "relationships and witness knowledge; do not invent retroactive access "
    "to secrets or instantly grant abilities and resources.\n"
    "- Concrete progression: each response should change or clarify the "
    "situation through an observable consequence, discovery, decision or "
    "credible NPC action. Avoid circular reactions and filler recaps.\n"
    "- Fair play: setbacks follow the established fiction and available "
    "evidence, not arbitrary punishment. Allow meaningful, feasible options "
    "without presenting a forced choice or deciding for the player."
)

MODE = {
    "say": (
        "The player's text is a spoken statement, not a guarantee that "
        "its claims are true. Let listeners react according to their "
        "knowledge, personality, goals and relationship to the speaker."
    ),
    "do": (
        "The player's text describes an attempted action, not automatic "
        "success. Resolve what actually happens based on feasibility, "
        "established world rules and competing NPC actions; never silently "
        "replace the player's intended action with a different choice."
    ),
    "story": (
        "The player's text suggests narrative direction. Weave it into "
        "the scene where consistent with confirmed canon, and preserve "
        "established NPC motivations and causal limits rather than "
        "rewriting world facts without acknowledgment."
    ),
    "continue": (
        "Advance the established scene through an independent NPC "
        "initiative, environmental development or concrete complication. "
        "Do not repeat the last paragraph or decide the protagonist's "
        "next action."
    ),
}


FREEDOM_MODES = {
    "guided": (
        "Story freedom: GUIDED. Keep the narrative close to the creator's "
        "established dramatic arc and intended conflicts. Offer consequential "
        "choices inside that arc, and let NPCs resist or redirect plans when "
        "their established goals demand it. Do not force a single player action."
    ),
    "flexible": (
        "Story freedom: FLEXIBLE. Accept plausible player-led detours and "
        "creative problem solving without erasing established canon, witness "
        "knowledge, location or inventory. NPCs remain independently motivated."
    ),
    "strict": (
        "Story freedom: STRICT. Treat confirmed canon, physics, established "
        "NPC motives and limited resources as firm boundaries. Decline "
        "impossible outcomes within the story, explain concrete obstacles "
        "through in-world consequences, and preserve meaningful choices."
    ),
}


def agency_directives(mode: str, recent_turns: list[dict],
                      freedom_mode: str = "flexible") -> str:
    """Return bounded, consistent agency guidance for all supported modes.

    The guidance is always English internal API context; the user's selected
    output language is controlled by a separate preference.
    """
    if mode not in MODE:
        raise ValueError("Unsupported narrative mode")
    if freedom_mode not in FREEDOM_MODES:
        raise ValueError("Unsupported story freedom mode")
    directives = [COMMON, FREEDOM_MODES[freedom_mode],
                  "Current interaction: " + MODE[mode]]
    if len(recent_turns) >= 2 and all(
        item.get("mode") == "continue" for item in recent_turns[-2:]):
        directives.append(
            "Pacing: the player has continued multiple times without a new "
            "action. Advance an unresolved event or consequential NPC move "
            "now, without assuming a protagonist decision."
        )
    return "\n".join(directives)
