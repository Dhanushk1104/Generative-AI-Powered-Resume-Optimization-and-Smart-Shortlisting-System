package com.visualflow.repository;

import com.visualflow.model.ResumeEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ResumeRepository extends JpaRepository<ResumeEntity, Long> {

    // Used by /api/history to return a user's scan history ordered newest first
    List<ResumeEntity> findByCandidateEmailOrderByUploadedAtDesc(String candidateEmail);

    // Used by HR rankings — all resumes ordered by ATS descending
    List<ResumeEntity> findAllByOrderByAtsScoreDesc();
}
