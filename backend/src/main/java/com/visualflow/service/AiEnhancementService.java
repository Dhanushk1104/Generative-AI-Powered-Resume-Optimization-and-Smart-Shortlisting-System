package com.visualflow.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

@Service
public class AiEnhancementService {

    private final WebClient webClient;

    public AiEnhancementService(
            @Value("${ai.service.base-url:http://localhost:8000}") String baseUrl) {

        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofSeconds(60));

        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    /* ═══════════════════════════════════════════════════════════════════
       PHASE 1 — Analyse resume file (called by HrController.analyzeFile)
       Forwards the uploaded MultipartFile to FastAPI /analyze-file
    ═══════════════════════════════════════════════════════════════════ */
    public Map analyzeFile(MultipartFile file) throws IOException {
        ByteArrayResource fileResource = new ByteArrayResource(file.getBytes()) {
            @Override
            public String getFilename() {
                return file.getOriginalFilename();
            }
        };

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", fileResource);

        return webClient.post()
                .uri("/analyze-file")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(BodyInserters.fromMultipartData(body))
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }

    /* ═══════════════════════════════════════════════════════════════════
       PHASE 2 — EXISTING: Rewrite Resume
    ═══════════════════════════════════════════════════════════════════ */
    public Map rewriteResume(Map<String, Object> input) {
        return webClient.post()
                .uri("/rewrite")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(input)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }

    /* ═══════════════════════════════════════════════════════════════════
       PHASE 2 — EXISTING: Enhance Projects
    ═══════════════════════════════════════════════════════════════════ */
    public Map enhanceProjects(Map<String, Object> input) {
        return webClient.post()
                .uri("/project-enhance")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(input)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }

    /* ═══════════════════════════════════════════════════════════════════
       PHASE 2 — EXISTING: Tailor Resume to Job Description
    ═══════════════════════════════════════════════════════════════════ */
    public Map tailorResume(Map<String, Object> input) {
        return webClient.post()
                .uri("/jd-tailor")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(input)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }

    /* ═══════════════════════════════════════════════════════════════════
       NEW — Suggest Skills  (ResumeEnhancer: Rewrite tab)
       Body: { resumeText: "" }
       Returns: { missing_technical, trending, soft_skills,
                  certifications, role_gap_analysis }
    ═══════════════════════════════════════════════════════════════════ */
    public Map suggestSkills(Map<String, Object> input) {
        return webClient.post()
                .uri("/suggest-skills")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(input)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }

    /* ═══════════════════════════════════════════════════════════════════
       NEW — Generate Project Summary  (ResumeEnhancer: Projects tab)
       Body: { title: "...", techStack: "..." }
       Returns: { one_liner, full_summary, highlights, impact_metrics }
    ═══════════════════════════════════════════════════════════════════ */
    public Map generateProjectSummary(Map<String, Object> input) {
        return webClient.post()
                .uri("/project-summary")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(input)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }

    /* ═══════════════════════════════════════════════════════════════════
       NEW — Suggest JD Additions  (ResumeEnhancer: Tailor tab)
       Body: { resumeText: "", jobDescription: "..." }
       Returns: { skills_to_add, projects_to_add,
                  keywords_to_include, action_plan }
    ═══════════════════════════════════════════════════════════════════ */
    public Map suggestJDAdditions(Map<String, Object> input) {
        return webClient.post()
                .uri("/jd-suggestions")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(input)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }
}