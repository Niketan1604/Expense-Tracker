package com.flowmint.splitwise.repository;

import com.flowmint.splitwise.entity.Group;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GroupRepository extends JpaRepository<Group, UUID> {
    
    // Finds all groups that a specific user belongs to.
    List<Group> findByMembers_Id(UUID userId);

    // Checks if a group with the given name already exists for a specific user (case-sensitive)
    boolean existsByNameAndMembers_Id(String name, UUID userId);
}
