package com.visualflow.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * HrCandidateEntity  →  table: hr_candidates
 *
 * Stores candidates uploaded by HR via /api/hr/bulk-upload.
 * Completely separate from ResumeEntity (user's own scan history).
 */
@Entity
@Table(name = "hr_candidates")
public class HrCandidateEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String filename;
    private String candidateEmail;
    private String candidateName;
    private Double atsScore;
    private String recommendedRole;

    @Column(columnDefinition = "TEXT")
    private String extractedText;

    private String uploadedByHrEmail;   // which HR user uploaded this batch
    private String status;              // SHORTLISTED / PENDING / REJECTED

    private LocalDateTime uploadedAt = LocalDateTime.now();

    /* ── Getters ─────────────────────────────────────────── */
    public Long          getId()                { return id; }
    public String        getFilename()          { return filename; }
    public String        getCandidateEmail()    { return candidateEmail; }
    public String        getCandidateName()     { return candidateName; }
    public Double        getAtsScore()          { return atsScore; }
    public String        getRecommendedRole()   { return recommendedRole; }
    public String        getExtractedText()     { return extractedText; }
    public String        getUploadedByHrEmail() { return uploadedByHrEmail; }
    public String        getStatus()            { return status; }
    public LocalDateTime getUploadedAt()        { return uploadedAt; }

    /* ── Setters ─────────────────────────────────────────── */
    public void setId(Long id)                   { this.id = id; }
    public void setFilename(String f)            { this.filename = f; }
    public void setCandidateEmail(String e)      { this.candidateEmail = e; }
    public void setCandidateName(String n)       { this.candidateName = n; }
    public void setAtsScore(Double s)            { this.atsScore = s; }
    public void setRecommendedRole(String r)     { this.recommendedRole = r; }
    public void setExtractedText(String t)       { this.extractedText = t; }
    public void setUploadedByHrEmail(String e)   { this.uploadedByHrEmail = e; }
    public void setStatus(String s)              { this.status = s; }
    public void setUploadedAt(LocalDateTime t)   { this.uploadedAt = t; }
}