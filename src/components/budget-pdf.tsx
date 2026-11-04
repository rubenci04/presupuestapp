import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { advanceAmount } from "@/lib/budget-calc";
import { brandDisplayName, budgetNumberLabel, type BudgetDocumentData } from "@/lib/budget-document";
import { addDaysISO, contrastColor, formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { BudgetItem } from "@/lib/types";

// Este módulo pesa cerca de 1 MB: importarlo siempre con import() dinámico.

// Sin esto react-pdf parte palabras con guiones en inglés.
Font.registerHyphenationCallback((word) => [word]);

const INK = "#1C1917";
const MUTED = "#6B635B";
const LINE = "#E3DCD2";

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingHorizontal: 40, paddingBottom: 54, fontFamily: "Helvetica", fontSize: 10, color: INK, lineHeight: 1.35 },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: 12, borderBottomWidth: 3 },
  logo: { width: 76, height: 56, objectFit: "contain", objectPositionX: 0, marginRight: 14 },
  brand: { flex: 1 },
  brandName: { fontSize: 17, lineHeight: 1.2, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  contact: { color: MUTED, fontSize: 9 },
  docTitle: { alignItems: "flex-end", marginLeft: 12 },
  docLabel: { fontSize: 15, lineHeight: 1.2, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  parties: { flexDirection: "row", marginTop: 14, marginBottom: 6 },
  label: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED, marginBottom: 2 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4 },
  tableHead: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.75, borderBottomColor: LINE },
  colDescription: { flex: 1, paddingRight: 8 },
  colQuantity: { width: 70, textAlign: "right" },
  colPrice: { width: 80, textAlign: "right" },
  colTotal: { width: 85, textAlign: "right" },
  subtotal: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 4, paddingHorizontal: 6, fontFamily: "Helvetica-Bold" },
  totals: { marginTop: 14, alignSelf: "flex-end", width: 240 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5, paddingHorizontal: 8 },
  grandTotal: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, paddingHorizontal: 8, marginTop: 3, fontSize: 13, fontFamily: "Helvetica-Bold" },
  terms: { marginTop: 16, padding: 10, backgroundColor: "#F7F4EF" },
  termRow: { flexDirection: "row", marginBottom: 2 },
  termLabel: { width: 130, color: MUTED },
  termValue: { flex: 1 },
  footerText: { marginTop: 14, fontSize: 9, color: MUTED },
  pageNumber: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTED },
});

function ItemsTable({ title, items, color, onColor, subtotal }: { title: string; items: BudgetItem[]; color: string; onColor: string; subtotal: number }) {
  return (
    <View>
      {/* minPresenceAhead: que el título y el encabezado no queden solos al final de la hoja. */}
      <Text style={styles.sectionTitle} minPresenceAhead={60}>
        {title}
      </Text>
      <View style={[styles.tableHead, { backgroundColor: color, color: onColor }]} fixed={false}>
        <Text style={styles.colDescription}>Descripción</Text>
        <Text style={styles.colQuantity}>Cantidad</Text>
        <Text style={styles.colPrice}>P. unitario</Text>
        <Text style={styles.colTotal}>Importe</Text>
      </View>
      {items.map((item) => (
        <View key={item.id} style={styles.row} wrap={false}>
          <Text style={styles.colDescription}>{item.description}</Text>
          <Text style={styles.colQuantity}>
            {formatNumber(item.quantity)} {item.unit}
          </Text>
          <Text style={styles.colPrice}>{formatMoney(item.unit_price)}</Text>
          <Text style={styles.colTotal}>{formatMoney(item.total)}</Text>
        </View>
      ))}
      <View style={styles.subtotal} wrap={false}>
        <Text>Subtotal: {formatMoney(subtotal)}</Text>
      </View>
    </View>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.termRow} wrap={false}>
      <Text style={styles.termLabel}>{label}</Text>
      <Text style={styles.termValue}>{value}</Text>
    </View>
  );
}

export function BudgetPdfDocument({ data }: { data: BudgetDocumentData }) {
  const { professional, client, budget, labor, materials, logoDataUrl } = data;
  const color = professional.primary_color;
  const onColor = contrastColor(color);
  const name = brandDisplayName(professional);
  const number = budgetNumberLabel(budget.number);
  const person = `${professional.name} ${professional.last_name}`.trim();
  const contact = [
    professional.brand_name.trim() ? person : "",
    professional.phone,
    professional.address,
    professional.zone,
    professional.cuit ? `CUIT/CUIL ${professional.cuit}` : "",
  ].filter(Boolean);

  return (
    <Document title={`Presupuesto ${number} - ${name}`} author={name} language="es-AR">
      <Page size="A4" style={styles.page}>
        <View style={[styles.header, { borderBottomColor: color }]}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- el Image de react-pdf no tiene alt */}
          {logoDataUrl && <Image src={logoDataUrl} style={styles.logo} />}
          <View style={styles.brand}>
            <Text style={styles.brandName}>{name}</Text>
            <Text style={styles.contact}>{contact.join("  ·  ")}</Text>
          </View>
          <View style={styles.docTitle}>
            <Text style={[styles.docLabel, { color }]}>PRESUPUESTO</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{number}</Text>
            <Text style={styles.contact}>Fecha: {formatDate(budget.date)}</Text>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>CLIENTE</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>{client.name}</Text>
            {[client.phone, client.address, client.email].filter(Boolean).map((line) => (
              <Text key={line} style={styles.contact}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        {labor.length > 0 && <ItemsTable title="Mano de obra" items={labor} color={color} onColor={onColor} subtotal={budget.subtotal_labor} />}
        {materials.length > 0 && <ItemsTable title="Materiales" items={materials} color={color} onColor={onColor} subtotal={budget.subtotal_materials} />}

        <View style={styles.totals} wrap={false}>
          {labor.length > 0 && (
            <View style={styles.totalsRow}>
              <Text>Mano de obra</Text>
              <Text>{formatMoney(budget.subtotal_labor)}</Text>
            </View>
          )}
          {materials.length > 0 && (
            <View style={styles.totalsRow}>
              <Text>Materiales</Text>
              <Text>{formatMoney(budget.subtotal_materials)}</Text>
            </View>
          )}
          {budget.iva_percent > 0 && (
            <View style={styles.totalsRow}>
              <Text>IVA {formatNumber(budget.iva_percent)}%</Text>
              <Text>{formatMoney(budget.iva_amount)}</Text>
            </View>
          )}
          <View style={[styles.grandTotal, { backgroundColor: color, color: onColor }]}>
            <Text>TOTAL</Text>
            <Text>{formatMoney(budget.total)}</Text>
          </View>
        </View>

        <View style={styles.terms} wrap={false}>
          <Text style={styles.label}>CONDICIONES</Text>
          {budget.validity_days > 0 && (
            <Term label="Validez" value={`${budget.validity_days} días (hasta el ${formatDate(addDaysISO(budget.date, budget.validity_days))})`} />
          )}
          {budget.advance_percent > 0 && (
            <Term label="Anticipo" value={`${formatNumber(budget.advance_percent)}% (${formatMoney(advanceAmount(budget.total, budget.advance_percent))})`} />
          )}
          {budget.warranty_days > 0 && <Term label="Garantía de mano de obra" value={`${budget.warranty_days} días`} />}
          {budget.payment_method.trim() && <Term label="Forma de pago" value={budget.payment_method} />}
          {budget.notes.trim() && <Term label="Notas" value={budget.notes} />}
        </View>

        {professional.footer_text.trim() && <Text style={styles.footerText}>{professional.footer_text}</Text>}

        <View style={styles.pageNumber} fixed>
          <Text>
            {name} · {professional.phone}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderBudgetPdf(data: BudgetDocumentData): Promise<Blob> {
  return pdf(<BudgetPdfDocument data={data} />).toBlob();
}
