package com.flowmint.splitwise.repository;

import com.flowmint.splitwise.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {
    
    // Spring Boot magically writes the SQL for this based purely on the method name!
    Optional<User> findByEmail(String email);
    
    Optional<User> findByCognitoId(String cognitoId);
}
