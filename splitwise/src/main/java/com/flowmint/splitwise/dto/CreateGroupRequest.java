package com.flowmint.splitwise.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import lombok.Data;

@Data
public class CreateGroupRequest {

    @NotBlank(message = "Group name is required")
    private String name;

    private String description;

    // Members to add (email is optional)
    @Valid
    private List<MemberRequest> members;

    @Data
    public static class MemberRequest {
        private String name;
        private String email;
    }
}
