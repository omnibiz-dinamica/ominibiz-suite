import { jsPDF } from "jspdf";

export function generateContractPDF(opts: {
  title: string;
  body: string;
  signature?: { name: string; signedAt: string; ip?: string; hash?: string; image?: string };
}): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - margin * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(opts.title, margin, margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  let y = margin + 28;
  const lineH = 16;

  const paragraphs = opts.body.split(/\n/);
  for (const raw of paragraphs) {
    const isH1 = raw.startsWith("# ");
    const isH2 = raw.startsWith("## ");
    let text = raw.replace(/^#+\s*/, "").replace(/\*\*(.*?)\*\*/g, "$1");
    if (text.trim() === "---") {
      doc.setDrawColor(200);
      doc.line(margin, y, pageW - margin, y);
      y += lineH;
      continue;
    }
    if (isH1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
    } else if (isH2) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
    }
    const lines = doc.splitTextToSize(text || " ", usableW);
    for (const ln of lines) {
      if (y > pageH - margin - 60) {
        doc.addPage();
        y = margin;
      }
      doc.text(ln, margin, y);
      y += lineH;
    }
    if (isH1 || isH2) y += 4;
  }

  if (opts.signature) {
    if (y > pageH - margin - 180) {
      doc.addPage();
      y = margin;
    }
    y += 24;
    doc.setDrawColor(180);
    doc.line(margin, y, pageW - margin, y);
    y += 22;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Assinatura digital", margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Signatário: ${opts.signature.name}`, margin, y); y += lineH;
    doc.text(`Data: ${opts.signature.signedAt}`, margin, y); y += lineH;
    if (opts.signature.ip) { doc.text(`IP: ${opts.signature.ip}`, margin, y); y += lineH; }
    if (opts.signature.hash) {
      const h = doc.splitTextToSize(`Hash: ${opts.signature.hash}`, usableW);
      for (const ln of h) { doc.text(ln, margin, y); y += lineH; }
    }
    if (opts.signature.image) {
      try { doc.addImage(opts.signature.image, "PNG", margin, y, 200, 80); } catch { /* noop */ }
    }
  }

  return doc.output("blob");
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}