package com.flowmint.splitwise.repository;

import com.flowmint.splitwise.entity.Expense;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

    List<Expense> findByGroupIdOrderByCreatedAtDesc(UUID groupId);

    List<Expense> findByPaidById(UUID paidByUserId);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(e) FROM Expense e LEFT JOIN e.shares s WHERE e.group.id = :groupId AND (e.paidBy.id = :userId OR s.user.id = :userId)")
    long countExpensesInvolvingUser(@org.springframework.data.repository.query.Param("groupId") UUID groupId, @org.springframework.data.repository.query.Param("userId") UUID userId);

    @org.springframework.data.jpa.repository.Query("SELECT DISTINCT e FROM Expense e LEFT JOIN e.shares s WHERE e.group.id = :groupId AND (e.paidBy.id = :userId OR s.user.id = :userId)")
    List<Expense> findExpensesInvolvingUser(@org.springframework.data.repository.query.Param("groupId") UUID groupId, @org.springframework.data.repository.query.Param("userId") UUID userId);
}
