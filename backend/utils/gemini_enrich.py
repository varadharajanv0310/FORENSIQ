"""Gemini AI enrichment for FORENSIQ PDF export.

Generates formal forensic report addenda via the Google Gemini API.
These texts are intended ONLY for inclusion in the exported PDF — they
are never surfaced in the browser UI.

Two enrichment passes are available:

* ``enrich_verdict`` — 3-paragraph forensic summary of the ensemble
  verdict + signal scores.
* ``enrich_ocr`` — analyses the extracted OCR text (including non-Latin
  scripts like Tamil / Devanagari) and returns ASCII-safe insights:
  language identification, Roman transliteration, English translation,
  and forensic observations. This is what the PDF should render instead
  of dumping raw Unicode (jsPDF's default fonts are WinAnsi only and
  would mangle Tamil / Hindi / Telugu / etc. into mojibake).

Uses the new ``google-genai`` SDK (not the deprecated
``google-generativeai``) because Gemini 2.5 Flash turns on "thinking"
mode by default, and thinking tokens count against ``max_output_tokens``
in the old SDK — silently eating the entire budget and leaving nothing
for the actual response (observed: 1150 thinking tokens, 46 output tokens,
``finish_reason=MAX_TOKENS``). The new SDK exposes a ``ThinkingConfig``
that lets us set ``thinking_budget=0`` to disable thinking entirely,
which recovers the full output budget for response generation.

The API key is read from the GEMINI_API_KEY environment variable (set
in backend/.env and loaded by main.py via python-dotenv). If the key
is absent or the SDK is not installed, a graceful fallback string is
returned so PDF export always completes.
"""
from __future__ import annotations

import logging
import os
import unicodedata

log = logging.getLogger(__name__)

try:
    from google import genai as _genai_new  # type: ignore
    from google.genai import types as _genai_types  # type: ignore
    GENAI_AVAILABLE = True
except ImportError:
    _genai_new = None
    _genai_types = None
    GENAI_AVAILABLE = False

_client = None


def _get_client():
    """Build and cache the genai Client on first use."""
    global _client
    if _client is not None:
        return _client
    if not GENAI_AVAILABLE:
        return None
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        return None
    try:
        _client = _genai_new.Client(api_key=key)
    except Exception as exc:  # noqa: BLE001
        log.warning("Gemini client init failed: %s", exc)
        return None
    return _client


def _gen_config(max_tokens: int, temperature: float = 0.3):
    """Build a GenerateContentConfig with thinking explicitly disabled.

    Thinking is Gemini 2.5 Flash's default reasoning mode and its tokens
    count against the output budget. Setting thinking_budget=0 disables
    it so the full budget is available for the response. This is safe
    for straightforward report-generation tasks that don't need
    multi-step reasoning."""
    return _genai_types.GenerateContentConfig(
        max_output_tokens=max_tokens,
        temperature=temperature,
        thinking_config=_genai_types.ThinkingConfig(thinking_budget=0),
    )


def _to_ascii_safe(text: str) -> str:
    """Collapse any stray non-ASCII into a WinAnsi-safe string so jsPDF's
    default Courier font renders cleanly. Gemini is instructed to return
    ASCII only, but this defensive pass catches smart-quotes / em-dashes /
    accidental Unicode leaks."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text)
    out_chars = []
    for ch in nfkd:
        cp = ord(ch)
        if cp < 0x80:  # pure ASCII
            out_chars.append(ch)
            continue
        replacement = {
            "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"',
            "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00A0": " ",
            "\u2022": "*", "\u00B7": "*",
        }.get(ch)
        if replacement is not None:
            out_chars.append(replacement)
            continue
        if unicodedata.category(ch).startswith("M"):
            continue  # combining mark
        if cp < 0x100:
            out_chars.append(ch)
    return "".join(out_chars).strip()


def enrich_verdict(result: dict) -> str:
    """Generate a detailed forensic report addendum via Gemini 2.5 Flash.

    Returns a plain-text string of ~3 paragraphs (~350-500 words). Never
    raises — on any failure a descriptive fallback string is returned so
    PDF export still works.
    """
    client = _get_client()
    if not GENAI_AVAILABLE:
        return (
            "AI enrichment unavailable - google-genai package is not installed. "
            "Install with: pip install google-genai"
        )
    if client is None:
        return "AI enrichment unavailable - GEMINI_API_KEY not set in environment."

    try:
        signals = result.get("signals") or {}
        lines = []
        for sig_key, sig in signals.items():
            if not isinstance(sig, dict):
                continue
            score_pct = round((sig.get("score") or 0) * 100, 1)
            conf_pct = round((sig.get("confidence") or 0) * 100, 1)
            lines.append(f"  {sig_key.upper()}: score={score_pct}% confidence={conf_pct}%")
        signal_summary = "\n".join(lines) if lines else "  No signal data available."

        # Collect richer evidence so Gemini has something substantive to
        # analyse instead of just restating the verdict.
        weights = result.get("weights_used") or {}
        weight_summary = ", ".join(f"{k}={v:.2f}" for k, v in weights.items()) or "—"
        rl = result.get("regional_language") or {}
        lang_ctx = ""
        if rl.get("ocr_text"):
            lang_ctx = (
                f"\nOCR script: {rl.get('script', 'unknown')} "
                f"(language: {rl.get('language_name', 'unknown')}), "
                f"{rl.get('glyph_count', 0)} glyphs, "
                f"{len(rl.get('flagged_characters') or [])} flagged for metric drift."
            )
        metadata_sig = signals.get("metadata") or {}
        anomalies = metadata_sig.get("anomalies") or []
        anomaly_summary = ("; ".join(str(a) for a in anomalies[:5])) if anomalies else "none"
        boxes = result.get("bounding_boxes") or []
        box_summary = (
            f"{len(boxes)} localized region(s) identified by GradCAM"
            if boxes else "no localized forgery regions"
        )

        prompt = (
            "You are a senior forensic document examiner writing the analytical "
            "narrative for an official report. Based on the automated analysis "
            "data below, write exactly three paragraphs of formal, third-person "
            "forensic prose. Be specific: reference the actual numbers, name "
            "the signals, and draw insight - do NOT simply restate the verdict.\n\n"
            "CONSTRAINTS:\n"
            "- Respond in ENGLISH only, plain ASCII characters only.\n"
            "- No bullet points, no markdown, no headings. Pure prose.\n"
            "- Three paragraphs. Aim for 350-500 words total.\n"
            "- Third person, past tense. Never address the reader directly.\n\n"
            f"DOCUMENT: {result.get('filename', 'Unknown')}\n"
            f"SESSION: {result.get('session_id', '-')}\n"
            f"VERDICT: {result.get('verdict', 'Unknown')}\n"
            f"ENSEMBLE CONFIDENCE: {round((result.get('confidence') or 0) * 100, 1)}%\n"
            f"AUTOMATED REASON: {result.get('reason', 'Not available')}\n"
            f"ENSEMBLE WEIGHTS: {weight_summary}\n"
            f"SIGNAL SCORES:\n{signal_summary}\n"
            f"METADATA ANOMALIES: {anomaly_summary}\n"
            f"GRADCAM LOCALIZATION: {box_summary}"
            f"{lang_ctx}\n\n"
            "PARAGRAPH 1 - CONTEXTUAL INTERPRETATION:\n"
            "Explain what the stated verdict means in the context of document "
            "forensics and what the ensemble confidence level quantitatively "
            "indicates about the reliability of this finding. Reference the "
            "specific confidence percentage. If the confidence is low, explain "
            "which signals disagreed.\n\n"
            "PARAGRAPH 2 - SIGNAL-LEVEL ANALYSIS:\n"
            "Name the signals that most strongly drove the verdict using their "
            "actual score values. Explain the forensic significance of each "
            "flagged signal: ELA residuals indicate re-compression artefacts "
            "characteristic of regional edits; CNN score reflects learned "
            "forgery patterns from the training distribution; font inconsistency "
            "suggests heterogeneous glyph sources being stitched together; "
            "metadata anomalies indicate post-creation modification such as "
            "editor traces or timestamp inconsistencies. Cite at least two "
            "specific numeric values from the signal scores.\n\n"
            "PARAGRAPH 3 - RECOMMENDED ACTION:\n"
            "State the recommended next steps for a document reviewer or "
            "investigator based on this specific combination of signals and "
            "verdict. Mention whether manual examination is required, whether "
            "the document can be auto-approved, or whether it should be "
            "rejected outright. Reference the GradCAM localization and any "
            "flagged regions in the recommendation."
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=_gen_config(max_tokens=2500, temperature=0.3),
        )
        text = (response.text or "").strip()
        if not text:
            text = "AI analysis returned an empty response."
        return _to_ascii_safe(text)

    except Exception as exc:  # noqa: BLE001
        log.warning("Gemini enrichment failed: %s", exc)
        return f"AI enrichment unavailable - {exc}"


def enrich_ocr(result: dict) -> str:
    """Analyse the OCR extraction via Gemini and return ASCII-safe insights.

    The PDF exporter renders the returned string directly. Gemini is asked
    to provide: language identification, Roman transliteration (for
    non-Latin text), English translation, and forensic observations. All
    output is coerced to ASCII so jsPDF's default Courier font renders it
    cleanly. Never raises — returns a descriptive fallback on any failure.
    """
    rl = (result or {}).get("regional_language") or {}
    ocr_text = (rl.get("ocr_text") or "").strip()
    script = rl.get("script") or "english"
    language_name = rl.get("language_name") or script.title()
    confidence = float(rl.get("confidence") or 0.0)
    glyph_count = int(rl.get("glyph_count") or 0)
    flagged_count = len(rl.get("flagged_characters") or [])
    lines = rl.get("ocr_lines") or []

    header = (
        f"LANGUAGE: {language_name} (script: {script})\n"
        f"CONFIDENCE: {confidence*100:.1f}%\n"
        f"GLYPHS: {glyph_count} | FLAGGED: {flagged_count} | LINES: {len(lines)}"
    )

    if not ocr_text:
        return _to_ascii_safe(
            header + "\n\nNo text was extracted from the document."
        )

    client = _get_client()
    if not GENAI_AVAILABLE:
        return _to_ascii_safe(
            header + "\n\nAI OCR analysis unavailable - google-genai package "
            "not installed."
        )
    if client is None:
        return _to_ascii_safe(
            header + "\n\nAI OCR analysis unavailable - GEMINI_API_KEY not set."
        )

    # Cap the raw text so the prompt stays bounded.
    raw = ocr_text[:3000]

    try:
        prompt = (
            "You are a multilingual forensic document examiner. Below is text "
            "extracted from a scanned document via OCR. Produce a thorough "
            "four-section analysis.\n\n"
            "CONSTRAINTS:\n"
            "- Respond in ENGLISH only.\n"
            "- Use only plain ASCII characters (no smart quotes, no em-dashes, "
            "no accented letters, no original-script characters).\n"
            "- Do not use markdown formatting. Use plain line-prefix labels.\n"
            "- Every section MUST appear with a full response. Do not skip "
            "sections or leave them empty.\n"
            "- Aim for 300-450 words total across all four sections.\n\n"
            f"DOCUMENT METADATA:\n"
            f"  Detected language: {language_name}\n"
            f"  Detected script: {script}\n"
            f"  OCR confidence: {confidence*100:.1f}%\n"
            f"  Total glyphs: {glyph_count}, flagged for metric drift: {flagged_count}\n"
            f"  Total lines: {len(lines)}\n\n"
            f"EXTRACTED TEXT (raw, may contain OCR noise):\n{raw}\n\n"
            "Produce exactly these four labelled sections in this order. Write "
            "2-4 sentences per section. Be specific about what you actually see "
            "in the extracted text; do NOT produce generic boilerplate.\n\n"
            "LANGUAGE:\n"
            "Confirm or correct the detected language and script. Note any "
            "mixed-script evidence (Latin letters, digits, punctuation, "
            "hashtags, URLs, emails, etc.) appearing alongside the primary "
            "script. If the text is ambiguous, explain what makes it so.\n\n"
            "TRANSLITERATION:\n"
            "Provide a Roman-alphabet transliteration of the extracted text "
            "(up to approximately 80 words). If the text is already in Latin "
            "script, write 'Already in Latin script - no transliteration "
            "required.' and briefly characterise the content instead.\n\n"
            "TRANSLATION:\n"
            "Provide a concise English translation or paraphrase capturing "
            "what the document appears to communicate. Aim for 2-4 sentences. "
            "If portions are unintelligible due to OCR noise, note which "
            "portions and translate what remains. If the text is a poem, "
            "slogan, social media post, form field, or official document, "
            "identify the genre.\n\n"
            "OBSERVATIONS:\n"
            "Provide three distinct forensic observations. Candidates include: "
            "heterogeneous glyph sources indicating font mixing; Western Arabic "
            "digits embedded in Indic script (common in modern documents); "
            "social-media handles (@user), hashtags (#tag), or URLs indicating "
            "the text's provenance; apparent OCR errors versus genuine forgery "
            "artefacts; unusual spacing or alignment; visible dates, names, or "
            "identifiers; evidence of watermarks or overlay text. Each "
            "observation should be one to two sentences."
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=_gen_config(max_tokens=2000, temperature=0.2),
        )
        body = (response.text or "").strip()
        if not body:
            body = "AI analysis returned an empty response."
        return _to_ascii_safe(header + "\n\n" + body)

    except Exception as exc:  # noqa: BLE001
        log.warning("Gemini OCR enrichment failed: %s", exc)
        return _to_ascii_safe(header + f"\n\nAI OCR analysis failed - {exc}")
