package com.flowmint.splitwise.dto;

import java.math.BigDecimal;
import java.util.UUID;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class MemberBalanceDto {
    private UUID userId;
    private String name;
    private String email;
    // Positive means they are owed money (credit). Negative means they owe money (debt).
    private BigDecimal netBalance;
}
