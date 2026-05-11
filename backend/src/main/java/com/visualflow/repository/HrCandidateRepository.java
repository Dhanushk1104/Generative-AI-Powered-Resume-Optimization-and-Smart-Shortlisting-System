package com.visualflow.repository;

import com.visualflow.model.HrCandidateEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * HrCandidateRepository  →  hr_candidates table only.
 * HR dashboard must use this — never ResumeRepository.
 */
@Repository
public interface HrCandidateRepository extends JpaRepository<HrCandidateEntity, Long> {

    List<HrCandidateEntity> findAllByOrderByAtsScoreDesc();

    List<HrCandidateEntity> findByUploadedByHrEmailOrderByAtsScoreDesc(String hrEmail);

    List<HrCandidateEntity> findByStatusOrderByAtsScoreDesc(String status);

//    /** Used by HrShortlistingService — all endpoints that display candidates */
//    List<HrCandidateEntity> findAllByOrderByAtsScoreDesc();

    /** Used by HrShortlistingService.deleteByEmails() */
    List<HrCandidateEntity> findByCandidateEmail(String candidateEmail);
}