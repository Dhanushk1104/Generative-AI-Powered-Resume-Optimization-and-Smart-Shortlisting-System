package com.visualflow.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "shortlists")
public class ShortlistEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String candidateEmail;

    private Double rankingScore;

    private String status;              // SHORTLISTED / PENDING / REJECTED

    private String recommendedRole;

    private LocalDateTime shortlistedAt = LocalDateTime.now();

    /* ── Getters ──────────────────────────────────── */
    public Long          getId()              { return id; }
    public String        getCandidateEmail()  { return candidateEmail; }
    public Double        getRankingScore()    { return rankingScore; }
    public String        getStatus()          { return status; }
    public String        getRecommendedRole() { return recommendedRole; }
    public LocalDateTime getShortlistedAt()   { return shortlistedAt; }

    /* ── Setters ──────────────────────────────────── */
    public void setId(Long id)                     { this.id = id; }
    public void setCandidateEmail(String e)        { this.candidateEmail = e; }
    public void setRankingScore(Double s)          { this.rankingScore = s; }
    public void setStatus(String s)                { this.status = s; }
    public void setRecommendedRole(String r)       { this.recommendedRole = r; }
    public void setShortlistedAt(LocalDateTime t)  { this.shortlistedAt = t; }
}
