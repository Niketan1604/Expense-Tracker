package com.flowmint.splitwise.repository;

import com.flowmint.splitwise.entity.ExpenseShare;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExpenseShareRepository extends JpaRepository<ExpenseShare, UUID> {

    List<ExpenseShare> findByUserId(UUID userId);

    List<ExpenseShare> findByExpenseId(UUID expenseId);
}
