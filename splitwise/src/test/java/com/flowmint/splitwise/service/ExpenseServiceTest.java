package com.flowmint.splitwise.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.flowmint.splitwise.dto.AddExpenseRequest;
import com.flowmint.splitwise.entity.*;
import com.flowmint.splitwise.repository.ExpenseRepository;
import com.flowmint.splitwise.repository.GroupRepository;
import com.flowmint.splitwise.repository.UserRepository;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ExpenseServiceTest {

    @Mock
    private ExpenseRepository expenseRepository;

    @Mock
    private GroupRepository groupRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private ExpenseService expenseService;

    private User paidBy;
    private User user1;
    private User user2;
    private User user3;
    private Group group;

    @BeforeEach
    void setUp() {
        paidBy = new User();
        paidBy.setId(UUID.randomUUID());
        paidBy.setCognitoId("cognito-payer");

        user1 = new User();
        user1.setId(UUID.randomUUID());
        user2 = new User();
        user2.setId(UUID.randomUUID());
        user3 = new User();
        user3.setId(UUID.randomUUID());

        group = new Group();
        group.setId(UUID.randomUUID());
    }

    @Test
    void testEqualSplitWithPennyRounding() {
        // Arrange: 3 people split $100
        AddExpenseRequest request = new AddExpenseRequest();
        request.setGroupId(group.getId());
        request.setPaidByUserId(paidBy.getId());
        request.setTotalAmount(new BigDecimal("100.00"));
        request.setCurrency("USD");
        request.setSplitType(SplitType.EQUAL);

        AddExpenseRequest.UserSplit s1 = new AddExpenseRequest.UserSplit();
        s1.setUserId(user1.getId());
        AddExpenseRequest.UserSplit s2 = new AddExpenseRequest.UserSplit();
        s2.setUserId(user2.getId());
        AddExpenseRequest.UserSplit s3 = new AddExpenseRequest.UserSplit();
        s3.setUserId(user3.getId());
        request.setSplits(Arrays.asList(s1, s2, s3));

        // Mock database responses
        when(groupRepository.findById(group.getId())).thenReturn(Optional.of(group));
        when(userRepository.findById(paidBy.getId())).thenReturn(Optional.of(paidBy));
        when(userRepository.findById(user1.getId())).thenReturn(Optional.of(user1));
        when(userRepository.findById(user2.getId())).thenReturn(Optional.of(user2));
        when(userRepository.findById(user3.getId())).thenReturn(Optional.of(user3));

        when(expenseRepository.save(any(Expense.class))).thenAnswer(i -> i.getArguments()[0]);

        // Act
        expenseService.addExpense(request);

        // Assert: Capture the Expense object that was passed to expenseRepository.save()
        ArgumentCaptor<Expense> captor = ArgumentCaptor.forClass(Expense.class);
        verify(expenseRepository).save(captor.capture());
        Expense savedExpense = captor.getValue();

        List<ExpenseShare> shares = savedExpense.getShares();
        assertEquals(3, shares.size());

        // Check penny rounding (100 / 3 = 33.33, 33.33, 33.34)
        assertEquals(new BigDecimal("33.33"), shares.get(0).getOwedAmount());
        assertEquals(new BigDecimal("33.33"), shares.get(1).getOwedAmount());
        assertEquals(
                new BigDecimal("33.34"), shares.get(2).getOwedAmount()); // The last person gets the leftover penny!
    }

    @Test
    void testExactSplitValidationFails() {
        // Arrange: Total is 100, but users only typed in 40 + 40 = 80
        AddExpenseRequest request = new AddExpenseRequest();
        request.setGroupId(group.getId());
        request.setPaidByUserId(paidBy.getId());
        request.setTotalAmount(new BigDecimal("100.00"));
        request.setCurrency("USD");
        request.setSplitType(SplitType.EXACT);

        AddExpenseRequest.UserSplit s1 = new AddExpenseRequest.UserSplit();
        s1.setUserId(user1.getId());
        s1.setValue(new BigDecimal("40.00"));

        AddExpenseRequest.UserSplit s2 = new AddExpenseRequest.UserSplit();
        s2.setUserId(user2.getId());
        s2.setValue(new BigDecimal("40.00"));

        request.setSplits(Arrays.asList(s1, s2));

        when(groupRepository.findById(group.getId())).thenReturn(Optional.of(group));
        when(userRepository.findById(paidBy.getId())).thenReturn(Optional.of(paidBy));
        when(userRepository.findById(user1.getId())).thenReturn(Optional.of(user1));
        when(userRepository.findById(user2.getId())).thenReturn(Optional.of(user2));

        // Act & Assert
        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            expenseService.addExpense(request);
        });

        assertEquals("Exact splits sum (80.00) do not equal total amount (100.00)", exception.getMessage());
        // Verify save was NEVER called because validation failed
        verify(expenseRepository, never()).save(any());
    }

    @Test
    void testSharesSplit() {
        // Arrange: $1500 Rent. User 1 pays 2 shares, User 2 pays 1 share.
        AddExpenseRequest request = new AddExpenseRequest();
        request.setGroupId(group.getId());
        request.setPaidByUserId(paidBy.getId());
        request.setTotalAmount(new BigDecimal("1500.00"));
        request.setCurrency("USD");
        request.setSplitType(SplitType.SHARES);

        AddExpenseRequest.UserSplit s1 = new AddExpenseRequest.UserSplit();
        s1.setUserId(user1.getId());
        s1.setValue(new BigDecimal("2")); // 2 shares

        AddExpenseRequest.UserSplit s2 = new AddExpenseRequest.UserSplit();
        s2.setUserId(user2.getId());
        s2.setValue(new BigDecimal("1")); // 1 share

        request.setSplits(Arrays.asList(s1, s2));

        when(groupRepository.findById(group.getId())).thenReturn(Optional.of(group));
        when(userRepository.findById(paidBy.getId())).thenReturn(Optional.of(paidBy));
        when(userRepository.findById(user1.getId())).thenReturn(Optional.of(user1));
        when(userRepository.findById(user2.getId())).thenReturn(Optional.of(user2));

        when(expenseRepository.save(any(Expense.class))).thenAnswer(i -> i.getArguments()[0]);

        // Act
        expenseService.addExpense(request);

        // Assert
        ArgumentCaptor<Expense> captor = ArgumentCaptor.forClass(Expense.class);
        verify(expenseRepository).save(captor.capture());
        Expense savedExpense = captor.getValue();

        assertEquals(new BigDecimal("1000.00"), savedExpense.getShares().get(0).getOwedAmount());
        assertEquals(new BigDecimal("500.00"), savedExpense.getShares().get(1).getOwedAmount());
    }
}
