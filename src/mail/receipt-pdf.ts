import PDFDocument from 'pdfkit';

export type ReceiptLine = {
  label: string;
  amount: number;
  hint?: string;
};

export type ReceiptData = {
  kind: 'purchase' | 'refund';
  reference: string;
  title: string;
  buyerName: string;
  buyerEmail: string;
  paidAt: string;
  paymentRef: string;
  channel: 'catalog' | 'sourcing';
  productName: string;
  quantity: number;
  lines: ReceiptLine[];
  total: number;
  note?: string;
};

function formatNaira(amount: number) {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`;
}

/** Build a branded ConnectPort PDF receipt (base64). */
export async function buildReceiptPdfBase64(
  data: ReceiptData,
): Promise<string> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: {
      Title: `${data.title} ${data.reference}`,
      Author: 'ConnectPort',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Brand header band
  doc.rect(0, 0, doc.page.width, 96).fill('#b8c4f5');
  doc
    .fillColor('#111111')
    .font('Times-Bold')
    .fontSize(26)
    .text('connectport', 48, 36);

  doc
    .fillColor('#111111')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(data.title, 48, 120);

  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#6b6560')
    .text(data.reference, { continued: false });

  doc.moveDown(0.8);
  doc
    .fillColor('#111111')
    .font('Helvetica')
    .fontSize(11)
    .text(`Buyer: ${data.buyerName}`)
    .text(`Email: ${data.buyerEmail}`)
    .text(`Date: ${data.paidAt}`)
    .text(`Payment ref: ${data.paymentRef}`)
    .text(`Type: ${data.channel === 'catalog' ? 'Catalog order' : 'Sourcing'}`);

  doc.moveDown(1);
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(data.productName)
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#6b6560')
    .text(`Quantity: ${data.quantity}`);

  doc.moveDown(1);
  const tableTop = doc.y;
  doc
    .fillColor('#f7f3ec')
    .roundedRect(48, tableTop, doc.page.width - 96, 8 + data.lines.length * 28 + 36, 12)
    .fill();

  let y = tableTop + 14;
  doc.fillColor('#111111').font('Helvetica');
  for (const line of data.lines) {
    doc.fontSize(11).text(line.label, 64, y, { width: 280 });
    doc.text(formatNaira(line.amount), 64, y, {
      width: doc.page.width - 128,
      align: 'right',
    });
    if (line.hint) {
      doc
        .fontSize(9)
        .fillColor('#6b6560')
        .text(line.hint, 64, y + 13, { width: 280 });
      doc.fillColor('#111111');
    }
    y += 28;
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('Total', 64, y + 4, { width: 280 });
  doc.text(formatNaira(data.total), 64, y + 4, {
    width: doc.page.width - 128,
    align: 'right',
  });

  doc.y = y + 56;
  if (data.note) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#6b6560')
      .text(data.note, 48, doc.y, { width: doc.page.width - 96 });
  }

  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#6b6560')
    .text("Tell us what you want. We'll handle the rest.", 48, doc.page.height - 64, {
      width: doc.page.width - 96,
      align: 'center',
    });

  doc.end();
  const buffer = await done;
  return buffer.toString('base64');
}
