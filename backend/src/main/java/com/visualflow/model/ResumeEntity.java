package com.visualflow.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "resumes")
public class ResumeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String candidateEmail;

    private Double atsScore;           // Keep Double to allow null

    private Double jdMatchScore;       // populated when /jd-tailor is used

    private String recommendedRole;    // role predicted by AI

    private String filename;           // original uploaded filename

    @Column(columnDefinition = "LONGTEXT")
    private String extractedText;      // raw text from PDF/DOCX

    private LocalDateTime uploadedAt = LocalDateTime.now();

    /* ── Getters ──────────────────────────────────────────────────── */
    public Long          getId()              { return id; }
    public String        getCandidateEmail()  { return candidateEmail; }
    public Double        getAtsScore()        { return atsScore; }
    public Double        getJdMatchScore()    { return jdMatchScore; }
    public String        getRecommendedRole() { return recommendedRole; }
    public String        getFilename()        { return filename; }
    public String        getExtractedText()   { return extractedText; }
    public LocalDateTime getUploadedAt()      { return uploadedAt; }

    /* ── Setters ──────────────────────────────────────────────────── */
    public void setId(Long id)                        { this.id = id; }
    public void setCandidateEmail(String e)           { this.candidateEmail = e; }
    public void setAtsScore(Double s)                 { this.atsScore = s; }
    public void setJdMatchScore(Double s)             { this.jdMatchScore = s; }
    public void setRecommendedRole(String r)          { this.recommendedRole = r; }
    public void setFilename(String f)                 { this.filename = f; }
    public void setExtractedText(String t)            { this.extractedText = t; }
    public void setUploadedAt(LocalDateTime t)        { this.uploadedAt = t; }
}
