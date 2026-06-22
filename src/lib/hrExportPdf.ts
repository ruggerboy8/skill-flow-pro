// Builds the single-PDF HR offboarding record from a StaffRecord (jsPDF, client-side).
// Returns a jsPDF doc; callers use .output("blob") to preview or .output("datauristring") to send.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { StaffRecord } from "./hrExport";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export function buildRecordPdf(rec: StaffRecord): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const M = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - M * 2;
  let y = M;

  const ensure = (h: number) => { if (y + h > pageH - M) { doc.addPage(); y = M; } };

  const para = (str: string, opts: { size?: number; bold?: boolean; gray?: number } = {}) => {
    const size = opts.size ?? 11;
    doc.setFontSize(size);
    doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    doc.setTextColor(opts.gray ?? 30);
    const lines = doc.splitTextToSize(str && str.trim() ? str : "—", maxW) as string[];
    const lh = size * 1.35;
    for (const line of lines) { ensure(lh); doc.text(line, M, y); y += lh; }
  };

  const heading = (str: string) => {
    y += 12; ensure(22);
    doc.setFontSize(15); doc.setFont("helvetica", "bold"); doc.setTextColor(20);
    doc.text(str, M, y); y += 20;
  };

  const italic = (str: string) => {
    doc.setFontSize(11); doc.setFont("helvetica", "italic"); doc.setTextColor(120);
    ensure(16); doc.text(str, M, y); y += 16;
    doc.setFont("helvetica", "normal");
  };

  // Header
  doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.setTextColor(20);
  doc.text(rec.name, M, y); y += 26;
  para("Staff development record", { size: 12, gray: 110 });
  y += 4;
  para(`Role: ${rec.role || "—"}     Location: ${rec.location || "—"}`, { size: 10, gray: 90 });
  para(`Hire date: ${fmtDate(rec.hireDate)}     Record generated: ${fmtDate(rec.exportedAt)}`, { size: 10, gray: 90 });

  // Participation
  heading("Pro Move participation");
  const p = rec.participation;
  if (p.weeksWithActivity === 0 && p.confidenceSubmitted === 0 && p.performanceSubmitted === 0) {
    italic("No participation on record.");
  } else {
    para(`Weeks with activity: ${p.weeksWithActivity}`);
    para(`Confidence check-ins submitted: ${p.confidenceSubmitted}`);
    para(`Performance check-outs submitted: ${p.performanceSubmitted}`);
    para(`Late submissions: ${p.lateSubmissions}`);
    para(`Active from ${fmtDate(p.firstDate)} to ${fmtDate(p.lastDate)}`);
  }

  // Evaluations
  heading("Evaluations & feedback");
  if (rec.evaluations.length === 0) {
    italic("No evaluations on record.");
  } else {
    rec.evaluations.forEach((ev, idx) => {
      const title = [ev.type || "Evaluation", ev.quarter, ev.programYear].filter(Boolean).join(" · ");
      y += 8; ensure(18);
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(20);
      doc.text(title || "Evaluation", M, y); y += 16;
      para(`Observed ${fmtDate(ev.observedAt)}`, { size: 10, gray: 110 });

      if (ev.summaryFeedback) {
        para("Feedback", { bold: true });
        para(ev.summaryFeedback);
      }

      const scored = ev.items.filter((it) => it.observerScore != null || it.selfScore != null);
      if (scored.length) {
        para("Self-reported vs evaluation", { bold: true });
        autoTable(doc, {
          startY: y + 2,
          margin: { left: M, right: M },
          head: [["Competency", "Self", "Coach"]],
          body: scored.map((it) => [
            it.competency,
            it.selfScore != null ? String(it.selfScore) : "—",
            it.observerScore != null ? String(it.observerScore) : "—",
          ]),
          styles: { fontSize: 10, cellPadding: 4 },
          headStyles: { fillColor: [240, 240, 240], textColor: 40 },
          columnStyles: { 1: { halign: "center", cellWidth: 50 }, 2: { halign: "center", cellWidth: 50 } },
          theme: "grid",
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      }

      if (ev.transcript) {
        para("Transcript", { bold: true });
        para(ev.transcript, { size: 10, gray: 80 });
      }

      if (idx < rec.evaluations.length - 1) y += 6;
    });
  }

  return doc;
}

export function recordFilename(rec: StaffRecord): string {
  const safe = rec.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "staff";
  return `staff-record-${safe}.pdf`;
}
