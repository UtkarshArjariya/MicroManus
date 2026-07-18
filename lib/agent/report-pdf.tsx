import "server-only";

import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

export type PdfReportSection = {
  heading: string;
  content: string;
};

export type PdfReportInput = {
  title: string;
  generatedAt: Date;
  sections: PdfReportSection[];
  sources: string[];
};

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 48,
    paddingVertical: 44,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: "#1B2430",
    lineHeight: 1.45,
  },
  eyebrow: {
    color: "#5B6570",
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  title: {
    color: "#1B2430",
    fontFamily: "Times-Roman",
    fontSize: 26,
    fontWeight: 700,
    lineHeight: 1.15,
    marginBottom: 10,
  },
  meta: {
    color: "#5B6570",
    fontSize: 10,
    marginBottom: 26,
  },
  toc: {
    backgroundColor: "#F4F1E9",
    borderColor: "#C4C1B8",
    borderRadius: 2,
    borderWidth: 1,
    marginBottom: 24,
    padding: 14,
  },
  tocTitle: {
    color: "#1B2430",
    fontFamily: "Times-Roman",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
  },
  tocItem: {
    color: "#5B6570",
    fontSize: 10,
    marginBottom: 4,
  },
  section: {
    marginBottom: 18,
  },
  heading: {
    borderBottomColor: "#C4C1B8",
    borderBottomWidth: 1,
    color: "#1B2430",
    fontFamily: "Times-Roman",
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 8,
    paddingBottom: 5,
  },
  paragraph: {
    marginBottom: 7,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  bullet: {
    width: 14,
  },
  bulletText: {
    flex: 1,
  },
  source: {
    color: "#C98A2C",
    fontSize: 9,
    marginBottom: 5,
  },
  footer: {
    borderTopColor: "#C4C1B8",
    borderTopWidth: 1,
    color: "#5B6570",
    fontSize: 8,
    marginTop: 16,
    paddingTop: 8,
  },
});

function cleanText(value: string) {
  return value
    .replace(/\[(.*?)\]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .replace(/[*_`#>]/g, "")
    .replace(/\r/g, "")
    .trim();
}

function contentBlocks(content: string) {
  return cleanText(content)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function ReportDocument({ title, generatedAt, sections, sources }: PdfReportInput) {
  const date = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(generatedAt);

  return (
    <Document title={title} author="MicroManus">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.eyebrow}>MICROMANUS RESEARCH REPORT</Text>
        <Text style={styles.title}>{cleanText(title)}</Text>
        <Text style={styles.meta}>Generated on {date}</Text>

        {sections.length > 1 ? (
          <View style={styles.toc}>
            <Text style={styles.tocTitle}>Table of contents</Text>
            {sections.map((section, index) => (
              <Text key={`${section.heading}-${index}`} style={styles.tocItem}>
                {index + 1}. {cleanText(section.heading)}
              </Text>
            ))}
          </View>
        ) : null}

        {sections.map((section, sectionIndex) => (
          <View key={`${section.heading}-${sectionIndex}`} style={styles.section}>
            <Text style={styles.heading}>{cleanText(section.heading)}</Text>
            {contentBlocks(section.content).map((block, blockIndex) => {
              if (/^[-•]\s+/.test(block)) {
                return block.split("\n").map((line, lineIndex) => (
                  <View key={`${blockIndex}-${lineIndex}`} style={styles.bulletRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>{cleanText(line.replace(/^[-•]\s+/, ""))}</Text>
                  </View>
                ));
              }

              return (
                <Text key={blockIndex} style={styles.paragraph}>
                  {cleanText(block)}
                </Text>
              );
            })}
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.heading}>Sources</Text>
          {sources.length > 0 ? (
            sources.map((source, index) => (
              <Link key={`${source}-${index}`} src={source} style={styles.source}>
                {index + 1}. {source}
              </Link>
            ))
          ) : (
            <Text style={styles.paragraph}>No external sources were recorded for this report.</Text>
          )}
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `MicroManus • Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderPdfReport(input: PdfReportInput) {
  return renderToBuffer(<ReportDocument {...input} />);
}
