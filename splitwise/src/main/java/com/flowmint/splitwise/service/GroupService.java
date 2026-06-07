package com.flowmint.splitwise.service;

import com.flowmint.splitwise.dto.CreateGroupRequest;
import com.flowmint.splitwise.dto.GroupResponse;
import com.flowmint.splitwise.dto.MemberBalanceDto;
import com.flowmint.splitwise.dto.UpdateGroupRequest;
import com.flowmint.splitwise.entity.Expense;
import com.flowmint.splitwise.entity.Group;
import com.flowmint.splitwise.entity.User;
import com.flowmint.splitwise.repository.ExpenseRepository;
import com.flowmint.splitwise.repository.GroupRepository;
import com.flowmint.splitwise.repository.UserRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GroupService {

    private final GroupRepository groupRepository;
    private final UserRepository userRepository;
    private final BalanceService balanceService;
    private final ExpenseRepository expenseRepository;

    public GroupService(GroupRepository groupRepository, UserRepository userRepository, BalanceService balanceService, ExpenseRepository expenseRepository) {
        this.groupRepository = groupRepository;
        this.userRepository = userRepository;
        this.balanceService = balanceService;
        this.expenseRepository = expenseRepository;
    }

    @Transactional
    public Group createGroup(
            CreateGroupRequest request, String creatorCognitoId, String creatorName, String creatorEmail) {

        User creator = userRepository.findByCognitoId(creatorCognitoId).orElseGet(() -> {
            if (creatorEmail == null || creatorEmail.trim().isEmpty()) {
                throw new IllegalArgumentException("Authenticated Flowmint users must have a valid email address.");
            }
            User newUser = new User();
            newUser.setCognitoId(creatorCognitoId);
            newUser.setName(creatorName != null ? creatorName : "Unknown User");
            newUser.setEmail(creatorEmail);
            return userRepository.save(newUser);
        });

        if (groupRepository.existsByNameAndMembers_Id(request.getName(), creator.getId())) {
            throw new IllegalArgumentException(
                    "You already have a group named '" + request.getName() + "'. Please choose a different name.");
        }

        Group group = new Group();
        group.setName(request.getName());
        group.setDescription(request.getDescription());
        group.setAdminId(creatorCognitoId);
        group.addMember(creator);

        if (request.getMembers() != null) {
            for (CreateGroupRequest.MemberRequest memberReq : request.getMembers()) {
                User userToAdd = null;

                if (memberReq.getEmail() != null && !memberReq.getEmail().isEmpty()) {
                    Optional<User> optionalUser = userRepository.findByEmail(memberReq.getEmail());
                    if (optionalUser.isPresent()) {
                        userToAdd = optionalUser.get();
                    }
                }

                if (userToAdd == null) {
                    userToAdd = new User();
                    userToAdd.setName(memberReq.getName());
                    String email = memberReq.getEmail();
                    userToAdd.setEmail(email != null && !email.trim().isEmpty() ? email.trim() : null);
                    userToAdd.setCognitoId("dummy_" + UUID.randomUUID().toString());
                    userToAdd = userRepository.save(userToAdd);
                }

                group.addMember(userToAdd);
            }
        }

        return groupRepository.save(group);
    }

    @Transactional
    public Group updateGroup(UUID groupId, UpdateGroupRequest request, String requesterCognitoId) {
        Group group = groupRepository.findById(groupId).orElseThrow(() -> new RuntimeException("Group not found"));

        if (request.getName() != null && !request.getName().trim().isEmpty()) {
            group.setName(request.getName());
        }

        if (request.getDescription() != null) {
            group.setDescription(request.getDescription());
        }

        if (request.getMembers() != null) {
            List<User> existingMembers = new ArrayList<>(group.getMembers());
            List<UUID> requestedMemberIds = request.getMembers().stream()
                    .map(UpdateGroupRequest.MemberUpdateRequest::getId)
                    .filter(id -> id != null)
                    .collect(Collectors.toList());

            // Handle removals
            for (User member : existingMembers) {
                if (!requestedMemberIds.contains(member.getId())) {
                    // Check if requester is admin
                    if (!group.getAdminId().equals(requesterCognitoId)) {
                        throw new RuntimeException("Only the group admin can remove members.");
                    }
                    // Check if member has expenses
                    long expenseCount = expenseRepository.countExpensesInvolvingUser(groupId, member.getId());
                    if (expenseCount > 0) {
                        throw new RuntimeException("Cannot remove member '" + member.getName() + "' because they are involved in " + expenseCount + " expenses. Please delete or modify those expenses first.");
                    }
                    group.getMembers().remove(member);
                }
            }

            // Handle additions and updates
            for (UpdateGroupRequest.MemberUpdateRequest memberReq : request.getMembers()) {
                if (memberReq.getId() != null) {
                    // Update existing member if it's a ghost user
                    User existingMember = group.getMembers().stream()
                            .filter(m -> m.getId().equals(memberReq.getId()))
                            .findFirst().orElse(null);

                    if (existingMember != null && existingMember.getCognitoId().startsWith("dummy_")) {
                        existingMember.setName(memberReq.getName());
                        String email = memberReq.getEmail();
                        existingMember.setEmail(email != null && !email.trim().isEmpty() ? email.trim() : null);
                        userRepository.save(existingMember);
                    }
                } else {
                    // Add new member
                    User userToAdd = null;
                    if (memberReq.getEmail() != null && !memberReq.getEmail().isEmpty()) {
                        Optional<User> optionalUser = userRepository.findByEmail(memberReq.getEmail());
                        if (optionalUser.isPresent()) {
                            userToAdd = optionalUser.get();
                        }
                    }

                    if (userToAdd == null) {
                        userToAdd = new User();
                        userToAdd.setName(memberReq.getName());
                        String email = memberReq.getEmail();
                        userToAdd.setEmail(email != null && !email.trim().isEmpty() ? email.trim() : null);
                        userToAdd.setCognitoId("dummy_" + UUID.randomUUID().toString());
                        userToAdd = userRepository.save(userToAdd);
                    }

                    if (!group.getMembers().contains(userToAdd)) {
                        group.addMember(userToAdd);
                    }
                }
            }
        }

        return groupRepository.save(group);
    }

    @Transactional
    public void leaveGroup(UUID groupId, String cognitoId) {
        Group group = groupRepository.findByIdAndMembers_CognitoId(groupId, cognitoId)
                .orElseThrow(() -> new RuntimeException("Group not found or you are not a member"));
        
        User leavingUser = userRepository.findByCognitoId(cognitoId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Delete all expenses involving this user in this group
        List<Expense> userExpenses = expenseRepository.findExpensesInvolvingUser(groupId, leavingUser.getId());
        expenseRepository.deleteAll(userExpenses);

        group.getMembers().remove(leavingUser);
        groupRepository.save(group);
    }

    @Transactional(readOnly = true)
    public List<GroupResponse> getGroups(String cognitoId) {
        List<Group> groups = groupRepository.findByMembers_CognitoId(cognitoId);
        return groups.stream()
                .map(group -> {
                    List<MemberBalanceDto> balances = balanceService.calculateBalances(group);
                    return GroupResponse.builder()
                            .id(group.getId())
                            .name(group.getName())
                            .description(group.getDescription())
                            .createdAt(group.getCreatedAt())
                            .adminId(group.getAdminId())
                            .members(balances)
                            .build();
                })
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public GroupResponse getGroupDetails(UUID groupId, String cognitoId) {
        Group group = groupRepository
                .findByIdAndMembers_CognitoId(groupId, cognitoId)
                .orElseThrow(() -> new RuntimeException("Group not found or you do not have access"));

        List<MemberBalanceDto> balances = balanceService.calculateBalances(group);

        return GroupResponse.builder()
                .id(group.getId())
                .name(group.getName())
                .description(group.getDescription())
                .createdAt(group.getCreatedAt())
                .adminId(group.getAdminId())
                .members(balances)
                .build();
    }

    @Transactional
    public void deleteGroup(UUID groupId, String cognitoId) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        if (!group.getAdminId().equals(cognitoId)) {
            throw new RuntimeException("Only the group admin can delete the group");
        }

        List<Expense> expenses = expenseRepository.findByGroupIdOrderByCreatedAtDesc(groupId);
        expenseRepository.deleteAll(expenses);

        groupRepository.delete(group);
    }
}
