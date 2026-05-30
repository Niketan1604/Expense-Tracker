package com.flowmint.splitwise.repository;

import com.flowmint.splitwise.entity.Expense;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

    List<Expense> findByGroupId(UUID groupId);

    List<Expense> findByPaidById(UUID paidByUserId);
}
