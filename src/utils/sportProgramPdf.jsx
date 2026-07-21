import React from "react";
import { Buffer } from "buffer";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

const PDF_FONT_FAMILY = "BYL PDF Sans";

if (typeof globalThis !== "undefined" && !globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

Font.register({
  family: PDF_FONT_FAMILY,
  fonts: [
    { src: "/fonts/Arial.ttf", fontWeight: 400 },
    { src: "/fonts/Arial-Bold.ttf", fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingHorizontal: 32,
    paddingBottom: 34,
    backgroundColor: "#F8FBFF",
    color: "#111827",
    fontFamily: PDF_FONT_FAMILY,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#DDE7F5",
    marginBottom: 18,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: 170,
  },
  logo: {
    width: 34,
    height: 34,
    objectFit: "contain",
    borderRadius: 8,
  },
  brandText: {
    fontSize: 10.5,
    color: "#0F172A",
    fontWeight: 700,
    lineHeight: 1.25,
  },
  titleBlock: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  title: {
    fontSize: 19,
    lineHeight: 1.15,
    fontWeight: 700,
    color: "#0F172A",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 9.5,
    color: "#64748B",
    textAlign: "center",
  },
  meta: {
    width: 150,
    fontSize: 9,
    color: "#64748B",
    textAlign: "right",
    lineHeight: 1.35,
  },
  sessionBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#EAF3FF",
    borderWidth: 1,
    borderColor: "#CFE0F6",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  sessionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#102A43",
  },
  duration: {
    fontSize: 9.5,
    color: "#486581",
    fontWeight: 700,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionDot: {
    width: 7,
    height: 7,
    borderRadius: 2,
    backgroundColor: "#0F172A",
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: "#0F172A",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    width: "48.7%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DFE7F2",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginBottom: 8,
  },
  imageSlot: {
    width: "48.5%",
    height: 86,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5EDF7",
    backgroundColor: "#F8FAFC",
    objectFit: "contain",
  },
  singleImage: {
    width: "100%",
    height: 108,
  },
  exerciseTitle: {
    fontSize: 11.5,
    fontWeight: 700,
    color: "#111827",
    lineHeight: 1.25,
    marginBottom: 6,
  },
  infoWrap: {
    marginTop: 1,
  },
  infoLine: {
    fontSize: 9.3,
    color: "#486581",
    lineHeight: 1.38,
    marginBottom: 2,
  },
  infoBullet: {
    color: "#64748B",
  },
  infoLabel: {
    fontWeight: 700,
    color: "#486581",
  },
  footer: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#DDE7F5",
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  footerLogo: {
    width: 16,
    height: 16,
    objectFit: "contain",
    marginRight: 8,
  },
  footerText: {
    fontSize: 8,
    color: "#94A3B8",
  },
});

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function ExerciseCard({ exercise, index }) {
  const images = Array.isArray(exercise.images) ? exercise.images.filter(Boolean).slice(0, 4) : [];
  const infos = Array.isArray(exercise.infos) ? exercise.infos.filter(Boolean).slice(0, 8) : [];

  return (
    <View style={styles.card} wrap={false}>
      {images.length > 0 ? (
        <View style={styles.imageGrid}>
          {images.map((src, imageIndex) => (
            <Image
              key={`${exercise.name}-${imageIndex}`}
              src={src}
              style={[
                styles.imageSlot,
                images.length === 1 ? styles.singleImage : null,
              ]}
            />
          ))}
        </View>
      ) : null}

      <Text style={styles.exerciseTitle}>
        {index}. {cleanText(exercise.name) || "-"}
      </Text>

      <View style={styles.infoWrap}>
        {infos.map((info, infoIndex) => (
          <Text key={`${exercise.name}-info-${infoIndex}`} style={styles.infoLine}>
            <Text style={styles.infoBullet}>• </Text>
            <Text style={styles.infoLabel}>{cleanText(info.label)} : </Text>
            {cleanText(info.value)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function SectionBlock({ section }) {
  const exercises = Array.isArray(section.exercises) ? section.exercises : [];
  if (!exercises.length) return null;

  return (
    <View>
      <View style={styles.sectionTitle}>
        <View style={styles.sectionDot} />
        <Text style={styles.sectionLabel}>{cleanText(section.label)}</Text>
      </View>
      <View style={styles.grid}>
        {exercises.map((exercise, index) => (
          <ExerciseCard
            key={`${section.label}-${exercise.name}-${index}`}
            exercise={exercise}
            index={index + 1}
          />
        ))}
      </View>
    </View>
  );
}

export function SportProgramPdfDocument({
  title,
  clientName,
  coachName,
  logoDataUrl,
  footerLogoDataUrl,
  dateLabel,
  footerText,
  sessions = [],
}) {
  return (
    <Document title={cleanText(title) || "Programme BYL"}>
      {sessions.map((session, sessionIndex) => (
        <Page key={`session-${sessionIndex}`} size="A4" style={styles.page} wrap>
          <View style={styles.header} fixed>
            <View style={styles.brandRow}>
              {logoDataUrl ? <Image src={logoDataUrl} style={styles.logo} /> : null}
              <Text style={styles.brandText}>{cleanText(coachName) || "BoostYourLife.coach"}</Text>
            </View>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{cleanText(title)}</Text>
              <Text style={styles.subtitle}>{cleanText(session.title)}</Text>
            </View>
            <View style={styles.meta}>
              {clientName ? <Text>{cleanText(clientName)}</Text> : null}
              {dateLabel ? <Text>{cleanText(dateLabel)}</Text> : null}
            </View>
          </View>

          <View style={styles.sessionBand} wrap={false}>
            <Text style={styles.sessionTitle}>{cleanText(session.title)}</Text>
            <Text style={styles.duration}>{cleanText(session.duration)}</Text>
          </View>

          {(session.sections || []).map((section, index) => (
            <SectionBlock key={`${session.title}-section-${index}`} section={section} />
          ))}

          <View style={styles.footer} fixed>
            {footerLogoDataUrl ? <Image src={footerLogoDataUrl} style={styles.footerLogo} /> : null}
            <Text style={styles.footerText}>{cleanText(footerText)}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
