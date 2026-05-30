package com.flowmint.splitwise.entity;

import lombok.Getter;
import lombok.Setter;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "expense_shares")
@Getter
@Setter
public class ExpenseShare {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // How much this specific user owes for this expense
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal owedAmount;

    // The expense this share belongs to
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expense_id", nullable = false)
    private Expense expense;

    // The user who owes the money
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
}
