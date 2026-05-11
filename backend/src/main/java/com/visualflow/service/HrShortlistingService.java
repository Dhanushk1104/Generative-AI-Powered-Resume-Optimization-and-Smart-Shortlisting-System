package com.visualflow.service;

import com.visualflow.model.HrCandidateEntity;
import com.visualflow.repository.HrCandidateRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * HrShortlistingService
 *
 * UPDATED: now reads ONLY from hr_candidates table via HrCandidateRepository.
 * Previously used ResumeRepository — that was wrong (mixed user data with HR data).
 *
 * Replaces existing service/HrShortlistingService.java (was 30 lines).
 */
@Service
public class HrShortlistingService {

    @Autowired
    private HrCandidateRepository hrCandidateRepository;

    /**
     * Returns all HR-uploaded candidates with ATS >= 70, ordered by score desc.
     * Used by POST /api/hr/shortlist (rule-based, no AI).
     */
    public List<Map<String, Object>> autoShortlist() {
        List<Map<String, Object>> result = new ArrayList<>();
        hrCandidateRepository.findAllByOrderByAtsScoreDesc().forEach(r -> {
            if (r.getAtsScore() != null && r.getAtsScore() >= 70) {
                result.add(buildMap(r, "SHORTLISTED"));
            }
        });
        return result;
    }

    /**
     * Returns ALL HR-uploaded candidates with auto-computed decision.
     * Used by GET /api/hr/rankings and as input to AI rank/cluster/insights calls.
     */
    public List<Map<String, Object>> getAllCandidates() {
        List<Map<String, Object>> result = new ArrayList<>();
        hrCandidateRepository.findAllByOrderByAtsScoreDesc().forEach(r -> {
            double score    = r.getAtsScore() != null ? r.getAtsScore() : 0;
            String decision = score >= 70 ? "SHORTLISTED" : score >= 60 ? "PENDING" : "REJECTED";
            result.add(buildMap(r, decision));
        });
        return result;
    }

    /**
     * Deletes candidates whose candidateEmail is in the given list.
     * Used by DELETE /api/hr/candidates
     * Returns number of records deleted.
     */
    @Transactional
    public int deleteByEmails(List<String> emails) {
        if (emails == null || emails.isEmpty()) return 0;
        int count = 0;
        for (String email : emails) {
            List<HrCandidateEntity> found =
                    hrCandidateRepository.findByCandidateEmail(email);
            hrCandidateRepository.deleteAll(found);
            count += found.size();
        }
        return count;
    }

    /**
     * Deletes ALL candidates from hr_candidates table.
     * Used by DELETE /api/hr/candidates/all
     * Returns number of records deleted.
     */
    @Transactional
    public int deleteAll() {
        int count = (int) hrCandidateRepository.count();
        hrCandidateRepository.deleteAll();
        return count;
    }

    /* ── Private builder ─────────────────────────────────────────── */
    private Map<String, Object> buildMap(HrCandidateEntity r, String status) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",              r.getId());
        m.put("email",           safe(r.getCandidateEmail()));
        m.put("name",            safe(r.getCandidateName()));
        m.put("atsScore",        r.getAtsScore() != null ? r.getAtsScore() : 0);
        m.put("recommendedRole", safe(r.getRecommendedRole()));
        m.put("status",          status);
        m.put("filename",        safe(r.getFilename()));
        m.put("uploadedAt",      r.getUploadedAt() != null ? r.getUploadedAt().toString() : null);
        m.put("uploadedBy",      safe(r.getUploadedByHrEmail()));
        return m;
    }

    private String safe(String s) { return s != null ? s : ""; }
}