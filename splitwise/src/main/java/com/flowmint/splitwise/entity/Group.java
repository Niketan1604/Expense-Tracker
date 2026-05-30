package com.flowmint.splitwise.entity;

import lombok.Getter;
import lombok.Setter;
import jakarta.persistence.*;
import java.util.UUID;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.HashSet;

@Entity
@Table(name = "groups")
@Getter
@Setter
public class Group {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // A Group can have many Users, and a User can be in many Groups (Many-to-Many)
    @ManyToMany
    @JoinTable(
        name = "group_members", // This creates a junction table linking groups and users
        joinColumns = @JoinColumn(name = "group_id"),
        inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private Set<User> members = new HashSet<>();

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    // Helper methods for managing the relationship
    public void addMember(User user) {
        this.members.add(user);
    }
}
