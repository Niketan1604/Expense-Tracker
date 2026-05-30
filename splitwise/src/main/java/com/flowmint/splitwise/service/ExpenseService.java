package com.flowmint.splitwise.service;

import com.flowmint.splitwise.dto.AddExpenseRequest;
import com.flowmint.splitwise.entity.*;
import com.flowmint.splitwise.repository.ExpenseRepository;
import com.flowmint.splitwise.repository.GroupRepository;
import com.flowmint.splitwise.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Service
public class ExpenseService {

    private final ExpenseRepository expenseRepository;
    private final GroupRepository groupRepository;
    private final UserRepository userRepository;

    public ExpenseService(ExpenseRepository expenseRepository, GroupRepository groupRepository,
            UserRepository userRepository) {
        this.expenseRepository = expenseRepository;
        this.groupRepository = groupRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public Expense addExpense(AddExpenseRequest request) {

        // 1. Validate the Group and the User who paid
        Group group = groupRepository.findById(request.getGroupId())
                .orElseThrow(() -> new RuntimeException("Group not found"));

        // Fetch the user who ACTUALLY paid (e.g. Bob) using the ID from the request body
        User paidBy = userRepository.findById(request.getPaidByUserId())
                .orElseThrow(() -> new RuntimeException("The specified payer user does not exist"));

        // 2. Create the base Expense
        Expense expense = new Expense();
        expense.setDescription(request.getDescription());
        expense.setTotalAmount(request.getTotalAmount());
        expense.setCurrency(request.getCurrency().toUpperCase());
        expense.setSplitType(request.getSplitType());
        expense.setGroup(group);
        expense.setPaidBy(paidBy);
        expense.setFlowmintExpenseId(request.getFlowmintExpenseId());

        // 3. Process the splits based on the SplitType
        int numUsers = request.getSplits().size();
        if (numUsers == 0) {
            throw new RuntimeException("Cannot split an expense with 0 users");
        }

        BigDecimal totalAmount = request.getTotalAmount();
        BigDecimal runningTotal = BigDecimal.ZERO; // We use this to check for rounding errors at the end!

        for (int i = 0; i < request.getSplits().size(); i++) {
            AddExpenseRequest.UserSplit splitReq = request.getSplits().get(i);

            User user = userRepository.findById(splitReq.getUserId())
                    .orElseThrow(() -> new RuntimeException("User in split not found: " + splitReq.getUserId()));

            BigDecimal owedAmount = BigDecimal.ZERO;

            switch (request.getSplitType()) {
                case EQUAL:
                    // Divide total by number of users, round to 2 decimal places
                    owedAmount = totalAmount.divide(new BigDecimal(numUsers), 2, RoundingMode.HALF_UP);

                    // The last person gets whatever pennies are left over to ensure it adds up
                    // perfectly to the total!
                    // E.g., $100 / 3 = 33.33, 33.33, 33.34
                    if (i == request.getSplits().size() - 1) {
                        owedAmount = totalAmount.subtract(runningTotal);
                    }
                    break;

                case EXACT:
                    owedAmount = splitReq.getValue();
                    break;

                case PERCENTAGE:
                    // value is e.g. 25 for 25% -> (Total * 25) / 100
                    owedAmount = totalAmount.multiply(splitReq.getValue())
                            .divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);
                    // Again, handle penny leftovers for the last person
                    if (i == request.getSplits().size() - 1) {
                        owedAmount = totalAmount.subtract(runningTotal);
                    }
                    break;

                case SHARES:
                    // First we need to find the total number of shares
                    BigDecimal totalShares = request.getSplits().stream()
                            .map(AddExpenseRequest.UserSplit::getValue)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);

                    // (Total * User's Shares) / Total Shares
                    owedAmount = totalAmount.multiply(splitReq.getValue())
                            .divide(totalShares, 2, RoundingMode.HALF_UP);

                    if (i == request.getSplits().size() - 1) {
                        owedAmount = totalAmount.subtract(runningTotal);
                    }
                    break;
            }

            // Create the ExpenseShare and add it to the Expense
            ExpenseShare share = new ExpenseShare();
            share.setUser(user);
            share.setOwedAmount(owedAmount);
            expense.addShare(share);

            runningTotal = runningTotal.add(owedAmount);
        }

        // 4. Final Validation for EXACT splits
        if (request.getSplitType() == SplitType.EXACT) {
            // The exact amounts typed in MUST perfectly equal the total bill
            if (runningTotal.compareTo(totalAmount) != 0) {
                throw new RuntimeException(
                        "Exact splits sum (" + runningTotal + ") do not equal total amount (" + totalAmount + ")");
            }
        }

        // 5. Save everything!
        // Because of CascadeType.ALL on the Expense entity, this single save() call
        // will save the Expense AND all the ExpenseShares into the database
        // automatically.
        return expenseRepository.save(expense);
    }
}
