package com.flowmint.splitwise.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class GroupResponse {
    private UUID id;
    private String name;
    private String description;
    private LocalDateTime createdAt;
    private String adminId;
    private List<MemberBalanceDto> members;
}
