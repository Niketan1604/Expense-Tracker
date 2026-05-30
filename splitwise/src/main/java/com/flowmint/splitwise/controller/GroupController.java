package com.flowmint.splitwise.controller;

import com.flowmint.splitwise.dto.CreateGroupRequest;
import com.flowmint.splitwise.dto.UpdateGroupRequest;
import com.flowmint.splitwise.entity.Group;
import com.flowmint.splitwise.service.GroupService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
public class GroupController {

    private final GroupService groupService;

    @PostMapping
    public ResponseEntity<Group> createGroup(
            @Valid @RequestBody CreateGroupRequest request,
            @AuthenticationPrincipal Jwt jwt) {

        String cognitoId = jwt.getSubject();
        String name = jwt.getClaimAsString("name");
        String email = jwt.getClaimAsString("email");

        Group createdGroup = groupService.createGroup(request, cognitoId, name, email);
        return ResponseEntity.ok(createdGroup);
    }

    @PutMapping("/{groupId}")
    public ResponseEntity<Group> updateGroup(
            @PathVariable java.util.UUID groupId,
            @Valid @RequestBody UpdateGroupRequest request) {

        Group updatedGroup = groupService.updateGroup(groupId, request);
        return ResponseEntity.ok(updatedGroup);
    }
}
