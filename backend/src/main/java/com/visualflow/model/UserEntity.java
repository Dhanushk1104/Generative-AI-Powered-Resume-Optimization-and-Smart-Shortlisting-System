package com.visualflow.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class UserEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String password;

    @Column(nullable = false)
    private String role;

    private String username;

    private String phoneNumber;

    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    /* ── Constructors ─────────────────────────────── */
    public UserEntity() {}

    public UserEntity(String email, String password, String role) {
        this.email    = email;
        this.password = password;
        this.role     = role;
    }

    /* ── Getters ──────────────────────────────────── */
    public Long          getId()          { return id; }
    public String        getEmail()       { return email; }
    public String        getPassword()    { return password; }
    public String        getRole()        { return role; }
    public String        getUsername()    { return username; }
    public String        getPhoneNumber() { return phoneNumber; }
    public LocalDateTime getCreatedAt()   { return createdAt; }

    /* ── Setters ──────────────────────────────────── */
    public void setId(Long id)                  { this.id = id; }
    public void setEmail(String email)          { this.email = email; }
    public void setPassword(String password)    { this.password = password; }
    public void setRole(String role)            { this.role = role; }
    public void setUsername(String username)    { this.username = username; }
    public void setPhoneNumber(String phone)    { this.phoneNumber = phone; }
    public void setCreatedAt(LocalDateTime t)   { this.createdAt = t; }
}
