package com.visualflow.controller;

import com.visualflow.model.ResumeEntity;
import com.visualflow.model.UserEntity;
import com.visualflow.repository.ResumeRepository;
import com.visualflow.repository.UserRepository;
import com.visualflow.service.AiEnhancementService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

/**
 * ApiController  —  /api/**
 *
 * Handles all user-facing endpoints:
 *   auth (signup/login/me/update/delete)
 *   /api/ai/analyze-file  — user uploads their OWN resume → resumes table
 *   /api/history          — user's own scan history from resumes table
 *   /api/admin/stats
 *   /api/ai/suggest-skills, project-summary, jd-suggestions
 *
 * NOTE: tokens/users maps are package-visible (not private) so that
 * HrController can call resolveEmailStatic() to validate HR Bearer tokens
 * without duplicating the login state.
 */
@CrossOrigin(origins = "http://localhost:3000")
@RestController
@RequestMapping("/api")
public class ApiController {

    @Autowired private UserRepository       userRepository;
    @Autowired private ResumeRepository     resumeRepository;
    @Autowired private AiEnhancementService aiService;

    /* ── Shared token store (package-visible for HrController) ────── */
    static final Map<String, User>   users  = new HashMap<>();
    static final Map<String, String> tokens = new HashMap<>();

    static {
        users.put("admin", new User("1234", "ADMIN"));
    }

    /**
     * Static token resolver used by HrController to validate HR login tokens
     * from the same session without duplicating the map.
     */
    public static String resolveEmailStatic(String token) {
        return tokens.getOrDefault(token, null);
    }

    /* ─────────────────────────────────────────────────────────────────
       TEST
    ───────────────────────────────────────────────────────────────── */
    @GetMapping("/test")
    public ResponseEntity<?> test() {
        return ResponseEntity.ok(Map.of("message", "Backend is running ✅"));
    }

    /* ─────────────────────────────────────────────────────────────────
       SIGNUP
    ───────────────────────────────────────────────────────────────── */
    @PostMapping("/auth/signup")
    public ResponseEntity<?> signup(@RequestBody Map<String, String> body) {

        String email    = body.get("email");
        String password = body.get("password");
        String role     = body.getOrDefault("role", "OTHER");
        String username = body.get("username");
        String phone    = body.getOrDefault("phone", body.get("phoneNumber"));

        if (!StringUtils.hasText(email) || !StringUtils.hasText(password)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Email and password required"));
        }

        if (userRepository.findByEmail(email).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "User already exists"));
        }

        role = role.toUpperCase();
        List<String> allowedRoles = List.of("FRESHER", "STUDENT", "HR", "OTHER", "ADMIN");
        if (!allowedRoles.contains(role)) role = "OTHER";

        UserEntity user = new UserEntity(email, password, role);
        user.setUsername(username);
        user.setPhoneNumber(phone);
        userRepository.save(user);

        return ResponseEntity.ok(Map.of("message", "User registered successfully"));
    }

    /* ─────────────────────────────────────────────────────────────────
       LOGIN  (same endpoint for ALL roles: user, HR, admin)
    ───────────────────────────────────────────────────────────────── */
    @PostMapping("/auth/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {

        String email    = body.get("email");
        String password = body.get("password");

        if (!StringUtils.hasText(email) || !StringUtils.hasText(password)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Email and password required"));
        }

        // Hardcoded admin check
        User admin = users.get(email);
        if (admin != null && admin.password.equals(password)) {
            String token = UUID.randomUUID().toString();
            tokens.put(token, email);
            return ResponseEntity.ok(Map.of("token", token, "role", admin.role));
        }

        Optional<UserEntity> optUser = userRepository.findByEmail(email);
        if (optUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid credentials"));
        }

        UserEntity user = optUser.get();
        if (!user.getPassword().equals(password)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid credentials"));
        }

        String token = UUID.randomUUID().toString();
        tokens.put(token, email);

        // Return role so frontend can route HR → HRDashboard, user → Home
        return ResponseEntity.ok(Map.of("token", token, "role", user.getRole()));
    }

    /* ─────────────────────────────────────────────────────────────────
       GET PROFILE
    ───────────────────────────────────────────────────────────────── */
    @GetMapping("/auth/me")
    public ResponseEntity<?> getMe(
            @RequestHeader(name = "Authorization", required = false) String authHeader) {

        String email = resolveEmail(authHeader);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid or missing token"));
        }

        if ("admin".equals(email)) {
            return ResponseEntity.ok(Map.of(
                    "username", "Admin",
                    "email",    "admin",
                    "phone",    "",
                    "role",     "ADMIN"
            ));
        }

        Optional<UserEntity> opt = userRepository.findByEmail(email);
        if (opt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "User not found"));
        }

        UserEntity user = opt.get();
        return ResponseEntity.ok(Map.of(
                "username", user.getUsername()    != null ? user.getUsername()    : "",
                "email",    user.getEmail(),
                "phone",    user.getPhoneNumber() != null ? user.getPhoneNumber() : "",
                "role",     user.getRole()
        ));
    }

    /* ─────────────────────────────────────────────────────────────────
       UPDATE PROFILE
    ───────────────────────────────────────────────────────────────── */
    @PutMapping("/auth/update")
    public ResponseEntity<?> updateProfile(
            @RequestHeader("Authorization") String authHeader,
            @RequestBody Map<String, String> body) {

        String email = resolveEmail(authHeader);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid token"));
        }

        if ("admin".equals(email)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin profile cannot be updated"));
        }

        UserEntity user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        boolean sensitiveChange = false;

        if (body.containsKey("username")) user.setUsername(body.get("username"));
        if (body.containsKey("phone"))    user.setPhoneNumber(body.get("phone"));

        if (body.containsKey("email") && !body.get("email").equals(user.getEmail())) {
            user.setEmail(body.get("email"));
            sensitiveChange = true;
        }

        if (StringUtils.hasText(body.get("password"))) {
            user.setPassword(body.get("password"));
            sensitiveChange = true;
        }

        userRepository.save(user);

        String token = authHeader.substring(7);
        if (sensitiveChange) {
            tokens.remove(token);
            return ResponseEntity.ok(Map.of("logout", true, "message", "Re-login required"));
        }

        tokens.put(token, user.getEmail());
        return ResponseEntity.ok(Map.of("message", "Profile updated successfully"));
    }

    /* ─────────────────────────────────────────────────────────────────
       DELETE ACCOUNT
    ───────────────────────────────────────────────────────────────── */
    @DeleteMapping("/auth/delete")
    public ResponseEntity<?> deleteAccount(
            @RequestHeader("Authorization") String authHeader) {

        String email = resolveEmail(authHeader);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid token"));
        }

        if ("admin".equals(email)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin account cannot be deleted"));
        }

        userRepository.findByEmail(email).ifPresent(user -> {
            resumeRepository
                    .findByCandidateEmailOrderByUploadedAtDesc(email)
                    .forEach(resumeRepository::delete);
            userRepository.delete(user);
        });

        tokens.remove(authHeader.substring(7));
        return ResponseEntity.ok(Map.of("message", "Account deleted"));
    }

    /* ─────────────────────────────────────────────────────────────────
       ANALYZE FILE  (user's own resume — saves to resumes table)
       HR bulk upload goes to HrController, NOT here.
    ───────────────────────────────────────────────────────────────── */
    @PostMapping("/ai/analyze-file")
    public ResponseEntity<?> analyzeFile(
            @RequestHeader(name = "Authorization", required = false) String authHeader,
            @RequestParam("file") MultipartFile file) {

        try {
            if (file.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "File is empty"));
            }

            Map aiResponse = aiService.analyzeFile(file);

            String email = resolveEmail(authHeader);

            // Save to resumes table — this is the USER's own personal scan history
            // HR candidates are stored in hr_candidates via HrController
            if (email != null && !"admin".equals(email)) {
                ResumeEntity resume = new ResumeEntity();
                resume.setCandidateEmail(email);
                resume.setFilename(file.getOriginalFilename());

                Object atsObj = aiResponse.get("ats_score");
                if (atsObj instanceof Number)
                    resume.setAtsScore(((Number) atsObj).doubleValue());

                Object roleObj = aiResponse.get("recommended_role");
                if (roleObj instanceof String)
                    resume.setRecommendedRole((String) roleObj);

                Object textObj = aiResponse.get("extracted_text");
                if (textObj instanceof String)
                    resume.setExtractedText((String) textObj);

                resumeRepository.save(resume);
            }

            return ResponseEntity.ok(aiResponse);

        } catch (Exception e) {
            return ResponseEntity.status(500)
                    .body(Map.of("error", "Analysis failed: " + e.getMessage()));
        }
    }

    /* ─────────────────────────────────────────────────────────────────
       HISTORY  (user's own scans from resumes table only)
    ───────────────────────────────────────────────────────────────── */
    @GetMapping("/history")
    public ResponseEntity<?> getHistory(
            @RequestHeader(name = "Authorization", required = false) String authHeader) {

        String email = resolveEmail(authHeader);
        if (email == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Unauthorized"));
        }

        List<Map<String, Object>> records = new ArrayList<>();

        resumeRepository
                .findByCandidateEmailOrderByUploadedAtDesc(email)
                .forEach(r -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("id",              r.getId());
                    entry.put("createdAt",       r.getUploadedAt());
                    entry.put("atsScore",        r.getAtsScore());
                    entry.put("jdMatchScore",    r.getJdMatchScore());
                    entry.put("recommendedRole", r.getRecommendedRole());
                    entry.put("filename",        r.getFilename());
                    records.add(entry);
                });

        return ResponseEntity.ok(records);
    }

    /* ─────────────────────────────────────────────────────────────────
       ADMIN STATS
    ───────────────────────────────────────────────────────────────── */
    @GetMapping("/admin/stats")
    public ResponseEntity<?> adminStats(
            @RequestHeader(name = "Authorization", required = false) String authHeader) {

        String email = resolveEmail(authHeader);
        if (email == null || !"admin".equals(email)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Admin access required"));
        }

        Map<String, Long> roles = new LinkedHashMap<>();
        userRepository.findAll().forEach(u -> {
            String r = u.getRole() != null ? u.getRole() : "OTHER";
            roles.merge(r, 1L, Long::sum);
        });

        return ResponseEntity.ok(Map.of(
                "totalScans", resumeRepository.count(),
                "totalUsers", userRepository.count(),
                "roles",      roles
        ));
    }

    /* ─────────────────────────────────────────────────────────────────
       AI FEATURE ENDPOINTS
    ───────────────────────────────────────────────────────────────── */

    @PostMapping("/ai/suggest-skills")
    public ResponseEntity<?> suggestSkills(@RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.ok(aiService.suggestSkills(body));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/ai/project-summary")
    public ResponseEntity<?> generateProjectSummary(@RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.ok(aiService.generateProjectSummary(body));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/ai/jd-suggestions")
    public ResponseEntity<?> suggestJDAdditions(@RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.ok(aiService.suggestJDAdditions(body));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    /* ─────────────────────────────────────────────────────────────────
       HELPERS
    ───────────────────────────────────────────────────────────────── */

    private String resolveEmail(String authHeader) {
        if (!StringUtils.hasText(authHeader) || !authHeader.startsWith("Bearer "))
            return null;
        return tokens.getOrDefault(authHeader.substring(7), null);
    }

    static class User {
        String password;
        String role;
        User(String p, String r) { password = p; role = r; }
    }
}