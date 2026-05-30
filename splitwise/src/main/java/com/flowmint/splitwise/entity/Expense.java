package com.flowmint.splitwise.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "expenses")
@Getter
@Setter
public class Expense {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String description;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;

    @Column(nullable = false, length = 3)
    private String currency; // e.g., "USD", "INR", "EUR"

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SplitType splitType;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // The group this expense belongs to
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id", nullable = false)
    private Group group;

    // The person who actually paid the bill
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paid_by_user_id", nullable = false)
    private User paidBy;

    // One Expense has Many ExpenseShares (e.g., one dinner has 4 people owing money)
    // CascadeType.ALL means if we delete the Expense, it deletes all the shares too.
    @OneToMany(mappedBy = "expense", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ExpenseShare> shares = new ArrayList<>();

    // Optional link back to the core Flowmint Node.js application
    @Column(name = "flowmint_expense_id")
    private String flowmintExpenseId;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public void addShare(ExpenseShare share) {
        shares.add(share);
        share.setExpense(this);
    }
}
