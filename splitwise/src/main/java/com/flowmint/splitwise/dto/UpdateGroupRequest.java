package com.flowmint.splitwise.dto;

import java.util.List;
import lombok.Data;

@Data
public class UpdateGroupRequest {

    // Optional fields: only the fields provided will be updated
    private String name;
    private String description;

    // Full list of members to sync
    private List<MemberUpdateRequest> members;

    @Data
    public static class MemberUpdateRequest {
        private java.util.UUID id; // If null, it's a new member to add
        private String name;
        private String email;
    }
}
