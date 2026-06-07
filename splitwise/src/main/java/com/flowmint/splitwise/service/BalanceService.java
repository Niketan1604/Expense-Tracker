package com.flowmint.splitwise.service;

import com.flowmint.splitwise.dto.MemberBalanceDto;
import com.flowmint.splitwise.entity.Expense;
import com.flowmint.splitwise.entity.ExpenseShare;
import com.flowmint.splitwise.entity.Group;
import com.flowmint.splitwise.entity.User;
import com.flowmint.splitwise.repository.ExpenseRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class BalanceService {

    private final ExpenseRepository expenseRepository;

    public List<MemberBalanceDto> calculateBalances(Group group) {
        List<Expense> expenses = expenseRepository.findByGroupIdOrderByCreatedAtDesc(group.getId());

        // Map to keep track of each user's net balance
        Map<UUID, BigDecimal> balances = new HashMap<>();

        // Initialize all members with a 0 balance
        for (User member : group.getMembers()) {
            balances.put(member.getId(), BigDecimal.ZERO);
        }

        for (Expense expense : expenses) {
            UUID payerId = expense.getPaidBy().getId();

            // Add the total amount paid to the payer's balance
            // Only if they are still in the group (or we can just track it anyway)
            balances.put(
                    payerId, balances.getOrDefault(payerId, BigDecimal.ZERO).add(expense.getTotalAmount()));

            // Subtract the owed amount for each share
            for (ExpenseShare share : expense.getShares()) {
                UUID debtorId = share.getUser().getId();
                balances.put(
                        debtorId,
                        balances.getOrDefault(debtorId, BigDecimal.ZERO).subtract(share.getOwedAmount()));
            }
        }

        // Build the DTOs
        List<MemberBalanceDto> memberBalances = new ArrayList<>();
        for (User member : group.getMembers()) {
            memberBalances.add(MemberBalanceDto.builder()
                    .userId(member.getId())
                    .name(member.getName())
                    .email(member.getEmail())
                    .netBalance(balances.getOrDefault(member.getId(), BigDecimal.ZERO))
                    .build());
        }

        return memberBalances;
    }
}
