package com.visualflow.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.*;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;

@Service
public class PdfTextExtractor {

    // Max file size: 10 MB — prevents memory exhaustion from huge uploads
    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024;

    public String extractText(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("No file provided or file is empty.");
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("File too large. Maximum allowed size is 10 MB.");
        }

        String originalName = file.getOriginalFilename();
        if (originalName == null || originalName.isBlank()) {
            throw new IllegalArgumentException("File has no name.");
        }

        String lower = originalName.toLowerCase();

        if (lower.endsWith(".pdf")) {
            String text = extractFromPdf(file.getInputStream());
            if (text.isBlank()) {
                throw new IllegalArgumentException(
                        "Could not extract text from PDF. It may be a scanned/image-based file. " +
                                "Please upload a text-based PDF or DOCX.");
            }
            return text;

        } else if (lower.endsWith(".docx")) {
            String text = extractFromDocx(file.getInputStream());
            if (text.isBlank()) {
                throw new IllegalArgumentException(
                        "Could not extract text from DOCX. The file appears to be empty.");
            }
            return text;

        } else if (lower.endsWith(".doc")) {
            throw new IllegalArgumentException(
                    "Legacy .doc format is not supported. Please convert to .docx or .pdf.");

        } else {
            String ext = originalName.contains(".")
                    ? originalName.substring(originalName.lastIndexOf('.'))
                    : "(no extension)";
            throw new IllegalArgumentException(
                    "Unsupported file format: " + ext + ". Only PDF and DOCX are accepted.");
        }
    }

    /* ── PDF ─────────────────────────────────────────────────────────────── */
    private String extractFromPdf(InputStream inputStream) throws IOException {
        // PDFBox 3.x: Loader.loadPDF() replaces PDDocument.load()
        try (PDDocument document = Loader.loadPDF(inputStream.readAllBytes())) {
            if (document.isEncrypted()) {
                throw new IllegalArgumentException(
                        "PDF is password-protected. Please remove the password and re-upload.");
            }
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            String text = stripper.getText(document);
            return text == null ? "" : text.trim();
        }
    }

    /* ── DOCX ────────────────────────────────────────────────────────────── */
    private String extractFromDocx(InputStream inputStream) throws IOException {
        try (XWPFDocument document = new XWPFDocument(inputStream)) {
            StringBuilder sb = new StringBuilder();

            // Paragraphs
            for (XWPFParagraph para : document.getParagraphs()) {
                String text = para.getText();
                if (text != null && !text.isBlank()) {
                    sb.append(text).append("\n");
                }
            }

            // Tables (many resumes use tables for layout)
            for (XWPFTable table : document.getTables()) {
                for (XWPFTableRow row : table.getRows()) {
                    for (XWPFTableCell cell : row.getTableCells()) {
                        String text = cell.getText();
                        if (text != null && !text.isBlank()) {
                            sb.append(text).append(" ");
                        }
                    }
                    sb.append("\n");
                }
            }

            return sb.toString().trim();
        }
    }
}