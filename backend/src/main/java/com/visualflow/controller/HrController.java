package com.visualflow.controller;

import com.visualflow.model.HrCandidateEntity;
import com.visualflow.model.ShortlistEntity;
import com.visualflow.repository.HrCandidateRepository;
import com.visualflow.repository.ShortlistRepository;
import com.visualflow.repository.UserRepository;
import com.visualflow.service.AiEnhancementService;
import com.visualflow.service.HrAiService;
import com.visualflow.service.HrShortlistingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * HrController  —  /api/hr/**
 *
 * Replaces the old 22-line stub.
 *
 * Data separation:
 *   - HR bulk-upload  →  hr_candidates table  (this controller)
 *   - User own upload →  resumes table         (ApiController)
 *
 * Auth: HR and ADMIN users log in via the SAME /api/auth/login endpoint.
 * The token returned is a Bearer token; every /api/hr/** endpoint checks
 * that the token belongs to a user with role HR or ADMIN.
 *
 * Endpoints:
 *   POST   /api/hr/bulk-upload          — upload multiple resumes → hr_candidates
 *   GET    /api/hr/rankings             — all HR candidates ordered by ATS desc
 *   POST   /api/hr/shortlist            — rule-based shortlist (ATS >= 70)
 *   POST   /api/hr/rank                 → FastAPI /hr/rank
 *   POST   /api/hr/cluster              → FastAPI /hr/cluster
 *   POST   /api/hr/auto-shortlist       → FastAPI /hr/auto-shortlist
 *   POST   /api/hr/insights             → FastAPI /hr/insights
 *   DELETE /api/hr/candidates           — delete selected candidates by email list
 *   DELETE /api/hr/candidates/all       — delete all candidates
 */
@RestController
@RequestMapping("/api/hr")
@CrossOrigin(origins = "http://localhost:3000")
public class HrController {

    @Autowired private HrShortlistingService hrService;
    @Autowired private HrAiService           hrAiService;
    @Autowired private AiEnhancementService  aiService;
    @Autowired private HrCandidateRepository hrCandidateRepository;
    @Autowired private ShortlistRepository   shortlistRepository;
    @Autowired private UserRepository        userRepository;

    /* ══════════════════════════════════════════════════════════════════
       BULK UPLOAD
       POST /api/hr/bulk-upload
       - Requires HR or ADMIN Bearer token
       - Each file → FastAPI for analysis
       - Saves to hr_candidates table (NOT resumes table)
       - Returns per-file results for the frontend table
    ══════════════════════════════════════════════════════════════════ */
    @PostMapping("/bulk-upload")
    public ResponseEntity<?> bulkUpload(
            @RequestHeader(name = "Authorization", required = false) String authHeader,
            @RequestParam("files") List<MultipartFile> files) {

        String hrEmail = resolveHrEmail(authHeader);
        if (hrEmail == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "HR or Admin login required to bulk upload"));
        }

        if (files == null || files.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "No files provided"));
        }

        List<Map<String, Object>> results = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        for (MultipartFile file : files) {
            try {
                // ── Analyse via FastAPI ──
                Map aiResp = aiService.analyzeFile(file);

                // ── Extract candidate info from resume text ──
                String candidateEmail = "unknown@candidate.ai";
                String candidateName  = "";
                Object textObj = aiResp.get("extracted_text");
                if (textObj instanceof String) {
                    String text = (String) textObj;
                    String extracted = extractEmail(text);
                    if (extracted != null) candidateEmail = extracted;
                    candidateName = extractName(text);
                }

                // ── Read flat keys returned by FastAPI ──
                Double atsScore = null;
                Object atsObj = aiResp.get("ats_score");
                if (atsObj instanceof Number) atsScore = ((Number) atsObj).doubleValue();

                String recommendedRole = "";
                Object roleObj = aiResp.get("recommended_role");
                if (roleObj instanceof String) recommendedRole = (String) roleObj;

                double score    = atsScore != null ? atsScore : 0;
                String decision = score >= 70 ? "SHORTLISTED" : score >= 60 ? "PENDING" : "REJECTED";

                // ── Save to hr_candidates (NOT resumes) ──
                HrCandidateEntity candidate = new HrCandidateEntity();
                candidate.setFilename(file.getOriginalFilename());
                candidate.setCandidateEmail(candidateEmail);
                candidate.setCandidateName(candidateName);
                candidate.setAtsScore(atsScore);
                candidate.setRecommendedRole(recommendedRole);
                candidate.setStatus(decision);
                candidate.setUploadedByHrEmail(hrEmail);
                if (textObj instanceof String)
                    candidate.setExtractedText((String) textObj);

                hrCandidateRepository.save(candidate);

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("filename",        file.getOriginalFilename());
                entry.put("email",           candidateEmail);
                entry.put("name",            candidateName);
                entry.put("atsScore",        atsScore);
                entry.put("recommendedRole", recommendedRole);
                entry.put("status",          "UPLOADED");
                results.add(entry);

            } catch (Exception e) {
                errors.add(file.getOriginalFilename() + ": " + e.getMessage());
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("filename",        file.getOriginalFilename());
                fail.put("email",           "");
                fail.put("atsScore",        null);
                fail.put("recommendedRole", "");
                fail.put("status",          "FAILED");
                fail.put("error",           e.getMessage());
                results.add(fail);
            }
        }

        long uploaded = results.stream().filter(r -> "UPLOADED".equals(r.get("status"))).count();

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("uploaded", uploaded);
        response.put("failed",   (long) errors.size());
        response.put("results",  results);
        if (!errors.isEmpty()) response.put("errors", errors);

        return ResponseEntity.ok(response);
    }

    /* ══════════════════════════════════════════════════════════════════
       GET ALL CANDIDATE RANKINGS
       GET /api/hr/rankings
       Reads ONLY from hr_candidates table.
    ══════════════════════════════════════════════════════════════════ */
    @GetMapping("/rankings")
    public ResponseEntity<?> getRankings(
            @RequestHeader(name = "Authorization", required = false) String authHeader) {

        if (resolveHrEmail(authHeader) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "HR or Admin login required"));
        try {
            return ResponseEntity.ok(hrService.getAllCandidates());
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Failed to load rankings: " + e.getMessage()));
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       RULE-BASED AUTO-SHORTLIST
       POST /api/hr/shortlist
       Returns hr_candidates with ATS >= 70 (no AI).
    ══════════════════════════════════════════════════════════════════ */
    @PostMapping("/shortlist")
    public ResponseEntity<?> shortlistCandidates(
            @RequestHeader(name = "Authorization", required = false) String authHeader) {

        if (resolveHrEmail(authHeader) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "HR or Admin login required"));
        try {
            return ResponseEntity.ok(hrService.autoShortlist());
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Shortlist failed: " + e.getMessage()));
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       AI-PROXY: RANK  →  FastAPI /hr/rank
    ══════════════════════════════════════════════════════════════════ */
    @PostMapping("/rank")
    public ResponseEntity<?> rankCandidates(
            @RequestHeader(name = "Authorization", required = false) String authHeader,
            @RequestBody Map<String, Object> body) {

        if (resolveHrEmail(authHeader) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "HR or Admin login required"));
        try {
            return ResponseEntity.ok(hrAiService.rankCandidates(body));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "AI ranking failed: " + e.getMessage()));
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       AI-PROXY: CLUSTER  →  FastAPI /hr/cluster
    ══════════════════════════════════════════════════════════════════ */
    @PostMapping("/cluster")
    public ResponseEntity<?> clusterCandidates(
            @RequestHeader(name = "Authorization", required = false) String authHeader,
            @RequestBody Map<String, Object> body) {

        if (resolveHrEmail(authHeader) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "HR or Admin login required"));
        try {
            return ResponseEntity.ok(hrAiService.clusterCandidates(body));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "AI clustering failed: " + e.getMessage()));
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       AI-PROXY: AUTO-SHORTLIST  →  FastAPI /hr/auto-shortlist
    ══════════════════════════════════════════════════════════════════ */
    @PostMapping("/auto-shortlist")
    public ResponseEntity<?> autoShortlistAi(
            @RequestHeader(name = "Authorization", required = false) String authHeader,
            @RequestBody Map<String, Object> body) {

        if (resolveHrEmail(authHeader) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "HR or Admin login required"));
        try {
            Map aiResp = hrAiService.autoShortlistAi(body);
            persistShortlistResults(aiResp);
            return ResponseEntity.ok(aiResp);
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "AI auto-shortlist failed: " + e.getMessage()));
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       AI-PROXY: INSIGHTS  →  FastAPI /hr/insights
    ══════════════════════════════════════════════════════════════════ */
    @PostMapping("/insights")
    public ResponseEntity<?> generateInsights(
            @RequestHeader(name = "Authorization", required = false) String authHeader,
            @RequestBody Map<String, Object> body) {

        if (resolveHrEmail(authHeader) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "HR or Admin login required"));
        try {
            return ResponseEntity.ok(hrAiService.generateInsights(body));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Insights generation failed: " + e.getMessage()));
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       DELETE SELECTED CANDIDATES
       DELETE /api/hr/candidates
       Body: { "emails": ["a@b.com", "c@d.com"] }
    ══════════════════════════════════════════════════════════════════ */
    @DeleteMapping("/candidates")
    public ResponseEntity<?> deleteSelectedCandidates(
            @RequestHeader(name = "Authorization", required = false) String authHeader,
            @RequestBody Map<String, Object> body) {

        if (resolveHrEmail(authHeader) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "HR or Admin login required"));

        try {
            Object emailsObj = body.get("emails");
            if (!(emailsObj instanceof List) || ((List<?>) emailsObj).isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "No emails provided"));
            }

            @SuppressWarnings("unchecked")
            List<String> emails = (List<String>) emailsObj;

            int deleted = hrService.deleteByEmails(emails);

            return ResponseEntity.ok(Map.of(
                    "message", deleted + " candidate(s) deleted successfully",
                    "deleted", deleted
            ));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Delete failed: " + e.getMessage()));
        }
    }

    /* ══════════════════════════════════════════════════════════════════
       DELETE ALL CANDIDATES
       DELETE /api/hr/candidates/all
    ══════════════════════════════════════════════════════════════════ */
    @DeleteMapping("/candidates/all")
    public ResponseEntity<?> deleteAllCandidates(
            @RequestHeader(name = "Authorization", required = false) String authHeader) {

        if (resolveHrEmail(authHeader) == null)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "HR or Admin login required"));

        try {
            int deleted = hrService.deleteAll();
            return ResponseEntity.ok(Map.of(
                    "message", "All " + deleted + " candidate(s) deleted successfully",
                    "deleted", deleted
            ));
        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Delete all failed: " + e.getMessage()));
        }
    }

    /* ── Validate token AND confirm HR or ADMIN role ──────────────── */
    private String resolveHrEmail(String authHeader) {
        if (!StringUtils.hasText(authHeader) || !authHeader.startsWith("Bearer "))
            return null;
        String token = authHeader.substring(7);
        String email = ApiController.resolveEmailStatic(token);
        if (email == null) return null;
        if ("admin".equals(email)) return email;          // hardcoded admin always OK
        return userRepository.findByEmail(email)
                .filter(u -> "HR".equalsIgnoreCase(u.getRole())
                        || "ADMIN".equalsIgnoreCase(u.getRole()))
                .map(u -> email)
                .orElse(null);
    }

    /* ── Persist AI shortlist results to shortlists table ────────── */
    @SuppressWarnings("unchecked")
    private void persistShortlistResults(Map aiResp) {
        try {
            Object obj = aiResp.get("shortlisted");
            if (!(obj instanceof List)) return;
            for (Map<String, Object> c : (List<Map<String, Object>>) obj) {
                String email = (String) c.getOrDefault("email", "");
                if (email.isBlank()) continue;
                ShortlistEntity entity = new ShortlistEntity();
                entity.setCandidateEmail(email);
                entity.setStatus("SHORTLISTED");
                Object score = c.get("atsScore");
                if (score instanceof Number)
                    entity.setRankingScore(((Number) score).doubleValue());
                shortlistRepository.save(entity);
            }
        } catch (Exception ignored) {}
    }

    /* ── Extract first email address found in resume text ────────── */
    private String extractEmail(String text) {
        if (text == null || text.isBlank()) return null;
        Matcher m = Pattern.compile(
                "[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}"
        ).matcher(text);
        return m.find() ? m.group() : null;
    }

    /* ── Heuristic: first short 2-word line with no digits or @ ──── */
    private String extractName(String text) {
        if (text == null || text.isBlank()) return "";
        for (String line : text.split("\\r?\\n")) {
            String t = line.trim();
            if (t.isEmpty() || t.length() > 50) continue;
            if (t.contains("@") || t.matches(".*\\d.*")) continue;
            if (t.split("\\s+").length >= 2) return t;
        }
        return "";
    }
}