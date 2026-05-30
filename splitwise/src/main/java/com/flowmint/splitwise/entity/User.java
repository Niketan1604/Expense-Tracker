package com.flowmint.splitwise.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "users") // "user" is a reserved keyword in Postgres, so we use "users"
@Getter
@Setter
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // This could map to your AWS Cognito User ID if you want to link them later
    @Column(nullable = false, unique = true)
    private String cognitoId;

    @Column(nullable = false)
    private String name;

    @Column(unique = true)
    private String email;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // This runs automatically right before the entity is saved for the first time
    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
