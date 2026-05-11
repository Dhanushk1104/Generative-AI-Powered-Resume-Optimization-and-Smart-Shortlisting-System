package com.visualflow.repository;

import com.visualflow.model.ShortlistEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ShortlistRepository extends JpaRepository<ShortlistEntity, Long> {

    List<ShortlistEntity> findByStatus(String status);

    List<ShortlistEntity> findAllByOrderByRankingScoreDesc();
}
