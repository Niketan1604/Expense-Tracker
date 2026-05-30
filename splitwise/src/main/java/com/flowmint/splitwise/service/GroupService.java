package com.flowmint.splitwise.service;

import com.flowmint.splitwise.dto.CreateGroupRequest;
import com.flowmint.splitwise.entity.Group;
import com.flowmint.splitwise.entity.User;
import com.flowmint.splitwise.repository.GroupRepository;
import com.flowmint.splitwise.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
public class GroupService {

    private final GroupRepository groupRepository;
    private final UserRepository userRepository;

    // Spring automatically injects the repositories here (Dependency Injection)
    public GroupService(GroupRepository groupRepository, UserRepository userRepository) {
        this.groupRepository = groupRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public Group createGroup(CreateGroupRequest request, String creatorCognitoId, String creatorName,
            String creatorEmail) {

        // 1. Resolve the creator (find or auto-register)
        User creator = userRepository.findByCognitoId(creatorCognitoId)
                .orElseGet(() -> {
                    if (creatorEmail == null || creatorEmail.trim().isEmpty()) {
                        throw new IllegalArgumentException("Authenticated Flowmint users must have a valid email address.");
                    }
                    User newUser = new User();
                    newUser.setCognitoId(creatorCognitoId);
                    newUser.setName(creatorName != null ? creatorName : "Unknown User");
                    newUser.setEmail(creatorEmail);
                    return userRepository.save(newUser);
                });

        // 2. Check for duplicate group name for this user (case-insensitive)
        if (groupRepository.existsByNameAndMembers_Id(request.getName(), creator.getId())) {
            throw new IllegalArgumentException(
                    "You already have a group named '" + request.getName() + "'. Please choose a different name.");
        }

        // 3. Create the new Group
        Group group = new Group();
        group.setName(request.getName());
        group.setDescription(request.getDescription());
        group.addMember(creator);

        // 4. Add other members
        if (request.getMembers() != null) {
            for (CreateGroupRequest.MemberRequest memberReq : request.getMembers()) {

                User userToAdd = null;

                if (memberReq.getEmail() != null && !memberReq.getEmail().isEmpty()) {
                    // Try to find existing user by email
                    Optional<User> optionalUser = userRepository.findByEmail(memberReq.getEmail());
                    if (optionalUser.isPresent()) {
                        userToAdd = optionalUser.get();
                    }
                }

                // If user doesn't exist or no email was provided, create a Ghost User
                if (userToAdd == null) {
                    userToAdd = new User();
                    userToAdd.setName(memberReq.getName());
                    userToAdd.setEmail(memberReq.getEmail()); // Null for Ghost Users
                    userToAdd.setCognitoId("dummy_" + UUID.randomUUID().toString());
                    userToAdd = userRepository.save(userToAdd);
                }

                group.addMember(userToAdd);
            }
        }

        // 5. Save to database
        return groupRepository.save(group);
    }


    @Transactional
    public Group updateGroup(UUID groupId, com.flowmint.splitwise.dto.UpdateGroupRequest request) {
        Group group = groupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Group not found"));

        if (request.getName() != null && !request.getName().trim().isEmpty()) {
            group.setName(request.getName());
        }
        
        if (request.getDescription() != null) {
            group.setDescription(request.getDescription());
        }

        // Add any new members
        if (request.getNewMembers() != null) {
            for (CreateGroupRequest.MemberRequest memberReq : request.getNewMembers()) {
                User userToAdd = null;

                if (memberReq.getEmail() != null && !memberReq.getEmail().isEmpty()) {
                    Optional<User> optionalUser = userRepository.findByEmail(memberReq.getEmail());
                    if (optionalUser.isPresent()) {
                        userToAdd = optionalUser.get();
                    }
                }

                // Create a Ghost user if not found
                if (userToAdd == null) {
                    userToAdd = new User();
                    userToAdd.setName(memberReq.getName());
                    userToAdd.setEmail(memberReq.getEmail()); // Null for Ghost Users
                    userToAdd.setCognitoId("dummy_" + UUID.randomUUID().toString());
                    userToAdd = userRepository.save(userToAdd);
                }

                // Ensure they aren't already in the group before adding
                if (!group.getMembers().contains(userToAdd)) {
                    group.addMember(userToAdd);
                }
            }
        }

        return groupRepository.save(group);
    }
}
