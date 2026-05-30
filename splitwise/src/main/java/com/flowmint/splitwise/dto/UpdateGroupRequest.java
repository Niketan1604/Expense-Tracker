package com.flowmint.splitwise.dto;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;
import java.util.List;

@Data
public class UpdateGroupRequest {
    
    // Optional fields: only the fields provided will be updated
    private String name;
    private String description;
    
    // List of NEW members to add to the group
    private List<CreateGroupRequest.MemberRequest> newMembers;
}
