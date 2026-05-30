package com.flowmint.splitwise.dto;

import lombok.Data;
import com.flowmint.splitwise.entity.SplitType;
import jakarta.validation.constraints.*;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
public class AddExpenseRequest {

    @NotBlank(message = "Description is required")
    private String description;

    @NotNull(message = "Total amount is required")
    @Positive(message = "Total amount must be greater than zero")
    private BigDecimal totalAmount;

    @NotBlank(message = "Currency is required")
    @Size(min = 3, max = 3, message = "Currency must be a 3-letter code (e.g., USD)")
    private String currency;

    @NotNull(message = "Group ID is required")
    @NotNull(message = "Group ID is required")
    private UUID groupId;
    
    @NotNull(message = "Paid By User ID is required")
    private UUID paidByUserId;

    @NotNull(message = "Split type is required")
    private SplitType splitType;

    private String flowmintExpenseId; // Optional link to main app

    @NotEmpty(message = "Splits cannot be empty")
    @Valid // Validates the nested objects inside the list
    private List<UserSplit> splits;

    @Data
    public static class UserSplit {
        @NotNull(message = "User ID is required")
        private UUID userId;
        
        @Positive(message = "Split value must be greater than zero")
        private BigDecimal value;
    }
}
