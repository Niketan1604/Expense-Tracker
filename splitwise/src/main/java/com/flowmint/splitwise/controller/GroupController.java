package com.flowmint.splitwise.controller;

import com.flowmint.splitwise.dto.CreateGroupRequest;
import com.flowmint.splitwise.dto.UpdateGroupRequest;
import com.flowmint.splitwise.entity.Group;
import com.flowmint.splitwise.service.GroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
public class GroupController {

    private final GroupService groupService;

    @PostMapping
    public ResponseEntity<Group> createGroup(
            @Valid @RequestBody CreateGroupRequest request, @AuthenticationPrincipal Jwt jwt) {

        String cognitoId = jwt.getSubject();
        String name = jwt.getClaimAsString("name");
        String email = jwt.getClaimAsString("email");

        Group createdGroup = groupService.createGroup(request, cognitoId, name, email);
        return ResponseEntity.ok(createdGroup);
    }

    @PutMapping("/{groupId}")
    public ResponseEntity<Group> updateGroup(
            @PathVariable java.util.UUID groupId,
            @Valid @RequestBody UpdateGroupRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        String cognitoId = jwt.getSubject();
        Group updatedGroup = groupService.updateGroup(groupId, request, cognitoId);
        return ResponseEntity.ok(updatedGroup);
    }

    @PostMapping("/{groupId}/leave")
    public ResponseEntity<Void> leaveGroup(@PathVariable java.util.UUID groupId, @AuthenticationPrincipal Jwt jwt) {
        String cognitoId = jwt.getSubject();
        groupService.leaveGroup(groupId, cognitoId);
        return ResponseEntity.ok().build();
    }

    @GetMapping
    public ResponseEntity<java.util.List<com.flowmint.splitwise.dto.GroupResponse>> getGroups(
            @AuthenticationPrincipal Jwt jwt) {
        String cognitoId = jwt.getSubject();
        return ResponseEntity.ok(groupService.getGroups(cognitoId));
    }

    @GetMapping("/{groupId}")
    public ResponseEntity<com.flowmint.splitwise.dto.GroupResponse> getGroup(
            @PathVariable java.util.UUID groupId, @AuthenticationPrincipal Jwt jwt) {
        String cognitoId = jwt.getSubject();
        return ResponseEntity.ok(groupService.getGroupDetails(groupId, cognitoId));
    }

    @DeleteMapping("/{groupId}")
    public ResponseEntity<Void> deleteGroup(@PathVariable java.util.UUID groupId, @AuthenticationPrincipal Jwt jwt) {
        String cognitoId = jwt.getSubject();
        groupService.deleteGroup(groupId, cognitoId);
        return ResponseEntity.ok().build();
    }
}
