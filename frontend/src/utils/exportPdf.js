import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const BG = '#080B14';
const FG = '#E5ECF4';
const DIM = '#8A97AA';
const CYAN = '#4FC3F7';

const VERDICT_COLOR = {
  GENUINE:    '#4CAF50',
  SUSPICIOUS: '#F57F17',
  FORGED:     '#C62828',
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  return {
    r: (num >> 16) & 0xFF,
    g: (num >> 8) & 0xFF,
    b: num & 0xFF,
  };
}

function setFill(doc, hex) {
  const { r, g, b } = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setText(doc, hex) {
  const { r, g, b } = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function setDraw(doc, hex) {
  const { r, g, b } = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function fillPage(doc) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  setFill(doc, BG);
  doc.rect(0, 0, w, h, 'F');
}

function safeFilename(raw) {
  const base = (raw || 'document').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_\-]+/g, '_').slice(0, 64);
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
  return `FORENSIQ_${base}_${stamp}.pdf`;
}

async function captureHeatmap() {
  const el = document.getElementById('forensics-viewer-root');
  if (!el) return null;
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: BG,
      useCORS: true,
      allowTaint: true,
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      logging: false,
    });
    return canvas.toDataURL('image/png');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('html2canvas capture failed', err);
    return null;
  }
}

function drawHeader(doc, y, result) {
  const w = doc.internal.pageSize.getWidth();
  setText(doc, CYAN);
  doc.setFont('courier', 'bold');
  doc.setFontSize(22);
  doc.text('FORENSIQ', 40, y);
  setText(doc, FG);
  doc.setFontSize(11);
  doc.setFont('courier', 'normal');
  doc.text('FORENSIC ANALYSIS REPORT', 40, y + 18);
  setText(doc, DIM);
  doc.setFontSize(9);
  doc.text(new Date().toLocaleString(), w - 40, y, { align: 'right' });
  doc.text(result?.filename || 'document', w - 40, y + 12, { align: 'right' });
  // divider
  setDraw(doc, '#1f2a3a');
  doc.setLineWidth(0.5);
  doc.line(40, y + 28, w - 40, y + 28);
  return y + 42;
}

function drawVerdictBlock(doc, y, result) {
  const w = doc.internal.pageSize.getWidth();
  const verdict = result?.verdict || 'UNKNOWN';
  const color = VERDICT_COLOR[verdict] || CYAN;
  setFill(doc, '#0F1522');
  setDraw(doc, color);
  doc.setLineWidth(1.2);
  doc.roundedRect(40, y, w - 80, 110, 8, 8, 'FD');

  setText(doc, DIM);
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.text('VERDICT', 58, y + 22);

  setText(doc, color);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  doc.text(verdict, 58, y + 60);

  setText(doc, FG);
  doc.setFont('courier', 'normal');
  doc.setFontSize(11);
  const conf = result?.confidence != null ? `${(result.confidence * 100).toFixed(1)}%` : '—';
  doc.text(`CONFIDENCE ${conf}`, w - 58, y + 60, { align: 'right' });

  setText(doc, DIM);
  doc.setFontSize(10);
  const reason = result?.reason || '—';
  const reasonLines = doc.splitTextToSize(`> ${reason}`, w - 120);
  doc.text(reasonLines, 58, y + 82);

  return y + 124;
}

function drawSignalTable(doc, y, result) {
  const w = doc.internal.pageSize.getWidth();
  setText(doc, CYAN);
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.text('SIGNAL BREAKDOWN', 40, y);
  y += 14;

  const cols = [
    { key: 'signal',     label: 'SIGNAL',     x: 40,  w: 110 },
    { key: 'score',      label: 'SCORE',      x: 160, w: 70 },
    { key: 'confidence', label: 'CONFIDENCE', x: 240, w: 90 },
    { key: 'status',     label: 'STATUS',     x: 340, w: 120 },
  ];

  // header
  setDraw(doc, '#1f2a3a');
  setFill(doc, '#0B1220');
  doc.setLineWidth(0.4);
  doc.rect(40, y - 10, w - 80, 18, 'FD');
  setText(doc, DIM);
  doc.setFontSize(8);
  doc.setFont('courier', 'bold');
  for (const c of cols) doc.text(c.label, c.x + 6, y + 2);
  y += 12;

  const signalLabels = {
    ela:      'ELA',
    cnn:      'CNN',
    font:     'FONT',
    metadata: 'METADATA',
  };
  const order = ['ela', 'cnn', 'font', 'metadata'];
  const signals = result?.signals || {};

  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  for (const key of order) {
    const sig = signals[key];
    const score = sig ? `${(sig.score * 100).toFixed(0)} / 100` : '—';
    const confidence = sig ? `${Math.round((sig.confidence || 0) * 100)} %` : '—';
    const rawScore = sig?.score || 0;
    let status = 'CLEAN';
    let statusColor = '#4CAF50';
    if (rawScore >= 0.7) { status = 'FORGED';  statusColor = '#C62828'; }
    else if (rawScore >= 0.4) { status = 'FLAGGED'; statusColor = '#F57F17'; }

    setDraw(doc, '#1f2a3a');
    doc.setLineWidth(0.3);
    doc.line(40, y + 4, w - 40, y + 4);

    setText(doc, FG);
    doc.text(signalLabels[key] || key.toUpperCase(), cols[0].x + 6, y);
    doc.text(score, cols[1].x + 6, y);
    doc.text(confidence, cols[2].x + 6, y);
    setText(doc, statusColor);
    doc.text(status, cols[3].x + 6, y);
    y += 14;
  }
  return y + 6;
}

function drawBoundingBoxes(doc, y, result) {
  const boxes = result?.bounding_boxes || result?.pages?.[0]?.bounding_boxes || [];
  if (!boxes.length) return y;
  const w = doc.internal.pageSize.getWidth();
  setText(doc, CYAN);
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.text('FORGERY LOCALIZATION', 40, y);
  y += 14;
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  for (const b of boxes.slice(0, 3)) {
    setText(doc, '#FF8A80');
    const label = (b.label || 'Region').toUpperCase();
    doc.text(label, 48, y);
    setText(doc, FG);
    const conf = `${Math.round((b.confidence || 0) * 100)}%`;
    doc.text(conf, 160, y);
    setText(doc, DIM);
    doc.text(`x=${b.x} y=${b.y} w=${b.width} h=${b.height}`, 210, y);
    y += 13;
  }
  return y + 6;
}

async function drawHeatmap(doc, y, heatmapDataUrl) {
  const w = doc.internal.pageSize.getWidth();
  if (!heatmapDataUrl) return y;
  setText(doc, CYAN);
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.text('FORENSICS VIEWER SNAPSHOT', 40, y);
  y += 12;
  const img = new Image();
  await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; img.src = heatmapDataUrl; });
  const targetW = w - 80;
  const ratio = img.height && img.width ? (img.height / img.width) : 0.6;
  const targetH = Math.min(300, targetW * ratio);
  try {
    doc.addImage(heatmapDataUrl, 'PNG', 40, y, targetW, targetH, undefined, 'FAST');
  } catch (err) { /* ignore */ }
  setDraw(doc, '#1f2a3a');
  doc.setLineWidth(0.4);
  doc.rect(40, y, targetW, targetH);
  return y + targetH + 12;
}

// ASCII-only sanitizer: jsPDF's default Courier is WinAnsi-only and will
// turn Tamil / Devanagari / Telugu / etc. code points into mojibake
// (e.g. "° ¿ ² ¾ • Í"). Gemini is instructed to return ASCII, but we
// double-filter here so any accidental smart-quote or em-dash is safe too.
function toAsciiSafe(text) {
  if (!text) return '';
  const replacements = {
    '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"',
    '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u00A0': ' ',
    '\u2022': '*', '\u00B7': '*',
  };
  let out = '';
  for (const ch of text.normalize('NFKD')) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) { out += ch; continue; }
    if (replacements[ch]) { out += replacements[ch]; continue; }
    // Drop combining marks (category M*).
    if (cp >= 0x0300 && cp <= 0x036F) continue;
    // Keep only Latin-1 printable.
    if (cp < 0x100) { out += ch; }
    // else: dropped.
  }
  return out;
}

// Shared section renderer: header bar + body block, with correct
// multi-page handling. Keeps the header attached to the first page of
// its body, and splits long bodies across pages so each page shows a
// proper "(continued)" chunk instead of leaving orphan headers behind.
function drawSection(doc, y, title, body) {
  const w = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = w - margin * 2;
  const lineH = 12;
  const headerH = 14;
  const topGap = 20;      // space between header bar and body top
  const footerReserve = 60;

  setText(doc, '#C8D2DC');
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  const allLines = doc.splitTextToSize(body || '', contentW - 12);
  if (allLines.length === 0) return y;

  // If the header plus at least four body lines won't fit, start this
  // section on a fresh page so we never strand a lone header.
  const minFirstPageH = headerH + topGap + lineH * 4 + 12;
  if (y + minFirstPageH > pageH - footerReserve) {
    doc.addPage();
    fillPage(doc);
    y = 60;
  }

  // How many body lines can fit on the CURRENT page alongside the header?
  const spaceForBody = pageH - footerReserve - (y + topGap);
  const linesThisPage = Math.max(
    4,
    Math.floor((spaceForBody - 12) / lineH),
  );
  const firstChunk = allLines.slice(0, linesThisPage);
  const rest = allLines.slice(linesThisPage);

  // Draw header bar.
  setFill(doc, '#0F1522');
  setDraw(doc, '#1f2a3a');
  doc.setLineWidth(0.4);
  doc.rect(margin, y - 2, contentW, headerH, 'FD');
  setText(doc, CYAN);
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.text(title, margin + 6, y + 8);
  y += topGap;

  // Draw first body chunk.
  setText(doc, '#C8D2DC');
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  const firstBlockH = firstChunk.length * lineH + 12;
  setFill(doc, '#080B14');
  setDraw(doc, '#1f2a3a');
  doc.setLineWidth(0.3);
  doc.rect(margin, y - 4, contentW, firstBlockH, 'FD');
  firstChunk.forEach((line, idx) => {
    doc.text(line, margin + 6, y + 4 + idx * lineH);
  });
  y += firstBlockH + 10;

  // Continuation pages, if body was longer than one page.
  let remaining = rest;
  while (remaining.length > 0) {
    doc.addPage();
    fillPage(doc);
    y = 60;

    // Continuation header
    setFill(doc, '#0F1522');
    setDraw(doc, '#1f2a3a');
    doc.setLineWidth(0.4);
    doc.rect(margin, y - 2, contentW, headerH, 'FD');
    setText(doc, CYAN);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.text(`${title} (CONTINUED)`, margin + 6, y + 8);
    y += topGap;

    const availH = pageH - footerReserve - y;
    const linesFit = Math.max(1, Math.floor((availH - 12) / lineH));
    const chunk = remaining.slice(0, linesFit);
    remaining = remaining.slice(linesFit);

    const blockH = chunk.length * lineH + 12;
    setText(doc, '#C8D2DC');
    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    setFill(doc, '#080B14');
    setDraw(doc, '#1f2a3a');
    doc.setLineWidth(0.3);
    doc.rect(margin, y - 4, contentW, blockH, 'FD');
    chunk.forEach((line, idx) => {
      doc.text(line, margin + 6, y + 4 + idx * lineH);
    });
    y += blockH + 10;
  }

  return y;
}

function drawOcr(doc, y, result, ocrInsights) {
  const rl = result?.regional_language;
  if (!rl) return y;
  const rawText = rl.ocr_text || '';
  const hasInsights = !!(ocrInsights && ocrInsights.trim());
  if (!rawText.trim() && !hasInsights) return y;

  const body = hasInsights
    ? toAsciiSafe(ocrInsights)
    : toAsciiSafe(
        `LANGUAGE: ${rl.language_name || rl.script || 'Unknown'} (script: ${rl.script || 'english'})\n` +
        `CONFIDENCE: ${Math.round((rl.confidence || 0) * 100)}%\n\n` +
        'AI OCR analysis unavailable. Raw extraction contained non-Latin text ' +
        'that cannot be rendered in the PDF; view the Regional Forensics tab ' +
        'in the browser for the original extraction.'
      );

  return drawSection(doc, y, 'OCR ANALYSIS', body);
}

function drawFooter(doc, result) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const conf = result?.confidence != null ? `${(result.confidence * 100).toFixed(1)}%` : '—';
  setDraw(doc, '#1f2a3a');
  doc.setLineWidth(0.4);
  doc.line(40, h - 44, w - 40, h - 44);
  setText(doc, DIM);
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.text(
    `Generated by FORENSIQ · Confidence: ${conf} · This report is for verification purposes only`,
    w / 2,
    h - 28,
    { align: 'center' },
  );
}

function ensureRoom(doc, y, needed) {
  const h = doc.internal.pageSize.getHeight();
  if (y + needed > h - 60) {
    doc.addPage();
    fillPage(doc);
    return 60;
  }
  return y;
}

export async function exportReportPdf(result) {
  if (!result) return null;

  // ── FIX 5: Gemini AI enrichment (PDF only — never shown in UI) ───────
  // Two parallel passes:
  //   /enrich       — 3-paragraph forensic summary of the verdict
  //   /enrich/ocr   — ASCII-safe insights on the OCR extraction
  //                   (language ID, transliteration, translation,
  //                    observations) so the PDF never dumps raw
  //                    non-Latin Unicode into jsPDF's WinAnsi font.
  let enrichmentText = 'AI enrichment unavailable.';
  let ocrInsights = '';
  try {
    const [enrichRes, ocrRes] = await Promise.all([
      fetch('http://localhost:8000/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      }),
      fetch('http://localhost:8000/enrich/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      }),
    ]);
    if (enrichRes && enrichRes.ok) {
      const enrichData = await enrichRes.json();
      enrichmentText = enrichData.enrichment || enrichmentText;
    }
    if (ocrRes && ocrRes.ok) {
      const ocrData = await ocrRes.json();
      ocrInsights = ocrData.enrichment || '';
    }
  } catch (_) {
    // Backend offline or network error — silently use fallbacks.
  }
  enrichmentText = toAsciiSafe(enrichmentText);
  // ─────────────────────────────────────────────────────────────────────

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  fillPage(doc);

  let y = 50;
  y = drawHeader(doc, y, result);
  y = ensureRoom(doc, y, 140);
  y = drawVerdictBlock(doc, y, result);
  y = ensureRoom(doc, y, 120);
  y = drawSignalTable(doc, y, result);

  // Heatmap snapshot — capture the Forensics Viewer DOM.
  const heatmap = await captureHeatmap();
  if (heatmap) {
    y = ensureRoom(doc, y, 320);
    y = await drawHeatmap(doc, y, heatmap);
  }

  const boxes = result?.bounding_boxes || result?.pages?.[0]?.bounding_boxes || [];
  if (boxes.length) {
    y = ensureRoom(doc, y, 80);
    y = drawBoundingBoxes(doc, y, result);
  }

  const ocrText = result?.regional_language?.ocr_text || '';
  if (ocrText.trim() || ocrInsights.trim()) {
    y = drawOcr(doc, y, result, ocrInsights);
  }

  // ── FIX 5: AI Forensic Enrichment section ───────────────────────────
  // drawSection handles its own header+body page-break so the header
  // can never get stranded on a page with no content below it, and
  // long enrichments cleanly span multiple pages with "(CONTINUED)"
  // headers.
  y = drawSection(doc, y, 'AI FORENSIC ENRICHMENT', enrichmentText);
  // ─────────────────────────────────────────────────────────────────────

  // Footer is drawn on whatever page we ended on — if drawSection
  // added pages, the final one gets the footer.
  drawFooter(doc, result);

  const filename = safeFilename(result.filename);
  doc.save(filename);
  return filename;
}
