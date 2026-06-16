package com.flowmint.splitwise.dto;

import com.flowmint.splitwise.entity.SplitType;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ExpenseResponse {
    private UUID id;
    private String description;
    private BigDecimal totalAmount;
    private String currency;
    private SplitType splitType;
    private LocalDateTime createdAt;
    private UUID paidByUserId;
    private String paidByUserName;
    private LocalDateTime updatedAt;
    private String updatedByUserName;
    private Boolean isTransfer;
    private String category;
    private List<ExpenseShareDto> shares;

    @Data
    @Builder
    public static class ExpenseShareDto {
        private UUID userId;
        private String userName;
        private BigDecimal owedAmount;
    }
}
