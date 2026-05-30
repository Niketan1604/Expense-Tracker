package com.flowmint.splitwise.controller;

import com.flowmint.splitwise.dto.AddExpenseRequest;
import com.flowmint.splitwise.entity.Expense;
import com.flowmint.splitwise.service.ExpenseService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/expenses")
@RequiredArgsConstructor
public class ExpenseController {

    private final ExpenseService expenseService;

    @PostMapping
    public ResponseEntity<Expense> addExpense(
            @Valid @RequestBody AddExpenseRequest request,
            @AuthenticationPrincipal Jwt jwt) {

        Expense createdExpense = expenseService.addExpense(request);
        return ResponseEntity.ok(createdExpense);
    }
}
