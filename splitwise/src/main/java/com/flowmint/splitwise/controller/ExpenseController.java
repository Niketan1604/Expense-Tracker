package com.flowmint.splitwise.controller;

import com.flowmint.splitwise.dto.AddExpenseRequest;
import com.flowmint.splitwise.dto.ExpenseResponse;
import com.flowmint.splitwise.service.ExpenseService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/expenses")
@RequiredArgsConstructor
public class ExpenseController {

    private final ExpenseService expenseService;

    @PostMapping
    public ResponseEntity<ExpenseResponse> addExpense(
            @Valid @RequestBody AddExpenseRequest request, @AuthenticationPrincipal Jwt jwt) {

        ExpenseResponse response = expenseService.addExpense(request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{expenseId}")
    public ResponseEntity<ExpenseResponse> updateExpense(
            @PathVariable UUID expenseId,
            @Valid @RequestBody AddExpenseRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        ExpenseResponse response = expenseService.updateExpense(expenseId, request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/group/{groupId}")
    public ResponseEntity<List<ExpenseResponse>> getGroupExpenses(
            @PathVariable UUID groupId, @AuthenticationPrincipal Jwt jwt) {
        String cognitoId = jwt.getSubject();
        return ResponseEntity.ok(expenseService.getExpensesForGroup(groupId, cognitoId));
    }

    @DeleteMapping("/{expenseId}")
    public ResponseEntity<Void> deleteExpense(@PathVariable UUID expenseId) {
        expenseService.deleteExpense(expenseId);
        return ResponseEntity.ok().build();
    }
}
