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

function drawOcr(doc, y, result) {
  const rl = result?.regional_language;
  if (!rl) return y;
  const ocrText = rl.ocr_text || '';
  if (!ocrText.trim()) return y;
  const w = doc.internal.pageSize.getWidth();
  setText(doc, CYAN);
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.text('OCR EXTRACT', 40, y);
  y += 12;
  setText(doc, DIM);
  doc.setFontSize(8);
  doc.text(`Script: ${rl.script || 'english'} · confidence ${Math.round((rl.confidence || 0) * 100)}%`, 40, y);
  y += 12;
  setText(doc, FG);
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(ocrText.slice(0, 2000), w - 80);
  doc.text(lines, 40, y);
  y += lines.length * 10 + 8;
  return y;
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
  if (ocrText.trim()) {
    y = ensureRoom(doc, y, 120);
    y = drawOcr(doc, y, result);
  }

  drawFooter(doc, result);

  const filename = safeFilename(result.filename);
  doc.save(filename);
  return filename;
}
