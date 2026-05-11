package com.visualflow.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.Map;

/**
 * HrAiService
 * Proxies the four HR AI endpoints: Spring Boot → FastAPI.
 * Placed in the service/ folder alongside AiEnhancementService.
 */
@Service
public class HrAiService {

    private final WebClient webClient;

    public HrAiService(
            @Value("${ai.service.base-url:http://localhost:8000}") String baseUrl) {
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(
                        HttpClient.create().responseTimeout(Duration.ofSeconds(60))
                ))
                .build();
    }

    /**
     * POST /hr/rank
     * Input:  { candidates: [ { email, atsScore, ... } ] }
     * Output: { ranked_candidates: [ { rank, email, rank_score, status } ] }
     */
    public Map rankCandidates(Map<String, Object> input) {
        return webClient.post()
                .uri("/hr/rank")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(input)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }

    /**
     * POST /hr/cluster
     * Input:  { candidates: [...], n_clusters?: int }
     * Output: { clusters, total_clusters, cluster_summary }
     */
    public Map clusterCandidates(Map<String, Object> input) {
        return webClient.post()
                .uri("/hr/cluster")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(input)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }

    /**
     * POST /hr/auto-shortlist
     * Input:  { candidates: [...], threshold?: int }
     * Output: { shortlisted, pending, rejected, summary }
     */
    public Map autoShortlistAi(Map<String, Object> input) {
        return webClient.post()
                .uri("/hr/auto-shortlist")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(input)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }

    /**
     * POST /hr/insights
     * Input:  { candidates: [...] }
     * Output: { total_candidates, average_ats_score, top_skills,
     *           role_distribution, recommendations }
     */
    public Map generateInsights(Map<String, Object> input) {
        return webClient.post()
                .uri("/hr/insights")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(input)
                .retrieve()
                .bodyToMono(Map.class)
                .block();
    }
}